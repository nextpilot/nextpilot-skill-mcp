# 开发环境安装（tools/setup）

新机器上一条命令把开发环境装好：Python 侧一律用 **uv**，Node 侧用 `pnpm`，装完跑一次仓库既有的工具链自查。

```powershell
# Windows（PowerShell 5.1+）
.\tools\setup\setup.ps1
```

```bash
# Linux / macOS / WSL
./tools/setup/setup.sh
```

两个脚本做同一套步骤，**不复制依赖清单**——装什么由仓库根的 `requirements-dev.txt` 与 `requirements-logs.txt` 决定，改依赖只改那两份。

## 装什么

| 步骤 | 做什么                                                              | 落点                            |
| ---- | ------------------------------------------------------------------- | ------------------------------- |
| 1    | 找 `uv`（缺失时给出安装命令，`-InstallUv` / `--install-uv` 可代装） | PATH                            |
| 2    | `uv venv .venv --python 3.11`（已存在则复用）                       | 仓库根 `.venv`                  |
| 3    | `uv pip install -r requirements-dev.txt [-r requirements-logs.txt]` | `.venv`                         |
| 4    | `pnpm install`                                                      | 仓库根（workspace 会装 `web/`） |
| 5    | `git config core.hooksPath .githooks`                               | 本仓库 `.git/config`            |
| 6    | 跑 `tools/common/check_prereq.py` 自检                              | —                               |

常用开关（两个平台同名，Windows 用 PascalCase、POSIX 用 kebab-case）：

| 开关                          | 作用                                       |
| ----------------------------- | ------------------------------------------ |
| `-SkipNode` / `--skip-node`   | 只装 Python                                |
| `-SkipLogs` / `--skip-logs`   | 不装 pyulog（本机没有真实 `.ulg` 日志时）  |
| `-SkipHooks` / `--skip-hooks` | 不动 git 的 `core.hooksPath`               |
| `-Recreate` / `--recreate`    | 删掉现有 `.venv` 重建（依赖装乱了才用）    |
| `-IndexUrl` / `--index-url`   | 换 PyPI 源，默认 `https://pypi.org/simple` |

## 手动跑钩子

不用等 git 触发，两条 script 直接调钩子本体（都在根 `package.json`）：

```bash
pnpm hook:pre-commit   # 暂存文件的 ruff format / prettier / eslint
pnpm hook:pre-push     # push 阶段的本地快检（check_all.py --stage push）
```

`python` 解析到哪个解释器都行——钩子开头会把自己切到 `.venv` 重跑，这也是它们唯一被支持的执行方式。两条注意：

- `hook:pre-commit` 只对**已暂存**的文件动手（`git diff --cached`），没暂存时它会直接返回 0，看着像没跑，其实是没活干。
- 它跑完会把格式化过的文件重新 `git add`，与真正提交时的行为一致。

## 为什么是 uv

- **新机器不必先备好 Python**：`uv venv --python 3.11` 会自己取一份 3.11（本机有 3.11.5 时直接用它，实测过）。
- **不读本机 pip 的配置**：本机 `pip.ini` 配的是 aliyun 的 **HTTP** 镜像（pip 判它不安全，`pip-audit` 因此装不上）。uv 只认自己的 `uv.toml` / `pyproject.toml` 与命令行，所以脚本显式传 `--index-url`，换台机器结果一致。
- **命令即环境**：`uv pip install --python .venv/...` 明确指向虚拟环境，不依赖"当前激活了哪个环境"这种看不见的状态。

## 装完之后（三条容易踩的）

1. **校验必须用 `.venv` 里的 python。** `check_all.py` 走 `sys.executable -m ruff`，而裸 `python` 在这台机器上解析到没装 ruff 的托管 3.13。用绝对路径最稳：

   ```powershell
   .\.venv\Scripts\python.exe tools\ci\check_all.py --stage push
   ```

2. **`.venv` 只能在仓库根。** `pyrightconfig.json` 写的是 `venvPath "."` + `venv ".venv"`；挪地方会让 `knowledge/engine/` 的类型检查集体报 import 解析不了（这条坑以前踩过：pyright 挑错解释器，51 个假失败）。

3. **激活脚本可能被执行策略挡住**（`Activate.ps1`）。用上面的绝对路径，或临时放开：`Set-ExecutionPolicy -Scope Process RemoteSigned`。

## 已知代价：pyulog 不钉版本

`requirements-logs.txt` 装上游最新的 pyulog，与浏览器侧一致（Pyodide 那边是 micropip 现装，也没钉）。代价是实测过的：6 条冻结基线是 **1.1.0** 冻的，`1.2.x` 没有 `__version__` 属性 → 引擎的 `parserVersion` 退化成 `pyulog/unknown` → `compare_baseline.py` 6/6 红，而它正是那批用例里唯一的差异项。

两条路选一条：

- 钉回 `pyulog==1.1.0`（改 `requirements-logs.txt` 再跑本脚本）；
- 用当前版本重冻基线：`python tools/engine/dump_baseline.py`——重冻等于换掉真相，单独提交并说明理由。

## 本脚本不做的事

- 不写 `web/.env.local`（里面是 `DEEPSEEK_API_KEY` 这类凭据，不该由脚本代劳）：`cp web/.env.example web/.env.local`。
- 不装 Playwright 浏览器（约 150MB）。要跑 E2E 再单独执行 `pnpm exec playwright install chromium`。
- 不给钩子留"备用解释器"。`.githooks/_venv_python.py` 只认仓库 `.venv`：Git 用 PATH 上的 python 启动钩子（本机是没装 ruff 的托管 3.13），它负责把整个钩子切换到 `.venv` 下重跑；`.venv` 不存在就退 **127**，Git 对 127 的处理是警告放行，不会把人锁在提交外面。第 5 步会用 PATH 上的 python 真跑一次这个切换，把最终落在哪个解释器上打印出来——选中的不是 `.venv` 会打警告，"钩子悄悄用了另一个 Python"既不报错也不失败，只能这样拦。
