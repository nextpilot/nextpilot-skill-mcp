"""从 ArduPilot 官方 CI 站（https://autotest.ardupilot.org/）批量下载 .bin 日志。

用途：为 ArduPilot provider（knowledge/engine/providers/ardupilot.py）的规则校准与契约
测试积累基准日志集。文件落在 .cache/ardupilot/logs/（已 .gitignore），不进仓库。

与 tools/dev/apm_make_sample.py 的分工：那边**合成**最小夹具（读写两端互为独立实现，
防自证）；这边抓**官方真实产物**，覆盖合成夹具编不出来的规模与字段组合（几百条 FMT、
上万条消息、块尾填充、XKF*/ESC/VIBE 等真实消息序列）。

数据来源（公开页面，无需鉴权）：首页纯 HTML 目录、正则抽 <a href>；`BASE/<file>` 直接
返二进制。

三个前置事实（实测 2026-09-24）：
1. **文件名里的序号不能猜**：序号是 SITL 重启计数、不连续，照规律试 -00000015 之类必 404。
2. **首页是滚动的**，只保留最新一次 test run 的产物，旧文件被清理。抓到就落盘。
3. **这些是 SITL 仿真日志**，不是真实外场飞行；真实故障日志得去 discuss.ardupilot.org
   爬（用户求助帖自带 .bin），本脚本不管。

示例：
  python tools/dev/download_ardupilot_logs.py                              # 每种机型+测试取 1 条
  python tools/dev/download_ardupilot_logs.py --vehicle ArduCopter
  python tools/dev/download_ardupilot_logs.py --per-group 3 --max-size-mb 20 --count 50
  python tools/dev/download_ardupilot_logs.py --test GyroFFTHarmonic --all  # 某测试的全部
  python tools/dev/download_ardupilot_logs.py --list-only                  # 只看清单
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DEST = REPO_ROOT / ".cache" / "ardupilot" / "logs"

BASE = "https://autotest.ardupilot.org"
INDEX_URL = BASE + "/"

USER_AGENT = "nextpilot-skill-mcp-log-dataset/0.1 (rule calibration; contact via repo)"

# 首页链接形如 ArduCopter-GyroFFTHarmonic-00000394.BIN / HeliCopter-test.tlog
FILE_RE = re.compile(r'"([A-Za-z0-9_\-]+\.(?:BIN|bin|tlog|log))"')
# <Vehicle>-<Test>-<index>；两种变体：少数无 index 段（HeliCopter-test.tlog）；
# DataFlashErase 测试多一段（...-DataFlashErase-dataflash-log-002.BIN），Test 段须用
# `.+?` 而不是 `[A-Za-z0-9]+?`，否则这 99 个会被整个丢掉。
NAME_RE = re.compile(r"^([A-Za-z]+)-(.+?)(?:-(\d+))?\.[A-Za-z0-9]+$")

DATAFLASH_MAGIC = b"\xa3\x95"


def http_get(url: str, *, timeout: float = 60.0, max_bytes: int | None = None, retries: int = 3) -> bytes:
    """GET 一个 URL；max_bytes 时流式拉取，超限抛 ValueError。

    到 autotest.ardupilot.org 偶发连接超时（隔几秒重试就能过），统一在此退避。"""
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if max_bytes is None:
                    return resp.read()
                buf = bytearray()
                while True:
                    chunk = resp.read(1 << 16)
                    if not chunk:
                        break
                    buf.extend(chunk)
                    if len(buf) > max_bytes:
                        raise ValueError("超过大小上限 %d 字节（已下载 %d）" % (max_bytes, len(buf)))
                return bytes(buf)
        except ValueError:
            raise  # 大小上限是确定性失败，重试无意义
        except Exception as err:
            last_err = err
            if attempt < retries:
                wait = 2 ** (attempt - 1)
                print(f"  GET 失败（{err}），{wait}s 后重试：{url[:90]}")
                time.sleep(wait)
    raise last_err  # type: ignore[misc]


def fetch_index() -> list[dict]:
    """抓首页并解析出日志文件清单。

    `NAME_RE` 第二段用非贪婪 `+?`：测试名可能含数字（TakeoffAuto3），贪婪会把
    TakeoffAuto3-00000240 里的 3 当成序号。"""
    html = http_get(INDEX_URL, timeout=60).decode("utf-8", "replace")
    seen: set[str] = set()
    out: list[dict] = []
    for name in sorted(set(FILE_RE.findall(html))):
        if name in seen:
            continue
        seen.add(name)
        m = NAME_RE.match(name)
        if not m:
            continue
        out.append(
            {
                "file": name,
                "vehicle": m.group(1),
                "test": m.group(2),
                "index": m.group(3) or "-",
                "ext": name.rsplit(".", 1)[1].lower(),
                "url": f"{BASE}/{name}",
            }
        )
    return out


def is_valid_dataflash(path: Path) -> bool:
    """DataFlash 以 A3 95 开头（tlog 是 MAVLink 流、无此魔数，按扩展名放行）。"""
    if path.suffix.lower() != ".bin":
        return True
    try:
        with path.open("rb") as f:
            return f.read(2) == DATAFLASH_MAGIC
    except OSError:
        return False


def matches_filters(f: dict, args: argparse.Namespace) -> bool:
    if args.ext != "any" and f["ext"] != args.ext:
        return False
    if args.vehicle and args.vehicle.lower() not in f["vehicle"].lower():
        return False
    if args.test and args.test.lower() not in f["test"].lower():
        return False
    return True


def group_key(f: dict) -> tuple[str, str]:
    return (f["vehicle"], f["test"])


def select(files: list[dict], args: argparse.Namespace) -> tuple[list[dict], dict[tuple[str, str], list[dict]]]:
    """挑出待下载项，并顺带返回「同组全部候选」。

    默认「每机型每测试取 1 条」而不是全下：一次 run 有 2500+ 文件，同一测试的上百条
    日志内容高度重复（同一套 SITL 脚本的多次重启）。返回同组候选是为了下载失败时能在
    组内换一条——首页列出的文件不等于还能下到（站点滚动清理，实测 37 条里 3 条 404）。"""
    picked = [f for f in files if matches_filters(f, args)]
    picked.sort(key=lambda x: (x["vehicle"], x["test"], x["index"]))

    groups: dict[tuple[str, str], list[dict]] = {}
    for f in picked:
        groups.setdefault(group_key(f), []).append(f)

    if args.all:
        out = list(picked)
    else:
        out = []
        for files_in_group in groups.values():
            out.extend(files_in_group[: args.per_group])
        out.sort(key=lambda x: (x["vehicle"], x["test"], x["index"]))

    if args.count:
        out = out[: args.count]
    return out, groups


def main() -> int:
    ap = argparse.ArgumentParser(description="从 autotest.ardupilot.org 下载 ArduPilot .bin 到 .cache/ardupilot/logs")
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="保存目录（默认 .cache/ardupilot/logs）")
    ap.add_argument("--count", type=int, default=0, help="目标条数上限（0 = 不限）")
    ap.add_argument("--per-group", type=int, default=1, help="每种「机型+测试」取几条（默认 1）")
    ap.add_argument("--all", action="store_true", help="取下全部命中的文件（忽略 --per-group）")
    ap.add_argument("--vehicle", default="", help="按机型过滤，子串匹配（如 ArduCopter）")
    ap.add_argument("--test", default="", help="按测试名过滤，子串匹配（如 GyroFFTHarmonic）")
    ap.add_argument("--ext", default="bin", choices=["bin", "tlog", "log", "any"], help="文件类型（默认 bin）")
    ap.add_argument("--max-size-mb", type=float, default=None, help="单文件大小上限（MB），超限跳过")
    ap.add_argument("--delay", type=float, default=0.5, help="两次下载之间间隔秒数（礼貌限速，默认 0.5）")
    ap.add_argument("--retries", type=int, default=3, help="单个文件失败重试次数（默认 3）")
    ap.add_argument(
        "--max-substitute",
        type=int,
        default=3,
        help="同一组拿不到时最多换几条（默认 3；热门测试一组 200+ 条，不设限会拖死）",
    )
    ap.add_argument("--list-only", action="store_true", help="只打印清单，不下载")
    args = ap.parse_args()

    max_bytes = int(args.max_size_mb * 1024 * 1024) if args.max_size_mb else None

    files = fetch_index()
    if not files:
        print("首页没解析出任何日志文件 —— 页面结构可能变了，检查 FILE_RE")
        return 1
    print(f"首页解析到 {len(files)} 个日志文件")

    targets, groups = select(files, args)
    print(f"命中 {len(targets)} 条")
    for f in targets:
        print(f"  {f['vehicle']:<12} {f['test']:<32} {f['file']}")
    if args.list_only:
        return 0

    args.dest.mkdir(parents=True, exist_ok=True)
    index_path = args.dest / "index.jsonl"

    def write_meta(meta: dict) -> None:
        """每条日志落一份 .json 元数据并追加 index.jsonl，方便管线直接读清单。"""
        (args.dest / (meta["file"] + ".json")).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        with index_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(meta, ensure_ascii=False) + "\n")

    # ── 逐个下载（断点续跑：已存在且魔数正确则跳过）──
    downloaded = skipped = failed = 0
    queue = list(targets)
    done_keys: set[tuple[str, str]] = set()
    subs: dict[tuple[str, str], int] = {}  # 每组已换过几次
    tried: set[str] = set()  # 已试过的文件名；失败的不会落盘，只看"是否存在"会重复挑中
    i = 0
    while queue:
        f = queue.pop(0)
        i += 1
        dest = args.dest / f["file"]
        if dest.exists() and is_valid_dataflash(dest):
            print(f"[{i}] 已存在，跳过 {f['file']}")
            skipped += 1
            done_keys.add(group_key(f))
            continue

        tried.add(f["file"])
        last_err = None
        for attempt in range(1, args.retries + 1):
            try:
                # 单文件超时压到 90s：实测 2~3s 就下完，给 300s 的话一旦连接挂起，
                # 一个失败文件就能卡满 900s。
                data = http_get(f["url"], timeout=90, max_bytes=max_bytes, retries=1)
                if f["ext"] == "bin" and data[:2] != DATAFLASH_MAGIC:
                    raise ValueError("返回内容不是 DataFlash（魔数不是 A3 95）")
                tmp = dest.with_suffix(dest.suffix + ".part")
                tmp.write_bytes(data)
                tmp.replace(dest)
                write_meta(
                    {
                        **f,
                        "size_bytes": len(data),
                        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "source": "autotest.ardupilot.org",
                    }
                )
                downloaded += 1
                print(f"[{i}] 下载 {f['file']} ({len(data) / 1024 / 1024:.2f} MB)")
                break
            except Exception as err:  # 单条失败不拖垮整批
                last_err = err
                if attempt < args.retries:
                    wait = 2 ** (attempt - 1)
                    print(f"  第 {attempt} 次失败（{err}），{wait}s 后重试…")
                    time.sleep(wait)
        else:
            # 列表里已失效的文件会返 404；同组还有别的日志就换一条顶上，同一测试的
            # 各条内容本就可互换。
            key = group_key(f)
            # 换组有上限：热门测试一组能有 248 条，整组失效时不设限会一路换到底。
            used = subs.get(key, 0)
            alt = (
                next(
                    (g for g in groups.get(key, []) if g["file"] not in tried and not (args.dest / g["file"]).exists()),
                    None,
                )
                if used < args.max_substitute
                else None
            )
            if alt and key not in done_keys:
                subs[key] = used + 1
                print(f"[{i}] {f['file']} 拿不到（{last_err}），换同组 {alt['file']} 再试（第 {used + 1} 次）")
                queue.insert(0, alt)
                continue
            failed += 1
            print(f"[{i}] 放弃 {f['file']}：{last_err}")
        done_keys.add(group_key(f))
        if queue and args.delay:
            time.sleep(args.delay)

    print(f"完成：新下载 {downloaded}，已存在跳过 {skipped}，失败 {failed}，目录 {args.dest}")
    return 1 if failed else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
