# 上线报错自动提 issue：设计与护栏

> 状态：设计稿（未实现）。
> 相关：`web/functions/`、`web/workers/`、`web/hooks/useLogAnalyzer.ts`、`docs/operations/README.md`

---

## 0. 现状：线上报错不留痕

调研结论（`web/` 下 112 个源文件）：

| 事实          | 说明                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| 87 处 `catch` | 全部只 `return` 一个错误消息给调用方，**没有一处落记录**                            |
| 边缘函数      | `api/explain.js` 的 LLM 失败只 `jsonResponse({error}, 502)`，服务端不留痕           |
| 前端          | **没有** `error.tsx` / `global-error.tsx` / `window.onerror` / `unhandledrejection` |
| 仓库          | 远端是 **Gitee**，无 `.github/`，无任何监控通道                                     |

后果很具体：上一轮那个 `NameError: __FACTS__` 让**整份日志都解析不了**，是用户截图才发现的。没人截，这个 bug 就一直在线上。

目标：线上每次报错，自动变成一条可搜索、有通知、能贴栈的 issue——**并且不能变成灾难**。

---

## 1. 架构：token 不能进浏览器

```text
浏览器                                 边缘函数（V8，持 secret）              外部
  window.onerror ─┐
  unhandledrejection ─┼─→ POST /api/issues ─┐
  Worker 解析失败 ─┘     （已脱敏的小 JSON）        │
  React error boundary ┘                          ├─→ 分级 ─→ 指纹去重(KV) ─→ 限流 ─→ Issue API
  边缘函数 catch（本地就有完整栈）──────────────────┘
```

两条不可动摇的原则：

1. **token 只在边缘函数。** 浏览器侧只 POST 到自己的 `/api/issues`，绝不接触 issue token（否则任何人打开 DevTools 就能拿到写权限）。边缘函数自身的错误在进程内直接进同一段上报逻辑，不走 HTTP。
2. **上报永不阻塞用户。** 走 `waitUntil()`（代码里已这么用），任何失败静默吞掉。**上报挂了绝不能影响分析**——这是比"能收到报错"更重要的约束。

---

## 2. 四道护栏

没有这四道，这个功能上线第一周就会变成灾难。

### 2.1 分级：不是所有错误都值得提 issue

**关键判断**：错误的频率分布完全两极，统一处理必崩。

| 级别       | 例子                                              | 频率             | 策略                           |
| ---------- | ------------------------------------------------- | ---------------- | ------------------------------ |
| **致命**   | Pyodide 解析崩溃、Worker 未捕获异常、页面渲染崩溃 | 低（一次发版级） | **必报**，去重后基本一次一个   |
| **可恢复** | LLM 502/超时、KV 写入失败、网络抖动、配额拒绝     | 高（每用户每天） | **按指纹每日一次**，绝不逐次报 |

把 `LLM 服务异常（502）` 这类逐次上报，一天就能刷出几百个 issue——而且它多半是上游抖动，不是你的 bug。

### 2.2 指纹去重：同一个 bug 只留一个 issue

- **指纹** = `sha256(type + 归一化消息 + 栈顶 3 帧 + app 版本)`。
  归一化是关键：UUID、时间戳、纯数字、hex 都要替换成占位符，否则同一个 bug 每次都算新指纹（`file 17.ulg` 和 `file 18.ulg` 必须同指纹）。
- KV 记 `err_{指纹hex}` → `{issueNumber, count, firstSeen, lastSeen, commentedAt}`。
- **首次** → 建 issue；**后续** → 给已有 issue **追加评论**（"又出现 N 次，最近 …"），不新建。
- 评论本身也要节流（同一指纹每小时最多一条），否则评论会被刷爆。
- KV 最终一致（60s 全球同步，写后不要立刻回读）→ 去重是尽力而为，所以还需 §2.4 的硬限流兜底。**偶尔重复建一个 issue 可以接受，刷爆不可以。**

### 2.3 脱敏：这项目的命根子

