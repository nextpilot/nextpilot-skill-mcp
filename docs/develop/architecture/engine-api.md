---
date: 2026-09-24T02:27:39+08:00
lastmod: 2026-09-24T12:44:00+08:00
---

# 知识引擎 API（最终版，已落地）

> **状态**：已落地（2026-09-24）。接口并入 `engine/providers/api.py` 契约，由
> `Px4Provider`（补齐）与 `ArduPilotProvider`（新建）双实现。
> 本文是这套 API 的唯一文档：规范、实现要点、命名取舍与验证结果都在这里。
>
> **两条硬决策**：
>
> 1. 本 API 直接长在 provider 契约上，**不另起 facade 中间层**——文档里的名字就是
>    `api.py` REQUIRED/OPTIONAL 里的名字，单一事实源。
> 2. **旧 API 一律退场，不做双轨**：`get_topic_data` / `get_logged_information` /
>    `get_logged_messages` / `get_flight_phases` 已从契约与代码删除，全仓零定义、
>    零调用。引擎内部调用点全部用本文的新名。

## 通用语义（两格式一致）

- **取不到不抛异常**：返回 `None`（单个对象）/ `[]`（列表）/ `{}`（字典），
  "这份日志没有这个数据"是个正常答案。
- **时间戳两套单位**：查询 API 一律 µs（`*_us`）；面向展示/规则的条目字段用相对秒（`tSec`）。
- **时基格式自定**：PX4 时间戳是开机起算，APM 是 TimeUS——`get_start_timestamp()`
  给出各自原点，上层算相对时刻一律从它推导。
- **单位诚实**：查不到单位/类型/位置就返回 `None`，不许编一个空值糊弄。

## 函数接口

### REQUIRED（每个适配器必须实现）

