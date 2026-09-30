# 快速开始

**从零到跑起来。** 这一份只讲**装什么、敲什么**；装完之后「改完该跑哪些检查」
见 [`checks-by-stage.md`](checks-by-stage.md)。

| 你想知道                                 | 看这份                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| **装环境、跑起第一条命令、常用命令**     | 本文                                                     |
| **改完代码该跑哪些检查、耗时、红了看哪** | [`checks-by-stage.md`](checks-by-stage.md)               |
| 部署、环境变量、KV、排障                 | [`../operations/README.md`](../operations/README.md)     |
| 系统是怎么分层的                         | [`../architecture/README.md`](../architecture/README.md) |

---

## 一、先决条件

| 工具    | 版本                      | 装法                                        |
| ------- | ------------------------- | ------------------------------------------- |
| Node.js | 22.x                      | <https://nodejs.org>（或用 nvm / fnm 管理） |
| pnpm    | 10.x（**全局工具**）      | `npm i -g pnpm`                             |
| Python  | 3.11+，**带 ruff/pytest** | 见下方                                      |
| Git     | 任意                      | 系统包管理器                                |

**Python 解释器是本项目最大的一个坑**：`python` 不等同于「能跑本仓检查的 python」。
本仓的 Python 检查用 `sys.executable -m ruff` 调用 ruff，若解释器里没装 ruff，
**每次 push 都红**。所以先装开发依赖并自检：

```bash
python -m pip install -r requirements-dev.txt
python -c "import ruff, yaml, pyulog, pytest"   # 不报错即合格
```

> `pip-audit` 要指定官方源（本机默认的 aliyun 镜像是 HTTP，会被 pip 判为不安全）：
> `python -m pip install pip-audit==2.10.1 --index-url https://pypi.org/simple`

`.githooks/` 下的 hook 会自己探测解释器（**优先 anaconda，回退 PATH 上的 `python`**），
但探测有前提——候选解释器里得真的有 ruff。装好依赖即可。

**可选**：真实 `.ulg` / `.bin` 日志。仓库自带两份小样本
（`tools/testdata/logs/` 下两个 `sample*`），够跑通流程；要跑全量回归需自己下日志，
见 [`../knowledge/baselines.md`](../knowledge/baselines.md)。

---

## 二、跑起来

```bash
git clone <repo> && cd nextpilot-skill-mcp

cd web && pnpm install && cd ..   # 前端依赖

pnpm web:dev                      # 起开发服务器
```

`pnpm web:dev` 转发到 `web/` 的 `dev`（`web/scripts/dev.mjs`），
**一次起两段**：先 `build-knowledge`（把规则 YAML、算子编译成运行时产物），
再同时起知识热重建与 `next dev`。Ctrl+C 一起停。

> **起不来往往不是 Next.js 的问题，是知识库写错了。** 构建脚本里全是 `throw`
> （规则必填字段、算子名是否注册、表达式能否编译），报错信息会直指哪个文件哪个字段。

**建议再开一个终端**看类型错误（不阻塞、不进任何门禁）：

```bash
pnpm web:typecheck --watch
```

只开一半 / 单独开热重建：

```bash
pnpm --filter ./web dev:no-watch   # 构建 + next dev，不挂 watch
pnpm web:kb:watch                  # 单独开着知识热重建（另开终端时用）
```

---

## 三、常用命令

**前端**（命令都在仓库根跑，`web:*` 前缀转发到 `web/`）：

| 命令                      | 干什么                                               |
| ------------------------- | ---------------------------------------------------- |
| `pnpm web:dev`            | 开发服务器（含知识构建 + 热重建）                    |
| `pnpm web:build`          | 生产构建（`build:kb` + `next build`，约 144s）       |
| `pnpm web:build:kb`       | 只重建知识产物；`-- --check` 只比对不写入            |
| `pnpm web:test:e2e:smoke` | 关键路由冒烟（16 条，分钟级）                        |
| `pnpm web:test:e2e:log`   | 日志分析全流程 E2E（约 7min，首次要下 Pyodide WASM） |
| `pnpm web:test:e2e`       | 全量 E2E（42 条）                                    |

