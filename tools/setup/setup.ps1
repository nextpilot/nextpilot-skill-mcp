# 一键装好本机开发环境（Python 走 uv，Node 走 pnpm）。
#
# 为什么要有这个脚本：这套步骤以前散在 README 与各处注释里，新机器要照着敲五六条命令，
# 而漏一步的表现不是报错，是"某个校验永远红、且看不出跟环境有关"——比如 .venv 里没装
# PyYAML，check_all 的产物检查会假失败；pyright 靠 .venv 找 numpy / pyulog，缺包就报
# 几十个 import 解析不了。把步骤收进一个脚本，末尾的自检是自闭环的：探测逻辑直接
# 写在脚本里，不调用仓库其他脚本、不读清单文件，"装没装对"才有机器来判定。
#
# 装什么由两份 requirements 文件决定（requirements-dev.txt / requirements-logs.txt），
# 这个脚本只决定"装到哪、装完怎么验"——依赖清单不在这里复制第二份。
#
# 用法：
#   .\tools\setup\setup.ps1                  # 全套：Python + Node + git hook + 自检
#   .\tools\setup\setup.ps1 -SkipNode        # 只装 Python（Node 依赖已装好时）
#   .\tools\setup\setup.ps1 -SkipLogs        # 不装 pyulog（本机没有真实 .ulg 日志时）
#   .\tools\setup\setup.ps1 -SkipHooks       # 不动 git 的 core.hooksPath
#   .\tools\setup\setup.ps1 -Recreate        # 删掉现有 .venv 重建（依赖装乱了才用）
#   .\tools\setup\setup.ps1 -InstallUv       # 允许本脚本联网装 uv（默认只打印命令）
#   .\tools\setup\setup.ps1 -CheckOnly       # 不装任何东西，只跑自检
#   .\tools\setup\setup.ps1 -IndexUrl https://mirrors.aliyun.com/pypi/simple/
param(
    [switch]$SkipNode,
    [switch]$SkipHooks,
    [switch]$SkipLogs,
    [switch]$Recreate,
    [switch]$InstallUv,
    [switch]$CheckOnly,
    [string]$Python = "3.11",
    [string]$IndexUrl = "https://pypi.org/simple"
)

# Continue 而不是 Stop：uv / pnpm 这类外部命令把进度信息写在 stderr 上，Stop 会把
# "写了 stderr" 判成失败（实测：uv venv 打印一行 "Using CPython 3.11.5" 就让脚本退出）。
# 所以每一步自己看 $LASTEXITCODE —— 失败与否由我们判定，不由 stderr 有没有输出判定。
$ErrorActionPreference = "Continue"

# 本脚本住在 tools/setup/ 下，仓库根要往上两级（tools/setup -> tools -> 仓库根）。
$ROOT = (Get-Item $PSScriptRoot).Parent.Parent.FullName
# .venv 必须在仓库根：pyrightconfig.json 写的是 venvPath "." + venv ".venv"，
# 换地方就要改那份配置，而它一旦指错，knowledge/engine/ 的类型检查会集体报 import 解析不了。
$VENV = Join-Path $ROOT ".venv"
$VENV_PY = Join-Path $VENV "Scripts\python.exe"

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Exe,
        [Parameter(ValueFromRemainingArguments)][string[]]$ExeArgs
    )
    Write-Host "  > $Exe $($ExeArgs -join ' ')" -ForegroundColor DarkGray
    # 先 2>&1 再过管道：uv / pnpm 把进度写在 stderr 上，直接放出去的话，外层
    # （套一层 powershell -File 调用本脚本时就有一层）会把"写了 stderr"判成命令失败，
    # 而 exit code 明明是 0。转成人话再打印，失败与否只由下面的 $LASTEXITCODE 说了算。
    & $Exe @ExeArgs 2>&1 | ForEach-Object { Write-Host "  $_" }
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw "命令失败（exit=$code）：$Exe $($ExeArgs -join ' ')"
    }
}

