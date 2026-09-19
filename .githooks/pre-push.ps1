# Pre-push check for Windows (PowerShell)
# Called from the pre-push git hook

$ErrorActionPreference = "Stop"
$WebRoot = Join-Path $PSScriptRoot "..\web"

Write-Host "" 
Write-Host "===== 1/4: knowledge build =====" -ForegroundColor Cyan
Push-Location $WebRoot
node scripts/build-knowledge.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: build-knowledge.mjs" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "===== 2/4: TypeScript type check =====" -ForegroundColor Cyan
pnpm exec tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: tsc" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "===== 3/4: unit tests (pytest: engine operators, CEL sandbox) =====" -ForegroundColor Cyan
Push-Location $PSScriptRoot/.. | Out-Null
python -m pytest engine/tests
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: pytest" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green
Pop-Location

Write-Host ""
Write-Host "===== 4/4: smoke E2E (@smoke: upload .ulg -> parse -> display) =====" -ForegroundColor Cyan
if ($env:SKIP_LOG_ANALYSIS -eq "1") {
    Write-Host "  SKIP_LOG_ANALYSIS=1: skipping log-analysis smoke tests" -ForegroundColor Yellow
    pnpm exec playwright test --grep '@smoke' --grep-invert "日志分析流程"
} else {
    pnpm exec playwright test --grep '@smoke'
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "FAIL: smoke E2E" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host ""
Write-Host "===== All checks passed =====" -ForegroundColor Green