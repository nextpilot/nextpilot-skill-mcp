# ArduPilot 知识层：待办与已知缺口

> **先把状态说清楚，免得被误读。**
> **接线已完成（2026-09）**：`knowledge/ardupilot/` 下的 43 条规则与 `knowledge/px4/`
> 的 31 条一起进构建产物（构建打印 `74 rules（ardupilot 43 + px4 31）`），跑一份
> APM `.bin` 会按 `log_type` 自动挑到这一族的知识并出 findings。
> **但 `facts.yaml` 的 `rule_meta.defaults.status` 仍然是 `draft`**——不是谦虚，
> 是阈值**没有一条经过真实 `.bin` 日志验证**，目前唯一的证据来自合成样本
> （`tools/dev/apm_make_sample.py`）。署名与上游偏差见 `ATTRIBUTION.md`；
> 给 AI 的完整上下文见 `CLAUDE.md`。

## 一、接线：已完成

2026-09 一次做完，四处一起改的（分开改会出现"构建过了但运行时取不到 facts"）。
改动落在构建脚本与引擎两侧，**都改成了按固件族扫描，不再写死 PX4**。

| #   | 位置                              | 改后                                                                                       |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `web/scripts/build-knowledge.mjs` | `const KN = knowledge/px4` 删掉，改 `FAMILIES` 扫描 `knowledge/*/`；产物按 `log_type` 分组 |
| 2   | `knowledge/engine/loader.py`      | `KN_PX4` 删掉，改 `KN_ROOT` + `FAMILY_DIRS`；陈旧检查扫每一族的 `rules/*.yaml`             |
| 3   | `knowledge/engine/engine.py`      | `"platform": "PX4"` 硬编码删掉，改问 `provider.platform_label()`（没有就退回 `log_type`）  |
| 4   | `knowledge/engine/engine.py`      | 运行期按 `provider.log_type` 从分组产物里挑 `RULES` / `FACTS` / `FIELD_UNITS` / `FAULT_KB` |

**族的配对规则**（新增，别绕开它）：`knowledge/<族名>/` 配
`knowledge/engine/providers/<族名>.py`，**两边同名即一族**。构建脚本据此扫描，
引擎据此取知识。加一种日志格式 = 加目录 + 同名适配器，**构建脚本零改动**。

配套的四个新约束，写在这里免得下次踩：

- **产物形状从"一份"变成"按 `log_type` 分组"**：`analysis-engine.generated.ts` 的
  `const rules / facts / fieldUnits`、`fault-kb.generated.json` 的 `entries`、
  `plots.generated.ts` 的 `PLOT_PRESETS`，全是 `{log_type: ...}`。
  凡是 `extract_json_const(src, "rules")` 之类的地方都要记得 `.values()` 展平
  （`tools/engine/check_engine_pyodide.py` 已经这么改了）。
- **`detect_log_type(raw)`**（新增，`providers/api.py`）：只跑探测器、不构造 provider。
  因为"挑知识必须先知道格式"，而挑格式发生在打开日志之前——`open_log()` 又需要
  `FACTS` 才能构造 provider，是个鸡生蛋。
- **可选资产不报错**：没有 `fault-kb.yaml` = 空库；没有 `plot/` = 空曲线数组；
  没有 `meta/` = 不换算（`field_units` 空，只告警）。APM 三样都没有，照跑。
- **大小写放开**：`TOPIC_NAME` 与字段名从"小写 snake_case"放宽到
  `[A-Za-z][A-Za-z0-9_]*`，因为 APM 是 `ATT` / `ATT.timestamp` 这种大写。

接线时那四件"必须同时处理"的事，现在的状态：

- ✅ **field_units 不换算**：按"没有 `meta/` 就不换算"处理，已解决。
- ⚠️ **metrics BAT/CURR 与 XKF4/NKF4 两条并列**：仍是现状（引擎没有跨 topic 兜底），
  概览区会同时显示两条。要不要给 metrics 加 fallback 链，等真机样本看了再定。
- ✅ **补 `plot/` 目录**：改成容忍缺失，不必为了跑起来硬建。
- ❌ **APM provider 不产飞行阶段，故障库仍然残废**（见第六节）：
  `providers/ardupilot.py` 的 `get_report_facts()` 里 `"phases": []` 是硬编码空数组；
  引擎 `run_all()` 拿它 `set(...)` 出空集，`match_fault_kb()` 于是对 `flight_phase`
  不含 `"all"` 的条目**直接跳过**。要修就得从 `MODE` 消息切段推阶段
  （`takeoff` / `hover` / `cruise` …），或者把匹配改成不依赖阶段。