> **E2E 三条**：根层对应 `web:test:e2e` / `web:test:e2e:smoke` / `web:test:e2e:log`，
> 定义在 `web/package.json`（`test:e2e` / `test:e2e:smoke` / `test:e2e:log`）。

**本地 MCP 服务**（`server/`，可选——只有要让 AI 助手直接分析本地日志时才需要）：

```bash
# 依赖：server 那份单独装，不进开发机默认依赖
python -m pip install -r requirements-dev.txt -r requirements-server.txt

# 启动（stdio，阻塞到对端断开）
python -m nextpilot_mcp
```

它是 **stdio 传输**，不是 HTTP 服务——不用手动"起服务再访问端口"，而是让 AI 客户端
（Claude Code / Cursor 等）通过配置去**拉起这个进程**：

```jsonc
// 客户端配置里指向仓库，路径换成你自己的
{ "command": "python", "args": ["-m", "nextpilot_mcp"], "cwd": "/path/to/nextpilot-skill-mcp" }
```

> ⚠️ **stdout 是协议线**：`server.py` 及其依赖**都不许往 stdout 写任何东西**。
> 想冒烟测试就在进程内调（`Client(mcp)`），**不要用 `python -c "...print(...)"` 去测协议**。
> 机制与 9 个工具清单见 [`../architecture/mcp-server.md`](../architecture/mcp-server.md)。

**代码检查**（本地手动跑，与 hook 同一套）：

| 命令             | 干什么                                     |
| ---------------- | ------------------------------------------ |
| `pnpm lint:all`  | 格式化 + lint + 类型（全仓，跑一遍约 20s） |
| `pnpm format`    | 只格式化（md / py / js）                   |
| `pnpm lint`      | 只 lint（md / js / py）                    |
| `pnpm typecheck` | `tsc` + `pyright`                          |
| `pnpm eng:test`  | 引擎单测（算子 + CEL 沙箱）                |

**检查门禁**（Python 统一入口）：

| 命令                                              | 干什么                                 |
| ------------------------------------------------- | -------------------------------------- |
| `python tools/ci/check_all.py --push`             | 本地快检（推送时自动跑的同一套）       |
| `python tools/ci/check_all.py --push --skip-logs` | 同上，但跳过日志回归（本机无日志时用） |
| `python tools/ci/check_all.py --list`             | 打印完整检查清单，不执行               |

> **七个开关是平等的**：`--build` / `--commit` / `--push` / `--ci` / `--e2e` / `--mutate` / `--audit`，
> 可任意组合。**没有 `--stage`**——那是旧文档里的错法。
> 不带任何开关时默认 `--build --commit --push --ci`。
> 分档依据与每档跑什么，见 [`checks-by-stage.md`](checks-by-stage.md)。
>
> ⚠️ **`pnpm --filter` 必须带 `./`**（脚本里已写好）：`web` 是**目录**不是包名
> （`web/package.json` 的 `name` 是 `nextpilot-skill-mcp`），不带 `./` 时 pnpm 按包名匹配 →
> 匹配 0 个项目 → **rc=0、零输出、静默空跑**。手动敲命令时留意。
>
> ⚠️ **`pnpm` 是全局工具**，`web/node_modules/` 下没有它。

---

## 四、五个最常踩的坑

1. **Python 解释器没有 ruff** → 每次 push 都红。装 `requirements-dev.txt`。
2. **`pnpm --filter` 少了 `./`** → 静默空跑（rc=0、零输出）。
3. **`pnpm web:dev` 起不来** → 先看是不是知识库 YAML 写错了，报错会指到文件与字段。
4. **E2E 首次跑要 7 分钟** → Pyodide 要下 WASM + numpy + pyulog，别在前 2 分钟以为卡死。
5. **本地 `pnpm audit` 红但 CI 绿** → 本机 `~/.npmrc` 指向 npmmirror（无 audit 端点），
   需带 `--registry=https://registry.npmjs.org/`。

更多坑（hook 解释器探测、`pnpm add` 卡 20 分钟等）见
[`checks-by-stage.md`](checks-by-stage.md) 第十三节。
