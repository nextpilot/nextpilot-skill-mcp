# 开发机上的 Windows 包装脚本 —— 只做一件事：把开关翻译成 --stage，转调 check_all.py。
#
# 为什么不在这里再写一遍 eslint / E2E 的命令：那样等于给同一批检查建第二个事实源，
# 两处必然漂移，最后变成"哪个绿算绿"说不清。检查内容全部由 tools/ci/checklist.yml 决定，
# 这个脚本只决定跑哪个阶段。
#
# 用法：
#   .\tools\ci\check_all.ps1                  # push 阶段（本地快检，秒级）
#   .\tools\ci\check_all.ps1 -Stage ci        # ci 阶段（云端那批）
#   .\tools\ci\check_all.ps1 -Stage push,ci   # 两者都跑
#   .\tools\ci\check_all.ps1 -WithBuild       # 额外加 build 阶段（next build，约 144s）
#   .\tools\ci\check_all.ps1 -WithE2E         # 额外跑 E2E 冒烟（--with-e2e 是步骤级开关）
#   .\tools\ci\check_all.ps1 -SkipLogs        # 跳过依赖 .ulg 的那几项
param(
    [string[]]$Stage = @("push"),
    [switch]$WithBuild,
    [switch]$WithE2E,
    [switch]$SkipLogs
)

$ErrorActionPreference = "Continue"
# 本脚本住在 tools/ci/ 下，所以仓库根要往上两级（tools/ci -> tools -> 仓库根）。
$ROOT = (Get-Item $PSScriptRoot).Parent.Parent.FullName

$stages = @($Stage)
if ($WithBuild -and ($stages -notcontains "build")) {
    $stages += "build"
}

$checkAllArgs = @("tools/ci/check_all.py", "--stage", ($stages -join ","))
if ($WithE2E) { $checkAllArgs += "--with-e2e" }
if ($SkipLogs) { $checkAllArgs += "--skip-logs" }

Write-Host "`n=== check_all.py --stage $($stages -join ',') ===" -ForegroundColor Yellow

Push-Location $ROOT
python @checkAllArgs
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) {
    Write-Host "`nCheck(s) failed (exit=$code). Fix and retry." -ForegroundColor Red
    exit $code
}

Write-Host "`nAll checks passed!" -ForegroundColor Green
exit 0
