$ApiUrl = "http://localhost:5080/api/console"
$ProjectRoot = "D:\APP\Cursor test\LanShare"
$Frontend = Join-Path $ProjectRoot "frontend"
$Backend = Join-Path $ProjectRoot "backend\LanShare.Api"
$PublishDir = Join-Path $Backend "publish"
$TriggerFile = Join-Path $ProjectRoot "console_pending.txt"

Write-Host "LanShare Console Watcher started..." -ForegroundColor Cyan

while ($true) {
    try {
        $data = curl.exe -s "$ApiUrl/pending" 2>$null | ConvertFrom-Json
        $instruction = $data.instruction

        if ($instruction -and ![string]::IsNullOrWhiteSpace($instruction) -and !$data.response) {
            Write-Host "`n=== New Instruction ===" -ForegroundColor Green
            Write-Host $instruction -ForegroundColor White
            Write-Host "Writing to trigger file..." -ForegroundColor Yellow
            $instruction | Out-File -FilePath $TriggerFile -Encoding UTF8

            # wait a bit for processing
            Start-Sleep -Seconds 10

            # check if response arrived
            $check = curl.exe -s "$ApiUrl/pending" 2>$null | ConvertFrom-Json
            if ($check.response) {
                Write-Host "Response: $($check.response)" -ForegroundColor Cyan
                if (Test-Path $TriggerFile) { Remove-Item $TriggerFile }
            }
        }
    } catch {
        # silent
    }
    Start-Sleep -Seconds 3
}
