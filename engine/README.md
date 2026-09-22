# engine/ —— 确定性日志引擎（浏览器与本地工具共用的一份 Python 源码）

**这里没有一行业务数据，也没有一个具体的 topic 名 / 字段名。**

分两层看：

- **与格式无关的机制**：算子、规则框架、报告数据层。
- **格式适配器**（`providers/`）：唯一认识"某一种日志"的地方——PX4 的 topic 名、字段名、
  固件版本怎么解码、取不到怎么回退，全在 `providers/px4.py`。
  加一种日志格式（如 ArduPilot `.bin`）就是加一个适配器，上面那三个文件一行不改。

判据（可机器查）：在 `rule_engine.py` / `operators.py` / `report_data.py` 里 grep 不到
`vehicle_` / `ver_sw` / `cpuload` 这类具体名字。

| 文件 | 内容 |
| --- | --- |
| `operators.py` | 算子注册表（当前 73 个通用算子，`@operator` 声明 in/out arity；权威清单见指南页「算子目录」）。**不认识任何具体字段**——字段名、阈值、文案都由经验与 plot 声明传入 |
| `rule_engine.py` | 规则框架（group 调度 / 受限 AST 表达式求值 / 调算子 / foreach 展开 / 发射 finding / 故障库匹配） |
| `report_data.py` | 报告页数据层（按需抽时序 + LTTB 降采样，取数走 provider） |
| `providers/api.py` | **适配器契约**：三张常量表（必需/可选能力、内置变量）+ 运行期自检 |
| `providers/px4.py` | PX4 `.ulg` 适配器（固件解码 / 机型 / armed / 阶段 / 载具身份 / 轨迹 / 事件解码） |
| `test_pyulog.py` | pyulog 在本机跑通的最小验证 |

非格式相关的数据仍在 `knowledge/px4/facts.yaml`（码表、文案、展示口径、规则元数据、执行顺序）；
格式相关的数据与逻辑在 `providers/<格式>.py` 与它的那份 `facts.yaml` 里。

## 什么时候跑

| 场景 | 谁把它跑起来 |
| --- | --- |
| **用户上传 `.ulg` 分析** | 浏览器 Worker 里的 Pyodide。构建期 `web/scripts/build-knowledge.mjs` 把这些文件**当文本读走**，按 `operators.py → providers/api.py → providers/*.py → rule_engine.py` 的顺序拼成一份内联进 `web/workers/pyodide-px4log-engine.ts`，`report_data.py` 单独进 `pyodide-px4log-data.ts`（两者在同一个 `__main__` globals 里执行，数据层直接用那边建好的 `provider`） |
| **本地回归 / 校准** | `tools/calibrate/px4log_engine_runner.py` 按同样顺序拼接后 `exec`——跑的是**同一份源码**，所以本地结果与浏览器一致。其余校准脚本（`compare_baseline.py` / `dump_baseline.py` / `probe_rule.py` / `guard-px4log-provider.py`）都 import 它 |
| 生成指南页的算子目录与内置变量表 | `build-knowledge.mjs` 从 `operators.py` 与 `providers/api.py` 派生 |
| 阶段二服务端 / MCP（未实现） | 把本目录包成可 `import` 的 `nextpilot_engine`（parsers / models / rules 三层），规则仍从 `knowledge/` 加载，不另存一份 |

注意：**构建期不执行这些代码**，只是搬运。改了它们必须重新 `cd web && pnpm build:kb`，
否则浏览器里跑的还是旧的一份。

## 报告结构（引擎的输出）

`rule_engine.py` 的产物是一份 JSON，分三块，别混：

| 块 | 是什么 | 谁写 |
| --- | --- | --- |
| `facts` | 日志客观"是什么"：机型 / 固件 / 时长 / armed / 阶段 / 丢包——离散、驱动判定 | provider 的 `get_report_facts()`（PX4 那份在 `providers/px4.py`） |
| `metrics` | **关键数字**：有序数组，每项带中文名与单位（结果页「关键数据」直接渲染）。规则产出的实测值优先，规则没跑就按 `facts.yaml` 的声明兜底现算 | 引擎（清单在 `facts.yaml` 的 `metrics`，实测值来自 `rules/*.yaml`） |
| `findings` / `tags` / `guardTags` / `matchedFaults` / `checksRun` / `checksSkipped` | 判定层产出：结论、标签、命中的故障库条目 | 规则与故障库匹配 |

