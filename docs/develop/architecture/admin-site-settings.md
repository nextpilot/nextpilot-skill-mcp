# 后台站点设置系统 `/admin/settings`

> 状态：**五步全部完成**（2026-09-27）。本文只记当前的机制与口径，实施过程与实测记录不在本文。
> 守卫清单见 [`../testing/guards.md`](../testing/guards.md)。

## 0. 需求（这就是全部）

1. 有一个网页后台，登录后能改站点设置，不用改代码、不用重新构建。
2. 能改的：站点标题、描述、域名、页脚文案这类站点信息；DeepSeek、SMTP、Gitee 令牌这类运行中服务要用的 key。
3. 改完尽快生效，且出错能倒查。

不由这三条派生出来的不做：角色管理、多管理员协作、设置版本历史、国际化文案管理。

## 1. 命名口径

后台对外和对内的名字同源，不许一半 settings 一半 config：

| 层面           | 名字                           |
| -------------- | ------------------------------ |
| 后台页面       | `/admin/settings`              |
| 读写接口       | `functions/api/admin/settings` |
| Node 侧中转    | `/internal/settings/get`       |
| KV 主键        | `settings_site`（一个 JSON）   |
| 审计日志       | `settings_log_<时间戳>`        |
| 运行期读取模块 | `web/lib/site-settings.ts`     |

`web/lib/site-config.ts` 保留原名：它是构建期静态默认值（环境变量 + 代码兜底），角色是改不动的地板，不是运行期可变量。

## 2. 数据流与取值优先级

```text
浏览器表单 ──POST /api/admin/settings──▶ 边缘函数
                                          ├ 解会话 cookie → 邮箱比对 AUTH_ADMIN_EMAILS → 非白名单 404
                                          ├ 校验（域名/URL 格式，缺啥报啥）
                                          └ 写 KV settings_site + 追加 settings_log_<ts>

RSC ──getSiteSettings()──▶ Node 侧 60s 缓存
                             └ 未命中 ──fetch /internal/settings/get（带内部密钥）──▶ 边缘读 KV
                                                                                       └ 缺项回落 site-config.ts
```

取值优先级：**后台设置 > 环境变量 > 代码字面量**。三层由同一张字段定义表的 `fallback` 串起来，不在消费点写 if-else。

几条必须知道的口径：

- 清空一项 = 删掉 KV 里这个 key，回落到第 2/3 层，不是存空字符串。可选字段（如备案号）允许空值，字段定义标 `optional: true`。
- 表单只提交改动过的字段。全量提交会把当前默认值固化进 KV，之后改 `site-config.ts` 的代码默认值就再也不生效。
- 保存用 POST 不是 PUT：本地 `edge-dev` 垫片只把 GET/POST/DELETE 映射到 `onRequest*`，PUT 会落到 `onRequest` 兜底而静默走不通。
- `NEXT_PUBLIC_*` 在 Next 构建时被替换成字面量写进 bundle，运行期改控制台环境变量对已构建产物无效（`NEXT_PUBLIC_SITE_URL` 也在此列，改完要重新构建）。
- KV 里出现表里没有的 key，原样保留不丢数据、表单不显示，回滚到旧代码也不丢。

## 3. 字段定义表驱动

加一项配置 = 表里加一行，表单、校验、类型、审计自动跟上。

```ts
export const SITE_SETTINGS_FIELDS = [
  { key: "siteName", label: "网站标题（全称）", kind: "text", fallback: SITE_NAME },
  { key: "siteUrl", label: "网站域名", kind: "domain", fallback: NEXT_PUBLIC_SITE_URL, confirm: true },
  { key: "sourceUrl", label: "源代码链接", kind: "url", fallback: REPO_URL },
  { key: "icp", label: "备案号", kind: "text", fallback: "", optional: true },
] as const;
```

`kind` 决定校验与输入框形态（`text` / `domain` / `url` / `textarea` / `secret`）；`confirm: true` 表示保存需二次确认（域名这种改了影响搜索收录的）。

## 4. 能改什么

站点信息 8 项：网站标题、网站短名、网站描述、网站域名（落在 `site-config.ts`），页脚版权行、页脚品牌介绍、源代码链接、备案号（落在 `SiteFooter.tsx`）。

密钥 3 项：DeepSeek API Key、SMTP 密码、Gitee 令牌。

密钥的地板是环境变量而不是代码，硬编码密钥是安全事故，所以 `fallback` 只能是空串，消费方一律写 `设置值 || process.env.X`。

后台展示规则：只显示尾 4 位；替换 = 写入新值立即生效；清除 = 删掉 KV 覆盖、回落到环境变量。完整值永不回显。

## 5. 谁能进后台

环境变量 `AUTH_ADMIN_EMAILS`（逗号分隔邮箱清单）。`web/auth.ts` 的 jwt 回调比对邮箱后写入 `token.isAdmin`，边缘侧用 `functions/_lib/auth.js` 做同样判定。

非白名单访问 `/admin/settings` 与接口一律 404，不回 403：403 等于告诉对方入口存在、只是你进不去。

每次保存追加一条 `settings_log_`（谁、何时、改了哪个字段）。密钥在审计里一律写 `***`。

## 6. 故意不给改的（安全边界）

| 密钥                  | 为什么不进后台                                                                     |
| --------------------- | ---------------------------------------------------------------------------------- |
| `AUTH_SESSION_SECRET` | 改了所有登录会话立即失效（全员掉线），且边缘函数与 Node 必须一致（运维文档已警示） |
| `AUTH_EDGE_SECRET`    | 改了 Node↔Edge 内部通道锁死，后台自己也调不通 KV                                   |
| GitHub OAuth 密钥     | 改了登录坏，且极少轮换                                                             |
| `EDGEONE_API_TOKEN`   | 部署通道密钥，在 GitHub Secrets 层，与站点运行时无关                               |

这些留在 EdgeOne 控制台环境变量。改它们等于换锁芯，必须在控制台走变更。

## 7. 已知限制

1. 静态烙印：构建期静态化页面的页头页脚是烙在 HTML 里的，改设置后那些页面不会热变，PWA manifest 的应用名同理。占比高再二选一（关键页面强制动态渲染 / 页头页脚客户端刷新），拿实测数据定，不预做。
2. 60 秒生效：边缘侧保存无法主动清 Node 侧模块缓存，靠自然过期。要立即生效得加版本号轮询。
3. 守卫没覆盖的一处：`SiteHeader.tsx` 里那条仓库地址仍是写死的，守卫也没把它列进判据，避免一上来就红。
