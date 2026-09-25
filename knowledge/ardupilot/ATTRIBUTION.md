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
- **派生知识**：`estimate_cells`（4.2 V/格、有效区间 3.3–4.4、包电压合理范围 4–70 V）、
  `vehicle_kind` 六分类（copter/heli/plane/rover/sub/tracker）
- **16 项检查的阈值与严重度**（进 `rules/*.yaml`）：振动、EKF、电源、GPS、罗盘、
  姿态、电机平衡、遥控、时序、事件、配置安全、校准、传感器、预解锁消息、参数审计、日志完整性
- **官方文档链接** 20 条（进 `facts.yaml` 的 `doc_urls` 与 `rule_meta.by_group.doc`）
- **`docs/SOURCES.md`** 198 条假设审计（confirmed 86 / heuristic 22 /
  design choice 82 / corrected 8），逐字保留

## 改了什么（与上游的偏差，逐条如实记）

1. **载体换了。** 上游是 Python 类（`checks/*.py`，命令式、带分支与异常）；
   这里是声明式 YAML（`compute` 表达式 + `triggers`）。判定条件要能写成算子链，
   写不出来的只能占位——见 `PENDING.md` 的算子缺口那张表。
2. **阈值数值原样保留**，四类标记（`confirmed` / `heuristic` / `design choice` /
   `corrected`）从 `SOURCES.md` 提到**每条规则的文件头**，与阈值放在一起。
3. **官方链接从多条改成一条。** 上游 `references_for()` 返回多条链接，本站的
   `docUrl` 是单值，所以 `rule_meta.by_group.doc` 只取**最具体的一条**。
   完整链接集在 `facts.yaml` 的 `doc_urls` 里。
4. **参数驱动的检查全部降级或占位。** 本站引擎的 `BUILTIN_VARIABLES` 没有参数类
   内置变量，规则拿不到 `PARM`，所以 `config` / `calibration` / `param_audit`
   只能占位；`power` 的低电压判据从"读 `BATT_CRT_VOLT`/`BATT_LOW_VOLT`"退回上游的
   `estimate_cells` 派生路径。
5. **降级项逐条标注**：罗盘的 CV 判据（无 `std` 算子）、电机饱和的占比判据
   （无 per-column 占比算子）、遥控与姿态的"持续时长"判据（无 run-length 算子，
   `rcin` 改用样本占比，**阈值是新拟的、未经校准**）、时序的累加与间隙（无 `diff`
   与求和算子）。每条的具体偏差写在对应规则文件的注释里。
6. **`FRAME_CLASS = 3` 的认定与上游不同。** 上游 `FRAME_CLASSES[3] = Octo`（旋翼），
   本站 `providers/ardupilot.py` 的 `_FRAME_CLASS_MAP[3] = fixed_wing`。
   本轮不动 provider，规则判定以 provider 实际产出的 `VEHICLE` 为准。

## 没迁什么

不迁代码，只迁知识。判据是：**回答"怎么算出来"的进代码层，回答"取什么值、为什么、
怎么向用户表述"的进知识层**。

未迁入：`parser.py` / `flight_log.py`（DataFlash 解析）、`orchestrator.py` /
`base.py`（检查注册与调度）、`server.py`（9 个 MCP 工具）、`tuning.py`（调参建议）、
`param_file.py`、`util.py` 的 numpy 统计实现、文本截断与去重逻辑。

## 本轮状态（重要）

**这批规则尚未接线进构建产物，不会被执行。**

`web/scripts/build-knowledge.mjs` 与 `knowledge/engine/loader.py` 目前都硬编码
`knowledge/px4/`，`knowledge/ardupilot/` 不在它们的扫描范围内。所以本目录现在是
**知识源**，不是可执行规则——没有任何一条阈值经过真实 `.bin` 日志验证。

要让 APM 日志真正出 findings，需要一次独立的"接线"改动，清单在 `PENDING.md` 第一段。
在那之前，请把 `rules/*.yaml` 里的每条都当作**待验证的草稿**看待。
