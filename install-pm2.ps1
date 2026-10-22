$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pm2Path = (Get-Command pm2.cmd -ErrorAction Stop).Source
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'reports') -Force | Out-Null
$oldTask = Get-ScheduledTask -TaskName 'JustoHorariosBot' -ErrorAction SilentlyContinue
if ($oldTask) { Stop-ScheduledTask -TaskName 'JustoHorariosBot' }
try {
    # Stop only the previous scheduler from this project, if its wrapper left it running.
    $lockPath = Join-Path $PSScriptRoot 'reports\scheduler.lock'
    if ($oldTask -and (Test-Path -LiteralPath $lockPath)) {
        $schedulerPid = [int](Get-Content -LiteralPath $lockPath -Raw)
        $previous = Get-CimInstance Win32_Process -Filter "ProcessId=$schedulerPid"
        $expectedScript = Join-Path $PSScriptRoot 'scheduler.js'
        if ($previous -and $previous.CommandLine.Contains($expectedScript)) {
            Stop-Process -Id $schedulerPid -Force
            Wait-Process -Id $schedulerPid -Timeout 10 -ErrorAction SilentlyContinue
        }
    }
    & $pm2Path startOrRestart (Join-Path $PSScriptRoot 'ecosystem.config.cjs') --only justo-bot --update-env
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar justo-bot en PM2.' }
    & $pm2Path save
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar la lista de PM2.' }
    if ($oldTask) { Unregister-ScheduledTask -TaskName 'JustoHorariosBot' -Confirm:$false }
    & $pm2Path describe justo-bot
} catch {
    if ($oldTask) { Start-ScheduledTask -TaskName 'JustoHorariosBot' }
    throw
}
