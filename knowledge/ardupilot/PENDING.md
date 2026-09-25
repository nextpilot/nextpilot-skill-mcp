# ArduPilot 知识层：待办与已知缺口

> **先把状态说清楚，免得被误读。**
> `knowledge/ardupilot/` 下的 34 条规则**目前一条都不会执行**：构建管线只认
> `knowledge/px4/`（`web/scripts/build-knowledge.mjs` 里的 `KN` 与
> `knowledge/engine/loader.py` 里的 `KN_PX4` 都写死了），所以这批规则既不会进产物，
> 也不会在建站时出现。它们现在只是**知识源**。
> 另外，`facts.yaml` 的 `rule_meta.defaults.status` 是 `draft`——不是谦虚，
> 是本轮的阈值**没有一条经过真实 `.bin` 日志验证**，连"能不能取到数"都还没验过。
> 署名与上游偏差见 `ATTRIBUTION.md`；给 AI 的完整上下文见 `CLAUDE.md`。

## 一、接线：让这批规则真的跑起来

要让一份 APM `.bin` 在浏览器里出 findings，下面 4 处都得改。它们互相牵连，
**建议一次做完**，不要逐个来——只改一处会出现"构建过了但运行时取不到 facts"。

| #   | 位置                              | 现状                                                                                              | 要改成                                            |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `web/scripts/build-knowledge.mjs` | `const KN = resolve(webRoot, "../knowledge/px4")`，`RULES_DIR / FACTS_PATH / PLOT_DIR` 全由它派生 | 按固件族扫描 `knowledge/*/`，产物按族分开         |
| 2   | `knowledge/engine/loader.py`      | `KN_PX4` 写死，`RULES_DIR = KN_PX4 / "rules"`                                                     | 同样按族；`__RULES__` / `__FACTS__` 要能装多份    |
| 3   | `knowledge/engine/engine.py`      | `run_all()` 返回里 `"platform": "PX4"` 是硬编码                                                   | 改成问 provider（如 `provider.platform_label()`） |
| 4   | `knowledge/engine/engine.py`      | 运行期只有一份 `FACTS` / `RULES`                                                                  | 按 `provider.log_type`（或族标识）挑对应那一套    |

接线时**必须同时**处理的四件事，否则会静默出错：

- `field_units` 目前**不参与运行期换算**（APM 没有 `meta/` 目录，写 `unit=` 查不到源单位，
  只会告警不换算）。要让单位真正生效，得先给 APM 补 `meta/`，再把 `field_units` 迁过去。
- `metrics` 里 BAT/CURR 与 XKF4/NKF4 都是**两条并列**（引擎没有跨 topic 兜底），
  概览区会同时显示两条。接线后先看看是不是能接受，不能接受就得给 metrics 加 fallback 链。
- 补 `plot/` 目录。`PLOT_DIR` 不存在会直接抛错，所以本轮没建；接线前要么建，
  要么让构建脚本容忍它缺失。
- **APM provider 不产飞行阶段，会导致故障库残废**（2026-09 实测，详见第六节）：
  `providers/ardupilot.py` 的 `get_report_facts()` 里 `"phases": []` 是硬编码空数组；
  引擎 `run_all()` 拿它 `set(...)` 出空集，`match_fault_kb()` 于是对 `flight_phase`
  不含 `"all"` 的条目**直接跳过**。后果：哪怕直接复用 `knowledge/px4/fault-kb.yaml`，
  10 条里**只有 3 条**可能命中（`F002` / `F007` / `F010`，它们的 `flight_phase` 是
  `["all"]`），另外 7 条永远不命中。要修就得从 `MODE` 消息切段推阶段
  （`takeoff` / `hover` / `cruise` …），或者把匹配改成不依赖阶段。

## 二、占位总表：6 条，各缺什么

占位规则用 `conditions.placeholder` 写：值就是一句"缺什么"的原因文案，引擎跳过本条并
原样显示它（2026-09-25 起）。

> 之前这套机制是靠往 `precheck` 里塞**单引号包裹的字符串字面量**实现的：构建期
> `stripStrings` 先剥引号所以放行，运行期它是非空字符串常量、恒为真。能工作，但把
> "未实现"伪装成"先决条件命中"，而且字符串里不能出现单引号。`precheck` 退役后换成了
> 一等字段，这两个毛病都没了。

