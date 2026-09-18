# nextpilot-skill-mcp

飞控 × AI 的 Skill / MCP 交流分享平台。按「感知 → 决策 → 控制 → 工具链」组织飞控 AI Skill，并内置确定性日志分析服务：**浏览器端解析日志、规则引擎做数值判断、LLM 只做中文解释**。

本项目采用 [BSD-3-Clause](LICENSE) 许可证。

> PX4 `.ulg` 端侧解析内置 **32 条自包含检查经验（16 个执行位置 / 74 个算子）+ 10 条故障知识库**，
> 输出 GJB-841 中文报告。Skill Hub + GitHub/邮箱登录 + EdgeOne KV 已上线。

## 目录结构

```text
.
├── CLAUDE.md        # 项目说明（定位、架构、路线图、决策依据）
├── LICENSE          # BSD-3-Clause 许可证
├── README.md
├── content/         # ★ 站点内容源（MDX）：guide/ 使用指南、skills/ Skill 卡片、mcp/
├── docs/            # 架构、运维手册（operations/ 是真实可用的部署运行手册）
├── engine/          # ★ 确定性引擎源码：operators / rule_engine / report_data
├── knowledge/       # ★ 日志分析的经验与字典：rules/*.yaml / 故障库 / LLM 提示词 / meta
├── tools/           # 手动运行的工具：px4/ 上游同步与文档生成、calibrate/ 回归校准、ci/ 校验入口
└── web/             # Next.js 站点 + Pages Functions（当前冲刺代码）
    ├── app/         # 页面与 /api/auth 路由
    ├── components/
    ├── functions/   # EdgeOne 边缘函数（KV、配额、DeepSeek 转发）
    ├── lib/
    ├── scripts/     # 构建期脚本（build-knowledge.mjs，由 pnpm dev/build 前置调用）
    └── workers/     # Pyodide Worker（手写）+ **生成**的 Python 规则脚本（勿手改）
```

日志分析的规则、阈值与提示词**只维护在 `knowledge/`**，改完跑 `cd web && pnpm build:kb --check`
比对（不带 `--check` 则生成运行时产物与指南页）；详见 [knowledge/README.md](knowledge/README.md)。
`engine/` 是阶段二服务端引擎的预留位，当前无运行时代码，说明见 [engine/README.md](engine/README.md)。

## 快速开始

```bash
cd web
pnpm install
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY
pnpm dev
```

打开 <http://localhost:3000> ：

- `/` 首页与精选 Skill
- `/guide` Skill / MCP 帮助文档与提交使用指南
- `/skills` Skill 技能库（构建期读取 `content/skills/*.mdx`，Fuse.js 客户端搜索）
- `/analyze` PX4 日志分析（Pyodide + pyulog 在 Web Worker 中本地解析）

## 架构

```text
选择 .ulg（全程留在浏览器，不上传原始文件）
  → Web Worker 内 Pyodide 运行 pyulog 解析 + 32 条规则检查（rules/*.yaml → 构建期内联）
  → 结构化 findings（仅上传脱敏后的结论，不含原始轨迹）
  → /api/explain（EdgeOne Pages Function，持有 DeepSeek Key）
  → 中文 Markdown 报告（GJB-841 格式）
```

- **第一层 解析引擎**：Pyodide（WASM Python）+ pyulog，见 `web/workers/ulog-worker.ts`
- **第二层 规则检查**：YAML 声明式规则 → 构建期编译为 Python → 内联进 `web/workers/ulog-check-script.ts`，覆盖振动、EKF、电源、GPS、姿态、失效保护等 16 个检查维度
- **第三层 LLM 解释**：`web/functions/api/explain.js`，只接收 findings，system prompt 禁止编造数值

新增 Skill：在 `content/skills/` 添加一个 `.mdx` 文件并补全 frontmatter（字段规范见 CLAUDE.md 3.1）。

## 校验与 CI

所有校验收在**一个入口**（CI、pre-push hook 与本地跑的是同一份清单；要加一项校验只改
`tools/ci/check_all.py` 一处，CI 自动跟着变）：

```bash
python tools/ci/check_all.py                 # 常规（本机有日志时连带跑日志类回归）
python tools/ci/check_all.py --with-build    # 再加 next build（CI 用，本地太慢）
```

分两组，**区别在于是否需要真实 `.ulg` 日志**：

| 组 | 拦什么 | 在哪跑 |
| --- | --- | --- |
| 不需要日志 | ruff 风格与 lint；`build:kb --check`（产物与 `knowledge/` 一致、契约不漏写）；指南页算子表是否跟上 `engine/` 源码；产物是否为合法 Python；`tsc --noEmit`；`next build` | 云端 CI（[.github/workflows/ci.yml](.github/workflows/ci.yml)）+ 本地 |
| 需要日志 | 6 条冻结基线逐字段比对、适配器契约测试、数据层 probe、字段引用 lint | **只在本地** —— 原始日志含 GPS 轨迹、按隐私规则不入库（见 `.gitignore`），CI 的 checkout 里没有这些文件 |

启用本地那道拦截（每台机器做一次；`core.hooksPath` 是本地设置，git 不跟着仓库走）：

```bash
git config core.hooksPath .githooks
```

> **CI 全绿 ≠ 回归过了**：改规则、算子或引擎后，必须在本机跑一次上面的命令 ——
> 需要日志的那组是这道回归的真正门槛，云 CI 覆盖不到。
> 校验项与设计理由见 [tools/ci/check_all.py](tools/ci/check_all.py) 的模块文档。
