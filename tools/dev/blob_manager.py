"""EdgeOne Blob 管理工具（xcopy 风格，source → target）。

用法：
  python tools/dev/blob_manager.py push   <source> <target> [--skip-existing]
  python tools/dev/blob_manager.py pull   <source> [target]
  python tools/dev/blob_manager.py list   [source]
  python tools/dev/blob_manager.py remove <source> [--confirm]

示例：
  push .cache/pyodide-dist/pyodide/             pyodide/            # 上传目录（覆盖）
  push .cache/pyodide-dist/pyodide/             pyodide/ --skip-existing  # 只传新文件
  push .cache/pyodide-dist/wheels/x.whl         wheels/x.whl        # 上传单个文件
  pull pyodide/v0.27.7/full/pyodide.js          ./local/            # 下载单文件
  pull pyodide/v0.27.7/full/                    ./local/            # 下载文件夹
  list                                                              # 列出全部
  list pyodide/                                                     # 按前缀列出
  remove wheels/x.whl                                               # 删除单文件
  remove pyodide/v0.27.7/full/ --confirm                            # 删除文件夹

全局选项：
  -w, --workspace  runtime               命名空间（默认 runtime）
  -s, --site       skill.nextpilot.org   站点（默认连接生产环境）
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.parse
from pathlib import Path

try:
    import requests
except ImportError:
    print("缺少 requests，请先安装：pip install requests")
    raise SystemExit(1)

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / "web" / ".env"


# --------------------------------------------------------------------------- helpers
def _load_secret() -> str:
    s = os.environ.get("AUTH_EDGE_SECRET", "")
    if s:
        return s
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() == "AUTH_EDGE_SECRET":
                return v.strip().strip('"').strip("'")
    return ""


def _resolve_site(args: argparse.Namespace) -> str:
    if args.site:
        return args.site.rstrip("/")
    s = os.environ.get("NEXT_PUBLIC_SITE_URL", "")
    if s:
        return s.rstrip("/")
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("NEXT_PUBLIC_SITE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
    return "https://skill.nextpilot.org"


def _api_url(site: str, workspace: str, params: dict) -> str:
    qs = urllib.parse.urlencode({**params, "store": workspace})
    return f"{site}/api/blob?{qs}"


def _auth_headers() -> dict:
    token = _load_secret()
    if not token:
        print("警告：未设置 AUTH_EDGE_SECRET，请求可能被 403 拒绝")
    return {"x-internal-secret": token}


def _http_err(resp: requests.Response) -> str:
    try:
        err = resp.json().get("error", resp.text[:300])
    except Exception:
        err = resp.text[:300]
    if resp.status_code == 404 and "<!DOCTYPE" in str(resp.text[:100]):
        err = "端点未找到。请先部署 web/functions/blob.js + app/api/blob/route.ts 到 EdgeOne。"
    return str(err)


# --------------------------------------------------------------------------- push
def cmd_push(args: argparse.Namespace) -> int:
    """source（本地）→ target（blob），不区分文件/目录。"""
    site = _resolve_site(args)
    src = Path(args.source)
    if not src.exists():
        print(f"错误：{args.source} 不存在")
        return 1

    if src.is_file():
        files = [(args.target, src)]
    else:
        prefix = args.target.rstrip("/")
        files = []
        for f in sorted(src.rglob("*")):
            if f.is_file():
                rel = str(f.relative_to(src)).replace("\\", "/")
                files.append((f"{prefix}/{rel}", f))
        if not files:
            print(f"目录为空: {args.source}")
            return 1

    total = len(files)
    total_size = sum(f[1].stat().st_size for f in files)
    print(f"{args.source}  →  {site}  workspace={args.workspace}")
    print(f"{total} 个文件（{total_size / 1024:.1f} KB）\n")

    ok = fail = skip = 0
    for key, fp in files:
        sz = fp.stat().st_size
        # 检查远端是否已存在
        exists = False
        try:
            chk = requests.get(
                _api_url(site, args.workspace, {"key": key}),
                headers=_auth_headers(),
                stream=True,
                timeout=10,
            )
            exists = chk.status_code == 200
            chk.close()
        except requests.RequestException:
            pass

        if exists and args.skip_existing:
            print(f"  [{ok + fail + skip + 1}/{total}] 跳过 {key} ({sz / 1024:.1f} KB)")
            skip += 1
            continue

        label = "覆盖" if exists else "新增"
        print(f"  [{ok + fail + skip + 1}/{total}] {label} {key} ({sz / 1024:.1f} KB) ", end="", flush=True)
        try:
            resp = requests.post(
                _api_url(site, args.workspace, {"key": key}),
                headers={**_auth_headers(), "content-type": "application/octet-stream"},
                data=fp.read_bytes(),
                timeout=120,
            )
            if resp.status_code == 200 and resp.json().get("ok"):
                print("\u2713")
                ok += 1
            else:
                print(f"\u2717 {_http_err(resp)}")
                fail += 1
        except requests.RequestException as e:
            print(f"\u2717 {e}")
            fail += 1

    print(f"\n完成: \u2713 {ok}  \u2717 {fail}" + (f"  跳过 {skip}" if skip else ""))
    return 0 if fail == 0 else 1


# --------------------------------------------------------------------------- pull
def cmd_pull(args: argparse.Namespace) -> int:
    """source（blob）→ target（本地），支持前缀拉取文件夹。"""
    site = _resolve_site(args)

    # 前缀拉取：source 以 / 结尾
    if args.source.endswith("/"):
        target_dir = Path(args.target or ".")
        target_dir.mkdir(parents=True, exist_ok=True)

        resp = requests.get(_api_url(site, args.workspace, {"prefix": args.source}), headers=_auth_headers())
        if resp.status_code != 200:
            print(f"列出失败: {_http_err(resp)}")
            return 1
        blobs = resp.json().get("blobs", [])
        keys = [b["key"] if isinstance(b, dict) else str(b) for b in blobs]
        if not keys:
            print("(空)")
            return 0

        prefix = args.source
        total = len(keys)
        print(f"{args.source}  →  {target_dir}/  ({total} 个文件)\n")

        ok = fail = 0
        for i, k in enumerate(keys):
            rel = k[len(prefix) :] if k.startswith(prefix) else k
            fp = target_dir / rel
            fp.parent.mkdir(parents=True, exist_ok=True)
            print(f"  [{i + 1}/{total}] {k}  →  {fp} ", end="", flush=True)
            try:
                r = requests.get(_api_url(site, args.workspace, {"key": k}), headers=_auth_headers(), timeout=120)
                if r.status_code == 200:
                    fp.write_bytes(r.content)
                    print(f"\u2713 ({len(r.content) / 1024:.1f} KB)")
                    ok += 1
                else:
                    print(f"\u2717 {_http_err(r)}")
                    fail += 1
            except requests.RequestException as e:
                print(f"\u2717 {e}")
                fail += 1

        print(f"\n完成: \u2713 {ok}  \u2717 {fail}")
        return 0 if fail == 0 else 1

    # 单文件拉取
    target = Path(args.target or (args.source.rsplit("/", 1)[-1] if "/" in args.source else args.source))
    target.parent.mkdir(parents=True, exist_ok=True)

    print(f"{args.source}  →  {target} ... ", end="", flush=True)
    try:
        resp = requests.get(_api_url(site, args.workspace, {"key": args.source}), headers=_auth_headers(), timeout=120)
        if resp.status_code == 200:
            target.write_bytes(resp.content)
            print(f"\u2713 ({len(resp.content) / 1024:.1f} KB)")
            return 0
        print(f"\u2717 {_http_err(resp)}")
        return 1
    except requests.RequestException as e:
        print(f"\u2717 {e}")
        return 1


# --------------------------------------------------------------------------- list
def cmd_list(args: argparse.Namespace) -> int:
    site = _resolve_site(args)
    params = {"prefix": args.source} if args.source else {}
    url = _api_url(site, args.workspace, params)
    print(f"GET {url}\n")
    resp = requests.get(url, headers=_auth_headers())
    if resp.status_code != 200:
        print(f"错误: {_http_err(resp)}")
        return 1

    data = resp.json()
    if data.get("error"):
        print(f"错误: {data['error']}")
        return 1

    blobs, dirs = data.get("blobs", []), data.get("directories", [])
    if not blobs and not dirs:
        print("(空)")
        return 0
    for d in dirs:
        print(f"  \N{OPEN FILE FOLDER}  {d}/")
    if dirs:
        print()
    for b in blobs:
        k = b.get("key", "") if isinstance(b, dict) else str(b)
        print(f"  \N{PAGE FACING UP}  {k}")
    print(f"\n{len(blobs)} 个文件")
    return 0


# --------------------------------------------------------------------------- remove
def cmd_remove(args: argparse.Namespace) -> int:
    """就删除一个文件或文件夹，不创造多余概念。"""
    site = _resolve_site(args)

    # 文件夹：/ 结尾 → 先 list 再逐个删除
    if args.source.endswith("/"):
        if not args.confirm:
            resp = requests.get(_api_url(site, args.workspace, {"prefix": args.source}), headers=_auth_headers())
            if resp.status_code != 200:
                print(f"错误: {_http_err(resp)}")
                return 1
            blobs = resp.json().get("blobs", [])
            if not blobs:
                print(f"{args.source}  (空)")
                return 0
            print(f"将删除 {len(blobs)} 个文件，加 --confirm 确认执行")
            for b in blobs[:10]:
                k = b["key"] if isinstance(b, dict) else str(b)
                print(f"  - {k}")
            if len(blobs) > 10:
                print(f"  ... 还有 {len(blobs) - 10} 个")
            return 0

        resp = requests.get(_api_url(site, args.workspace, {"prefix": args.source}), headers=_auth_headers())
        if resp.status_code != 200:
            print(f"错误: {_http_err(resp)}")
            return 1
        blobs = resp.json().get("blobs", [])
        if not blobs:
            print(f"{args.source}  (空)")
            return 0
        keys = [b["key"] if isinstance(b, dict) else str(b) for b in blobs]
        print(f"删除 {args.source} ({len(keys)} 个文件)\n")

        ok = fail = 0
        for k in keys:
            print(f"  {k} ... ", end="", flush=True)
            try:
                r = requests.delete(_api_url(site, args.workspace, {"key": k}), headers=_auth_headers())
                if r.status_code == 200:
                    print("\u2713")
                    ok += 1
                else:
                    print("\u2717")
                    fail += 1
            except requests.RequestException as e:
                print(f"\u2717 {e}")
                fail += 1
        print(f"\n完成: \u2713 {ok}  \u2717 {fail}")
        return 0 if fail == 0 else 1

    # 单个文件
    print(f"删除 {args.source} ... ", end="", flush=True)
    try:
        resp = requests.delete(_api_url(site, args.workspace, {"key": args.source}), headers=_auth_headers())
        if resp.status_code == 200 and resp.json().get("ok"):
            print("\u2713")
            return 0
        print(f"\u2717 {_http_err(resp)}")
        return 1
    except requests.RequestException as e:
        print(f"\u2717 {e}")
        return 1


# --------------------------------------------------------------------------- main
def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-w", "--workspace", default="runtime", help="Blob 命名空间（默认 runtime）")
    ap.add_argument("-s", "--site", help="站点 URL（默认 https://skill.nextpilot.org）")

    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("push", help="本地 → Blob")
    p.add_argument("source", help="本地路径")
    p.add_argument("target", help="Blob key（文件）或 prefix（目录）")
    p.add_argument("--skip-existing", action="store_true", help="跳过远端已存在的文件")

    p = sub.add_parser("pull", help="Blob → 本地")
    p.add_argument("source", help="Blob key（文件）或 prefix/（文件夹）")
    p.add_argument("target", nargs="?", help="本地输出路径（默认自动推导）")

    p = sub.add_parser("list", help="列出文件")
    p.add_argument("source", nargs="?", help="前缀过滤（可选，如 pyodide/）")

    p = sub.add_parser("remove", help="删除文件或文件夹")
    p.add_argument("source", help="文件 key 或 folder/")
    p.add_argument("--confirm", action="store_true", help="删除文件夹时确认")

    args = ap.parse_args(argv[1:])
    return {"push": cmd_push, "pull": cmd_pull, "list": cmd_list, "remove": cmd_remove}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
