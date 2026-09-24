---
date: 2026-09-24T08:00:00+08:00
lastmod: 2026-09-24T12:10:00+08:00
---

# 知识引擎 API 实施计划（并入 provider 契约）

**决策**（2026-09-24 与老大确认，两条）：

1. 本文档的函数接口与内置变量**直接并入** `engine/providers/api.py` 的
   REQUIRED / OPTIONAL / BUILTIN_VARIABLES，由各适配器实现；不另起 facade 中间层。
2. **旧 API 一律退场，不做双轨**：引擎内部调用点全部迁到本文档的新名
   （`get_topic_data`→`get_dataset`、`get_logged_information`→`get_info_dict`、
   `get_logged_messages`→`get_logged_events`、`get_flight_phases`→并入 `get_mode_changed`），
   旧名从契约与代码里**删除**，不留委托副本——同一份能力只许有一个名字。

首版同时交付 **PX4（补齐）+ ArduPilot（新建）** 两个适配器。**两条均已执行完毕**（见文末落地结果）。

## 一、命名 reconciliation

最终形态：**新名是唯一名**。原内部调用点（rule_engine / px4.py 内部 / report_data /
runner）全部改用新名；旧名没有"保留过渡期"，直接删除。文档拼写错误按规范名落地：

| 文档原名                                                                                                  | 落地名                                                                     | 处理                                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `get_dataset`                                                                                             | `get_dataset`                                                              | REQUIRED；原 `get_topic_data` **改名而来**（原地重命名，非委托副本），旧名已删 |
| `get_serials`                                                                                             | **不落地**（与现有 `get_series` 同义，`serials` 望文生义成"序列号"）       | 已有                                                                           |
| `get_inital_parameters`                                                                                   | `get_initial_parameters`                                                   | 已有                                                                           |
| `get_firmwre_version`                                                                                     | `get_firmware_version`                                                     | REQUIRED 新增                                                                  |
| `get_params_decription`                                                                                   | `get_parameter_description`                                                | OPTIONAL 新增                                                                  |
| `AIRFAME_ID`（内置变量）                                                                                  | `AIRFRAME_ID`                                                              | 拼写修正                                                                       |
| `VEHICLE_TYPE`（内置变量）                                                                                | **不落地**——与现有 `VEHICLE` 同义不同词表，孪生名                          | 已有                                                                           |
| （引擎内部旧名）`get_topic_data` / `get_logged_information` / `get_logged_messages` / `get_flight_phases` | `get_dataset` / `get_info_dict` / `get_logged_events` / `get_mode_changed` | **旧名退场**：全仓代码零定义、零调用（仅注释记录改名史）                       |

`get_mode_changed` 的语义注意：原 `get_flight_phases` 的秒级形态（报告页阶段条）由
`get_mode_changed()` 的 µs 形态换算，切段只有 `_read_data_list()` 一处。

## 二、契约落点

**REQUIRED（两份适配器都必须实现；取不到返回 None，不抛异常）**

- timestamp：`get_start_timestamp` / `get_last_timestamp` / `get_time_bounds`
  （`{start_us, end_us, duration_s, has_wraparound}`）
- dataset：`get_dataset` / `get_dataset_description` / `get_field_dtype` /
  `get_field_sizeof`（单元素字节数）/ `get_field_unit`（查不到返回 None，不说谎）
- param：`get_changed_parameters`（`[{tSec, name, value}]`）
- position：`get_home_position` / `get_ref_position`
- event：`get_logged_events(t_start, t_end, level, pattern)` /
  `get_mode_changed`（µs 区间）/ `get_armed_changed`（µs 区间）
- version/identity：`get_firmware_version` / `get_version_info` /
  `get_version_info_str` / `get_vehicle_identity`
- integrity：`get_log_integrity` / `has_file_corruption`

**OPTIONAL（缺席则对应能力隐藏）**：`has_data_appended` / `get_parameter_description`（v1 无数据源，返回 None）

**内置变量新增 10 键**：`SYS_UUID` / `AIRFRAME_ID` / `HOME_LAT` / `HOME_LON` / `HOME_ALT` /
`SW_VER` / `SW_VER_HASH` / `HW_VER` / `HW_VER_SUBTYPE` / `FLIGHT_TIME_S`

## 三、PX4 实现要点

- `get_start/last_timestamp`：`_read_data_list` 已算 t_min/t_max，补存 `t_max_us`
- `get_dataset_description`：委托 pyulog `message_formats`（已核实在装版本有此 property）
- `get_field_sizeof`：委托 `ULog.get_field_size(type_str)`（同上核实）
- `has_data_appended` / `has_file_corruption`：pyulog 同名 property（已核实）
- `get_field_unit`：读构建期注入的字段单位表（只含规则/图里写了 `unit=` 的字段），
  其余返回 None——如实标注，不冒充全量
- home = `vehicle_global_position` 首个有效定位（armed 起点之后优先）；
  ref = `vehicle_local_position.ref_lat/ref_lon/ref_alt` 首个非零三元组。两概念分开，注释写明来源
- `get_changed_parameters` 从 `report_materials` 内联逻辑提取为方法（同一件事只写一处）

## 四、ArduPilot 实现要点（engine/providers/ardupilot.py）

- AP_Logger .bin **格式自描述**：解析器按 FMT 表通解，不逐消息硬编码；
  消息一律按 **FMT 名字**（MSG/PARM/EV/MODE/GPS…）查表，不写死消息 ID
- 长度约定自校准：用第一条 FMT 消息自己的 Length 字段判断"含不含 3 字节头"
- 两遍扫描：先收 FMT 定义，再按格式解码；`TimeUS` 映射为 `timestamp` 列
  （**守卫对 timestamp 的要求是条件的**：FMT 声明了时间字段才要求——AP_Logger 的
  FILE 等内部传输消息没有 TimeUS，见第五节）
