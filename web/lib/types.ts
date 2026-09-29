import type { CategoryKey, Platform } from "./constants";

/** Skill 卡片元数据，对应 CLAUDE.md 3.1 卡片规范 */
export interface SkillMeta {
    slug: string;
    name: string;
    description: string;
    category: CategoryKey;
    platforms: Platform[];
    models: string[];
    tags: string[];
    /** 适用范围：可用的 AI 客户端 / 运行环境（如 Claude、ChatGPT、Cursor、Claude Code） */
    clients?: string[];
    rating: number;
    downloads: number;
    featured?: boolean;
    sourceUrl?: string;
    paperUrl?: string;
    license?: string;
    /** 图标（emoji，如 "🛰️"；缺省时按分类回退到内置图标瓦片） */
    icon?: string;
    /** 版本号（可选，随内容更新递增；借鉴 SkillHub 的版本展示） */
    version?: string;
    /** 版本历史（可选，作者在 frontmatter 维护；缺省时按 version+updatedAt 兜底生成一条） */
    changelog?: ChangelogEntry[];
    /** 致动能力：read-only 表示仅分析不写参数，config 表示可修改配置/参数 */
    capability?: "read-only" | "config";
    updatedAt: string;
    /** @internal 拼音全拼（构建期预计算，用于 Fuse.js 拼音容错搜索） */
    _pinyin?: string;
}

export interface ChangelogEntry {
    version: string;
    date: string;
    notes: string[];
}

/** Skill 详情页「文件」Tab 可打开的一个文件；只收文本，二进制（.ulg 等）不进列表 */
export interface SkillFile {
    /** 相对 skill 目录的路径，如 `evals/cases.yaml`、`SKILL.md` */
    path: string;
    size: number;
    content: string;
}

/** MCP 服务元数据。与 Skill 并列而非其子类：Skill 是模型读的提示词约定，MCP 是客户端可调用的工具集 */
export interface McpServerMeta {
    slug: string;
    name: string;
    description: string;
    /** 允许自由取值：MCP 面向的不只是飞控固件，还有仿真器与工具 */
    platforms: string[];
    models: string[];
    /** 暴露给客户端的工具名 */
    tools: string[];
    transport: string;
    /** 图标（emoji） */
    icon?: string;
    /** 适用范围：可用的 AI 客户端（Claude / Cursor 等） */
    clients?: string[];
    version?: string;
    changelog?: ChangelogEntry[];
    /** 默认是否只读。false 表示具备致动能力，详情页须显著标注（见 CLAUDE.md 第 5 节） */
    readOnly: boolean;
    tags: string[];
    rating: number;
    downloads: number;
    featured?: boolean;
    sourceUrl?: string;
    license?: string;
    updatedAt: string;
}

/** findings 检查结果的严重度（三层架构层间契约，见 CLAUDE.md 4.2） */
export type Severity = "critical" | "warning" | "info" | "guard";

export interface Finding {
    id: string;
    severity: Severity;
    ruleId: string;
    label: string;
    description: string;
    /** 触发依据：字段名、实际值、阈值等结构化证据 */
    evidence: {
        source: string;
        value?: number | string | null;
        threshold?: number | string;
        unit?: string;
        docurl?: string;
        samples?: { tSec?: number; message?: string }[];
        [key: string]: unknown;
    };
    docUrl?: string;
    suggestion?: string;
}

/** 第三层确定性匹配到的故障知识库条目（见 knowledge/px4/fault-kb.yaml） */
export interface MatchedFault {
    id: string;
    name: string;
    description: string;
    riskLevel: string;
    possibleRootCause: string[];
    troubleshootingSteps: string[];
    docUrls: string[];
    excludeNotes: Record<string, string>;
}

