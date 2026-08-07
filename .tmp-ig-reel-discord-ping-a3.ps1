# One-shot Shorts/Reels reminder -> Discord (#website-inquiries via /api/contact)
# + Teacher Hub Home notification (/api/feature-report kind=reminder).
# BatchA3 arm - separate lock so BatchA2 job can keep running.
$ErrorActionPreference = "Stop"
$logPath = Join-Path $PSScriptRoot ".tmp-ig-reel-discord-ping-a3.log"
$lockPath = Join-Path $PSScriptRoot ".tmp-ig-reel-discord-ping-a3.lock"
$contactUrl = "https://japaneselanguagementor.com/api/contact"
$hubUrl = "https://japaneselanguagementor.com/api/feature-report"

# --- Edit per arm ---
# Aug 6, 2026 10:30 Japan (JST) = Aug 5, 2026 18:30 Pacific (PDT) = 2026-08-06 01:30 UTC
$targetUtc = [DateTime]::SpecifyKind([DateTime]::Parse("2026-08-06T01:30:00"), [DateTimeKind]::Utc)
$clipTitles = "Want Disneyland? hoshii vs -tai"
$ytPinComment = @"
Free trial Japanese lesson -> https://japaneselanguagementor.com/#contact
"@
$igStoryCaption = @"
Free trial v
"@
$linkSticker = "https://japaneselanguagementor.com/#contact"
# --- End edit ---

$copyReady = @"
ONE-OFF REMINDER (not a website inquiry)

Post IG story and youtube comment.
Post Shorts/Reels now (6:30 PM Los Angeles / Pacific = 10:30 AM Japan).
Clip(s): $clipTitles

YT PIN COMMENT:
$ytPinComment

IG STORY CAPTION:
$igStoryCaption

LINK STICKER:
$linkSticker

Do this:
1) Share the Reel to Story + add the Link sticker (#contact)
2) After YouTube publish, pin the comment above
"@

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')  $msg"
  Add-Content -Path $logPath -Value $line
  Write-Output $line
}

if (Test-Path $lockPath) {
  $existing = Get-Content $lockPath -Raw
  Write-Log "Another A3 reminder job may already be running (lock: $existing). Exiting."
  exit 0
}

Set-Content -Path $lockPath -Value ("pid={0}; started={1}" -f $PID, (Get-Date -Format o))
Write-Log "Scheduled Shorts/Reels Discord + Teacher Hub ping (A3). Target UTC: $($targetUtc.ToString('o'))"

try {
  while ($true) {
    $nowUtc = [DateTime]::UtcNow
    $seconds = ($targetUtc - $nowUtc).TotalSeconds
    if ($seconds -le 0) { break }
    $chunk = [Math]::Min([Math]::Max([int]$seconds, 1), 300)
    Write-Log ("Waiting {0:N0}s more (~{1:N1}h). Sleeping {2}s..." -f $seconds, ($seconds / 3600.0), $chunk)
    Start-Sleep -Seconds $chunk
  }

  $discordOk = $false
  $hubOk = $false

  try {
    $contactBody = @{
      name    = "JD (scheduled reminder)"
      email   = "reminder@japaneselanguagementor.com"
      service = "IG Reel / Shorts reminder"
      message = $copyReady
    } | ConvertTo-Json
    Write-Log "Sending Discord reminder via $contactUrl ..."
    $res = Invoke-RestMethod -Method Post -Uri $contactUrl -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($contactBody))
    Write-Log ("Discord SUCCESS: " + ($res | ConvertTo-Json -Compress))
    $discordOk = $true
  }
  catch {
    Write-Log ("Discord FAILED: " + $_.Exception.Message)
    if ($_.ErrorDetails.Message) { Write-Log ("Discord details: " + $_.ErrorDetails.Message) }
  }

  try {
    $hubBody = @{
      kind        = "reminder"
      displayName = "Shorts / Reels - $clipTitles"
      page        = "Social reminder"
      username    = "jlm"
      message     = $copyReady
    } | ConvertTo-Json
    Write-Log "Sending Teacher Hub reminder via $hubUrl ..."
    $hubRes = Invoke-RestMethod -Method Post -Uri $hubUrl -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($hubBody))
    Write-Log ("Teacher Hub SUCCESS: " + ($hubRes | ConvertTo-Json -Compress))
    $hubOk = $true
  }
  catch {
    Write-Log ("Teacher Hub FAILED: " + $_.Exception.Message)
    if ($_.ErrorDetails.Message) { Write-Log ("Teacher Hub details: " + $_.ErrorDetails.Message) }
  }

  if (-not $discordOk -and -not $hubOk) { exit 1 }
  if (-not $discordOk -or -not $hubOk) {
    Write-Log "Partial success (discordOk=$discordOk hubOk=$hubOk)."
    exit 1
  }
}
catch {
  Write-Log ("FAILED: " + $_.Exception.Message)
  if ($_.ErrorDetails.Message) { Write-Log ("Details: " + $_.ErrorDetails.Message) }
  exit 1
}
finally {
  Remove-Item -Path $lockPath -ErrorAction SilentlyContinue
  Write-Log "Job finished."
}