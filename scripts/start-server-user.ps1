# بدون نیاز به Administrator — فقط اجرای سرور (فایروال را دستی باز کنید)
$ErrorActionPreference = "Stop"
$LanShare = Join-Path $PSScriptRoot ".."
$LanShare = (Resolve-Path $LanShare).Path
$Port = 5080
$ApiPath = Join-Path $LanShare "backend\LanShare.Api"
$FrontPath = Join-Path $LanShare "frontend"

$dotnet = if (Get-Command dotnet -ErrorAction SilentlyContinue) { "dotnet" }
else { "C:\Program Files\dotnet\dotnet.exe" }

if (-not (Test-Path $dotnet)) {
    Write-Host "ابتدا .NET 8 SDK را نصب کنید." -ForegroundColor Red
    exit 1
}

Push-Location $FrontPath
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

Push-Location $ApiPath
& $dotnet run -c Release
Pop-Location
