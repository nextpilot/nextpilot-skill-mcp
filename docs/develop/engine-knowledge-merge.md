# knowledge 独立成项目（方案，未执行）

> 状态：**方案，未执行**。只做规划，不动代码。
> 已先行落地的两项：`rule_engine.py` + `report_data.py` 合并为 `knowledge/engine/engine.py`（含产物归一），
> 以及 `rules-editor-schema.generated.json` 从族目录挪到 `knowledge/` 根。其余按本文执行。

## 0. 需求（这就是全部）

1. **`knowledge/` 是一个独立项目。** 知识本身 + 处理它的工具，都在它里面。
2. **knowledge 自己编译自己**，产出各种产物。
3. **web 和 server 直接引用产物。** web 在 dev 时调 knowledge 的 build、把结果拉过来；server 引用它产出的库。

不由这三条派生出来的，一律不做。

主体已澄清：**知识是本体、是项目最大价值；engine 只是工具**，职责是把知识库编译成各种产物。
`knowledge/` 必须是**一级目录**。

## 1. 目录形态：方案 C

| 方案                                        | 结果结构                         | 谁是一级目录  | 引用改动量                                   |
| ------------------------------------------- | -------------------------------- | ------------- | -------------------------------------------- |
| A `engine/` 保持，knowledge 移入            | `engine/knowledge/`              | engine        | knowledge 全改（含**运行期** `contentRoot`） |
| B 新建目录，两者都移入                      | `xxx/engine/` + `xxx/knowledge/` | 新名          | 两边全改 + 守卫改名                          |
| **C（采纳）`knowledge/` 保持，engine 移入** | `knowledge/engine/`              | **knowledge** | 只改 engine 侧                               |

选 C 的两条硬理由：

1. 主体关系必须体现在目录上。`engine/knowledge/` 读作引擎项目里带了点数据，把关系写反了。
2. **`knowledge/` 侧一处都不用改**，其中包含 `web/lib/constants.ts:59` 的 `contentRoot` 这种**运行期读取**的硬骨头。改错的表现是 Skill 0 个、指南 0 篇，不报错、CI 全绿。

目标结构：

```text
knowledge/                  ← 独立项目根（一级目录）
├── px4/  engine/           知识 + 工具
├── scripts/build.mjs       编译器（原 web/scripts/build-knowledge.mjs）
├── dist/                   knowledge 自己的产物（源与产物分离）
│   ├── workers/            analysis-engine.generated.ts · fault-kb.generated.json
│   ├── lib/                prompts.generated.js · plots.generated.ts · derived-version.generated.ts
│   ├── guide/              rule-catalogue.mdx · rule-schema.mdx
│   ├── params/             px4-main.json
│   └── rules-editor-schema.generated.json   与固件族无关，放 dist/ 根
├── package.json            build / build:check（pnpm）
└── pyproject.toml          出 wheel（uv）
```

web 侧调法：`pnpm --filter knowledge build && node scripts/pull-knowledge.mjs && next dev`。
`pull-knowledge.mjs` 是薄拷贝、不含知识逻辑，按映射表把 `dist/**` 搬到 web 内对应位置。
映射表是这条同步关系唯一的真源，建议落 `knowledge/dist-map.json`，两侧脚本都读它。

`--check` 守卫跟着搬到 knowledge 侧：它比对的是源到产物，本来就该由产出方负责。

## 2. 改动的引用面

必改（改错就坏）：

| 位置                                       | 现值                                                      | 改为                                                   |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------ |
| `web/scripts/build-knowledge.mjs`          | `resolve(webRoot, "../engine")`                           | `resolve(webRoot, "../knowledge/engine")`              |
| `tools/engine/check_engine_purity.py:135`  | `BROWSER_MARKER = (..., 'resolve(webRoot, "../engine")')` | `'resolve(webRoot, "../knowledge/engine")'`            |
| `tools/ci/mutate_guards.py:330`            | `path="engine/report_data.py"`                            | `"knowledge/engine/engine.py"`                         |
| `pyproject.toml:47-49`                     | `"engine/rule_engine.py" = ["F821"]` 等三条               | 前缀加 `knowledge/`（合并后这份豁免可少一条）          |
| `pyproject.toml:58`                        | `testpaths = ["engine/tests"]`                            | `["knowledge/engine/tests"]`                           |
| `tools/engine/check_engine_pyodide.py:218` | 单独读 data 产物做跨语言名字核对                          | 产物已归一为 `PY_ULG_ENGINE`，同步改（最容易漏的一处） |

建议一并更新（不改不坏，但会误导）：`docs/**`、`CLAUDE.md`、各 `README.md` 里的叙述性路径，以及各 `.generated.*` 产物头部注释里的源文件位置。

## 3. 三个「改错不报错 / 报错但别误判」的点

### 3.1 `contentRoot` 是运行期读的

方案 C 不动它。若将来改成 A/B，改错的表现是**指南 0 篇、Skill 0 个**，不抛异常、CI 全绿。
→ **验收必须手工开页面确认 Skill / MCP 列表非空**，不能只看 CI。

### 3.2 `check_engine_purity.py` 会主动变红，是好事

它除了本职还做两件事：`MIN_SCANNED = 3` 断言 `engine/` 下至少扫到 3 个 .py；
用硬编码字符串断言两个消费者还在。移动 `engine/` 后它**必然变红**，marker 必须同步改。

