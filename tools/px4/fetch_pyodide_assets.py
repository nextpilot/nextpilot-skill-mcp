"""把端侧解析所需的运行时资产抓到本地，供上传到自托管（EdgeOne Blob / 任意 CDN）。

**为什么要自托管**：解析跑在浏览器里的 Pyodide，每次要取三样东西——
  1) Pyodide 运行时（约 10MB）+ 标准库，默认从 jsdelivr 拉；
  2) numpy / micropip 的 wheel，也从同一个目录拉；
  3) pyulog 的 wheel，`micropip.install("pyulog")` 会**先查 PyPI 索引**再下载。
国内访问 jsdelivr 与 PyPI 都不稳，索引查询还不受缓存保护——自托管后这三样都在自己的
CDN 上，一次下载、长期缓存（配合 NEXT_PUBLIC_PYULOG_WHEEL 连索引查询也省掉）。

用法：
  python tools/px4/fetch-pyodide-assets.py                 # 抓默认版本
  python tools/px4/fetch-pyodide-assets.py --pyodide v0.27.7

产物落在 `.cache/pyodide-dist/`（不入库），目录结构即上传结构：

  .cache/pyodide-dist/
    pyodide/<ver>/full/      ← 整个目录上传到 Blob，作为 NEXT_PUBLIC_PYODIDE_URL
      pyodide.js  pyodide.asm.js  pyodide.asm.wasm  python_stdlib.zip  pyodide-lock.json
      numpy-*.whl  micropip-*.whl
    wheels/
      pyulog-*.whl           ← 上传后填进 NEXT_PUBLIC_PYULOG_WHEEL

依赖：仅标准库。
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.request

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = REPO_ROOT / ".cache" / "pyodide-dist"

CDN = "https://cdn.jsdelivr.net/pyodide/{ver}/full/"
PYPI_JSON = "https://pypi.org/pypi/pyulog/json"

# 运行时必需的固定文件（其余包按 pyodide-lock.json 里的包名解析出来）
CORE_FILES = [
    "pyodide.js",
    "pyodide.asm.js",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
]
# 解析要用到的 Python 包（从 lock 里取 wheel 文件名，连同 wheel 一起自托管）
PACKAGES = ["numpy", "micropip"]


def fetch(url: str, timeout: int = 180) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "nextpilot-knowledge-sync"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def save(path: pathlib.Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print("  %-46s %6.1f KB" % (path.name, len(data) / 1024))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--pyodide",
        default="v0.27.7",
        help="Pyodide 版本（要与 web/workers/pyodide-px4log-worker.ts 的默认值一致）",
    )
    args = ap.parse_args(argv[1:])

    base = CDN.format(ver=args.pyodide)
    out = CACHE / "pyodide" / args.pyodide / "full"
    print(f"Pyodide {args.pyodide}  →  {out.relative_to(REPO_ROOT)}")
    for name in CORE_FILES:
        save(out / name, fetch(base + name))

    # 从 lock 里解析出包文件名，连 wheel 一起抓
    lock = json.loads((out / "pyodide-lock.json").read_text(encoding="utf-8"))
    for pkg in PACKAGES:
        meta = (lock.get("packages") or {}).get(pkg)
        if not meta or not meta.get("file_name"):
            print(f"  !! lock 里没有 {pkg}，跳过", file=sys.stderr)
            continue
        save(out / meta["file_name"], fetch(base + meta["file_name"]))

    # pyulog：从 PyPI 取一个纯 Python wheel（py3-none-any），自托管后不再走索引查询
    print("pyulog wheel（PyPI）")
    info = json.loads(fetch(PYPI_JSON).decode("utf-8"))
    version = info["info"]["version"]
    wheel = next(
        (u for u in info["urls"] if u["filename"].endswith("-py3-none-any.whl")),
        None,
    )
    if not wheel:
        print("  !! 没找到 py3-none-any 的 wheel", file=sys.stderr)
        return 1
    save(CACHE / "wheels" / wheel["filename"], fetch(wheel["url"]))

    print(
        "\n上传与配置：\n"
        f"  1) 把 `pyodide/{args.pyodide}/full/` 整个目录传到 Blob（例如 `runtime/pyodide/{args.pyodide}/full/`），\n"
        f"     环境变量 NEXT_PUBLIC_PYODIDE_URL=https://<blob域名>/runtime/pyodide/{args.pyodide}/full/\n"
        f"  2) 把 `wheels/{wheel['filename']}` 传到 Blob（例如 `wheels/`），\n"
        f"     环境变量 NEXT_PUBLIC_PYULOG_WHEEL=https://<blob域名>/wheels/{wheel['filename']}\n"
        f"  3) 重新部署站点。之后浏览器只需下一次（约 15MB），此后走本地缓存/离线可用。\n"
        f"  （pyulog 当前版本 {version}；升级时重跑本脚本并同步改两个环境变量）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