## 与 knowledge/ 的边界（别混）

| 目录 | 是什么 |
| --- | --- |
| `engine/`（本目录） | *怎么算*——通用算子、框架、数据层，谁都认识，不认识具体 topic/字段 |
| `engine/providers/` | *怎么从某一种日志里把数据取出来*——唯一认识 topic 名、字段名、码值的地方 |
| `knowledge/px4/facts.yaml` | 那一种格式的**纯数据**：码表、文案、展示口径、规则元数据、执行顺序 |
| `knowledge/px4/rules/` | *算完怎么判定*——阈值与触发条件 |
| `knowledge/px4/fault-kb.yaml` | 故障根因 / 排查步骤（规则只留 `outputs.tag` 指向它） |
| `knowledge/px4/meta/` | 上游固件字典（字段与参数，按固件 tag 生成） |
| `knowledge/px4/plot/` | 结果页曲线预设（纯前端渲染，不进 Pyodide 的规则侧） |

## Python 风格约定

格式化的**唯一权威**是 `ruff format`（配置在仓库根 `pyproject.toml`：行长 100、双引号），
本目录与 `tools/` 一视同仁，人不与格式化器争论。工具装法见仓库根 `requirements-dev.txt`
（版本钉死——ruff 的小版本会改格式）。

```bash
python -m ruff format --check . && python -m ruff check .
```

**别在本目录跑 `ruff check --fix`，也别在编辑器里开"保存时自动修复"**：下一节的拼接会让它在
单文件视角下删掉"看起来没用"的导入与名字（`# noqa` 同理，见 `pyproject.toml` 的 per-file-ignores）。

## 拼接顺序与桥接名字（lint 报的 F821 就是这些）

构建期按这个顺序把片段拼成**一份**脚本再执行（浏览器与本地工具同一份源码）：

```text
operators.py → providers/api.py → providers/*.py → rule_engine.py → report_data.py
```

所以每个片段**单看都不是完整模块**，"未定义"的名字来自别处：

| 名字 | 谁提供 |
| --- | --- |
| `__FAULT_KB__` `__RULES__` `__FACTS__` | 构建期替换的占位符（`web/scripts/build-knowledge.mjs`） |
| `__FAULT_KB__` 之外，`OPERATORS` / `SIGNATURES` | `operators.py`（最先拼） |
| `open_log` / `REQUIRED` / `OPTIONAL` / `BUILTIN_VARIABLES` / `FORMATS` | `providers/api.py` |
| `provider` / `run_all` | `rule_engine.py`（`report_data.py` 直接用那边建好的 `provider`） |
| `ulog_bytes` | 运行期注入（浏览器 worker / `px4log_engine_runner.py`） |

因此 `pyproject.toml` 对 `rule_engine.py` / `report_data.py` / `providers/px4.py` 关掉了
**F821（未定义名）**——**只关这一个规则，且只关这三个文件**；`tools/` 下 F821 仍然生效
（它刚抓到过 `download_px4_logs.py` 里 `ulog_path` 拼错这类真 bug）。

## 跑一遍

**一条命令跑完**（云端 CI 与 `.githooks/pre-push` 调的也是它，清单与设计理由见
`tools/ci/check_all.py` 的模块文档）：

```bash
python tools/ci/check_all.py
```

它按「是否需要真实 `.ulg` 日志」分两组：

- **不需要日志**（`ruff` / `build:kb --check` / 指南页算子表与源码一致 / 产物合法 / `tsc`）：
  任何地方都能跑，云端 CI 每次提交都跑。
- **需要日志**（`compare_baseline` / `guard-px4log-provider` / `--probe-data` / `lint_rules`）：日志含
  GPS 轨迹、不入库（见 `.gitignore`），**云端 CI 跑不了**，只在有日志的开发机上跑 —— 改本目录后必跑。

要单独调试某一项时：

```bash
cd web && pnpm build:kb                      # 内联进浏览器产物 + 生成指南页
python tools/calibrate/guard-px4log-provider.py tools/calibrate/logs/*.ulg   # 适配器契约测试
python tools/calibrate/compare_baseline.py   # 6 条真实日志与冻结基线逐字段比对
python tools/calibrate/lint_rules.py         # 字段引用与版本错配（只报告）
```
