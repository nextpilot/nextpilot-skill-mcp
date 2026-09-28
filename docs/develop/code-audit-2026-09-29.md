# 代码审计报告（2026-09-29）

- **范围**：全仓 183 个 TS/TSX/Py 文件，按四区并行审查：① 页面与组件层（web/app、components、hooks）② API 路由与安全（app/api、functions、auth、proxy、lib）③ Python 侧（server、knowledge/engine、tools）④ 运行时链路与工程化（workers、sw.js、e2e、hooks、构建配置）。
- **方法**：分区交叉审查 + 高危结论逐条人工核实（下文标 ✅ 的均已对照源码确认）。
- **基线**：CI 23 项检查正常，本次只列 CI 抓不到的真问题。

---

## 一、高危（6 条）

### H1. 分析失败后 Worker 数据错配 —— 可把 B 日志的数据当 A 日志返回 ✅

`web/workers/analysis-worker.ts:437-471`
analyze 半途失败（`exec(_engine_code)` 与 `open_log` 已执行、`np_manifest/np_report` 抛错）后，`catch` 只发 error 消息，**不清 `provider`**；`loadedLogId` 仍是旧日志 A（代码注释 469 行写明只在成功后赋值）。之后用户查看 A 的曲线：`logNotLoadedReason` 校验 `loadedLogId === A` 通过，但 Pyodide 全局里装的是 B 的 provider —— **B 的数据顶着 A 的名字返回**。对日志分析站点是"给出错误结论"级别的缺陷。
**修法**：catch 分支清空 `provider` / `loadedLogId`（或 analyze 开始时先清）。

### H2. Pyodide 初始化失败被永久缓存，刷新页面前无法恢复 ✅

`web/workers/analysis-worker.ts:214`（getPyodide）
`pyodidePromise = (async () => …)()` 整体赋值；自托管 + CDN 都失败的瞬时网络抖动会让该 promise 永久 rejected，共享 Worker 后续所有消息复用同一 rejection。
**修法**：失败时置 `pyodidePromise = null` 允许重试。

### H3. MCP list_events 时间窗过滤遇 None 直接 TypeError ✅

`server/nextpilot_mcp/server.py:156,158`
`e["tSec"] >= start_s` 无 None 防护；APM 的 MSG/ERR 行 TimeUS 缺失时 provider 明确给 `tSec=None`（ardupilot.py:560,572），而模型 `tSec: float` 非可选——带时间窗查询先 TypeError，不过滤则 pydantic 校验炸。
**修法**：过滤前跳过 `tSec is None`，模型允许 `float | None`。

### H4. MCP query_timeseries 把引擎的人话错误变成内部崩溃 ✅

`server/nextpilot_mcp/server.py:197-201`
`np_series` 在 topic/字段不存在等常见失败下返回 `{"error": …}`（engine.py 共 9 处，已核实），server 直接 `r["t"]` → KeyError。AI 客户端传错字段名是必经路径。
**修法**：先判 `r.get("error")`，转成带原因的 ValueError。

### H5. 引擎把"规则规格写错"吞成"规则适用" ✅

`knowledge/engine/engine.py:748-754`
`except Exception: _not_applicable = None` —— match_version/match_vehicle 抛的 ValueError（api.py:307 要求规则作者笔误必须报错）被吞成"不跳过"，错误规则在所有日志上照跑，误报且无任何提示。
**修法**：except 里记 skipped("conditions 解析失败") 并 continue。

### H6.（平台级，待确认）`/api/me` 等按 Cookie 返回的 GET 可能被 CDN 缓存串号

`web/next.config.ts:111-136`（文件内注释自认）+ `functions/api/me.js` 等
应用层 no-store 被 opennext 忽略，EdgeOne 默认缓存 GET 约 5 分钟且缓存键忽略 query；`/api/me`、`/api/reports/detail`、`/api/comments` 均为 GET 且按 Cookie 返回个人信息 → 预热投毒可致他人命中你的缓存。
**修法**：EdgeOne 控制台对 `/api/*`、`/internal/*` 配强制不缓存（代码层无法根治）。

---

## 二、中危（14 条）