| 规则 id                   | 缺什么能力                                | 补上之后阈值是否现成 |
| ------------------------- | ----------------------------------------- | -------------------- |
| `apm-mode-timeline`       | provider 支持文本列（MODE.Mode 是字符串） | 无阈值，摘要性质     |
| `apm-config-arming-check` | 读参数 `ARMING_CHECK`                     | 现成（==0）          |
| `apm-config-batt-monitor` | 读参数 `BATT_MONITOR`                     | 现成（==0）          |
| `apm-config-fs-thr`       | 读参数 `FS_THR_ENABLE`                    | 现成（==0）          |
| `apm-sensor-rangefinder`  | 读参数 `RNGFND_TYPE` / `RNGFND1_TYPE`     | 现成（>0 但无数据）  |
| `apm-sensor-gps`          | 读参数 `GPS_TYPE`                         | 现成（>0 但无数据）  |

**6 条全部卡在读参数**（C2），没有一条是"引擎算不出来"——算子那批缺口 2026-09 已补齐：
`apm-battery-sudden-drop`、`apm-attitude-yaw`、`apm-motor-imbalance`、
`apm-motor-saturation`、`apm-timing-gaps` 这 5 条随之从占位转成了真规则。
要解锁剩下的 6 条，得让 provider 能提供参数（PARAM/PARM 消息）。

## 三、算子缺口（2026-09 已补齐）

下表是当初写规则时**实测**撞到的缺口（不是推测），现已全部补上 `knowledge/engine/operators.py`，
算子表 73 → 89 个。补算子必须**重跑 `pnpm web:build:kb`**（算子表与签名会进产物），
并留意 PX4 那 6 份冻结基线的比对——新增算子不改既有算子的行为，那批基线应当不变。

| 缺口                  | 现在用哪个算子                                                           | 解锁了谁                                                 |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| `std` / `cv`          | `std` / `cv`（`std` 带 `ddof`；`cv` 在均值非正时返回 None）              | compass 的 CV 判据（0.30/0.60），critical 档才出得来     |
| 相邻差分              | `diff`（可 `n=2` 求二阶）                                                | 通用积木；电压突降与日志间隙另用事件型算子               |
| 中位数归约            | `median`                                                                 | 电压量程闸门；日志间隙的名义 dt 在 `gap_events` 内       |
| 序列求和              | `sum`                                                                    | 通用积木（`mean × length_of` 那个绕法可以退休了）        |
| run-length / 持续时长 | `excursion_events`（事件列表）/ `longest_true_run`（标量秒数）           | 姿态持续偏离、任意"持续多久"类判据                       |
| 文本子串匹配          | `count_items` / `take_items` 新增 `contains=`（大小写不敏感）            | STATUSTEXT 预解锁消息、PARM 参数解析（仍要先过 C1 那关） |
| **标量加减**          | `add` / `sub` / `abs` / `mod`；`abs_diff` / `sum_abs` 顺手修好了标量输入 | 通道号换算、电芯数估算的 `x+0.5`                         |
| **取模**              | `wrap_degrees`（绕回 ±period/2）/ `mod`                                  | 航向误差绕回                                             |
| **独立字段组矩阵**    | `stack_columns`（2~8 列，缺失列跳过）；`column_ratio_events` 做逐列占比  | `column_spread_stats` 用得上 RCOU 的 C1..C8 了           |

另外 3 个**事件型**算子是把上游 check 里那段手写的循环搬进算子（文案仍留在经验文件）：

| 算子               | 复刻的上游逻辑                                                             | 用在哪                    |
| ------------------ | -------------------------------------------------------------------------- | ------------------------- |
| `gap_events`       | 阈值 = max(0.5 s, 10 × 名义间隔中位数)；按间隔降序，最多 3 条              | `apm-timing-gaps`         |
| `step_drop_events` | 间隔 < 0.5 s 且跌幅 > 2 V 才算；跌后 1 s 内回升过半即视为毛刺（recovered） | `apm-battery-sudden-drop` |
| `excursion_events` | 超阈持续段，可选 `min_duration_s` 过滤，`limit` 只留最严重那一段           | 姿态三轴                  |

## 四、三条既有事实约束（改规则前必读）

