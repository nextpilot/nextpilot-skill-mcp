# knowledge/ —— 日志分析的唯一知识源

飞控日志分析的**全部人工经验都在这一个文件夹里维护**。
Web 站点（浏览器端 Pyodide 引擎、边缘函数 LLM 层）和未来的平台 MCP Server
**都只消费这里派生出的产物，不在各自代码里另存一份阈值 / 根因 / 提示词。**

目录按**飞控固件族**划分：`px4/`（当前实现），以后新增 ArduPilot 时加 `ardupilot/`，
跨固件的通用方法论文档留在本目录。

```text
px4/
  rules/                检查经验：一条经验一个 YAML（判定阈值就写在各自经验里）
    *.yaml              32 条经验 + 4 条 guard；failsafe.yaml 一个文件装了 6 条同构经验
  operators.py          预定函数（算子）注册表，73 个通用算子，带 arity 签名校验
  ulog_checks.py        第一层解析 + 第二层事实层 + 规则框架（slot 调度 / 取数 /
                        受限表达式求值 / foreach 展开 / 发射 finding）；Pyodide 执行
  ulog_data.py          报告页数据层 helpers（图表 / 事件 / 参数）
  px4-fault-kb.yaml     故障树：标签 → 根因 / 排查步骤 / 禁忌 / 风险等级
  px4-ulog-rules.md     32 条经验索引（从 rules/*.yaml 汇总，校准用）
  rule-schema-design.md 规则格式设计全文 + 实施状态与落地差异
  llm/
    gjb841-system-prompt.md  第四层 GJB-841 思考范式
    report-empty.md          无 finding 时的固定结论文案
  meta/                固件元数据（生成物，一 tag 一份 JSON：字段字典 + 参数字典）
knowledge-authoring.md   工程师方法论（四类经验 → 四种载体）
```

## 改什么 → 改哪个文件

| 我要…… | 编辑 |
| --- | --- |
| 调一条阈值（如欠压、振动、GPS eph） | `px4/rules/<那条经验>.yaml` 里的 `threshold` 与 `triggers[].expr` |
| 加一条全新检查 | 新建 `px4/rules/<名字>.yaml`（必填 `id/slot/name/firmware/airframe/compute/triggers/emit`，构建期强校验） |
| 加一个可复用的计算步骤 | `px4/operators.py`（`@operator` 声明 in/out arity），再在经验的 `compute` 里引用 |
| 加一条故障模式（根因 / 排查步骤） | `px4/px4-fault-kb.yaml`（trigger_tags 必须是引擎会产出的标签） |
| 改 AI 报告口径 / 思考范式 | `px4/llm/*.md` |
| 看每条经验的字段、阈值、来历 | `px4/px4-ulog-rules.md`（索引）或直接看 `px4/rules/*.yaml` |
| 同步固件元数据 | `python tools/px4/sync-px4-msg.py --tags ...`（生成物在 `px4/meta/<tag>.json`） |

## 改完怎么生效 / 验证

```bash
cd web && node scripts/build-knowledge.mjs     # 或 pnpm build:kb；dev/build 会自动跑

# 等价回归：6 条真实日志与冻结基线逐字段比对（不依赖 Node）
python tools/calibrate/compare-baseline.py
# 生成产物是否真的可执行（不只是语法）
python tools/calibrate/check-artifact.py
# 字段引用 lint：字段名写错时引擎只会静默取到 None，这条能把它揪出来
python tools/calibrate/lint-rules.py
# 单条经验为什么不触发：逐节点打印
python tools/calibrate/probe_rule.py engine/tests/logs/<log>.ulg <rule_id>
```

生成产物（提交进仓库，EdgeOne 直接 `next build` 也有得用）：

- `web/workers/ulog-check-script.ts`（内联 operators.py + ulog_checks.py + rules/*.yaml）
- `web/workers/ulog-data-script.ts`、`web/workers/fault-kb.generated.json`
- `web/lib/knowledge/prompts.generated.js`

**铁律**：生成物不要手改；所有数值判断只在 `px4/rules/*.yaml` + 引擎框架里发生，
LLM 只做翻译与组装。

## 规则格式：已实施

一条经验 = 一个自包含 YAML（少数同构经验可合并进一个文件，顶层写成数组）。
要点：`slot`/`order` 决定执行位置（`finding.id` 按发射顺序生成，必须与原检查同序）；
`compute` 数据流节点引用 `topic.field` 或前序输出；`triggers[].expr` 走 AST 白名单求值
（不用 `eval`）；`emit` 声明 check / 故障标签 / 文档链接 / 统计量 / 条件性 guard 标签。

**版本差异有两级条件**：规则级 `firmware`（整条经验是否适用）与节点级 `when_fw`
（单个节点是否执行，不满足则输出 None、交给 `coalesce` 选另一版本的分支），
例如 `estimator_wind`（1.15+）与 `wind_estimate`（更早）的取源分流。

细节、内置变量清单、算子目录，以及**实施过程中与设计的差异**（多经验文件、
复合算子、`instance` 取单实例、guard 槽位等）见
**[px4/rule-schema-design.md](px4/rule-schema-design.md) 的「实施状态与落地差异」一节**。
