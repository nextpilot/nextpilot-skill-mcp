# 来源与署名：ardupilot-mcp

本目录下的知识来自开源项目 **ardupilot-mcp**。这份文件说明"迁了什么、改了什么、
没迁什么"，改这个目录之前请先看一遍——尤其"改了什么"，那里记的是**与上游的偏差**，
照上游原文复核会对不上。

## 上游

| 项         | 值                                            |
| ---------- | --------------------------------------------- |
| 项目       | `ardupilot-mcp`                               |
| 仓库       | https://github.com/furkanisikay/ardupilot-mcp |
| PyPI       | `ardupilot-mcp` **0.1.2**                     |
| 许可       | **MIT**                                       |
| 版权       | `Copyright (c) 2026 Furkan IŞIKAY`            |
| 上游审计日 | 2026-06-14（对应 `docs/SOURCES.md`）          |

MIT 只要求保留版权声明与许可声明，无额外署名条款。收录前已核许可为宽松许可，
符合本站的版权红线（只收录宽松许可内容）。

## 迁入了什么

- **8 张码表**（进 `facts.yaml`）：`COPTER_MODES`(25)、`ERR_SUBSYSTEMS`(31)、
  `CRITICAL_ERR_SUBSYSTEMS`(10)、`EV_IDS`(30)、`_VEHICLE_PREFIX_MAP`(12)、
  `HELI_FRAME_CLASSES`(3)、`FRAME_CLASSES`(14)、`FRAME_TYPES`(14)
- **一条派生规则**：`estimate_cells`（4.2 V/格、有效区间 3.3–4.4、包电压合理范围 4–70 V），
  用在 `power.yaml` 的低电压判据上。上游的 `vehicle_kind` 六分类**没迁**——
  本站的机型判定在 provider 里（`_FRAME_CLASS_MAP`），规则侧只用
  `rotary_wing / fixed_wing`，两套分类对不上，迁过来只会添乱。
- **12 组共 34 条规则**（进 `rules/*.yaml`）：振动、EKF、电源、GPS、罗盘、姿态、
  电机、遥控、时序、事件、配置安全、传感器。其中 33 条能算、1 条占位
  （`apm-mode-timeline` 卡在 `MODE.Mode` 是文本列）。
- **官方文档链接** 20 条（进 `facts.yaml` 的 `doc_urls` 与 `rule_meta.by_group.doc`）
- **`docs/SOURCES.md`** 198 条假设审计（confirmed 86 / heuristic 22 /
  design choice 82 / corrected 8），逐字保留

上游共 16 项检查，本轮迁了 12 项。**没迁的 4 项各有原因，不是遗漏**：

| 上游检查      | 为什么不迁                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `integrity`   | 它读的是**解析层**产出的 `log.meta.integrity`（日志是否被截断等），不是消息流。本站 provider 没有这个概念，也不在规则能引用的内置变量里  |
| `prearm`      | 依赖 `MSG.Message` / `STATUSTEXT.Text` 的**文本子串匹配** → 撞 C1（`count_items` 的 `contains=` 有了，但文本列仍然取不到）               |
| `calibration` | 100% 依赖参数（`COMPASS_OFS*` 的模长判校准质量）。**原卡 C2，2026-09 已解除**（有 `param()` 了），但还没迁——要迁得先补向量模长一类的算子 |
| `param_audit` | 同上，依赖参数。C2 解除后这条基本没障碍了，还没迁只是没排期                                                                              |

`facts.yaml` 的 `group_order` 里仍然留了 `integrity` / `calibration` /
`param_audit` / `prearm_messages` 这四个 group（空 group 允许，引擎空跑），
位置也留着——将来补的时候不用重排。

## 改了什么（与上游的偏差，逐条如实记）

1. **载体换了。** 上游是 Python 类（`checks/*.py`，命令式、带分支与异常）；
   这里是声明式 YAML（`compute` 表达式 + `triggers`）。判定条件要能写成算子链，
   写不出来的只能占位——见 `PENDING.md` 的算子缺口那张表。
2. **阈值数值一个都没改，也一个都没新编。** 这是本轮最要紧的一条自我约束：
   遇到算子缺口时，宁可让判据降级或占位，**也不自己拟一个阈值填进去**
   （比如"用超阈样本占比近似持续时长"这种看着合理的做法，占比阈值得自己挑，
   那就是编数）。所以凡本轮出不了结论的档位，都是直接不出，而不是给个编的数。
   四类标记（`confirmed` / `heuristic` / `design choice` / `corrected`）的出处
   写在对应规则文件的头注里。
