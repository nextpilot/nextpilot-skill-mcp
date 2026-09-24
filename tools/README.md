# 开发工具（tools/）

**人手动跑**的开发与验证工具。构建生命周期里自动执行的脚本在 `web/scripts/`
（如 `build-knowledge.mjs`，由 `pnpm dev` / `pnpm build` 前置调用）。

## 目录按「被测模块」分

一个脚本住哪，由**它作用在哪个模块上**决定，不由"它是测试还是检查"决定：

| 目录                | 作用域                                       | 装什么                                                                                            |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `knowledge/engine/` | `knowledge/engine/` 与 `knowledge/px4/rules` | 引擎源码纯净性、provider 契约、规则字段引用、编译产物、冻结基线回归                               |
| `common/`           | 不绑定某个模块                               | 仓库级检查：密钥扫描、工具链自查、校验机制自身的卫生、pnpm 转发脚本守卫                           |
| `dev/`              | 不校验，给人用                               | 下载日志、抓上游字典与资源、探查字段/阈值、本地网页工作台。见 [dev/README.md](dev/README.md)      |
| `ci/`               | 编排，不检查任何东西                         | 跑手 `check_all.py`、清单 `checklist.yml`、自证机 `mutate_guards.py`、Windows 包装                |
| `testdata/`         | 被上面多处共用                               | `logs/`（真实 `.ulg`，含 GPS 不入库）与 `baseline/`（冻结基线）                                   |
| `setup/`            | 装开发环境（给人用，不校验）                 | uv 装 Python 依赖、pnpm 装 Node、挂 git hook、跑工具链自查。见 [setup/README.md](setup/README.md) |

**为什么不叫 `tests/`**：这里装的绝大多数不是测试——`guard-*` `check-*` 是守卫与契约检查，
跑一遍断言的是"某一族不变量还成不成立"，不是单元测试。仓库里已有
`docs/develop/check-taxonomy-rework.md` 专门讨论过这件事。

## 单元测试不在 tools/ 下

**单元测试跟着被测模块走**，`tools/` 里不放单元测试：

- `knowledge/engine/tests/` —— 引擎的单测（pytest 收集，由 `checklist.yml` 的 `pytest-engine` 跑）
- `web/e2e/` —— 端到端（Playwright，42 条）

理由：单测要贴着被测代码才改得动——改 `knowledge/engine/operators.py` 时顺手就能看到旁边有没有对应的
用例，集中到远处就得靠记忆。这条也是 Go / Rust 社区的通行做法（测试与源码同目录）。

`testdata/` 单独成目录而不是塞进某个模块目录：样本日志与冻结基线同时被
`knowledge/engine/`（跑回归）和 `dev/`（探查、打基线）使用，放进任何一边的私目录都会让另一边跨目录取数。

## 两个文件直接在 tools/ 根

- `_logging.py` —— 共用日志库。
- `px4log_engine_runner.py` —— 本地跑引擎的入口，**被 `knowledge/engine/` `dev/` 等多处 import**。
  放根目录而不是子目录：各脚本的 `sys.path` 只往上插到 `tools/`，只有根目录能被多处同时覆盖到。

## 编排层（`ci/`）

`check_all.py` 是**唯一入口**——CI（`.github/workflows/ci.yml`）与 `.githooks/pre-push`
都只调它，检查内容全部由 `checklist.yml` 决定（单一事实源，加一项检查只改那里）。
`mutate_guards.py` 是守卫的自证机：把变异注入源码，断言对应的守卫**会红**——
写完一条守卫不算交付，得证明它真的会红。

依赖：`knowledge/engine/` `dev/` 需 `pip install pyulog numpy` 且 Python ≥ 3.11。

## 不在 tools/ 里的 web 侧脚本

`web/` 是**独立部署单元**（EdgeOne 从 `web/` 源码目录构建），它自己的脚本跟着它走，
不进 `tools/`——单独 checkout `web/` 时得连守卫一起带走：

| 位置                   | 装什么                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `web/scripts/`         | 构建脚本（`build-knowledge.mjs` / `sync-content.mjs` / `make-icons.mjs`）与静态守卫 |
| `web/scripts/browser/` | 驱动本机 Chrome 的 CDP 工具（截图、上传/恢复链路自检、图标预览）                    |
| `web/e2e/`             | 端到端（Playwright）                                                                |

`web/scripts/browser/` 下 5 个脚本都要求**已用 `--remote-debugging-port=9222` 启动的 Chrome**，
自己不起浏览器也不装依赖；其中只有 `check-upload` / `check-restore` 还需要 `pnpm dev` 起来了
（默认打 `localhost:3000`）。
