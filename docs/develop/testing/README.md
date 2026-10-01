# 质量门禁：什么时候跑什么

本地 hook、云端 CI、手动复测跑的都是同一套检查，定义只在
[`tools/ci/checklist.yml`](../../../tools/ci/checklist.yml) 一个文件里。改一项校验，
改这一处就够了。

| 你想知道                         | 看哪                                         |
| -------------------------------- | -------------------------------------------- |
| **六个阶段各跑什么、耗时多少**   | [`checks-by-stage.md`](checks-by-stage.md)   |
| 检查按"查什么"怎么分类、各自耗时 | [`check-catalog.md`](check-catalog.md)       |
| 三层守卫是什么、为什么要有自证   | [`guards.md`](guards.md)                     |
| 日志回归为什么只在本地           | [`log-regression.md`](log-regression.md)     |
| **改完想手动复测一遍**           | [`README.md`](README.md#三复测方式) 本文 §三 |
| 踩坑了、报错看不懂               | [`pitfalls.md`](pitfalls.md)                 |

## 一、速查

大部分时候你什么都不用跑，门禁是自动的。

| 阶段         | 入口                                                                        | 触发         | 实测时长              |
| ------------ | --------------------------------------------------------------------------- | ------------ | --------------------- |
| **0 dev**    | `pnpm web:dev` = `build:kb` + `next dev`                                    | 手动         | 启动即跑构建期校验    |
| **1 commit** | `.githooks/pre-commit` + `commit-msg`                                       | `git commit` | 2s                    |
| **2 build**  | `pnpm web:build` = `build:kb` + `next build`                                | 手动         | 144s（仅 next build） |
| **3 push**   | `.githooks/pre-push` → `check_all.py --push`                                | `git push`   | 26~40s                |
| **4 CI**     | `.github/workflows/` 四个独立 workflow（`ci` / `e2e` / `mutate` / `audit`） | push / PR    | 15~40min（并行）      |
| **5 deploy** | `.github/workflows/deploy.yml`                                              | CI 成功后    | 部署 + 线上 E2E       |

推送有三种姿势，看你想跑多重：

```bash
git push                # 默认，只跑 push 阶段那批（秒级）
WITH_E2E=1 git push     # 连 E2E 那批一起跑（+5~7min）
FULL_PUSH=1 git push    # 和 CI 一样全（+144s 的 next build）
```

## 二、为什么这样分档

分档判据只有一条：这项检查会不会让人干等着。

- 秒级（< 5s）→ 每次都跑，跑了也不心疼；
- 十秒级（10-60s）→ 本地 push 时跑，但只在改了相关文件时才有意义；
- 分钟级（> 2min）→ 一律不在本地跑，交给云端 CI。

另一条判据是有没有增量价值。一条检查若在别处已被等价保证，重复跑就是纯成本，工具链检查
（`check_prereq`）就是这种情况：CI 里 `pip install -r requirements-dev.txt` +
`pnpm install` 只要装不上就直接红，本地再查一遍环境没有新信息。

还有一条是单一事实源：所有校验命令住在 `tools/ci/checklist.yml`，
`tools/ci/check_all.py` 只做"读清单 + 跑"，hooks 与 workflow 都只调它。加一项校验，
改 `checklist.yml` 一处。

### 目标形态

| 阶段      | 该有什么                                      | 不该有什么                |
| --------- | --------------------------------------------- | ------------------------- |
| dev       | 类型 / lint 的实时反馈（不阻塞）              | 任何门禁                  |
| commit    | 格式化改动过的文件（Py + 前端）+ 提交标题规范 | 全仓扫描                  |
| push      | 静态检查那批秒级项 + 机密扫描 + 日志回归      | 工具链检查、E2E、联网审计 |
| CI        | build、E2E、自证、依赖审计                    | 日志回归（**本地专用**）  |
| deploy 后 | 打线上的 E2E                                  | —                         |

除耗时之外，还有两条通用的分流判据。要联网的检查不进 push：`pnpm audit` / `pip-audit`
查外部漏洞库，网络抖动会变成"提交失败"，放 CI。只对本次改动有意义的检查放 commit：
格式化、提交标题规范，改动多少处理多少，比全仓扫一遍快，且错误在提交前消失。

`.githooks/` 下只有 Python 实现（`pre-commit` / `pre-push` / `commit-msg`），bash 版与
`.ps1` 全部删除。hook 必须自己探测带 ruff 的解释器，否则每次都红
（见 [`pitfalls.md`](pitfalls.md) §hook 的解释器探测）。

## 三、复测方式

```bash
python tools/ci/check_all.py --push              # 本地快检（推送时自动跑的同一套）
python tools/ci/check_all.py --push --skip-logs  # 同上，但跳过日志回归
python tools/ci/check_all.py --ci                # 云端那批（不含 E2E）
python tools/ci/check_all.py --build --ci        # 云端那批 + next build
python tools/ci/check_all.py --build --e2e       # 含 E2E
python tools/ci/check_all.py --list              # 打印清单，不执行
python tools/ci/mutate_guards.py --only <关键字> # 单条自证
python tools/ci/mutate_guards.py --list          # 看变异注册表
```

`--e2e` 控制两条 E2E：`playwright-smoke`（`--grep @smoke`，约 1~2min）与
`playwright-analyze`（`--grep log analysis`，约 7min）。

七个开关是平等的、可任意组合：`--build` / `--commit` / `--push` / `--ci` / `--e2e` /
`--mutate` / `--audit`，不带任何开关时默认 `--build --commit --push --ci`。
`--ci` 不含 `--build`，所以 `ci.yml` 必须写 `--build --ci`，否则 `next build` 漏跑。

`when` 是清单里每个 job 的触发条件数组（`[build, push, ci, e2e, mutate, logs]`），
与命令行开关一一对应。`logs` 是唯一自动条件：本地存在 `.ulg`/`.bin` 时自动启用。

自证必须单独跑：跑单条要给足超时（`test-issue-filer` 一次 45s），超时被硬杀会导致变异
没还原，跑完务必 `git status` 确认无残留。
