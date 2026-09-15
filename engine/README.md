# engine/ —— 确定性日志引擎（浏览器与本地工具共用的一份 Python 源码）

这三个文件是项目的**确定性判断核心**。

**这里没有一行业务数据**：字段名、码值表、飞行阶段分组、slot 执行顺序全在
`knowledge/px4/facts.yaml`（构建期内联成 `__FACTS__`）；规则与阈值在 `knowledge/px4/`。
改数据不用碰 Python——这正是分家的目的。

| 文件 | 内容 |
| --- | --- |
| `operators.py` | 算子注册表（73 个通用算子，`@operator` 声明 in/out arity）。**不认识任何具体字段**——字段名、阈值、文案都由经验 YAML 传入 |
| `rule_engine.py` | pyulog 解析 + 事实层 + 规则框架（slot 调度 / 取数 / 受限 AST 表达式求值 / foreach 展开 / 发射 finding） |
| `report_data.py` | 报告页数据层 helpers（图表序列 / 事件 / 参数） |

## 什么时候跑

| 场景 | 谁把它跑起来 |
| --- | --- |
| **用户上传 `.ulg` 分析** | 浏览器 Worker 里的 Pyodide。构建期 `web/scripts/build-knowledge.mjs` 把这三个文件**当文本读走**，拼成一份内联进 `web/workers/ulog-check-script.ts`（operators + rule_engine）与 `ulog-data-script.ts`（report_data） |
| **本地回归 / 校准** | `tools/calibrate/run_checks_locally.py` 把同样三个文件按同样顺序拼接后 `exec`——跑的是**同一份源码**，所以本地结果与浏览器一致。其余校准脚本（`compare-baseline.py` / `dump-baseline.py` / `probe_rule.py`）都 import 它 |
| 生成指南页的算子目录 | `tools/px4/gen-rule-reference.py` 用 `ast` 解析 `operators.py` |
| 阶段二服务端 / MCP（未实现） | 把本目录包成可 `import` 的 `nextpilot_engine`（parsers / models / rules 三层），规则仍从 `knowledge/` 加载，不另存一份 |

注意：**构建期不执行这些代码**，只是搬运。改了它们必须重新 `cd web && pnpm build:kb`，否则浏览器里跑的还是旧的一份。

## 与 knowledge/ 的边界（别混）

- **这里**：*怎么算*——通用算子、框架、数据层，谁都认识，不认识具体 topic/字段
- **`knowledge/px4/`**：*算完怎么判定*——`rules/*.yaml`（阈值与触发条件）、`px4-fault-kb.yaml`（故障根因 / 排查步骤）、`llm/`（GJB-841 提示词）、`meta/`（固件字段字典）

## 跑一遍

```bash
cd web && pnpm build:kb                      # 内联进浏览器产物 + 生成指南页
python tools/calibrate/compare-baseline.py   # 6 条真实日志与冻结基线逐字段比对
python tools/calibrate/lint-rules.py         # 字段引用与版本错配
```
