# 后台站点设置系统 `/admin/settings`（v2，执行中）

> 状态：**已拍板，第 1–3 步执行中**（第 4–5 步缓做）。
> 提出：2026-09-26，用户原话"能否增加一个后台配置网站，标题，域名，各种 key 等"。
> 本版更新：2026-09-27，吸收三项拍板 + 命名改 settings + 当天代码现状复核。
> v1（2026-09-26 版）与当前代码的差异集中在第 7 节，别照 v1 的说法去找代码。
>
> ⚠️ **2026-09-28 重大反转（读本文前先看这段）**：实测发现「站点信息走运行期 KV」
> 这个设计的代价是**首页 TTFB ~1.5s**——根 layout 一旦导出 `generateMetadata` 读 KV，
> Next.js 把整棵路由树判为动态渲染，CDN 零缓存。已改为：
>
> - **站点信息 8 项**（标题/短名/描述/域名/页脚四项）→ 退回 `web/lib/site-config.ts`
>   构建期常量，改完**重新部署**生效，不再由 `/admin/settings` 即时改。
> - **密钥 3 项**（SMTP 等）→ 仍走运行期 KV。它们只在**请求期** API 路由里用
>   （`lib/mailer.ts` 读 SMTP 授权码），不参与静态化判定，保留「改完即生效」的价值。
> - 守卫从 6 条扩到 9 条（见「步骤 5」），三条新增的守的是**静态化**。
>
> 因此本文中「站点信息可后台即时改」的段落均为**历史设计**，实现已按上述口径调整。
> 静态化的完整说明见 CLAUDE.md **6.2.4**。

---

## 0. 需求（这就是全部）

1. **有一个网页后台**，登录后能改站点设置，不用改代码、不用重新构建。
2. **能改的**：站点标题、描述、域名、页脚文案这类站点信息；DeepSeek、SMTP、
   Gitee 令牌这类运行中服务要用的 key。
3. **改完尽快生效**，且出错能倒查、能回退。

后面所有内容都是为了实现这三条。**不由这三条派生出来的，一律不做**
（角色管理、多管理员协作、设置版本历史、国际化文案管理——都不是这次的事）。

---

## 1. 命名口径（全线 settings，不叫 config）

后台对外和对内的名字必须同源，不许一半 settings 一半 config：

| 层面           | 名字                           |
| -------------- | ------------------------------ |
| 后台页面       | `/admin/settings`              |
| 读写接口       | `functions/api/admin/settings` |
| Node 侧中转    | `/internal/settings/get`       |
| KV 主键        | `settings_site`（一个 JSON）   |
| 审计日志       | `settings_log_<时间戳>`        |
| 运行期读取模块 | `web/lib/site-settings.ts`     |

`web/lib/site-config.ts` **保留原名**：它现在是构建期静态默认值（环境变量 + 代码兜底），
角色是"改不动的地板"，不是运行期可变量——名字就该和它的职责一致。
新加的运行期层才叫 settings。

---

## 2. 做完之后是什么样

1. 用 GitHub 或邮箱登录网站后，访问 `/admin/settings`，进入设置页面。
2. 页面是一张表单，本轮只有**站点信息**一块（服务密钥那块在第 4 步）。
3. 改完点保存，**最迟 60 秒后全站生效**——不改代码、不重建、不重新部署。
4. 白名单外的邮箱访问 `/admin/settings` 一律 404（不提示"你没权限"，不暴露入口存在）。

---

## 3. 数据流、取值优先级与扩展预留

```
浏览器表单 ──PUT /api/admin/settings──▶ 边缘函数
                                          ├ 解会话 cookie → 邮箱比对 ADMIN_EMAILS → 非白名单 404
                                          ├ 校验（域名/URL 格式，缺啥报啥）
                                          └ 写 KV settings_site + 追加 settings_log_<ts>

RSC / generateMetadata ──getSiteSettings()──▶ Node 侧 60s 缓存
                                                  └ 未命中 ──fetch /internal/settings/get（带内部密钥）──▶ 边缘读 KV
                                                                                                            └ 缺项回落 site-config.ts
```

要点：

- **真源**：EdgeOne KV，复用现有封装 `web/functions/_lib/kv.js`，不加新依赖。
- **缓存**：60 秒模块级缓存。保存后各页面最迟 1 分钟用上新值；不每次实时读，
  是为了不给每个页面请求加一次 KV 查询。
