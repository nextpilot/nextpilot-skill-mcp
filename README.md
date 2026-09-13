# nextpilot-skill-mcp

飞控 × AI 的 Skill / MCP 交流分享平台。按「感知 → 决策 → 控制 → 工具链」组织飞控 AI Skill，并内置确定性日志分析服务：**浏览器端解析日志、规则引擎做数值判断、LLM 只做中文解释**。

> 当前进度：冲刺 1（见 CLAUDE.md 第 8 节）。Skill Hub 静态站 + PX4 `.ulg` 端侧解析（3 条基础规则）+ DeepSeek 解释层。

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY
pnpm dev
```

打开 http://localhost:3000 ：

- `/` 首页与精选 Skill
- `/skills` Skill 库（构建期读取 `content/skills/*.mdx`，Fuse.js 客户端搜索）
- `/analyze` PX4 日志分析（Pyodide + pyulog 在 Web Worker 中本地解析）

## 架构

```text
选择 .ulg
  → Web Worker 内 Pyodide 运行 pyulog 解析 + 3 条规则检查（本地，文件不上传）
  → 结构化 findings
  → /api/explain（Pages Function，持有 DeepSeek Key）
  → 中文 Markdown 报告
```

- **第一层 解析引擎**：Pyodide（WASM Python）+ pyulog，见 `workers/ulog.worker.ts`
- **第二层 规则检查**：`workers/ulog-check-script.ts` 中的 Python 规则（振动/IMU 削波、EKF 创新检验、电芯电压），阈值待真实日志校准
- **第三层 LLM 解释**：`app/api/explain/route.ts`，只接收 findings，system prompt 禁止编造数值

新增 Skill：在 `content/skills/` 添加一个 `.mdx` 文件并补全 frontmatter（字段规范见 CLAUDE.md 3.1）。

## 待验证（冲刺 1 风险项）

- EdgeOne Pages/Functions 对 Next.js API Route（edge runtime）的部署兼容性
- Pyodide 对真实大小 `.ulg` 的解析耗时与内存
- pyulog 在 Pyodide 下经 micropip 安装的完整性
