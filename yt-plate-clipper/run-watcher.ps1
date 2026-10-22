# Launch the YT Plate Clipper watcher (service loop).
# Called by the Scheduled Task at logon; also runnable by hand for a quick start.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

# Prefer pythonw (no console window) for the background service; fall back to python.
$py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command python.exe -ErrorAction SilentlyContinue).Source }
if (-not $py) { $py = "python" }

Write-Host "Starting YT Plate Clipper watcher with: $py"
& $py "watch.py" @args
