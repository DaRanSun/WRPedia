$ErrorActionPreference = 'Continue'

$root = 'C:\Users\Daran\Desktop\WRpedia'
$port = 8765
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$tmpProfile = Join-Path $env:TEMP 'wrpedia_chrome_profile'

$server = Start-Process python -ArgumentList @('-m', 'http.server', "$port", '--bind', '127.0.0.1') -WorkingDirectory $root -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

try {
    & $chrome --headless=new --disable-gpu --no-first-run "--user-data-dir=$tmpProfile" --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:$port/stats.html" 2>&1 |
        Set-Content (Join-Path $env:TEMP 'wr_stats_dom.html') -Encoding UTF8
    & $chrome --headless=new --disable-gpu --no-first-run "--user-data-dir=$tmpProfile" --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:$port/schedule.html" 2>&1 |
        Set-Content (Join-Path $env:TEMP 'wr_schedule_dom.html') -Encoding UTF8
} finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}

$stats = Get-Content (Join-Path $env:TEMP 'wr_stats_dom.html') -Raw -Encoding UTF8
$schedule = Get-Content (Join-Path $env:TEMP 'wr_schedule_dom.html') -Raw -Encoding UTF8

Write-Output "stats contains champion table: $($stats.Contains('Picks'))"
Write-Output "stats contains summary chips: $($stats.Contains('stat-chip'))"
Write-Output "stats contains unpicked grid: $($stats.Contains('unpicked-grid'))"
Write-Output "schedule contains first match: $($schedule.Contains('W1M1'))"
Write-Output "schedule contains week date: $($schedule.Contains('2026-08-21'))"
Write-Output "schedule contains standings: $($schedule.Contains('TT') -and $schedule.Contains('0-0'))"
