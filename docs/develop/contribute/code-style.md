# 代码风格

改代码、写注释前读这一份。这里是风格要求的权威落点。

两条总原则，后面所有条目都是它的推论：

1. 工具是唯一权威。格式不靠人争论，`ruff format` / `prettier` 输出什么就是什么。
   人只负责写内容，工具负责排版。
2. 写"代码说不出来的信息"。命名、类型、结构能表达的，就不再用注释重复一遍。
   注释的额度全留给"后人会踩的坑"。

| 主题                                 | 权威落点                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------- |
| 格式化 / lint / 类型检查（机器判的） | `pyproject.toml`、`.prettierrc`、`eslint.config.mjs`、`pyrightconfig.json` |
| 注释与打印（人判的）                 | 本文 §2、§3                                                                |
| 提交消息格式                         | `.githooks/commit-msg`（真身），用法见 [`README.md`](README.md) §2.3       |

---

## 1. 代码风格

### 1.1 命名

**文件名后缀选型**（新建文件务必照此）：

| 类型                                      | 规则                                                                                          | 示例                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| React 组件                                | PascalCase + `.tsx`                                                                           | `LogAnalyzer.tsx`、`SkillCard.tsx`             |
| 分析页 tab 组件                           | 一个 tab 一个文件：`Log<用途>Msg.tsx`                                                         | `LogEventsMsg.tsx`、`LogFlightMap.tsx`         |
| 库 / 类型 / 常量                          | kebab-case + `.ts`                                                                            | `chart-presets.ts`、`types.ts`                 |
| **两侧共用**的库（浏览器 + 边缘函数都引） | kebab-case + `.js`（边缘那 22 个文件全是 `.js`，`.ts` 能否被 EdgeOne 打包器吃下本地验证不了） | `lib/error-policy.js`                          |
| Web Worker 入口                           | kebab-case + `-worker.ts`                                                                     | `analysis-worker.ts`                           |
| Worker 内嵌脚本                           | 由 `build-knowledge.mjs` **生成**，不手改                                                     | `*.generated.*`                                |
| Next.js 路由                              | `page.tsx` / `route.ts` / `layout.tsx`（目录即路由）                                          | `app/log/page.tsx`、`app/api/explain/route.ts` |
| Python 模块                               | snake_case + `.py`                                                                            | `knowledge/engine/engine.py`                   |
| 知识 / 经验文件                           | 规则 `rules/*.yaml`、故障库 `fault-kb.yaml`（详见 `knowledge/README.md`）                     | `rules/vibration.yaml`                         |
| 文档                                      | kebab-case + `.md`                                                                            | `llm/gjb841-system-prompt.md`                  |
| 边缘函数（`web/functions/`）              | kebab-case + `.js`，**文件名即路由**（`functions/api/x.js` → `/api/x`）                       | `api/me.js`、`_lib/issue-filer.js`             |

名字要能望文生义。只满足上表的"类型规则"不够——它只告诉你后缀，
看不出这个文件干什么。

1. 一条功能链上每个文件占一个不重复的角色词，名字连起来读成一句"谁采 → 谁收 → 谁建单"：

   ```
   lib/issue-bridge.ts（采集 + 投递）→ functions/api/issues.js（边缘入口，只接收）
                                     → functions/_lib/issue-filer.js（判定 + 建单）
   ```

2. 禁止只差词序 / 单复数 / 一两个字母的孪生名：`error-reporter` 与 `report-error`
   真的并排出现过，读的人分不出哪个是模块、哪个是路由。
3. 防"读起来有上下级、其实是并列"的一对：`GuideMarkdown` / `GuideMdx` 只差一个字母，
   看着像"前者是后者的封装"，实际是两个并列的渲染入口。

代码内的标识符：Python 模块/函数 `snake_case`、常量 `UPPER_SNAKE_CASE`、
React 组件 `PascalCase`、库导出名照常（`chart-presets.ts` 导出 `chartPresets`）。

### 1.2 格式化

Python 格式化的唯一权威是 `ruff format`（配置 `pyproject.toml`，版本钉在
`requirements-dev.txt`）。改完自查：

```bash
python -m ruff format --check . && python -m ruff check .
```

