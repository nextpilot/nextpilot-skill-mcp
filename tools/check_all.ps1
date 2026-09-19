# NextPilot Skill local full check script
# This wraps the canonical python tools/ci/check_all.py and adds web-specific checks:
#   - ESLint static analysis
#   - E2E smoke tests (optional, requires dev server)
#
# Usage:
#   .\tools\check_all.ps1                  # base checks + ESLint
#   .\tools\check_all.ps1 -WithE2E         # base checks + ESLint + E2E
#   .\tools\check_all.ps1 -WithBuild       # base checks + ESLint + next build
#   .\tools\check_all.ps1 -SkipLogs        # skip .ulg-dependent checks
param(
    [switch]$WithE2E,
    [switch]$WithBuild,
    [switch]$SkipLogs
)

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $PSScriptRoot
$Failed = @()
$Passed = @()

function Run-Step($Label, $ScriptBlock) {
    Write-Host "  [$Label]" -ForegroundColor Cyan
    try {
        & $ScriptBlock
        if ($LASTEXITCODE -eq 0) {
            $script:Passed += $Label
            Write-Host "    OK" -ForegroundColor Green
        } else {
            $script:Failed += $Label
            Write-Host "    FAIL (exit=$LASTEXITCODE)" -ForegroundColor Red
        }
    } catch {
        $script:Failed += $Label
        Write-Host "    FAIL $_" -ForegroundColor Red
    }
}

# ============================================================
# Group 1: Canonical Python checks (via check_all.py)
# ============================================================
Write-Host "`n=== Group 1: Python canonical checks (check_all.py) ===" -ForegroundColor Yellow

$checkAllArgs = @("tools/ci/check_all.py")
if ($SkipLogs) { $checkAllArgs += "--skip-logs" }
if ($WithBuild) { $checkAllArgs += "--with-build" }

Run-Step "Python CI check_all.py" {
    Push-Location $ROOT
    python @checkAllArgs
    Pop-Location
}

# ============================================================
# Group 2: Web-specific checks (ESLint)
# ============================================================
Write-Host "`n=== Group 2: Web-specific checks ===" -ForegroundColor Yellow

Run-Step "ESLint (eslint .)" {
    Push-Location (Join-Path $ROOT "web")
    pnpm exec eslint . --max-warnings 50
    Pop-Location
}

# ============================================================
# Group 3: E2E smoke tests (optional, needs dev server)
# ============================================================
if ($WithE2E) {
    Write-Host "`n=== Group 3: E2E Smoke Tests ===" -ForegroundColor Yellow

    Run-Step "E2E pages (key page render)" {
        Push-Location (Join-Path $ROOT "web")
        pnpm exec playwright test pages.spec.ts
        Pop-Location
    }

    Run-Step "E2E analyze flow" {
        Push-Location (Join-Path $ROOT "web")
        pnpm exec playwright test analyze.spec.ts
        Pop-Location
    }
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n=== Check Summary ===" -ForegroundColor Yellow
Write-Host "  Passed: $($Passed.Count) items" -ForegroundColor Green
if ($Passed.Count) { $Passed | ForEach-Object { Write-Host "    + $_" -ForegroundColor Green } }

if ($Failed.Count) {
    Write-Host "  Failed: $($Failed.Count) items" -ForegroundColor Red
    $Failed | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
}

if ($Failed.Count -gt 0) {
    Write-Host "`n$($Failed.Count) check(s) failed. Please fix and retry." -ForegroundColor Red
    exit 1
}

Write-Host "`nAll checks passed!" -ForegroundColor Green
exit 0