Push-Location $ROOT
try {
    # -CheckOnly：跳过安装类步骤（1-5），直接进自检——日常"验证工具链"一条命令。
    # PowerShell 的 if 块内不要求缩进，步骤块原样保留，只在前后加开关。
    if ($CheckOnly) {
        Write-Host "-CheckOnly：跳过安装步骤（uv / venv / 依赖 / Node / hook），直接自检"
    }
    else {

    # ── 1. uv ────────────────────────────────────────────────────────
    Write-Step "1/6 uv（Python 侧一律由它装）"
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $uv) {
        if ($InstallUv) {
            Write-Host "  uv 不在 PATH 上，用 winget 装："
            Invoke-Native winget install --id astral-sh.uv -e --accept-source-agreements --accept-package-agreements
            # winget 装完不会刷新当前进程的 PATH，得按它的默认落点自己找。
            $uvPath = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
            if (Test-Path $uvPath) {
                $uv = Get-Command $uvPath
            }
        }
        if (-not $uv) {
            throw "没找到 uv。装它（任选一条）后重跑本脚本：`n" +
            "    winget install --id astral-sh.uv -e`n" +
            "    irm https://astral.sh/uv/install.ps1 | iex`n" +
            "  （加 -InstallUv 可以让本脚本代跑第一条。 winget 装的 uv 要重开终端才进 PATH。）"
        }
    }
    $uvExe = $uv.Source
    Write-Host "  uv: $uvExe"
    & $uvExe --version

    # ── 2. 虚拟环境 ──────────────────────────────────────────────────
    Write-Step "2/6 Python 虚拟环境（$VENV）"
    if ((Test-Path $VENV) -and $Recreate) {
        Write-Host "  -Recreate：删除已有 .venv"
        Remove-Item -Recurse -Force $VENV
    }
    if (Test-Path $VENV_PY) {
        Write-Host "  复用现有 .venv（要重建加 -Recreate）"
    }
    else {
        # 没指定 --python 时 uv 会挑一个它觉得合适的版本，那样"这台机器装的是哪个 Python"
        # 就随 uv 版本漂移了；显式写死 3.11 与 pyproject.toml 的 target-version 对齐。
        Invoke-Native $uvExe venv $VENV --python $Python
    }
    if (-not (Test-Path $VENV_PY)) {
        throw ".venv 建好了但找不到 $VENV_PY —— 虚拟环境不完整，加 -Recreate 重来一次。"
    }

    # ── 3. Python 依赖 ───────────────────────────────────────────────
    Write-Step "3/6 Python 依赖（uv pip install）"
    $reqs = @("requirements-dev.txt")
    if ($SkipLogs) {
        Write-Host "  -SkipLogs：跳过 requirements-logs.txt（不装 pyulog）"
    }
    else {
        $reqs += "requirements-logs.txt"
    }
    $pipArgs = @("pip", "install", "--python", $VENV_PY, "--index-url", $IndexUrl)
    foreach ($r in $reqs) { $pipArgs += @("-r", $r) }
    # 显式给 --index-url 而不靠默认值：本机 pip 配的是 aliyun 的 **HTTP** 镜像
    # （pip 判它不安全），uv 现在不读 pip.ini，但把源写死在命令里，换台机器也是同一结果。
    Invoke-Native $uvExe @pipArgs

    # ── 4. Node 依赖 ─────────────────────────────────────────────────
    Write-Step "4/6 Node 依赖（pnpm install）"
    if ($SkipNode) {
        Write-Host "  -SkipNode：跳过"
    }
    else {
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
        if (-not $pnpm) {
            throw "没找到 pnpm。装它后重跑：`n    npm i -g pnpm`n    （或 corepack enable pnpm）"
        }
        # 在仓库根装：根 pnpm-workspace.yaml 只列了 web，装完 web/node_modules 才有东西。
        Invoke-Native "pnpm" install
    }

    # ── 5. Git hook ──────────────────────────────────────────────────
    Write-Step "5/6 Git hook 指向 .githooks"
    if ($SkipHooks) {
        Write-Host "  -SkipHooks：跳过"
    }
    else {
        # 每台机器做一次即可，重复执行是幂等的。放在脚本里的理由：漏了它，pre-commit /
        # pre-push 永远不会跑，而"没跑"和"跑了全绿"在 git 这边长得一模一样。
        Invoke-Native "git" config core.hooksPath .githooks
        Write-Host "  core.hooksPath = $(git config core.hooksPath)"

        # 钩子由 git 用 PATH 上的 python 启动，再靠 .githooks/_venv_python.py 切到 .venv。
        # 这里照 git 的方式真跑一次那个切换，把最终落在哪个解释器上打印出来核对——
        # "钩子悄悄用了另一个 Python"不报错也不失败，只能这样拦。
        $probe = @'
import sys

sys.path.insert(0, ".githooks")
import _venv_python as m


def body():
    print("EXEC=" + sys.executable)
    return 0


sys.exit(m.ensure_venv_python(body))
'@
        if (Get-Command python -ErrorAction SilentlyContinue) {
            # 必须落成文件再跑，不能用 `python -c`：-c 模式下 sys.argv 只有 ['-c']，
            # 而切换解释器就是把整个 argv 交给 .venv 的 python 重跑一遍，
            # 代码本身不在 argv 里，切完就没了（实测：探测静默无输出）。
            $probeFile = Join-Path $ROOT ".workbuddy/tmp/hook_probe.py"
            New-Item -ItemType Directory -Force -Path (Split-Path $probeFile) | Out-Null
            Set-Content -Path $probeFile -Value $probe -Encoding UTF8
            $out = & python $probeFile 2>&1 | Out-String
            Remove-Item -Force $probeFile -ErrorAction SilentlyContinue
            $hookExec = ""
            foreach ($line in ($out -split "`n")) {
                if ($line -match "EXEC=(.+)") { $hookExec = $Matches[1].Trim() }
            }
            if (-not $hookExec) {
                Write-Host "  [WARN] 没能确认钩子切到 .venv（探测没输出），手工核对：$VENV_PY" -ForegroundColor Yellow
            }
            elseif ($hookExec -ieq $VENV_PY) {
                Write-Host "  钩子解释器 = .venv  $hookExec"
            }
            else {
                Write-Host "  [WARN] 钩子切到了别的解释器：$hookExec（期望 $VENV_PY）" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "  [WARN] PATH 上没有 python，跳过钩子解释器核对" -ForegroundColor Yellow
        }
    }

    }  # -CheckOnly 跳过安装步骤（1-5）

    # ── 6. 自检（自闭环）─────────────────────────────────────────────
    # 装什么就验什么：探测逻辑直接写在这里——不调 check_prereq.py / check_all.py，
    # 不读 checklist.yml，setup 不拖外部脚本。探的是"工具能不能跑起来"，不是全量
    # 校验：全量清单（ruff/prettier/tsc/pytest/守卫……）归 check_all.py，装完想验
    # 就手动跑，见末尾提示。
    Write-Step "6/6 自检（装好的工具能不能用）"
    $PRE_FAIL = 0
    function Test-Probe {
        param([string]$Name, [scriptblock]$Body)
        # 探测的输出（stdout + stderr）合流转成字符串：`-m ruff --version` 这类会把版本
        # 打出来，失败时也要把前几行截出来看，所以两种都不丢。
        try {
            $out = (& $Body) 2>&1 | Out-String
            $ok = $LASTEXITCODE -eq 0
        }
        catch {
            $out = $_.Exception.Message
            $ok = $false
        }
        if ($ok) {
            Write-Host "  [OK]   $Name"
        }
        else {
            Write-Host "  [FAIL] $Name"
            foreach ($line in (($out -split "`n") | Select-Object -First 3)) {
                if ($line.Trim()) { Write-Host "         $line" }
            }
            $script:PRE_FAIL++
        }
    }
    Test-Probe "ruff" { & $VENV_PY -m ruff --version }
    Test-Probe "pytest" { & $VENV_PY -m pytest --version }
    Test-Probe "numpy" { & $VENV_PY -c "import numpy" }
    if (-not $SkipLogs) {
        Test-Probe "pyulog" { & $VENV_PY -c "import pyulog" }
        Test-Probe "yaml" { & $VENV_PY -c "import yaml" }
    }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-Host "  [OK]   node  $($node.Source)"
    }
    else {
        Write-Host "  [FAIL] node 不在 PATH 上（装 Node.js 22+ 后重跑）"
        $PRE_FAIL++
    }
    Test-Probe "typescript" {
        # tsc 是 Node 包，用 .venv 的 python 探不了，直接交给 node 跑它的 bin。
        & node (Join-Path $ROOT "web/node_modules/typescript/bin/tsc") --version
    }
    Test-Probe "next" { if (-not (Test-Path (Join-Path $ROOT "web/node_modules/next/package.json"))) { throw "web/node_modules/next 不在" } }
    if ($PRE_FAIL -gt 0) {
        throw "自检 $PRE_FAIL 项失败。Python 侧缺包：uv pip install --python `"$VENV_PY`" -r requirements-dev.txt；Node 侧缺包：pnpm install"
    }

    Write-Host ""
    Write-Host "环境就绪。接下来：" -ForegroundColor Green
    Write-Host "  1) 复制环境变量模板：cp web/.env.example web/.env.local（填 DEEPSEEK_API_KEY）"
    Write-Host "  2) 起开发服务器：    pnpm web:dev"
    Write-Host "  3) 全量校验：        $VENV_PY tools/ci/check_all.py --stage push"
    Write-Host ""
    Write-Host "  校验必须用 .venv 里的 python：check_all.py 走 sys.executable -m ruff，而裸 python"
    Write-Host "  在这台机器上解析到没有 ruff 的托管 3.13（第 6 步的探测都是用 .venv 的解释器跑的）。激活方式："
    Write-Host "    . .\.venv\Scripts\Activate.ps1    （或直接用上面的绝对路径）"
    if (-not $SkipLogs) {
        Write-Host ""
        Write-Host "  pyulog 没钉版本（与浏览器侧 micropip 现装保持一致），已知代价：" -ForegroundColor Yellow
        Write-Host "  6 条冻结基线是 1.1.0 冻的，compare_baseline.py 可能 6/6 红。"
        Write-Host "  二选一：钉回 pyulog==1.1.0，或重冻基线 python tools/engine/dump_baseline.py"
    }
}
catch {
    Write-Host ""
    Write-Host "安装未完成：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
exit 0