- **兜底**：KV 缺项时回落到代码里的现有字面量——设置丢了网站照常起来，不会白屏。

### 取值优先级：后台设置 > 环境变量 > 代码字面量

| 层     | 来源                                    | 谁能改         | 生效方式                                                  |
| ------ | --------------------------------------- | -------------- | --------------------------------------------------------- |
| 1 最高 | KV `settings_site`（`/admin/settings`） | 白名单管理员   | 最迟 60 秒，不重建                                        |
| 2      | 环境变量 `SITE_URL` / `NEXT_PUBLIC_*`   | 控制台（运维） | `SITE_URL` 重启生效；**`NEXT_PUBLIC_*` 改了必须重新构建** |
| 3 地板 | `site-config.ts` 的代码字面量默认值     | 改代码         | 重新构建                                                  |

- **清空一项 = 删掉 KV 里这个 key**，立刻回落到第 2/3 层的值，不是存空字符串。
  例外：可选字段（如备案号）允许空值，字段定义里标 `optional: true`。
- **坑（必须知道）**：`NEXT_PUBLIC_*` 在 Next 构建时被替换成字面量写进 bundle，
  运行期改控制台环境变量**对已构建的产物无效**——这类值本来就该走后台改，
  这也是做这套系统的理由之一。`SITE_URL` 是服务端变量，不受此限。
- 三层由同一张字段定义表的 `fallback` 串起来，不在每个消费点写 if-else。

### 字段定义表驱动（为后续加配置项预留）

加一项配置 = 表里加一行；表单、校验、类型、审计自动跟上，不用四处改代码。

```ts
export const SITE_SETTINGS_FIELDS = [
  { key: "siteName", label: "网站标题（全称）", kind: "text", fallback: SITE_NAME },
  { key: "siteUrl", label: "网站域名", kind: "domain", fallback: SITE_URL, confirm: true },
  { key: "sourceUrl", label: "源代码链接", kind: "url", fallback: REPO_URL },
  { key: "icp", label: "备案号", kind: "text", fallback: "", optional: true },
] as const;
```

- `kind` 决定校验与输入框形态（`text` / `domain` / `url` / `textarea` / `secret`）；
  `secret` 留给第 4 步的三个密钥（自动尾 4 位、永不回显），不另起一套机制。
- `fallback` 指向 `site-config.ts` 的现值，是"地板"的接地点。
- `confirm: true` = 保存需二次确认（域名这种改了影响搜索收录的）。
- **未知字段宽容**：KV 里出现表里没有的 key，原样保留、不丢数据、表单不显示——
  新版存的字段，回滚到旧代码也不丢。
- 审计按字段 diff，不为每个字段写代码。

**没预留**（本轮不做，留口子而已）：中英双语文案（加 `i18n: true` 才能扩）、
字段分组（字段多了加 `group` 即可）、静态烙印（渲染层的事，见第 9 节）。

---

## 4. 本轮要做的三步（第 4–5 步缓做）

| 步骤 | 内容                    | 交付物                                                                                                                                                                                                                                                                       | 约计 |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1    | 设置读写层 + 管理员判断 | `web/lib/site-settings.ts`（缓存 + 兜底）、`web/functions/internal/settings/get.js`、`internal-kv.ts` 加 settings 中转；`web/auth.ts` jwt 回调比对邮箱写 `token.isAdmin`、`next-auth.d.ts` 补类型、`functions/_lib/auth.js` 边缘侧同样判定；`.env.example` 补 `ADMIN_EMAILS` | 半天 |
| 2    | 后台页面 + 保存接口     | `/admin/settings` 表单 + `functions/api/admin/settings` GET/PUT + 写入校验 + 审计；白名单外 404；edge-dev 白名单同步登记（否则本地静默 404）                                                                                                                                 | 半天 |
| 3    | 消费方改读运行期设置    | 根 `layout.tsx` 的 metadata 改 `generateMetadata()`；`SiteFooter.tsx` 页脚三项改为 props 传入；`site-config.ts` 降级为纯兜底；顺带收敛 `.env.example` 与代码里域名不一致（`skill.nextpilot.org` vs `.ai`）                                                                   | 半天 |

