# Sets up JAPA DTR Sync Bridge to auto-start with Windows in the background
$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "JAPA-DTR-SyncBridge.lnk"

$projectRoot = Split-Path -Parent $PSScriptRoot
$targetVbs = Join-Path $projectRoot "sync-bridge\run-bridge.vbs"
$workingDir = Join-Path $projectRoot "sync-bridge"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$targetVbs`""
$Shortcut.WorkingDirectory = $workingDir
$Shortcut.Description = "JAPA DTR Biometric Sync Bridge Daemon"
$Shortcut.WindowStyle = 7 # Minimized/Hidden
$Shortcut.Save()

Write-Host "✅ Autostart configured successfully!" -ForegroundColor Green
Write-Host "   Shortcut location: $shortcutPath"
Write-Host "   Target: $targetVbs"
Write-Host "The bridge will now start automatically whenever Windows logs in, without needing Antigravity open."

