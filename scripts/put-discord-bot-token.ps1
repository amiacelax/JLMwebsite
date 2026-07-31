# Upload Discord Bot token to Cloudflare (never a webhook / client secret).
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\put-discord-bot-token.ps1
#
# Prefer the notepad method. Upload uses a UTF-8 file + cmd redirect
# because PowerShell pipes corrupt/truncate Node stdin (UTF-16).

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Get-TokenShape([string]$token) {
  $cleaned = ($token -replace '\s+', '')
  return [pscustomobject]@{
    Length   = $cleaned.Length
    DotParts = if ($cleaned) { ($cleaned -split '\.').Count } else { 0 }
  }
}

function Test-BotTokenShape([string]$token) {
  $shape = Get-TokenShape $token
  if ($shape.DotParts -lt 3) {
    Write-Host ""
    Write-Host "REJECTED before upload: need 3 parts with TWO dots (xxx.yyy.zzz)."
    Write-Host ("  You have {0} part(s), length {1}." -f $shape.DotParts, $shape.Length)
    Write-Host "  That usually means a truncated paste, or Client Secret / Public Key instead of Bot token."
    return $false
  }
  if ($shape.Length -lt 50) {
    Write-Host ""
    Write-Host ("REJECTED: token looks too short (length {0}). Copy the FULL Bot token." -f $shape.Length)
    return $false
  }
  Write-Host ("Shape OK before upload: {0} parts, length {1}." -f $shape.DotParts, $shape.Length)
  return $true
}

Write-Host ""
Write-Host "Discord Developer Portal -> your app -> Bot -> Reset Token -> Copy."
Write-Host "A real bot token looks like:  AAAAAA.BBBBBB.CCCCCCCC  (TWO dots)."
Write-Host ""
Write-Host "How do you want to paste?"
Write-Host "  1) Notepad file (recommended)"
Write-Host "  2) Type/paste in this window (visible)"
$choice = Read-Host "Choice (1 or 2)"

$token = $null
$tempFile = $null
$uploadFile = $null

if ($choice -eq "2") {
  Write-Host ""
  Write-Host "Paste the FULL token, then press Enter."
  $token = [string](Read-Host "DISCORD_BOT_TOKEN")
} else {
  $tempFile = Join-Path $env:TEMP ("jlm-discord-bot-token-{0}.txt" -f [guid]::NewGuid().ToString("n"))
  [System.IO.File]::WriteAllText($tempFile, "", [System.Text.UTF8Encoding]::new($false))
  Write-Host ""
  Write-Host "Opening Notepad. Paste ONLY the token (one line, nothing else), Save, then close Notepad."
  Write-Host ("File: {0}" -f $tempFile)
  Start-Process -FilePath "notepad.exe" -ArgumentList $tempFile -Wait
  if (-not (Test-Path $tempFile)) {
    Write-Error "Temp file missing - cancelled."
    exit 1
  }
  $token = [System.IO.File]::ReadAllText($tempFile)
}

try {
  $token = ([string]$token).Trim()
  $token = $token -replace "^\uFEFF", "" -replace "[\u200B-\u200D\uFEFF]", ""
  if (
    ($token.StartsWith('"') -and $token.EndsWith('"')) -or
    ($token.StartsWith("'") -and $token.EndsWith("'"))
  ) {
    $token = $token.Substring(1, $token.Length - 2).Trim()
  }
  if ($token -match '^Bot\s+') {
    $token = ($token -replace '^Bot\s+', '').Trim()
  }
  $token = ($token -replace '\s+', '')

  if (-not $token) {
    Write-Error "Empty token - nothing saved."
    exit 1
  }
  if ($token -match '^https?://' -or $token -match 'discord\.com/api/webhooks') {
    Write-Error "That looks like a webhook URL. Use Bot -> Reset Token."
    exit 1
  }
  if (-not (Test-BotTokenShape $token)) {
    exit 1
  }

  # CRITICAL: do not pipe from PowerShell into wrangler (UTF-16 truncates the token).
  # Write UTF-8 (no BOM) and let cmd redirect stdin.
  $uploadFile = Join-Path $env:TEMP ("jlm-discord-bot-upload-{0}.txt" -f [guid]::NewGuid().ToString("n"))
  [System.IO.File]::WriteAllText($uploadFile, $token, [System.Text.UTF8Encoding]::new($false))

  Write-Host "Uploading secret to Worker japanese-language-mentor (UTF-8 file redirect)..."
  $cmd = 'npx.cmd wrangler secret put DISCORD_BOT_TOKEN < "' + $uploadFile + '"'
  cmd.exe /c $cmd
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host ""
  Write-Host "Checking live status..."
  Start-Sleep -Seconds 2
  $status = curl.exe -sS "https://japaneselanguagementor.com/api/discord-bot-status?teacherUsername=jlm"
  Write-Host $status
  if ($status -match '"ok"\s*:\s*true') {
    Write-Host ""
    Write-Host "Bot token OK. Publish homework to test a student DM."
  } else {
    Write-Host ""
    Write-Host "Uploaded, but Discord still rejected it. Reset Token in the portal and run again."
    exit 1
  }
} finally {
  if ($tempFile -and (Test-Path $tempFile)) {
    Remove-Item -Force $tempFile -ErrorAction SilentlyContinue
  }
  if ($uploadFile -and (Test-Path $uploadFile)) {
    Remove-Item -Force $uploadFile -ErrorAction SilentlyContinue
  }
  $token = $null
}
