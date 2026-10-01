# 安装开发环境

装完你会得到：一个 `.venv` 虚拟环境、两份依赖（Python + Node）、挂好的 git hook、
一屏全 `[OK]` 的工具链自检。全程一条命令，Python 连提前装都不用——`uv` 会自己拉 3.11。
装完想跑起来看 [`run-locally.md`](run-locally.md)。

---

## 第 0 步 · 准备两样前置工具

这两样 setup 脚本管不了，先在机器上装好。每样装完跑一下确认命令，有版本号输出就对了。

**① Node.js 22.x** —— 从 <https://nodejs.org> 下载安装（或者用 nvm / fnm 管版本）：

```bash
node -v        # 输出 v22.x 即可
```

**② pnpm** —— Node 装好后一条命令：

```bash
npm i -g pnpm      # 或 corepack enable pnpm
pnpm -v            # 有版本号即可
```

Git 假定已就位。Windows 用户全程用 PowerShell，脚本用 [`setup.ps1`](../../tools/setup/setup.ps1)，步骤和结果完全一致。

## 第 1 步 · 跑一条命令

在**仓库根目录**执行：

```bash
./tools/setup/setup.sh          # Windows: .\tools\setup\setup.ps1
```

脚本会替你依次做六件事，每步开头都有 `=== 步骤名 ===` 的横幅，跟着输出看就明白进度：

| 步骤 | 它做什么                                                            | 你会得到                       |
| ---- | ------------------------------------------------------------------- | ------------------------------ |
| 1/6  | 找 `uv`（Python 包管理器）                                          | —                              |
| 2/6  | `uv venv .venv --python 3.11`（已存在就复用）                       | 仓库根 `.venv`                 |
| 3/6  | `uv pip install -r requirements-dev.txt`                            | Python 开发依赖                |
| 4/6  | `pnpm install`                                                      | Node 依赖（含 `web/`）         |
| 5/6  | `git config core.hooksPath .githooks` + hook 探针                   | commit / push 自动检查         |
| 6/6  | 自检探针：ruff / pytest / numpy / pyulog / yaml / node / tsc / next | 全 `[OK]`、`Environment ready` |

**第 1 步提示找不到 uv？** 两种装法任选：

```bash
./tools/setup/setup.sh --install-uv                     # 让脚本替你在线装
curl -LsSf https://astral.sh/uv/install.sh | sh         # 或自己装完再跑一遍脚本
```

**下载慢？** 换 PyPI 镜像：`--index-url https://mirrors.aliyun.com/pypi/simple/`。

**只想装 Python 侧？** 加 `--skip-node`。其他选项用 `--help` 看（`--recreate` 重建 `.venv`、
`--check-only` 只自检不安装）。

## 第 2 步 · 确认装好了

看脚本结尾：探针全 `[OK]` + `Environment ready` 就完事了。日后怀疑环境坏了（换分支、
机器重启、报错诡异），随时重跑一次自检，几十秒：

```bash
./tools/setup/setup.sh --check-only
```

它只回答「装的工具能不能用」；改代码后该跑的完整检查是另一回事，见
[`../testing/README.md`](../testing/README.md)。

## 第 3 步 · 配本地环境变量

```bash
cp web/.env.example web/.env.local
```

打开 `web/.env.local`，按文件里的注释逐项填（LLM 说明功能要 `DEEPSEEK_API_KEY`）。
不填也能启动站点，只是对应功能不可用。

## 第 4 步 · 验证完整门禁

```bash
python tools/ci/check_all.py --push --skip-logs
```

全绿说明环境与仓库检查全部就位。以后你 `git push` 时 hook 会自动跑同一套（约半分钟）。
头一次跑最常见的两种红，都好解：

| 红字                                 | 解法                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `No module named ruff`（或其他模块） | 解释器没落 `.venv`，看下节「检查怎么找到 ruff」，用 `--check-only` 确认 |
| `ERR_PNPM_IGNORED_BUILDS`            | 不是失败，是 pnpm 的构建脚本审批：`pnpm approve-builds` 后重跑          |

其余红字对照 [`../testing/pitfalls.md`](../testing/pitfalls.md) 排查。

---

## 检查怎么找到 ruff（本仓库最容易踩的坑）

知道下面这层机制，90% 的「环境问题」能自己定位：

**检查永远用「跑它自己的那个解释器」去调工具。** `check_all.py` 内部是
`sys.executable -m ruff`——意思是 ruff 必须装在「执行检查的 Python」里，装在别的
解释器里等于没装。git hook 同理，而且它的解释器**固定为仓库根 `.venv`**：
`.githooks/_venv_python.py` 从仓库根直接推算 `.venv/bin/python` 的路径，hook 启动后
不在 `.venv` 里就把自己重新执行一遍换过去。

这样设计的效果：**全仓只有一个解释器说了算**。你的 hook、CI、IDE（`pyrightconfig.json`
指向同一个 `.venv`）、手动跑的检查，用的是同一套包、同一批版本——结果可比，也不会出现
「两台机器都装了 ruff 但版本不同、行为不同」的扯皮。代价只有一个：依赖必须装进 `.venv`，
装到系统 Python、conda 环境里的依赖，检查一概看不见。

所以你只需要记住一条：**依赖进 `.venv`**。setup 第 2、3 步已经做掉了；之后如果手动补装
（脚本中途失败、加新依赖），把命令打向 `.venv` 的解释器：

```bash
uv pip install --python .venv/bin/python -r requirements-dev.txt          # Linux / macOS / WSL
uv pip install --python .venv/Scripts/python.exe -r requirements-dev.txt  # Windows
```

**要让 AI 助手分析本地日志**（跑本地 MCP 服务才需要），在上一条命令里把两份 requirements
一起装：`-r requirements-dev.txt -r requirements-server.txt`——这份只钉版本、单独成册，
因为只有跑本地 MCP 服务的机器用得上（见 [`run-locally.md`](run-locally.md) §四）。

`.venv` 完全不存在时，hook 会打印「怎么建 .venv」然后以 127 退出——Git 把 127 当警告放行，
所以**没装环境也能提交**，只是没有检查兜底；装好即可恢复。
