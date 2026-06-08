#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$LanShare = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$Port = 5080
$ApiPath = Join-Path $LanShare "backend\LanShare.Api"
$FrontPath = Join-Path $LanShare "frontend"

Write-Host "=== LanShare - راه‌اندازی سرور ===" -ForegroundColor Cyan

$dotnet = "dotnet"
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    $dotnetPath = "C:\Program Files\dotnet\dotnet.exe"
    if (Test-Path $dotnetPath) { $dotnet = $dotnetPath } else {
        Write-Host "خطا: .NET SDK نصب نیست. از winget نصب کنید: winget install Microsoft.DotNet.SDK.8" -ForegroundColor Red
        exit 1
    }
}

Write-Host "ساخت دیتابیس (در صورت نیاز)..." -ForegroundColor Yellow
sqlcmd -S "localhost" -C -Q "IF DB_ID('LanShare') IS NULL CREATE DATABASE LanShare;" -b | Out-Null

Write-Host "ساخت فرانت‌اند..." -ForegroundColor Yellow
Push-Location $FrontPath
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

Write-Host "ساخت بک‌اند..." -ForegroundColor Yellow
Push-Location $ApiPath
& $dotnet publish -c Release -o ./publish
Pop-Location

Write-Host "باز کردن پورت فایروال ($Port)..." -ForegroundColor Yellow
$ruleName = "LanShare-TCP-$Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
}

$ips = @()
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown"
} | ForEach-Object { $ips += $_.IPAddress }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  سرور آماده است! این آدرس‌ها را در مرورگر گوشی بزنید:" -ForegroundColor Green
Write-Host "  http://localhost:$Port" -ForegroundColor White
foreach ($ip in $ips | Select-Object -Unique) {
    Write-Host "  http://${ip}:$Port" -ForegroundColor White
}
Write-Host "========================================" -ForegroundColor Green
Write-Host "برای توقف: Ctrl+C" -ForegroundColor Gray
Write-Host ""

Push-Location (Join-Path $ApiPath "publish")
$env:ASPNETCORE_ENVIRONMENT = "Production"
& $dotnet LanShare.Api.dll
Pop-Location