**变红是守卫正常工作的证据**：先确认它红在 `knowledge/engine` 找不到，改完后确认转绿。

改 marker 有个反向陷阱：改得比实际写法更宽松（比如只匹配 `"engine"`）会让守卫**恒绿**，那才是真事故。改完必须自证。

### 3.3 变异锚点与行尾

`mutate_guards.py` 里那两处是**变异测试的锚点字符串**。engine 移走后它们不再匹配任何内容，`--with-mutate` 会报找不到待变异内容——要认出这是路径没同步，不是守卫坏了。

`.gitattributes:6` 记录了行尾的坑：处理不当会让 8 个产物全部被误报成与 knowledge 不一致，且只在 Windows 全新 clone 上复现。`git mv` 后务必跑 `pnpm web:build:kb --check`；若出现全部产物不一致，先查行尾再查逻辑。

## 4. 编译器归属

编译器是 `web/scripts/build-knowledge.mjs`：读 `knowledge/px4/`，产出 10 份形态各异的产物。
它现在住在消费方 `web/` 里，不住在本体里。

**定论（不是选择题）**：knowledge 自产出，web 在 dev 时调用并拉取。编译器只往 knowledge 自己的产物目录写，**永不跨项目写 `web/`**。

⚠️ **唯一要保持的动作**：拉进 `web/` 的产物**仍需入库**。EdgeOne 云端只跑 `next build`、不跑构建器，云端拿不到 knowledge。这也是"改了源忘了重新拉"这个风险的来源：产物入库 + 云端不重建 = 漂移只能靠 knowledge 侧的 `--check` 在 CI 里拦住，所以守卫自证里要加上这一条。

## 5. monorepo 形态：双语言包

编译器是 Node 脚本（`.mjs`，依赖 `yaml`），但 knowledge 同时要产出 Python wheel。
**knowledge 不是纯 Python 项目，是"Python 产物 + Node 编译器"的双语言包**，需要两个包管理器同时认它：

| 管理器 | knowledge 需要什么                                            | 用途                                                |
| ------ | ------------------------------------------------------------- | --------------------------------------------------- |
| pnpm   | `knowledge/package.json`（name / scripts.build / deps: yaml） | web 用 `pnpm --filter knowledge build` 调它的编译器 |
| uv     | `knowledge/pyproject.toml`（`[project]` + `[build-system]`）  | 产出 wheel 给后端                                   |

两者可以共存。⚠️ 部署约束不受 monorepo 影响：EdgeOne 只上传 `web/`，knowledge 的 Node 编译器在云端不可用。

Node 侧一条旧结论仍然成立：**web 不要依赖 workspace 兄弟包**（部署只上传 `web/`，依赖了云端就装不上）。knowledge 进 pnpm workspace 是为了**能被调用**，不是为了被 import。

### 5.1 打包边界

setuptools 在 pyproject.toml 配置下 `include-package-data` 默认 **true**（与 setup.cfg / setup.py 相反）。
只要 knowledge 用了 setuptools-scm，**`knowledge/` 下所有 git 跟踪的非 .py 文件都会被收进 wheel**，包括 `px4/`（48 文件）+ `skills/`（24）+ `mcp/`（5）+ `engine/`。

控制手段（推荐第 1 条）：

1. `include-package-data = false` + 显式 `package-data` 白名单。代价是新增文件类型要记得补白名单。
2. 保留 true、用 MANIFEST.in 排除。MANIFEST.in 主要影响 sdist，wheel 侧仍受默认值影响，必须实测。
3. 不接 setuptools-scm，则 `include-package-data` 只认 MANIFEST.in，但版本号要手写。

## 6. 待拍板

1. **Python 包名 / wheel 名**：建议 `nextpilot_knowledge`，`engine/` 作为子模块。打包细节（`package-dir` 映射、`find` 会不会误收 `skills/` `mcp/`）**未实测**，实施前先验一次。
2. **要不要现在就加 `knowledge/pyproject.toml`**。⚠️ 若加，**只放 `[project]` + `[build-system]`，绝不放 `[tool.ruff]`**——Ruff 忽略没有 `[tool.ruff]` 段的 pyproject.toml，一旦加了，子配置**完全替换**（不是合并）根配置，表现为 `knowledge/engine/` 的 lint 规则突然不报错，不报错、CI 全绿。
3. **monorepo 建到什么程度**：只建 uv workspace，还是 pnpm + uv 双 workspace 都建。
4. **wheel 里装不装 skills/ mcp/**：只有 web 要卡片就排除，将来 server 供 Skill Hub API 就装，或拆第二个包 `nextpilot-content`。取决于后端需求清单。
5. **`--watch` 别把 `knowledge/` 根加进监听表**：`rules-editor-schema.generated.json` 仍在源目录内（只是不在族目录里），监听根目录会自触发。

## 7. 与既有决策的关系

- 2026-09-23 上午曾决定维持现状、不动目录（见 `directory-layout-migration.md`，已搁置）。本次是**局部反转**，范围仅限 `engine/` 移入 `knowledge/`，`web/`、`tools/`、`docs/`、knowledge 内部结构不动。
- 本次不动 Node 侧：部署上传范围仍只有 `web/`，且 web 产物是内联字符串、不依赖兄弟包，加 pnpm workspace 零收益。
