"""从 PX4 上游同步 uORB msg 与参数元数据 → knowledge/px4/meta/<tag>.json。

设计依据：knowledge/px4/CLAUDE.md「工具」一节。
- msg：按 tag 从 PX4/PX4-Autopilot 归档包解出 msg/*.msg，
  汇总进 meta/<tag>.json 的 topics（**一 tag 一文件**：200+ topic 各占一个文件会污染仓库；
  且这些文件只有机器读写，JSON 无 YAML 引号陷阱、引擎直接消费）
- 参数：flight_review 的做法是只用一份 master 参数定义（实际参数值来自日志的
  initial_parameters），默认取 px4-travis S3 的 main parameters.json，
  汇总进同一个 meta/<tag>.json 的 parameters；可用 --params-url / --params-tag 覆盖
- 原始下载缓存到 .cache/px4/<tag>/，不入库

用法：
  python tools/px4/sync-px4-msg.py --tags v1.15.0,v1.16.0,main
  python tools/px4/sync-px4-msg.py --check          # 只比对不写入（CI 用），不一致则退出码 1

依赖：仅标准库（urllib + tarfile + json）；无需 pip install。
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
META_OUT = OUT_ROOT / "meta"       # meta/<tag>.json（一 tag 一份：topics + parameters）

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
# 数组长度 PX4 写在**类型**上（float32[10] voltage_cell_v），少数写法写在字段名上，
# 两种都要认；否则整行匹配不上、数组字段会被静默丢掉（曾因此丢了 voltage_cell_v /
# control[12] / q[4]，meta 字典残缺，构建期字段校验根本没法做）。
_FIELD_RE = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_<>:_]*)(?:\[(\d+)\])?\s+"
    r"([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?\s*(?:#(.*))?$"
)

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


def _to_snake(stem: str) -> str:
    s = re.sub(r"(?<!^)(?=[A-Z])", "_", stem).lower()
    return s.replace("__", "_")


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
        ftype, type_arr, fname, name_arr, comment = m.groups()
        arr_len = type_arr or name_arr          # 两种写法都认（PX4 用类型上那种）
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

    return {"topic": _to_snake(stem), "file": f"{stem}.msg", "fields": fields}


def _order_values(values: dict) -> dict:
    """枚举/位掩码的键按数值排序（否则字符串序会变成 0,1,10,11,…,2,20）。"""
    def key(k: str):
        try:
            return (0, int(k))
        except (TypeError, ValueError):
            return (1, 0, str(k))
    return {k: values[k] for k in sorted(values, key=key)}


def render_meta_json(tag: str, topics: dict[str, dict], params: dict | None) -> str:
    """一个 tag 的全部元数据 → 一个 JSON 文件：topics（字段字典）+ parameters（参数字典）。

    合并成一份的理由：两者都是"该固件版本的字段/参数语义"，都只被机器读写，
    同属一个 tag 就该是一份文件；分开成两个目录只会让"取某个版本的全部元数据"
    变成两处查找。
    """
    # 不用 json.dumps(sort_keys=True)：那会把枚举键按字符串排（0,1,10,11,…,2）。
    # 这里显式构造顺序：topic 名字母序、字段名字母序、枚举值数值序 —— 输出确定且可读。
    def fix_fields(spec: dict) -> dict:
        fields = {}
        for fname in sorted(spec.get("fields", {})):
            f = dict(spec["fields"][fname])
            if isinstance(f.get("values"), dict):
                f["values"] = _order_values(f["values"])
            fields[fname] = f
        out = {"file": spec.get("file")}
        out["fields"] = fields
        return out

    doc: dict = {
        "_note": "生成物，勿手改。由 tools/topics/sync-px4-msg.py 从 PX4 上游同步。",
        "tag": tag,
        "topicCount": len(topics),
        "topics": {name: fix_fields(topics[name]) for name in sorted(topics)},
    }
    if params is None:
        doc["paramCount"] = 0
        doc["parameters"] = None
        doc["parametersNote"] = (
            "该 tag 无参数元数据：PX4 只在分支构建（main/master）发布 parameters.json，"
            "release tag 下没有；日志里的实际参数值来自 .ulg 的 initial_parameters。"
        )
    else:
        ordered = {}
        for pname in sorted(params):
            spec = params[pname]
            if isinstance(spec.get("values"), dict):
                spec = dict(spec, values=_order_values(spec["values"]))
            ordered[pname] = spec
        doc["paramCount"] = len(ordered)
        doc["parameters"] = ordered
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


def normalize_params(payload: dict) -> dict[str, dict]:
    """parameters.json → {参数名: 精简规范}（只保留有用字段以控体积）。"""
    out: dict[str, dict] = {}
    for item in payload.get("parameters", []):
        name = item.get("name")
        if not name:
            continue
        spec: dict = {"type": str(item.get("type", "")).lower()}
        if "default" in item:
            spec["default"] = item["default"]
        for src in ("min", "max", "unit", "decimal", "group"):
            if item.get(src) not in (None, ""):
                spec[src] = item[src]
        if item.get("rebootRequired"):
            spec["reboot"] = True
        desc = (item.get("shortDesc") or item.get("longDesc") or "").strip().replace("\n", " ")
        if desc:
            spec["desc"] = desc[:200]
        enum = item.get("enum") or item.get("values") or item.get("bitmask")
        if enum:
            items = enum if isinstance(enum, list) else enum.get("values", [])
            values = {}
            for it in items:
                if isinstance(it, dict) and "value" in it:
                    values[str(it["value"])] = it.get("description", "")
            if values:
                spec["values"] = values
        out[name] = spec
    return out


# ─────────────────────────── 主流程 ───────────────────────────

def sync(tags: list[str], params_url: str, params_tag: str, check: bool, base_url: str | None) -> int:
    changed = False

    # 参数元数据只对 params_tag 生效（PX4 只发布分支构建的 parameters.json）
    params = normalize_params(fetch_params(params_url, params_tag))

    for tag in tags:
        msgs = fetch_msg_dir(tag, base_url)
        topics = {parse_msg(stem, text)["topic"]: parse_msg(stem, text) for stem, text in msgs.items()}
        content = render_meta_json(tag, topics, params if tag == params_tag else None)
        out_file = META_OUT / f"{tag}.json"
        label = f"meta/{tag}.json"
        if check:
            if not out_file.exists() or out_file.read_text(encoding="utf-8") != content:
                print(f"CHECK FAIL: {label} 与上游不一致，重跑同步")
                changed = True
            else:
                n_params = len(params) if tag == params_tag else 0
                print(f"OK {label}（{len(topics)} 个 topic, {n_params} 个参数）")
        else:
            out_file.parent.mkdir(parents=True, exist_ok=True)
            out_file.write_text(content, encoding="utf-8")
            print(f"META_WRITTEN {tag} topics={len(topics)} params={len(params) if tag == params_tag else 0}")

    if not check:
        # 清理历史形态：topics/<tag>/*.yaml、topics/<tag>.json、params/<tag>.json、params/<tag>.yaml
        for legacy_dir in (OUT_ROOT / "topics", OUT_ROOT / "params"):
            if legacy_dir.is_dir():
                for f in legacy_dir.iterdir():
                    if f.is_file():
                        f.unlink()
                    elif f.is_dir():
                        for sub in f.iterdir():
                            sub.unlink()
                        f.rmdir()
                if not any(legacy_dir.iterdir()):
                    legacy_dir.rmdir()

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