3. **官方链接从多条改成一条。** 上游 `references_for()` 返回多条链接，本站的
   `docUrl` 是单值，所以 `rule_meta.by_group.doc` 只取**最具体的一条**。
   完整链接集在 `facts.yaml` 的 `doc_urls` 里。两处要一起改，目前没有自动校验。
4. **参数驱动的检查曾全部降级或占位**，2026-09 已解除：`BUILTIN_VARIABLES` 新增
   `PARAMS`，规则用 `param('NAME', default=None)` 读，`config` 三条与 `sensors`
   前两条随之从占位转真。仍保留的一处降级：`power` 的低电压判据没有改成
   "读 `BATT_CRT_VOLT`/`BATT_LOW_VOLT`"，仍是上游的 `estimate_cells` 派生路径
   （改用了 `coalesce` 链实现 `round`，因为引擎的 `to_int` 是截断，会把 6S 估成 5S）——
   现在能读了，改不改是阈值验证那一步的事（见 `PENDING.md` 第五节第 5、6 条）。
5. **逐条降级标注**（每条的具体偏差写在对应规则文件的注释里）：
   罗盘的 CV 判据缺 `std` 算子（只留极差比，所以本条出不了 critical）；
   姿态的"持续 1s"判据缺 run-length（只剩峰值档）；航向误差缺取模算子（占位）；
   电机两条缺矩阵化与标量减法（占位）；时序的日志间隙缺 `diff` 与中位数（占位，
   PM 长循环那条用 `mean × length_of` 绕开了求和缺口）；MODE 时间线缺文本列（占位）。
   —— 除 MODE 时间线外，上面这些 2026-09 补算子后**都已解除**（`wrap_degrees` /
   `stack_columns` / `diff` / `median` / `sum`），只剩文本列那一条（C1）。
6. **两处有意偏离上游**，都是有理由的，不是抄错：
   - **GPS 的 armed 窗口**：上游拿不到 armed 窗口就退回全程判，那必然把起飞前
     搜星期（`NSats=0`、`HDop=99.99`）判成飞行中故障。本站引擎会把 skip 连同原因
     显示给用户，所以改成 `armed: true` 直接跳过——宁可跳过，不误报。
   - **EV 事件的严重度**：上游统一出 INFO 摘要；这里把丢 GPS、EKF 高度/航向重置、
     电机紧急停转、旋翼转速不足提到 warning——它们本身就是故障信号，压在 INFO 会淹没。
   - 附带一处：上游的 `rcin` 用"持续 >=2s 或持续到日志末尾"判 critical，
     本站缺持续时长，改成只报**命中样本数**并给 warning（没有新拟阈值）。
7. **`FRAME_CLASS = 3` 的认定与上游不同。** 上游 `FRAME_CLASSES[3] = Octo`（旋翼），
   本站 `providers/ardupilot.py` 的 `_FRAME_CLASS_MAP[3] = fixed_wing`。
   本轮不动 provider，规则判定以 provider 实际产出的 `VEHICLE` 为准；
   权威码表另放在 `facts.yaml` 的 `frame_classes`，两处冲突是有意为之。

## 没迁什么

不迁代码，只迁知识。判据是：**回答"怎么算出来"的进代码层，回答"取什么值、为什么、
怎么向用户表述"的进知识层**。

未迁入：`parser.py` / `flight_log.py`（DataFlash 解析）、`orchestrator.py` /
`base.py`（检查注册与调度）、`server.py`（9 个 MCP 工具）、`tuning.py`（调参建议）、
`param_file.py`、`util.py` 的 numpy 统计实现、文本截断与去重逻辑。

## 本轮状态（重要）

**2026-09 已接线**：构建脚本按固件族扫描（`knowledge/ardupilot/` 配 `providers/ardupilot.py`），
这批规则进产物、会被执行；引擎按 `log_type = ardupilot-bin` 取这一套知识。

**但阈值仍然全部是待验证的草稿**：仓库里还没有真实 `.bin` 样本，端到端证据只有两处——
`tools/dev/apm_make_sample.py` 的合成日志与挂进 push 门禁的 `tools/engine/check_apm_e2e.py`。
合成样本自证"链路通、参数读得到、该报的报了"，**不代表这些阈值对真实飞行成立**。
拿不到真实样本之前，请把 `rules/*.yaml` 里的每条阈值都当作草稿看待。

剩余待办（占位那一条、FRAME_CLASS 3 号冲突、曲线预设、找真样本）在 `PENDING.md`。
