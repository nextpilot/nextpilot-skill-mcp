# 运维文档

本地开发、EdgeOne Pages 部署、环境变量、KV 绑定与故障排查。

## 1. 架构速览

```text
浏览器
  ├─ Next.js SSR（Node 运行时，ssr-node）
  │    /login                      登录页
  │    /api/auth/*                 next-auth v5：GitHub OAuth、邮箱验证码（Credentials）
  │    /api/auth/otp/request       生成验证码 + QQ SMTP 发信，经 AUTH_INTERNAL_SECRET 调内部边缘函数
  │
  └─ Edge Functions（V8 边缘运行时，web/functions/，可访问 KV）
       /api/me                     会话 + 本月配额
       /api/explain                JWT 验签 → 配额 → DeepSeek → 写 usage/report
       /api/reports、/api/reports/[id]   云端报告 CRUD（免费版保留 7 天，惰性过期）
       /internal/otp/set|consume   仅 Node 侧（x-internal-secret）调用
       /internal/users/upsert
      /api/issues           浏览器报错入口（公开，按 IP 日限流）→ 去重后提 issue
      /api/issue-probe            上报链路自检探针
      /api/ping、/api/kv-probe    兼容性探针（验证完可删）
```

> 根级探针（`/ping`、`/kv-probe`、`/issue-probe`、`/blob`）**已退役**：探针统一迁到
> `/api/` 前缀，根级写法治**直接 404**（`web/proxy.ts` 的 `RETIRED_ROOT_PATHS`），
> 不做重定向。**入口一律用 `/api/` 前缀**（如 `/api/kv-probe`）。之所以要在 middleware
> 里显式 404 而不是「删掉不管」，是因为交给 Next.js 兜底时这些路径会穿透到 `[locale]`
> 段、渲染出 **200 首页 HTML**，比 404 还难认。

- 会话：next-auth JWT 策略（JWE，A256CBC-HS512，密钥 HKDF(AUTH_SECRET, cookie名)）。边缘函数用 `jose` 以同一 `AUTH_SECRET` 验签（`functions/_lib/auth.js`）。
- KV：`NEXTPILOT_KV` 绑定，**只在边缘函数可用**。key 仅允许字母/数字/下划线，无 TTL（过期写进 value 惰性清理）。
- **平台坑（实测）**：`kv.list()` 在**没有任何匹配 key 时，返回体里没有 `keys` 字段**（`{"cursor":"","complete":true}`），直接 `for...of result.keys` 会抛错导致 545。统一走 `_lib/kv.js` 的 `listAll()`（已对 `keys ?? []` 加守卫），不要在业务里直接调 `kv.list`。

## 2. 本地开发

```bash
cd web
pnpm install
cp .env.example .env       # 填入本地开发密钥
pnpm dev                   # 页面 + Node 路由（/api/auth、发信）
```

需要联调 KV / 边缘函数时安装 EdgeOne CLI：

```bash
npm i -g edgeone
edgeone pages login
cd web
edgeone pages link        # 关联线上项目（拉取 KV 绑定与环境变量）
edgeone pages dev         # 本地同时跑 Next、functions、KV 模拟
```

## 3. 环境变量（EdgeOne 控制台 → 项目 → 环境变量）

见 `web/.env.example`。密钥生成：

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 24      # AUTH_INTERNAL_SECRET
```

| 变量                                            | 说明                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                   | 会话 JWE 密钥，Node 与边缘函数共享，改了全员掉线                                         |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`         | GitHub OAuth App                                                                         |
| `AUTH_INTERNAL_SECRET`                          | SSR ↔ `/functions/internal/*` 共享密钥                                                   |
| `SITE_URL`                                      | 公网源站，Node 侧同源调内部函数用，如 `https://skill.nextpilot.org`                      |
| `SMTP_*`                                        | QQ/163 SMTP，`SMTP_PASS` 填**邮箱授权码**（QQ 邮箱 → 设置 → 账户 → 开启 SMTP）           |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`           | 边缘函数 `/api/explain` 读取                                                             |
| `ISSUE_ENABLED`                                 | 置 `1` 才开启报错上报；不配则整个上报层 no-op（本地开发天然安全）                        |
| `ISSUE_PROVIDER` / `ISSUE_REPO` / `ISSUE_TOKEN` | 目标：`gitee`（默认）或 `github`；`owner/repo`；令牌**只在边缘函数使用**，浏览器永不接触 |
| `ISSUE_LABELS` / `ISSUE_DEBUG`                  | 可选。标签（逗号分隔）；`ISSUE_DEBUG=1` 时 `/api/issue-probe?write=1` 可做真实写入自检   |

### GitHub OAuth App

**创建步骤**（个人开发者即可，无需企业资质，免费）：

1. 打开 <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**（个人设置路径：右上头像 → Settings → 最下面 Developer settings）。
2. 填写：
   - **Application name**：`NextPilot Skill`（任意）
   - **Homepage URL**：`https://skill.nextpilot.org`
   - **Application description**：可留空
   - **Authorization callback URL**：`https://skill.nextpilot.org/api/auth/callback/github`