| 分类      | 函数                                                                                  | PX4 数据源                                 | APM 数据源                  | 说明                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| timestamp | `get_start_timestamp() -> int\|None`                                                  | `start_timestamp`（头部）                  | TimeUS 首值                 | 日志第一条消息的时间戳（µs）                                                                                                                         |
| timestamp | `get_last_timestamp() -> int\|None`                                                   | data_list 末时间戳                         | TimeUS 末值                 | 日志最后一条消息的时间戳（µs）                                                                                                                       |
| timestamp | `get_time_bounds() -> dict`                                                           | 同上合成                                   | 同上合成                    | `{start_us, end_us, duration_s, has_wraparound}`；`duration_s` **从 start/end 推导**（同口径）；`has_wraparound`=有 topic 时间戳回退（疑似中途重启） |
| dataset   | `has_topic(name) -> bool`                                                             | data_list                                  | FMT 表                      | 有没有这个消息/话题                                                                                                                                  |
| dataset   | `get_topic_meta() -> list[dict]`                                                      | data_list                                  | FMT 表+计数                 | `[{name, instance, n, fields:[{name, dtype}]}]`，驱动曲线可用性                                                                                      |
| dataset   | `get_dataset(topic, instance=0) -> dict\|None`                                        | `data_list[topic]`                         | 按名解码的行集              | 某实例的**原样列** `{列名: 数组}`（含 `'field[0]'` 数组列）。**原 `get_topic_data` 的改名**                                                          |
| dataset   | `get_series(ref, instance=…, alias=…)`                                                | 同上取列                                   | 同上                        | 按 `'topic.field'` 取 1-D 序列                                                                                                                       |
| dataset   | `get_first_existing_column(topic, names)`                                             | data_list                                  | 同上                        | 概览指标兜底取数                                                                                                                                     |
| dataset   | `get_dataset_description(topic=None) -> dict\|None`                                   | pyulog `message_formats`                   | FMT 表                      | 格式声明 `{name: {name, fields:[{name, type}]}}`（含本日志没录到的消息类型）                                                                         |
| dataset   | `get_field_dtype(topic, field) -> str\|None`                                          | meta                                       | FMT 格式字符→dtype 名       | 如 `float32` / `uint8`                                                                                                                               |
| dataset   | `get_field_sizeof(topic, field) -> int\|None`                                         | `ULog.get_field_size`                      | 格式字符长度表              | 单元素字节数（数组字段是每元素大小，不是整列）                                                                                                       |
| dataset   | `get_field_unit(topic, field) -> str\|None`                                           | 构建期收录的单位表                         | 无（返回 None）             | 源单位规范名。**只含构建期收录字段**，查不到如实 None                                                                                                |
| param     | `get_initial_parameters() -> dict`                                                    | `initial_parameters`                       | PARM 消息                   | 初始参数表 `{param: value}`                                                                                                                          |
| param     | `get_changed_parameters() -> list[dict]`                                              | `changed_parameters`                       | v1 返回 []                  | `[{tSec, name, value}]` 运行中变更                                                                                                                   |
| info      | `get_info_dict() -> (dict, dict)`                                                     | `msg_info_dict` + `msg_info_multiple_dict` | 无 → `({}, {})`             | **二元组** `(info, info_multi)`：键值对（如 ver_sw）+ 多值信息（'M' 消息）                                                                           |
| event     | `get_logged_events(t_start=None, t_end=None, level=None, pattern=None) -> list[dict]` | `logged_messages`                          | MSG(INFO) + ERR(ERROR) 合成 | `[{tSec, message, level, level_name}]`，四过滤参数可省。**原 `get_logged_messages` 的改名**                                                          |
| event     | `get_mode_changed() -> list[dict]`                                                    | `vehicle_status` nav_state 切段            | MODE 消息切段               | `[{t_start_us, t_end_us, mode, ...}]` 连续模式区间（µs）。**原 `get_flight_phases` 并入此名**（报告页秒级形态由它换算，切段只有一处）                |
| event     | `get_armed_changed() -> list[dict]`                                                   | arming_state 切段                          | EV 10/11 → STAT.Armed 回退  | `[{t_start_us, t_end_us}]` 解锁/上锁区间（µs）；end 不会是 None（日志截止封口）                                                                      |
| position  | `get_home_position() -> dict\|None`                                                   | `vehicle_global_position` 首个有效定位     | GPS 首个有效定位            | `{lat, lon, alt, ...}`。**Home 与 ref 是两个概念，分开取**                                                                                           |
| position  | `get_ref_position() -> dict\|None`                                                    | `vehicle_local_position.ref_*`             | 无（返回 None）             | 局部 NED 参考原点 `{lat, lon, alt}`                                                                                                                  |
| version   | `get_firmware_version() -> dict\|None`                                                | `ver_sw` 解析                              | MSG 横幅 / VER 消息         | `{major, minor, patch, git}`。⚠️ APM 的 `FORMAT_VERSION` 参数是 DataFlash 日志格式版本（120/13），**不是固件版本**，不可作回退                       |
| version   | `get_version_info() -> tuple\|None`                                                   | 同上                                       | 同上                        | `(major, minor, patch, type)`                                                                                                                        |
| version   | `get_version_info_str() -> str\|None`                                                 | 同上                                       | 同上                        | 展示串，如 `1.15.4` / `4.8.0-dev`                                                                                                                    |
| identity  | `get_vehicle_identity() -> dict\|None`                                                | `AIRFRAME`/`ver_hw` 等                     | FRAME_CLASS 等              | `{frame_type, vehicle_type, uid, hardware, ...}`                                                                                                     |
| identity  | `get_log_type() -> str`                                                               | 文件头 magic                               | 文件头 magic                | 格式标识（`px4` / `apm`）                                                                                                                            |
| integrity | `get_log_integrity() -> dict`                                                         | dropouts + walked_to_end 合成              | v1 近似                     | `{total_dropout_ms, n_gaps, gaps:[{t_us, duration_us}], end_reached}`                                                                                |
| integrity | `has_file_corruption() -> bool`                                                       | pyulog `file_corruption` property          | 解析错误计数>0              | 文件内疑似损坏                                                                                                                                       |
| 事实      | `get_report_facts() -> dict`                                                          | `_collect_facts`                           | 各自实现                    | 报告头离散事实                                                                                                                                       |
| 事实      | `builtin_variables() -> dict`                                                         | 见下节                                     | 见下节                      | **每次返回新 dict**，键必须覆盖 `BUILTIN_VARIABLES`                                                                                                  |

> 其余原有契约方法（`log_type` / `parser_version` / `match_version(spec)` /
> `report_materials()` 等）未变，注释见 `api.py`。

### OPTIONAL（缺席则对应能力隐藏）