每步独立可验收：步骤 2 完成本地就能登录看后台；步骤 3 完成改后台文案全站可见。

**缓做的**：第 4 步（三个密钥进后台）、第 5 步（守卫 + 文档，含 checklist 三处同步与 mutate 自证）。

### 实施进度（2026-09-27）

| 步骤 | 状态 | 实测证据                                                                                             |
| ---- | ---- | ---------------------------------------------------------------------------------------------------- |
| 1    | ✅   | 造会话后 `/api/auth/session` 返回 `isAdmin: true`；`/internal/settings/get` 返回 `{"settings":null}` |
| 2    | ✅   | 见下方"步骤 2 实测"；`/me` 入口浏览器实测 1 个（未登录 0 个），点进后 H1 = 站点设置                  |
| 3    | ✅   | 见下方"步骤 3 实测"；改域名后 robots / sitemap / canonical 全跟着走                                  |
| 4    | ✅   | 见下方"步骤 4 实测"；23 条断言全绿（脱敏、审计、优先级、清空）                                       |
| 5    | ✅   | `check-site-settings` 6 条规则 × 7 条变异，变异自证 7/7 各自变红                                     |

**步骤 2 实测**（本地 dev，管理员会话用 `AUTH_SECRET` 现造 JWE，未改任何源码）：

| 场景                       | 结果                                            |
| -------------------------- | ----------------------------------------------- |
| 未配 `ADMIN_EMAILS`        | 有会话也 404（"没配 = 没有任何人是管理员"成立） |
| 管理员 GET                 | 200 + `fields` 8 项                             |
| 写四项                     | `changed` 4 项，回读一致                        |
| 只改备案号                 | `changed: ["icp"]`，其余字段原样保留            |
| 只清空备案号               | `changed: ["icp"]`，该项从覆盖里删除            |
| 非法域名 `ftp://` / 带路径 | 400，只报该字段                                 |
| 未知字段                   | 400，不落库                                     |
| 审计                       | `settings_log_*` 5 条已落 KV                    |
| Node 侧通道                | `/internal/settings/get` 读到同一份值           |

#### 实施中改掉的两处口径（照 v2 原文会写错）

1. **保存用 POST，不是 PUT**：本地 `edge-dev` 垫片只把 GET/POST/DELETE 映射到 `onRequest*`，
   PUT 会落到 `onRequest` 兜底而静默走不通。表里第 2 步的"GET/PUT"以此为准。
2. **空串 = 删掉覆盖、回落到默认值，不报错**：三层优先级里代码常量是地板，任何一项空了都有值
   顶上，"非空"在保存这层没有意义；而且报错会和输入框提示（"留空则用回默认值"）直接打架。
   配套地，**表单只提交改动过的字段**——全量提交会把当前默认值一起固化进 KV，之后改
   `site-config.ts` 的代码默认值就再也不生效了。

#### 联调前提：`proxy.ts` 的 matcher 必须放行这些路径

`/internal/*` 与根级探针（`/ping`、`/kv-probe`、`/issue-probe`）没有 locale 概念，被 next-intl
加前缀后就再也命中不到 `next.config.ts` 给它们配的 rewrite。漏掉时 `/internal/*` 拿到的是
**HTML 404**（Next 的 404 页面），和"edge-dev 白名单没登记"那种纯文本 404 长得不一样，
足以把排查方向带偏。已一并放进 matcher 的排除项。

**步骤 3 实测**（本地 dev，写入后刷新页面）：

| 场景                                            | 结果                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| 改站点标题 / 页脚四项                           | title、`og:site_name`、页脚四行立即跟着变                                            |
| 清空这几项                                      | 65 秒（缓存 TTL）后回落：`NextPilot Skill · …`、"让无人机更智能" 回归                |
| `siteUrl` 改成 `https://skill-test.example.org` | 65 秒后 robots 的 `Host`/`Sitemap`、sitemap 的 `<loc>`、skills 页 canonical 全跟着走 |

**步骤 4 实测**（`.workbuddy/tmp/verify-secrets-step4.mjs`，23 条断言全绿）：

