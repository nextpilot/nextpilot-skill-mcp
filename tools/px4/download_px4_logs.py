"""从 Flight Review（https://logs.px4.io/browse）批量下载真实 PX4 .ulg 日志。

用途：为规则校准 / 误报率统计 / 数据分析与训练积累真实日志集。文件落在
`.cache/px4/ulog/`（已在 .gitignore），原始日志不进仓库、不上传。

数据来源（均为公开页面/接口，无需鉴权）：
- 列表：GET https://logs.px4.io/browse_data_retrieval
  这是 /browse 页面 DataTables 的 serverSide 接口（POST 在当前站点 405，只收 GET）。
- 下载：GET https://logs.px4.io/download?log=<uuid>
  302 跳转到 https://cdn.logs.px4.io/<uuid>.ulg，binary/octet-stream。
- 每条日志落盘 <uuid>.ulg + <uuid>.json（元数据），并追加一行到 index.jsonl，
  方便训练管线直接读清单。已存在且 ULog 魔数正确的文件跳过，可随时中断续跑。

示例：
  # 默认下载最新 20 条
  python tools/px4/download_px4_logs.py

  # 只要多旋翼、固件 1.15+、时长 1~20 分钟、单文件不超过 30MB，下 50 条
  python tools/px4/download_px4_logs.py --count 50 \\
      --vehicle Quadrotor --version v1.15 --min-duration 60 --max-duration 1200 \\
      --max-size-mb 30

  # 只看列表不下载
  python tools/px4/download_px4_logs.py --list-only --count 10

  # 站点自带搜索框（服务端模糊匹配，如机型/硬件名）
  python tools/px4/download_px4_logs.py --search "FMU_V6X" --count 10
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DEST = REPO_ROOT / ".cache" / "px4" / "ulog"

BASE = "https://logs.px4.io"
BROWSE_API = BASE + "/browse_data_retrieval"
DOWNLOAD_URL = BASE + "/download?log={uuid}"
OVERVIEW_URL = BASE + "/overview_img/{uuid}.png"

USER_AGENT = "nextpilot-skill-mcp-log-dataset/0.1 (rule calibration; contact via repo)"
UUID_RE = re.compile(r"plot_app\?log=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})")
TAG_RE = re.compile(r"<[^>]+>")


def http_get(url: str, *, timeout: float = 60.0, max_bytes: int | None = None, retries: int = 3) -> bytes:
    """GET 一个 URL（自动跟随 302）；max_bytes 时流式拉取，超限抛 ValueError。

    国内网络到 logs.px4.io / jsdelivr 偶发 SSL EOF、连接重置，统一在此重试退避。"""
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


def fetch_browse_page(start: int, length: int, search: str = "") -> dict:
    """拉一页 browse 列表（DataTables serverSide 协议，GET）。"""
    params = {
        "draw": "1",
        "start": str(start),
        "length": str(length),
        "order[0][column]": "1",  # 按日志日期
        "order[0][dir]": "desc",
        "search[value]": search,
    }
    url = BROWSE_API + "?" + urllib.parse.urlencode(params)
    raw = http_get(url, timeout=30)
    return json.loads(raw.decode("utf-8"))


def strip_html(s) -> str:
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", str(s or ""))).strip()


def parse_duration(text: str) -> int | None:
    """'35m17s' / '31s' / '1h2m3s' → 秒；解析不出返回 None。"""
    if not text:
        return None
    total = 0
    found = False
    for val, unit in re.findall(r"(\d+)\s*([hms])", text):
        found = True
        total += int(val) * {"h": 3600, "m": 60, "s": 1}[unit]
    return total if found else None


def parse_row(row: list) -> dict | None:
    """DataTables 一行 → 元数据。列序见 /browse 页面 DataTables 配置。"""
    m = UUID_RE.search(str(row[1])) if len(row) > 1 else None
    if not m:
        return None
    uuid = m.group(1).lower()
    duration_text = strip_html(row[7]) if len(row) > 7 else ""
    modes = [x.strip() for x in strip_html(row[9]).split(",")] if len(row) > 9 else []
    return {
        "uuid": uuid,
        "date": strip_html(row[1]) if len(row) > 1 else "",
        "vehicle_type": strip_html(row[3]) if len(row) > 3 else "",
        "airframe": strip_html(row[4]) if len(row) > 4 else "",
        "hardware": strip_html(row[5]) if len(row) > 5 else "",
        "firmware": strip_html(row[6]) if len(row) > 6 else "",
        "duration": duration_text,
        "duration_sec": parse_duration(duration_text),
        "start_time": strip_html(row[8]) if len(row) > 8 else "",
        "flight_modes": [x for x in modes if x],
        "overview_url": OVERVIEW_URL.format(uuid=uuid),
        "download_url": DOWNLOAD_URL.format(uuid=uuid),
    }


def is_valid_ulg(path: Path) -> bool:
    """ULog 文件以魔数 'ULog' + 版本字节（0x12 v1）开头。"""
    try:
        with path.open("rb") as f:
            return f.read(4) == b"ULog"
    except OSError:
        return False


def matches_filters(meta: dict, args: argparse.Namespace) -> bool:
    def hay(key: str) -> str:
        return str(meta.get(key, "")).lower()

    for key in ("vehicle", "airframe", "hardware", "version"):
        want = getattr(args, key)
        field = {"vehicle": "vehicle_type", "version": "firmware"}.get(key, key)
        if want and want.lower() not in hay(field):
            return False
    dur = meta.get("duration_sec")
    if args.min_duration is not None and (dur is None or dur < args.min_duration):
        return False
    if args.max_duration is not None and (dur is None or dur > args.max_duration):
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="从 logs.px4.io 下载真实 PX4 .ulg 到 .cache/px4/ulog")
    ap.add_argument("--count", type=int, default=20, help="目标下载条数（已存在的跳过，默认 20）")
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="保存目录（默认 .cache/px4/ulog）")
    ap.add_argument("--page-size", type=int, default=100, help="列表翻页大小（站点上限 100）")
    ap.add_argument("--max-scan", type=int, default=0, help="最多扫描多少条候选后放弃（默认 count*10）")
    ap.add_argument("--search", default="", help="browse 页面自带搜索（服务端模糊匹配）")
    ap.add_argument("--vehicle", default="", help="按机型名过滤，子串匹配（如 Quadrotor）")
    ap.add_argument("--airframe", default="", help="按机架名过滤，子串匹配")
    ap.add_argument("--hardware", default="", help="按硬件名过滤，子串匹配（如 FMU_V6X）")
    ap.add_argument("--version", default="", help="按固件版本过滤，子串匹配（如 v1.15）")
    ap.add_argument("--min-duration", type=int, default=None, help="最短飞行时长（秒）")
    ap.add_argument("--max-duration", type=int, default=None, help="最长飞行时长（秒）")
    ap.add_argument("--max-size-mb", type=float, default=None, help="单文件大小上限（MB），超限跳过")
    ap.add_argument("--delay", type=float, default=1.0, help="两次下载之间间隔秒数（礼貌限速，默认 1）")
    ap.add_argument("--retries", type=int, default=3, help="单个文件失败重试次数（默认 3）")
    ap.add_argument("--list-only", action="store_true", help="只打印候选清单，不下载")
    args = ap.parse_args()

    args.page_size = min(max(args.page_size, 1), 100)
    max_scan = args.max_scan or args.count * 10
    max_bytes = int(args.max_size_mb * 1024 * 1024) if args.max_size_mb else None

    args.dest.mkdir(parents=True, exist_ok=True)
    index_path = args.dest / "index.jsonl"

    # ── 先翻列表，挑出满足过滤条件的候选 ──
    candidates: list[dict] = []
    start = 0
    total = None
    while len(candidates) < args.count and start < max_scan:
        page = fetch_browse_page(start, args.page_size, args.search)
        if total is None:
            total = page.get("recordsTotal")
            print(f"站点公开日志总数：{total}")
        rows = page.get("data") or []
        if not rows:
            break
        for row in rows:
            meta = parse_row(row)
            if meta and matches_filters(meta, args):
                candidates.append(meta)
                if len(candidates) >= args.count:
                    break
        start += len(rows)

    print(f"命中候选 {len(candidates)} 条（扫描 {start} 条）")
    for meta in candidates:
        print(
            f"  {meta['uuid']}  {meta['date']}  {meta['vehicle_type']:<12} "
            f"{meta['firmware']:<12} {meta['duration']:<7} {meta['hardware']}"
        )
    if args.list_only:
        return 0

    # ── 逐个下载（断点续跑：已存在且魔数正确则跳过）──
    downloaded = skipped = failed = 0
    for i, meta in enumerate(candidates):
        ulg_path = args.dest / f"{meta['uuid']}.ulg"
        meta_path = args.dest / f"{meta['uuid']}.json"
        if ulg_path.exists() and is_valid_ulg(ulog_path):
            print(f"[{i + 1}/{len(candidates)}] 已存在，跳过 {meta['uuid']}")
            skipped += 1
            continue

        last_err = None
        for attempt in range(1, args.retries + 1):
            try:
                data = http_get(meta["download_url"], timeout=300, max_bytes=max_bytes)
                if data[:4] != b"ULog":
                    raise ValueError("返回内容不是 ULog（魔数不匹配）")
                tmp_path = ulg_path.with_suffix(".ulg.part")
                tmp_path.write_bytes(data)
                tmp_path.replace(ulg_path)
                meta_out = {
                    **meta,
                    "size_bytes": len(data),
                    "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "source": "logs.px4.io",
                }
                meta_path.write_text(json.dumps(meta_out, ensure_ascii=False, indent=2), encoding="utf-8")
                with index_path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(meta_out, ensure_ascii=False) + "\n")
                downloaded += 1
                print(
                    f"[{i + 1}/{len(candidates)}] 下载 {meta['uuid']} "
                    f"({len(data) / 1024 / 1024:.1f} MB, {meta['duration']})"
                )
                break
            except Exception as err:  # 单条失败不拖垮整批
                last_err = err
                if attempt < args.retries:
                    wait = 2 ** (attempt - 1)
                    print(f"  第 {attempt} 次失败（{err}），{wait}s 后重试…")
                    time.sleep(wait)
        else:
            failed += 1
            print(f"[{i + 1}/{len(candidates)}] 放弃 {meta['uuid']}：{last_err}")
        if i < len(candidates) - 1 and args.delay:
            time.sleep(args.delay)

    print(f"完成：新下载 {downloaded}，已存在跳过 {skipped}，失败 {failed}，目录 {args.dest}")
    return 1 if failed else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
