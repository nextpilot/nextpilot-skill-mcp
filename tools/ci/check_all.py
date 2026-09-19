"""仓库校验的**统一入口**：CI、pre-push hook 与本地手动跑的是同一份清单。

为什么要有它：这些命令原先散在几个 README 的「跑一遍」列表里，靠人记得逐条敲。
一旦有了 CI，就必须保证 CI 与本地跑的是同一串命令，否则「本地绿、CI 红」（或反过来）
会变成常态，而两边都开始被忽略。所以命令只写在这一处，workflow 与 hook 都只调它。

## 两组校验，按**是否需要真实 .ulg 日志**分开

不需要日志（云端 CI 能跑，每次提交都拦）：

| 校验 | 拦什么 |
| --- | --- |
| `ruff format --check` / `ruff check` | Python 风格漂移与真 bug（见仓库根 `pyproject.toml`） |
| `build:kb --check` | 产物与 `knowledge/` 不一致、契约写漏、字段/算子引用错 |
| `check_artifact.py` | 产物不是合法 Python、`compute` 表达式 Python 侧解析不了、`.replace` 链缺名字、**worker 守卫查的全局名在产物命名空间里不存在**（恒真/恒假的守卫，语法与执行检查都看不见）、**地图预设的适用范围（`conditions.topics`）没搬进 `facts.track`**（搬丢了引擎就少了"缺哪个 topic"那道闸门）、**轨迹取不到时的返回体没带逐条原因**（界面只能显示一句常常说错的概括） |
| `check_engine_purity.py` | `engine/` 里出现 Pyodide / JS 桥接 / 浏览器全局 —— 它是浏览器（Pyodide）、本机 `tools/calibrate/` 与将来的服务端**三处共用**的一份源码，含了只在某一处成立的东西，另外两处会在**跑到那一行**时才炸（没人看着就会破，破了之后只能复制一份出去改） |
| `tsc --noEmit` | 类型 |
| `test-issue-filer.mjs` | ① 报错上报的指纹归一化、脱敏正则、白名单 —— 写错了要么去重失效、要么把用户信息泄进公开 issue；② §[9]~[16] 防回潮守卫：两侧共用政策只许有一份，外部 JSON（网络响应 / 存档 / worker 消息）必须过归一函数、不许 `as` 强转（§6.5），派生数据（曲线 / 轨迹）必须按报告身份清理，取数据前必须先把当前这份日志装进共享 Worker（§6.7），`functions/` 下每个端点都必须在本地 dev 垫片里可达（漏一个 = 本地整条静默 404），指南正文只许有一个渲染入口（防止再裂成一对近音名 + 两份分叉的标题文本规则），组件名跟着家族不变量走（`Log*` = 某一份日志；列很多份的用数据模型的词），轨迹取不到时界面要把引擎给的逐条原因显示出来 |
| `next build`（`--with-build`） | 真编译 —— CI 才跑，本地太慢 |
| `check_hygiene.py` | **校验机制自身**的三处"不会报错的裂缝"：注释里的 `§x.y` 必须真有那一节（今天 5 处引用指向不存在的 §6.8）；产物新鲜度的判据不许落在 git 工作区状态上（那会把人的正常编辑判成漂移），且这道门不许被悄悄删掉；打了 `FAIL` / `ERROR` 的脚本必须能让调用方看见失败（否则"报错"与"通过"同时成立） |
| `mutate_guards.py` | **守卫自证**：每条静态守卫都先被证明"会红"——打掉它守的那条规则、断言恰好那一条失败、逐字节还原。守卫会悄悄退化成恒绿（被别的守卫蕴含、夹具到不了那条分支、打印 ERROR 却退出 0），不先红一次就不知道它还在不在守。没有真日志时产物侧那几条自动 SKIP |

需要日志（**云端 CI 跑不了**）：`tools/calibrate/logs/*.ulg` 含真实 GPS 轨迹，
按项目的隐私规则不入库（见 `.gitignore`），CI 的 checkout 里根本没有。
所以这几项**只在本地有日志时跑**，已挂在 `.githooks/pre-push` 上：

| 校验 | 拦什么 |
| --- | --- |
| `compare_baseline.py` | 6 条冻结基线逐字段比对 —— 改规则/引擎的硬门槛 |
| `check_provider.py` | 适配器契约（三张常量表声明的方法是否真的可用） |
| `run_checks_locally.py --probe-data` | 数据层三个 API 的结构与 JSON 合法性，**并且真的抽一次 `series`**（会以非零退出码结束；以前它对每份日志都打 ERROR 却 `return 0`，`series` 那一路早就废了没人知道） |
| `lint_rules.py --strict` | 字段引用错 / 版本错配。**必须在有日志时跑**：日志实测字段是它的主要证据源，没有日志时它只能拿上游字典比对，会把日志里真实存在的旧固件字段误报成"拼错" |

日志不在时这几步打印 `SKIP` 并说明原因，**不算失败** —— 但要清楚：
CI 全绿不等于回归过了，那几项只能在本机跑。

输出只用 ASCII 与 GBK 里都有的符号（`OK` / `FAIL` / `SKIP` / `·`）：
Windows 控制台默认 GBK，`✓ ✗ ▶` 这类字符会直接 UnicodeEncodeError 崩掉脚本。

用法：
  python tools/ci/check_all.py                 # 不需要日志的那组 + 本机有日志就跑日志那组
  python tools/ci/check_all.py --with-build    # 再加 next build（CI 用）
  python tools/ci/check_all.py --skip-logs     # 只跑不需要日志的那组

退出码：有**阻断项**失败则为 1，否则 0。
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
LOG_DIR = ROOT / "tools" / "calibrate" / "logs"

PY = sys.executable
NODE = shutil.which("node")
TSC = WEB / "node_modules" / "typescript" / "bin" / "tsc"
NEXT = WEB / "node_modules" / "next" / "dist" / "bin" / "next"


def run(cmd: list, cwd: Path = ROOT) -> int:
    """跑一条命令并把输出直接透传（CI 日志要能看见失败现场）。"""
    print("  $ " + " ".join(str(c) for c in cmd))
    return subprocess.run([str(c) for c in cmd], cwd=str(cwd)).returncode


def capture(cmd: list, cwd: Path = ROOT) -> subprocess.CompletedProcess:
    """跑一条命令并捕获输出。

    **必须显式指定 utf-8**：`text=True` 不写 encoding 时按 locale 解码，Windows 上是 GBK，
    而 `git diff` 的输出是 UTF-8 —— 碰到 GBK 里没有的字节会在读线程里抛 UnicodeDecodeError，
    于是 `stdout` 直接变成 `None`。症状很坑：gate 照样判失败（returncode 是好的），
    但**最该看的那段差异什么都不打印**。踩过一次，别再退回 text=True 的简写。
    """
    return subprocess.run(
        [str(c) for c in cmd],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def check_toolchain(logs: list[Path]) -> int:
    """先决条件检查 —— 缺东西时给人话，而不是让 subprocess 抛一坨栈。"""
    problems: list[str] = []

    if capture([PY, "-m", "ruff", "--version"]).returncode != 0:
        problems.append("没装 ruff —— 装法：python -m pip install -r requirements-dev.txt")
    if not NODE:
        problems.append("PATH 里没有 node —— 先装 Node.js 22+（见 README「快速开始」）")
    else:
        for name, path in (("typescript", TSC), ("next", NEXT)):
            if not path.exists():
                problems.append(f"web/node_modules 里没有 {name} —— 先跑：cd web && pnpm install")
                break
    if logs:
        missing = [mod for mod in ("pyulog", "numpy", "yaml") if capture([PY, "-c", f"import {mod}"]).returncode != 0]
        if missing:
            problems.append(f"本地日志类校验需要 {' / '.join(missing)} —— 装法：python -m pip install pyulog numpy pyyaml")

    for p in problems:
        print(f"FAIL {p}")
    return 1 if problems else 0


def gate(name: str, cmd: list, cwd: Path = ROOT) -> tuple[str, str]:
    """跑一项校验，返回 (名称, 结果)。结果 ∈ ok / fail。"""
    print(f"\n· {name}")
    code = run(cmd, cwd)
    if code == 0:
        print(f"OK {name}")
        return name, "ok"
    print(f"FAIL {name}（退出码 {code}）")
    return name, "fail"


def main(argv: list[str]) -> int:
    # 行缓冲：本脚本自己的 print 是缓冲的，而子进程直接写 fd —— 重定向到文件/CI 日志时
    # 两者会交错错位（gate 的输出跑到标题前面去）。行缓冲让顺序与实际执行一致。
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--with-build", action="store_true", help="额外跑 next build（CI 用，本地慢）")
    ap.add_argument("--skip-logs", action="store_true", help="跳过需要真实日志的校验")
    args = ap.parse_args(argv[1:])

    logs = sorted(LOG_DIR.glob("*.ulg")) + sorted(LOG_DIR.glob("*.bin")) if not args.skip_logs else []

    print("=== 仓库校验 ===")
    if check_toolchain(logs) != 0:
        return 1

    results: list[tuple[str, str]] = []
    skipped: list[str] = []

    print("\n--- 不需要日志（CI 覆盖这一段）---")
    results.append(gate("Python 风格（ruff format --check）", [PY, "-m", "ruff", "format", "--check", "."]))
    results.append(gate("Python lint（ruff check）", [PY, "-m", "ruff", "check", "."]))
    results.append(
        gate(
            "构建期契约与产物一致 + 指南页与 engine 源码一致（build:kb --check）",
            [NODE, "scripts/build-knowledge.mjs", "--check"],
            cwd=WEB,
        )
    )
    results.append(gate("产物是合法 Python（check_artifact）", [PY, "tools/calibrate/check_artifact.py"]))
    results.append(gate("engine/ 是三处共用的纯 Python（check_engine_purity）", [PY, "tools/ci/check_engine_purity.py"]))
    results.append(
        gate(
            "类型检查（tsc --noEmit）",
            [NODE, "node_modules/typescript/bin/tsc", "--noEmit"],
            cwd=WEB,
        )
    )
    results.append(
        gate(
            "报错上报自测（指纹 / 脱敏 / 白名单 / 边界守卫）",
            [NODE, "scripts/test-issue-filer.mjs"],
            cwd=WEB,
        )
    )
    # 后两项查的不是代码，而是**这套校验自己**：引用有没有落点、判据能不能重跑、失败有没有
    # 传出来。它们坏掉时都**没有输出**，所以必须自己有一道门。放在不需要日志那一段，
    # 让 CI 也能跑；`mutate_guards.py` 在缺日志时会把产物侧那几条 SKIP 掉并说明原因。
    results.append(gate("校验机制自身的卫生（check_hygiene）", [PY, "tools/ci/check_hygiene.py"]))
    results.append(gate("守卫自证（每条静态守卫都要先红一次）", [PY, "tools/ci/mutate_guards.py"]))

    if args.with_build:
        results.append(
            gate(
                "站点真编译（next build）",
                [NODE, "node_modules/next/dist/bin/next", "build"],
                cwd=WEB,
            )
        )
    else:
        skipped.append("站点真编译（next build）—— 本地默认跳过，CI 用 --with-build")

    print("\n--- 需要真实日志（**CI 跑不了**，本机才跑）---")
    if not logs:
        reason = "已用 --skip-logs 跳过" if args.skip_logs else f"{LOG_DIR.relative_to(ROOT)} 下没有 .ulg —— 云端 CI 里必然如此"
        print(f"SKIP 跳过（{reason}）")
        skipped.append(f"本地日志类 4 项 —— {reason}")
        print(
            "  注意：这几项是改规则/引擎的硬门槛（冻结基线逐字段比对）。\n"
            "  CI 全绿**不等于**回归过了，请在本机跑一次：python tools/ci/check_all.py"
        )
    else:
        print(f"  用 {len(logs)} 份日志：{', '.join(p.name for p in logs)}")
        results.append(
            gate(
                "冻结基线逐字段比对（compare_baseline）",
                [PY, "tools/calibrate/compare_baseline.py"],
            )
        )
        results.append(
            gate(
                "适配器契约测试（check_provider）",
                [PY, "tools/calibrate/check_provider.py", *logs],
            )
        )
        results.append(
            gate(
                "数据层结构自检（--probe-data）",
                [PY, "tools/calibrate/run_checks_locally.py", "--probe-data", *logs],
            )
        )
        results.append(
            gate(
                "字段引用 lint（lint_rules --strict）",
                [PY, "tools/calibrate/lint_rules.py", "--strict"],
            )
        )

    failed = [n for n, r in results if r == "fail"]

    print("\n=== 汇总 ===")
    for name, r in results:
        print(f"  {'OK  ' if r == 'ok' else 'FAIL'} {name}")
    for s in skipped:
        print(f"  SKIP {s}")
    if failed:
        print(f"\nFAIL {len(failed)} 项失败 —— 逐项看上面的输出。")
        return 1
    print(f"\nOK 阻断项全部通过（{len(results)} 项）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
