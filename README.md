# nextpilot-skill-mcp

飞控 × AI 的 Skill / MCP 交流分享平台，专注于 PX4 无人机日志的智能分析。

本项目采用 [BSD-3-Clause](LICENSE) 许可证。

---

## 这是什么？

这是一个面向 PX4 和 ArduPilot 无人机开发者和飞控工程师的开源平台，提供两大核心能力：

### 1. 飞控 AI Skill 与 MCP 分享

- **Skill**（技能）：面向 AI 编程助手（如 Claude、Cursor）的提示词卡片，让 AI 更懂飞控开发。
- **MCP**（Model Context Protocol 服务）：让 AI 能够直接调用飞控工具和数据源的标准化接口。

按「感知 → 决策 → 控制 → 工具链」分类组织，方便检索和复用。

### 2. 确定性日志分析引擎

支持 PX4 `.ulg` 和 ArduPilot `.bin` 两种飞控日志格式，平台在**浏览器本地**完成全部分析，输出中文报告：

- **原始日志不出浏览器** —— 隐私安全有保障
- **规则引擎做数值判断** —— PX4：31 条检查规则覆盖 16 个维度；ArduPilot：43 条规则（阈值 draft）
- **LLM 只做中文解释** —— AI 接收的是脱敏后的结构化结论，不接触原始数据

