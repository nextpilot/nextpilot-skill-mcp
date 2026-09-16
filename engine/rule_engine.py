
import json, io, ast, re
import numpy as np
from pyulog import ULog


# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = __FAULT_KB__

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = json.loads(r'''__RULES__''')

# ---------------- 事实层的数据绑定与码表（knowledge/px4/facts.yaml 编译而来）----------------
# 引擎只提供机制：字段名、码值、执行顺序都在 YAML 里，改数据不用碰 Python。
FACTS = __FACTS__
_VS = FACTS["bindings"]["vehicle_status"]
_NAV_GROUPS = [(g["phase"], set(int(c) for c in g["codes"])) for g in FACTS["nav_state_groups"]]

# 同一 group 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# **跨 group 的顺序不在这里决定**：由 facts.yaml 的 group_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 group_order 会改报告里的编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 阈值不再集中存放：每条经验的判定阈值都写在它自己的 rules/*.yaml 里
# （px4-thresholds.toml 已退场）。本文件只保留引擎级格式常量。

# ULog 日志级别：PX4 在 log_level 里填 ASCII 数字，映射与 pyulog Message.log_level_str() 一致
# （见 pyulog/core.py）。经验文件按 level_name 判定，避免再犯“拿 3/4 去比 51/52”的错。
_LOG_LEVEL_NAMES = {int(k): v for k, v in FACTS["log_levels"].items()}

findings = []
checks_run = []
checks_skipped = []
tags = []          # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []    # 数据质量/边界标签
_fid = [0]

def add_tag(t):
    if t not in tags:
        tags.append(t)

def add(severity, rule_id, tag, title, field, value, threshold=None, unit=None,
        doc=None, suggestion=None, tags_extra=None):
    _fid[0] += 1
    ev = {"field": field, "value": value}
    if threshold is not None: ev["threshold"] = threshold
    if unit is not None: ev["unit"] = unit
    f = {"id": "F%02d" % _fid[0], "severity": severity, "ruleId": rule_id,
         "tag": tag, "title": title, "evidence": ev}
    if doc: f["docUrl"] = doc
    if suggestion: f["suggestion"] = suggestion
    findings.append(f)
    if tag: add_tag(tag)
    for te in (tags_extra or []):
        add_tag(te)

def skipped(check, reason):
    item = {"check": check, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)

def ran(check):
    if check not in checks_run:
        checks_run.append(check)

def find_all(ulog, name):
    return [d for d in ulog.data_list if d.name == name]