「原始日志从不上传」是核心卖点，错误上报不能变成后门。**用白名单，不用黑名单。**

**只允许带**：错误类型、归一化消息、栈（截断 4KB）、app 版本 / commit、路由路径、UA 摘要、是否登录（布尔）、匿名设备 hash。

**禁止带**：日志文件名、字段值、findings 内容、`evidence`、邮箱、uid、IP、cookie、`Authorization`、任何上游返回的 `detail` / `text` 原文（`explain.js` 现在把 DeepSeek 的响应体塞进了 `detail` 返回给前端——那种字段绝不能进 issue）。

即使按白名单采集，字符串还要过一遍正则替换：邮箱、`Bearer xxx`、`eyJ...`(JWT)、长 hex（可能是指纹/密钥）、绝对路径里的用户名（`C:\Users\xxx\`、`/home/xxx/`）。

> **GitHub issue 默认公开**。不建私有仓库的话，用户 A 的报错对全世界可见。这条必须先定（见 §5）。

### 2.4 限流与降级

- 每进程内存计数：每分钟最多 N 次 issue API 调用（建议 5），超了**直接丢弃**并记一条本地 warn。宁可漏报不可雪崩。
- 上游返回 403 / 429（限流）→ 静默放弃，**不重试**。
- `ISSUE_ENABLED` 未开或 `ISSUE_TOKEN` / `ISSUE_REPO` 未配 → 整个上报层是 **no-op**。本地开发、未配置环境天然安全，不需要额外开关。
- 上报接口本身要防滥用：`/api/issues` 是公开端点，按 IP + 设备 hash 限流（复用 `_lib/kv.js` 的日计数模式）。

---

## 3. 落点

| 文件                                   | 作用                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `web/functions/_lib/issue-filer.js`    | **新建**。指纹计算、脱敏、KV 去重、限流、调 issue API。平台无关（GitHub / Gitee 由 `ISSUE_PROVIDER` 选） |
| `web/functions/api/issues.js`          | **新建**。浏览器报错的唯一入口（POST），校验 + 限流 + 转交                                               |
| `web/functions/api/explain.js` 等      | 在 catch 分支调 `reportIssue(env, waitUntil, {...})`——服务端本地就有完整栈，最划算                       |
| `web/lib/issue-bridge.ts`              | **新建**。`window.onerror` + `unhandledrejection` + 导出手动 `reportError()`；采样与去抖在前端也做一层   |
| `web/app/global-error.tsx`             | **新建**。App Router 渲染错误兜底（现在完全没有）                                                        |
| `web/workers/pyodide-px4log-worker.ts` | Worker 内 `catch` 调 `reportError()`——**解析类错误是最该上报的一类**                                     |
| `docs/operations/README.md`            | 补环境变量表与排查条目                                                                                   |

环境变量（EdgeOne 控制台）：

| 变量             | 说明                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ISSUE_ENABLED`  | `1` 才开，不配则整个上报层 no-op                                                                                  |
| `ISSUE_PROVIDER` | `github`（默认）/ `gitee`                                                                                         |
| `ISSUE_REPO`     | `owner/repo`                                                                                                      |
| `ISSUE_TOKEN`    | **fine-grained PAT，只给目标仓库 `issues: write`**。不要用 classic token 的 `repo` 全权（那把代码读写都交出去了） |

---

## 4. 为什么是 issue，以及它的边界

小团队没有常驻监控服务，issue 是**免费、持久、可搜索、有通知、能贴栈**的最省事方案。用户这个判断是对的。

边界要说清：

- **issue 里的信息是二手的**。它告诉你"哪里炸了"，不告诉你"用户当时在干什么"。定位仍要靠复现。
- **不能替代体检**。已有的 `tools/ci/check_all.py`（含 6 份冻结基线回归）拦的是"已知会错的东西"；这条通道捞的是"没想到会错的东西"。两者不重叠，都要有。
- **上一轮那个 `__FACTS__` 恰恰是这条通道的典型猎物**：本地回归全绿（Python 全量替换），只有浏览器炸。有上报的话，上线几分钟内就会有一条 issue，而不是等用户截图。

