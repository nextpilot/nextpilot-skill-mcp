# Web 应用：站点与端侧分析

**这一份讲 web 这块是怎么组织与实现的。** 代码在 `web/`（独立的 Next.js 项目，
部署时只上传它自己这一个目录）。

---

## 一、技术栈与部署形态

| 项     | 选型                                                   |
| ------ | ------------------------------------------------------ |
| 框架   | Next.js 16（App Router，全栈模式，非静态导出）         |
| 运行时 | **双层**：Node（SSR）+ V8 边缘函数（`web/functions/`） |
| 部署   | EdgeOne Pages（构建目录 `web/`，输出 `.next`）         |
| 样式   | Tailwind CSS                                           |
| 国际化 | next-intl（`web/messages/`，中英双语）                 |
| 搜索   | Fuse.js（客户端，Skill 关键词搜索）                    |

**不是纯静态站**：有登录、有 KV、有边缘函数。所以"部署"是真构建 + 真运行时。

---

## 二、双层运行时：Node 与边缘

这是本项目最需要先理解的一点——**两种运行时能力不同，代码必须各放各的位置**。

```text
浏览器
  ├─ Next.js SSR（Node 运行时，ssr-node）
  │    /login                      登录页
  │    /api/auth/*                 next-auth v5：GitHub OAuth、邮箱验证码
  │    /api/auth/otp/request       生成验证码 + QQ SMTP 发信
  │
  └─ Edge Functions（V8 边缘运行时，web/functions/，可访问 KV）
       /api/me                     会话 + 本月配额
       /api/explain                JWT 验签 → 配额 → DeepSeek → 写 usage/report
       /api/reports、/api/reports/[id]   云端报告 CRUD
       /api/issues                 浏览器报错入口（公开，按 IP 日限流）
       /internal/otp/set|consume   仅 Node 侧（x-internal-secret）调用
       /internal/users/upsert
       /internal/settings/*        后台站点设置读写
```

**为什么分两层**：

- **Node 侧**能做 SSR、能发 SMTP（465 端口出网）、能持有只在服务端用的密钥。
- **边缘函数**离用户近、能访问 KV，但**不能发邮件、不能跑 Node 原生模块**。

**跨层的门**：SSR 调边缘函数走 `/internal/*`，带 `x-internal-secret`（`AUTH_EDGE_SECRET`）。
不带密钥一律 403（也防 KV 键位枚举）。

---

## 三、路由

页面路由（`web/app/[locale]/`，next-intl 本地化）：

| 路由      | 是什么                                      |
| --------- | ------------------------------------------- |
| `/`       | 首页：产品介绍 + 入口                       |
| `/log`    | **日志分析**（核心功能，端侧 Pyodide 解析） |
| `/skills` | Skill Hub：列表 / 详情 / 搜索               |
| `/mcp`    | 平台 MCP 服务介绍                           |
| `/guide`  | 使用指南（MDX，见 §五）                     |
| `/login`  | 登录                                        |
| `/me`     | 个人中心：配额、历史报告                    |
| `/issue`  | 问题反馈                                    |

非路由文件：`/feed.xml`（RSS）、`/security.txt` 与 `/.well-known/security.txt`
（安全披露策略，都是 `route.ts` 动态生成）。

> **入口一律用 `/api/` 前缀**。根级探针（`/ping`、`/kv-probe`）已退役——
> 非 `/api`、非页面的根级路径由 next-intl 统一判 404。

---

## 四、端侧分析：日志不出浏览器

这是产品的核心卖点，也是架构上最特殊的一块：

```text
用户选 .ulg
   ↓
Web Worker
   ├─ 加载 Pyodide（WASM）
   ├─ 注入分析引擎（analysis-engine.generated.ts 里的 PY_ULG_ENGINE）
   ├─ 读文件字节 → provider 解析 → 规则判定
   └─ 回传结构化报告（facts / metrics / findings）
   ↓
主线程渲染报告页（结论卡 + 图表 + 关键数据）
```

**关键性质**：

- **原始日志字节从不离开浏览器**。上传接口不存在，没有可上传的端点。
- 引擎是**同一份 Python 源码**同时跑在浏览器（Pyodide）与本地工具里，不会漂移。
- Worker 池（`web/lib/worker-pool.ts`）管理并发，避免大日志卡死主线程。
- 首次分析要下 Pyodide WASM + numpy + pyulog，**约 7 分钟**（之后有缓存）。

> 引擎本身的设计见 [`engine.md`](engine.md)；`LLM 解释`用的是**脱敏后的结构化结论**，
> 不是原始数据。

---

## 五、内容管线：站点内容即真源

**给用户看的文案不用同步、不用构建期拷贝**——真源直接放在 `web/content/`，运行期读盘：

| 内容       | 位置                         | 形态                                     |
| ---------- | ---------------------------- | ---------------------------------------- |
| 使用指南   | `web/content/guide/`         | MDX（可编译校验）                        |
| Skill 卡片 | `web/content/skills/<slug>/` | `SKILL.md`（给 AI）+ `README.md`（给人） |
| MCP 服务   | `web/content/mcp/<slug>/`    | `server.json`                            |

`web/lib/content-dir.ts` 运行期直接读盘（dev 下改完刷新即见）。
以前那套 `sync-content` 构建期拷贝已随真源唯一化退役。

> **判断内容该放哪**：这段话用户会不会在 `/guide` 上看到？会 → `web/content/`；
> 不会 → `docs/develop/`。

---

## 六、认证与配额

- **会话**：next-auth v5 JWT 策略（JWE，A256CBC-HS512，密钥 HKDF(AUTH_SESSION_SECRET, cookie名)）。
  边缘函数用 `jose` 以同一 `AUTH_SESSION_SECRET` 验签，**不需要查库**。
- **登录方式**：GitHub OAuth + 邮箱验证码（Credentials）两种。
- **配额**：KV 计数，登录用户 10/天、匿名 3/天。密钥形状见
  [`../operations/README.md`](../operations/README.md) §4。

---

## 七、错误上报

浏览器崩溃 / Worker 解析失败 / React 渲染崩溃 → 脱敏 → 去重 → 提 issue。

**三条必须记住的**：

1. **token 只在边缘函数**，浏览器拿不到写权限。
2. **上报失败不影响任何功能**，静默降级。
3. **脱敏是白名单**：只上报错误类型、消息、栈、路由、版本；**不含**日志内容、
   字段数值、文件名、邮箱。

完整机制与四道护栏见 [`error-reporting.md`](error-reporting.md)。

---

## 八、后台与站点设置

`/admin/settings` 允许白名单邮箱登录后改站点信息（域名、备案号、SEO 等），
不用改代码、不用重新构建。取值优先级：**后台设置 > 环境变量 > 代码字面量**。

完整机制见 [`admin-site-settings.md`](admin-site-settings.md)。

---

## 九、本地开发

见 [`../quickstart/README.md`](../quickstart/README.md)。
需要联调 KV / 边缘函数时才装 EdgeOne CLI（`edgeone pages dev`）。
