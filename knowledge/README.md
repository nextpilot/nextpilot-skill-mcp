# knowledge/ —— 日志分析的唯一知识源

飞控日志分析的**全部人工经验都在这一个文件夹里维护**。
Web 站点（浏览器端 Pyodide 引擎、边缘函数 LLM 层）和未来的平台 MCP Server
**都只消费这里派生出的产物，不在各自代码里另存一份阈值 / 根因 / 提示词。**

目录按**飞控固件族**划分：`px4/`（当前实现），以后新增 ArduPilot 时加 `ardupilot/`，
跨固件的通用方法论文档留在本目录。

```
px4/
  px4-thresholds.toml   阈值 / 判据参数（最常改）
  px4-fault-kb.yaml     故障树：标签 → 根因 / 排查步骤 / 禁忌 / 风险等级
  ulog_checks.py        第一层解析 + 第二层规则检查（过程性逻辑，Pyodide 执行）
  ulog_data.py          报告页数据层 helpers（图表 / 事件 / 参数）
  px4-ulog-rules.md     规则清单 + robotto 8 条 ↔ 我们 15 条对照表（校准基线）
  llm/
    gjb841-system-prompt.md  第四层 GJB-841 思考范式
    report-empty.md          无 finding 时的固定结论文案
  topics/              字段字典（生成物，按 tag 分目录，由 tools/topics/ 从 PX4 msg 同步）
  params/              参数字典（生成物，按 tag 一文件，来自 parameters.json）
knowledge-authoring.md   工程师方法论（四类经验 → 四种载体）
px4/rule-schema-design.md 规则格式重构的已批准设计（尚未实施）
```

## 改什么 → 改哪个文件

| 我要…… | 编辑 |
| --- | --- |
| 调一条阈值（如欠压、振动、GPS eph） | `px4/px4-thresholds.toml` |
| 加一条故障模式（根因 / 排查步骤） | `px4/px4-fault-kb.yaml`（trigger_tags 必须是引擎会产出的标签） |
| 加一条全新检查过程 | `px4/ulog_checks.py`（命中调 `add(...)`，缺数据调 `skipped(...)`） |
| 改 AI 报告口径 / 思考范式 | `px4/llm/*.md` |
| 看每条规则的字段、阈值、来历 | `px4/px4-ulog-rules.md` |
| 同步字段 / 参数字典 | `python tools/topics/sync-px4-msg.py --tags ...`（生成物在 `px4/topics/`、`px4/params/`） |

## 改完怎么生效 / 验证

```bash
cd web
pnpm build:kb          # 从 knowledge/ 重新生成 web/ 下运行时产物
# dev / build 脚本会自动先跑 build:kb，一般不用手动

# 等价回归（不依赖 Node，直接跑 knowledge 里的 Python 源）
python tools/calibrate/run_checks_locally.py engine/tests/logs/*.ulg
```

生成产物（提交进仓库，EdgeOne 直接 `next build` 也有得用）：

- `web/workers/ulog-check-script.ts`、`web/workers/ulog-data-script.ts`、`web/workers/fault-kb.generated.json`
- `web/lib/knowledge/prompts.generated.js`、`web/lib/knowledge/thresholds.generated.js`

**铁律**：生成物不要手改；所有数值判断只在 `px4/ulog_checks.py` + TOML 里发生，LLM 只做翻译与组装。

## 规则格式正在重新设计（已批准，尚未实施）

目标是把检查规则从「1095 行 Python + 集中的阈值 TOML」改成
**一条经验一个 YAML、自包含、可评审、可验证、可分发**：

- 三段适用轴：`firmware`（固件）/ `airframe`（机架）/ `phase`（阶段），即使不限也必须显式写 `any`
- `compute` 数据流：算子节点支持**多输入/多输出与串联**（如四元数→欧拉角 4 进 3 出）
- `triggers[].expr`：受限表达式触发（`p99_err >= 30 or (p99_err >= 15 and osc_hz >= 4)`），
  走 AST 白名单求值、不用 `eval`；`armed`/`nav_state`/`timestamp` 等内置变量可直接引用
- 配套 `px4/topics/<tag>/`（字段字典）与 `px4/params/<tag>.yaml`（参数字典），
  由 `tools/topics/` 从 PX4 上游同步；另有 `operators.py`（预定函数，带 arity 签名校验）、
  硬性必填校验（杜绝"空洞经验"）
- 单一格式：**全部 YAML**，删除 `px4-thresholds.toml` 与构建脚本的 TOML 解析器

设计全文（含完整示例、执行链路、迁移三阶段与验证方式）：
**[px4/rule-schema-design.md](px4/rule-schema-design.md)**
