# One-shot dev environment setup: Python via uv, Node via pnpm.
#
# What to install is decided by requirements-dev.txt; this script only
# decides where and how to install, and how to verify.
# The self-check at the end is self-contained: probe logic is inline, no
# external scripts or config files are called.
#
# Usage:
#   .\tools\setup\setup.ps1                  # full: Python + Node + git hook + self-check
#   .\tools\setup\setup.ps1 -SkipNode        # Python only (Node dependencies already installed)
#   .\tools\setup\setup.ps1 -SkipHooks       # skip git core.hooksPath
#   .\tools\setup\setup.ps1 -Recreate        # delete existing .venv and recreate
#   .\tools\setup\setup.ps1 -InstallUv       # allow this script to install uv online (default: print command only)
#   .\tools\setup\setup.ps1 -CheckOnly       # skip install steps, self-check only
#   .\tools\setup\setup.ps1 -IndexUrl https://mirrors.aliyun.com/pypi/simple/
#   $env:CI=1 .\tools\setup\setup.ps1        # CI mode: pip install + pnpm --frozen-lockfile + playwright
param(
    [switch]$SkipNode,
    [switch]$SkipHooks,
    [switch]$Recreate,
    [switch]$InstallUv,
    [switch]$CheckOnly,
    [switch]$CI,
    [string]$Python = "3.11",
    [string]$IndexUrl = "https://pypi.org/simple"
)

$IsCI = $env:CI -eq "true" -or $env:CI -eq "1" -or $CI
if ($IsCI) { $SkipHooks = $true }

# Use Continue instead of Stop: uv/pnpm write progress to stderr; Stop would treat
# any stderr output as failure. Each step checks $LASTEXITCODE on its own.
$ErrorActionPreference = "Continue"

$ROOT = (Get-Item $PSScriptRoot).Parent.Parent.FullName
# .venv lives at repo root: pyrightconfig.json hardcodes venvPath "." + venv ".venv".
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
    # Redirect 2>&1 then pipe: uv/pnpm write progress to stderr; redirecting prevents
    # PowerShell from misinterpreting stderr as failure. Only $LASTEXITCODE decides.
    & $Exe @ExeArgs 2>&1 | ForEach-Object { Write-Host "  $_" }
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw "Command failed (exit=$code): $Exe $($ExeArgs -join ' ')"
    }
}

