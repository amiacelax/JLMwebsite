# Registers Windows Scheduled Tasks for the lesson uploader (Cursor closed; no admin needed).
#
#   YT Lesson Uploader       — daily 3:45 PM (daytime lessons + calendar wait)
#   YT Lesson Uploader Night — daily 11:30 PM (Faye / Benjamin / other night slots)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-task.ps1
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -Uninstall
param([switch]$Uninstall)

$dayName = "YT Lesson Uploader"
$nightName = "YT Lesson Uploader Night"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = (Get-Command pythonw.exe -ErrorAction Stop).Source

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $dayName -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $nightName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed '$dayName' and '$nightName'"
    return
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 8)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$dayAction = New-ScheduledTaskAction -Execute $py -Argument "run.py once" -WorkingDirectory $dir
$dayTrigger = New-ScheduledTaskTrigger -Daily -At 3:45PM
Register-ScheduledTask -TaskName $dayName -Action $dayAction -Trigger $dayTrigger `
    -Settings $settings -Principal $principal -Force `
    -Description "Upload daytime YouTube Straight lessons (calendar wait)." | Out-Null

$nightAction = New-ScheduledTaskAction -Execute $py -Argument "run.py once --no-wait" -WorkingDirectory $dir
$nightTrigger = New-ScheduledTaskTrigger -Daily -At 11:30PM
Register-ScheduledTask -TaskName $nightName -Action $nightAction -Trigger $nightTrigger `
    -Settings $settings -Principal $principal -Force `
    -Description "Upload night YouTube Straight lessons once at 11:30 PM (no calendar wait)." | Out-Null

Write-Host "Installed '$dayName': daily 3:45 PM -> run.py once"
Write-Host "Installed '$nightName': daily 11:30 PM -> run.py once --no-wait"
Get-ScheduledTask -TaskName $dayName, $nightName | Get-ScheduledTaskInfo |
    Select-Object TaskName, NextRunTime | Format-Table -AutoSize
