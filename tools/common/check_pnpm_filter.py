"""根 package.json 的转发脚本不许写成「匹配不到任何项目的 pnpm --filter」。

## 为什么要这条守卫

2026-09-23：`pnpm web:dev` 什么都不做、不报错、退出码 0。真因是提交 `0fbe62d` 把 11 个
转发脚本从 `pnpm -C web xxx` 改成 `pnpm --filter web xxx`，而：`--filter <值>` 不带 `./`
前缀时按包名匹配（带 `./` 才是按目录）；`web/package.json` 的 name 是
`nextpilot-skill-mcp`（与根包同名），workspace 里根本没有叫 `web` 的包；匹配 0 个项目时
pnpm 静默成功（无输出、rc=0）。11 个脚本全部空跑，包括 `typecheck` / `test`。

这类失败没有任何运行时信号：不报错、不红、不写日志。只能静态拦。

## 判据

扫所有非 node_modules 的 package.json 里的 scripts，对每个 `pnpm --filter <值>`：
以 `./` 或 `../` 开头 → OK（路径匹配）；以 `{` 开头 → OK（选择器语法）；是真实包名 → OK；
其它 → FAIL（匹配 0 个项目）。

包名集合从 `pnpm-workspace.yaml` 的 `packages` 展开，外加根包自己（它与 `web/` 同名这件事
本身就是坑：`--filter nextpilot-skill-mcp` 会同时选中根与 web 两个项目）。

## 「门还在」的自保（否则守卫恒绿）

- 找不到根 package.json / 没有 `pnpm-workspace.yaml` → FAIL（不是 SKIP）。
- `packages` 一条都没解析出目录 → FAIL：workspace 声明坏了，包名集合残缺、判定不可信。
- 一个 filter 都没扫到 → FAIL：多半是脚本写法变了（如换成 `-C web`）而正则没跟上，
  那这道门等于被架空。

四条各自都在 `tools/ci/mutate_guards.py` 注册了变异（第一条要删文件、脚本做不到），
缺一条就等于多一条"没人证明过会红"的分支。

## 输出格式

每行 `FAIL <检查名> -> <详情>`：检查名是稳定标识（mutate_guards.py 按它数「恰好红了几
条」）。总结行写成 `N 处问题：`，不要以 `FAIL` 开头，否则会被当成一条检查名，让每条变异
误报「牵连」。输出只用 ASCII 与 GBK 里都有的符号（Windows 控制台默认 GBK）。

用法：python tools/common/check_pnpm_filter.py；有 FAIL 退出码为 1。
"""

from __future__ import annotations

import glob as globmod
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# `pnpm --filter <值>`：值取到下一个空白。组合形式（`...` / `!` / `,`）放行——宁可漏，
# 不可错杀；它仍被「至少扫到一个 filter」那条兜住，不至于整门失效。
FILTER_RE = re.compile(r"pnpm\s+--filter[= ]\s*(\S+)")


def _load_json(path: str):
    with io.open(path, encoding="utf-8") as fh:
        return json.load(fh)


def workspace_names() -> tuple[set[str], list[str]]:
    """返回 (workspace 里全部包名, 说明行)。读不到 workspace 文件就抛错，由调用方转 FAIL。"""
    ws = os.path.join(ROOT, "pnpm-workspace.yaml")
    if not os.path.isfile(ws):
        raise FileNotFoundError(ws)

    patterns: list[str] = []
    # 不引 PyYAML：这份文件只有 `packages:` 一个列表，手工取即可
    in_packages = False
    with io.open(ws, encoding="utf-8") as fh:
        for line in fh:
            if re.match(r"^\s*packages\s*:", line):
                in_packages = True
                continue
            if in_packages:
                if re.match(r"^\S", line):  # 缩进回退 = 列表结束
                    break
                m = re.match(r"^\s*-\s*(.+?)\s*$", line)
                if m:
                    patterns.append(m.group(1).strip("\"'"))

    names: set[str] = set()
    dirs: list[str] = []
    for pat in patterns:
        if not pat or pat.startswith("!"):
            continue
        base = pat.rstrip("/")
        # 只支持 `dir` 与 `dir/*`、`*`、`**` 这类简单形式
        if any(ch in base for ch in "*?["):
            hits = [
                p
                for p in globmod.glob(os.path.join(ROOT, base), recursive=True)
                if os.path.isfile(os.path.join(p, "package.json"))
            ]
        else:
            hits = [os.path.join(ROOT, base)]
        for d in hits:
            pj = os.path.join(d, "package.json")
            if not os.path.isfile(pj):
                continue
            try:
                names.add(_load_json(pj).get("name", ""))
            except Exception:
                continue
            dirs.append(os.path.relpath(d, ROOT))

    # 根包自己也是 workspace 成员（且与 web/ 同名，正是当初踩坑的一半）
    try:
        names.add(_load_json(os.path.join(ROOT, "package.json")).get("name", ""))
    except Exception:
        pass
    names.discard("")
    return names, dirs


