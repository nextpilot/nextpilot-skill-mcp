"""把端侧解析所需的运行时资产抓到本地，供自托管（`web/public/pyodide/` 或 EdgeOne Blob）。

**为什么要自托管**：解析跑在浏览器里的 Pyodide，每次要取三样东西——
  1) Pyodide 运行时（约 10MB）+ 标准库，默认从 jsdelivr 拉；
  2) numpy / micropip 的 wheel，也从同一个目录拉；
  3) pyulog 的 wheel，`micropip.install("pyulog")` 会**先查 PyPI 索引**再下载。
国内访问 jsdelivr 与 PyPI 都不稳，索引查询还不受缓存保护——自托管后这三样都在自己的
CDN 上，一次下载、长期缓存（配合 NEXT_PUBLIC_PYULOG_WHEEL 连索引查询也省掉）。

用法：
  # 抓进 web/public/pyodide/（默认，随站点部署，开箱即用）
  python tools/dev/fetch_pyodide_assets.py

  # 只抓进 .cache/pyodide-dist/（供上传到 Blob 等外部存储）
  python tools/dev/fetch_pyodide_assets.py --out cache

  python tools/dev/fetch_pyodide_assets.py --pyodide v0.27.7

产物结构（`public` 布局下）：

  web/public/pyodide/<ver>/full/     ← 即 NEXT_PUBLIC_PYODIDE_URL 的默认值 /pyodide/<ver>/full/
    pyodide.js  pyodide.asm.js  pyodide.asm.wasm  python_stdlib.zip  pyodide-lock.json
    numpy-*.whl  micropip-*.whl  lzma-*.whl  packaging-*.whl
  web/public/pyodide/wheels/
    pyulog-*.whl                     ← 即 NEXT_PUBLIC_PYULOG_WHEEL 的默认值

**为什么要重试**：jsdelivr 从境内访问会出现随机 TLS 断连（`SSL: UNEXPECTED_EOF_WHILE_READING`），
实测单文件成功率约 50%。没有重试的话脚本会随机失败，看起来像"某个文件不存在"，实则是网络抖动。
落盘前用 `pyodide-lock.json` 里记录的 sha256 校验，避免把半截文件当成资产。

依赖：仅标准库。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLIC_OUT = REPO_ROOT / "web" / "public" / "pyodide"
CACHE_OUT = REPO_ROOT / ".cache" / "pyodide-dist"

CDN = "https://cdn.jsdelivr.net/pyodide/{ver}/full/"
# 备用源：主源被墙/抖动时按顺序回退。unpkg 与 npmmirror **不含 wheel**，只能当核文件的备选。
CDN_FALLBACKS = [
    "https://cdn.jsdelivr.net/pyodide/{ver}/full/",
    "https://gcore.jsdelivr.net/pyodide/{ver}/full/",
    "https://unpkg.com/pyodide@{ver_nov}/",
]
PYPI_JSON = "https://pypi.org/pypi/pyulog/json"
PYPI_JSON_FALLBACK = "https://pypi.tuna.tsinghua.edu.cn/pypi/pyulog/json"
# 阿里云 simple 索引：**唯一在实测中稳定可达的 pyulog 源**。
# 注意它返回的是 HTML 索引页（PEP 503），不是 PyPI 的 JSON API，解析方式不同——
# 详见 fetch_pyulog_wheel()。清华镜像与 files.pythonhosted.org 实测均被 TLS 断连挡住。
ALIYUN_SIMPLE = "https://mirrors.aliyun.com/pypi/simple/pyulog/"

# 运行时必需的固定文件（其余包按 pyodide-lock.json 里的包名解析出来）
CORE_FILES = [
    "pyodide.js",
    "pyodide.asm.js",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
]
# 解析要用到的 Python 包（从 lock 里取 wheel 文件名，连同 wheel 一起自托管）
# lzma 是 PX4 事件解压要用的，单独装且允许失败；一并自托管可避免它从公网拉。
PACKAGES = ["numpy", "micropip", "lzma", "packaging"]

MAX_ATTEMPTS = 4


def fetch(url: str, timeout: int = 120) -> bytes:
    """下载单个 URL，带指数退避重试。

    只重试网络类错误（含 jsdelivr 的随机 TLS 断连）；HTTP 4xx 直接抛，重试没意义。
    """
    last: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nextpilot-skill-mcp/fetch-pyodide"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                raise
            last = e
        except Exception as e:  # noqa: BLE001 —— 网络层什么都可能抛，一律重试
            last = e
        if attempt < MAX_ATTEMPTS:
            wait = 2**attempt
            print(f"    …… 第 {attempt} 次失败（{type(last).__name__}），{wait}s 后重试", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"下载失败（已重试 {MAX_ATTEMPTS} 次）：{url}\n  最后一次：{last}")


def fetch_any(relpath: str, ver: str) -> bytes:
    """按主源 → 备用源顺序尝试同一个相对路径。"""
    errs: list[str] = []
    for tpl in CDN_FALLBACKS:
        url = tpl.format(ver=ver, ver_nov=ver.lstrip("v")) + relpath
        try:
            return fetch(url)
        except Exception as e:  # noqa: BLE001
            errs.append(f"{url} → {type(e).__name__}: {str(e)[:80]}")
    raise RuntimeError("所有源都失败：\n  " + "\n  ".join(errs))


def save(path: pathlib.Path, data: bytes, want_sha256: str | None = None) -> None:
    """落盘并（可选）校验 sha256 —— 防止把半截响应当成完整资产。"""
    if want_sha256:
        got = hashlib.sha256(data).hexdigest()
        if got != want_sha256:
            raise RuntimeError(f"{path.name} 校验失败：期望 sha256 {want_sha256[:16]}…，实得 {got[:16]}…")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    mark = " ✓" if want_sha256 else ""
    print("  %-48s %8.1f KB%s" % (path.name, len(data) / 1024, mark))


def lock_sha(lock: dict, relpath: str) -> str | None:
    """从 lock 里取出某个 wheel 文件名对应的 sha256（lock 只覆盖 Pyodide 自带包）。"""
    for meta in (lock.get("packages") or {}).values():
        if meta.get("file_name") == relpath:
            return meta.get("sha256")
    return None


def fetch_pyulog_wheel() -> tuple[bytes, str, str]:
    """取 pyulog 的纯 Python wheel。返回 (字节, 文件名, sha256)。

    优先 PyPI 官方 JSON API（字段齐全、带 sha256）；拿不到就回退阿里云 simple 索引。
    阿里云那条是实测唯一稳定的路径——PyPI 官方与 files.pythonhosted.org 从境内
    都会被 TLS 断连掐掉，清华镜像同样过不去。
    """
    # 1) PyPI 官方 JSON API
    for src in (PYPI_JSON, PYPI_JSON_FALLBACK):
        try:
            info = json.loads(fetch(src).decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print(f"  …… {src} 失败：{type(e).__name__}", file=sys.stderr)
            continue
        wheel = next((u for u in info["urls"] if u["filename"].endswith("-py3-none-any.whl")), None)
        if wheel:
            return fetch(wheel["url"]), wheel["filename"], wheel.get("digests", {}).get("sha256", "")

    # 2) 阿里云 simple 索引（PEP 503 HTML：<a href="...">文件名</a>，sha256 在 URL 的 #sha256= 里）
    print(f"  …… 回退 {ALIYUN_SIMPLE}", file=sys.stderr)
    html = fetch(ALIYUN_SIMPLE, timeout=60).decode("utf-8", "replace")
    hrefs = re.findall(r'href="([^"]+)"', html)
    cands = [h for h in hrefs if h.endswith("-py3-none-any.whl")]
    if not cands:
        raise RuntimeError("阿里云索引里也没有 py3-none-any 的 wheel")

    def ver_of(href: str) -> tuple:
        m = re.search(r"pyulog-([0-9.]+)-py3-none-any\.whl", href)
        return tuple(int(x) for x in m.group(1).split(".")) if m else (0,)

    href = max(cands, key=ver_of)
    filename = href.split("#")[0].split("/")[-1]
    want_sha = href.split("#sha256=")[-1] if "#sha256=" in href else ""
    url = urllib.parse.urljoin(ALIYUN_SIMPLE, href)
    return fetch(url), filename, want_sha


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--pyodide",
        default="v0.27.7",
        help="Pyodide 版本（要与 web/workers/analysis-worker.ts 的默认值一致）",
    )
    ap.add_argument(
        "--out",
        choices=["public", "cache"],
        default="public",
        help="public（默认）→ web/public/pyodide/，随站点部署；cache → .cache/pyodide-dist/，供上传到外部存储",
    )
    args = ap.parse_args(argv[1:])

    # public 布局把 ver 放在路径里（/pyodide/v0.27.7/full/），这样换版本只改环境变量、可直接回滚
    if args.out == "public":
        root = PUBLIC_OUT
        index_dir = root / args.pyodide / "full"
        wheel_dir = root / "wheels"
    else:
        root = CACHE_OUT
        index_dir = root / "pyodide" / args.pyodide / "full"
        wheel_dir = root / "wheels"

    print(f"Pyodide {args.pyodide}  →  {index_dir.relative_to(REPO_ROOT)}")

    # 先取 lock：它记录了各 wheel 的 sha256，是后面校验的依据
    lock = json.loads(fetch_any("pyodide-lock.json", args.pyodide).decode("utf-8"))
    for name in CORE_FILES:
        rel = name
        want = lock_sha(lock, rel) if name.endswith(".whl") else None
        save(index_dir / name, fetch_any(rel, args.pyodide), want)

    for pkg in PACKAGES:
        meta = (lock.get("packages") or {}).get(pkg)
        if not meta or not meta.get("file_name"):
            print(f"  !! lock 里没有 {pkg}，跳过", file=sys.stderr)
            continue
        fname = meta["file_name"]
        save(index_dir / fname, fetch_any(fname, args.pyodide), meta.get("sha256"))

    # pyulog：取一个纯 Python wheel（py3-none-any），自托管后不再走索引查询
    print("pyulog wheel（PyPI 官方 → 阿里云镜像）")
    try:
        data, fname, want_sha = fetch_pyulog_wheel()
    except Exception as e:  # noqa: BLE001
        print(f"  !! pyulog 获取失败：{e}", file=sys.stderr)
        return 1
    save(wheel_dir / fname, data, want_sha or None)

    total = sum(f.stat().st_size for f in index_dir.iterdir() if f.is_file())
    total += sum(f.stat().st_size for f in wheel_dir.iterdir() if f.is_file())
    print(f"\n合计 {total / 1048576:.1f} MB")

    if args.out == "public":
        print(
            f"\n已就位，随站点构建自动分发。代码默认值即：\n"
            f"  NEXT_PUBLIC_PYODIDE_URL 未设 → /pyodide/{args.pyodide}/full/\n"
            f"  NEXT_PUBLIC_PYULOG_WHEEL 未设 → /pyodide/wheels/{fname}\n"
            f"（pyulog 当前版本 {fname}；升级时重跑本脚本，并同步改 analysis-worker.ts /\n"
            f"  RuntimeCacheRegistrar.tsx / sw.js 里写死的 wheel 文件名）"
        )
    else:
        print(
            "\n上传与配置：\n"
            f"  1) 把 `pyodide/{args.pyodide}/full/` 整个目录传到 Blob，\n"
            f"     NEXT_PUBLIC_PYODIDE_URL=https://<blob域名>/pyodide/{args.pyodide}/full/\n"
            f"  2) 把 `wheels/{fname}` 传到 Blob，\n"
            f"     NEXT_PUBLIC_PYULOG_WHEEL=https://<blob域名>/wheels/{fname}\n"
            f"  3) 重新部署站点。（pyulog 当前版本 {fname}）"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
