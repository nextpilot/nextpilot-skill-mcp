# 本地运行

**目标：站点跑起来，改哪刷哪。** 环境没装看 [`setup.md`](setup.md)。

---

## 一、起开发服务器

```bash
pnpm web:dev          # → http://localhost:3000
```

它**一次起两段**（`web/scripts/dev.mjs`）：先 `build-knowledge`（把规则 YAML、算子编译成
运行时产物），再同时起**知识热重建**与 `next dev`。Ctrl+C 一起停。

**热更新分两段**：

| 你改了                                                            | 谁负责                                            |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| `web/` 里的代码与站点内容（`.tsx` / `.css` / `content/**/*.mdx`） | Next 自己热更新（内容运行期读盘，刷新即见）       |
| 知识真源（`knowledge/` 下的规则 / 图 / 算子）                     | `build-knowledge --watch` 重建产物，Next 才看得到 |

> **起不来往往不是 Next.js 的问题，是知识库写错了。** 构建脚本里全是 `throw`
> （规则必填字段、算子名是否注册、表达式能否编译），报错信息直指哪个文件哪个字段。

**建议另开一个终端**看类型错误（不阻塞、不进任何门禁）：

```bash
pnpm web:typecheck --watch
```

只开一半 / 单独开热重建：

```bash
pnpm --filter ./web dev:no-watch   # 构建 + next dev，不挂 watch
pnpm web:kb:watch                  # 单独开着知识热重建（另开终端时用）
```

> **`pnpm web:dev` 会阻止第二个 dev server**：Next 16 按**目录**判重（不是按端口），
> 同一目录已有 dev server 时直接报错退出，换 `PORT` 没用。

## 二、本地能访问的页面

| 路由               | 干什么                                   |
| ------------------ | ---------------------------------------- |
| `/`                | 首页                                     |
| `/guide`           | 用户与开发指南（`web/content/guide/`）   |
| `/skills` / `/mcp` | Skill 库 / MCP 目录                      |
| `/log`             | **日志分析**：上传 `.ulg` 浏览器本地解析 |
| `/tools/editor`    | 规则编辑器（写规则时用）                 |
| `/issue`           | 反馈入口                                 |

## 三、本地跑 E2E

```bash
pnpm web:test:e2e:smoke   # 16 条关键路由，分钟级
pnpm web:test:e2e:log     # 分析全流程，约 7min（首次要下 Pyodide WASM）
```

E2E 首次跑要 7 分钟（Pyodide 下 WASM + numpy + pyulog），别在前 2 分钟以为卡死。

## 四、本地跑 MCP 服务（可选）

`server/` 是 **stdio 传输**的 MCP server——不是 HTTP 服务，不用"起服务再访问端口"，
而是让 AI 客户端（Claude Code / Cursor 等）通过配置**拉起这个进程**：

```jsonc
// AI 客户端的 MCP 配置里指向仓库，路径换成你自己的
{ "command": "python", "args": ["-m", "nextpilot_mcp"], "cwd": "/path/to/nextpilot-skill-mcp" }
```

依赖在 [`setup.md`](setup.md) §二装（`requirements-server.txt`）。

> ⚠️ **stdout 是协议线**：`server.py` 及其依赖**都不许往 stdout 写任何东西**。
> 冒烟测试在进程内调（`Client(mcp)`），**不要用 `python -c "...print(...)"` 去测协议**。
> 机制与 9 个工具清单见 [`../architecture/mcp-server.md`](../architecture/mcp-server.md)。

## 五、本地联调 KV / 边缘函数（可选）

```bash
npm i -g edgeone
edgeone pages login
cd web
edgeone pages link        # 关联线上项目（拉取 KV 绑定与环境变量）
edgeone pages dev         # 本地同时跑 Next、functions、KV 模拟
```

环境变量、KV 绑定、排障见 [`../operations/README.md`](../operations/README.md)。
