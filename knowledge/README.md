# knowledge/ —— 日志分析的唯一知识源

飞控日志分析的**全部人工经验都在这一个文件夹里维护**。
Web 站点（浏览器端 Pyodide 引擎、边缘函数 LLM 层）和未来的平台 MCP Server
**都只消费这里派生出的产物，不在各自代码里另存一份阈值 / 根因 / 提示词。**

```
ulog/
  px4/
    px4-thresholds.toml   阈值 / 判据参数（最常改）
    px4-fault-kb.yaml     故障树：标签 → 根因 / 排查步骤 / 禁忌 / 风险等级
    ulog_checks.py        第一层解析 + 第二层规则检查（过程性逻辑，Pyodide 执行）
    ulog_data.py          报告页数据层 helpers（图表 / 事件 / 参数）
    px4-ulog-rules.md     规则清单 + robotto 8 条 ↔ 我们 15 条对照表（校准基线）
  llm/
    gjb841-system-prompt.md  第四层 GJB-841 思考范式
    report-empty.md          无 finding 时的固定结论文案
  knowledge-authoring.md  工程师方法论（四类经验 → 四种载体）
```

## 改什么 → 改哪个文件

| 我要…… | 编辑 |
| --- | --- |
| 调一条阈值（如欠压、振动、GPS eph） | `px4/px4-thresholds.toml` |
| 加一条故障模式（根因 / 排查步骤） | `px4/px4-fault-kb.yaml`（trigger_tags 必须是引擎会产出的标签） |
| 加一条全新检查过程 | `px4/ulog_checks.py`（命中调 `add(...)`，缺数据调 `skipped(...)`） |
| 改 AI 报告口径 / 思考范式 | `llm/*.md` |
| 看每条规则的字段、阈值、来历 | `px4/px4-ulog-rules.md` |

## 改完怎么生效 / 验证

```bash
cd web
pnpm build:kb          # 从 knowledge/ 重新生成 web/ 下运行时产物
# dev / build 脚本会自动先跑 build:kb，一般不用手动

# 等价回归（不依赖 Node，直接跑 knowledge 里的 Python 源）
python tools/calibrate/run_checks_locally.py engine/tests/logs/*.ulg
```

生成产物（提交进仓库，EdgeOne 直接 `next build` 也有得用）：

- `web/workers/ulog-check-script.ts`、`web/workers/ulog-data-script.ts`、`web/workers/fault-kb.generated.json`
- `web/lib/knowledge/prompts.generated.js`、`web/lib/knowledge/thresholds.generated.js`

**铁律**：生成物不要手改；所有数值判断只在 `ulog_checks.py` + TOML 里发生，LLM 只做翻译与组装。
