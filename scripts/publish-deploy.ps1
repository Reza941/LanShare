$ErrorActionPreference = "Stop"
$LanShare = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputDir = Join-Path $LanShare "deploy"
$ApiPath = Join-Path $LanShare "backend\LanShare.Api"

# Clean output
if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }

Write-Host "=== Building deployable package ===" -ForegroundColor Cyan

# 1. Build frontend (output goes to wwwroot)
Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
Push-Location (Join-Path $LanShare "frontend")
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

# 2. Publish backend (includes all dependencies)
Write-Host "[2/3] Publishing backend..." -ForegroundColor Yellow
Push-Location $ApiPath
dotnet publish -c Release -o $OutputDir
if ($LASTEXITCODE -ne 0) { Write-Host "Publish failed!" -ForegroundColor Red; exit 1 }
Pop-Location
Copy-Item (Join-Path $ApiPath "appsettings.json") (Join-Path $OutputDir "appsettings.json") -Force

# 3. Copy wwwroot (frontend) — publish output doesn't include wwwroot
Write-Host "[3/3] Copying frontend files..." -ForegroundColor Yellow
Copy-Item -Recurse (Join-Path $ApiPath "wwwroot") (Join-Path $OutputDir "wwwroot")

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Package ready!" -ForegroundColor Green
Write-Host "  Location: $OutputDir" -ForegroundColor White
Write-Host "  Size: $((Get-ChildItem $OutputDir -Recurse | Measure-Object Length -Sum).Sum / 1MB -as [int]) MB" -ForegroundColor White
Write-Host ""
Write-Host "  To deploy on another Windows PC:" -ForegroundColor White
Write-Host "  1. Copy the 'deploy' folder to the target PC" -ForegroundColor White
Write-Host "  2. Install on target PC:" -ForegroundColor White
Write-Host "     - .NET 8 Runtime (dotnet.microsoft.com)" -ForegroundColor White
Write-Host "     - SQL Server Express (aka.ms/ssms)" -ForegroundColor White
Write-Host "  3. On target PC, run: .\start-server.ps1" -ForegroundColor White
Write-Host "  4. Open http://localhost:5080 in browser" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
