# ============================================================
# JAPA DTR Sync Bridge — Windows Task Scheduler Installer
# Run this once as Administrator to install the auto-start service
# ============================================================

$taskName    = "JAPA-DTR-SyncBridge"
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExe   = Join-Path $projectRoot "sync-bridge\venv\Scripts\pythonw.exe"
$bridgeScript = Join-Path $projectRoot "sync-bridge\bridge.py"
$logFile     = Join-Path $projectRoot "sync-bridge\bridge.log"

Write-Host "Installing JAPA DTR Sync Bridge as a Windows Scheduled Task..." -ForegroundColor Cyan

# Remove existing task if present
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "  Removed old task." -ForegroundColor Yellow
}

# Action: run pythonw.exe (no console window) with bridge.py
$action = New-ScheduledTaskAction `
    -Execute $pythonExe `
    -Argument "`"$bridgeScript`"" `
    -WorkingDirectory (Join-Path $projectRoot "sync-bridge")

# Trigger 1: At system startup
$triggerBoot = New-ScheduledTaskTrigger -AtStartup

# Trigger 2: Immediately (run now)
$triggerNow = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)

# Settings: restart on failure, run whether logged in or not
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Principal: run as current user (interactive logon — no admin needed)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($triggerBoot, $triggerNow) `
    -Settings $settings `
    -Principal $principal `
    -Description "JAPA DTR sync bridge — polls FingerTec TA500 and pushes attendance to Supabase" `
    -Force

Write-Host ""
Write-Host "✅ JAPA DTR Sync Bridge installed!" -ForegroundColor Green
Write-Host "   Task name : $taskName"
Write-Host "   Auto-start: Yes (on every Windows boot)"
Write-Host "   Runs as   : $env:USERNAME"
Write-Host "   Log file  : $logFile"
Write-Host ""
Write-Host "The bridge will start in 5 seconds and run in the background." -ForegroundColor Green
Write-Host "You can close Antigravity — it will keep syncing automatically." -ForegroundColor Green
Write-Host ""
Write-Host "To check status : Get-ScheduledTask -TaskName '$taskName'"
Write-Host "To stop bridge  : Stop-ScheduledTask -TaskName '$taskName'"
Write-Host "To uninstall    : Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