| 场景                  | 结果                                                              |
| --------------------- | ----------------------------------------------------------------- |
| 非管理员会话          | 404（不回 403：403 等于告诉对方"入口存在，只是你进不去"）         |
| 保存两个密钥          | `changed` 两项；KV 里是**明文**（消费方要用它发信 / 调 API）      |
| 审计                  | `from`/`to` 对密钥一律写 `***`，整条日志不含明文；`by` 记了操作人 |
| 后台 GET              | 密钥只回尾 4 位（`****5678`），响应体里搜不到明文                 |
| 优先级                | KV 覆盖 > 环境变量 > 无（后台没存 / KV 未绑定都回落环境变量）     |
| 清空密钥              | 从覆盖里删掉该项，之后回落到环境变量                              |
| Node 侧 `/internal/…` | 返回**明文**——`mailer.ts` 拿它发信，脱敏了就发不出去              |

**⚠ 一个差点漏掉的坑**：`isMailConfigured()` 转 async 之后，调用点若不加 `await`，
`!Promise` 恒为 false，那个 503 分支就成了死代码。类型检查放它过——`Promise<object>`
可以赋值给 `object`。凡是"函数改成 async"都要回头搜一遍调用点。

### 步骤 5：守卫（`web/scripts/check-site-settings.mjs`）

这套机制的坏法有一个共同点：**构建照过、页面照开，只有管理员改了没反应**。没有一条会
抛异常，所以只能静态拦。九条规则：

| 规则 id                      | 拦什么                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| `settings-schema`            | 两侧字段表（Node / 边缘）key 与 kind 不一致 → 存进去了读不出来    |
| `settings-footer-props`      | 页脚四项不再由 props 传入 → 后台改了页脚不变                      |
| `settings-footer-url`        | 页脚把仓库地址写回组件 → 后台改链接不生效                         |
| `settings-static-metadata`   | 根 layout 用了 `generateMetadata` → **首页退回动态渲染**          |
| `settings-render-path`       | 渲染路径读了 `getSiteSettings()` → 那一页退回动态渲染             |
| `settings-static-locale`     | `[locale]` 忘调 `setRequestLocale(...)` → 整棵子树动态化          |
| `settings-site-url-fallback` | `SITE_URL` 缺生产兜底 → 漏配变量时指向 `localhost:3000`           |
| `settings-env-var-name`      | `.env*` 里的域名变量名没带 `NEXT_PUBLIC_` 前缀 → 孤儿变量没人读   |
| `settings-secret-client`     | 密钥字段名进了客户端组件 → 明文被序列化进 SSR 的 HTML             |
| `settings-secret-wiring`     | 某个密钥没有任何消费点在读它 → 管理员以为轮换过了，实际还在用旧的 |
| `settings-wiring`            | 这道门自己被从 `checklist.yml` 摘掉                               |

变异自证 12/12 各自变红（`mutate_guards.py --guard site-settings`）。

> **2026-09-28 极性反转**：`settings-metadata` 这条规则的原语义是「根 layout **必须**用
> `generateMetadata` 读运行期设置」（为了「后台改名即时生效」）。实测发现这正是首页
> TTFB ~1.5s 的根因——根 layout 一旦导出 `generateMetadata`，Next.js 把**整棵路由树**
> 判为动态渲染。于是站点信息改为「环境变量 + 重新部署」，规则**极性反转**为
> `settings-static-metadata`（必须静态、不得有 `generateMetadata`），并新增
> `settings-render-path` 与 `settings-static-locale` 两条守静态化的规则。
> 详见 CLAUDE.md 6.2.4。

**自证逼出来的两处判据修改**：

1. `settings-secret-wiring` 原来用子串匹配，于是消费点把 key 改名成 `deepseekApiKeyV2`
   （字段表没跟着改）时，**恰恰是最典型的坏法**却仍然算"有人在读"。改成整词匹配
   （`\bkey\b`）才抓得到。第一版变异写成 `deepseekApiKeyRenamed` 也是同一个坑——
   它含原串，变异没生效，看着像"守卫恒绿"，其实是变异等价。
2. `settings-static-locale` 最初匹配**名字出现**即可，结果 `import { setRequestLocale }`
   这一行（真实代码）就足以判绿，「删掉调用却留着 import」这种最像样的坏法漏网。
   改成匹配**调用** `setRequestLocale\s*\(` 才抓得到——变异自证当场把这个漏洞顶了出来
   （报 `guard always-green`）。