Push-Location $ROOT
try {
    # -CheckOnly: skip install steps (1-5), go straight to self-check.
    if ($CheckOnly) {
        Write-Host "-CheckOnly: skipping install steps, self-check only"
    }
    elseif ($IsCI) {
        # ── CI mode: Python/Node/pnpm already set up by actions/setup-* ──
        $VENV_PY = (Get-Command python -ErrorAction SilentlyContinue).Source
        if (-not $VENV_PY) { $VENV_PY = (Get-Command python3 -ErrorAction SilentlyContinue).Source }

        Write-Step "1/3 Python check tools (pip install -r requirements-dev.txt)"
        Invoke-Native $VENV_PY -m pip install -r requirements-dev.txt

        Write-Step "2/3 Node dependencies (pnpm install --frozen-lockfile)"
        if (-not $SkipNode) {
            Invoke-Native pnpm install --frozen-lockfile
        } else {
            Write-Host "  -SkipNode: skipped"
        }

        Write-Step "3/3 Playwright browsers"
        Invoke-Native pnpm exec playwright install --with-deps chromium
    }
    else {

    # ── 1. uv ────────────────────────────────────────────────────────
    Write-Step "1/6 uv (Python package manager)"
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $uv) {
        if ($InstallUv) {
            Write-Host "  uv not on PATH, installing via winget:"
            Invoke-Native winget install --id astral-sh.uv -e --accept-source-agreements --accept-package-agreements
            $uvPath = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
            if (Test-Path $uvPath) {
                $uv = Get-Command $uvPath
            }
        }
        if (-not $uv) {
            throw "uv not found. Install it then re-run this script:`n" +
            "    winget install --id astral-sh.uv -e`n" +
            "    irm https://astral.sh/uv/install.ps1 | iex`n" +
            "  (add -InstallUv to let this script try the first option. winget-installed uv needs a terminal restart to appear on PATH.)"
        }
    }
    $uvExe = $uv.Source
    Write-Host "  uv: $uvExe"
    & $uvExe --version

    # ── 2. Virtual environment ──────────────────────────────────────────
    Write-Step "2/6 Python venv ($VENV)"
    if ((Test-Path $VENV) -and $Recreate) {
        Write-Host "  -Recreate: removing existing .venv"
        Remove-Item -Recurse -Force $VENV
    }
    if (Test-Path $VENV_PY) {
        Write-Host "  reusing existing .venv (add -Recreate to rebuild)"
    }
    else {
        # Pin 3.11 to match pyproject.toml target-version.
        Invoke-Native $uvExe venv $VENV --python $Python
    }
    if (-not (Test-Path $VENV_PY)) {
        throw ".venv created but $VENV_PY not found - venv is incomplete, add -Recreate and retry."
    }

    # ── 3. Python dependencies ───────────────────────────────────────────
    Write-Step "3/6 Python dependencies (uv pip install)"
    $pipArgs = @("pip", "install", "--python", $VENV_PY, "--index-url", $IndexUrl, "-r", "requirements-dev.txt")
    Invoke-Native $uvExe @pipArgs

    # ── 4. Node dependencies ─────────────────────────────────────────────
    Write-Step "4/6 Node dependencies (pnpm install)"
    if ($SkipNode) {
        Write-Host "  -SkipNode: skipped"
    }
    else {
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
        if (-not $pnpm) {
            throw "pnpm not found. Install it then re-run:`n    npm i -g pnpm`n    (or corepack enable pnpm)"
        }
        Invoke-Native "pnpm" install
    }

    # ── 5. Git hook ──────────────────────────────────────────────────────
    Write-Step "5/6 Git hook (core.hooksPath -> .githooks)"
    if ($SkipHooks) {
        Write-Host "  -SkipHooks: skipped"
    }
    else {
        Invoke-Native "git" config core.hooksPath .githooks
        Write-Host "  core.hooksPath = $(git config core.hooksPath)"

        # Verify the hook interpreter switcher lands on .venv.
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
                Write-Host "  [WARN] could not confirm hook lands on .venv (no probe output), manually check: $VENV_PY" -ForegroundColor Yellow
            }
            elseif ($hookExec -ieq $VENV_PY) {
                Write-Host "  hook interpreter = .venv  $hookExec"
            }
            else {
                Write-Host "  [WARN] hook landed on a different interpreter: $hookExec (expected $VENV_PY)" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "  [WARN] python not on PATH, skipping hook interpreter check" -ForegroundColor Yellow
        }
    }

    }  # -CheckOnly skips install steps (1-5)

    # ── 6. Self-check ─────────────────────────────────────────────
    Write-Step "6/6 Self-check (do installed tools work?)"
    $PRE_FAIL = 0
    function Test-Probe {
        param([string]$Name, [scriptblock]$Body)
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
    Test-Probe "pyulog" { & $VENV_PY -c "import pyulog" }
    Test-Probe "yaml" { & $VENV_PY -c "import yaml" }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-Host "  [OK]   node  $($node.Source)"
    }
    else {
        Write-Host "  [FAIL] node not on PATH (install Node.js 22+ and re-run)"
        $PRE_FAIL++
    }
    Test-Probe "typescript" {
        & node (Join-Path $ROOT "web/node_modules/typescript/bin/tsc") --version
    }
    Test-Probe "next" { if (-not (Test-Path (Join-Path $ROOT "web/node_modules/next/package.json"))) { throw "web/node_modules/next not found" } }
    if ($PRE_FAIL -gt 0) {
        throw "Self-check: $PRE_FAIL item(s) failed. Python missing: uv pip install --python `"$VENV_PY`" -r requirements-dev.txt; Node missing: pnpm install"
    }

    if (-not $IsCI) {
        Write-Host ""
        Write-Host "Environment ready. Next:" -ForegroundColor Green
        Write-Host "  1) Copy env template: cp web/.env.example web/.env.local (fill DEEPSEEK_API_KEY)"
        Write-Host "  2) Start dev server:  pnpm web:dev"
    }
}
catch {
    Write-Host ""
    Write-Host "Setup incomplete: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
exit 0