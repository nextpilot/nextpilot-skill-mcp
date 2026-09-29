"""MCP 工具的输出契约（日志侧）。

字段名原样沿用引擎（`ruleId` / `docUrl` / `guardTags` / `checksRun`），本层只声明形状、
不做翻译：翻成第二套名字会造出"这字段到底叫什么"的第二份真源，而 web 端报告已在用原名。
用 Pydantic 而非回 dict，是为了让客户端在调用前就拿到输出 schema。
severity 引擎已在 `run_all()` 排好序，本层如实透出不重排；`checksSkipped` 是「没跑成的
检查」一等公民，连原因一起带上。未采纳参考实现的 Evidence 时间窗（要动引擎 finding 结构，
不在本次范围，差距记在 server/README.md）。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# evidence.value 来自表达式求值：写变量得原值、写 f"{x:.3f}" 得格式化后的串。
EvidenceValue = str | float | int | None


class Evidence(BaseModel):
    """一条 finding 的证据，引擎给的四个字段逐字保留。"""

    field: str = Field(description="证据取自哪个字段，如 `vehicle_imu_status.accel_vibration_metric(均值)`。")
    value: EvidenceValue = Field(default=None, description="实测值。规则里写的是表达式，所以这里可能是格式化后的串。")
    threshold: float | None = Field(default=None, description="触发这条的阈值（规则里写多少就是多少）。")
    unit: str | None = Field(default=None, description="实测值的单位，如 m/s^2。")


class Finding(BaseModel):
    """一条判定结论。"""

    id: str = Field(description="finding 编号（F01、F02…），按发射顺序生成，不是稳定标识。")
    severity: str = Field(description="critical | warning | info。引擎已按这个次序排好，这里不重排。")
    ruleId: str = Field(description="产出它的经验规则 id，可拿去 get_rule 读原文与阈值来源。")
    tag: str | None = Field(default=None, description="异常标签，用来查故障库（get_fault）与匹配 matchedFaults。")
    title: str = Field(description="一句话结论。")
    evidence: Evidence
    docUrl: str | None = Field(default=None, description="规则附带的官方文档链接（有就该引用它，别自己编来源）。")
    suggestion: str | None = Field(default=None, description="规则作者给的处置建议（不是本服务生成的）。")


class MetricEntry(BaseModel):
    """概览指标的一项（结果页「关键数据」的同一份）。"""

    key: str
    label: str = Field(description="给人看的中文名。")
    value: Any = Field(default=None, description="规则产出的实测值优先；规则没跑就按 facts.yaml 的声明兜底现算。")
    unit: str | None = None


class SkippedCheck(BaseModel):
    """ "这条没跑"及原因。报告要能看出为什么，别让读者以为它跑过了。"""

    ruleId: str = Field(description="规则 ID。")
    reason: str = Field(description="自动生成的文案：固件不满足 / 机架不适用 / 缺 topic / 数据不足…")


class LogReport(BaseModel):
    """`analyze_log` 的产物，引擎那一份 report，形状逐字对齐。"""

    platform: str = Field(description="日志来自哪个固件族，如 PX4。")
    parserVersion: str = Field(
        description="解析器版本。它是环境指纹不是解析结果，换台机器/换解析器版本就会变，"
        "比对两份报告时不要把它算成差异（compare_baseline 的 IGNORED_TOP_KEYS 就是这个理由）。"
    )
    facts: dict[str, Any] = Field(description="日志客观「是什么」：机型/固件/时长/armed/阶段/丢包…由 provider 定义。")
    metrics: list[MetricEntry] = Field(default_factory=list, description="关键数字，有序数组（顺序即展示顺序）。")
    tags: list[str] = Field(default_factory=list)
    guardTags: list[str] = Field(
        default_factory=list, description="数据质量标签（如 insufficient_data），不依赖是否发出 finding。"
    )
    checksRun: list[str] = Field(default_factory=list)
    checksSkipped: list[SkippedCheck] = Field(default_factory=list)
    matchedFaults: list[dict[str, Any]] = Field(
        default_factory=list,
        description="按 tags / 飞行阶段 / excludeTags 匹配到的故障库条目（结构以 knowledge/px4/fault-kb.yaml 为准）。",
    )
    findings: list[Finding] = Field(default_factory=list, description="判定层结论，已按 severity 排序。")
    instanceNotes: list[str] | None = Field(
        default=None, description="取数过程中的越界说明（如「要实例 1~5，日志里只有 0~2」），没有就不给这个键。"
    )


# 以下为其余工具的返回契约，同一原则：字段名沿引擎 / 数据层原名，本层只声明形状不翻译。


class LogSummary(BaseModel):
    """`log_summary` 的产物：这份日志「是什么样的」，不含任何判定。"""

    platform: str
    parserVersion: str = Field(description="环境指纹，不是解析结果（同 LogReport 的说明）。")
    sysInfo: dict[str, Any] = Field(description="固件与硬件身份（sys_name / ver_sw / ver_hw …）。")
    phases: list[dict[str, Any]] = Field(default_factory=list, description="通电 / 解锁阶段，含机型与 navState。")
    messagesCount: int
    eventsCount: int = Field(description="messages 里 kind=event 的条数。")
    paramsCount: int
    changedParamsCount: int = Field(description="与固件默认值不同的参数条数。")
    defaultParamsKnown: bool | None = None
    dropoutsCount: int = 0
    fileSizeBytes: int | None = None
    guidance: str = Field(description="这份概览该怎么用，把用法写进数据里，而不是指望客户端记得读 README。")


class LogEvent(BaseModel):
    """一条日志消息 / 事件。"""

    # APM 的 MSG/ERR 行可能没有 TimeUS（providers/ardupilot.py 明确给 None）：
    # 若不允许 None，不带时间窗的 list_events 会在 pydantic 校验时炸掉整条响应。
    tSec: float | None = Field(default=None, description="相对日志起点的秒数；源日志缺时间戳（如部分 APM MSG 行）时为 None。")
    level: int
    levelStr: str
    kind: str = Field(description="event 等类别；list_events 可按它筛。")
    message: str


class EventTimeline(BaseModel):
    """`list_events` 的产物。"""

    total: int = Field(description="过滤后剩下的条数。")
    unfilteredTotal: int = Field(description="过滤前的总条数，用来区分「筛没了」与「本来就没有」。")
    events: list[LogEvent]
    filteredBy: dict[str, Any] = Field(default_factory=dict, description="回显施加过的过滤条件。")


class TimeseriesResult(BaseModel):
    """`query_timeseries` 的产物，已按 LTTB 保形降采样。"""

    topic: str
    instance: int
    points: int = Field(description="返回的点数（≤ 请求的 max_points）。")
    fullCount: int = Field(description="降采样前的原始采样数，用它判断曲线是否被抽稀。")
    time: list[float] = Field(description="时间轴（秒，相对日志起点）。")
    series: list[list[float | None]] = Field(description="与 time 等长；请求了几个字段就有几条。")
    warnings: list[str] = Field(default_factory=list)


class ParamResult(BaseModel):
    """`get_params` 的产物。"""

    logFile: str
    total: int = Field(description="日志里的参数总数。")
    matched: int = Field(description="按 name_glob 过滤后剩下的条数。")
    params: dict[str, Any] = Field(description="参数名 → 值。")
    note: str | None = Field(default=None, description="结果不完整时要说明缺什么，不要静默少给。")


class CatalogEntry(BaseModel):
    """`list_checks` 目录里的一条。"""

    ruleId: str
    tag: str | None = None
    docUrl: str | None = None


class CheckCatalog(BaseModel):
    """`list_checks` 的产物，自描述目录，让客户端在调用前就知道有哪些规则可用。"""

    count: int
    checks: list[CatalogEntry]
    guidance: str