- 轨迹 = GPS 消息（`Status>=3` 过滤）；阶段 = MODE 消息切段；armed = EV 事件 10/11，
  回退 STAT.Armed 状态沿，都没有就如实空
- report_materials 给出参数/消息/阶段/消息类型统计（按 FMT 名计数）

## 五、守卫自证（四道合起来）

1. 构建期 AST：`build-knowledge.mjs` 自动要求每个 provider 定义新 REQUIRED 方法、
   `builtin_variables()` 含新键（已存在的机制，自动生效）
2. 运行期：`check_provider()` 补 `get_time_bounds` 形状断言
3. 契约测试 `tools/engine/guard-px4log-provider.py`（曾几度搬家：calibrate→guards→engine，
   以 checklist.yml 为准）：
   - **修复既有恒绿**：第 7 步 `hasattr(p, "phases")` / `"dropouts"` 查的属性名根本不存在，
     可选能力检查从来只跳过不检查——改为查真实方法
   - 新增第 9 步：时间边界自洽（duration 从 bounds 推导，与 start/end 同口径）、
     dtype/sizeof 与 meta 自洽、integrity 与 `DROPOUT_MS` 对表、armed_changed 与 `ARMED_INTERVALS` 对表
   - 第 2 步 timestamp 断言是**条件的**（FMT 声明了时间字段才要求 timestamp 列）——
     PX4 时代"所有 topic 都有 timestamp"在跨格式下不成立（12 份真实 APM 日志踩过）
   - `--apm`：用 `tools/calibrate/apm_make_sample.py` 合成一份最小 .bin 跑同一套断言
     （夹具生成器在 tools/calibrate/，guard 搬家后在导入处显式补 sys.path）
4. 变异自证：守卫落地后临时破坏一个契约方法，确认恰好对应断言变红，再还原。**尚未跑**（挂账）

runner（`tools/px4log_engine_runner.py`）从硬编码 px4.py 改为自动扫描 `providers/*.py`（与构建一致）。

## 六、风险与待验证（不粉饰）

1. ~~仓库里没有任何真实 ArduPilot .bin~~ **已解决**（2026-09-24）：36 份 autotest SITL 日志
   落在 `.cache/ardupilot/logs/`（Copter/Plane/Rover），全部过契约守卫。真实样本对账修掉两个假设：
   - 固件版本：MSG 横幅 `ArduCopter V4.8.0-dev (hash)`；`FORMAT_VERSION` 参数是 DataFlash
     **日志格式版本**（120/13），绝不可当固件版本（原实现踩过，已删）
   - armed：autotest Copter 日志不写 ARMED/DISARMED 事件且无 ARM/STAT → 加 STAT.Armed 回退；
     EV 码 10/11 经 AP_Logger.h 官方源码核对无误
   - 仍未逐字段验证：格式字符缩放、FRAME_CLASS 全表、FMTU 乘子（**只解析不应用**）
2. **APM 无规则资产**：`rules/*.yaml` 是 PX4 经验，APM 日志会出报告但检查全部记 skipped——预期行为
3. **facts.yaml 是 PX4 的**：APM 适配器拿到的 cfg 是 PX4 facts，v1 不读它（机架码表 v1 内联，待迁 `knowledge/apm/`）
4. `get_field_unit` 只覆盖构建期收录字段，不是全量单位表
5. 跑构建后 derived-version 产物必变（引擎源码哈希），老存档会重解析——预期
6. **Rover/Boat 等机架**：FRAME_CLASS=1 在 Copter 语境=Quad、Rover 语境=Rover，v1 的
   `vehicle_type` 不区分载具类型语境——autotest Rover 日志会显示 rotary_wing 或 unknown(N)，待 `knowledge/apm/` 修

## 七、验收

- [x] 构建期：构建期契约检查通过（两个 provider 都过 REQUIRED/builtin 检查；31 规则 / 73 算子）
- [x] 运行期：`check_provider` 对两格式都过
- [x] 契约测试：真实 PX4 日志 + **36 份真实 APM 日志** + 合成 APM 全绿（333 checks）
- [ ] 守卫会红：破坏任一新方法 → 对应断言失败（**未跑**，`mutate_guards` 对该层未执行）
- [x] 本地回归：runner 对真实 PX4 日志 `np_report()` 正常（20 份全过）

## 八、落地结果（2026-09-24）

- 契约：新名并入 `api.py` REQUIRED/OPTIONAL/BUILTIN_VARIABLES；旧名删除，全仓代码
  零定义、零调用（`knowledge/px4/CLAUDE.md` 与本文档的陈旧引用已同步清理）
- 顶层命名空间防互踩：两个 provider 拼进同一命名空间执行，APM 的 `_MAGIC` 曾被 PX4
  同名常量覆盖 → 改名 `_APM_MAGIC`；构建期撞名守卫**未做**（挂账）
- 真实样本：36 份 APM + 2 份 PX4 守卫全绿；PX4 规则回归 20 份 exit 0
- **源头 spec 已重写为终版**（2026-09-24 12:44）：《[知识引擎 API（最终版）](engine-api-rework.md)》从"想法稿"
  改写为按落地契约组织的正式 API 规范（含每方法的 PX4/APM 数据源、失败语义、
  命名取舍记录与验证结果）；实施细节仍以本文档为准
- 顺带修掉 `api.py` REQUIRED 字典里 `get_dataset` / `get_logged_events` 的**重复键**
  （Python 字典字面量后键静默覆盖前键——正是 `_MAGIC` 互踩同类；两份文档当时一致，
  行为未变，但双份事实源已删）
