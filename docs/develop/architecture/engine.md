# 知识引擎：确定性日志分析的核心

**这是整个产品的心脏。** 输入一份飞控日志，输出一份结构化报告（`facts` / `metrics` /
`findings`）。**全部分析在浏览器本地完成**，原始日志不出端。

代码在 `knowledge/engine/`。**这一份讲它是什么、怎么分层、怎么设计的**；
「怎么跑、改完注意什么」见代码旁的 [`knowledge/engine/README.md`](../../../knowledge/engine/README.md)。

---

## 一、为什么用「引擎 + 声明」而不是写代码

日志分析天然是**规则密集**的：判断振动是否超标、EKF 是否发散、电池是否欠压……
如果每条规则写一段 Python，加规则要改代码、要测、要发版，且规则之间无法复用取数逻辑。

本项目的选择：**机制与知识分离**。

| 层       | 是什么              | 谁写                              |
| -------- | ------------------- | --------------------------------- |
| **机制** | 引擎、算子、框架    | Python 代码，稳定，很少改         |
| **知识** | 规则、图、阈值      | YAML 声明，频繁改，改完构建期校验 |
| **格式** | topic / 字段 / 码值 | provider 适配器，一种日志格式一份 |

**一条规则 = 一段声明**：条件写成算子链表达式，触发写成 `triggers`。加规则 = 加一个 YAML，
不碰代码。这是「知识库」能持续长大的前提。

---

## 二、四层结构

```text
knowledge/
├── engine/                    ← 机制层（与格式无关）
│   ├── operators.py           91 个通用算子（@operator 声明 arity）
│   ├── engine.py              规则框架 + 报告数据层
│   ├── loader.py              装配入口（本地工具与 server/ 共用）
│   └── providers/             格式适配层
│       ├── api.py             契约：REQUIRED / OPTIONAL / BUILTIN_VARIABLES
│       ├── px4.py             PX4 .ulg 适配器
│       └── ardupilot.py       ArduPilot .bin 适配器
│
├── px4/                       ← 知识层（PX4）
│   ├── rules/*.yaml           16 份规则文件
│   ├── facts.yaml             码表 / 文案 / 展示口径 / 规则元数据 / 执行顺序
│   ├── fault-kb.yaml          故障根因 → 排查步骤
│   ├── plot/*.yml             40 份绘图预设
│   └── meta/                  上游固件字典
│
├── ardupilot/                 ← 知识层（ArduPilot）
│   ├── rules/*.yaml           16 份规则文件
│   └── docs/
│
└── llm/                       ← LLM 提示词与解释层
```

**边界铁律**（可机器查）：在 `engine.py` / `operators.py` 里 grep 不到
`vehicle_` / `ver_sw` / `cpuload` 这类**具体名字**。格式相关的一切都在 `providers/` 里。

> 加一种新日志格式 = 加一个 provider，引擎与算子**一行不改**。

---

## 三、规则框架怎么工作

`engine.py` 的规则框架做五件事：

1. **分组调度**：规则按 `group` 分组，组间有先后依赖（如守卫组先跑，判日志能不能用）。
2. **表达式求值**：条件用**受限 AST** 求值——不是 `eval`，只允许白名单节点，
   杜绝任意代码执行（浏览器里跑的东西不能有口子）。
3. **调算子**：`compute` 里每一步调一个注册过的算子，算子有 in/out arity 声明，
   构建期校验参数个数。
4. **foreach 展开**：一条声明按 IMU 实例、按多 EKF 实例展开成多条 finding。
5. **发射 finding + 匹配故障库**：命中的结论带 `outputs.tag`，去 `fault-kb.yaml` 取根因与排查步骤。

**一条规则最多产出一条 finding**——所以复杂的检查（如振动要看三轴）在 YAML 里拆成多条。

---

## 四、报告数据层

引擎的产物是一份 JSON，分三块，**别混**：

| 块                                                                                  | 是什么                                                                                                                                   | 谁写                                                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `facts`                                                                             | 日志客观"是什么"：机型 / 固件 / 时长 / armed / 阶段 / 丢包——离散、驱动判定                                                               | provider 的 `get_report_facts()`                                    |
| `metrics`                                                                           | **关键数字**：有序数组，每项带中文名与单位（结果页「关键数据」直接渲染）。规则产出的实测值优先，规则没跑就按 `facts.yaml` 的声明兜底现算 | 引擎（清单在 `facts.yaml` 的 `metrics`，实测值来自 `rules/*.yaml`） |
| `findings` / `tags` / `guardTags` / `matchedFaults` / `checksRun` / `checksSkipped` | 判定层产出：结论、标签、命中的故障库条目                                                                                                 | 规则与故障库匹配                                                    |

**数据层与判定层在同一份代码里但不是同一件事**：数据层负责"按需抽时序 + LTTB 降采样"
把曲线数据交给前端，取数走 provider；`np_*` 具名入口是对前端的门面。

---

## 五、算子：91 个，不认识任何字段

`operators.py` 是**算子注册表**。算子是纯函数，只认输入输出，不认 field 名、阈值、文案——
那些都由规则/图的声明传进来。

```python
@operator("mean", in_arity=1, out_arity=1)
def op_mean(series, axis=None): ...
```

规则里的 `compute` 与图里的 `ydata` 引用同一批算子，**规则与图共用一套取数语言**——
这是本仓相对上游的一个关键差异（上游图表直接吃字段字符串，无算子层）。

