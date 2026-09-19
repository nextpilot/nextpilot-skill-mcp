"""守卫自证跑手：把「每条静态守卫都要先红一次」变成可重复执行的检查。

## 为什么要有它

`CLAUDE.md` §6.6 要求每条静态守卫都附一次「会红」的证明。而这份证明以前每次都写在
`%TEMP%` 下的一次性脚本里——跑完就丢。后果是双重的：

1. 同一件事反复重写（2026-09-18 一天里写了三个）；
2. **下次改动之后没有人能重跑它**。守卫悄悄退化成恒绿（被别的守卫蕴含、夹具到不了
   那条分支、打印 ERROR 却 `return 0`），没有任何东西会告诉我们。

这份脚本把那些一次性脚本收拢成一张**注册表**：每条 = 改哪个文件的哪句话 → 改成什么、
由哪条守卫来抓、抓住时它该打印哪句话。跑法就是逐条应用变异、跑守卫、断言「**恰好**
这一条红」，再无条件还原。

## 判据（缺一不可）

1. **基线必须全绿** —— 否则分不清是谁红的；
2. 变异后**退出码非零**；
3. 该条守卫的**预期失败文案**真的出现在输出里（不然「红了」可能是别的原因）；
4. **别的注册变异预期的文案一条都没出现** —— 断言「恰好一条」而不是「预期那条在里面」，
   否则守卫之间的牵连会在"看起来通过"的绿色里长出来。

## 为什么改产物而不改引擎源码

产物侧守卫（`check_artifact.py`）读的是编译产物 `web/workers/ulog-check-script.ts`，
不是 `engine/providers/px4.py`。所以变异要打在**产物**上——打源码的话守卫根本看不到，
自证会得出"守卫红不起来"的假结论。产物与源码一致由另一道门（`build:kb --check`）保证，
两层各管各的，这才是它们各自的职责边界。

## 用法

    python tools/ci/mutate_guards.py              # 跑全部
    python tools/ci/mutate_guards.py --list       # 只看注册表
    python tools/ci/mutate_guards.py --only 轨迹   # 只跑名字里含"轨迹"的

**必须用装了 numpy / pyulog 的解释器**（产物侧守卫要真执行编译产物）。本机是
`C:\\Users\\zhanfuyu\\anaconda3\\python.exe`；托管 Python 3.13.12 没有科学栈，会在
"产物执行"那步 `ModuleNotFoundError`。没有日志时产物侧那几条自动 SKIP（见下）。

输出只用 ASCII 与 GBK 里都有的符号（`OK` / `FAIL` / `SKIP` / `->` / `·`）：
Windows 控制台默认 GBK，`✓ ✗ ▶` 这类字符会直接 UnicodeEncodeError 崩掉脚本。

退出码：有变异没红、有牵连、或还原没做到逐字节一致，则为 1。
"""

from __future__ import annotations

import argparse
import os as _os
import re as _re
import shutil
import signal as _signal
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
LOG_DIR = ROOT / "tools" / "calibrate" / "logs"

PY = sys.executable
NODE = shutil.which("node")

ARTIFACT = "web/workers/ulog-check-script.ts"
FLIGHT_MAP = "web/components/LogFlightMap.tsx"

# 守卫的两种"层"：产物侧真执行编译产物（慢、要科学栈、要真实日志），
# 界面侧只扫源码（快、无依赖）。
#
# 第三个字段是**怎么从输出里数出"红了几条"**——这一步必须按各守卫自己的格式来，
# 不能统一用"标记在不在输出里"：`test-issue-filer.mjs` 把**通过的**检查名也打印出来
# （`  ok    <名字>`），于是"别的守卫的那句话也在输出里"会把全绿的那几条误判成牵连
# （第一版就是这么写的，四条界面侧变异全部误报"牵连 3 条"）。
GUARDS = {
    "artifact": ([PY, "tools/calibrate/check_artifact.py"], ROOT, "产物侧（check_artifact）", "prose"),
    "ui": ([NODE, "scripts/test-issue-filer.mjs"], WEB, "界面侧（test-issue-filer）", "fail-lines"),
    "hygiene": ([PY, "tools/ci/check_hygiene.py"], ROOT, "卫生检查（check_hygiene）", "fail-lines"),
    # 引擎纯度：只扫 engine/ 的源码文本，无依赖、无网络、不需要日志 —— 快，所以每次都跑
    "engine": ([PY, "tools/ci/check_engine_purity.py"], ROOT, "引擎纯度（check_engine_purity）", "fail-lines"),
}