| #   | 位置                                                                       | 问题                                                                                                                          | 修法                                                   |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| M1  | `web/app/[locale]/login/page.tsx:24` ✅                                    | `startsWith("/")` 挡不住 `//evil.com`（协议相对 URL），登录回跳可跳外站                                                       | 加 `!callbackUrl.startsWith("//")` 或 URL 解析校验同源 |
| M2  | `web/components/EntryComments.tsx:131`                                     | 登录回跳写死 `/skills/${slug}`，组件被 mcp 页复用后回错页面                                                                   | callbackUrl 按 kind 选 `/skills/` 或 `/mcp/`           |
| M3  | `web/components/LogCharts.tsx:503`（另 ProbeClient:132、EditorClient:148） | Plotly 卸载不 purge，`responsive:true` 挂 resize 监听持图数据，反复挂载持续泄漏                                               | cleanup 调 `Plotly.purge`                              |
| M4  | `web/components/LogCharts.tsx:267`                                         | 全屏态"复位缩放"操作的是被盖住的内联图，点了没效果                                                                            | 全屏图独立 relayout                                    |
| M5  | `web/hooks/useLogAnalyzer.ts:714`                                          | 卸载清 pendingRef 但不结算，在途 series/track 请求 await 永久挂死                                                             | 清理时 resolve 成 error 哨兵                           |
| M6  | `web/functions/api/kv-probe.js:16,38,49`                                   | 探针无鉴权 + `?prefix=` 可控，可枚举 `em_<sha256(邮箱)>` 探测任意邮箱是否注册、探测在途 OTP 键                                | 加 assertInternal 或 prefix 白名单                     |
| M7  | `web/functions/api/issue-probe.js:11-52`                                   | 无鉴权暴露 issue 管道配置（repo、tokenSet、labels），且每次访问真实外呼 Gitee/GitHub（可被刷）                                | 同上加鉴权                                             |
| M8  | `web/functions/_lib/kv.js:91-95`、`otp/request:29`                         | clientIp 信任 `x-forwarded-for`/`x-real-ip`，可伪造绕过 IP 限流（待确认平台是否覆盖该头）                                     | 取平台注入头并 strip 客户端头                          |
| M9  | `web/functions/api/rating.js:48-67`、`favorite.js:43-66`                   | 匿名身份自报 deviceId 且无 IP 日上限，轮换即可刷评分/收藏数                                                                   | 补 IP 日上限或登录计数                                 |
| M10 | `tools/dev/fetch_pyodide_assets.py:149-204`                                | 核心资产（wasm/stdlib/lock）落盘零校验；pyulog 恒取 PyPI 最新，与代码锁死的 1.2.4 文件名脱节 → 升级后自托管 404 静默回退 PyPI | 核心文件按 lock/manifest 校验 sha256；版本选取规则固定 |
| M11 | `eslint.config.mjs:15-16` ✅                                               | `**/*.ts`、`**/*.tsx` 全局忽略 → TS lint 全链路 no-op，react-hooks/next 规则从未跑过 TSX                                      | 收窄忽略到生成目录，TSX 交给 eslint                    |
| M12 | `.githooks/pre-commit:96-97`                                               | 格式化后整文件 `git add`，`git add -p` 部分暂存时未暂存改动被带进提交                                                         | 临时 index 只暂存格式化产物                            |
| M13 | `web/workers/analysis-worker.ts:321-328`                                   | 消息无串行化：analyze 进行中插队的 series/track 与其共享 `__result` 全局，可取错数据                                          | worker 内消息队列或 per-request 结果通道               |
| M14 | `tools/engine/check_engine_purity.py:72-88`                                | FORBIDDEN 只守 JS/浏览器全局，不守 `open()`/`requests`/`socket` 等文件与网络 IO——引擎要进 WASM，这才是核心目标                | FORBIDDEN 增加 IO/网络模式                             |

## 三、低危 / 加固项（摘要）

- **同款 env 坑复发**：`web/lib/mailer.ts:26` `Number(env ?? 465)` 空字符串 → 端口 0，与之前修过的 `??` 坑同款，改 `|| 465`。
- MCP 一致性：`server.py` get_rule 只扫 px4 族目录（apm-* 规则查不到）、`tag` 恒 None；provider REQUIRED 漏 `armed_intervals`/`get_mode_present`（新 provider 会运行期才炸）；`check_rules_fields.py:73` 裸版本默认 `==` 与引擎 `>=` 不一致。
- 引擎边界：format_map 无 try 保护（占位符缺失炸 np_report）；ardupilot STAT 首行即 Armed 丢第一段；px4 事件 `except: return None` 吞自身 bug；`x_vals[i]` 长度未校验；`spec` 为裸字符串时按字符迭代。
- 工程化：`_venv_python.py:65` 返回 127 实为硬卡提交（与"警告放行"意图相反）；playwright e2e 只跑 dev 模式（prod 差异抓不到）+ 7 处 `waitForTimeout` 假稳定；`turboIgnore` 应为 `turbopackIgnore`；`pnpm-workspace.yaml` `allowBuilds` 疑非标准键（待确认）；explain 502 回显上游错误体；admin settings masked 值误提交会覆盖真密钥；Gitee token 放 URL 查询串；`/edge-dev/*` 生产可达（有 assertInternal 兜底）；trustHost: true 待确认。
- UI 细节：LogEntryClient 本机/云端 id 归一化不一致（同报告两行）；ReportHistoryList 删除确认态用裸 id（同 hash 两行联动）；EditorClient useMemo 内 setState；AdminSettingsForm 只确认第一个 risky 字段；LoginForm 硬编码"每日 10 次"与配额可配置的口径冲突。

## 四、扫过确认没有问题的面

- `/analyze → /log` 重命名收尾干净：无残留引用（href/组件/i18n/e2e 全查过）。
- XSS：两处 dangerouslySetInnerHTML 均为静态 JSON-LD；AI 解读走 ReactMarkdown 无 rehype-raw。
- `[[...path]]` 通配路由是纯 404，无代理转发面；download 路由 slug 双重校验无路径穿越。
- OTP：哈希落库、5 次锁定、每邮箱 10 次/天；cookie 走 NextAuth 默认（httpOnly/secure/Lax）。
- 未见硬编码密钥与过宽 CORS；`engine/` 目录迁移无残留。

## 五、建议修复顺序

1. **当天可修**：H1、H2、H4（各 1-3 行）；M1、M6/M7（探针加鉴权）、mailer `||`。
2. **本周**：H3、H5、M3/M5、M10、M11（收窄 eslint 忽略后补跑一轮 TS lint 看存量问题）、H6 去平台控制台配缓存策略。
3. **排期**：其余中危与加固项。
