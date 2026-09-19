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
Write-Host "===== 3/3: 单元测试（pytest，算子 / CEL 沙箱）=====" -ForegroundColor Cyan
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
Write-Host "===== 4/4: 冒烟 E2E（@smoke：上传 .ulg → 解析 → 显示，主干用例）=====" -ForegroundColor Cyan
if ($env:SKIP_LOG_ANALYSIS -eq "1") {
    Write-Host "  SKIP_LOG_ANALYSIS=1：跳过真实日志分析的冒烟用例" -ForegroundColor Yellow
    pnpm exec playwright test --grep '@smoke' --grep-invert "日志分析流程"
} else {
    pnpm exec playwright test --grep '@smoke'
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "FAIL: 冒烟 E2E" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host ""
Write-Host "===== All checks passed =====" -ForegroundColor Green