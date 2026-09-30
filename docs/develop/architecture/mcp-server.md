# MCP 服务：把分析能力交给 AI

**两个不同的东西，名字容易混**：

| 名字              | 是什么                                                    | 代码                                  |
| ----------------- | --------------------------------------------------------- | ------------------------------------- |
| **平台 MCP 服务** | 本项目自己提供的 MCP server，让 AI 能分析本地日志         | `server/nextpilot_mcp/`               |
| **MCP 条目库**    | 站点上展示的「别人的 MCP 服务」合集（Skill Hub 的一部分） | `web/content/mcp/` + `web/lib/mcp.ts` |

本文讲**前者**；后者是站点内容，见 [`web-app.md`](web-app.md) §五。

---

## 一、定位

`server/` 是一个 **stdio MCP server**，把「日志分析 + 知识库」两件事交给 AI 助手：

- **日志侧**：给一份 PX4 `.ulg` 路径 → 引擎按知识库规则算出**确定性结论**。
- **知识侧**：读 `knowledge/` 下规则与故障库的**原文与出处**。

**设计原则：`server/` 只做「取数 → 交给引擎 → 摆成契约形状」，不含任何阈值或建议。**
改经验只改 `knowledge/`，**`server/` 一行不动**。

---

## 二、工具清单（9 个，全部只读）

所有工具标 `read_only_hint=True, open_world_hint=False`——不写文件、不联网。

**日志侧 5 个**：

| 工具                                        | 干什么                                               |
| ------------------------------------------- | ---------------------------------------------------- |
| `analyze_log(path)`                         | 完整分析：返回 `LogReport`（结论 + 关键数字 + 判定） |
| `log_summary(path)`                         | 概要：机型 / 固件 / 时长 / 结论计数                  |
| `list_events(path, ...)`                    | 事件时间线（可按级别、模式过滤）                     |
| `query_timeseries(path, topic, field, ...)` | 取某字段的时间序列（供 AI 看波形）                   |
| `get_params(path, name_glob=None)`          | 初始参数表（支持通配）                               |

**知识侧 4 个**：

| 工具                | 干什么                             |
| ------------------- | ---------------------------------- |
| `list_checks()`     | 规则目录（有哪些检查）             |
| `get_rule(rule_id)` | 取某条规则的原文                   |
| `get_fault(name)`   | 取某条故障的根因 / 排查步骤 / 禁忌 |
| `list_faults()`     | 故障库目录                         |

**给 AI 的指令**（写在 server 的 `instructions` 里）：

> 先调 `log_summary` 看清固件与机型（**同一参数在不同固件版本含义可能不同**），
> 再调 `analyze_log`。解释时请引用 `docUrl` / 规则原文，**不要自己发明根因**。

---

## 三、引擎装配

`server/` 复用 `knowledge/engine/loader.py`——**与本地工具同一份装配入口**，
不另存一份引擎：

```python
# server.py 在 import 期把 knowledge/engine 插进 sys.path，再 import loader
_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENGINE_DIR = _REPO_ROOT / "knowledge" / "engine"
sys.path.insert(0, str(_ENGINE_DIR))
import loader
```

**产品只依赖 `knowledge/` 本体，不依赖 `tools/`**（那是开发工具）。

**按 (路径, mtime) 缓存命名空间**：同一份日志会被多个工具连续问，
而装配一次要读 5+ 个源文件再 `exec`，故缓存；文件被换掉即失效。

> ⚠️ **stdout 是协议线**：`server.py` 与其依赖在 import 期与运行期**都不许往 stdout 写**。
> 本地冒烟测试用 `Client(mcp)` 进程内调用，**不要用 `python -c "...print..."` 去测协议**。

---

## 四、与浏览器端的关系

两处跑**同一份引擎源码**，场景不同：

|          | 浏览器（Pyodide Worker）       | MCP server（本地 Python） |
| -------- | ------------------------------ | ------------------------- |
| 触发     | 用户在 `/log` 上传日志         | AI 助手调工具             |
| 日志位置 | 内存字节，不出端               | 本地文件路径              |
| 面向     | 人类看报告页                   | AI 拿结构化结论           |
| 引擎     | `analysis-engine.generated.ts` | `loader.py` 装配          |

**同一份 `knowledge/` 源码，两处不会漂移**——这是刻意的设计。

---

## 五、站点上的 MCP 条目库

`web/content/mcp/<slug>/` 存放**别人的 MCP 服务**的展示信息：

| 文件          | 是什么                              |
| ------------- | ----------------------------------- |
| `server.json` | MCP Registry 规范的清单（唯一真源） |
| `README.md`   | 给人看的说明与 frontmatter          |

**传输方式的唯一真源是 `server.json` 的 `packages[0].transport.type`**；
上游未确认的条目没有 `server.json`，退回 README frontmatter 过渡值，否则显示"待补"。
**两份并存即双真源**，由 `web/scripts/check-mcp-spec.mjs` 判红。

当前条目：`ardupilot-log`、`msfs-sim-flight`。
