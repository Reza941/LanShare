#Requires -RunAsAdministrator
<#
.SYNOPSIS
    LanShare را به عنوان Scheduled Task نصب می‌کند.
    با ورود کاربر ویندوز، سرور auto-start می‌شود.
#>
param(
    [switch]$AsSystem  # استفاده از حساب SYSTEM (نیاز به تنظیم SQL Server)
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptRoot "..")
$DeployPath = Join-Path $ProjectRoot "deploy"
$Port = 5080
$TaskName = "LanShare"
$DllName = "LanShare.Api.dll"

Write-Host "=== نصب LanShare به عنوان سرویس خودکار ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check dotnet
$dotnet = if (Get-Command dotnet -ErrorAction SilentlyContinue) { "dotnet" }
else { "C:\Program Files\dotnet\dotnet.exe" }

if (-not (Test-Path $dotnet)) {
    Write-Host "خطا: .NET 8 پیدا نشد. لطفاً ابتدا .NET 8 Runtime را نصب کنید:" -ForegroundColor Red
    Write-Host "  https://dotnet.microsoft.com/en-us/download/dotnet/8.0" -ForegroundColor Yellow
    exit 1
}

# 2. Check deploy path
if (-not (Test-Path (Join-Path $DeployPath $DllName))) {
    Write-Host "خطا: فایل $DllName در $DeployPath پیدا نشد." -ForegroundColor Red
    Write-Host "لطفاً اول اسکریپت publish-deploy.ps1 را اجرا کنید." -ForegroundColor Yellow
    exit 1
}

# 3. Firewall rule
Write-Host "[1/4] تنظیم فایروال..." -ForegroundColor Yellow
$ruleName = "LanShare-TCP-$Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "  قانون فایروال ساخته شد." -ForegroundColor Green
} else {
    Write-Host "  قانون فایروال از قبل وجود دارد." -ForegroundColor Gray
}

# 4. Remove old task if exists
Write-Host "[2/4] حذف Task قدیمی..." -ForegroundColor Yellow
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "  حذف شد." -ForegroundColor Green
}

# 5. Create scheduled task
Write-Host "[3/4] ایجاد Scheduled Task..." -ForegroundColor Yellow

$action = New-ScheduledTaskAction -Execute $dotnet -Argument $DllName -WorkingDirectory $DeployPath

if ($AsSystem) {
    # SYSTEM account — با بوت ویندوز شروع می‌شود
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Write-Host "  حالت: SYSTEM (AtStartup)" -ForegroundColor Gray
} else {
    # کاربر فعلی — با ورود به ویندوز شروع می‌شود
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest
    Write-Host "  حالت: $env:USERNAME (AtLogon)" -ForegroundColor Gray
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit 0

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "  Task '$TaskName' ساخته شد." -ForegroundColor Green

# 6. Start now
Write-Host "[4/4] شروع سرور..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# 7. Check status
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
try { $state = $task.State } catch { $state = "Unknown" }

if ($state -eq "Running") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  نصب با موفقیت انجام شد!" -ForegroundColor Green
    Write-Host "  سرور روی پورت $Port اجرا می‌شود." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "  اخطار: سرور بلافاصله شروع نشد (وضعیت: $state)." -ForegroundColor Yellow
    Write-Host "  با ورود بعدی به ویندوز خودکار شروع می‌شود." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "مدیریت:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName $TaskName" -ForegroundColor White
Write-Host "  Stop-ScheduledTask -TaskName $TaskName" -ForegroundColor White
Write-Host "  Get-ScheduledTask -TaskName $TaskName | fl" -ForegroundColor White
Write-Host "  Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false" -ForegroundColor White
Write-Host ""
Write-Host "آدرس‌ها (با مرورگر گوشی بزن):" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown"
} | ForEach-Object { Write-Host "  http://$($_.IPAddress):$Port" -ForegroundColor White }
Write-Host ""
Write-Host "نکته: برای تست Client Isolation روتر، با لپ‌تاپ دیگه‌ای تو وای‌فای آدرس بالا رو بزن." -ForegroundColor Gray