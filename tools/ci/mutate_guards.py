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

产物侧守卫（`check_engine_pyodide.py`）读的是编译产物 `web/workers/analysis-engine.generated.ts`，
不是 `knowledge/engine/providers/px4.py`。所以变异要打在**产物**上——打源码的话守卫根本看不到，
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()


def _safe(text: str) -> str:
    """把控制台编码（Windows 默认 GBK / cp936）编不出的字符（典型如 U+FFFD 替换符）换成 '?'，
    避免 print 时 UnicodeEncodeError 直接崩脚本。

    守卫输出是从子进程按 utf-8 读来的、可能夹带坏字节（解码时 errors="replace" 会把坏字节
    变成 U+FFFD）。**只用于打印**：同一份原始 out 仍拿去和注册表的 expect 文案做匹配，不受
    影响。
    """
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    if enc.lower().replace("-", "") == "utf8":
        return text  # 已经是 UTF-8 终端（CI / 新 PowerShell），U+FFFD 编得出，无需替换
    buf: list[str] = []
    for ch in text:
        try:
            ch.encode(enc)
            buf.append(ch)
        except UnicodeEncodeError:
            buf.append("?")
    return "".join(buf)


ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
LOG_DIR = ROOT / "tools" / "testdata" / "logs"

PY = sys.executable
NODE = shutil.which("node")

ARTIFACT = "web/workers/analysis-engine.generated.ts"
FLIGHT_MAP = "web/components/LogFlightMap.tsx"

