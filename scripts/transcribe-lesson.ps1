# Transcribe a lesson video with free local Whisper.
# One-time setup:
#   pip install faster-whisper
#
# Usage:
#   .\scripts\transcribe-lesson.ps1 "E:\OBS Recording New\2026-05-22 Ben M 24.mp4"
#   .\scripts\transcribe-lesson.ps1 "E:\OBS Recording New\2026-05-22 Ben M 24.mp4" -Model base

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$VideoPath,

  [ValidateSet("tiny", "base", "small", "medium", "large-v3")]
  [string]$Model = "small",

  [string]$Language = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$pyArgs = @("scripts/transcribe_lesson.py", $VideoPath, "--model", $Model)
if ($Language) {
  $pyArgs += @("--language", $Language)
}

python @pyArgs