| 函数                                                 | PX4                            | APM             | 说明                          |
| ---------------------------------------------------- | ------------------------------ | --------------- | ----------------------------- |
| `get_logged_dropouts() -> list[dict]`                | `dropouts`                     | []              | `[{tSec, durationMs}]`        |
| `get_message_type_counts()`                          | ✓                              | FMT 名计数      | 各消息条数                    |
| `get_decoded_events(t_start, t_end, level, pattern)` | metadata_events 解码（不联网） | None            | 事件解码；None=这份日志解不出 |
| `has_default_parameters() -> bool`                   | ✓                              | False           | 日志里带默认参数表            |
| `get_default_parameters() -> dict`                   | ✓                              | {}              | 默认参数表                    |
| `has_data_appended() -> bool`                        | pyulog 同名 property           | False           | ULog 追加数据段探测           |
| `get_parameter_description(name=None)`               | None（v1 无数据源）            | None            | 参数说明                      |
| `get_flight_track() -> dict\|None`                   | ✓                              | GPS `Status>=3` | 地图轨迹                      |
| `report_materials() -> dict`                         | ✓                              | ✓               | 报告页素材聚合                |

### 命名取舍记录（为什么这些名字不存在）

| 原稿名                      | 处置                               | 理由                                          |
| --------------------------- | ---------------------------------- | --------------------------------------------- |
| `get_serials(topic, field)` | **不落地**，用现有 `get_series`    | `serials` 望文生义成"序列号"，与"序列"混淆    |
| `get_inital_parameters`     | 落地为 `get_initial_parameters`    | 原稿拼写错误                                  |
| `get_firmwre_version`       | 落地为 `get_firmware_version`      | 原稿拼写错误                                  |
| `get_params_decription`     | 落地为 `get_parameter_description` | 原稿拼写错误                                  |
| `get_default_parameters`    | OPTIONAL（原稿 REQUIRED）          | 缺数据源时对应能力隐藏，不该卡死整个 provider |

## 内置变量（BUILTIN_VARIABLES 新增 10 键）

原有 `AIRFRAME` / `IS_FIXED_WING` / `FW_MINOR` / `DURATION_S` / `ARMED_S` /
`ARMED_INTERVALS` / `T0_US` / `HAS_ARMED` / `RESTART_DETECTED` / `DROPOUT_MS` / `MESSAGES`
不变，新增：

| 变量                                 | 类型        | 说明                                                     |
| ------------------------------------ | ----------- | -------------------------------------------------------- |
| `SYS_UUID`                           | str         | 系统唯一 ID。没写给空串                                  |
| `AIRFRAME_ID`                        | int         | 机架 ID 数值（APM = FRAME_CLASS/SYS_AUTOSTART 一类参数） |
| `HOME_LAT` / `HOME_LON` / `HOME_ALT` | float\|None | Home 点。给不出定位就 None                               |
| `SW_VER`                             | str         | 软件版本号串（如 `1.15.4`）。未知给「未知」字样的串      |
| `SW_VER_HASH`                        | str         | git 哈希。没写空串                                       |
| `HW_VER`                             | str         | 硬件版本名。没写空串                                     |
| `HW_VER_SUBTYPE`                     | str         | 硬件子型号。没写空串                                     |
| `FLIGHT_TIME_S`                      | float\|None | 载具**累计**飞行时长（参数计数器），不是本日志时长       |

### 命名取舍记录

- `AIRFAME_ID`（原稿）→ `AIRFRAME_ID`，拼写修正。
- `VEHICLE_TYPE`（原稿，mc/fw/vtol 词表）→ **不落地**，与现有 `VEHICLE` 同义不同词表，
  孪生名禁做；语义差异由 `AIRFRAME_ID`（数值）承担。
- "累计飞行时长"（中文键）→ `FLIGHT_TIME_S`。

## 验证结果（2026-09-24，全实测）

- 构建期：契约检查通过（两个 provider 都过 REQUIRED/builtin 检查；31 规则 / 73 算子）
- 运行期：`check_provider` 对两格式都过
- 契约测试 `tools/engine/guard_provider_contract.py` 9 步：2 份真实 PX4 +
  **36 份真实 APM**（Copter/Plane/Rover）+ 合成 APM = **333 checks 全过**
- PX4 规则回归（`tools/px4log_engine_runner.py`）20 份真实日志全过
- pyright 0 errors

**挂账**（未竟事项，如实记）：

