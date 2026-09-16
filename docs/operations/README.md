# 运维文档

本地开发、EdgeOne Pages 部署、环境变量、KV 绑定与故障排查。

## 1. 架构速览（冲刺 2）

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
       /ping、/kv-probe            阶段 0 兼容性探针（验证完可删）
```

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

| 变量 | 说明 |
| --- | --- |
| `AUTH_SECRET` | 会话 JWE 密钥，Node 与边缘函数共享，改了全员掉线 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth App |
| `AUTH_INTERNAL_SECRET` | SSR ↔ `/functions/internal/*` 共享密钥 |
| `SITE_URL` | 公网源站，Node 侧同源调内部函数用，如 `https://skill.nextpilot.org` |
| `SMTP_*` | QQ/163 SMTP，`SMTP_PASS` 填**邮箱授权码**（QQ 邮箱 → 设置 → 账户 → 开启 SMTP） |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | 边缘函数 `/api/explain` 读取 |

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
4. 部署后访问 `GET /kv-probe` 验证：返回的 `kv.after` 每次 +1 即绑定成功。

> 命名空间名称本身不影响代码（代码只认绑定变量名 `NEXTPILOT_KV`）；控制台里绑定变量名若被固定成别的名字，
> `getKv()` 会退化为「在 env 中查找具备 get/put/list 的对象」，仍能取到。

KV key 规则（代码见 `functions/_lib/kv.js`）：

| key | 内容 |
| --- | --- |
| `usr_{uid}` | 用户资料（对齐远期 profiles 表） |
| `em_{emailHash}` / `gh_{githubId}` | 登录方式 → uid 索引 |
| `otp_` / `otprl_` / `otpd_` / `otpi_` | 验证码、60s 重发窗、每日限额 |
| `use_{uid}_{yyyyMMDD}_{事件}` | 每日配额唯一键（前缀列举计数，登录 10/天、匿名 3/天） |
| `anuse_{设备}_{yyyyMMDD}_{事件}` | 匿名设备日计数（另有 `anip_{ip}_{日}` 防刷） |
| `rpt_{uid}_{reportId}` | 报告记录（7 天惰性过期，含 `logHash` 日志指纹） |

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
| `/internal/*` 403 | `AUTH_INTERNAL_SECRET` 未配或不一致 |
| KV 报 binding missing | KV 命名空间（`nextpilot_skill_mcp`）未绑定到 Pages 项目；绑定后需重新部署 |
| 配额数不准 | KV 最终一致，60s 内可能滞后；唯一键设计保证不会重复计数 |