**算子的分类**（完整清单见网站 `/guide/operator-catalogue`）：

| 类别     | 例子                                                           |
| -------- | -------------------------------------------------------------- |
| 统计     | `mean` / `max` / `min` / `std` / `median` / `percentile`       |
| 序列处理 | `diff` / `lt` / `diff` / `clip` / `downsample`                 |
| 区间事件 | `excursion_events` / `rising_edge_events` / `step_into_events` |
| 取数     | `get_series` / `_ref` 候选组 / `unit=` 换算                    |
| 组合     | `stack_columns` / `add` / `bit_or_max`                         |

> **已知缺口**：没有 `fft` / `psd` / `spectrogram` 频谱算子，只有 `zero_cross_hz`（时域过零）。
> 这是 7 张频谱图同时缺的根因，见 [`../knowledge/gap.md`](../knowledge/gap.md)。

---

## 六、构建期：源码怎么变成浏览器能跑的

引擎是 Python，但要**在浏览器里跑**。做法是构建期拼接 + Pyodide：

```text
构建期（build-knowledge.mjs）
  operators.py → providers/api.py → providers/*.py → engine.py
       ↓ 按此顺序当文本读走、拼成一份
  web/workers/analysis-engine.generated.ts（导出 PY_ULG_ENGINE）
       ↓ 运行期
  Worker 里的 Pyodide 整段 exec，注入 ulog_bytes
```

**关键性质**：

- **构建期不执行这些代码**，只是搬运。改了它们必须重新 `pnpm web:build:kb`，
  否则浏览器里跑的还是旧的一份。
- **拼接后每个片段单看都不是完整模块**："未定义"的名字来自别的片段。
  所以 `pyproject.toml` 对这几个文件**只关 F821 一条规则**；`tools/` 下 F821 仍然生效
  （它抓到过 `download_px4_logs.py` 里 `ulog_path` 拼错这类真 bug）。
- **同一份源码两处用**：浏览器（Pyodide）与本地工具（`loader.py` 直接 `exec`）
  用的是同一份，不会漂移。

---

## 七、产物与校验

构建期由 `web/scripts/build-knowledge.mjs` 生成：

| 产物                                             | 消费者                                  |
| ------------------------------------------------ | --------------------------------------- |
| `web/workers/analysis-engine.generated.ts`       | 浏览器 Worker（Pyodide）                |
| `web/workers/fault-kb.generated.json`            | 故障知识库内联版                        |
| `web/lib/knowledge/plots.generated.ts`           | 前端图表（`lib/chart-presets.ts` 解析） |
| `web/lib/knowledge/prompts.generated.js`         | LLM 提示词                              |
| `web/lib/knowledge/derived-version.generated.ts` | 产物版本号（漂移检测）                  |
| `knowledge/rules-editor-schema.generated.json`   | 规则编辑器的 JSON Schema                |

**构建期是唯一能拦住错误的地方**：`build-knowledge.mjs` 里全是 `throw`——
规则必填字段、算子名是否注册、`compute` 表达式能否编译、`guard_tags` 引用的名字是否存在、
图的 `label` 个数与 `ydata` 是否对齐、单图是否单量纲……

**判据**：`pnpm web:build:kb -- --check` 比对产物与源是否一致，CI 每次跑。

---

## 八、测试与回归

| 层           | 工具                                          | 覆盖什么                       |
| ------------ | --------------------------------------------- | ------------------------------ |
| 单测         | `pnpm eng:test`                               | 算子求值 + CEL 沙箱            |
| 适配器契约   | `tools/engine/guard_provider_contract.py`     | provider 两实现的接口自洽      |
| 冻结基线回归 | `tools/engine/compare_baseline.py`            | 真实日志逐字段比对，防结论漂移 |
| 数据层自检   | `tools/engine/run_engine.py --probe-data`     | 数据层结构自洽                 |
| 字段引用     | `tools/engine/check_rules_fields.py --strict` | 规则引用的字段名真实存在       |

> **冻结基线**是「同输入 → 同结论」的锚点：**引擎结论变化必须是显式动作**（打新基线），
> 不能因为重构而漂移。日志集与基线怎么建、放哪、CI 怎么跑，见
> [`../knowledge/baselines.md`](../knowledge/baselines.md)。
>
> ⚠️ 上表第 2–5 项**需要真实日志**，日志不入库，所以**云端 CI 跑不了**，
> 只在有日志的开发机上跑。含义是 **CI 全绿 ≠ 回归过了**。

---

## 九、代码规范与坑

格式化**唯一权威**是 `ruff format`（仓库根 `pyproject.toml`：行长 100、双引号）。

```bash
python -m ruff format --check . && python -m ruff check .
```

**别在本目录跑 `ruff check --fix`，也别开编辑器的"保存时自动修复"**：
拼接会让它在单文件视角下删掉"看起来没用"的导入与名字。

**常见的三类坑**：

1. **改完忘了重建产物** → 浏览器跑的还是旧的。改了 `knowledge/` 下任何真源，
   要么 `pnpm web:dev`（带 watch），要么手动 `pnpm web:build:kb`。
2. **构建期报错被误当成前端问题** → `pnpm web:dev` 起不来，先看是不是 YAML 写错了，
   报错会指到文件与字段。
3. **`facts.yaml` 与 provider 的边界混淆** → 非格式相关的数据（码表、文案、展示口径）
   在 `facts.yaml`；格式相关的数据与逻辑在 `providers/<格式>.py` 及它那份 `facts.yaml`。