**2026-09-28 追加 `settings-site-url-fallback`**：首页静态化把站点信息从运行期 KV 改成
构建期常量后，线上 sitemap 立刻指向 `http://localhost:3000`——因为 `NEXT_PUBLIC_SITE_URL`
**从来没在控制台配过**，过去只是被「sitemap 走 KV 取值」掩盖着。`SITE_URL` 是唯一一个
「默认值 ≠ 线上值」的字段（站名/描述/页脚的默认值恰好就是想要的线上值），漏配后页面
毫无异常、只有 sitemap/robots/canonical 全错。故加此规则，并给 `SITE_URL` 补生产兜底。
详见 CLAUDE.md 6.2.5。

**同日再追加 `settings-env-var-name`**：排查 `localhost:3000` 残留时发现 `.env.local`
写的是裸名 `SITE_URL=`，而代码读 `NEXT_PUBLIC_SITE_URL`——孤儿变量，编辑器看着"配了"
其实没人读。同一批还清出 `internal-kv.ts` 的 `publicOrigin()` 过时判据（旧实现用
「`SITE_URL !== localhost`」当本地判断，加了生产兜底后在 production 下永远为真，
导致本地 `next start` 的自请求打到线上）。两处都是「静默失败」类，故一并写成守卫。

---

## 5. 能改什么（本轮：站点信息 8 项 + 密钥 3 项）

| 配置项           | 现状                                      | 改了之后哪里会变                          |
| ---------------- | ----------------------------------------- | ----------------------------------------- |
| 网站标题（全称） | `web/lib/site-config.ts` 的 `SITE_NAME`   | 浏览器标签页标题、搜索标题、分享卡片标题  |
| 网站短名         | 同文件 `SITE_SHORT`                       | 标题后缀（`xxx · NextPilot`）、PWA 应用名 |
| 网站描述         | 同文件 `SITE_DESCRIPTION`                 | 搜索摘要、分享卡片描述                    |
| 网站域名         | 同文件 `SITE_URL`                         | 分享链接、sitemap、robots、JSON-LD        |
| 页脚版权行       | `web/components/SiteFooter.tsx`（版权行） | 每页底部 © 行                             |
| 页脚品牌介绍     | 同文件（品牌区描述）                      | 页脚左侧介绍语                            |
| 源代码链接       | 同文件 `REPO_URL`（现写死组件内）         | 页脚"源代码"链接                          |
| 备案号           | 现在全站没有                              | 页脚版权行下新增一行                      |
| DeepSeek API Key | 环境变量 `DEEPSEEK_API_KEY`               | 日志分析的 LLM 解释层                     |
| SMTP 密码        | 环境变量 `SMTP_PASS`                      | 邮箱验证码登录的发信                      |
| Gitee 令牌       | 环境变量 `AUTH_GITEE_TOKEN`               | 浏览器报错自动提 issue                    |

密钥三行的地板是**环境变量**而不是代码——硬编码密钥是安全事故，所以 `fallback` 只能是空串，
消费方一律写 `设置值 || process.env.X`。

---

## 6. 谁能进后台

- 环境变量 `ADMIN_EMAILS`（逗号分隔邮箱清单），**已拍板填 `latercomer@qq.com`**。
- 实现路径：`web/auth.ts` 的 jwt 回调比对邮箱后写入 `token.isAdmin`，
  `web/types/next-auth.d.ts` 补类型；边缘函数侧用现有
  `web/functions/_lib/auth.js` 的会话解析加同样的邮箱比对。
- 单人项目先这样，不做角色管理界面；以后要加人改这个变量即可。
- **审计**：每次保存追加一条 `settings_log_`（谁、何时、改了哪个字段），出问题能倒查。

---

## 7. 与 v1 的三处差异（当天代码已变，别照 v1 找代码）

v1 写"八处字面量散落在 `seo.ts` / `layout.tsx` / `SiteFooter.tsx`"，
2026-09-27 复核时代码已经重构过，现状是：

1. **八处已收敛成一处**：`web/lib/site-config.ts` 一个文件集中导出
   （`process.env.NEXT_PUBLIC_*` + 代码兜底），`layout.tsx`、`seo.ts` 都 import 它。
   所以第 3 步从"改八个文件"变成"给这一个文件加运行期覆盖层"，工作量大幅缩小。