@dataclass(frozen=True)
class Mutation:
    """一条变异：改哪句话、谁来抓、抓住时打印什么。"""

    name: str
    path: str
    old: str
    new: str
    guard: str
    expect: str
    note: str = ""


# ---------------------------------------------------------------------------
# 注册表
#
# 每一条对应 §6.6 意义上的一次"先红"证明。`expect` 必须是从守卫源码里**抄来的**
# 那句话（不是猜的）——猜错会把"红了"误报成"没红"，而那正是这套东西要防的错。
# ---------------------------------------------------------------------------

MUTATIONS: list[Mutation] = [
    # ---- 产物侧：轨迹失败要说清缺什么（2026-09-18） ----
    Mutation(
        name="构建期把 conditions 丢了",
        path=ARTIFACT,
        old='"conditions":{"topics":[["sensor_gps","vehicle_gps_position"]]}',
        new='"_conditions_dropped":{"topics":[["sensor_gps","vehicle_gps_position"]]}',
        guard="artifact",
        expect="facts.track 里的 conditions.topics 与 plot/track.yml 的声明不一致",
        note="compileMap 只搬 children 时，引擎就少了「缺哪个 topic」那道闸门（原 bug 的成因）",
    ),
    Mutation(
        name="取不到轨迹时不再给逐条原因",
        path=ARTIFACT,
        old='"errorReasons": reasons,',
        new='"errorReasonsX": reasons,',
        guard="artifact",
        expect="轨迹取不到却没有给出逐条原因",
        note="界面只能显示那句概括，而概括只对六种原因里的一种成立",
    ),
    Mutation(
        name="引擎不查声明里的闸门",
        path=ARTIFACT,
        old='missing = _missing_topics((cfg.get("conditions") or {}).get("topics"))',
        new="missing = None",
        guard="artifact",
        expect="闸门没生效",
        note="不查闸门就一定走不到「缺哪个 topic」那条路",
    ),
    Mutation(
        name="失败原因不再提声明的 topic 名",
        path=ARTIFACT,
        old='"轨迹声明要的 topic 不在日志里：%s" % missing',
        new='"取不到轨迹"',
        guard="artifact",
        expect="失败原因里没提声明的 topic 名",
        note="用户看不出到底缺哪个——正是本轮要消灭的「空洞提示」",
    ),
    Mutation(
        name="逐候选的原因被丢掉",
        path=ARTIFACT,
        old="return None, why",
        new="return None, []",
        guard="artifact",
        expect="失败原因里没提是哪个 topic / 哪个字段取不到",
        note="字段改名那条路会退化成只给一句概括",
    ),
    Mutation(
        name="「像经纬度」的判据退回裸子串",
        path=ARTIFACT,
        old="return [c for c in columns if _LATLON_FIELD_RE.search(str(c).lower())]",
        new='return [c for c in columns if any(k in str(c).lower() for k in ("lat", "lon", "lng"))]',
        guard="artifact",
        expect="「像经纬度」的判据错了",
        note="裸子串会让 relative_test_ratio 里的 lat 混进来，对照物反而把人带偏",
    ),
    # ---- 界面侧：逐条原因要真的显示出来 ----
    Mutation(
        name="失败分支不再收下引擎给的原因",
        path=FLIGHT_MAP,
        old="setErrorReasons(track.errorReasons ?? []);",
        new="",
        guard="ui",
        expect="失败分支收下引擎给的全部原因",
    ),
    Mutation(
        name="逐条原因不再渲染成列表",
        path=FLIGHT_MAP,
        old="errorReasons.map(",
        new="list.map(",
        guard="ui",
        expect="界面把逐条原因渲染成列表",
        note="接进了 state 却不渲染 = 用户看到的仍是那句概括",
    ),
    Mutation(
        name="重新取数时不清空上一轮的原因",
        path=FLIGHT_MAP,
        old="setErrorReasons([]);",
        new="",
        guard="ui",
        expect="重新取数时清空上一轮的原因",
    ),
    Mutation(
        name="引擎违约时不再明说是解析器缺陷",
        path=FLIGHT_MAP,
        old="引擎没有返回任何轨道，也没给出原因",
        new="无法加载",
        guard="ui",
        expect="引擎没给原因时明说是解析器缺陷",
        note="伪装成「日志里没有轨迹」会让解析器缺陷看起来像用户的数据问题",
    ),
    # ---- 界面侧：MDX 指南必须真的启用 GFM（2026-09-19） ----
    #
    # 这条的失败形态是**静默降级**：漏传 remark-gfm 时 GFM 表格不是"报错"，而是退回成
    # 一段带竖线的普通段落——页面照样出得来，只是表格没了。跟上面几条"功能说谎"是同一类。
    Mutation(
        name="MDX 分支不再启用 GFM（表格会退化成纯文本）",
        path="web/components/GuideBody.tsx",
        old="options={{ mdxOptions: { remarkPlugins: sharedRemarkPlugins } }}",
        new="",
        guard="ui",
        expect="MDX 分支启用了 GFM（漏了它表格会静默退化成纯文本）",
        note="MDX 默认管线只有 CommonMark；线上症状是 /guide/rule-schema 的 5 张表全渲染成 | 参数 | 说明 | 原文",
    ),
    # ---- 卫生检查：引用落点 / 判据可重跑 / 失败可见（2026-09-18 的第二批） ----
    #
    # 这六条与上面十条性质不同：上面守的是"功能有没有说谎"，这里守的是"**校验本身**有没有说谎"。
    # 它们坏掉时都没有输出——引用悬空要人读到才发现、误报会让人去改没坏的东西、吞掉的失败连
    # "有人在看"这个前提都不成立。所以每一条都得当场证明它会红。
    Mutation(
        name="某一节丢了编号（引用它的人当场暴露）",
        path="CLAUDE.md",
        old="### 6.6 守卫自己也要被校验（判空查的名字必须真实存在）",
        new="### 守卫自己也要被校验（判空查的名字必须真实存在）",
        guard="hygiene",
        expect="悬空 § 引用",
        note="那天的原形：5 处注释写着 CLAUDE.md §6.8，而 §6.8 当时并不存在——读者按图索骥，翻到一页空白",
    ),
    Mutation(
        name="CI 门改用 git 工作区状态判产物",
        path="tools/ci/check_all.py",
        old="PY = sys.executable",
        new='PY = sys.executable\nGATE_GIT = ["git", "status", "--porcelain"]  # 变异：拿工作区状态当判据',
        guard="hygiene",
        expect="产物新鲜度不许用 git 当判据",
        note="判据落在 git 上，人的正常编辑也会被算成漂移（作者当时只能回一句「是我手动修改的」）",
    ),
    Mutation(
        name="产物新鲜度门不再据比对结果判失败",
        path="web/scripts/build-knowledge.mjs",
        old="if (drifted.length > 0) {",
        new="if (false) {",
        guard="hygiene",
        expect="产物新鲜度门还在",
        note="防「目标消失」：这道门被删掉之后，上面那条规则会因为找不到目标而恒绿",
    ),
    Mutation(
        name="Python 校验脚本不把 main 的返回值交给退出码",
        path="tools/calibrate/compare_baseline.py",
        old="raise SystemExit(main(sys.argv))",
        new="main(sys.argv)",
        guard="hygiene",
        expect="打了 FAIL/ERROR 就要能非零退出",
        note="原形就是它：main() 里对 6 份日志全打 ERROR，然后 return 0——pre-push 与 CI 一起放行",
    ),
    Mutation(
        name="JS 侧打了 CHECK FAIL 却把 exitCode 设成 0",
        path="web/scripts/build-knowledge.mjs",
        old="process.exitCode = 1;",
        new="process.exitCode = 0;",
        guard="hygiene",
        expect="打了 FAIL/ERROR 就要能非零退出",
        note="同一形状的另一半：产物新鲜度门报完不一致，却以成功退出",
    ),
    Mutation(
        name="坏输入不再让校验脚本非零退出",
        path="tools/calibrate/run_checks_locally.py",
        old="return 1 if failed else 0",
        new="return 0",
        guard="hygiene",
        expect="坏输入必须非零退出",
        note="静态规则看不见这一半：确实 return 1 了，但那条路根本没被走到过",
    ),
    # ---- 引擎侧：engine/ 是三处共用的纯 Python（2026-09-19） ----
    #
    # 这两条守的不是"某段代码在不在"，而是**一份源码能同时跑在三个运行时里**这个前提。
    # 第 1 条是正向的（不许出现只在一处成立的东西），第 2、3 条是"前提还在"——
    # 消费者只剩一个时，这条约束就失去意义了，而它会安静地绿着。
    Mutation(
        name="engine/ 里写一行 js 桥接",
        path="engine/report_data.py",
        old="import json",
        new="import json\nimport js",
        guard="engine",
        expect="engine/ 是纯 Python（不碰 Pyodide / JS 桥接 / 浏览器全局）",
        note="js 是 Pyodide 注入的全局：浏览器能跑，本机 tools/calibrate 用 CPython 要到那一行才 NameError",
    ),
    Mutation(
        name="浏览器不再把 engine/ 拼进 Pyodide 产物",
        path="web/scripts/build-knowledge.mjs",
        old='resolve(webRoot, "../engine")',
        new='resolve(webRoot, "../engine_moved")',
        guard="engine",
        expect="engine/ 仍被浏览器与本机共用（纯 Python 的前提还在）",
        note="防「前提消失」：不再共用之后，「纯 Python」只剩「写得干净」这一层意义，而规则会继续绿着",
    ),
    Mutation(
        name="本机校准工具不再直接指到 engine/",
        path="tools/calibrate/run_checks_locally.py",
        old='ENGINE = REPO_ROOT / "engine"',
        new='ENGINE = REPO_ROOT / "engine_moved"',
        guard="engine",
        expect="engine/ 仍被浏览器与本机共用（纯 Python 的前提还在）",
        note="同上：另一侧消费者也消失时，这条规则该被删掉而不是继续绿",
    ),
]