# 守卫的两种"层"：产物侧真执行编译产物（慢、要科学栈、要真实日志），
# 界面侧只扫源码（快、无依赖）。
#
# 第三个字段是**怎么从输出里数出"红了几条"**——这一步必须按各守卫自己的格式来，
# 不能统一用"标记在不在输出里"：`test-issue-filer.mjs` 把**通过的**检查名也打印出来
# （`  ok    <名字>`），于是"别的守卫的那句话也在输出里"会把全绿的那几条误判成牵连
# （第一版就是这么写的，四条界面侧变异全部误报"牵连 3 条"）。
GUARDS = {
    "artifact": (
        [PY, "tools/engine/check_engine_pyodide.py"],
        ROOT,
        "产物侧（check_engine_pyodide）",
        "prose",
    ),
    "ui": ([NODE, "scripts/test-issue-filer.mjs"], WEB, "界面侧（test-issue-filer）", "fail-lines"),
    "hygiene": ([PY, "tools/common/check_hygiene.py"], ROOT, "卫生检查（check_hygiene）", "fail-lines"),
    # 引擎纯度：只扫 knowledge/engine/ 的源码文本，无依赖、无网络、不需要日志 —— 快，所以每次都跑
    "engine": ([PY, "tools/engine/check_engine_purity.py"], ROOT, "引擎纯度（check_engine_purity）", "fail-lines"),
    # pnpm 转发脚本：只扫 package.json 的 scripts 文本 —— 快、无依赖、不需要日志
    "pnpm-filter": ([PY, "tools/common/check_pnpm_filter.py"], ROOT, "pnpm 转发脚本（check_pnpm_filter）", "fail-lines"),
    # 面板解析器：只跑纯函数（内置假 manifest），无浏览器无日志 —— 快
    "panel-resolver": (
        [NODE, "--experimental-strip-types", "scripts/check-panel-resolver.mjs"],
        WEB,
        "面板解析器（check-panel-resolver）",
        "fail-lines",
    ),
    # APM 解析器版本：解析逻辑的 AST 指纹 vs 手维护的 parserVersion —— 快、无依赖、不需要日志
    "apm": (
        [PY, "tools/engine/guard_apm_parser_version.py"],
        ROOT,
        "APM 解析器版本（guard_apm_parser_version）",
        "fail-lines",
    ),
    # 拼接命名：knowledge/engine/ 的片段顶层名字撞车 —— 只做 AST 遍历，快、无依赖
    "engine-names": (
        [PY, "tools/engine/guard_engine_names.py"],
        ROOT,
        "拼接命名（guard_engine_names）",
        "fail-lines",
    ),
    # 指南 MDX 可编译：guide 页正文请求期才编译，next build / markdownlint / build:kb
    # --check 三道门都看不见它 —— 快、无依赖、不需要日志
    "guide-mdx": ([NODE, "scripts/check-guide-mdx.mjs"], WEB, "指南 MDX 可编译（check-guide-mdx）", "fail-lines"),
    # 后台站点设置：三层取值（KV > env > 代码地板）与字段表驱动这套机制里，
    # **五种回归都不报错、只是悄悄失效**（两侧字段表不一致 = 存了读不到／页脚写死 = 改了
    # 没反应／metadata 退回静态常量 = 烙进构建产物／密钥名进客户端组件 = 明文进 SSR HTML／
    # 密钥没有消费点 = 轮换失效）。只扫源码文本，无依赖无网络，约 1s。
    "site-settings": (
        [NODE, "scripts/check-site-settings.mjs"],
        WEB,
        "站点设置（check-site-settings）",
        "fail-lines",
    ),
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
        path="tools/engine/compare_baseline.py",
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
        path="tools/engine/run_engine.py",
        # 锚点必须在**探针真走到的那条路**上：探针跑的是 `--probe-data`，进的是 `_main_probe`，
        # 而 `_main_run` 的 `return 1 if failed else 0` 它一次都不会经过——打在那里等于
        # 什么都没测（第一版就这么写的，自证因此报"守卫恒绿"）。
        old="return log.print_summary(all_results, [])",
        new="return 0",
        guard="hygiene",
        expect="坏输入必须非零退出",
        note="静态规则看不见这一半：ERROR 照打、fail 照记，最后 return 0——退出码还是 0",
    ),
    Mutation(
        name="pre-push 从阶段列表反推 --with-e2e",
        path=".githooks/pre-push",
        # 锚点必须是**单行**：_apply 按字节读写，工作区里这个文件是 CRLF，
        # 锚点里写 `\n` 会一个都匹配不到（多行锚点在这里天然失效）。
        old="    if with_e2e:",
        new='    if with_e2e and "ci" not in stages:',
        guard="hygiene",
        expect="hook 不从阶段列表反推开关",
        # 说明里的引号是给读者看的字面量，不是字符串语法，故保留原样。
        note='原形：E2E 步骤住在 ci 阶段里，所以 `"ci" not in stages` 在每条想要 E2E 的路径上都不成立——'
        "WITH_E2E=1 打印出 --stage push,ci，看着像要跑，其实两步都被静默跳过",
    ),
    # ---- 引擎侧：knowledge/engine/ 是三处共用的纯 Python（2026-09-19） ----
    #
    # 这两条守的不是"某段代码在不在"，而是**一份源码能同时跑在三个运行时里**这个前提。
    # 第 1 条是正向的（不许出现只在一处成立的东西），第 2、3 条是"前提还在"——
    # 消费者只剩一个时，这条约束就失去意义了，而它会安静地绿着。
    Mutation(
        name="knowledge/engine/ 里写一行 js 桥接",
        path="knowledge/engine/engine.py",
        old="import json",
        new="import json\nimport js",
        guard="engine",
        expect="knowledge/engine/ 是纯 Python（不碰 Pyodide / JS 桥接 / 浏览器全局）",
        note="js 是 Pyodide 注入的全局：浏览器能跑，本机 tools/engine 用 CPython 要到那一行才 NameError",
    ),
    Mutation(
        name="浏览器不再把 knowledge/engine/ 拼进 Pyodide 产物",
        path="web/scripts/build-knowledge.mjs",
        old='resolve(webRoot, "../knowledge/engine")',
        new='resolve(webRoot, "../knowledge/engine_moved")',
        guard="engine",
        expect="knowledge/engine/ 仍被浏览器与本机共用（纯 Python 的前提还在）",
        note="防「前提消失」：不再共用之后，「纯 Python」只剩「写得干净」这一层意义，而规则会继续绿着",
    ),
    Mutation(
        name="本机装配入口不再指到 knowledge/engine/",
        path="knowledge/engine/loader.py",
        # 守卫按"锚点子串在不在"判红，所以新串不得包含锚点——parents[1] 里藏着
        # "parent" 子串这种看似指走了、实则还含着锚点的写法，自证会报 always-green。
        old="ENGINE = Path(__file__).resolve().parent",
        new='ENGINE_MOVED = Path(__file__).resolve().parents[1] / "knowledge"\nENGINE = ENGINE_MOVED',
        guard="engine",
        expect="knowledge/engine/ 仍被浏览器与本机共用（纯 Python 的前提还在）",
        note="同上：本机侧消费者也消失时，这条规则该被删掉而不是继续绿。"
        "runner 与 server 都经这份装配入口取引擎，指错一层，两边一起红",
    ),
    # ---- 界面侧：站点版本只有一个读取口（2026-09-21） ----
    #
    # footer 显示「版本 + 日期」，两样都是构建期注入。这类"看不见的常量"最典型的坏法不是报错，
    # 而是**安静地过期**：手写在组件里的版本号永远绿、永远不刷新。同一形状在仓库里已经发生过
    # 一次（issue-bridge 读了一个从来没人赋值的环境变量），所以四条路各自都要证明会红。
    Mutation(
        name="构建期不再注入提交日期（footer 的日期会静默空掉）",
        path="web/next.config.ts",
        old="NEXT_PUBLIC_APP_COMMIT_DATE:",
        new="NEXT_PUBLIC_APP_COMMIT_DATE_OFF:",
        guard="ui",
        expect="next.config.ts 注入了 NEXT_PUBLIC_APP_COMMIT_DATE",
        note="注入方少一个键时页面只显示『版本未知』——不报错，也没人看得出来缺的是哪个",
    ),
    Mutation(
        name="footer 不再从唯一读取口取版本",
        path="web/components/SiteFooter.tsx",
        old='from "@/lib/site-version"',
        new="",
        guard="ui",
        expect="footer 从唯一读取口取版本",
        note="自己算一个版本串 = 第二份口径，迟早与构建期注入的那份对不上",
    ),
    Mutation(
        name="footer 取到了版本却不再渲染",
        path="web/components/SiteFooter.tsx",
        old="{versionLabel}",
        new='{"v0.0.0"}',
        guard="ui",
        expect="footer 把版本串渲染出来",
        note="写死的版本号不会报错，只会安静地过期——正是本节要挡的那类错",
    ),
    Mutation(
        name="又有别处直接读了一次环境变量",
        path="web/lib/issue-bridge.ts",
        old="version: SITE_VERSION.version,",
        new='version: process.env.NEXT_PUBLIC_APP_VERSION ?? "",',
        guard="ui",
        expect="别处不许直接读 NEXT_PUBLIC_APP_*（读取口只许有一个）",
        note="原形就是这一行：读了两年一个从没被赋值的变量，上报里的版本恒为空串",
    ),
    Mutation(
        name="提交时间退回只精确到天",
        path="web/next.config.ts",
        old="--date=format-local:%Y-%m-%d %H:%M:%S",
        new="--date=short",
        guard="ui",
        expect="提交时间精确到秒（format-local 带时分秒）",
        note="只到天的日期在一天内多次构建时分不清谁新谁旧，页脚会安静地变回老样子",
    ),
    # ---- 界面侧：指南页栏宽跟随内容、栏间距不许回到 40px（2026-09-21） ----
    #
    # 这一节的坏法不报错、不白屏，只是"看起来有点空"：侧栏写死 192px 而中文条目只占 138px，
    # 多出来的 54px 混在外层间距里，量出来是「侧栏→正文」94px；两道 40px 间距再把正文从
    # 768px 上限压到 624px。没人会主动去查，所以五条路各自都要证明会红。
    Mutation(
        name="侧栏宽度又被写死成 w-48（中文下凭空多出 54px 死白）",
        path="web/components/GuideSidebar.tsx",
        old="w-max min-w-36 max-w-48",
        new="w-48 min-w-36 max-w-48",
        guard="ui",
        expect="侧栏宽度跟导航文字走（w-max，不许写死）",
        note="原形就是这一行：写死的宽度跟条目名长短无关，中文下侧栏内部空一大块",
    ),
    Mutation(
        name="侧栏没了上限兜底（条目名变长时会反过来挤正文）",
        path="web/components/GuideSidebar.tsx",
        old="max-w-48 shrink-0",
        new="shrink-0",
        guard="ui",
        expect="侧栏宽度有上限兜底（max-w-*，条目名变长时不许挤正文）",
        note="只跟内容走而没有上限，等于把「以后条目名变长」的风险直接甩给正文栏宽",
    ),
    Mutation(
        name="侧栏没了下限兜底（条目名一短就被压成一条）",
        path="web/components/GuideSidebar.tsx",
        old="min-w-36 max-w-48",
        new="max-w-48",
        guard="ui",
        expect="侧栏宽度有下限兜底（min-w-*，条目名再短也留出可点宽度）",
        note="下限不是装饰：侧栏窄到只剩文字宽时，那道左边框会贴着链接，可点区域也跟着缩",
    ),
    Mutation(
        name="侧栏与正文的间距又回到 40px",
        path="web/app/[locale]/guide/layout.tsx",
        old="lg:flex-row lg:gap-8",
        new="lg:flex-row lg:gap-10",
        guard="ui",
        expect="侧栏与正文的间距收到 lg:gap-8",
        note="page-shell 内容宽只有 1120px，两道 40px + 224px 右目录会把正文压到 624px",
    ),
    Mutation(
        name="正文与右目录的间距又回到 40px",
        path="web/components/GuideArticle.tsx",
        old='className="flex min-w-0 gap-8"',
        new='className="flex min-w-0 gap-10"',
        guard="ui",
        expect="正文与右目录的间距收到 gap-8",
        note="同上：省下的 8px 归正文，正文越接近 max-w-3xl，右列目录越不像在空转",
    ),
    # 右目录的回潮有四种单点形态，各拆一条变异——合在一条里会同时打红四条检查，
    # 「恰好一条红」的判据就没法用了（第一版就是这么写的，自证直接 FAIL）。
    Mutation(
        name="右目录宽度又写死 w-56",
        path="web/components/GuideOutline.tsx",
        old="hidden w-max min-w-28 max-w-56 shrink-0 lg:block",
        new="hidden w-56 min-w-28 max-w-56 shrink-0 lg:block",
        guard="ui",
        expect="右目录宽度跟标题文字走（w-max，不许写死）",
        note="列内死白的原形：目录文字只占 ~85px，写死 224 后右侧常年空 126px",
    ),
    Mutation(
        name="右目录没了上限兜底",
        path="web/components/GuideOutline.tsx",
        old="hidden w-max min-w-28 max-w-56 shrink-0 lg:block",
        new="hidden w-max min-w-28 shrink-0 lg:block",
        guard="ui",
        expect="右目录有上限兜底（max-w-*，标题变长时不许挤正文）",
        note="标题一长就把正文挤窄，重蹈左侧栏写死宽度的覆辙",
    ),
    Mutation(
        name="右目录没了下限兜底",
        path="web/components/GuideOutline.tsx",
        old="hidden w-max min-w-28 max-w-56 shrink-0 lg:block",
        new="hidden w-max max-w-56 shrink-0 lg:block",
        guard="ui",
        expect="右目录有下限兜底（min-w-*，边线和最短标题也有存在感）",
        note="条目极短时左边框线贴着内容缩成一条缝",
    ),
    Mutation(
        name="右目录断点退回 xl",
        path="web/components/GuideOutline.tsx",
        old="hidden w-max min-w-28 max-w-56 shrink-0 lg:block",
        new="hidden w-max min-w-28 max-w-56 shrink-0 xl:block",
        guard="ui",
        expect="右目录从 lg 就显示（xl 断点在真实浏览器踩不准，目录消失会留 176px 死白）",
        note="1280 的窗口扣掉滚动条只剩 ~1263，xl 踩不准，目录整列消失、正文右侧空 176px",
    ),
    # ---- 界面侧：两句固定文案只有一个出处（2026-09-21） ----
    #
    # 隐私承诺与免责声明原来各写各的：页脚一句、上传卡一句近似的，同一件事两份措辞。
    # 收进 lib/log-analysis-notes.ts 并统一只在上传卡渲染（页脚品牌区/底栏都已拿掉），
    # 要防的回归是"有人嫌绕远、在组件里就地手写"——那不会报错，只会让措辞悄悄分叉。
    # 四条路各自都要证明会红。
    Mutation(
        name="唯一出处的措辞被人就地改了",
        path="web/lib/log-analysis-notes.ts",
        old="日志在浏览器本地解析，原始文件不上传",
        new="日志只在本地浏览器解析，原始文件不上传",
        guard="ui",
        expect="唯一出处里定义了隐私承诺",
        note="出处本身被改而守卫仍按原句匹配 = 守卫盯着的是一句已经不存在的文案",
    ),
    Mutation(
        name="上传区不再从唯一出处取文案",
        path="web/app/[locale]/analyze/AnalyzeEntryClient.tsx",
        old='from "@/lib/log-analysis-notes"',
        new="",
        guard="ui",
        expect="上传区从唯一出处取文案",
        note="自己另写一份 = 回到两份措辞各自演化的原形",
    ),
    Mutation(
        name="上传区取到了免责声明却不再渲染",
        path="web/app/[locale]/analyze/AnalyzeEntryClient.tsx",
        old="zh={`${ANALYSIS_DISCLAIMER.zh}。`}",
        new='zh={""}',
        guard="ui",
        expect="上传区把两句话都渲染出来",
        note="导入了但没渲染 = 用户在交出日志前仍然看不到这句",
    ),
    Mutation(
        name="组件里又手抄了一份措辞（上传区标题版）",
        path="web/app/[locale]/analyze/AnalyzeEntryClient.tsx",
        old="选择或拖入 PX4 .ulg 或 ArduPilot .bin 日志，最大支持300MB",
        new="选择或拖入 PX4 .ulg 或 ArduPilot .bin 日志，最大支持300MB。日志在浏览器本地解析，原始文件不上传。",
        guard="ui",
        expect="别处不许手写这两句的字面量（措辞只许改一处）",
        note="原形就是这一类：字面量散回组件里，下一次改措辞必然漏一处",
    ),
    # ---- 界面侧：次数上限不在前端显示（2026-09-21） ----
    #
    # 上游是"匿名 3 次/天、登录 10 次/天"这几个写死的数字——上传卡、AI 解读区、
    # 「我的」页各显一次，而后台还没有配置入口。用户拍板：次数以后由后台配，前端一处都不报。
    # 要防的回归有三种形态（文案 / 数字对 / 进度条），三条路各自都要证明会红。
    Mutation(
        name="上传卡又把次数文案加回来了",
        path="web/app/[locale]/analyze/AnalyzeEntryClient.tsx",
        old="<input",
        new='<p className="mt-3 text-xs text-faint">匿名试用：3/3 次</p>\n          <input',
        guard="ui",
        expect="全站没有把额度渲染成数字/进度条的地方",
        note="回潮的第一形态：一句纯文案，没有取数也没有进度条",
    ),
    Mutation(
        name="「我的」页又把额度进度条加回来了",
        path="web/app/[locale]/me/MeClient.tsx",
        old='<div className="mt-6">',
        new=(
            '<div className="mt-6">\n'
            '        <div className="mt-2 h-2 overflow-hidden rounded-full">\n'
            "          <div style={{ width: `${Math.min((q.used / q.limit) * 100, 100)}%` }} />\n"
            "        </div>"
        ),
        guard="ui",
        expect="全站没有把额度渲染成数字/进度条的地方",
        note="回潮的第二形态：进度条——只看文案词查不出来",
    ),
    Mutation(
        name="AI 解读区又把上限印成数字对",
        path="web/components/LogReport.tsx",
        old="          生成 AI 中文报告",
        new="          生成 AI 中文报告（今日免费 `${q.limit}` 次）",
        guard="ui",
        expect="全站没有把额度渲染成数字/进度条的地方",
        note="回潮的第三形态：`/ N 次` 这种斜杠对，文案词与进度条都拦不住",
    ),
    Mutation(
        name="又有一个新界面开始消费 quota",
        path="web/components/SiteFooter.tsx",
        old="export function SiteFooter()",
        new="const quota = null;\nexport function SiteFooter()",
        guard="ui",
        expect="没有新的文件在消费 quota（回潮信号）",
        note="清单守卫的意义：新长出来的第 6 个消费点会被点名，而不是等它显示歪了才发现",
    ),
    # ---- 转发脚本：pnpm --filter 匹配不到项目时静默成功（2026-09-23） ----
    #
    # 这条的失败形态是**没有任何信号**：pnpm 匹配 0 个项目时不报错、不红、不写日志，
    # 退出码 0。11 个转发脚本（含 typecheck 与 test）就这样空跑了一段时间，
    # 于是「`pnpm typecheck` 全绿」是假绿。三条自保分支各自都要证明会红 ——
    # 第四条（找不到根 package.json）要删文件，脚本做不到，只能留给代码审查。
    Mutation(
        name="转发脚本的 filter 又退回裸目录名 web（静默空跑的原形）",
        path="package.json",
        old='"web:dev": "pnpm --filter ./web dev"',
        new='"web:dev": "pnpm --filter web dev"',
        guard="pnpm-filter",
        expect="filter-value-resolves",
        note="原形：`web` 不是包名（web/package.json 的 name 是 nextpilot-skill-mcp），"
        "不带 `./` 前缀时 pnpm 按包名匹配 → 匹配 0 个项目 → rc=0 无输出",
    ),
    Mutation(
        name="守卫的 filter 正则被改坏（一个都扫不到，门被架空）",
        path="tools/common/check_pnpm_filter.py",
        old='FILTER_RE = re.compile(r"pnpm\\s+--filter[= ]\\s*(\\S+)")',
        new='FILTER_RE = re.compile(r"pnpm\\s+--no-such-flag[= ]\\s*(\\S+)")',
        guard="pnpm-filter",
        expect="filter-scan-found-any",
        note="防「门还在吗」：正则跟不上写法（比如大家换成 `pnpm -C web`）之后 11 条一条都扫不到，而守卫会一直绿",
    ),
    Mutation(
        name="workspace 成员目录写错（包名集合残缺，判定不可信）",
        path="pnpm-workspace.yaml",
        old='    - "web"',
        new='    - "web-typo"',
        guard="pnpm-filter",
        expect="workspace-members-nonempty",
        note="防「判空分支是死代码」：解析不出成员目录时守卫会悄悄按残缺的包名集合下结论",
    ),
    # ---- 界面侧：地图左上角「一条按钮 + 一条色带」的形态（2026-09-23） ----
    #
    # 这一节守的是**布局形态**而不是像素值：像素值得起浏览器量（分钟级），进不了秒级检查。
    # 能静态锁的是"会不会回潮"——复位按钮另起 .leaflet-bar 就与缩放条之间 10px 空档 +
    # 2px 双边框；按钮竖排会把色带顶端往下压 ~60px；色带容器少了边界就会被内容挤成 2px。
    Mutation(
        name="复位按钮又裂成第二个 .leaflet-bar（与缩放条之间留 10px 空档）",
        path=FLIGHT_MAP,
        old='const btn = L.DomUtil.create("a", "");',
        new='L.DomUtil.create("div", "leaflet-bar leaflet-control");\n            const btn = L.DomUtil.create("a", "");',
        guard="ui",
        expect="复位按钮不另起 .leaflet-bar（另起就与缩放条留 10px 空档 + 2px 双边框）",
        note="原形：Leaflet 给每个 .leaflet-control 都加 margin-top 10px，两个 bar 还各有 1px 边框",
    ),
    Mutation(
        name="复位按钮不再挂进缩放条（取容器 → append 这条链断了）",
        path=FLIGHT_MAP,
        old="zoomBar.appendChild(btn);",
        new="",
        guard="ui",
        expect="复位按钮挂在缩放条里（zoomControl 取容器后 appendChild）",
        note=(
            "判据守的是这条链本身：appendChild 一消失，按钮就再也不会出现在缩放条里，"
            "三个图标立刻裂成两组（只改 append 的目标不行——判据不看目标）"
        ),
    ),
    Mutation(
        name="按钮行退回竖排（色带顶端跟着下移 60px）",
        path=FLIGHT_MAP,
        old='zoomBar.style.display = "flex";',
        new='zoomBar.style.display = "block";',
        guard="ui",
        expect="按钮行是横排的（给缩放条设了 display:flex，分隔线改成 border-right）",
        note="竖排吃掉 ~94px 高，色带只能从 104 往下铺；横排省下的 60 多 px 全在色带上",
    ),
    Mutation(
        name="色带容器丢了 bottom-0（没上边界，会被内容挤成 2px）",
        path=FLIGHT_MAP,
        old='className="pointer-events-none absolute bottom-0 left-2.5 top-[48px] z-[700] flex w-3 flex-col"',
        new='className="pointer-events-none absolute left-2.5 top-[48px] z-[700] flex w-3 flex-col"',
        guard="ui",
        expect="高度色带同时写了 top-[…px] 与 bottom-0（缺 top 就没有上边界，会被挤成 2px）",
        note="只写 bottom-0 时 flex 容器按内容高度收缩，实测色带只剩 2px——整条看不见",
    ),
    Mutation(
        name="色带不再与按钮行左对齐（退回 left-14）",
        path=FLIGHT_MAP,
        old='className="pointer-events-none absolute bottom-0 left-2.5 top-[48px] z-[700] flex w-3 flex-col"',
        new='className="pointer-events-none absolute bottom-0 left-14 top-[48px] z-[700] flex w-3 flex-col"',
        guard="ui",
        expect="高度色带与按钮行左对齐、不挡地图操作（left-2.5 + pointer-events-none）",
        note="left-14 是改版前的写法：色带悬在按钮行右侧，看着像两个不相干的东西",
    ),
    Mutation(
        name="高度标签又压回色带上（left-full 改回 left-0）",
        path=FLIGHT_MAP,
        old='className="absolute left-full top-0 ml-1 whitespace-nowrap rounded bg-surface-2/85 px-1 text-[10px] text-muted"',
        new='className="absolute left-0 top-0 ml-1 whitespace-nowrap rounded bg-surface-2/85 px-1 text-[10px] text-muted"',
        guard="ui",
        expect="两个高度标签挂在色带右侧（left-full，不遮渐变）",
        note="只改两个里的一个就足够红——判据数的是 left-full 的个数；条只有 12px 宽，数字压上去就盖住渐变",
    ),
    # ---- 界面侧：静态守卫引用的路径必须真的存在（2026-09-23） ----
    #
    # 失效形态不是"报错"，而是**守卫集体失效还伪装成通过**：i18n 给所有页面套了一层
    # [locale]，写死的路径一次性全废，readFileSync 抛 ENOENT 让脚本死在 §[17]，
    # 后面几节一条没跑，CI 只看得见"进程非零退出"。
    #
    # 变异特意用"新增一个指向不存在文件的 read"，而不是"把已有路径改回旧写法"：后者会
    # 让 §[17] 同时红（它有一条"共用集合非空"的判空），「恰好一条红」的判据就废了，
    # 反而看不出根因只有一个。
    Mutation(
        name="新增一节时把路径写错（兜底汇总要抓到）",
        path="web/scripts/test-issue-filer.mjs",
        # 插在节标题那行之后（顶层语句），不能插进 check( 的实参列表——那会先撞上 SyntaxError，
        # 脚本连一条检查都跑不到（第一版就是这么写的，表现为"红了但理由不对"）。
        old=r'console.log("\n[23] 静态守卫引用的源码路径都存在（路径失效不许把后面整段带走）");',
        new=(
            r'console.log("\n[23] 静态守卫引用的源码路径都存在（路径失效不许把后面整段带走）");'
            '\nread("../components/MovedByI18n.tsx"); // 变异：再写一次 i18n 迁移前的路径'
        ),
        guard="ui",
        expect="静态守卫引用的路径都指向真实文件",
        note="read / readWeb 把坏路径登记进 MISSING_PATHS 而不是抛异常；末节负责把「哪几个不存在」说清楚",
    ),
    # ---- 面板解析器：实例数与区间展开（2026-09-24） ----
    # 这几条改坏时**前端不会崩**——只是少画几张图、或者图例分不清是哪一路传感器。
    # 没有任何运行时信号，所以每条都要有一个"先红"的证明。
    Mutation(
        name="数实例时又拿采样点数筛一遍",
        path="web/lib/panel-resolver.ts",
        old="        .filter((t) => t.topic === topic)",
        new="        .filter((t) => t.topic === topic && t.n > 1)",
        guard="panel-resolver",
        expect="数实例不看采样点数",
        note="n 是采样点数：只采到一个点的实例会被丢掉，全是单点时整组图直接消失",
    ),
    Mutation(
        name="展开的线不写实例号（图例分不清哪一路）",
        path="web/lib/panel-resolver.ts",
        old="                    series.push({ label: ref, style: p.style, color: p.color });",
        new="                    series.push({ label: p.label, style: p.style, color: p.color });",
        guard="panel-resolver",
        expect="区间引用同图展开成多条线",
        note="多实例同图时三条线都叫 accel[:].x，看图的人分不出是哪路 IMU",
    ),
    Mutation(
        name="拆图时也展开区间（每张图把全部实例都画了）",
        path="web/lib/panel-resolver.ts",
        old="            const pendings = planChild(child, m, inst, !out.split_by_instance);",
        new="            const pendings = planChild(child, m, inst, true);",
        guard="panel-resolver",
        expect="拆图时区间引用不再展开",
        note="拆图要的是「每张图一个实例」，再展开一次就每张图都是三条线",
    ),
    Mutation(
        name="实例数不齐时按最短的那条砍齐（不是取并集）",
        path="web/lib/panel-resolver.ts",
        old="    return all.size === 0 ? null : [...all].sort((a, b) => a - b);",
        new=(
            "    return pendings.filter((p) => p.spread).map((p) => p.spread.instances)"
            ".sort((a, b) => a.length - b.length)[0] ?? null;"
        ),
        guard="panel-resolver",
        expect="实例数不齐取并集并给告警",
        note="gyro 只有实例 0 就把 accel 的三个实例砍成 1 个——少的那边不该拖累多的那边",
    ),
    Mutation(
        name="缺的实例不再给提示（那一路静默消失）",
        path="web/lib/panel-resolver.ts",
        old="                        panelWarnings.push(",
        new="                        void 0 && panelWarnings.push(",
        guard="panel-resolver",
        expect="实例数不齐取并集并给告警",
        note="continue 还在（那一条线照样不画），但没人告诉用户为什么图上少了线",
    ),
    Mutation(
        name="构建期正则退回只认一维下标",
        path="web/scripts/lib/rule-expr.mjs",
        old=r"        /^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.((?:[a-z][a-z0-9_]*\.)*[a-z][a-z0-9_]*)(?:\[(\d+(?:,\d+)?)\])?$/.exec(",
        new=r"        /^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.((?:[a-z][a-z0-9_]*\.)*[a-z][a-z0-9_]*)(?:\[(\d+)\])?$/.exec(",
        guard="panel-resolver",
        expect="构建期放行二维下标",
        note="field[i,j]（i 行 j 列）过不了校验，作者只能退回写死",
    ),
    # ---- APM 解析器版本：解析逻辑变了就要升 parserVersion（2026-09-24） ----
    #
    # `.bin` 侧的解析器是自研的，报告头的 parserVersion 是一个**手维护常量** —— 它不像
    # pyulog 那个随环境变，所以也**不会**因为换机器而自己动。坏法不是报错，而是"报告头写着
    # 同一个版本号，两次解析出来的数含义已经不同"：冻结基线只会说"结论变了"，分不清是规则
    # 改了还是解析器改了。三条路各自都要证明会红。
    Mutation(
        name="改了缩放系数却不升 parserVersion（报告头看不出解析换了）",
        path="knowledge/engine/providers/ardupilot.py",
        old='_SCALED = {"c": 0.01, "C": 0.01, "e": 0.01, "E": 0.01, "L": 1e-7}',
        new='_SCALED = {"c": 0.01, "C": 0.01, "e": 0.01, "E": 0.01, "L": 1e-6}',
        guard="apm",
        expect="解析逻辑变了就要升 parserVersion（并重冻基线）",
        note="原形就是这一类：缩放系数改了，经纬度直接差一个数量级，而报告头还是 1.0.0",
    ),
    Mutation(
        name="ApmProvider 被改名（指纹覆盖为 0，比对空转）",
        path="knowledge/engine/providers/ardupilot.py",
        old="class ApmProvider:",
        new="class ApmProviderV2:",
        guard="apm",
        expect="解析逻辑变了就要升 parserVersion（并重冻基线）",
        note="防「判空分支是死代码」：类一改名指纹就只剩常量表，守卫会安静地绿着",
    ),
    Mutation(
        name="这道门从 checklist.yml 里被摘掉（没人再跑它）",
        path="tools/ci/checklist.yml",
        old='      - id: "guard-apm-parser-version"',
        new="",
        guard="apm",
        expect="这道门还挂在 push 阶段（checklist.yml 里有这一步）",
        note="check_all.py 只按清单转发 —— 清单里没它，这份检查就再也不会被执行",
    ),
    # ---- knowledge/engine/ 拼接命名空间：顶层名字撞车 = 后者静默覆盖前者（2026-09-24） ----
    #
    # 片段被拼成**一份**脚本，所以"两个文件各写一个 `_MAGIC`"不是风格问题，是运行期
    # 静默覆盖。`_MAGIC` 真被踩过一次。三条：撞名本体、判空、门还在。
    Mutation(
        name="新 provider 顶层忘了带格式前缀（那次 _MAGIC 事故的原形）",
        path="knowledge/engine/providers/ardupilot.py",
        old='_APM_MAGIC = b"\\xa3\\x95"',
        new='_MAGIC = b"\\xa3\\x95"',
        guard="engine-names",
        expect="knowledge/engine/ 顶层名字不撞车",
        note="px4.py 顶层也有 `_MAGIC`：拼完之后 APM 的魔数把 ULog 的顶掉，且不报错",
    ),
    Mutation(
        name="拼接片段清单被清空（撞名规则会因为没东西可比而恒绿）",
        path="tools/engine/guard_engine_names.py",
        old='FRAMEWORK = ("operators.py", "engine.py")',
        new="FRAMEWORK = ()",
        guard="engine-names",
        expect="拼接片段没走空",
        note="判空不是摆设：片段被改名或搬空之后，撞名比对必须自己喊出来，而不是安静地变成 0 处冲突",
    ),
    Mutation(
        name="这道门从 checklist.yml 里被摘掉（没人再跑它）",
        path="tools/ci/checklist.yml",
        old='      - id: "guard-engine-names"',
        new="",
        guard="engine-names",
        expect="这道门挂在统一入口上",
        note="check_all.py 只按清单转发 —— 清单里没它，这份检查就再也不会被执行",
    ),
    # ---- 内容侧：guide 页正文必须能过 MDX 编译（2026-09-26） ----
    #
    # 正文由 next-mdx-remote 在**请求期**编译：next build 不碰它、markdownlint 只管风格、
    # build:kb --check 只比对生成产物。知识源描述里的格式占位符（{invalid_frac:.0%}）
    # 一旦没转义就混进正文，会一路绿到用户打开页面才 500 —— 2026-09-26 实际发生。
    # 反例打在手写的 index.mdx 上：生成文件的一致性另有 build:kb --check 管，两层各管各的。
    Mutation(
        name="指南正文混进裸花括号（生成器转义被绕过的原形）",
        path="web/content/guide/index.mdx",
        old="下面用三步走通平台的三个入口。",
        new="下面用三步走通平台的三个入口。\n\n知识源描述反例：{invalid_frac:.0%} 样本。",
        guard="guide-mdx",
        expect="mdx-compile",
        note="airspeed.yaml 描述带 {invalid_frac:.0%}，rule-catalogue.mdx 一打开就 500",
    ),
    Mutation(
        name="指南 MDX 这道门从 checklist.yml 里被摘掉（没人再跑它）",
        path="tools/ci/checklist.yml",
        old='      - id: "check-guide-mdx"',
        new="",
        guard="guide-mdx",
        expect="mdx-wiring",
        note="check_all.py 只按清单转发 —— 清单里没它，这份检查就再也不会被执行",
    ),
    # ---- 后台站点设置：五种「不报错、只是悄悄失效」的回归（2026-09-27） ----
    #
    # 这套机制的坏法有一个共同点：**构建照过、页面照开，只有管理员改了没反应**。
    # 字段表两侧对不上（存了读不到）、页脚写死（改了不变）、metadata 退回静态常量
    # （烙进构建产物）、密钥名进客户端组件（明文进 SSR HTML）、密钥没有消费点
    # （轮换失效）——没有一条会抛异常，所以只能静态拦。
    Mutation(
        name="边缘侧字段表的 kind 与 Node 侧对不上（存进去了读不出来）",
        path="web/functions/_lib/settings-schema.js",
        old='    { key: "icp", label: "备案号", kind: "text", optional: true },',
        new='    { key: "icp", label: "备案号", kind: "url", optional: true },',
        guard="site-settings",
        expect="settings-schema",
        note="边缘按自己那份校验落库、Node 按自己那份回落渲染，kind 不一致时 API 回 ok 而页面读不到值",
    ),
    Mutation(
        name="页脚 props 少接一项（那一项就永远停在默认值上）",
        path="web/components/SiteFooter.tsx",
        old="export function SiteFooter({ footerCopyright, footerTagline, sourceUrl, icp }: SiteFooterProps) {",
        new="export function SiteFooter({ footerCopyright, footerTagline, sourceUrl }: SiteFooterProps) {",
        guard="site-settings",
        expect="settings-footer-props",
        note="客户端组件读不到 KV，没接进来的那项后台改了也没用（备案号就是这么一项）",
    ),
    Mutation(
        name="页脚把仓库地址写回组件里（后台改链接不生效）",
        path="web/components/SiteFooter.tsx",
        old="export interface SiteFooterProps {",
        new='const SOURCE_URL_FALLBACK = "https://gitee.com/nextpilot/nextpilot-skill-mcp";\nexport interface SiteFooterProps {',
        guard="site-settings",
        expect="settings-footer-url",
        note="改托管平台时顺手把链接贴回组件是最容易回潮的一种：代码看着完全正常，后台那条设置成了摆设",
    ),
    Mutation(
        name="根 layout 改回 generateMetadata（首页退回动态渲染、CDN 零缓存）",
        path="web/app/layout.tsx",
        old="export const metadata: Metadata = {",
        new=(
            "export async function generateMetadata(): Promise<Metadata> {\n"
            "    return metadata;\n"
            "}\nexport const metadata: Metadata = {"
        ),
        guard="site-settings",
        expect="settings-static-metadata",
        note="根 layout 一旦导出 generateMetadata（异步），Next.js 把整棵路由树判为动态渲染："
        "首页失去静态化，TTFB 从几十毫秒退化到 ~1.5s 且 CDN 无从缓存。2026-09-27 就是这么坏的",
    ),
    Mutation(
        name="渲染路径重新读运行期设置（那一页退回动态渲染）",
        path="web/app/sitemap.ts",
        old="export default function sitemap(): MetadataRoute.Sitemap {\n    const baseUrl = SITE_URL;",
        new=("export default function sitemap(): MetadataRoute.Sitemap {\n    const baseUrl = getSiteSettings();"),
        guard="site-settings",
        expect="settings-render-path",
        note="站点信息改为「环境变量 + 重新部署」后，任何渲染期读 KV 都会把那一页拽回动态渲染，"
        "首页静态化前功尽弃。只有纯请求期 API 路由（白名单）才允许读",
    ),
    Mutation(
        name="next-intl 忘登记 locale（整棵子树悄悄退回动态渲染）",
        path="web/app/[locale]/layout.tsx",
        old="    setRequestLocale(locale);",
        new="    void locale;",
        guard="site-settings",
        expect="settings-static-locale",
        note="构建照样成功、页面照样能开，只是 ● (SSG) 变回 ƒ (Dynamic)、CDN 零缓存。这种「静默退化」没有守卫就永远没人发现",
    ),
    Mutation(
        name="首页忘了登记 locale（只剩 layout 登记，首页照样动态化）",
        path="web/app/[locale]/page.tsx",
        old="    setRequestLocale(locale);",
        new="    void locale;",
        guard="site-settings",
        expect="settings-static-locale",
        note="判据必须覆盖到 page.tsx：只查 layout 的话，「layout 有、page 漏」这种半边坏法会漏网",
    ),
    Mutation(
        name="SITE_URL 去掉生产兜底（漏配变量就变 localhost，页面看不出异常）",
        path="web/lib/site-config.ts",
        old='    (process.env.NODE_ENV === "production" ? "https://skill.nextpilot.org" : "http://localhost:3000")',
        new='    "http://localhost:3000"',
        guard="site-settings",
        expect="settings-site-url-fallback",
        note="SITE_URL 是唯一「默认值 ≠ 线上值」的字段：站名/描述/页脚漏配看不出来，"
        "它漏配则 sitemap/robots/canonical/og:url 全指向 localhost —— 等于主动提交死链。"
        "2026-09-28 真实发生，且此前被「sitemap 走 KV 取值」掩盖着",
    ),
    Mutation(
        name="密钥字段名进了客户端组件（明文被序列化进 SSR HTML）",
        path="web/components/SiteHeader.tsx",
        old="export function SiteHeader() {",
        new='export const SMTP_FIELD = "smtpPass";\nexport function SiteHeader() {',
        guard="site-settings",
        expect="settings-secret-client",
        note="客户端组件的 props 会进 SSR 的 HTML：字段名在那儿出现，等于密钥明文能被查看源代码拿走",
    ),
    Mutation(
        name="消费点把 key 改名成 V2 而字段表没跟着改（存的是 A、读的是 B）",
        path="web/functions/api/explain.js",
        old='    const apiKey = await getSecret(env, "deepseekApiKey", "DEEPSEEK_API_KEY");',
        new='    const apiKey = await getSecret(env, "deepseekApiKeyV2", "DEEPSEEK_API_KEY");',
        guard="site-settings",
        expect="settings-secret-wiring",
        note="管理员以为轮换过了，实际走的还是环境变量里那份。判据必须整词匹配：子串匹配会把 xxxV2 也算成有人在读",
    ),
    Mutation(
        name="站点设置这道门从 checklist.yml 里被摘掉（没人再跑它）",
        path="tools/ci/checklist.yml",
        old='      - id: "check-site-settings"',
        new="",
        guard="site-settings",
        expect="settings-wiring",
        note="check_all.py 只按清单转发 —— 清单里没它，这份检查就再也不会被执行",
    ),
]


