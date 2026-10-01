# 安装开发环境

**目标：工具链就位、依赖装好、git hook 挂上。** 跑起来看 [`run-locally.md`](run-locally.md)。

---

## 一、需要的工具

| 工具             | 版本              | 必需？ | 说明                                                                                                                                      |
| ---------------- | ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**      | 22.x              | 必需   | <https://nodejs.org>（或用 nvm / fnm 管理）                                                                                               |
| **pnpm**         | ≥ 12              | 必需   | **全局工具**：`npm i -g pnpm`                                                                                                             |
| **Python**       | ≥ 3.11 + 开发依赖 | 必需   | 见下节，**本仓库最大的坑在这**                                                                                                            |
| **Git**          | 任意              | 必需   | 系统包管理器                                                                                                                              |
| EdgeOne CLI      | 最新              | 可选   | 只在要本地联调 KV / 边缘函数时装（见 [`run-locally.md`](run-locally.md) §五）                                                             |
| MCP 客户端       | —                 | 可选   | 只在要让 AI 助手分析本地日志时装（Claude Code / Cursor 等，见 [`run-locally.md`](run-locally.md) §四）                                    |
| 真实 `.ulg` 日志 | —                 | 可选   | 仓库自带两份小样本（`tools/testdata/logs/`），够跑通流程；跑全量回归需自备（见 [`../knowledge/baselines.md`](../knowledge/baselines.md)） |

## 二、Python 依赖（本仓库最大的坑）

`python` 不等同于「能跑本仓检查的 python」：检查内部用 `sys.executable -m ruff` 调 ruff，
若解释器里没装 ruff，**每次 push 都红**。装完并自检：

```bash
python -m pip install -r requirements-dev.txt
python -c "import ruff, yaml, pyulog, pytest"   # 不报错即合格
```

> `pip-audit` 要指定官方源（部分国内镜像是 HTTP，会被 pip 判为不安全）：
> `python -m pip install pip-audit --index-url https://pypi.org/simple`

要让 **AI 助手分析本地日志**（可选），再装 server 那份：

```bash
python -m pip install -r requirements-server.txt
```

hook 会自己探测解释器（**优先 anaconda，回退 PATH 上的 `python`**），
但探测有前提——候选解释器里得真的有 ruff。装好依赖即可。

## 三、前端依赖

```bash
cd web && pnpm install && cd ..
```

> **`pnpm add` 在本机可能卡 20+ 分钟**（resolve 几百个包，期间零输出），别当成卡死；
> 报 `ERR_PNPM_IGNORED_BUILDS` 不是失败，是 pnpm 的构建脚本审批（`pnpm approve-builds`）。

## 四、挂 git hook（每台机器一次，不随仓库同步）

```bash
git config core.hooksPath .githooks
```

挂上后：`git commit` 自动格式化 + 校验提交标题（2s），
`git push` 自动跑 `check_all.py --push`（26~40s，24 项检查）。
详细行为见 [`../testing/checks-by-stage.md`](../testing/checks-by-stage.md)。

## 五、自检

```bash
python tools/ci/check_all.py --push --skip-logs   # 不依赖日志的静态检查全绿即就位
```

红了对照 [`../testing/pitfalls.md`](../testing/pitfalls.md) 排查——大部分是
解释器没 ruff、`pnpm --filter` 少了 `./` 这两类。
