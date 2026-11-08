# 到点 · 后端开发启动脚本（Windows / PowerShell）
# 用法：
#   .\scripts\dev.ps1              # 8000 端口，热重载
#   .\scripts\dev.ps1 -Port 8010   # 换端口
#   .\scripts\dev.ps1 -NoReload    # 录制演示时关掉热重载
param(
    [int]$Port = 8000,
    [switch]$NoReload
)

$ErrorActionPreference = "Stop"

$backend = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $backend

if (-not (Test-Path (Join-Path $backend ".venv"))) {
    uv sync
}

$uvicornArgs = @("run", "uvicorn", "app.main:app", "--port", "$Port")
if (-not $NoReload) { $uvicornArgs += "--reload" }

Write-Host "到点后端启动： http://127.0.0.1:$Port/api/health" -ForegroundColor Green
Write-Host "接口文档：     http://127.0.0.1:$Port/docs" -ForegroundColor DarkGray

& uv @uvicornArgs