2. **`SiteFooter.tsx` 是 `"use client"` 客户端组件**，不能自己 async 读 KV →
   页脚三项（版权行 / 品牌介绍 / 源码链接）由服务端取值后以 props 传入。
   `REPO_URL` 目前仍写死在组件里，属第 3 步要拔掉的一处。
3. KV key 与路由名从 v1 的 `cfg_*` / `/admin/config` 改为 `settings_*` / `/admin/settings`。

---

## 8. 故意不给改的（安全边界，不是没做完）

| 密钥                  | 为什么不进后台                                                                     |
| --------------------- | ---------------------------------------------------------------------------------- |
| `AUTH_SESSION_SECRET` | 改了所有登录会话立即失效（全员掉线），且边缘函数与 Node 必须一致（运维文档已警示） |
| `AUTH_EDGE_SECRET`    | 改了 Node↔Edge 内部通道锁死，后台自己也调不通 KV                                   |
| GitHub OAuth 密钥     | 改了登录坏，且极少轮换                                                             |
| `EDGEONE_API_TOKEN`   | 部署通道密钥，在 GitHub Secrets 层，与站点运行时无关                               |

这些留在 EdgeOne 控制台环境变量。**改它们等于换锁芯，必须在控制台走变更。**

---

## 9. 已知限制（不阻塞本轮，如实记）

1. **静态烙印**：构建期静态化的页面（指南详情等），页头页脚是"烙"在 HTML 里的，
   改设置后那些页面不会热变；PWA manifest 的应用名同理。上线后实测占比，
   占比高再二选一（关键页面强制动态渲染 / 页头页脚客户端刷新），拿实测数据定，不预做。
2. **60 秒生效**：边缘侧保存无法主动清 Node 侧模块缓存，靠自然过期。
   要"立即生效"得加版本号轮询，本期不做。
3. **域名别乱改**：搜索引擎收录与分享链接都跟着走；后台里这一项保存时做二次确认。
4. **守卫已做（第 5 步）**：`check-site-settings` 六条规则 + 门还在自检，变异自证 7/7。
   剩下没守的是"品牌文字写回 **Header**"——`SiteHeader.tsx` 里那条仓库地址本轮没拔
   （第 3 步只承诺页脚四项与 metadata），所以守卫也没把它列进判据，避免"一上来就红"。

---

## 10. 待拍板 → 已拍板（2026-09-27）

1. `AUTH_ADMIN_EMAILS`（变量名 2026-09-27 从 `ADMIN_EMAILS` 改来）填哪个邮箱 →
   **`latercomer@qq.com`**。
2. 第二块密钥清单（DeepSeek / SMTP / Gitee 令牌）→ **就这三个**，确认无误。
3. 五步全做还是先做 1–3 步 → 先做 1–3 步（站点信息），密钥与守卫缓做；
   **2026-09-27 当天五步全部做完**，见上方实施进度。

后台里密钥的展示规则（第 4 步用）：**只显示尾 4 位**；"替换"= 写入新值立即生效；
"清除"= 删掉 KV 覆盖、回落到环境变量。完整值永不回显（防截图泄露）。

---

## 11. 验收口径

- **步骤 1**：`getSiteSettings()` 在 KV 空时返回 `site-config.ts` 的现值（不白屏）；
  `ADMIN_EMAILS` 命中者 `token.isAdmin === true`，未命中者 false。
- **步骤 2**：白名单邮箱登录后可 GET/PUT `/api/admin/settings`；非白名单访问
  `/admin/settings` 与接口都返回 **404**；非法域名格式报错指明"缺什么"。
- **步骤 3**：后台改站点标题 → dev 下刷新页面，标签页标题与页脚同步变化；
  清掉 KV 后回落构建期默认值。
- **步骤 4**：后台写入一个密钥 → 消费方（边缘 `getSecret` / Node `mailer.ts`）取到新值；
  非管理员 404；GET 只回尾 4 位；审计里搜不到明文。
- **步骤 5**：`node scripts/check-site-settings.mjs` 六条全绿；
  `python tools/ci/mutate_guards.py --guard site-settings` 七条变异各自变红。
