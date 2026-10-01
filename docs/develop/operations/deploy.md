# 部署

**这一份讲怎么发布、怎么回滚、CI 与部署怎么衔接。**
环境变量与 KV 绑定见 [`README.md`](README.md)；本地开发见
[`../quickstart/README.md`](../quickstart/README.md)。

---

## 一、EdgeOne Pages 构建配置

| 项         | 值                                                                         |
| ---------- | -------------------------------------------------------------------------- |
| 项目根目录 | `web/`                                                                     |
| 安装命令   | `pnpm install`                                                             |
| 构建命令   | `pnpm build`（EdgeOne 在 `web/` 下执行，即 `web/package.json` 的 `build`） |
| 输出目录   | `.next`（Next.js 全栈模式，**非静态导出**）                                |
| 实测兼容   | Next.js 16.3.5 可直接部署（官方文档标称支持 13.5-15）                      |

> 这里的 `pnpm build` 是**在 `web/` 目录下跑的**，不是仓库根的转发脚本。
> 仓库根要跑同一个构建应写 `pnpm web:build`（根 `package.json` 里没有裸 `build` 脚本）。

**只上传 `web/` 这一个目录**——所以站点内容（`web/content/`）直接入库、运行期读盘。

---

## 二、CI/CD（GitHub Actions）

**五个 workflow 文件**，分工是**「CI 只判质量，Deploy 只管发布」**，
且 CI 那侧按耗时拆成四份互不阻塞的独立 workflow：

| 文件                           | 触发                                            | 跑什么                                                           |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | push 到 master/main / PR / 手动                 | `check_all.py --build --ci`                                      |
| `.github/workflows/e2e.yml`    | push 到 master/main / 手动                      | `check_all.py --build --e2e`                                     |
| `.github/workflows/mutate.yml` | push 到 master/main / 手动                      | `check_all.py --mutate`                                          |
| `.github/workflows/audit.yml`  | **仅手动**                                      | `check_all.py --audit`                                           |
| `.github/workflows/deploy.yml` | CI 跑完且成功（`workflow_run`）/ 手动 / 同仓 PR | `edgeone pages deploy` 到 EdgeOne Pages，生产环境加 `/ping` 冒烟 |

**每个 CI workflow 只做一件事**：装依赖 → 调 `check_all.py` 带对应开关。
检查项各自耗时、为什么这样分档，见
[`../testing/checks-by-stage.md`](../testing/checks-by-stage.md) §五（CI）；
本文件只讲**发布流程**。

**几条关键约定**：

- **部署等 CI 绿了才发**：`workflow_run` 无法在 `on` 里过滤结果，
  判据写在 job 的 `if` 里（只认 `conclusion == 'success'`）。
- **回滚 / 补发**走 Actions 页面手动触发 `Deploy`，`env` 选 `production`。
- **同仓 PR 自动发预览环境**（`-e preview`）；fork 的 PR 拿不到 secret，
  已显式跳过而不是让它红。
- **环境变量仍配在 EdgeOne 控制台**，不进仓库、不进 CI 日志。
- **改动校验清单时只改 `tools/ci/checklist.yml` 一处**，五个 workflow 与本地 hook
  都跟着变——命令不要在 workflow 里另抄一份。
- **谁慢谁独立**：`--mutate` 约 26min、`--e2e` 约 7min，都单独一份 workflow 拿独立超时预算，
  不许塞进 `ci.yml` 把 40min 挤爆。

---

## 三、需要配的仓库配置

Settings → Secrets and variables → Actions：

| 类型     | 名称                | 说明                                                           |
| -------- | ------------------- | -------------------------------------------------------------- |
| Secret   | `EDGEONE_API_TOKEN` | EdgeOne 控制台 → API Token                                     |
| Variable | `EDGEONE_PROJECT`   | Pages 项目名。**填错会自动新建一个空项目**，首次跑前务必核对   |
| Variable | `SMOKE_BASE_URL`    | 可选。生产源站如 `https://skill.nextpilot.org`，不配则跳过冒烟 |

---

## 四、部署后自检

生产环境部署完会跑 `/ping` 冒烟；要完整验一遍线上，用：

```bash
pnpm --filter ./web exec playwright test --config playwright.live.config.ts
```

它**不启动本地 server**，直接打 `SMOKE_BASE_URL`，含真实上传 `.ulg` 的全流程。

---

> ⚠️ **仓库托管方的现状**：当前 `origin` 是 Gitee（默认分支 `master`），
> 而 **Gitee 不执行 `.github/workflows/`**，它有自己的流水线配置目录。
> 要让上面五个文件真正跑起来，需要把仓库镜像/迁移到 GitHub，或在 Gitee 侧另写一份
> 等价配置（但那样就破了「校验命令只写一处」的约定，CI 与本地会分成两处维护）。
> **未迁移前，云端门禁实际处于未生效状态**，质量仍只靠本机 `.githooks/pre-push` 拦。