**别跑 `ruff check --fix`，也别开编辑器的"保存时自动修复"**：`knowledge/engine/` 下的文件是
拼接片段（清单见 `knowledge/engine/README.md`），那样会误删东西。在这条约定之前，
每个编辑器各按自己的默认格式化器改文件，有一轮提交里混进了 500 行纯格式改动。

| 语言     | 格式化器      | 关键取值                                              |
| -------- | ------------- | ----------------------------------------------------- |
| Python   | `ruff format` | 行长 128、双引号、目标 3.11                           |
| 前端     | `prettier`    | 缩进 4（json/yaml 2）、行长 120、双引号、语句结尾分号 |
| Markdown | `prettier`    | 缩进 2、`proseWrap: preserve`（不硬折行）             |

格式化器说了算，人不与它争论。局部不一致时以它的输出为准。

### 1.3 类型

- TS 侧：`strict` 打开。不用 `any` 兜底，边界处写 `unknown`。
- Python 侧：`pyright` 跑 `standard` 模式，只覆盖 `knowledge/engine/`。
  新增 Python 代码带类型标注，不加也能过，但下游解析产物时类型漂移只有产物看得见。
- 禁止 `as T` 强转。外部数据的写入方与读取方可能不是同一版本（静态站与边缘函数分开部署、
  KV 记录能跨版本存活、IndexedDB 里躺着几个月前老代码写的记录），类型是编译期的、JSON 是运行期的，
  强转把检查关掉，缺字段的值会一路走到 UI 才炸——炸在入口有文件名和行号，炸在 UI 只有
  `Cannot read properties of undefined`。
  归一函数写 `normalizeXxx(raw: unknown): T | null`，入参就是 `unknown`；只做三件事：
  补默认值、收窄类型（`typeof x === "number"`）、丢掉坏记录（返回 `null` 或过滤）。不抛错、不校验业务。

---

## 2. 注释规范

只写代码本身无法表达的信息：业务约束、潜在坑、特殊约定、为什么这么实现。

### 2.1 禁止写什么

1. 复述代码逻辑：`// 遍历 rules 并执行` —— 删掉这行，代码一样读得懂。
2. 解释变量字面含义：`MAX_RETRY = 3; // 最大重试次数` —— 名字已说清。
3. 讲故事、讲历史：不写演变过程、事故日期、复现经过、commit hash、评审结论。
4. 乱引用：不引外部链接、不引章节号、不引工单号当说明。注释要能独立读懂。
5. 多余开场白和总结：不写"本函数负责…""综上所述…"。
6. 大段描述和铺垫：一句话说不清的，写进文档而不是注释。

### 2.2 格式与判据

- 单行注释尽量简短；代码能自解释的，不加注释。
- 标点从简；不写 markdown 加粗和 emoji。确需分条时用 `1. 2. 3.` 纯文本。

**保留判据：删掉这行注释，后人会不会踩坑？** 会踩坑才留，不会就删。

| 该删                                          | 该留                                                    |
| --------------------------------------------- | ------------------------------------------------------- |
| `// 遍历所有规则`                             | `// KV 仅边缘函数可用，SSR 侧拿不到注入`                |
| `// 超时时间设为 30 秒`                       | `// 用 beforeFiles：EdgeOne 平台路由层会先匹配动态页`   |
| `// 初始化配置对象，然后读环境变量，最后返回` | `// 脱敏顺序有讲究：先结构后泛化，反了 JWT 被长 hex 咬` |

### 2.3 篇幅

- 文件头不设行数上限：它承担"这个文件干什么、在链路里的角色、最大的坑、对外契约"，
  讲清楚比省几行重要。不写演变史。
- 函数 / 块的注释上限 6 行，超了就拆：留结论与坑，推导过程删；确有价值就写进文档。
- 行内 / 行尾注释上限 1 行，讲不完说明该放到上方块注释或文档。

列表式清单（字段表、规则清单、失效形态枚举）每条一行，不设总行数上限。

### 2.4 四类位置的模板

**文件头**：位于文件最前，与首个 import 之间空一行。内容只写四样，缺哪样省哪样：

