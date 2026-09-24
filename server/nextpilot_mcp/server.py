"""NextPilot 日志分析 + 知识库的本地 MCP 服务（stdio）。

工具分两类，全部只读（`ToolAnnotations(read_only_hint=True, open_world_hint=False)`）：

- **日志侧**：把 PX4 `.ulg` 喂给知识库编译出的引擎，返回**确定性**结果
  （`analyze_log` / `log_summary` / `list_events` / `query_timeseries` / `get_params`）。
- **知识侧**：读 `knowledge/` 里规则与故障库的**原文**，供解释层引用
  （`get_rule` / `get_fault` / `list_faults` / `list_checks`）。

**stdout 是协议线。** 本模块与其依赖在 import 期与运行期都不许往 stdout 写东西 ——
引擎装配入口（`knowledge/engine/loader.py`）为此刻意不依赖 `tools/_logging.py`。
所以本地冒烟测试用 `Client(mcp)` **进程内**调用，不要用 `python -c "...print..."` 那种写法去测协议。

**内核是知识库的编译产物，不是本文件**：阈值 / 建议 / 适用条件都在 `knowledge/`，
改经验只改那里（`server/` 一行不动）。本文件只做「取数 → 交给引擎 → 摆成契约形状」。
"""

from __future__ import annotations

import fnmatch
import json
import sys
from pathlib import Path
from typing import Any

import yaml
from mcp.server import MCPServer
from mcp.types import ToolAnnotations

from . import __version__
from .models import (
    CatalogEntry,
    CheckCatalog,
    EventTimeline,
    LogEvent,
    LogReport,
    LogSummary,
    ParamResult,
    TimeseriesResult,
)

# 引擎装配入口住在 knowledge/engine/ —— 产品只依赖本体，**不依赖 tools/**（那是开发工具）
_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENGINE_DIR = _REPO_ROOT / "knowledge" / "engine"
if str(_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(_ENGINE_DIR))

import loader  # noqa: E402  （路径插队后才能 import；它与 tools/ 无关）

_KP = _REPO_ROOT / "knowledge" / "px4"
_RULES_DIR = _KP / "rules"
_FAULT_KB = _KP / "fault-kb.yaml"

_READONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)

mcp = MCPServer(
    "nextpilot",
    version=__version__,
    instructions=(
        "NextPilot 的 PX4 日志分析与知识库服务。日志侧工具返回**确定性**结论（引擎按知识库里的"
        "规则算出，不是模型推断）；知识侧工具给出规则与故障库的原文与出处。"
        "解释时请引用 docUrl / 规则原文，不要自己发明根因；"
        "先调 log_summary 看清固件与机型（同一参数在不同固件版本含义可能不同），再调 analyze_log。"
    ),
)

# 同一份日志会被多个工具连续问（先 summarize 再 analyze 再取曲线）。
# 装配一次要读 5+ 个源文件再 exec，所以按 (路径, mtime) 缓存命名空间；文件被换掉即失效。
_NAMESPACES: dict[str, tuple[float, dict]] = {}


def _namespace(path: str) -> dict:
    """取这份日志的引擎命名空间（缓存命中则复用）。"""
    p = Path(path).expanduser()
    if not p.is_file():
        raise ValueError(f"日志文件不存在：{p}")
    key = str(p.resolve())
    mtime = p.stat().st_mtime
    hit = _NAMESPACES.get(key)
    if hit is not None and hit[0] == mtime:
        return hit[1]
    ns = loader.build_namespace(p)
    _NAMESPACES[key] = (mtime, ns)
    return ns


# ———————————————— 日志侧 ————————————————


@mcp.tool(annotations=_READONLY)
async def analyze_log(path: str) -> LogReport:
    """跑完整判定：返回 findings（按 severity 已排序）+ 关键数字 + 标签 + 跳过的检查。

    这是**权威结论**：每条 finding 都带 ruleId（可拿去 get_rule 读原文）与 docUrl。
    checksSkipped 说明哪些规则因数据不足没跑 —— 别把"没跑"当成"没问题"。

    Args:
        path: 本地 PX4 `.ulg` 日志路径。
    """
    report = loader.call(_namespace(path), "np_report()")
    return LogReport.model_validate(report)


