# Registers the 9 PM Japan-time check: is tomorrow still the same?
# The PC clock is Japan time. Runs with Cursor closed; no admin needed.
#   powershell -ExecutionPolicy Bypass -File install-tomorrow-task.ps1
#   powershell -ExecutionPolicy Bypass -File install-tomorrow-task.ps1 -Uninstall
param([switch]$Uninstall)

$name = "JLM Calendar Tomorrow Check"
if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed '$name'"
    return
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = (Get-Command pythonw.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $py -Argument "tomorrow_check.py" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At 9:00PM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Installed '$name': daily 9:00 PM -> $py tomorrow_check.py (in $dir)"
Get-ScheduledTask -TaskName $name | Get-ScheduledTaskInfo | Select-Object NextRunTime | Format-List