class AnchorError(RuntimeError):
    """锚点对不上——脚本写坏了，不是守卫坏了。"""


# 当前**已被变异、还没还原**的那个文件。信号兜底要用它，所以放在模块级而不是闭包里。
_PENDING: tuple[Path, bytes] | None = None


def _restore_pending() -> None:
    """把 `_PENDING` 里那个文件按字节还原。"""
    global _PENDING
    if _PENDING is None:
        return
    path, snapshot = _PENDING
    _PENDING = None
    try:
        path.write_bytes(snapshot)
        print(f"\n[中断] 已还原 {path.name}", flush=True)
    except OSError as exc:
        print(f"\n[中断] 还原 {path.name} 失败：{exc} —— 手动把它改回去", flush=True)


def _install_signal_guard() -> None:
    """被中断时也要还原 —— `finally` 挡不住 SIGTERM / Ctrl-C。

    `finally` 只在异常/正常返回时执行；SIGTERM 的默认处理是**立刻终止进程**，不走 finally。
    2026-09-19 真踩到了：全量自证跑到第 17 条被超时杀掉，`run_checks_locally.py` 的
    `return 1 if failed else 0` 就留在了 `return 0` 的状态——下一次跑**任何**守卫，
    看到的都是一条假的基线失败（而且提示指向的方向完全不对）。
    """

    def handler(signum: int, _frame: object) -> None:
        _restore_pending()
        _signal.signal(signum, _signal.SIG_DFL)  # 还原完再按默认语义退出
        _os.kill(_os.getpid(), signum)

    for sig in (_signal.SIGTERM, _signal.SIGINT):
        try:
            _signal.signal(sig, handler)
        except (ValueError, OSError):
            pass  # 非主线程等场景装不上 —— 尽力而为，不值得为此失败