@mcp.tool(annotations=_READONLY)
async def log_summary(path: str) -> LogSummary:
    """日志概览：固件与硬件身份、飞行阶段、消息/参数计数、参数改动数。

    不含任何判定 —— 它是"读判定之前先看清前提"用的（机型与固件版本会改变参数含义）。

    Args:
        path: 本地 PX4 `.ulg` 日志路径。
    """
    ns = _namespace(path)
    info = loader.call(ns, "np_log_info()")
    facts = loader.call(ns, "np_report()")
    messages = info["messages"]
    return LogSummary(
        platform=facts["platform"],
        parserVersion=facts["parserVersion"],
        sysInfo=info["sysInfo"],
        phases=info["phases"],
        messagesCount=len(messages),
        eventsCount=sum(1 for m in messages if m.get("kind") == "event"),
        paramsCount=len(info["params"]),
        changedParamsCount=len(info.get("changedParams") or {}),
        defaultParamsKnown=info.get("defaultParamsKnown"),
        dropoutsCount=len(info.get("dropouts") or []),
        fileSizeBytes=info.get("fileSizeBytes"),
        guidance=(
            "先看 sysInfo.ver_sw 与 phases 里的机型：不同固件版本的同一参数含义可能不同。"
            "changedParamsCount 大不代表有问题——它是「与固件默认值不同」的条数，调机过的机器本来就会大。"
        ),
    )


@mcp.tool(annotations=_READONLY)
async def list_events(
    path: str,
    kinds: list[str] | None = None,
    start_s: float | None = None,
    end_s: float | None = None,
) -> EventTimeline:
    """日志里的消息 / 事件时间线，可按类别与时间窗过滤。

    Args:
        path: 本地 PX4 `.ulg` 日志路径。
        kinds: 只要这些类别（如 `["event"]`）；不给则全部。
        start_s: 起始时间（秒，相对日志起点）。
        end_s: 结束时间（秒）。
    """
    raw = loader.call(_namespace(path), "np_log_info()")["messages"]
    events = raw
    if kinds:
        events = [e for e in events if e.get("kind") in kinds]
    if start_s is not None:
        events = [e for e in events if e["tSec"] >= start_s]
    if end_s is not None:
        events = [e for e in events if e["tSec"] <= end_s]
    return EventTimeline(
        total=len(events),
        unfilteredTotal=len(raw),
        events=[LogEvent(**e) for e in events],
        filteredBy={"kinds": kinds, "start_s": start_s, "end_s": end_s},
    )


@mcp.tool(annotations=_READONLY)
async def query_timeseries(
    path: str,
    message_type: str,
    fields: list[str],
    instance: int = 0,
    max_points: int = 1000,
) -> TimeseriesResult:
    """取一条时序曲线（走数据层的 LTTB **保形**降采样，与网页端同一份实现）。

    先用 list_events/log_summary 定位问题，再用本工具看具体波形。
    `fullCount` 是降采样前的原始点数 —— 两者差很大时说明曲线被抽稀了。

    Args:
        path: 本地 PX4 `.ulg` 日志路径。
        message_type: topic 名，如 `vehicle_imu_status`（见 log_summary 或引擎 facts）。
        fields: 该 topic 下的字段名列表（不含 topic 前缀），如 `["accel_vibration_metric"]`。
        instance: 实例号（多实例 topic 要指定）。
        max_points: 返回点数上限（默认 1000）。
    """
    if not fields:
        raise ValueError("fields 不能为空：要取哪些字段就列哪些（不含 topic 前缀）")
    ns = _namespace(path)
    time: list[float] = []
    series: list[list[float | None]] = []
    full = 0
    warnings: list[str] = []
    # 数据层一次请求只吃一条 ydata，所以多字段要逐个取再并起来
    for f in fields:
        one = {"instance": instance, "ydata": [{"kind": "field", "fields": [f"{message_type}.{f}"]}]}
        r = loader.call(ns, f"np_series({_json_str(one)}, {max_points})")
        if not time:
            time = r["t"]
            full = r.get("fullCount") or len(time)
        series.extend(r["series"])
        warnings.extend(r.get("warnings") or [])
    return TimeseriesResult(
        topic=message_type,
        instance=instance,
        points=len(time),
        fullCount=full,
        time=time,
        series=series,
        warnings=warnings,
    )


def _json_str(obj: dict) -> str:
    """把请求对象转成数据层要的那层"JSON 字符串套在 Python 字面量里"的参数。"""
    return json.dumps(json.dumps(obj, ensure_ascii=False))