3. 点 **Register application**，进入应用详情页 → **Generate a new client secret**，复制 Client ID 和 Client secret。
4. 回到 EdgeOne 控制台 → 项目 → 环境变量，加两条：
   - `AUTH_GITHUB_ID` = Client ID
   - `AUTH_GITHUB_SECRET` = Client secret（只显示一次，丢了重新生成即可）
5. **重新部署**，登录页的 GitHub 按钮即可用（代码里只有配了这两个变量才会注册 provider，没配时按钮隐藏，不会 500）。

注意：

- 回调地址必须**精确到 `/api/auth/callback/github`**，域名写错（http/https、末尾斜杠）会报 `redirect_uri mismatch`。
- **本地调试另建一个 OAuth App**：`http://localhost:3000` / `http://localhost:3000/api/auth/callback/github`（端口按实际），写进本地 `web/.env`，不要和生产混用。
- 个人 OAuth App 默认每小时 5000 次授权请求，初期完全够用。
- 回调地址变更（如以后切备案域名/国内节点）回这里改，不用重新发版。

## 4. EdgeOne KV 开通与绑定

1. 控制台 → KV 存储 → 申请开通（申请理由写实际用途：登录资料/验证码/配额计数/报告元数据）。
2. 创建命名空间：`nextpilot_skill_mcp`（**已开通**）。
3. 绑定到 Pages 项目，**变量名 `NEXTPILOT_KV`**（绑定，不是环境变量）。绑定后需重新部署才生效。
4. 部署后访问 `GET /api/kv-probe` 验证：返回的 `kv.after` 每次 +1 即绑定成功。（根级 `/kv-probe` 已退役，直接 404。）

> 命名空间名称本身不影响代码（代码只认绑定变量名 `NEXTPILOT_KV`）；控制台里绑定变量名若被固定成别的名字，
> `getKv()` 会退化为「在 env 中查找具备 get/put/list 的对象」，仍能取到。

KV key 规则（代码见 `functions/_lib/kv.js`）：

| key                                   | 内容                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| `usr_{uid}`                           | 用户资料（对齐远期 profiles 表）                      |
| `em_{emailHash}` / `gh_{githubId}`    | 登录方式 → uid 索引                                   |
| `otp_` / `otprl_` / `otpd_` / `otpi_` | 验证码、60s 重发窗、每日限额                          |
| `use_{uid}_{yyyyMMDD}_{事件}`         | 每日配额唯一键（前缀列举计数，登录 10/天、匿名 3/天） |
| `anuse_{设备}_{yyyyMMDD}_{事件}`      | 匿名设备日计数（另有 `anip_{ip}_{日}` 防刷）          |
| `rpt_{uid}_{reportId}`                | 报告记录（7 天惰性过期，含 `logHash` 日志指纹）       |
| `err_{指纹}`                          | 上报去重：issue 号、累计次数、首末时间、上次评论时间  |
| `errx_{毫秒}_{随机}`                  | 上报失败记录（`/api/issue-probe` 展示最近 5 条）      |
| `errrl_{ipHash}_{日}_{事件}`          | `/api/issues` 的按 IP 日限流计数                      |

注意：最终一致（60s 全球同步），写后不要立即回读；配额计数容忍短暂不一致。

## 5. EdgeOne Pages 构建配置

- 项目根目录：`web/`
- 安装/构建：`pnpm install` / `pnpm build`
- 输出目录：`.next`（Next.js 全栈模式，非静态导出）
- 实测 Next.js 16.3.5 可直接部署（官方文档标称支持 13.5-15）

## 6. 故障排查