/** 事实层产出之一：日志客观"是什么"（离散、驱动判定），由 knowledge/engine/rule_engine.py 按 facts.yaml 的绑定取出 */
export interface LogFacts {
    durationSec?: number;
    /** 机型：rotary_wing / fixed_wing / rover / airship / unknown（见 vehicle_status.vehicle_type） */
    vehicleType?: string;
    firmware?: string;
    /** px4-1.15+ / px4-legacy（规则里用 fw_profile 判定） */
    firmwareProfile?: string;
    hardware?: string;
    /** armed 总时长（秒） */
    armedDurationSec?: number;
    /** armed 段出现过的飞行阶段 */
    phases?: string[];
    /** 全日志丢包累计（毫秒） */
    dropoutTotalMs?: number;
    /** 飞控唯一 ID（sys_uuid / PX4GUID）；SITL 之类没有就是空 */
    uuid?: string;
    /** 载具累计飞行时长（秒），来自参数 LND_FLIGHT_T_HI/LO */
    vehicleLifeS?: number;
    /** 机架编号（参数 SYS_AUTOSTART，如 4040） */
    airframeId?: number;
    /** 记录起始的 UTC 时刻（unix 秒），取 GPS 首次给出有效时间的那一刻 */
    startUtc?: number;
    /** 固件分支 / 标签（msg_info_dict.ver_sw_branch，如 damiao_dm-fc01_v1.15.0）；旧固件没有 */
    verSwBranch?: string;
    /** 固件 git 提交全串（ver_sw，40 位）；报告页「软件版本」显示 `分支（提交）` 用 */
    verSw?: string;
    /** 硬件子型号（ver_hw_subtype，如 V6C002002）；不是每块板都写 */
    hardwareSubtype?: string;
    /** 主飞行模式：占样本最多的 nav_state（PX4 模式名，如 Position / Mission） */
    mainMode?: string;
    /** 这次日志出现过的全部模式，按占样本数从多到少（Flight Review browse 页也是列全量） */
    modes?: string[];
    /** 软件版本的展示串（FR 口径：`v1.16.0` / `v1.17.0-alpha` / `v1.14.3 (08310a)` / 无发布号时给短哈希） */
    firmwareDisplay?: string;
    /** ver_sw_release 类型码（64 alpha / 128 beta / 192 rc / 255 正式 / 0 未打标签；null=无发布号），前端可据比重算展示 */
    fwReleaseType?: number | null;
}

/** 概览指标的一项：order/label/unit 由 knowledge/px4/facts.yaml 的 metrics 声明 */
export interface MetricEntry {
    key: string;
    label?: string;
    unit?: string;
    value: number | string;
}

export interface LogReportData {
    fileName: string;
    fileSize: number;
    platform: "PX4" | "ArduPilot";
    /** 飞控软件版本（ver_sw 截断，如 e82c4e1a1f8e） */
    verSw?: string;
    /** 飞控硬件版本（ver_hw） */
    verHw?: string;
    parserVersion: string;
    /** 日志内容指纹（SHA-256 hex）：同一份日志重复上传时直接载入历史结果 */
    logHash?: string;
    findings: Finding[];
    /** 事实层产出之二：日志客观事实（机型/固件/时长/armed/阶段/丢包） */
    facts?: LogFacts;
    /** 事实层产出之三：关键数字（有序、带中文名与单位；声明在 facts.yaml 的 metrics） */
    metrics?: MetricEntry[];
    /** 第二层异常标签 */
    tags?: string[];
    /** 数据质量 / 边界 guard 标签（insufficient_data 等） */
    guardTags?: string[];
    checksRun?: string[];
    checksSkipped?: { ruleId: string; reason: string }[];
    /** 规则取数时的实例提示（区间越界被截断等），非判定结论；与 SeriesResponse.warnings 同源，进告警栏 */
    instanceNotes?: string[];
    /** 第三层故障知识库命中条目 */
    matchedFaults?: MatchedFault[];
    analyzedAt: string;
}

/* ---------- 报告页数据层（Flight Review 对标 A/B/C，见 engine.py 第二部分）---------- */

export interface FieldMeta {
    name: string;
    dtype: string;
}

export interface TopicMeta {
    topic: string;
    instance: number;
    n: number;
    fields: FieldMeta[];
}

/** np_manifest() 的返回：日志中全部数据集 */
export interface TopicManifest {
    topics: TopicMeta[];
}

/** np_series() 的返回：LTTB 降采样后的时序，NaN 已转为 null。
 *  `series` 与请求的 `ydata` 同序等长（取不到的是 null），前端按预设的 label / color 对齐。 */
export interface SeriesResponse {
    /** 时间基准：开机以来的秒数（与 Flight Review 一致） */
    t: number[];
    /** 显式声明的横轴（`mode: xyplot`）；null = 横轴就是 `t` */
    x: (number | null)[] | null;
    series: ((number | null)[] | null)[];
    fullCount: number;
    /** 取数提示（如要实例 1~9 但日志只有 0~2，按 1~2 取）；不是错误，图已画出，界面要给出 */
    warnings?: string[];
    error?: string;
}

/** 地图上的一条轨道（`container: map` 的 child）；坐标已按固件换算成度/米 */
export interface TrackSeries {
    /** 图例名（预设里的 label） */
    label: string;
    t: number[];
    lat: number[];
    lon: number[];
    alt: number[];
    /** 有效定位点总数（已剔除未定位的采样） */
    fullCount?: number;
    /** 被剔除的未定位采样数（lat=lon=0 或 fix_type < 3）；>0 时界面要说明 */
    dropped?: number;
}