class AnchorError(RuntimeError):
    """锚点对不上——脚本写坏了，不是守卫坏了。"""


# 当前**已被变异、还没还原**的那个文件。信号兜底要用它，所以放在模块级而不是闭包里。
_PENDING: tuple[Path, bytes] | None = None


def _restore_pending() -> None:
    """Restore the file in _PENDING byte-for-byte."""
    global _PENDING
    if _PENDING is None:
        return
    path, snapshot = _PENDING
    _PENDING = None
    try:
        path.write_bytes(snapshot)
        log.warning(f"\n[interrupted] restored {path.name}")
    except OSError as exc:
        log.warning(f"\n[interrupted] restore {path.name} failed: {exc} -- fix it manually")


def _install_signal_guard() -> None:
    """被中断时也要还原 —— `finally` 挡不住 SIGTERM / Ctrl-C。

    `finally` 只在异常/正常返回时执行；SIGTERM 的默认处理是**立刻终止进程**，不走 finally。
    2026-09-19 真踩到了：全量自证跑到第 17 条被超时杀掉，`run_engine.py` 的
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

    第三种失败模式：**目标文件不存在**（注册表里的路径过期）。为什么也要当场报错而不是
    让 `read_bytes` 抛 `FileNotFoundError`：那个异常不会命中调用点的 `except AnchorError`，
    整轮直接崩，而崩掉的位置离真正的原因（某条变异的路径漏了一段，如 `[locale]`）很远。
    更糟的是它在"没跑到那层"时完全不显形——注册表可以安静地烂很久。
    """
    if not path.is_file():
        raise AnchorError(f"变异目标不存在：{path}（路径过期后这条变异无法自证，它自称证明的那条守卫其实一次都没被验过）")
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

    `PYTHONIOENCODING=utf-8` 确保子进程的 Python 也用 UTF-8 写 stdout/stderr，而不是
    Windows 默认的 GBK。否则子进程写 GBK、父进程用 UTF-8 读 = 满屏乱码。
    """
    argv, cwd, _, _ = GUARDS[key]
    env = {**_os.environ, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.run(
        [str(x) for x in argv],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
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
      **Python 侧走 `_logging.print_check` 的那几层**（check_hygiene / check_engine_purity /
      check_pnpm_filter / guard_apm_parser_version）每行都以 `| ` 起头，形态是
      `| Detail: FAIL <名字>  -> <补充>` 与汇总里的 `|   [FAIL ] <名字>` —— 正则一并认，
      别把前缀支持删掉（2026-09-24 漏了它，四层 Python 守卫的自证集体失效了）。
      **因此被解析的守卫有一条格式契约**：它的总结行不要写成 `FAIL <名字>`（第一版 check_hygiene
      的 `FAIL 1 项卫生检查未过` 就被当成了检查名，六条变异全报"牵连 1 条"）。写成 `N 项未过` 这种。
    - `prose`（check_engine_pyodide.py）：失败时打印一段人话再 `return 1`，没有统一前缀——
      只能拿注册表里的文案去对，但**产物侧的文案只在失败时才打印**，所以这么对是准的。
    """
    kind = GUARDS[key][3]
    if kind == "fail-lines":
        names = set()
        # 三种行形态都要认（2026-09-24 修）：
        #   `  FAIL  <名字>  -> <补充>`           -- JS 守卫（test-issue-filer.mjs）直接打印
        #   `| Detail: FAIL <名字>  -> <补充>`    -- Python 守卫走 _logging.print_check
        #   `|   [FAIL ] <名字>`                  -- _logging.print_summary 的汇总行
        #
        # 后两种此前**一条都数不出来**：`_logging.print_check` 的每行都以 `| ` 起头，
        # 而这里的正则要求 FAIL 紧贴行首（只认第一种形态）。后果不是报错，而是四层
        # Python 守卫（hygiene / engine / pnpm-filter / apm）的每条变异都报
        # "red but wrong reason: red=['(unable to count)']" —— 自证集体失效却看着在跑。
        # `Result:  FAIL` 那一行刻意识别不到：它没有名字，算进来只会变成一条假牵连。
        for line in out.splitlines():
            m = _re.match(r"\s*(?:\|\s*)?(?:Detail:\s*)?(?:\[FAIL\s*\]|FAIL)\s+(.*?)(?:\s+(?:->|→)\s+.*)?$", line)
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
    ap.add_argument("--list", action="store_true", help="print registry only")
    ap.add_argument("--only", default="", help="only run mutations whose name contains this string")
    ap.add_argument("--guard", default="", help=f"only run mutations for one guard layer: {' / '.join(sorted(GUARDS))}")
    ap.add_argument("--skip-baseline", action="store_true", help="skip baseline (debug only; don't use normally)")
    args = ap.parse_args(argv[1:])

    if args.guard and args.guard not in GUARDS:
        log.error(f"FAIL --guard={args.guard!r} is not a known guard layer: {' / '.join(sorted(GUARDS))}")
        return 1

    picked = list(MUTATIONS)
    if args.guard:
        picked = [m for m in picked if m.guard == args.guard]
    if args.only:
        picked = [m for m in picked if args.only in m.name]
    if (args.only or args.guard) and not picked:
        log.error(f"FAIL --only={args.only!r} --guard={args.guard!r} matched zero mutations")
        return 1

    if args.list:
        log.info(f"Registry ({len(picked)} entries):")
        for i, m in enumerate(picked, 1):
            log.info(f"  [{i:>2}] {_safe(m.name)}")
            log.info(f"       {m.path}")
            log.info(f"       guard {GUARDS[m.guard][2]} -> expected red on: {m.expect}")
            if m.note:
                log.info(f"       why: {_safe(m.note)}")
        return 0

    log.info(f"=== Guard self-proof ({len(picked)} mutations, each must turn its guard red) ===")
    blocked = _missing_tools()

    # Baseline: run each guard, must be all-green before mutating
    usable: set[str] = set()
    if not args.skip_baseline:
        for key in sorted({m.guard for m in picked}):
            label = GUARDS[key][2]
            if key in blocked:
                log.info(f"\n  baseline: {label}")
                log.warning(f"SKIP {blocked[key]}")
                continue
            code, out = _run_guard(key)
            if code != 0:
                log.info(f"\n  baseline: {label}")
                log.error("FAIL baseline is red -- fix it first (can't tell who turned red after mutation):")
                for ln in out.splitlines()[-25:]:
                    log.error("  " + _safe(ln))
                return 1
            usable.add(key)
            log.info(f"\n  baseline: {label}")
            log.info("OK baseline green")
    else:
        usable = {m.guard for m in picked} - set(blocked)

    failures: list[str] = []
    skipped: list[str] = []
    ran: dict[str, int] = {}
    touched = sorted({m.path for m in picked})
    dirty_before = _porcelain(touched)

    for i, m in enumerate(picked, 1):
        log.info(f"\n--- [{i}/{len(picked)}] {_safe(m.name)}")
        if m.guard not in usable:
            log.warning(f"SKIP guard unavailable -- {blocked.get(m.guard, 'see above')}")
            skipped.append(_safe(m.name))
            continue
        if m.note:
            log.info(f"   guards: {_safe(m.note)}")
        path = ROOT / m.path
        try:
            snapshot = _apply(path, m.old, m.new)
        except AnchorError as exc:
            log.error(f"FAIL {exc}")
            failures.append(f"{_safe(m.name)} (anchor mismatch, script bug)")
            continue
        _PENDING = (path, snapshot)
        try:
            code, out = _run_guard(m.guard)
        finally:
            _PENDING = None
            path.write_bytes(snapshot)

        if path.read_bytes() != snapshot:
            log.error(f"FAIL restore failed: {m.path} byte mismatch vs snapshot")
            failures.append(f"{_safe(m.name)} (restore failed)")
            continue

        if code == 0:
            log.error("FAIL guard did NOT turn red (exit 0) -- mutation not guarded, guard always-green")
            for ln in out.splitlines()[-15:]:
                log.error("  " + _safe(ln))
            failures.append(f"{_safe(m.name)} (guard always-green)")
            continue
        red = _failed_names(m.guard, out)
        if m.expect not in red:
            log.error(
                f"FAIL turned red, but wrong reason: red={[_safe(r) for r in sorted(red)] or ['(unable to count)']}  expected={_safe(m.expect)!r}"
            )
            for ln in out.splitlines()[-15:]:
                log.error("  " + _safe(ln))
            failures.append(f"{_safe(m.name)} (red but wrong reason)")
            continue
        if len(red) > 1:
            log.error("FAIL cross-contaminated other guards (mutation hit something else):")
            for one in sorted(red - {m.expect}):
                log.error(f"    also red: {_safe(one)}")
            failures.append(f"{_safe(m.name)} (contaminated {len(red) - 1} others)")
            continue

        ran[m.guard] = ran.get(m.guard, 0) + 1
        log.info(f"OK exactly this one red (exit {code})")
        log.info("OK restored (byte-identical to snapshot)")

    # 自证不该在仓库里留下任何痕迹。逐字节还原只证明"变异过的那个文件"复原了；万一守卫
    # 自己写了**别的**文件（生成器、缓存、产物），只有这一步看得见。
    # 注意比的是"跑前 vs 跑后"，不是"脏不脏"——仓库里经常挂着别人没提交的改动。
    for path, code in sorted(_porcelain(touched).items()):
        if dirty_before.get(path) != code:
            log.error(f"FAIL self-proof left changes in repo: {path}  {dirty_before.get(path, '  ')} -> {code}")
            failures.append(f"{path} (self-proof dirtied repo)")

    log.info("\n=== Summary ===")
    for key in sorted(ran):
        log.info(f"  OK   {GUARDS[key][2]}: {ran[key]} mutations each independently turned red")
    for name in skipped:
        log.warning(f"  SKIP {_safe(name)}")
    if failures:
        log.error(f"\nFAIL {len(failures)} mutation(s) could not self-prove:")
        for name in failures:
            log.error(f"  - {_safe(name)}")
        return 1
    log.info(f"\nOK all {sum(ran.values())} mutations self-proved (each exactly one red, restore byte-identical).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