@mcp.tool(annotations=_READONLY)
async def get_params(path: str, name_glob: str | None = None) -> ParamResult:
    """读日志里的参数表，可按 glob 过滤（如 `BAT*` / `*_GAIN`）。

    Args:
        path: 本地 PX4 `.ulg` 日志路径。
        name_glob: 参数名匹配模式（fnmatch 语义）；不给则返回全部。
    """
    params: dict[str, Any] = loader.call(_namespace(path), "np_log_info()")["params"]
    if name_glob:
        selected = {k: v for k, v in params.items() if fnmatch.fnmatch(k, name_glob)}
        note = None if selected else f"没有参数匹配 {name_glob!r}——换个模式试试，或先不传 name_glob 看全量。"
    else:
        selected = params
        note = f"未给 name_glob，返回全部 {len(params)} 条；参数多时建议先按前缀筛。"
    return ParamResult(
        logFile=Path(path).name,
        total=len(params),
        matched=len(selected),
        params=selected,
        note=note,
    )


# ———————————————— 知识侧 ————————————————


def _load_yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@mcp.tool(annotations=_READONLY)
async def list_checks() -> CheckCatalog:
    """列出知识库里全部规则（自描述目录）。

    调用前先用它看清有哪些规则 —— 规则的 id 可直接传给 get_rule 读原文。
    """
    rules = loader.load_rules()
    entries = []
    for r in rules:
        outputs = r.get("outputs") or {}
        entries.append(
            CatalogEntry(
                ruleId=str(r.get("id") or ""),
                tag=outputs.get("tag") if isinstance(outputs, dict) else None,
                docUrl=r.get("docUrl"),
            )
        )
    return CheckCatalog(
        count=len(entries),
        checks=entries,
        guidance=(
            "规则的阈值与建议原文在 knowledge/px4/rules/*.yaml —— 用 get_rule(ruleId) 读。"
            "analyze_log 的 findings 会回填 ruleId，两者对得上。"
        ),
    )


@mcp.tool(annotations=_READONLY)
async def get_rule(rule_id: str) -> dict[str, Any]:
    """读一条规则的原文与结构化字段（阈值来源、适用条件、建议）。

    Args:
        rule_id: 规则 id（如 `px4-vibration`），来自 analyze_log 的 findings 或 list_checks。
    """
    for f in sorted(_RULES_DIR.glob("*.yaml")):
        doc = _load_yaml(f)
        if isinstance(doc, dict) and doc.get("id") == rule_id:
            return {
                "ruleId": rule_id,
                "sourceFile": str(f.relative_to(_REPO_ROOT)).replace("\\", "/"),
                "name": doc.get("name"),
                "group": doc.get("group"),
                "conditions": doc.get("conditions"),
                "outputs": doc.get("outputs"),
                "triggers": doc.get("triggers"),
                "raw": f.read_text(encoding="utf-8"),
            }
    raise ValueError(f"没有 id 为 {rule_id!r} 的规则；先用 list_checks 看有哪些。")


@mcp.tool(annotations=_READONLY)
async def get_fault(fault_tag: str) -> dict[str, Any]:
    """按异常标签读故障库条目（根因清单 + 排查步骤 + 风险等级 + 禁忌）。

    **禁止**用条目以外的故障模式推断根因 —— 这是知识库的硬边界。

    Args:
        fault_tag: 主故障标签（如 `high_vibration`），来自 analyze_log 的 findings[].tag。
    """
    doc = _load_yaml(_FAULT_KB) or {}
    entries = doc.get("fault_knowledge_base") or []
    for e in entries:
        if e.get("fault_tag") == fault_tag:
            return dict(e)
    known = sorted({str(e.get("fault_tag")) for e in entries})
    raise ValueError(f"没有 fault_tag 为 {fault_tag!r} 的条目；现有：{'、'.join(known)}")


@mcp.tool(annotations=_READONLY)
async def list_faults() -> dict[str, Any]:
    """列出故障库全部条目的索引（fault_id / fault_tag / 风险等级 / 适用阶段）。"""
    doc = _load_yaml(_FAULT_KB) or {}
    entries = doc.get("fault_knowledge_base") or []
    return {
        "count": len(entries),
        "sourceFile": str(_FAULT_KB.relative_to(_REPO_ROOT)).replace("\\", "/"),
        "entries": [
            {
                "faultId": e.get("fault_id"),
                "faultTag": e.get("fault_tag"),
                "riskLevel": e.get("risk_level"),
                "flightPhase": e.get("flight_phase"),
            }
            for e in entries
        ],
    }