| 现象                    | 排查                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/explain` 返回 401 | 未登录或 `AUTH_SECRET` 两端不一致                                                                                                                                                                           |
| `/api/explain` 返回 503 | 边缘函数未配 `DEEPSEEK_API_KEY`                                                                                                                                                                             |
| 登录后仍 401            | 检查生产是否 HTTPS（cookie 名 `__Secure-` 前缀）；边缘函数与 SSR 的 `AUTH_SECRET` 是否一致                                                                                                                  |
| 验证码发不出            | `SMTP_*` 是否配置；QQ 授权码是否正确；Node 函数出网 465 是否可用                                                                                                                                            |
| `/internal/*` 403       | `AUTH_INTERNAL_SECRET` 未配或不一致                                                                                                                                                                         |
| KV 报 binding missing   | KV 命名空间（`nextpilot_skill_mcp`）未绑定到 Pages 项目；绑定后需重新部署                                                                                                                                   |
| 配额数不准              | KV 最终一致，60s 内可能滞后；唯一键设计保证不会重复计数                                                                                                                                                     |
| 报错没生成 issue        | 访问 `/api/issue-probe`，看 `enabled` / `repo` / `tokenSet` 与 `recentFailures`。**Gitee 的写接口与读接口表现可能不一致**（读 200、写 404 `project or enterprise`），所以必须用 `?write=1` 真发一次才能确认 |
| 报错 issue 刷屏         | 不应发生：同指纹只建一条、后续追加评论，可恢复类每天最多一条。若真刷屏，检查 `/api/issue-probe` 里 `recentFailures`——多半是建单成功但去重记录没写进 KV（KV 最终一致，60s 内可能出现一次重复）               |

## 7. 线上报错自动提 issue

完整设计与护栏见 `docs/architecture/error-reporting.md`，这里只留运维要点。

链路：浏览器（未捕获异常 / 未处理的 Promise / Worker 解析失败 / React 渲染崩溃）或边缘函数（LLM 调用失败）
→ `/api/issues` 或进程内直调 → **分级 → 指纹去重 → 白名单脱敏 → 硬限流** → Gitee issue。

三条必须记住的：

1. **token 只在边缘函数**。浏览器只 POST 到 `/api/issues`，拿不到 issue 写权限。
2. **上报失败不影响任何功能**。默认走 `waitUntil`，全量 try/catch，静默降级；失败原因写进 KV（`errx_`），用 `/api/issue-probe` 查。
3. **脱敏是白名单**。只上报错误类型、消息、栈、路由、版本与（人工反馈的）规则 id；**不含**日志内容、字段数值、文件名、邮箱、uid。Gitee 仓库是公开的，"原始日志不上传"这条卖点不能被上报通道破掉。

部署后自检顺序：

```text
GET  /api/issue-probe        确认 enabled=true、repo/tokenSet 正确、readRepo.ok=true
GET  /api/issue-probe?write=1 确认写入真的通（需要 ISSUE_DEBUG=1）——会建一个 [自动上报] SelfCheck issue
```

`write=1` 走正常上报路径，反复自检只会建**一个** issue（同指纹后续都是评论），验完手动关掉即可。

## 8. CI/CD（GitHub Actions）

两个 workflow，分工是「CI 只判质量，Deploy 只管发布」：

| 文件                           | 触发                                            | 做什么                                                                                                                        |
| ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | push 到 master / PR / 手动                      | 跑 `tools/ci/check_all.py --stage build,ci --with-e2e`（含 ruff、产物比对、`tsc --noEmit`、`next build`、E2E 冒烟、依赖审计） |
| `.github/workflows/deploy.yml` | CI 跑完且成功（`workflow_run`）/ 手动 / 同仓 PR | `edgeone pages deploy` 到 EdgeOne Pages，生产环境加 `/ping` 冒烟                                                              |

- **部署等 CI 绿了才发**：`workflow_run` 无法在 `on` 里过滤结果，判据写在 job 的 `if` 里（只认 `conclusion == 'success'`）。
- **回滚 / 补发**走 Actions 页面手动触发 `Deploy`，`env` 选 `production`。
- **同仓 PR 自动发预览环境**（`-e preview`）；fork 的 PR 拿不到 secret，已显式跳过而不是让它红。
- 环境变量（见第 3 节）**仍配在 EdgeOne 控制台**，不进仓库、不进 CI 日志。

需要配的仓库配置（Settings → Secrets and variables → Actions）：

| 类型     | 名称                | 说明                                                           |
| -------- | ------------------- | -------------------------------------------------------------- |
| Secret   | `EDGEONE_API_TOKEN` | EdgeOne 控制台 → API Token                                     |
| Variable | `EDGEONE_PROJECT`   | Pages 项目名。**填错会自动新建一个空项目**，首次跑前务必核对   |
| Variable | `SMOKE_BASE_URL`    | 可选。生产源站如 `https://skill.nextpilot.org`，不配则跳过冒烟 |

> ⚠ **仓库托管方**：当前 `origin` 是 Gitee（默认分支 `master`），而 Gitee **不执行 `.github/workflows/`**，
> 它有自己的流水线配置目录。要让上面两个文件真正跑起来，需要把仓库镜像/迁移到 GitHub，
> 或在 Gitee 侧另写一份等价配置（但那样就破了「校验命令只写一处」的约定，CI 与本地会分成两处维护）。
> 未迁移前，云端门禁实际处于**未生效**状态，质量仍只靠本机 `.githooks/pre-push` 拦。

改动校验清单时只改 `tools/ci/checklist.yml` 一处，两个 workflow 与本地 hook 都跟着变——命令不要在 workflow 里另抄一份。
