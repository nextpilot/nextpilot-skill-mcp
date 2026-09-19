# Pre-push check for Windows (PowerShell)
# Single entry: check_all.py --with-e2e
#   SKIP_LOG_ANALYSIS=1 git push  # skip log-analysis smoke E2E
#   SKIP_E2E=1 git push           # skip E2E entirely

$ErrorActionPreference = "Stop"
$RepoRoot = Join-Path $PSScriptRoot ".."

Push-Location $RepoRoot

if ($env:SKIP_E2E -eq "1") {
    Write-Host "`nSKIP_E2E=1: check_all.py only (no E2E)" -ForegroundColor Yellow
    python tools/ci/check_all.py
} else {
    Write-Host "`n===== pre-push check (check_all.py --with-e2e) =====" -ForegroundColor Cyan
    python tools/ci/check_all.py --with-e2e
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFAIL: pre-push check failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host "`n===== All checks passed =====" -ForegroundColor Green