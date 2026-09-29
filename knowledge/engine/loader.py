"""engine 的装配入口（本地工具与 server/ 共用的一份）。

把本目录下的片段按固定顺序拼成一份脚本，替换占位符后 `exec`，得到引擎命名空间。

为什么是"拼文本 + exec"而不是正常 import：本目录的 .py 是片段，`provider` /
`run_all` / `OPERATORS` / `FORMATS` 这类名字来自别处，单文件视角下就是未定义
（`pyproject.toml` 专门为 `engine.py` / `providers/px4.py` 等片段关掉了
F821）。所以它们不是完整模块，只能按顺序拼接后一次性执行。拼接顺序的单一事实源见本目录
README「拼接顺序与桥接名字」：

    operators.py → providers/api.py → providers/*.py → engine.py

本模块不会写 sys.stdout。它给 `server/` 的 stdio MCP 服务用，stdout 是协议线，
任何多余输出都会让握手静默失败。也因此不依赖 `tools/_logging.py`：那份把 handler
挂在 `sys.stdout` 上且 `propagate=False`，是专门给命令行看的，不能出现在产品依赖里。

规则与数据只从构建产物读：compute 的老节点写法要在构建期编译成表达式，而那个编译器
只有 JS 一份（`web/scripts/lib/rule-expr.mjs`），Python 侧再实现一份必然漂移，所以不重复
实现。代价是改了 `knowledge/<族>/rules/` 要先 `pnpm web:build:kb`；本模块会检查产物
是否陈旧并当场报错（每一族的规则都查）。

接口签名是兼容契约：`build_namespace(path)` / `call(ns, code)` / `run_one(path)` /
`load_facts_payload()` 被 `tools/` 下多处脚本依赖，改名或换参等于同时改多个调用点。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# 路径一律从本文件推导，使调用方在哪都能拿到同一套源
ENGINE = Path(__file__).resolve().parent
REPO_ROOT = ENGINE.parents[1]
KN_ROOT = REPO_ROOT / "knowledge"

OPERATORS_PY = ENGINE / "operators.py"
PROVIDER_API_PY = ENGINE / "providers" / "api.py"  # provider 契约（常量表 + 自检）
# 适配器目录自动扫描，与 web/scripts/build-knowledge.mjs 同一规则：除 api.py 外全部拼接、
# 按文件名排序。加一种日志格式这里零改动，别再回到硬编码单文件（那样新适配器本地测不到）
PROVIDER_DIR = ENGINE / "providers"
PROVIDER_FILES = sorted(p for p in PROVIDER_DIR.glob("*.py") if p.name != "api.py")
ENGINE_PY = ENGINE / "engine.py"  # 引擎本体（规则框架 + 报告数据层，原 rule_engine/report_data）

# 固件族：knowledge/<族名>/ 下的一套知识，与 providers/<族名>.py 那个同名适配器配对。
# 配对规则与 web/scripts/build-knowledge.mjs 的 FAMILIES 完全一致（同一条约定，两处实现），
# 引擎侧用它判断"产物是不是比规则旧"。
FAMILY_DIRS = sorted(
    d for d in KN_ROOT.iterdir() if d.is_dir() and (d / "rules").is_dir() and (PROVIDER_DIR / (d.name + ".py")).exists()
)
FAULT_KB_JSON = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"
CHECK_SCRIPT = REPO_ROOT / "web" / "workers" / "analysis-engine.generated.ts"


def _product_text() -> str:
    """构建产物的正文（规则 / 字段单位 / 数据配置都在里面）。

    产物缺失、或比规则陈旧，都当场报错：静默使用旧产物会让"改了规则却看到旧结论"成为
    最难查的那类问题，报告看着正常，只是没反映改动。
    """
    if not CHECK_SCRIPT.exists():
        raise RuntimeError("还没有构建产物，先 pnpm web:build:kb")
    # 每一族的规则都要查（以前只查 px4：改了 APM 规则会一直用旧产物，且没人报错）
    stale = [
        f"{d.name}/{f.name}"
        for d in FAMILY_DIRS
        for f in (d / "rules").glob("*.yaml")
        if f.stat().st_mtime > CHECK_SCRIPT.stat().st_mtime
    ]
    if stale:
        raise RuntimeError("构建产物比规则陈旧（%s 改过），先 pnpm web:build:kb 再跑" % "、".join(sorted(stale)[:5]))
    return CHECK_SCRIPT.read_text(encoding="utf-8")


def _product_const(name: str) -> object:
    """取产物里 `const <name> = ...;` 的 JSON 值。"""
    m = re.search(rf"^const {name} = (.*?);$", _product_text(), re.M | re.S)
    if not m:
        raise RuntimeError(f"产物里找不到 `const {name} = ...`，先 pnpm web:build:kb")
    return json.loads(m.group(1))


def load_rules() -> list:
    """规则清单（compute 已是表达式形态，老节点写法在构建期被编译掉了）。

    各族合并：产物里是 `{log_type: [...]}`（引擎按格式取自己那一套），而字段校验、
    工作台这类"遍历全部规则"的调用方要的是扁平一份，这里按族顺序拼起来。
    """
    by_type: dict = _product_const("rules")  # type: ignore[assignment]
    return [r for fam in by_type.values() for r in fam]


def load_facts_payload() -> dict:
    """provider 拿到的那份数据配置（`const facts = {...}`），按 log_type 分组。

    要从产物取、不能本地重新装配：`facts.yaml` 与 `plot/` 下的地图声明是构建期合流的
    （预设编译成候选组、单位查表）。本地再装配一遍就是"同一份规则两处实现"，一旦不一致，
    本地的表现是"轨迹声明丢了"（`get_flight_track()` 返回 error）而浏览器没事，
    2026-09-17 与 09-18 各踩过一次，所以只认产物。
    """
    return _product_const("facts")  # type: ignore[return-value]


def load_field_units() -> dict:
    """字段单位表（`ref(..., unit=)` 的源单位），按 log_type 分组。

    它是构建期按 `meta/<tag>.json` + `meta/topic-overrides.yaml` 查好的；本地不重算
    （那要再实现一遍查表逻辑），直接读产物，保证与浏览器一致。
    没有 `meta/` 的族（APM）那份是空的，不换算，取到什么就是什么。
    """
    return _product_const("fieldUnits")  # type: ignore[return-value]


def _engine_body() -> str:
    """`engine.py` 的正文，四个占位符已替换为与构建期同款的数据。

    四样知识都是 `{log_type: ...}` 的形状：一次装进引擎，由 `detect_log_type()` 挑出
    这份日志该用的那一套（见 engine.py 的 `_LOG_TYPE_KNOWLEDGE`）。
    """
    body = ENGINE_PY.read_text(encoding="utf-8")
    entries = json.loads(FAULT_KB_JSON.read_text(encoding="utf-8"))["entries"]
    body = body.replace("__FAULT_KB__", repr(entries))
    # 阈值已随经验内联（px4-thresholds.toml 退场），无需再注入
    body = body.replace("__RULES__", json.dumps(_product_const("rules"), ensure_ascii=False))
    body = body.replace("__FACTS__", json.dumps(load_facts_payload(), ensure_ascii=False))
    body = body.replace("__FIELD_UNITS__", json.dumps(load_field_units(), ensure_ascii=False))
    return body


def assemble(log_bytes: bytes) -> dict:
    """把一段日志喂给引擎，返回执行完的命名空间。

    顺序与线上一致：算子注册表 → provider 契约 → 各格式适配器（文件名序）→ 引擎本体。
    `ulog_bytes` 是运行期注入项（浏览器 worker 与本地都走这个名字）。
    """
    script = (
        OPERATORS_PY.read_text(encoding="utf-8")
        + "\n"
        + PROVIDER_API_PY.read_text(encoding="utf-8")
        + "\n"
        + "\n".join(p.read_text(encoding="utf-8") for p in PROVIDER_FILES)
        + "\n"
        + _engine_body()
    )
    namespace: dict = {"ulog_bytes": log_bytes}
    exec(compile(script, str(ENGINE_PY), "exec"), namespace)
    return namespace


def build_namespace(path: Path) -> dict:
    """`assemble` 的路径版（签名受 8 处调用点约束，别改）。"""
    return assemble(path.read_bytes())


def call(ns: dict, code: str) -> dict:
    """在已建好的命名空间里执行一小段代码，取回它摆到 `__result` 的 JSON。"""
    exec(compile(code, "<np-call>", "exec"), ns)
    return json.loads(ns["__result"])  # type: ignore[no-any-return]


def run_one(path: Path) -> dict:
    """跑完整判定，返回报告 dict（`np_report()` 的产物）。"""
    return call(build_namespace(path), "np_report()")
