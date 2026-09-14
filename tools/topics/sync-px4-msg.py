"""从 PX4 上游同步 uORB msg 与参数元数据 → knowledge/px4/{topics,params}/。

设计依据：knowledge/px4/rule-schema-design.md「工具」一节。
- msg：按 tag 从 PX4/PX4-Autopilot 归档包解出 msg/*.msg，
  解析成 topics/<tag>/<topic>.yaml（一 tag 一目录、一个 topic 一文件）
- 参数：flight_review 的做法是只用一份 master 参数定义（实际参数值来自日志的
  initial_parameters），默认取 px4-travis S3 的 main parameters.json，
  解析成 params/main.yaml；可用 --params-url / --params-tag 覆盖
- 原始下载缓存到 .cache/px4/<tag>/，不入库

用法：
  python tools/topics/sync-px4-msg.py --tags v1.15.0,v1.16.0,main
  python tools/topics/sync-px4-msg.py --check          # 只比对不写入（CI 用），不一致则退出码 1

依赖：仅标准库（urllib + tarfile + 自研极简 YAML 输出）；无需 pip install。
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import tarfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO_ROOT / ".cache" / "px4"
OUT_ROOT = REPO_ROOT / "knowledge" / "px4"
TOPICS_OUT = OUT_ROOT / "topics"
PARAMS_OUT = OUT_ROOT / "params"

GITHUB_ARCHIVE = "https://github.com/PX4/PX4-Autopilot/archive/refs/{kind}/{ref}.tar.gz"
DEFAULT_PARAMS_URL = (
    "https://px4-travis.s3.amazonaws.com/Firmware/main/_general/parameters.json"
)

# uORB 基本类型 → 简化类型名（够规则层用；不追求覆盖 msgdef 全部特性）
TYPE_MAP = {
    "bool": "bool",
    "uint8_t": "uint8", "int8_t": "int8",
    "uint16_t": "uint16", "int16_t": "int16",
    "uint32_t": "uint32", "int32_t": "int32",
    "uint64_t": "uint64", "int64_t": "int64",
    "float": "float32", "double": "float64",
    "char": "char",
}
# 类型 → 是否按位掩码/枚举候选处理（由常量前缀进一步判断）
TIME_TYPES = {"uint64"}


# ─────────────────────────── 下载与缓存 ───────────────────────────

def _download(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "nextpilot-knowledge-sync"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def archive_url(tag: str) -> str:
    kind, ref = ("heads", "main") if tag == "main" else ("tags", tag)
    return GITHUB_ARCHIVE.format(kind=kind, ref=ref)


def fetch_msg_dir(tag: str, base_url: str | None) -> dict[str, str]:
    """返回 {PascalCase 文件名(去.msg): 文本}。命中缓存则不解压。"""
    cache = CACHE_DIR / tag / "msg"
    if cache.exists() and any(cache.glob("*.msg")):
        return {p.stem: p.read_text(encoding="utf-8", errors="replace") for p in cache.glob("*.msg")}

    url = (base_url or archive_url(tag)).format(tag=tag) if base_url else archive_url(tag)
    data = _download(url)
    cache.mkdir(parents=True, exist_ok=True)
    out: dict[str, str] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        prefix = None
        for member in tf.getmembers():
            # 归档内顶层目录形如 PX4-Autopilot-<ref>/
            parts = member.name.split("/")
            if len(parts) >= 2 and parts[1] == "msg" and member.isfile() and member.name.endswith(".msg"):
                stem = Path(member.name).stem
                f = tf.extractfile(member)
                if f is None:
                    continue
                text = f.read().decode("utf-8", errors="replace")
                out[stem] = text
                (cache / f"{stem}.msg").write_text(text, encoding="utf-8")
    if not out:
        raise RuntimeError(f"归档里没找到 msg/ 目录：{url}")
    return out


def fetch_params(url: str, cache_key: str) -> dict:
    cache = CACHE_DIR / cache_key / "parameters.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    data = _download(url)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(data)
    return json.loads(data)


# ─────────────────────────── .msg 解析 ───────────────────────────

_CONST_RE = re.compile(
    r"^\s*(?:uint8|int32|uint16|int8)\s+([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+)\s*(?:#.*)?$"
)
_FIELD_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_<>:_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?\s*(?:#(.*))?$")

# 字段名与常量前缀对不上时的别名（PX4 字段改名后常量前缀常保留旧名）：
# 字段 nav_state 的枚举常量仍叫 NAVIGATION_STATE_*
_FIELD_CONST_ALIASES = {
    "nav_state": ("NAVIGATION_STATE",),
    # gps_check_fail_flags 的常量前缀是 GPS_CHECK_FAIL（没有 _flags 后缀）
    "gps_check_fail_flags": ("GPS_CHECK_FAIL",),
}


def _tokens(name: str) -> list[str]:
    """nav_state / NAVIGATION_STATE → ['nav','state'] / ['navigation','state']"""
    return [t for t in re.split(r"[_\s]+", name.lower()) if t]


def _const_owner(fields: dict, cname: str) -> str | None:
    """把一个大写常量归属到某个已声明字段。

    优先精确前缀；再用词元序列匹配（允许 navigation→nav 这类前缀缩写）。
    取匹配到的最长字段名，避免 STATE 误命中一堆短名字段。
    """
    candidates: list[str] = []
    for fname in fields:
        for prefix in (fname.upper(),) + _FIELD_CONST_ALIASES.get(fname, ()):
            if cname == prefix or cname.startswith(prefix + "_"):
                candidates.append(fname)
    if candidates:
        return max(candidates, key=len)

    ctoks = _tokens(cname)
    best = None
    for fname in fields:
        ftoks = _tokens(fname)
        if not ftoks or len(ftoks) > len(ctoks):
            continue
        ok = all(
            ct == ft or (len(ft) >= 3 and ct.startswith(ft))
            for ct, ft in zip(ctoks, ftoks)
        )
        # 至少两个有意义的词元对上才算（STATE 单词太短，易误命中）
        if ok and sum(len(t) for t in ftoks) >= 6:
            if best is None or len(fname) > len(best):
                best = fname
    return best


def _yaml_scalar(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    # YAML 1.1 里以这些字符开头的裸标量会被误解析（- / ? / : 列表/映射符，
    # y/n/yes/no/on/off 变布尔，数字开头变数值，# 注释，引号，方括号等）
    dangerous_start = "-?:,[]{}#&*!|>'\"%@`"
    if (
        s == ""
        or s.strip() != s
        or s[0] in dangerous_start
        or ":" in s
        or s.lower() in {"y", "n", "yes", "no", "on", "off", "true", "false", "null", "~"}
        or re.fullmatch(r"[-+]?[0-9eE.]+", s)
    ):
        return json.dumps(s, ensure_ascii=False)
    return s


def _emit_field(name: str, spec: dict, indent: str = "  ") -> list[str]:
    """把一个字段规范写成 YAML 行（支持简单嵌套，够用即可）。"""
    lines = [f"{indent}{name}:"]
    for k, v in spec.items():
        if isinstance(v, dict):
            lines.append(f"{indent}  {k}:")
            for kk, vv in v.items():
                if isinstance(vv, dict):
                    lines.append(f"{indent}    {kk}:")
                    for a, b in vv.items():
                        lines.append(f"{indent}      {_yaml_scalar(a)}: {_yaml_scalar(b)}")
                elif isinstance(vv, list):
                    lines.append(f"{indent}    {kk}: [{', '.join(_yaml_scalar(x) for x in vv)}]")
                else:
                    lines.append(f"{indent}    {kk}: {_yaml_scalar(vv)}")
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            lines.append(f"{indent}  {k}:")
            for item in v:
                first = True
                for kk, vv in item.items():
                    prefix = f"{indent}    - " if first else f"{indent}      "
                    lines.append(f"{prefix}{kk}: {_yaml_scalar(vv)}")
                    first = False
        elif isinstance(v, list):
            lines.append(f"{indent}  {k}: [{', '.join(_yaml_scalar(x) for x in v)}]")
        else:
            lines.append(f"{indent}  {k}: {_yaml_scalar(v)}")
    return lines


def parse_msg(stem: str, text: str) -> dict:
    """解析一个 uORB .msg 为字段规范（两趟：先收集，再归属常量）。

    常量可能在字段声明之前或之后，且字段名与常量前缀常不一致
    （nav_state ↔ NAVIGATION_STATE_*、gps_check_fail_flags ↔ GPS_CHECK_FAIL_*），
    所以不能边读边归属。
    """
    fields: dict[str, dict] = {}
    constants: list[tuple[str, int]] = []

    # 第一趟：收集字段与常量
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m_const = _CONST_RE.match(line)
        if m_const:
            constants.append((m_const.group(1), int(m_const.group(2))))
            continue
        m = _FIELD_RE.match(line)
        if not m:
            continue
        ftype, fname, arr_len, comment = m.group(1), m.group(2), m.group(3), m.group(4)
        if fname in fields:
            continue
        if fname in ("timestamp", "timestamp_sample"):
            spec = {"type": "uint64", "unit": "us"}
        else:
            base = ftype.split("<", 1)[0]  # 去模板参数
            spec = {"type": TYPE_MAP.get(base, base)}
            if arr_len:
                spec["array"] = int(arr_len)
            if comment:
                note = comment.strip()
                m_unit = re.search(r"\(([A-Za-z0-9\u00b0/%^\u00b7\-\. ]+)\)\s*$", note)
                if m_unit:
                    spec["unit"] = m_unit.group(1).strip()
                spec["note"] = note
                # 注释明确写 Bitmask 的直接打标（不依赖字段命名启发）
                if re.search(r"\bbit\s?mask\b", note, re.IGNORECASE):
                    spec["kind"] = "bitmask"
        fields[fname] = spec

    # 第二趟：常量归属到字段
    for cname, cval in constants:
        owner = _const_owner(fields, cname)
        if not owner:
            continue
        spec = fields[owner]
        label = cname.rsplit("_", 1)[-1]   # NAVIGATION_STATE_AUTO_RTL → AUTO_RTL
        spec.setdefault("values", {})[str(cval)] = label
        if "kind" not in spec:
            if any(t in owner.upper() for t in ("FLAGS", "MASK", "BITS")):
                spec["kind"] = "bitmask"
            else:
                spec["kind"] = "enum"

    return {"topic": _to_snake(stem), "msg": f"{stem}.msg", "fields": fields}
def _to_snake(stem: str) -> str:
    s = re.sub(r"(?<!^)(?=[A-Z])", "_", stem).lower()
    return s.replace("__", "_")


def render_topic_yaml(parsed: dict) -> str:
    lines = [
        f"# 生成物，勿手改。由 tools/topics/sync-px4-msg.py 从 {parsed['msg']} 生成",
        f"topic: {parsed['topic']}",
        f"msg: {parsed['msg']}",
        "fields:",
    ]
    for name, spec in parsed["fields"].items():
        lines += _emit_field(name, spec, indent="  ")
    return "\n".join(lines) + "\n"


# ─────────────────────────── parameters.json 解析 ───────────────────────────

def render_params_yaml(tag: str, payload: dict) -> str:
    params = payload.get("parameters", [])
    lines = [
        f"# 生成物，勿手改。由 tools/topics/sync-px4-msg.py 从 PX4 parameters.json 生成（{tag}）",
        f"# 共 {len(params)} 个参数；构建期只注入被经验引用到的子集",
        f"tag: {tag}",
        "parameters:",
    ]
    for p in params:
        name = p.get("name")
        if not name:
            continue
        spec: dict = {"type": str(p.get("type", "")).lower()}
        if "default" in p:
            spec["default"] = p["default"]
        for src, dst in (("min", "min"), ("max", "max"), ("unit", "unit"),
                         ("decimal", "decimal"), ("group", "group"), ("category", "category")):
            if src in p and p[src] not in (None, ""):
                spec[dst] = p[src]
        if p.get("rebootRequired"):
            spec["reboot_required"] = True
        desc = (p.get("shortDesc") or p.get("longDesc") or "").strip().replace("\n", " ")
        if desc:
            spec["description"] = desc[:200]
        enum = p.get("enum") or p.get("values") or p.get("bitmask")
        if enum:
            values = {}
            items = enum if isinstance(enum, list) else enum.get("values", [])
            for it in items:
                if isinstance(it, dict) and "value" in it:
                    values[str(it["value"])] = it.get("description", "")
            if values:
                spec["values"] = values
        lines += _emit_field(name, spec, indent="  ")
    return "\n".join(lines) + "\n"


# ─────────────────────────── 主流程 ───────────────────────────

def sync(tags: list[str], params_url: str, params_tag: str, check: bool, base_url: str | None) -> int:
    changed = False

    # 1) msg → topics/<tag>/
    for tag in tags:
        msgs = fetch_msg_dir(tag, base_url)
        out_dir = TOPICS_OUT / tag
        planned: dict[Path, str] = {}
        for stem, text in sorted(msgs.items()):
            parsed = parse_msg(stem, text)
            planned[out_dir / f"{parsed['topic']}.yaml"] = render_topic_yaml(parsed)
        if check:
            existing = {p: p.read_text(encoding="utf-8") for p in out_dir.glob("*.yaml")}
            if existing != planned:
                print(f"CHECK FAIL: topics/{tag} 与上游不一致（{len(planned)} 个 topic），重跑同步")
                changed = True
            else:
                print(f"OK topics/{tag}（{len(planned)} 个 topic）")
        else:
            out_dir.mkdir(parents=True, exist_ok=True)
            for old in out_dir.glob("*.yaml"):
                if old not in planned:
                    old.unlink()
            for path, content in planned.items():
                if not path.exists() or path.read_text(encoding="utf-8") != content:
                    path.write_text(content, encoding="utf-8")
            print(f"写入 topics/{tag}/：{len(planned)} 个 topic")

    # 2) 参数 → params/<tag>.yaml（flight_review 也只用一份 master 定义）
    payload = fetch_params(params_url, params_tag)
    content = render_params_yaml(params_tag, payload)
    params_path = PARAMS_OUT / f"{params_tag}.yaml"
    if check:
        if not params_path.exists() or params_path.read_text(encoding="utf-8") != content:
            print(f"CHECK FAIL: params/{params_tag}.yaml 与上游不一致，重跑同步")
            changed = True
        else:
            print(f"OK params/{params_tag}.yaml（{len(payload.get('parameters', []))} 个参数）")
    else:
        params_path.parent.mkdir(parents=True, exist_ok=True)
        params_path.write_text(content, encoding="utf-8")
        print(f"写入 params/{params_tag}.yaml：{len(payload.get('parameters', []))} 个参数")

    return 1 if changed else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tags", default="v1.15.0,v1.16.0,main",
                    help="逗号分隔的 release tag（main 取主干）")
    ap.add_argument("--params-url", default=DEFAULT_PARAMS_URL, help="parameters.json 地址")
    ap.add_argument("--params-tag", default="main", help="参数输出文件名（params/<tag>.yaml）")
    ap.add_argument("--base-url", default=None,
                    help="自定义归档 URL 模板（含 {tag} 占位），用于镜像")
    ap.add_argument("--check", action="store_true", help="只比对不写入")
    args = ap.parse_args(argv[1:])
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    return sync(tags, args.params_url, args.params_tag, args.check, args.base_url)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