在线体验：已上线 [Skill Hub](https://nextpilot-skill-mcp.pages.dev)，支持 GitHub / 邮箱登录。

---

## 关键术语

| 术语          | 说明                                                               |
| ------------- | ------------------------------------------------------------------ |
| **PX4**       | 开源的无人机飞控固件，广泛用于多旋翼、固定翼等无人系统             |
| **ArduPilot** | 开源的无人机 / 无人车 / 无人船自动驾驶系统                         |
| **.ulg**      | PX4 的标准飞行日志格式，记录飞行过程中的传感器、状态、控制量等数据 |
| **.bin**      | ArduPilot 的数据闪存日志格式，自带 FMT 声明                        |
| **Skill**     | 面向 AI 的技能卡片，告诉 AI "怎么帮你做某件事"                     |
| **MCP**       | Model Context Protocol，Anthropic 推出的 AI 工具调用标准协议       |
| **GJB-841**   | 中国军用标准《军用飞机飞行数据记录设备通用规范》                   |

---

## 目录结构

```
.
├── CLAUDE.md           # 项目说明（定位、架构、路线图、决策依据）
├── LICENSE             # BSD-3-Clause 许可证
├── README.md
├── package.json        # 根级转发：pnpm -C web dev/build，这里不装依赖
├── docs/               # 文档
│   ├── guide/          # 面向用户的指南（发布到站内 /guide）
│   └── develop/        # 面向开发与运维
├── knowledge/engine/             # 确定性分析引擎源码（operators / engine）
├── knowledge/          # 日志分析的经验与数据
│   ├── px4/            # PX4 相关（rules/*.yaml / 故障库 / LLM 提示词 / meta）
│   ├── ardupilot/      # ArduPilot 相关（规则 / 故障库）
│   ├── skills/         # Skill 卡片内容
│   └── mcp/            # MCP 条目内容
├── tools/              # 手动运行的工具
│   ├── px4/            # PX4 上游同步与文档生成
│   ├── calibrate/      # 回归校准
│   └── ci/             # CI 校验入口
└── web/                # Next.js 站点 + Pages Functions（独立项目，有自己的 package.json）
    ├── content/        # 站点内容唯一真源（guide/skills/mcp，入库）
    ├── app/            # 页面与 /api/auth 路由
    ├── components/     # React 组件
    ├── functions/      # EdgeOne 边缘函数（KV、配额、DeepSeek 转发）
    ├── lib/            # 工具库
    ├── scripts/        # 构建脚本（build-knowledge.mjs）
    └── workers/        # Pyodide Web Worker + 自动生成的 Python 规则脚本（勿手改）
```

> **经验法则**：日志分析的规则、阈值与提示词**只在 `knowledge/` 下维护**。
> 改完后在根目录运行 `pnpm web:build:kb --check` 验证一致性。详见 [knowledge/README.md](knowledge/README.md)。

---

## 快速开始

```bash
# 1. 安装所有依赖（monorepo，pnpm workspace 会自动处理 web/）
pnpm install

# 2. 配置环境变量
cp web/.env.example web/.env.local
# 编辑 web/.env.local，填入你的 DEEPSEEK_API_KEY

# 3. 启动开发服务器
pnpm web:dev
```

打开 <http://localhost:3000>，可以访问以下页面：

| 路由       | 功能                                             |
| ---------- | ------------------------------------------------ |
| `/`        | 首页与精选 Skill                                 |
| `/guide`   | Skill / MCP 帮助文档与提交指南                   |
| `/skills`  | Skill 技能库（支持 Fuse.js 客户端搜索）          |
| `/mcp`     | 收录的 MCP 服务                                  |
| `/analyze` | PX4 / ArduPilot 日志分析（Pyodide 浏览器端解析） |
| `/login`   | 登录（GitHub / 邮箱验证码）                      |
| `/me`      | 个人中心与历史报告                               |
| `/tools`   | 开发工具与资源                                   |

---

## 分析流程

整个日志分析在用户浏览器中完成，流程如下：

```
用户选择 .ulg / .bin 文件（全程留在浏览器，不上传原始文件）
  │
  ▼
第一层 · 解析引擎
  Pyodide（WASM 中的 Python）本地解析日志
  PX4：pyulog；ArduPilot：自研解析器（无 pymavlink）
  │
  ▼
第二层 · 规则检查
  PX4：31 条 YAML 规则（16 个维度）
  ArduPilot：43 条 YAML 规则（来自 ardupilot-mcp 的 16 项检查）
  构建期编译为 Python → 内联到 Worker
  │
  ▼
第三层 · LLM 解读
  仅上传脱敏后的结构化结论（不含原始轨迹数据）
  → /api/explain（EdgeOne Pages Function，持有 DeepSeek Key）
  → 输出中文 Markdown 报告
```

关键原则：**AI 只接收结论，不能编造数值**（system prompt 对此有严格约束）。

---

## 参与贡献

### 新增 Skill

在 `web/content/skills/<slug>/` 下创建目录，放入三份文件：

| 文件           | 用途               |
| -------------- | ------------------ |
| `SKILL.md`     | 给 AI 看的技能定义 |
| `README.md`    | 给人看的展示页     |
| `CHANGELOG.md` | 版本历史           |

字段约束见 `knowledge/README.md`，完成后运行 `pnpm web:check:skills` 校验。

### 新增 MCP 条目

在 `web/content/mcp/<slug>/` 下创建目录，走 MCP Registry 规范：

- 使用反向 DNS 命名（与 Skill 的 kebab 命名不同）
- 需要提供 `server.json`
- 完成后运行 `pnpm web:check:mcp` 校验

### 新增指南页

在 `web/content/guide/` 下添加 Markdown 文件即可。

> **注意**：站点内容（guide/skills/mcp）的真源全部在 `web/content/` 下、直接入库，
> 没有构建期拷贝这一步。如果改完页面没变化，刷新一次即可（dev 模式下内容是运行期读盘的）。

---

## 校验与 CI

所有校验项统一入口：`tools/ci/checklist.yml`。CI、pre-push hook、本地运行共用的都是同一份清单，加一项校验只改这一个文件即可。

### 常用命令

```bash
# 本地快速检查（秒级，pre-push hook 跑的也是这个）
python tools/ci/check_all.py --stage push

# 云端 CI 级别检查（含产物比对、守卫自测、依赖审计）
python tools/ci/check_all.py --stage ci

# CI 级别 + Next.js 构建（本地跑比较慢）
python tools/ci/check_all.py --stage build,ci

# 查看所有阶段说明
python tools/ci/check_all.py --list-stages
```

### 两组校验

按是否需要真实 `.ulg` 日志文件分为两组：

| 分组           | 检查内容                                                                          | 运行位置                              |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| **不需要日志** | ruff 风格检查、`web:build:kb --check` 产物一致性、`tsc --noEmit`、`next build` 等 | 云端 CI + 本地                        |
| **需要日志**   | 6 条冻结基线逐字段比对、适配器契约测试、数据层自查、字段引用检查                  | **仅本地**（日志含 GPS 轨迹，不入库） |

### 启用 Git Hook

项目提供了三个 Git Hook，位于 `.githooks/` 目录：

| Hook         | 触发时机               | 作用                                      |
| ------------ | ---------------------- | ----------------------------------------- |
| `pre-commit` | `git commit` 前        | Python 代码风格与 lint 检查（ruff）       |
| `commit-msg` | 保存 commit message 时 | 校验提交信息格式                          |
| `pre-push`   | `git push` 前          | 运行 `check_all.py --stage push` 快速检查 |

启用方式（每台机器执行一次，不随仓库同步）：

```bash
git config core.hooksPath .githooks
```

> **重要提醒**：CI 全绿不等于回归通过。修改规则、算子或引擎后，必须在本地跑一次"需要日志"那组检查，这是真正的回归门槛，云端 CI 覆盖不到。
>
> 校验项设计与原理详见 [`tools/ci/check_all.py`](tools/ci/check_all.py) 的模块文档。

---

## 仓库与远程

项目同时托管在 Gitee 和 GitHub，两者互为镜像：

```bash
origin  → https://gitee.com/nextpilot/nextpilot-skill-mcp.git  # Gitee（主）
github  → git@github.com/nextpilot/nextpilot-skill-mcp.git     # GitHub（镜像）
```

> 推送时两个远程都必须推到。详细开发流程见 [CLAUDE.md §6.9.2](CLAUDE.md)。