---

## 5. 已定的决策

| 决策     | 选定                    | 理由与要付的代价                                                                                                         |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 目标仓库 | **现有 Gitee 仓库**     | issue 与提交在同一处看，省一个仓库。**代价：仓库是公开的**，用户报错对所有人可见——所以脱敏必须走白名单（§2.3），不能打折 |
| 上报范围 | **自动 + 人工上报入口** | 自动上报只看得见崩溃；"结论算错了"只有用户发现得了，而后者恰恰是日志分析最容易出的问题                                   |
| 浏览器端 | **报**                  | Pyodide 崩溃只在用户机器上发生，不报就抓不到（上一轮 `__FACTS__` 就是这么漏到线上的）。接受脱敏后的少量客户端数据上行    |

---

## 6. 实现落点（已完成）

| 文件                                            | 说明                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/lib/error-policy.js`                       | 新增。**两侧共用的政策**：脱敏规则与顺序、`clip()` 头尾保留截断、`normalize()` 指纹归一化、长度上限、级别白名单。浏览器与边缘都引它——见 §6.2      |
| `web/functions/_lib/issue-filer.js`             | 新增。指纹（归一化后 sha256 前 16 位）、KV 去重、内存限流、Gitee/GitHub 适配、失败留痕、`probeConfig()`                                           |
| `web/functions/api/issues.js`                   | 新增。浏览器入口，公开端点：按 IP 日限流 20 条、body ≤ 64KB、立即 202 由 `waitUntil` 处理；`ISSUE_DEBUG=1` 时同步回显结果                         |
| `web/functions/issue-probe.js`                  | 新增。自检探针，只显示配置与状态码，**从不回显 token**                                                                                            |
| `web/functions/api/explain.js`                  | 三处 LLM 失败（上游非 2xx / 返回空 / fetch 抛错）上报为 **recoverable**，只带状态码，**不带**上游响应体（`detail` 里可能夹带本次请求的 findings） |
| `web/lib/issue-bridge.ts`                       | 新增。`window.onerror` + `unhandledrejection` + `reportError()` / `reportManual()`；内存去抖 5 分钟；脱敏/截断/归一化引 `error-policy.js`         |
| `web/components/IssueBridgeMount.tsx`           | 新增。挂进 RootLayout，同步登录态                                                                                                                 |
| `web/app/global-error.tsx`                      | 新增。React 渲染崩溃兜底（此前完全没有）；内联样式、不依赖任何 Provider                                                                           |
| `web/hooks/useLogAnalyzer.ts`                   | Worker 加载失败与解析失败（`ParseError`）上报为 **fatal**                                                                                         |
| `web/components/LogReport.tsx`                  | 新增「反馈问题」入口（检查结论 tab 底部），只提交规则 id / 条数 / 固件版本 / 用户填的一段话                                                       |
| `web/.env.example`、`docs/operations/README.md` | 环境变量、KV key、自检步骤与排查条目                                                                                                              |

**一个容易踩的实现细节**：Pyodide 抛的 Python traceback 里，最关键的一行
（`NameError: name '__FACTS__' is not defined`）在**末尾**，单纯 `slice(0, 1000)`
会把证据丢掉。所以客户端与边缘侧用的是**同一个** `clip()`（保留头 60% + 尾 40%）。

**这三个文件的名字是有意这么起的**：连起来读是"谁采 → 谁收 → 谁建单"——
`lib/issue-bridge.ts`（浏览器）→ `api/issues.js`（边缘入口）→ `_lib/issue-filer.js`（边缘建单）。
端点原来叫 `/api/report-error`，与浏览器侧模块 `error-reporter.ts` 只差一个词序、又与 `/api/reports`
（飞行分析报告）同前缀反义，因此改掉。规则与理由见 `CLAUDE.md` §6.4「名字要能望文生义」，本功能是那条规则的由来。

### 6.2 为什么是两个模块：运行时分界，不是概念分界

`issue-bridge.ts`（浏览器）与 `issue-filer.js`（边缘）**不能合成一个文件**——
它们跑在两个运行时里：前者进 Next 的客户端 bundle，后者由 EdgeOne Pages Functions
单独打包（且 21 个文件全是 `.js`）。

但"两份文件"不等于"两份实现"。凡**两侧必须逐字一致**的东西已收敛到
`web/lib/error-policy.js` 一份：

| 共用（`lib/error-policy.js`）                                 | 各自独立                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 脱敏规则与顺序、`clip()`、`normalize()`、长度上限、级别白名单 | 浏览器侧：`sendBeacon`/`fetch` 传输、内存去抖窗口、payload 组装、全局钩子      |
| 同上                                                          | 边缘侧：token 与配置、sha256 指纹、KV 去重、评论节流、平台适配、issue 正文渲染 |

分界的判据是**错了会怎样**：

- `clip()` 两边不一致 → 客户端在证据到达边缘**之前**就把它丢了，**不可恢复**；
- `scrub()` 两边不一致 → 客户端会先把边缘想匹配的东西吃掉（JWT 被宽泛的长 hex
  规则咬掉一半），脱敏政策分叉。这类分叉**不会报错**，只会让"两边都脱敏了"变成错觉。

反过来，去抖窗口、限流、正文渲染这些**不影响对方正确性**的东西就不必共享。

这与 `engine` 侧那次 `__FACTS__` 事故是同一类问题：**两份实现，一条路径对、另一条错，
而本地校验只覆盖了其中一条**（Python 的 `str.replace` 换全部、JS 的只换第一处）。
所以这里配了两条机器守卫：

1. `web/scripts/test-issue-filer.mjs` §[9]——扫两侧源码，`（已截断` / `<jwt>` /
   `<email>` / `<home>` / `<ip>` / `0xH` 这些实现字面量只许出现在 `error-policy.js`；
   谁再抄一份实现进去就红；
2. 同一文件 §[2]——**结构性幂等**：任何一条脱敏规则的替换产物都不再被（含它自己的）
   任何规则匹配，于是"客户端先脱 + 边缘再脱"恒等于"只脱一次"，而不是只对某条样例成立。

### 6.1 Gitee API 的已知风险

Gitee 的 `POST /repos/{owner}/{repo}/issues` 有公开的踩坑记录
（gitee.com/oschina/git-osc/issues/IJZAPB）：同一个 token，GET 全部 200，
POST 创建 issue 却一律返回 `404 project or enterprise`——换仓库、换认证方式
（query / body / `Authorization: Bearer` / `Authorization: token`）结果相同。

那份报告是 2026-07 的，未必仍成立，但它说明**不能假设它能通**。因此实现满足三条：

1. **失败必须留痕**——响应状态码与响应体写进 KV（`errx_`），不静默；
2. **必须能自检**——`/issue-probe` 看清配置与读接口是否可达；`?write=1`（需 `ISSUE_DEBUG=1`）
   真发一次写入，因为**读通不等于写通**；
3. **必须能换**——`ISSUE_PROVIDER` 一行环境变量切到 `github`，两条代码路径都已写好。

若确认 Gitee 写接口不可用，回退顺序：换 GitHub 私有仓库（推荐）→ 或改成
「上报先写 KV，由本地定时任务拉取后建 issue」（多一个环节，但完全绕开 Gitee API）。

---

## 7. 还能再做的一步（未实现）

上报只覆盖了**边缘函数与浏览器**。真正的顶层兜底（边缘函数未捕获异常导致 500/545、
Next.js Node 侧 SSR 抛错）目前还靠平台日志，没进这条通道。要补的话，前者需要把
handler 主体包一层 try/catch，后者可以用 Next 的 `instrumentation.ts` 的 `onRequestError` 钩子。