def getf(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None: return v
        except Exception:
            pass
    return None

def pick(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None: return n, v
        except Exception:
            pass
    return None, None

def edge_indices(arr):
    """值发生变化的索引列表（边沿检测，避免扫全数组判断状态）。"""
    a = np.asarray(arr)
    if len(a) < 2: return []
    return [i for i in range(1, len(a)) if int(a[i]) != int(a[i - 1])]

buf = io.BytesIO(bytes(ulog_bytes))
ulog = ULog(buf)

# 本日志实际录到的 topic 名集合（`_rule_env` 的 `topics` 与 `has_topic()` 共用一份）
_TOPIC_NAMES = set(d.name for d in ulog.data_list)


def has_topic(name):
    """日志里有没有这个 topic。经验里写 `not has_topic('cpuload')`，比 `'cpuload' not in topics`
    直白——读的人不必知道 `topics` 是个集合。"""
    return name in _TOPIC_NAMES

# ---------------- 固件版本识别（PX4 1.15 起 topic 与字段名有破坏性变化）----------------
# ver_sw_release 打包格式：major<<24 | minor<<16 | patch<<8 | type
def detect_firmware(ulog):
    info = getattr(ulog, "msg_info_dict", {}) or {}
    rel = info.get("ver_sw_release")
    fw = {"release": None, "major": None, "minor": None, "patch": None,
          "git": str(info.get("ver_sw", ""))[:12], "hw": str(info.get("ver_hw", ""))}
    if rel is not None:
        try:
            v = int(rel)
            fw.update({"release": v, "major": (v >> 24) & 0xFF,
                       "minor": (v >> 16) & 0xFF, "patch": (v >> 8) & 0xFF})
        except Exception:
            pass
    return fw

FW = detect_firmware(ulog)
FW_MINOR = FW["minor"]
FW_LABEL = ("%d.%d.%d" % (FW["major"], FW["minor"], FW["patch"])) if FW_MINOR is not None else "未知（旧固件或无版本号）"
FW_PROFILE = "px4-1.15+" if (FW_MINOR is not None and FW_MINOR >= 15) else "px4-legacy"
_info = getattr(ulog, "msg_info_dict", {})

def pick_versioned(*candidates):
    """按固件版本优先取字段来源；版本未知时退化为“字段存在性”判定。
    candidates 形如 (最低 minor 版本或 None, 值)。"""
    known = FW_MINOR is not None
    ordered = sorted(candidates, key=lambda c: (c[0] is None, -(c[0] or 0)))
    for mm, val in ordered:
        if val is None:
            continue
        if mm is None or not known or FW_MINOR >= mm:
            return val
    for _mm, val in candidates:   # 定制固件容错
        if val is not None:
            return val
    return None

# ---------------- 总时长 / 时间基准 ----------------
t_min, t_max = None, None
for d in ulog.data_list:
    t = getf(d, "timestamp")
    if t is not None and len(t) > 1:
        a, b = float(t[0]), float(t[-1])
        t_min = a if t_min is None else min(t_min, a)
        t_max = b if t_max is None else max(t_max, b)
t0 = int(getattr(ulog, "start_timestamp", 0) or (t_min or 0))
duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None
# 事实层的产出分两块（都进 report，见文件末尾）：
#   facts   —— 日志客观"是什么"：机型 / 固件 / 时长 / armed / 阶段 / 丢包。离散、驱动判定
#   metrics —— 给人和 AI 看的**数字**：事实层的概览指标（facts.yaml 的 metrics）+ 各经验的 emit.stats
facts = {"durationSec": duration_s if duration_s is not None else 0}
metrics = {}

# ---------------- 机型识别 ----------------
VEHICLE_TYPES = {int(k): v for k, v in FACTS["vehicle_types"].items()}
vehicle_type = "unknown"
vs_list = find_all(ulog, _VS["topic"])
vs = vs_list[0] if vs_list else None
if vs is not None:
    vt = getf(vs, _VS["vehicle_type"])
    if vt is not None and len(vt) > 0:
        vehicle_type = VEHICLE_TYPES.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
    else:
        rw = getf(vs, _VS["is_rotary_wing"])
        if rw is not None and len(rw) > 0:
            vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
facts["vehicleType"] = vehicle_type
facts["firmware"] = FW_LABEL
facts["firmwareProfile"] = FW_PROFILE
if FW["hw"]:
    facts["hardware"] = FW["hw"]
# 硬件子型号（同型号的不同批次 / 变体，不是每块板都有）：报告页「硬件版本」与 ver_hw 一起显示
_hw_sub = str(_info.get("ver_hw_subtype", ""))
if _hw_sub:
    facts["hardwareSubtype"] = _hw_sub

# ---------------- 飞行模式 ----------------
# 这次日志里出现过的 nav_state 模式，按占样本数从多到少（名字取 facts.yaml 的 nav_state_names）——
# 列表的"飞行模式"列按 Flight Review 的口径把**全部**模式列出来（它 browse 页就是逗号分隔的全量）
_NAV_NAMES = {int(k): v for k, v in FACTS.get("nav_state_names", {}).items()}
_vs_first = find_all(ulog, _VS["topic"])
if _vs_first:
    _nav = getf(_vs_first[0], _VS["nav_state"])
    if _nav is not None and len(_nav) > 0:
        _counts = {}
        for _code in _nav:
            _c = int(_code)
            _counts[_c] = _counts.get(_c, 0) + 1
        _ordered = sorted(_counts, key=lambda c: -_counts[c])
        facts["modes"] = [str(_NAV_NAMES.get(c, "Mode %d" % c)) for c in _ordered]
        facts["mainMode"] = facts["modes"][0]

# 软件版本的展示串（对齐 Flight Review 的 `_format_sw_version`，app/tornado_handlers/browse.py）。
# 规则（**别凭直觉改**，2026-09-16 踩过一次：拿 2024 年的旧 checkout 对齐，把 `v1.15.0 (479ee0)`
# 改成了裸哈希，看着"更 FR"其实正好相反）：
#   有 ver_sw_release 时按类型码出串，类型码 = ver_sw_release & 0xFF：
#     64 → `v1.17.0-alpha`、128 → `-beta`、192 → `-rc`、255 → `v1.16.0`（正式版无后缀）；
#     **只有 0（未打标签的开发版）才在版本号后面括注 git 短哈希** → `v1.14.3 (08310a)`；
#   没有 ver_sw_release（老固件）→ 直接给 git 短哈希（`> 10` 位才截 6 位）。
# alpha/beta/RC **不带**哈希，开发版**带**——这是 FR 的原样逻辑，实测 review.px4.io 上
# 一份开发版日志显示的就是 `v1.14.3 (08310a)` 两行。
# ver_sw_release 的打包：major<<24 | minor<<16 | patch<<8 | 类型。
_RELEASE_TYPE_SUFFIX = {64: "-alpha", 128: "-beta", 192: "-rc", 255: ""}
_sw = str(_info.get("ver_sw", ""))
_short_sw = _sw[:6] if len(_sw) > 10 else _sw
_rel = FW["release"]
if _rel is None:
    facts["firmwareDisplay"] = _short_sw
else:
    _rtype = int(_rel) & 0xFF
    _disp = "v%d.%d.%d%s" % (FW["major"], FW["minor"], FW["patch"],
                             _RELEASE_TYPE_SUFFIX.get(_rtype, ""))
    if _rtype not in _RELEASE_TYPE_SUFFIX and _sw:   # 未打标签的开发版：附短哈希便于对上游
        _disp += " (%s)" % _short_sw
    facts["firmwareDisplay"] = _disp
# 类型码另存一份：以后要再调口径，前端能凭它重算，不必重新解析日志
facts["fwReleaseType"] = None if _rel is None else int(_rel) & 0xFF
# 原始 git 提交（ver_sw）也留一份：报告页「软件版本」要显示 `分支（提交）`，
# 不能只靠 report.verSw——那份是前端存摘要时截过的（20 字符）
if _sw:
    facts["verSw"] = _sw

# ---------------- 载具身份与记录起始时刻 ----------------
# 这几项与判定无关，但历史卡片与报告概况要用，且必须**随 report 存档**（派生数据 info 不进存档）。

uuid = str(_info.get("sys_uuid", ""))
if uuid:
    facts["uuid"] = uuid
# 软件版本用**分支/标签**（如 damiao_dm-fc01_v1.15.0）比 commit 号可读；新固件才有这个键
_branch = str(_info.get("ver_sw_branch", ""))
if _branch:
    facts["verSwBranch"] = _branch

# 载具累计飞行时长：参数 LND_FLIGHT_T_HI/LO 拼成的 64 位 µs 计数器（两个都是 int32，可能读成负数）
_p = ulog.initial_parameters
_hi, _lo = _p.get("LND_FLIGHT_T_HI"), _p.get("LND_FLIGHT_T_LO")
if _hi is not None and _lo is not None:
    facts["vehicleLifeS"] = round((((int(_hi) & 0xFFFFFFFF) << 32) | (int(_lo) & 0xFFFFFFFF)) / 1e6, 1)

# 机架编号（SYS_AUTOSTART，如 4040）——机型之外再给一个可查的标识
_af = _p.get("SYS_AUTOSTART")
if _af is not None:
    facts["airframeId"] = int(_af)

# 记录起始的 UTC 时刻：取 GPS 首次给出有效时间的那一刻（比 boot_time_utc_us 可靠，后者要飞控对过时）
_gps_topic = str((FACTS.get("track") or {}).get("topic", ""))
_gps_list = find_all(ulog, _gps_topic) if _gps_topic else []
if _gps_list and "time_utc_usec" in _gps_list[0].data:
    _t = np.asarray(_gps_list[0].data["time_utc_usec"], dtype=np.int64)
    _nz = np.nonzero(_t > 0)[0]
    if len(_nz):
        facts["startUtc"] = int(_t[_nz[0]] // 1000000)

# ---------------- 飞行阶段识别（第二层，用于故障库 phase 匹配）----------------
# nav_state 码值 → 飞行阶段的分组写在 facts.yaml 的 nav_groups（_NAV_GROUPS 已按它构建）

phases_present = set()
armed_intervals = []      # (start_us, end_us)，end=None 表示持续到日志结束
armed_duration_s = 0.0

if vs is not None:
    nav = getf(vs, _VS["nav_state"])
    arm = getf(vs, _VS["arming_state"])
    vts = np.asarray(getf(vs, _VS["timestamp"]), dtype=np.int64)

    # armed 区间（failsafe 失联只在 armed 区间内才报）
    if arm is not None:
        a = np.asarray(arm)
        start_i = None
        for i in range(len(a)):
            if int(a[i]) == _VS["armed_value"] and start_i is None:
                start_i = i
            elif int(a[i]) != _VS["armed_value"] and start_i is not None:
                armed_intervals.append((int(vts[start_i]), int(vts[i])))
                start_i = None
        if start_i is not None:
            armed_intervals.append((int(vts[start_i]), None))
        total_us = 0
        for s, e in armed_intervals:
            total_us += ((e if e is not None else int(vts[-1])) - s)
        armed_duration_s = round(total_us / 1e6, 1)

    trans_mode = getf(vs, _VS["vtol_in_trans_mode"])
    if nav is not None:
        nav_arr = np.asarray(nav)
        # 只统计 armed 段内的状态；未解锁的地面操作不产生飞行阶段
        if armed_intervals:
            amask = np.zeros(len(nav_arr), dtype=bool)
            for s, e in armed_intervals:
                lo = int(np.searchsorted(vts, s))
                hi = len(vts) if e is None else int(np.searchsorted(vts, e))
                amask[lo:hi] = True
            codes = set(int(c) for c in nav_arr[amask])
            for _phase, _codes in _NAV_GROUPS:
                if codes & _codes:
                    phases_present.add(_phase)
if vs is not None and trans_mode is not None:
    if int(np.max(np.asarray(trans_mode))) > 0:
        phases_present.add("vtol_transition")
# 无 armed 段时，短日志 guard 之外不做任何故障库匹配
facts["armedDurationSec"] = armed_duration_s
facts["phases"] = sorted(phases_present)

# 短日志 guard 的标签由 rules/guard-short-log.yaml 给出；调用放在框架定义之后
# （见下方 _run_rules("guards_early")），以保证它是第一个 guard 标签。

# ---------------- 数据质量事实（供 guards 类经验判定）----------------
# 中途重启：同一 topic 时间戳出现回退（样本 > 10 才算）
restart_topics = 0
for _d in ulog.data_list:
    _t = getf(_d, "timestamp")
    if _t is not None and len(_t) > 10:
        _a = np.asarray(_t, dtype=np.int64)
        if int(np.count_nonzero(np.diff(_a) < 0)) > 0:
            restart_topics += 1
# 日志丢包累计
dropout_total_ms = int(sum(getattr(d, "duration", 0) for d in getattr(ulog, "dropouts", [])))
facts["dropoutTotalMs"] = dropout_total_ms

def in_armed(ts_us):
    for s, e in armed_intervals:
        if ts_us >= s and (e is None or ts_us <= e):
            return True
    return False

# ---------------- 经验规则框架（rules/*.yaml 驱动）----------------
# 位置说明：本段位于原「规则 4：CPU 负载」处。迁移期的顺序约束——规则按 RULES 顺序
# 在此执行，而 finding.id（F01、F02…）按发射顺序生成，所以**必须按与原检查相同的次序
# 迁移**（vibration → ekf → power → cpu → gps → failsafe …），否则 id 会与冻结基线错位。
_ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub,
    ast.Compare, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.In, ast.NotIn,
    ast.Is, ast.IsNot,
    ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod,
    ast.Name, ast.Load, ast.Constant, ast.List, ast.Tuple, ast.Set,
    # f-string（证据值用：`value: f"{vibe_mean:.3f}"`）。它的占位符里还是普通表达式，
    # 求值仍在同一个空 __builtins__ 环境下，没有新能力。
    ast.JoinedStr, ast.FormattedValue,
)

# 表达式里**唯一**放行的函数调用。`has_topic('x')` 比 `'x' in topics` 直白
# （读的人不必知道 topics 是个集合），但把它做成函数就意味着要开"允许调用"这个口子，
# 所以白名单只此一项、且要求实参是字符串字面量。其余能力（属性/下标/推导式）一律不给。
_EXPR_CALLABLE = {"has_topic"}


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。

    绝不 eval 用户可控代码：不允许属性访问、下标、推导式；函数调用只放行
    `_EXPR_CALLABLE` 里的那几个，且实参必须是字符串字面量。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            ok = isinstance(node.func, ast.Name) and node.func.id in _EXPR_CALLABLE
            arg_ok = len(node.args) == 1 and isinstance(node.args[0], ast.Constant) \
                and isinstance(node.args[0].value, str)
            if not (ok and arg_ok and not node.keywords):
                raise ValueError(
                    "表达式里只允许 %s('字符串')：%s"
                    % ("/".join(sorted(_EXPR_CALLABLE)), expr))
            continue
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _read_field_ref(ref, aliases=None):
    """'topic.field' → 该字段在各实例上的值（多实例拼接）；topic/字段缺失返回 None。

    数组字段（如 float32[14] voltage_cell_v）pyulog 按 'field[i]' 暴露，
    直接 getf(field) 拿不到，这里尝试下标 0..31，返回**每元素一列的列表**；
    缺的元素位置为 None。

    aliases 是该字段的备用命名（旧固件改过名，如 stddev_accel_x ↔ stddev_accel_x_m_s2）。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None
    aliases = list(aliases or [])

    def gather(get_one):
        vals = []
        for d in ds:
            v = get_one(d)
            if v is not None and len(v):
                vals.append(np.asarray(v, dtype=float))
        if not vals:
            return None
        return np.concatenate(vals) if len(vals) > 1 else vals[0]

    direct = gather(lambda d: getf(d, field, *aliases))
    if direct is not None:
        return direct
    def gather_cell(idx):
        # pyulog 对定长数组通常暴露为 'field[0]'，个别构建为 'field_0'
        return gather(lambda d: next(
            (v for v in (getf(d, f"{stem}[{idx}]", f"{stem}_{idx}") for stem in [field] + aliases)
             if v is not None), None))

    col0 = gather_cell(0)
    if col0 is None:
        return None
    columns = []
    for i in range(32):
        columns.append(gather_cell(i))
    while columns and columns[-1] is None:
        columns.pop()
    return columns


def _read_field_ref_grouped(ref, aliases=None):
    """per_instance 取数：返回「每个 topic 实例一组」的列表（不跨实例拼接）。

    每组是：标量字段 → 一维数组；定长数组字段 → 每元素一列的列表；缺失 → None。
    aliases 为该字段的备用命名（pyulog 字段改名/旧固件）：标量按整名回退，
    数组字段按 'stem[i]' / 'stem_i' 两种形态按下标展开。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None
    aliases = list(aliases or [])
    groups = []
    for d in ds:
        direct = getf(d, field, *aliases)
        if direct is not None and len(direct):
            groups.append(np.asarray(direct, dtype=float))
            continue
        stems = [field] + aliases
        cols = []
        for idx in range(32):
            col = None
            for stem in stems:
                v = getf(d, f"{stem}[{idx}]", f"{stem}_{idx}")
                if v is not None and len(v):
                    col = np.asarray(v, dtype=float)
                    break
            cols.append(col)
        while cols and cols[-1] is None:
            cols.pop()
        groups.append(cols if cols else None)
    return groups


# ---------------- compute 表达式求值（rules/*.yaml 的 compute 是表达式，不再是节点链）----------------
# 产物里存的**就是作者写的原文**（老写法在构建期被 rule-expr.mjs 编译成等价表达式）：
#   vibe_mean, vibe_p95, ..., imu_idx = worst_mean_stats(ref("...", per_instance=True), min_mean=0)
#   pct = frac * 100
#   p99_stat = p99 if seg_n > 50 else None
#   w_p95 = percentile(hypot(coalesce(ref("estimator_wind.windspeed_north", when_fw=">=1.15"), ...), p=95)
#
# 求值用 Python 自带的 ast，**不 eval 作者原文**：先按白名单遍历、把 topic.field 重写成
# 取数调用，再在空 __builtins__ 下 exec。构建期（web/scripts/lib/rule-expr.mjs）已经把
# 算子名/入参/变量声明校验过一遍，这里再查一遍是为了防"构建期放行、运行期能执行任意代码"
# 这类缝——两道关卡的判据不同，不能只留一道。

# 比 _ALLOWED_NODES 多出：赋值语句、调用、属性（字段引用）、三元、字典（算子选项）
_ALLOWED_COMPUTE = _ALLOWED_NODES + (
    ast.Module, ast.Assign, ast.Expr, ast.Store,
    ast.Call, ast.Attribute, ast.keyword, ast.IfExp, ast.Dict,
)


class _ComputeRefs(ast.NodeTransformer):
    """把表达式里裸写的 `topic.field` 重写成 `ref("topic.field")`。

    只接受 `Name.attr` 形态，且这个 Name **不能是已声明的变量**——否则 `变量.属性` 会去
    访问对象属性（那是任意能力，白名单不给）。构建期已经拦过一遍，这里是运行期的那道。
    """

    def __init__(self, env_keys):
        self.env_keys = env_keys

    def visit_Attribute(self, node):
        if not isinstance(node.value, ast.Name):
            raise ValueError("字段引用必须是 topic.field 形式")
        if node.value.id in self.env_keys:
            raise ValueError("%s 是变量名，不能当 topic 用" % node.value.id)
        return ast.copy_location(
            ast.Call(func=ast.Name(id="ref", ctx=ast.Load()),
                     args=[ast.Constant(value="%s.%s" % (node.value.id, node.attr))],
                     keywords=[]),
            node,
        )


def _compile_compute(stmt, env_keys):
    """一条 compute 表达式 → (code, guarded, targets)。校验不通过就抛异常。"""
    try:
        tree = ast.parse(stmt, mode="exec")
    except SyntaxError as err:
        raise ValueError("compute 表达式语法错误：%s" % err)
    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
        raise ValueError("compute 必须是一条赋值")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_COMPUTE):
            raise ValueError("compute 表达式含不允许的语法 %s" % type(node).__name__)
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("compute 只允许直接调用算子")
            if node.func.id not in OPERATORS and node.func.id not in ("ref", "_try", "has_topic"):
                raise ValueError("compute 调用了未注册的算子 %s" % node.func.id)

    assign = tree.body[0]
    if not isinstance(assign.targets[0], ast.Tuple):
        if not isinstance(assign.targets[0], ast.Name):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [assign.targets[0].id]
    else:
        if not all(isinstance(e, ast.Name) for e in assign.targets[0].elts):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [e.id for e in assign.targets[0].elts]

    # _try(...)：容错求值，等价于老节点的 optional: true——内层出错就整个赋 None，
    # 而不是中止整条规则。
    guarded = False
    val = assign.value
    if isinstance(val, ast.Call) and isinstance(val.func, ast.Name) and val.func.id == "_try":
        if len(val.args) != 1 or val.keywords:
            raise ValueError("_try() 只接受一个参数")
        guarded = True
        assign.value = val.args[0]

    tree = _ComputeRefs(set(env_keys)).visit(tree)
    ast.fix_missing_locations(tree)
    return compile(tree, "<compute>", "exec"), guarded, targets


# 表达式求值的名字表：算子按注册名直接可调用，另加 ref（取数）。
# __builtins__ 置空——表达式里不该有任何 Python 内置能力。
_COMPUTE_GLOBALS = {"__builtins__": {}, "ref": None}
_COMPUTE_GLOBALS.update(OPERATORS)


def _eval_compute(stmt, env):
    """求值一条 compute 表达式，结果写进 env。

    空值语义（与老节点链的唯一差别，**有意为之**）：
      老写法里 `optional: false` 的节点拿到 None 就整条规则中止，`optional: true` 的才允许
      None 继续传播。表达式写法里只有一条规则：**None 是值，照常传播**；要中止就让异常发生
      （拿 None 去比较/四则会抛 TypeError）。老写法靠 `_try(...)` 保留"允许 None"的那半边，
      另一半（无谓的中止）不保留——因为它只是让同样的结论晚一步消失，而"None 传播"更好读。

      实际影响面很窄：只有当某个表达式产出 None、而**下游又把这个 None 变成了别的值**
      （coalesce / choose / 三元）时才会看到差别；现有规则里这类位置都带 _try 守卫
      （6 条日志的冻结基线逐字段比对可证）。新写规则时若真的依赖"缺失即中止"，
      就显式写 `require_true(is_not_none(x))`——那正是它的用途。
    """
    code, guarded, targets = _compile_compute(stmt, env)
    try:
        exec(code, _COMPUTE_GLOBALS, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


def _ref(name, per_instance=False, instance=None, alias=None, when_fw=None):
    """字段取数：表达式里的 `ref("topic.field", ...)` 与裸写的 `topic.field` 都走这里。

    修饰与老节点上的同名选项一一对应，只是作用域从「整个节点」收窄到「这一个引用」：
      per_instance —— 按实例分组读（每实例一组），交给需要分组的算子
      instance     —— 只取第 N 个实例
      alias        —— 字段的备用命名（旧固件改过名）
      when_fw      —— 固件版本不满足就返回 None（交给 coalesce 选另一个分支）
    """
    if when_fw is not None and not _match_firmware(when_fw):
        return None
    aliases = None
    if alias is not None:
        aliases = [alias] if isinstance(alias, str) else list(alias)
    if per_instance or instance is not None:
        groups = _read_field_ref_grouped(name, aliases)
        if instance is not None:
            return groups[instance] if groups and len(groups) > instance else None
        return groups
    return _read_field_ref(name, aliases)


_COMPUTE_GLOBALS["ref"] = _ref
_COMPUTE_GLOBALS["has_topic"] = has_topic


def _collect_log_messages():
    """ulog.logged_messages → [{tSec, message, level, level_name}]。

    level 是 ULog 里的原始字节，PX4 填的是 **ASCII 数字**（'3'=51 才是 ERROR），
    与 pyulog 的 Message.log_level_str() 一致；因此经验文件按 level_name 判定，
    不要直接和 3/4 这种数字比（迁移前就是这么比错的，导致消息类经验从不命中）。
    """
    out = []
    for m in getattr(ulog, "logged_messages", []):
        try:
            ts_s = round((int(m.timestamp) - t0) / 1e6, 2)
        except Exception:
            ts_s = None
        lvl = int(getattr(m, "log_level", ord("6")))
        out.append({
            "tSec": ts_s,
            "message": str(m.message).strip(),
            "level": lvl,
            "level_name": _LOG_LEVEL_NAMES.get(lvl, "UNKNOWN"),
        })
    return out


def _rule_env():
    """日志级内置变量：经验里可直接引用，无需在 compute 里声明。"""
    return {
        "firmware": FW_LABEL,
        "fw_major": FW["major"], "fw_minor": FW["minor"], "fw_profile": FW_PROFILE,
        "airframe": vehicle_type,
        "is_rotary_wing": vehicle_type == "rotary_wing",
        "is_fixed_wing": vehicle_type == "fixed_wing",
        "is_vtol": "vtol" in vehicle_type,
        "is_rover": vehicle_type == "rover",
        "duration_s": duration_s if duration_s is not None else 0,
        "armed_s": armed_duration_s,
        "phases": phases_present,
        "tags": set(tags),
        "guard_tags": set(guard_tags),
        # 时序算子（如 head_tail_median_drop）按 armed 区间切窗用
        "armed_intervals": armed_intervals,
        # 事件类算子的相对时间（t=xx.x s）基准
        "t0_us": t0,
        # 是否有 armed 段（原过程式大量用 `if armed_intervals:` 做外层门控）
        "has_armed": bool(armed_intervals),
        # 本日志实际存在的 topic 名集合（表达式里可写 "'xxx' in topics"）
        "topics": _TOPIC_NAMES,
        # 同一件事的函数写法（更直白，见 has_topic 的定义）
        "has_topic": has_topic,
        # 数据质量事实（guards 类经验用）
        "restart_detected": restart_topics > 0,
        "dropout_ms": dropout_total_ms,
        # 日志消息（ulog.logged_messages）：供「日志消息聚合」类经验按级别筛选
        "messages": _collect_log_messages(),
        # compute 是否算不出来。初值 False；compute 失败后置真，再判一轮 `skip` 列表。
        # 于是"数据不足要记一条 skipped"不必再单设一个字段——它就是 skip 里的一条普通条件。
        "no_data": False,
    }


def _match_firmware(spec):
    """固件版本约束串：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。

    只给 `ref(..., when_fw=)` 用（规则级的适用范围轴已经改成表达式了）。
    """
    if not spec or spec == "any":
        return True
    if FW_MINOR is None:
        return True          # 版本未知不因版本排除（与迁移前“按字段存在性判定”一致）
    cur = (FW["major"] if FW["major"] is not None else 0, FW_MINOR)
    for part in str(spec).split(","):
        m = re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
        if not m:
            raise ValueError("无法解析 firmware 约束：%r" % spec)
        op, maj, mi = m.group(1) or "==", int(m.group(2)), int(m.group(3) or 0)
        want = (maj, mi)
        ok = {">=": cur >= want, "<=": cur <= want, ">": cur > want,
              "<": cur < want, "==": cur == want}[op]
        if not ok:
            return False
    return True


def _rule_skipped(rule, checks, env):
    """按顺序走规则的 `skip` 列表；命中第一条就返回 True（并视情况记一条 skipped）。

    每一项是 `{when: <Python 表达式>, reason?: <文案>}`——表达式与 `compute` / `triggers`
    同一套语法。写了 `reason` 就记一条 skipped（报告里能看到"为什么没跑"），**不写则静默**
    跳过（既不 ran 也不 skipped，用于"这本来就跟我无关"的场合）。

    会被调**两轮**：compute 之前一轮（此时 `no_data` 为假），compute 失败后再一轮
    （`env["no_data"]` 已置真）。所以"数据不足"也只是列表里的一条普通条件，
    不必再单设一个字段。
    """
    for spec in (rule.get("skip") or []):
        when = spec.get("when")
        if when is None:
            raise ValueError("规则 %s 的 skip 项缺少 when" % rule.get("id"))
        try:
            hit = bool(_eval_expr(when, env))
        except Exception:
            hit = False
        if not hit:
            continue
        if spec.get("reason"):
            for check in checks:
                skipped(check, spec["reason"])
        return True
    return False


def _run_rules(group):
    """执行声明了该 group 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 group **必须与
    它所替换的原过程式检查的位置一致**（vibration → ekf → power → cpu → gps →
    failsafe → mode_thrash …）；同一 group 内按 order / id 排序执行。
    """
    for _rule in RULES:
        if _rule.get("group") != group:
            continue
        _rid = _rule["id"]
        _checks = (_rule.get("emit") or {}).get("check")
        if _checks is None:
            _checks = []            # guards 类经验没有 check 名（不记 ran/skipped）
        elif not isinstance(_checks, list):
            _checks = [_checks]
        _env = _rule_env()
        # 适用范围两轴先判：固件 / 机架。**写成表达式**（不限就写 True），与 compute /
        # triggers 同一套语法——不再另设 "any" / ">=1.15" 这类小语言。
        # 不匹配则静默：既不 ran 也不 skipped（这是最外层的门，"这条经验根本不属于本机"
        # 不值得在报告里刷一条）。要留痕就把它写进 skip 映射。
        try:
            _axis_ok = bool(_eval_expr(_rule["firmware"], _env)) and \
                       bool(_eval_expr(_rule["airframe"], _env))
        except Exception:
            _axis_ok = False
        if not _axis_ok:
            continue
        # 再判「不适用」声明（机型未知、无 armed 段、缺某 topic …）：命中即跳过本条。
        # 写了文案的记一条 skipped——报告里能看到"为什么没跑"；写 null 的静默。
        if _rule_skipped(_rule, _checks, _env):
            continue
        # requires.any_of / all_of：分别表示“任一存在即可”与“必须都存在”的依赖 topic
        # （多版本同义 topic 用 any_of，如 estimator_wind / wind_estimate）。缺则 skipped。
        _req = _rule.get("requires") or {}
        _need_any = _req.get("any_of") or []
        _need_all = _req.get("all_of") or []
        _missing = (bool(_need_any) and not any(find_all(ulog, t) for t in _need_any)) or \
                   (bool(_need_all) and not all(find_all(ulog, t) for t in _need_all))
        if _missing:
            _need_txt = list(_need_any) + list(_need_all)
            for _check in _checks:
                skipped(_check, _req.get("reason") or ("缺少依赖 topic：%s" % ", ".join(_need_txt)))
            continue
        # topic 在就 ran（与原过程式块一致：ran() 在块首，数据不足只代表不发射 finding）。
        # ran_on_success：原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在
        # 活跃通道 >= 4 时才算“跑过”），这类规则改为 compute 成功后再记 ran。
        _ran_late = bool(_rule.get("ran_on_success")) or _rule.get("ran_when") is not None
        if not _ran_late:
            for _check in _checks:
                ran(_check)

        _ok = True
        for _stmt in (_rule.get("compute") or []):
            # compute 是**表达式**（构建期把老节点写法编译成等价表达式，产物里只有这一种形态）。
            # 求值出来的名字进 _env，供后面的表达式与 triggers / emit 引用。
            try:
                _eval_compute(_stmt, _env)
            except Exception:
                # 数据不足（或该表达式在这份日志上求不出来）：按"数据不足"中止本条规则，
                # 与原节点链一致——不发射 finding
                _ok = False
                break
        if not _ok:
            # 数据不足也要能留痕：把 no_data 置真再判一轮 skip（原 skip_reason_no_data 的职责）
            _env["no_data"] = True
            _rule_skipped(_rule, _checks, _env)
            continue
        if _ran_late:
            # 原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在活跃通道 >= 4 时
            # 才算“跑过”、attitude 只在机动段样本足够时才算）。ran_when 可再给条件。
            _ran_ok = True
            if _rule.get("ran_when") is not None:
                try:
                    _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
                except Exception:
                    _ran_ok = False
            if _ran_ok:
                for _check in _checks:
                    ran(_check)

        _emit = _rule["emit"]
        # emit.guard_tags：按条件产生的数据质量标签（等价于原过程式的 guard_tags.append，
        # 不依赖是否发出 finding——如陀螺零偏的“温度变化大”）
        for _gspec in (_emit.get("guard_tags") or []):
            try:
                _g_hit = _eval_expr(_gspec["when"], _env)
            except Exception:
                _g_hit = False
            if _g_hit and _gspec.get("tag") and _gspec["tag"] not in guard_tags:
                guard_tags.append(_gspec["tag"])
        for _key, _spec in (_emit.get("stats") or {}).items():
            _v = _env.get(_spec["var"])
            if _v is None:
                continue
            metrics[_key] = round(float(_v), int(_spec["round"])) if "round" in _spec else _v

        # foreach: 把一条规则算出的「事件列表」展开成多条 finding（如 failsafe 的每次边沿）。
        # 事件 dict 的键会叠加进模板环境，所以文案仍写在经验文件里；
        # 每个事件最多命中一条 trigger（自上而下第一条），与单事件规则一致。
        # foreach 支持两种写法：`foreach: events` 或
        # `foreach: {var: events, keys: [t_s]}`（后者让构建期能校验事件键的占位符）
        _for_spec = _rule.get("foreach")
        _for_key = _for_spec.get("var") if isinstance(_for_spec, dict) else _for_spec
        if _for_key:
            _items = _env.get(_for_key) or []
        else:
            _items = [None]
        for _item in _items:
            _tenv = _env
            if _item is not None:
                if not isinstance(_item, dict):
                    continue
                _tenv = dict(_env)
                _tenv.update(_item)
            for _trig in (_rule.get("triggers") or []):
                # 单条触发条件出错（例如表达式把缺失值 None 与数值比较）不应让整份日志
                # 的分析崩掉：视为未命中，继续下一条。这类错误应当在基线回归里暴露。
                try:
                    _hit = _eval_expr(_trig["when"], _tenv)
                except Exception:
                    _hit = False
                if not _hit:
                    continue
                # 证据值就是一个**表达式**：写变量得原值、写 f"{x:.3f}" 得格式化后的串、
                # 写常量就得到常量。原先的 value / value_const / value_text 三个字段
                # 加一个 round 开关，收成了这一个。
                _val = None
                if _trig.get("value") is not None:
                    try:
                        _val = _eval_expr(str(_trig["value"]), _tenv)
                    except Exception:
                        _val = None
                _field = _trig["field"]
                if "{" in _field:
                    _field = _field.format_map(_tenv)
                # suggestion 同样允许占位符（如 "涉及：{names}。"），与 title 一致
                _sugg = _trig.get("suggestion")
                if _sugg and "{" in _sugg:
                    _sugg = _sugg.format_map(_tenv)
                add(_trig["severity"], _rid, _trig.get("tag", _emit.get("tag")),
                    _trig["title"].format_map(_tenv), _field, _val,
                    _trig.get("threshold"), _trig.get("unit"),
                    _emit.get("doc"), _sugg)
                # evidence_extra: {evidence 键: 变量名}，把额外证据挂到刚发出的 finding 上
                # （如日志消息的 samples 原文列表）
                for _ek, _evn in (_trig.get("evidence_extra") or {}).items():
                    _evv = _tenv.get(_evn)
                    if _evv is not None:
                        findings[-1]["evidence"][_ek] = _evv
                break


# guards_early：必须在其它规则之前跑，保证 insufficient_data 是第一个 guard 标签
# ---------------- 按 facts.yaml 的 group_order 顺序执行各 group ----------------
# 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
# （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
# 新增经验只需把 group 写进 knowledge/px4/facts.yaml 的 group_order（或复用已有 group）
# 并让经验里的 group 对上——**不用改这个文件**；构建期会校验 group 是否都已登记。
for _group in FACTS["group_order"]:
    _run_rules(_group)

# ---------------- 第三层：故障知识库确定性匹配 ----------------
def match_fault_kb():
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger_tags", [])
        phases = e.get("flight_phase", ["all"])
        excl = e.get("exclude_tags", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        if "all" not in phases:
            if not any(p in phases_present for p in phases):
                continue
        matched.append({
            "faultId": e["fault_id"],
            "faultTag": e["fault_tag"],
            "riskLevel": e.get("risk_level", ""),
            "possibleRootCause": e.get("possible_root_cause", []),
            "troubleshootingSteps": e.get("troubleshooting_steps", []),
            "note": e.get("note", ""),
            "matchedPhases": [p for p in phases if p == "all" or p in phases_present],
        })
    return matched

# 短日志由 guard 标签派生（阈值的唯一来源是 guard-short-log.yaml）
short_log = "insufficient_data" in guard_tags
matched_faults = [] if short_log else match_fault_kb()

# ---------------- 概览指标（knowledge/px4/facts.yaml 的 metrics）----------------
# 规则顺带产出的实测值优先（更贴合判定口径）；规则没跑（缺字段 / 机型不适用）时按声明兜底现算，
# 这样用户在「关键数据」里始终看得到数，不会因为某条规则 skip 就凭空少几项。
_M_RESERVED = {"key", "label", "unit", "topic", "field", "fields", "op", "pick", "scale", "round"}


def _metric_fallback(m):
    """按声明现算一个概览指标；任何一步缺失都返回 None（这一项就不显示）"""
    try:
        topic = m.get("topic")
        if not topic:
            return None
        d_list = find_all(ulog, topic)
        if not d_list:
            return None
        fields = m.get("fields") or ([m["field"]] if m.get("field") is not None else [])
        if not isinstance(fields, list):
            fields = [fields]
        args = []
        for cand in fields:
            names = cand if isinstance(cand, list) else [cand]   # 候选字段名：取第一个存在的
            col = None
            for n in names:
                col = getf(d_list[0], n)
                if col is not None:
                    break
            if col is None:
                return None
            args.append(np.asarray(col, dtype=float))
        name = m.get("op")
        if name not in OPERATORS:
            return None
        res = OPERATORS[name](*args, **{k: v for k, v in m.items() if k not in _M_RESERVED})
        if res is None:
            return None
        pick = m.get("pick")
        if pick:
            outs = list(res) if isinstance(res, tuple) else [res]
            out_names = SIGNATURES.get(name, {}).get("out_names") or []
            if pick not in out_names:
                return None
            res = outs[out_names.index(pick)]
        val = float(res)
        if m.get("scale") is not None:
            val = val * float(m["scale"])
        if "round" in m:
            _r = int(m["round"])
            val = round(val, _r)
            return int(val) if _r == 0 else val   # round(x, 0) 仍是 float，整数量要转回 int
        return val
    except Exception:
        return None


_metric_entries = []
_declared = set()
for _m in FACTS.get("metrics", []):
    _key = _m.get("key")
    if not _key:
        continue
    _declared.add(_key)
    _val = metrics.get(_key)
    if _val is None:
        _val = _metric_fallback(_m)
    if _val is None:
        continue
    _entry = {"key": _key, "label": _m.get("label", _key), "value": _val}
    if _m.get("unit"):
        _entry["unit"] = _m["unit"]
    _metric_entries.append(_entry)
# 规则产出、但没在 facts.yaml 里声明的（别丢，直接用键名当名字）
for _key, _val in metrics.items():
    if _key not in _declared:
        _metric_entries.append({"key": _key, "label": _key, "value": _val})

order = {"critical": 0, "warning": 1, "info": 2}
findings.sort(key=lambda f: order.get(f["severity"], 9))

__result = json.dumps({
    "platform": "PX4",
    "parserVersion": "pyulog/pyodide-0.3.0",
    # 事实层产出：facts=日志是什么（离散，驱动判定）；metrics=关键数字（有序，带中文名与单位）
    "facts": facts,
    "metrics": _metric_entries,
    # 判定层产出（规则与故障库）
    "tags": tags,
    "guardTags": guard_tags,
    "checksRun": checks_run,
    "checksSkipped": checks_skipped,
    "matchedFaults": matched_faults,
    "findings": findings,
}, ensure_ascii=False)
