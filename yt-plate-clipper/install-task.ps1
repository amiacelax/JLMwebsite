# Register the YT Plate Clipper as a Windows Scheduled Task (no always-on process).
#
# Runs `watch.py --once` at:
#   * Mon-Fri 10:30 AM  -> transcribe any lessons JD approved
#   * Fri 1:30 PM       -> weekly check (list the folder + ping). Must match
#                          DIGEST_WEEKDAY/HOUR/MINUTE in config.py (Fri 13:30).
# If the PC was off at those times, Windows runs it when the PC is next available.
# Works with Cursor closed. No admin needed. Re-run to update; -Uninstall to remove.
#
#   Install:   powershell -ExecutionPolicy Bypass -File install-task.ps1
#   Remove:    powershell -ExecutionPolicy Bypass -File install-task.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$TaskName = "YT Plate Clipper"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed task: $TaskName"
    } else { Write-Host "No task named '$TaskName' to remove." }
    return
}

$py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command python.exe).Source }

$action = New-ScheduledTaskAction -Execute $py -Argument "watch.py --once" -WorkingDirectory $here

$weekdays = New-ScheduledTaskTrigger -Weekly -At "10:30AM" `
    -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday
$friday = New-ScheduledTaskTrigger -Weekly -At "1:30PM" -DaysOfWeek Friday

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($weekdays, $friday) `
    -Settings $settings -Principal $principal -Force `
    -Description "YT Plate Clipper: Mon-Fri 10:30 process approved lessons; Fri 13:30 weekly check." | Out-Null

Write-Host "Installed '$TaskName': Mon-Fri 10:30 AM + Fri 1:30 PM (runs once, then exits)."
