// ⚠️ 自动生成，请勿手改。源文件在 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
export const PY_ULG_DATA_HELPERS = String.raw`
# ============ 通用工具 ============
def _np_find(topic, instance):
    for d in ulog.data_list:
        if d.name == topic and d.multi_id == instance:
            return d
    return None

def _clean(v):
    """numpy / NaN / Inf -> JSON 安全的 Python 原生结构（NaN 转 None）。"""
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not np.isfinite(v):
        return None
    return v

def _lttb_indices(n, max_points, ref=None):
    """LTTB 降采样索引（含首尾）。ref 为参考信号（NaN 安全，仅用于选点）。"""
    if n <= max_points or max_points < 3:
        return list(range(n))
    if ref is None:
        ref = np.zeros(n)
    r = np.asarray(ref, dtype=float)
    finite = np.isfinite(r)
    if finite.any():
        r = np.where(finite, r, np.nanmean(r[finite]))
    else:
        r = np.zeros(n)
    bucket = n / (max_points - 2)
    idx = [0]
    a = 0
    for i in range(max_points - 2):
        ts = int(np.floor((i + 1) * bucket))
        te = int(np.floor((i + 2) * bucket))
        ts = min(ts, n - 1); te = min(te, n)
        if te <= ts:
            te = ts + 1
        # 下一桶均值点
        nx = np.mean(np.arange(ts, te))
        ny = float(np.mean(r[ts:te])) if te > ts else float(r[ts])
        best, best_d = ts, -1.0
        for j in range(ts, te):
            area = abs((a - nx) * (float(r[j]) - float(r[a])) -
                       (a - j) * (ny - float(r[a])))
            if area > best_d:
                best, best_d = j, area
        idx.append(best)
        a = best
    idx.append(n - 1)
    return idx

# ============ np_manifest：话题清单（驱动前端预设可用性）============
def np_manifest():
    global __result
    items = []
    for d in ulog.data_list:
        items.append({
            "topic": d.name,
            "instance": int(d.multi_id),
            "n": int(len(d.data["timestamp"])),
            "fields": [{"name": k, "dtype": str(getattr(v, "dtype", type(v).__name__))}
                       for k, v in d.data.items() if k != "timestamp"],
        })
    __result = json.dumps({"topics": items}, ensure_ascii=False)

# ============ np_series：按需抽取 + LTTB 降采样 ============
def np_series(topic, instance, fields_json, max_points=3000):
    global __result
    fields = json.loads(fields_json)
    d = _np_find(topic, int(instance))
    if d is None:
        __result = json.dumps({"error": "topic not found: %s#%d" % (topic, instance)})
        return
    ts = np.asarray(d.data["timestamp"], dtype=np.int64)
    n = len(ts)
    ref = None
    for f in fields:
        if f in d.data:
            ref = d.data[f]
            break
    idx = _lttb_indices(n, int(max_points), ref)
    t0 = int(ulog.start_timestamp) if getattr(ulog, "start_timestamp", 0) else int(ts[0])
    out = {
        "topic": topic, "instance": int(instance),
        "t0us": t0,
        "t": [round((int(ts[i]) - t0) / 1e6, 3) for i in idx],
        "series": {},
        "fullCount": n,
    }
    for f in fields:
        if f in d.data:
            v = d.data[f]
            vv = np.asarray(v, dtype=float)
            out["series"][f] = [_clean(vv[i]) for i in idx]
        else:
            out["series"][f] = None
    __result = json.dumps(out, ensure_ascii=False)

# ============ 飞行模式枚举（PX4 commander vehicle_status_s）============
NAV_STATE_NAMES = {
    0: "Manual", 1: "Altitude", 2: "Position", 3: "Mission", 4: "Hold",
    5: "Return", 6: "Position Slow", 7: "Free5", 8: "Free4", 10: "Acro",
    11: "Free3", 12: "Descend", 13: "Termination", 14: "Offboard",
    15: "Stabilized", 16: "Free2", 17: "Takeoff", 18: "Land", 19: "Free1",
    20: "Follow", 21: "Orbit", 22: "VTOL Takeoff",
}
ARMING_STATE_NAMES = {0: "Disarmed", 1: "Standby", 2: "Armed", 3: "Standby Error", 4: "Shutdown"}

def _phases():
    d = _np_find("vehicle_status", 0)
    if d is None:
        return []
    ts = np.asarray(d.data["timestamp"], dtype=np.int64)
    t0 = int(ulog.start_timestamp) if getattr(ulog, "start_timestamp", 0) else int(ts[0])
    nav = d.data.get("nav_state")
    arm = d.data.get("arming_state")
    if nav is None:
        return []
    nav = np.asarray(nav)
    arm = np.asarray(arm) if arm is not None else None
    runs = []
    start = 0
    for i in range(1, len(nav)):
        if int(nav[i]) != int(nav[start]):
            runs.append((start, i - 1))
            start = i
    runs.append((start, len(nav) - 1))
    phases = []
    for a, b in runs:
        code = int(nav[a])
        seg_arm = int(np.median(arm[a:b + 1])) if arm is not None else None
        phases.append({
            "startSec": round((int(ts[a]) - t0) / 1e6, 2),
            "endSec": round((int(ts[b]) - t0) / 1e6, 2),
            "navState": code,
            "mode": NAV_STATE_NAMES.get(code, "Mode %d" % code),
            "armed": seg_arm == 2,
        })
    return phases

# ============ np_log_info：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
LOG_LEVEL_NAMES = {0: "EMERGENCY", 1: "ALERT", 2: "CRITICAL", 3: "ERROR",
                   4: "WARNING", 5: "NOTICE", 6: "INFO", 7: "DEBUG"}
SYS_INFO_KEYS = [
    "sys_name", "ver_sw", "ver_sw_release", "ver_vendor_sw_release",
    "ver_hw", "ver_hw_subtype", "sys_os_name", "sys_os_ver",
    "sys_toolchain", "sys_toolchain_ver", "sys_mcu", "time_start_utc",
    "duration", "git_branch",
]

def np_log_info():
    t0 = int(getattr(ulog, "start_timestamp", 0) or 0)
    info = ulog.msg_info_dict if hasattr(ulog, "msg_info_dict") else {}
    sys_info = {k: str(info[k]) for k in SYS_INFO_KEYS if k in info}

    messages = []
    for m in ulog.logged_messages:
        lvl = int(getattr(m, "log_level", 6))
        try:
            lstr = m.log_level_str()
        except Exception:
            lstr = LOG_LEVEL_NAMES.get(lvl, "LEVEL %d" % lvl)
        messages.append({
            "tSec": round((int(m.timestamp) - t0) / 1e6, 2),
            "level": lvl,
            "levelStr": str(lstr),
            "message": str(m.message).strip(),
        })

    dropouts = [{"tSec": round((int(d.timestamp) - t0) / 1e6, 2), "durationMs": int(d.duration)}
                for d in ulog.dropouts]

    params = {str(k): _clean(np.asarray(v).reshape(-1)[0]) if hasattr(v, "reshape") else _clean(v)
              for k, v in ulog.initial_parameters.items()}

    changed = []
    cp = getattr(ulog, "changed_parameters", None)
    if cp is None:
        cp = getattr(ulog, "_changed_parameters", [])
    for p in cp:
        changed.append({
            "tSec": round((int(getattr(p, "timestamp", t0)) - t0) / 1e6, 2),
            "name": str(getattr(p, "name", "")),
            "value": _clean(getattr(p, "value", None)),
        })

    global __result
    __result = json.dumps({
        "sysInfo": sys_info,
        "messages": messages,
        "dropouts": dropouts,
        "params": params,
        "changedParams": changed,
        "phases": _phases(),
    }, ensure_ascii=False)
`;