| 编号 | 事实                                                                                   | 后果                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | provider 的 `get_series()` 把文本列 `np.asarray(..., float)` 的失败吞成 `None`         | `MSG.Message` / `MODE.Mode` / `STATUSTEXT.Text` / `PARM.Name` 一律取不到                                                                                    |
| C2   | `providers/api.py` 的 `BUILTIN_VARIABLES` 里**没有任何参数类变量**                     | 所有依赖参数的检查（config 三条、sensors 前两条）只能占位                                                                                                   |
| C3   | 上游 `FRAME_CLASSES[3]=Octo`（旋翼）与本仓库 `_FRAME_CLASS_MAP[3]=fixed_wing` **冲突** | `conditions.vehicle` 只能填 provider 真产出的 `rotary_wing / fixed_wing / unknown`，**不能写 copter/heli/plane**（引擎只做字符串精确比对，写错就静默 skip） |

**C3 有个必须在接线时处理的后果**：上游把电机平衡限制在多旋翼，因为 heli 的 RCOU C1-C4
是斜盘舵机、"电机平衡"没有意义。而 provider 把 heli 也归到 `rotary_wing`，
所以 `apm-motor-*` 将来在直升机上会误报。接线时必须给它加机型细分，或让 provider
多产出一种机型标识。

## 五、draft 状态意味着什么

`facts.yaml` 里 `status: draft` 覆盖全部 34 条。要转成 `stable`，至少做完这些：

1. 找一份真实的 APM `.bin`（Copter 优先，最好再来一份 Plane），跑一遍，逐条确认
   **能不能取到数**——这是最大的未知，比阈值准不准更要紧。
2. 确认 `VIBE` / `MAG` / `ATT` / `GPS` / `RCOU` / `RCIN` / `PM` / `ERR` / `EV` 的字段名
   与大小写（本轮全部照上游 `ardupilot_meta.py` 写的，没有实样核对）。
3. 确认 `XKF4` 与 `NKF4` 在不同固件上的出现情况，以及 `ref` 候选组的挑选是否符合预期。
4. 确认 `GPS.timestamp`（provider 把 `TimeUS` 改名而来）在规则里真能取到——
   `apm-gps-sats` / `apm-gps-hdop` 的 armed 窗口全靠它。
5. 阈值回填：电池那条的 `BATT_*_VOLT` 拿到参数后应当优先用参数，
   电芯数估算只是降级路径。

## 六、其它待定

- **校验脚本要不要固化成 CI**：本轮用 `knowledge/ardupilot/rules/` 下的静态检查
  抓出过真错（算子名写错、group 未登记、`when` 里调算子）。这批规则不进构建，
  等于**没有任何自动校验保护**。建议把它接进 `tools/ci/check_all.py`。
- **`doc_urls` 与 `rule_meta.by_group.doc` 的同步**：引擎的 `docUrl` 是单值，
  只取最具体的一条，所以两处必须一起改，目前没有自动校验。
- **不建 `fault-kb.yaml`**：它的 `trigger_tags` 必须是引擎真产出过的标签，
  而本轮一条都没验证过，写了就是编。等验证过再建。排它前面还有两条前置条件
  （都是 2026-09 实测）：
  - **APM 标签已全部加 `apm_` 前缀**（2026-09-25，34 条规则、24 个标签）。
    此前两族共用一个命名空间：APM 写 `tag: high_vibration` / `accel_clipping`，
    其中 `high_vibration`、`motor_output_unbalance` 与 PX4 **字面重名**——
    两族同时接线时既分不清来源，也没法各配一份故障库。现在一律是
    `apm_high_vibration` 这种形式（约定写进 `CLAUDE.md`）。
  - **加前缀的直接后果**：`knowledge/px4/fault-kb.yaml` 那份**不能再被 APM 复用**
    ——它的 `trigger_tags` 是 PX4 裸标签，而 APM 现在产出的是 `apm_*`。
    这也是"别把 px4 那份挪到 `knowledge/` 根"的又一条理由：挪上去 APM 也命中不了。
  - **先补 `phases` 再谈建库**（见第一节第 4 件）：provider 的 `phases` 恒空时，
    故障库 10 条里 7 条永不命中——这时候建 APM 的 fault-kb，建出来就是残的。
