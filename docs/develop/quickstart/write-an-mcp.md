# 编写一个 MCP 条目

**目标：在本地开发环境里做出一个可收录的 MCP 条目。**
MCP 服务本身怎么开发（定义工具、参数校验、接入客户端）**真源在站内
[`/guide/write-mcp`](https://nextpilot-skill-mcp.pages.dev/guide/write-mcp)**；
本文讲**收录进平台**的闭环。

---

## 一、分清两个东西

| 名字              | 是什么                                            | 代码                                                                                         |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **MCP 条目库**    | 站点上展示的「别人的 MCP 服务」合集（本文的对象） | `web/content/mcp/`                                                                           |
| **平台 MCP 服务** | 本项目自己的 server（`python -m nextpilot_mcp`）  | `server/nextpilot_mcp/`，见 [`../architecture/mcp-server.md`](../architecture/mcp-server.md) |

## 二、收录一个条目

```text
web/content/mcp/<slug>/             # slug 用反向 DNS 命名（与 Skill 的 kebab 不同）
├── server.json                     # MCP Registry 规范的清单（唯一真源）
└── README.md                       # 给人看的说明与 frontmatter
```

```bash
# 1. 写两份文件

# 2. 规范校验（自带反例自检）
pnpm web:check:mcp

# 3. 本地看效果：dev server 开着，刷新 /mcp 与 /mcp/<slug>
```

**要点**：

- **传输方式的唯一真源是 `server.json` 的 `packages[0].transport.type`**；
  上游未确认的条目没有 `server.json`，退回 README frontmatter 过渡值（页面显示"待补"）。
  两份并存即双真源，`check-mcp-spec` 会判红。
- 当前条目：`ardupilot-log`、`msfs-sim-flight`（后者 `upstream_status: pending`，
  核实上游后补 `server.json`）。

## 三、过门禁

`git push` 时 hook 会跑 `check-mcp-spec`。提交消息格式见
[`../contribute/README.md`](../contribute/README.md)。

---

**想让 AI 直接调本平台的分析能力？** 那是跑平台自带的 MCP server，见
[`run-locally.md`](run-locally.md) §四。
