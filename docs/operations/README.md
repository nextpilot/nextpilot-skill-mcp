# 运维文档

本地开发、EdgeOne Pages 部署、环境变量、KV 绑定与故障排查。

## 1. 架构速览（冲刺 2）

```text
浏览器
  ├─ Next.js SSR（Node 运行时，ssr-node）
  │    /login                      登录页
  │    /api/auth/*                 next-auth v5：GitHub OAuth、邮箱验证码（Credentials）
  │    /api/auth/otp/request       生成验证码 + QQ SMTP 发信，经 INTERNAL_SECRET 调内部边缘函数
  │
  └─ Edge Functions（V8 边缘运行时，web/functions/，可访问 KV）
       /api/me                     会话 + 本月配额
       /api/explain                JWT 验签 → 配额 → DeepSeek → 写 usage/report
       /api/reports、/api/reports/[id]   云端报告 CRUD（免费版保留 7 天，惰性过期）
       /internal/otp/set|consume   仅 Node 侧（x-internal-secret）调用
       /internal/users/upsert
       /ping、/kv-probe            阶段 0 兼容性探针（验证完可删）
```

- 会话：next-auth JWT 策略（JWE，A256CBC-HS512，密钥 HKDF(AUTH_SECRET, cookie名)）。边缘函数用 `jose` 以同一 `AUTH_SECRET` 验签（`functions/_lib/auth.js`）。
- KV：`NEXTPILOT_KV` 绑定，**只在边缘函数可用**。key 仅允许字母/数字/下划线，无 TTL（过期写进 value 惰性清理）。

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
openssl rand -hex 24      # INTERNAL_SECRET
```

| 变量 | 说明 |
| --- | --- |
| `AUTH_SECRET` | 会话 JWE 密钥，Node 与边缘函数共享，改了全员掉线 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth App |
| `INTERNAL_SECRET` | SSR ↔ `/functions/internal/*` 共享密钥 |
| `APP_URL` | 公网源站，Node 侧同源调内部函数用，如 `https://skill.nextpilot.org` |
| `SMTP_*` | QQ/163 SMTP，`SMTP_PASS` 填**邮箱授权码**（QQ 邮箱 → 设置 → 账户 → 开启 SMTP） |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | 边缘函数 `/api/explain` 读取 |

### GitHub OAuth App

github.com → Settings → Developer settings → OAuth Apps → New OAuth App：

- Callback URL：`https://skill.nextpilot.org/api/auth/callback/github`
- 本地调试另建一个：`http://localhost:端口/api/auth/callback/github`

## 4. EdgeOne KV 开通与绑定

1. 控制台 → KV 存储 → 申请开通（申请理由写实际用途：登录资料/验证码/配额计数/报告元数据）。
2. 创建命名空间：`nextpilot_main`。
3. 绑定到 Pages 项目，**变量名 `NEXTPILOT_KV`**（绑定，不是环境变量）。

KV key 规则（代码见 `functions/_lib/kv.js`）：

| key | 内容 |
| --- | --- |
| `usr_{uid}` | 用户资料（对齐远期 profiles 表） |
| `em_{emailHash}` / `gh_{githubId}` | 登录方式 → uid 索引 |
| `otp_` / `otprl_` / `otpd_` / `otpi_` | 验证码、60s 重发窗、每日限额 |
| `use_{uid}_{yyyyMM}_{reportId}` | 月度配额唯一键（前缀列举计数，免费 5/月） |
| `rpt_{uid}_{reportId}` | 报告记录（7 天惰性过期） |

注意：最终一致（60s 全球同步），写后不要立即回读；配额计数容忍短暂不一致。

## 5. EdgeOne Pages 构建配置

- 项目根目录：`web/`
- 安装/构建：`pnpm install` / `pnpm build`
- 输出目录：`.next`（Next.js 全栈模式，非静态导出）
- 实测 Next.js 16.3.5 可直接部署（官方文档标称支持 13.5-15）

## 6. 故障排查

| 现象 | 排查 |
| --- | --- |
| `/api/explain` 返回 401 | 未登录或 `AUTH_SECRET` 两端不一致 |
| `/api/explain` 返回 503 | 边缘函数未配 `DEEPSEEK_API_KEY` |
| 登录后仍 401 | 检查生产是否 HTTPS（cookie 名 `__Secure-` 前缀）；边缘函数与 SSR 的 `AUTH_SECRET` 是否一致 |
| 验证码发不出 | `SMTP_*` 是否配置；QQ 授权码是否正确；Node 函数出网 465 是否可用 |
| `/internal/*` 403 | `INTERNAL_SECRET` 未配或不一致 |
| KV 报 binding missing | 命名空间绑定变量名必须是 `NEXTPILOT_KV`，绑定后需重新部署 |
| 配额数不准 | KV 最终一致，60s 内可能滞后；唯一键设计保证不会重复计数 |