## 二、占位总表：0 条（2026-09 C1 解除后清零）

C1 于 2026-09 解除（`_FMT_DTYPES` 登记 `n/N/Z` → `"str"`，`get_series()` 对文本列直接返回原始字符串），
`apm-mode-timeline` 已从占位转为真规则。

占位规则用 `conditions.placeholder` 写：值就是一句"缺什么"的原因文案，引擎跳过本条并
原样显示它（2026-09-25 起）。

> 之前这套机制是靠往 `precheck` 里塞**单引号包裹的字符串字面量**实现的：构建期
> `stripStrings` 先剥引号所以放行，运行期它是非空字符串常量、恒为真。能工作，但把
> "未实现"伪装成"先决条件命中"，而且字符串里不能出现单引号。`precheck` 退役后换成了
> 一等字段，这两个毛病都没了。

在此之前算子那批缺口补齐时解锁过 5 条：`apm-battery-sudden-drop`、`apm-attitude-yaw`、
`apm-motor-imbalance`、`apm-motor-saturation`、`apm-timing-gaps`；
`_cfg()` 例程解锁 5 条参数配置类：`apm-config-arming-check` / `apm-config-batt-monitor` /
`apm-config-fs-thr` / `apm-sensor-rangefinder` / `apm-sensor-gps`；
C1 解除后解锁 `apm-mode-timeline` 与 `apm-prearm-*`。
占位从最初的 11 条一路降到现在的 0 条。

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

## 四、两条既有事实约束（改规则前必读）

| 编号   | 事实                                                                                                                                                                                     | 后果                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~C1~~ | ~~provider 的 `get_series()` 把文本列 `np.asarray(..., float)` 的失败吞成 `None`~~ 2026-09 已解除：`_FMT_DTYPES` 已登记 `n/N/Z` → `"str"`，`get_series()` 对文本列直接返回原始字符串序列 | `MSG.Message` / `MODE.Mode` / `STATUSTEXT.Text` / `PARM.Name` 均可取到；`apm-mode-timeline` 与 `prearm` 已解锁                                              |
| C3     | 上游 `FRAME_CLASSES[3]=Octo`（旋翼）与本仓库 `_FRAME_CLASS_MAP[3]=fixed_wing` **冲突**                                                                                                   | `conditions.vehicle` 只能填 provider 真产出的 `rotary_wing / fixed_wing / unknown`，**不能写 copter/heli/plane**（引擎只做字符串精确比对，写错就静默 skip） |

**C3 有个必须在接线时处理的后果**：上游把电机平衡限制在多旋翼，因为 heli 的 RCOU C1-C4
是斜盘舵机、"电机平衡"没有意义。而 provider 把 heli 也归到 `rotary_wing`，
所以 `apm-motor-*` 将来在直升机上会误报。要修就得给它加机型细分，或让 provider
多产出一种机型标识。（`apm-config-fs-thr` 已经因此**不加** vehicle 约束——上游也没加。）

### C2 已解除：参数怎么读（2026-09）

原先的 C2 是"`BUILTIN_VARIABLES` 里没有任何参数类变量"，现已解决，做法是三处一起加：

- **`PARAMS` 内置变量**：`BUILTIN_VARIABLES` 新增（`type: dict`）。px4 挂
  `get_initial_parameters()`，ardupilot 挂 PARM 消息的**最后一次值**（首现值 =
  初始参数，运行中的变更另在 `get_changed_parameters()`）。规则里**不直接引用**它
  ——表达式没有下标能力。
- **`_cfg('NAME', default=None)`**：compute 里放行的第 4 个框架调用，与
  `ref` / `_try` / `has_topic` 同级，**不是算子**。参数是一份日志一个值的离散事实，
  算子只收数据、看不见 provider，所以做不成算子。缺失时返回 `default`（不抛异常）——
  "没这个参数"与"参数等于 0"是两件事，写规则时要分开。
- **构建期同步校验**：`web/scripts/lib/rule-expr.mjs` 认 `_cfg()`（1~2 个实参、
  首参必须是字符串字面量、次参是字面量兜底、不接受 kwargs），并把 `_cfg` 加进
  "非变量名"白名单，否则会被当成未定义的变量报错。