def package_json_files() -> list[str]:
    out: list[str] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d != "node_modules" and d != ".git"]
        if "package.json" in filenames:
            out.append(os.path.join(dirpath, "package.json"))
    return sorted(out)


def main() -> int:
    fails: list[str] = []

    root_pj = os.path.join(ROOT, "package.json")
    if not os.path.isfile(root_pj):
        print("FAIL root-package-json-present -> 找不到 %s —— 守卫无从判定，按失败处理" % root_pj)
        return 1

    try:
        names, dirs = workspace_names()
    except FileNotFoundError as e:
        print("FAIL workspace-file-present -> 找不到 pnpm-workspace.yaml（%s）—— 包名集合无法确定，按失败处理" % e)
        return 1

    if not dirs:
        print(
            "FAIL workspace-members-nonempty -> pnpm-workspace.yaml 的 packages 一条都没解析出"
            "目录 —— 真实包名集合是残缺的，「按包名匹配」的判定不可信，按失败处理"
        )
        return 1

    print("workspace 成员目录: %s" % (", ".join(dirs) if dirs else "(根)"))
    print("workspace 包名: %s" % ", ".join(sorted(names)))

    total = 0
    for pj in package_json_files():
        try:
            data = _load_json(pj)
        except Exception as exc:
            fails.append("package-json-parses -> %s 不是合法 JSON: %s" % (os.path.relpath(pj, ROOT), exc))
            continue
        scripts = data.get("scripts") or {}
        if not isinstance(scripts, dict):
            continue
        for sname, cmd in scripts.items():
            if not isinstance(cmd, str):
                continue
            for m in FILTER_RE.finditer(cmd):
                total += 1
                value = m.group(1).strip("\"'")
                rel = os.path.relpath(pj, ROOT)
                where = "%s -> %s" % (rel, sname)
                if value.startswith("./") or value.startswith("../") or value.startswith("{"):
                    print("OK   %-42s --filter %s（路径/选择器匹配）" % (where, value))
                elif value in names:
                    print("OK   %-42s --filter %s（包名存在）" % (where, value))
                else:
                    fails.append(
                        "filter-value-resolves -> %s：--filter %s 既不是路径也不是 workspace 里的包名，"
                        "pnpm 会匹配 0 个项目并**静默成功**（rc=0、无输出）。"
                        "改成 --filter ./%s（按目录匹配）或写真实包名。" % (where, value, value)
                    )

    if total == 0:
        fails.append(
            "filter-scan-found-any -> 一个 `pnpm --filter` 都没扫到 —— 要么转发脚本全改成了别的"
            "写法（如 `pnpm -C web`），要么本守卫的正则没跟上。两种情况下这道门都是空的，"
            "必须让人看见。"
        )

    for f in fails:
        print("FAIL " + f)

    if fails:
        print("\n%d 处问题：pnpm --filter 匹配不到项目时会静默空跑（rc=0 无输出），只能静态拦。" % len(fails))
        return 1
    print("\nOK  %d 个 --filter 全部能命中项目" % total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