1. 一句话职责，必要时补"唯一知道 X 的地方"。
2. 在链路里的角色：谁调它、它的产物给谁。
3. 最大的坑：不这么做会怎样。
4. 对外契约：被谁解析、哪个标识符 / 占位符不许改。

```python
# <一句话职责>。
#
# 坑：<后果>。
# 契约：<被谁解析 / 哪个标识符不许改>。
```

```ts
/** <一句话职责>，必要时补一句它在链路里的角色。 */
// 坑 / 约束：<不这么做的后果>。
```

`knowledge/engine/` 下的文件会被当文本拼进 `web/workers/analysis-engine.generated.ts`，
拼进去的那部分必须用 `#` 注释：模块 docstring 在拼接后不再是 docstring，会变成裸字符串表达式。

**函数与块**：只在"有坑"或"口径不显然"时写，上限 6 行。统一陈述句，不写"本函数…"。

- Python：紧跟 `def` 的 docstring 只写一句；超过一句就改用上方 `#` 块。
- TS：`/** */` 单段，或紧跟函数上一行的 `//` 块。

**变量与字段**：能自解释的名字不加注释。必须写时只有一种位置：变量的上一行，不写行尾。

**YAML 配置**：给字段表与占位符，不写"为什么这么设计"。

### 2.5 自检

提交前问三句，任一否就不算合规：

1. 删掉这条注释，后人会不会踩坑？不会就删。
2. 这段是不是在复述代码或讲历史？是就删。
3. 函数/块的注释超过 6 行、行尾注释超过 1 行了吗？超了就拆或挪进文档。

---

## 3. 打印消息

所有输出走统一出口，不许裸 `print()` / `console.*`。出口本身是唯一权威，改了出口要同步改
`check_hygiene.py` 里认前缀的那条正则（`_REPORT_ATTRS` 与 `JS_FAIL_PRINT_RE`），否则守卫会静默放行。

| 位置             | 出口                                  | 对照                                                         |
| ---------------- | ------------------------------------- | ------------------------------------------------------------ |
| `tools/` Python  | `tools/_logging.py` 的 `get_logger()` | `log.info` / `log.warn` / `log.err` / `log.print_*`          |
| `web/scripts/`   | `web/scripts/lib/log.mjs` 的 `log`    | `log.info` / `log.ok` / `log.warn` / `log.err` / `log.write` |
| 浏览器与边缘函数 | `web/lib/log.ts` 的 `log`             | `log.info` / `log.warn` / `log.err`                          |

Python 侧出口去向：`info` / `warning` / `print_*` 走 stdout，
`err`（失败消息）走 **stderr**，`write_line` 不缓冲（伪进度条）。
脚本侧 `err` 同样走 stderr；浏览器侧 `err` 走 `console.error`——
浏览器控制台按级别着色，失败必须走 `console.error` 才能被单独筛出来。

**两类例外，`print` / `console` 是对的，不要改**：

- `.githooks/_venv_python.py`：在 logger 之前运行（找解释器），引 `_logging` 会循环依赖。
- `web/content/skills/*/scripts/*.py`：发布给用户的 Skill 内容（打包 zip 供下载），
  必须零依赖、可单独执行，不能依赖本仓的 `tools/`。

消息文案约定：

1. 首词定级：失败以 `FAIL` 起，跳过以 `SKIP` 起，异常以 `ERROR` 起，成功一律 `OK`；
   首词后跟一个空格再写正文。守卫按首词判"这个脚本会不会打出失败"，
   字面量挪进不带该词的出口会让守卫静默失效。
2. 讲缺什么，不讲"出错了"：有 N 种原因时，概括句就是 N 分之一，而且常常指向一个
   不存在的事实。一条失败路径有几种原因就交出几条，逐条带上是哪个 topic / 哪个字段。
   例：不要写"这段日志里没有可用的定位轨迹"，要写清是"没有 GPS 相关 topic"还是
   "有 topic 但缺坐标字段"，并附一句实际有什么。
3. 给不出原因本身要报成解析器缺陷，不许伪装成"你的数据里没有这项"——否则我们自己的
   bug 会被当成用户的数据问题，用户不会反馈，我们也永远不知道。
4. 不写时间戳、不写 emoji、不写颜色转义：颜色由 logger 在 TTY 下加，重定向到文件时自动去掉。