def _apply(path: Path, old: str, new: str) -> bytes:
    """按字节快照 → 文本变异，返回变异前的字节。

    走 `read_bytes` / `write_bytes`（二进制）而不是 `read_text` / `write_text`：
    后者会把 `\\r\\n` 归一成 `\\n` 再写回，混合行尾的文件被写回后就变了样——既让
    "还原是否逐字节一致"误报，也真的动了没打算动的行。

    要求锚点**恰好出现一次**（不是"出现过")：一处也找不到时脚本会"成功地什么都没测"，
    出现多次时全量替换会顺手改到别处。两种都要当场报错。
    """
    before = path.read_bytes()
    text = before.decode("utf-8")
    count = text.count(old)
    if count != 1:
        raise AnchorError(f"锚点在 {path.name} 里出现 {count} 次（要求恰好 1 次）：{old[:60]!r}")
    path.write_bytes(text.replace(old, new).encode("utf-8"))
    return before


def _run_guard(key: str) -> tuple[int, str]:
    """跑守卫，返回 (退出码, stdout+stderr)。

    显式 `encoding="utf-8"`：不写的话按 locale 解码（Windows 上是 GBK），而守卫的输出
    是 UTF-8 —— 碰到 GBK 里没有的字节会在读线程里抛 UnicodeDecodeError，`stdout` 直接
    变成 `None`，于是**最该看的那段输出什么都不打印**。同一个坑在 `check_all.py` 踩过。
    """
    argv, cwd, _, _ = GUARDS[key]
    proc = subprocess.run(
        [str(x) for x in argv],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def _missing_tools() -> dict[str, str]:
    """先决条件：缺什么就明说，别让 subprocess 抛一坨栈。"""
    problems: dict[str, str] = {}
    if not NODE:
        problems["ui"] = "PATH 里没有 node —— 先装 Node.js 22+"
    need_logs = sorted(LOG_DIR.glob("*.ulg")) if LOG_DIR.is_dir() else []
    if not need_logs:
        problems["artifact"] = f"{LOG_DIR.relative_to(ROOT)} 下没有 .ulg —— 产物侧守卫的失败分支只有真日志才跑得到"
    else:
        missing = [
            mod
            for mod in ("numpy", "pyulog")
            if subprocess.run([PY, "-c", f"import {mod}"], capture_output=True).returncode != 0
        ]
        if missing:
            problems["artifact"] = (
                f"当前解释器缺 {' / '.join(missing)} —— 用装了科学栈的那个跑，本机是 C:\\Users\\zhanfuyu\\anaconda3\\python.exe"
            )
    return problems


def _failed_names(key: str, out: str) -> set[str]:
    """从守卫输出里数出**红了的**那几条（不是"输出了哪些字"）。

    两种格式：
    - `fail-lines`（test-issue-filer.mjs / check_hygiene.py）：`  FAIL  <名字>` 或 `  FAIL  <名字>  → <补充>`。
      解析只能"凡 FAIL 行就取名字"——不能要求带箭头：`test-issue-filer.mjs` 在补充文本为空时
      **不打印箭头**（`` `FAIL ${name}${extra ? ` → ${extra}` : ""}` ``），要求带箭头会漏掉那些检查，
      而漏掉表现为"红的不是它"，比误报更难查。
      两个箭头都收（`→` 与 `->`）：仓库的 ASCII/GBK 约定让有的脚本用 `->`。
      **因此被解析的守卫有一条格式契约**：它的总结行不要写成 `FAIL <名字>`（第一版 check_hygiene
      的 `FAIL 1 项卫生检查未过` 就被当成了检查名，六条变异全报"牵连 1 条"）。写成 `N 项未过` 这种。
    - `prose`（check_artifact.py）：失败时打印一段人话再 `return 1`，没有统一前缀——
      只能拿注册表里的文案去对，但**产物侧的文案只在失败时才打印**，所以这么对是准的。
    """
    kind = GUARDS[key][3]
    if kind == "fail-lines":
        names = set()
        for line in out.splitlines():
            m = _re.match(r"\s*FAIL\s+(.*?)(?:\s+(?:->|→)\s+.*)?$", line)
            if m:
                names.add(m.group(1).strip())
        return names
    return {other.expect for other in MUTATIONS if other.guard == key and other.expect in out}


def _porcelain(paths: list[str]) -> dict[str, str]:
    """这些路径当前的 git 状态（`{路径: XY}`）。

    用途是**证明自证没把仓库写脏**（技能里的"顺手看一眼"）。但判据不能是"这些文件脏不脏"——
    仓库里经常挂着别人没提交的改动，那样天天误报。要比的是**跑前 vs 跑后有没有多出脏**：
    只有自证自己改出来的脏才算。
    """
    proc = subprocess.run(
        ["git", "status", "--porcelain", "--", *paths],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        return {}  # 没有 git（或不是仓库）—— 这项检查跳过，不影响别的断言
    state: dict[str, str] = {}
    for line in (proc.stdout or "").splitlines():
        code, _, rest = line.partition(" ")
        if rest.strip():
            state[rest.strip()] = code
    return state


def main(argv: list[str]) -> int:
    global _PENDING
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    _install_signal_guard()  # 跑之前先装上：变异一旦落盘，中断也必须还原

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="只打印注册表")
    ap.add_argument("--only", default="", help="只跑名字里含这个词的变异")
    ap.add_argument("--guard", default="", help=f"只跑某一层守卫的变异：{' / '.join(sorted(GUARDS))}")
    ap.add_argument("--skip-baseline", action="store_true", help="跳过基线（调试用；正常别加）")
    args = ap.parse_args(argv[1:])

    if args.guard and args.guard not in GUARDS:
        print(f"FAIL --guard {args.guard!r} 不是已知的守卫层：{' / '.join(sorted(GUARDS))}")
        return 1

    picked = list(MUTATIONS)
    if args.guard:
        picked = [m for m in picked if m.guard == args.guard]
    if args.only:
        picked = [m for m in picked if args.only in m.name]
    if (args.only or args.guard) and not picked:
        print(f"FAIL --only {args.only!r} --guard {args.guard!r} 没匹配到任何变异")
        return 1

    if args.list:
        print(f"注册表 {len(picked)} 条：")
        for i, m in enumerate(picked, 1):
            print(f"  [{i:>2}] {m.name}")
            print(f"       {m.path}")
            print(f"       守卫 {GUARDS[m.guard][2]} -> 期望变红于：{m.expect}")
            if m.note:
                print(f"       为什么要守：{m.note}")
        return 0

    print(f"=== 守卫自证（{len(picked)} 条变异，每条都必须让它守的那条红）===")
    blocked = _missing_tools()

    # 基线：跑了哪些守卫、各自是否绿。不是绿的就先修基线——否则后面分不清是谁红。
    usable: set[str] = set()
    if not args.skip_baseline:
        for key in sorted({m.guard for m in picked}):
            label = GUARDS[key][2]
            if key in blocked:
                print(f"\n· 基线：{label}")
                print(f"SKIP {blocked[key]}")
                continue
            code, out = _run_guard(key)
            if code != 0:
                print(f"\n· 基线：{label}")
                print("FAIL 基线就是红的，先修它（否则后面分不清是谁红的）：")
                print("\n".join("  " + ln for ln in out.splitlines()[-25:]))
                return 1
            usable.add(key)
            print(f"\n· 基线：{label}")
            print("OK 基线绿")
    else:
        usable = {m.guard for m in picked} - set(blocked)

    failures: list[str] = []
    skipped: list[str] = []
    ran: dict[str, int] = {}
    touched = sorted({m.path for m in picked})
    dirty_before = _porcelain(touched)

    for i, m in enumerate(picked, 1):
        print(f"\n--- [{i}/{len(picked)}] {m.name}")
        if m.guard not in usable:
            print(f"SKIP 守卫不可用 —— {blocked.get(m.guard, '原因见上')}")
            skipped.append(m.name)
            continue
        if m.note:
            print(f"  守的是：{m.note}")
        path = ROOT / m.path
        try:
            snapshot = _apply(path, m.old, m.new)
        except AnchorError as exc:
            print(f"FAIL {exc}")
            failures.append(f"{m.name}（锚点对不上，脚本写坏了）")
            continue
        _PENDING = (path, snapshot)  # 交给信号兜底：被 Ctrl-C / 超时杀掉时也能还原
        try:
            code, out = _run_guard(m.guard)
        finally:
            # 无条件还原：写在 finally 里，而且不依赖"变异是否成功"——
            # 还原失败会让后面每一条都跟着误报（一次跑出四条 BAD，看着像守卫坏了，其实是脏状态）。
            _PENDING = None
            path.write_bytes(snapshot)

        if path.read_bytes() != snapshot:
            print(f"FAIL 还原失败：{m.path} 与快照逐字节不一致")
            failures.append(f"{m.name}（还原失败）")
            continue

        if code == 0:
            print("FAIL 守卫**没红**（退出码 0）—— 这条变异没人守，守卫恒绿")
            print("\n".join("  " + ln for ln in out.splitlines()[-15:]))
            failures.append(f"{m.name}（守卫恒绿）")
            continue
        red = _failed_names(m.guard, out)
        if m.expect not in red:
            print(f"FAIL 红了，但不是预期的原因：红了 {sorted(red) or ['（数不出来）']}，期望「{m.expect}」")
            print("\n".join("  " + ln for ln in out.splitlines()[-15:]))
            failures.append(f"{m.name}（红的不是它）")
            continue
        # 断言「恰好一条」而不是「预期那条在里面」：牵连说明守卫之间有耦合，
        # 以后任何一次正常改动都会连带报错，人就会开始忽略它们。
        # 排除 expect 与自己相同的那些：两条变异合法地指向同一条检查（一条守 Python 半边、
        # 一条守 JS 半边）时，那不算牵连。
        if len(red) > 1:
            print("FAIL 牵连了别的守卫（变异改到了它守的东西）：")
            for one in sorted(red - {m.expect}):
                print(f"   还红了：{one}")
            failures.append(f"{m.name}（牵连 {len(red) - 1} 条）")
            continue

        ran[m.guard] = ran.get(m.guard, 0) + 1
        print(f"OK 恰好这一条红（退出码 {code}）")
        print("OK 已还原（逐字节一致）")

    # 自证不该在仓库里留下任何痕迹。逐字节还原只证明"变异过的那个文件"复原了；万一守卫
    # 自己写了**别的**文件（生成器、缓存、产物），只有这一步看得见。
    # 注意比的是"跑前 vs 跑后"，不是"脏不脏"——仓库里经常挂着别人没提交的改动。
    for path, code in sorted(_porcelain(touched).items()):
        if dirty_before.get(path) != code:
            print(f"FAIL 自证在仓库里留下了改动：{path}  {dirty_before.get(path, '  ')} -> {code}")
            failures.append(f"{path}（自证写脏）")

    print("\n=== 汇总 ===")
    for key in sorted(ran):
        print(f"  OK   {GUARDS[key][2]}：{ran[key]} 条变异各自独立变红")
    for name in skipped:
        print(f"  SKIP {name}")
    if failures:
        print(f"\nFAIL {len(failures)} 条没能自证：")
        for name in failures:
            print(f"  - {name}")
        return 1
    print(f"\nOK {sum(ran.values())} 条变异全部自证通过（各自恰好一条红、还原逐字节一致）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
