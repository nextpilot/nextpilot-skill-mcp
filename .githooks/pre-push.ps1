# Pre-push check for Windows (PowerShell)
# Called from the pre-push git hook

$ErrorActionPreference = "Stop"
$WebRoot = Join-Path $PSScriptRoot "..\web"

Write-Host "" 
Write-Host "===== 1/3: knowledge build =====" -ForegroundColor Cyan
Push-Location $WebRoot
node scripts/build-knowledge.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: build-knowledge.mjs" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "===== 2/3: TypeScript type check =====" -ForegroundColor Cyan
pnpm exec tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: tsc" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "===== 3/3: E2E tests =====" -ForegroundColor Cyan
if ($env:SKIP_LOG_ANALYSIS -eq "1") {
    Write-Host "  SKIP_LOG_ANALYSIS=1, skipping log analysis test" -ForegroundColor Yellow
    pnpm exec playwright test --grep-invert "日志分析流程"
} else {
    pnpm exec playwright test
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "FAIL: E2E tests" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host ""
Write-Host "===== All checks passed =====" -ForegroundColor Green