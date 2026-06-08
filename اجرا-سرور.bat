@echo off
chcp 65001 >nul
title LanShare Server
set "DOTNET=C:\Program Files\dotnet\dotnet.exe"
if not exist "%DOTNET%" set DOTNET=dotnet

cd /d "%~dp0backend\LanShare.Api"
echo.
echo ========================================
echo   LanShare - سرور اشتراک فایل
echo ========================================
echo.
echo در حال راه‌اندازی...
echo بعد از بالا آمدن، این آدرس را در مرورگر گوشی بزنید:
echo.

for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -ExpandProperty IPAddress"') do (
  echo   http://%%i:5080
)
echo   http://localhost:5080
echo.
echo برای توقف: Ctrl+C
echo ========================================
echo.

"%DOTNET%" run -c Release
pause