规则里长这样（`config.yaml`）：

```yaml
compute:
  - x = _cfg("ARMING_CHECK")
when: "x == 0"
```

配套的一条约定：`conditions.topics: [PARM]`——**没录参数要显示成 `skipped` 而不是
"跑了没发现问题"**，所以三条 config 规则都挂了这条前提。

## 五、draft 状态意味着什么

`facts.yaml` 里 `status: draft` 覆盖全部 43 条。要转成 `stable`，至少做完这些：

1. 找一份真实的 APM `.bin`（Copter 优先，最好再来一份 Plane），跑一遍，逐条确认
   **能不能取到数**——这是最大的未知，比阈值准不准更要紧。
2. 确认 `VIBE` / `MAG` / `ATT` / `GPS` / `RCOU` / `RCIN` / `PM` / `ERR` / `EV` 的字段名
   与大小写（本轮全部照上游 `ardupilot_meta.py` 写的，没有实样核对）。
3. 确认 `XKF4` 与 `NKF4` 在不同固件上的出现情况，以及 `ref` 候选组的挑选是否符合预期。
4. 确认 `GPS.timestamp`（provider 把 `TimeUS` 改名而来）在规则里真能取到——
   `apm-gps-sats` / `apm-gps-hdop` 的 armed 窗口全靠它。
5. 阈值回填：电池那条的 `BATT_*_VOLT` 现在**可以**用 `_cfg()` 读了，
   电芯数估算应当降级成兜底路径。
6. **参数阈值本身要验**：新转真的 5 条用的都是上游的 `==0` / `>0` 判据，
   目前只在合成样本上见过一次发射（合成样本里 `ARMING_CHECK` / `BATT_MONITOR` /
   `FS_THR_ENABLE` 故意取 0，`RNGFND1_TYPE=1` 而无测距仪消息，`GPS_TYPE=1` 且有 GPS
   消息作为反例）。

## 六、其它待定

- **校验脚本**：2026-09 已把端到端那条固化进 CI——`tools/engine/check_apm_e2e.py`
  挂在 `tools/ci/checklist.yml` 的 push 阶段（`check-apm-e2e`）。它验的是
  " `.bin` 被认成 `ardupilot-bin`、装载的是 APM 规则、`_cfg()` 取数与兜底、
  4 条参数规则真发射、反例不报、`platform`/`logType` 来自 provider"。
  为什么非要有它：接线这种事**最容易被改回去**，而"进不了产物"没有任何运行时信号，
  `_cfg()` 少挂一次的表现也只是一条规则静默不发射。
  **仍未入库的是静态规则校验脚本**（算子名写错、group 未登记、`when` 里调算子这类），
  当初用它抓出过真错，目前还躺在临时目录里，要固化就搬进 `tools/ci/`。
- **`doc_urls` 与 `rule_meta.by_group.doc` 的同步**：引擎的 `docUrl` 是单值，
  只取最具体的一条，所以两处必须一起改，目前没有自动校验。
- **不建 `fault-kb.yaml`**：它的 `trigger_tags` 必须是引擎真产出过的标签，
  而本轮一条都没在真机上验证过，写了就是编。等验证过再建。排它前面还有两条前置条件
  （都是 2026-09 实测）：
  - **APM 标签已全部加 `apm_` 前缀**（2026-09-25，43 条规则、28 个标签）。
    此前两族共用一个命名空间：APM 写 `tag: high_vibration` / `accel_clipping`，
    其中 `high_vibration`、`motor_output_unbalance` 与 PX4 **字面重名**——
    两族同时接线时既分不清来源，也没法各配一份故障库。现在一律是
    `apm_high_vibration` 这种形式（约定写进 `CLAUDE.md`）。
  - **加前缀的直接后果**：`knowledge/px4/fault-kb.yaml` 那份**不能再被 APM 复用**
    ——它的 `trigger_tags` 是 PX4 裸标签，而 APM 现在产出的是 `apm_*`。
    这也是"别把 px4 那份挪到 `knowledge/` 根"的又一条理由：挪上去 APM 也命中不了。
  - **先补 `phases` 再谈建库**（见第一节最后一条）：provider 的 `phases` 恒空时，
    故障库 10 条里 7 条永不命中——这时候建 APM 的 fault-kb，建出来就是残的。