- 守卫变异自证**未跑**：破坏任一新方法应让对应断言失败，`mutate_guards` 对该层未执行
- provider 顶层撞名守卫**未做**
- APM 的 FMTU 乘子 / 格式字符缩放 / `FRAME_CLASS` 全表**未逐字段核对**（v1 只解析不应用）

## 实现要点

PX4 侧：

- `get_start/last_timestamp`：`_read_data_list` 已算 t_min/t_max，补存 `t_max_us`
- `get_dataset_description` / `get_field_sizeof` / `has_data_appended` / `has_file_corruption`：委托 pyulog 同名 property 与 `ULog.get_field_size`
- `get_field_unit`：读构建期注入的字段单位表（只含规则/图里写了 `unit=` 的字段），其余返回 None，如实标注，不冒充全量
- home = `vehicle_global_position` 首个有效定位（armed 起点之后优先）；ref = `vehicle_local_position.ref_lat/ref_lon/ref_alt` 首个非零三元组。两概念分开，注释写明来源
- `get_changed_parameters` 从 `report_materials` 内联逻辑提取为方法

ArduPilot 侧（`engine/providers/ardupilot.py`）：

- AP_Logger .bin **格式自描述**：解析器按 FMT 表通解，不逐消息硬编码；消息一律按 FMT 名字查表，不写死消息 ID
- 长度约定自校准：用第一条 FMT 消息自己的 Length 字段判断含不含 3 字节头
- 两遍扫描：先收 FMT 定义，再按格式解码；`TimeUS` 映射为 `timestamp` 列
- 轨迹 = GPS（`Status>=3` 过滤）；阶段 = MODE 消息切段；armed = EV 事件 10/11，回退 STAT.Armed 状态沿，都没有就如实空

两条踩过的坑：

- **`FORMAT_VERSION` 参数是 DataFlash 日志格式版本（120/13），不是固件版本**，不可作回退。固件版本要从 MSG 横幅取（`ArduCopter V4.8.0-dev (hash)`）。
- **`timestamp` 的要求是条件的**：FMT 声明了时间字段才要求 timestamp 列。AP_Logger 的 FILE 等内部传输消息没有 TimeUS，"所有 topic 都有 timestamp"在跨格式下不成立。

## 守卫

1. 构建期 AST：`build-knowledge.mjs` 自动要求每个 provider 定义新 REQUIRED 方法、`builtin_variables()` 含新键
2. 运行期：`check_provider()` 补 `get_time_bounds` 形状断言
3. 契约测试 `tools/engine/guard_provider_contract.py`：
   - 第 7 步查真实方法名（原写法查的 `phases` / `dropouts` 属性根本不存在，可选能力检查从来只跳过不检查，是恒绿）
   - 第 9 步断言时间边界自洽（duration 从 bounds 推导，与 start/end 同口径）、dtype/sizeof 与 meta 自洽、integrity 与 `DROPOUT_MS` 对表、armed_changed 与 `ARMED_INTERVALS` 对表
   - `--apm`：用 `tools/dev/apm_make_sample.py` 合成一份最小 .bin 跑同一套断言
4. 变异自证：**尚未跑**（见上方挂账）

runner（`tools/engine/run_engine.py`）从硬编码 px4.py 改为自动扫描 `providers/*.py`，与构建一致。

## 命名取舍记录

| 原稿名                      | 处置                               | 理由                                          |
| --------------------------- | ---------------------------------- | --------------------------------------------- |
| `get_serials(topic, field)` | **不落地**，用现有 `get_series`    | `serials` 望文生义成"序列号"，与"序列"混淆    |
| `get_inital_parameters`     | 落地为 `get_initial_parameters`    | 原稿拼写错误                                  |
| `get_firmwre_version`       | 落地为 `get_firmware_version`      | 原稿拼写错误                                  |
| `get_params_decription`     | 落地为 `get_parameter_description` | 原稿拼写错误                                  |
| `get_default_parameters`    | OPTIONAL（原稿 REQUIRED）          | 缺数据源时对应能力隐藏，不该卡死整个 provider |
| `AIRFAME_ID`（内置变量）    | `AIRFRAME_ID`                      | 拼写修正                                      |
| `VEHICLE_TYPE`（内置变量）  | **不落地**                         | 与现有 `VEHICLE` 同义不同词表，孪生名禁做     |
| "累计飞行时长"（中文键）    | `FLIGHT_TIME_S`                    | 键名统一英文                                  |