/** GPS 轨迹（地图用）：np_track() 的产物。可以多条，多条叠画 + 图例。 */
export interface TrackData {
    /** 地图标题（预设里的 container.title） */
    title?: string;
    /** 是否显示图例（预设里的 legend，缺省 true）；单条轨道时前端按海拔着色，不看它 */
    legend?: boolean;
    tracks: TrackSeries[];
    error?: string;
    /** 取不到轨迹的逐条原因（有 error 时才有，界面按列表渲染）。error 只有一句话，
     *  而画不出轨迹有六种：topic 缺失 / 坐标字段缺失 / ref() 取值失败 / 无 timestamp 列 /
     *  timestamp 与坐标采样数不一致 / 有效定位不足 2 个；只给一句概括易误导。见 CLAUDE.md §6.8 */
    errorReasons?: string[];
    /** 出错种类（有 error 时才有）。log-not-loaded = 该 Worker 没装这份日志，
     *  重选 .ulg 重新解析即恢复（界面给重选按钮）；其它错误重选无用，不给按钮 */
    code?: "log-not-loaded";
}

export interface LogMessage {
    tSec: number;
    level: number;
    levelStr: string;
    message: string;
    /** 来源：`log` = 固件打印的文本行（'L'/'C'）；`event` = 从 `event` topic 解码出来的事件 */
    kind?: "log" | "event";
}

export interface Dropout {
    tSec: number;
    durationMs: number;
}

export interface FlightPhase {
    startSec: number;
    endSec: number;
    navState: number;
    mode: string;
    armed: boolean;
}

export interface ChangedParam {
    tSec: number;
    name: string;
    value: number | string | null;
}

/** ULog Parameter Default（'Q' 消息）：PX4 只记录与当前值不同的默认值，键缺失 = 与该默认相同 */
export interface ParamDefault {
    /** current_setup：机架配置 + 自定义默认文件算出来的默认值 */
    setup?: number | string | null;
    /** system：编译进固件的出厂默认值 */
    system?: number | string | null;
}

/** Information Message（ULog 的 'I' 消息）全集里的一条：键 / 中文名 / 类型 / 值 / 说明 */
export interface LogInfoEntry {
    key: string;
    /** 变量名的中文名（来自 facts.yaml 的 info_key_docs）；表里没有的键为空串 */
    name?: string;
    /** 该键在 ULog 里的类型（`char[40]` 等）；表格不展示，留给报告接口 / MCP 用 */
    type?: string;
    value: string;
    /** 这个键是什么意思（同上）；表里没有的键为空串 */
    desc?: string;
}

/** Multi Information（ULog 的 information_multiple）：键 → 多组值，没有时间戳 */
export interface LogMultiInfo {
    key: string;
    /** 上游给的类型标记（多数为空） */
    type?: string;
    /** 每组一次记录（pyulog 已把续行并进同一组，元素间用换行连接，保留原来的行结构） */
    values: string[];
}

/** Tagged Logged String（ULog 的 'C' 消息）：与 'L' 同形，多一个 tag = 消息来源 */
export interface LogTaggedMessage extends LogMessage {
    /** 消息来源标识（进程 / 线程 / 类），含义由机载系统自定义 */
    tag: number;
}

/** ULog 的消息记录统计（引擎逐字节走文件得到；顺序与名字来自 facts.yaml） */
export interface LogMsgTypeStat {
    /** 单字母类型码：'B' 标志位 / 'I' 信息 / 'M' 多值信息 / 'P' 参数 / 'D' 数据 … */
    code: string;
    name: string;
    en?: string;
    desc?: string;
    count: number;
}

/** np_materials() 的返回：系统信息 / 事件 / 多值信息 / 丢包 / 参数 / 飞行阶段 */
export interface LogInfo {
    sysInfo: Record<string, string>;
    /** 'I' 消息的完整字典（sysInfo 是它按 facts.yaml 挑出来的子集） */
    infoDict?: LogInfoEntry[];
    /** ULog 各类消息的条数统计 */
    msgTypeStats?: LogMsgTypeStat[];
    /** 逐字节统计是否正好走到文件末尾；false 表示尾部有截断/追加段，统计只是"读到多少算多少" */
    msgTypeWalkOk?: boolean;
    messages: LogMessage[];
    /** 老存档专用：'C' 消息。新数据的 'C' 与事件都已并进 messages（按 kind 区分），不再单独发这个字段 */
    messagesTagged?: LogTaggedMessage[];
    /** Multi Information（固件 boot 日志、性能计数、被排除的话题等） */
    messagesMulti?: LogMultiInfo[];
    dropouts: Dropout[];
    params: Record<string, number | string>;
    /** 与当前值不同的默认值（键 = 参数名）；日志无 Q 段时为空 */
    defaultParams?: Record<string, ParamDefault>;
    /** 日志是否带 Default Parameter 段。为 false 时「没记录」≠「未被修改」 */
    defaultParamsKnown?: boolean;
    changedParams: ChangedParam[];
    phases: FlightPhase[];
}
