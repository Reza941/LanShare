@echo off
chcp 65001 >nul
:: این فایل را یک بار با کلیک راست ^> Run as administrator اجرا کنید
netsh advfirewall firewall add rule name="LanShare-TCP-5080" dir=in action=allow protocol=TCP localport=5080
if %errorlevel%==0 (
  echo پورت 5080 در فایروال باز شد.
) else (
  echo خطا. حتماً Run as administrator بزنید.
)
pause
