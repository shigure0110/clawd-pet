<#
  shot.ps1 - headless Chrome screenshots of tools/qa/preview.html (spec §7 C), plus a montage.

  Usage (from anywhere):
    powershell -ExecutionPolicy Bypass -File tools/qa/shot.ps1                      # default list
    powershell -ExecutionPolicy Bypass -File tools/qa/shot.ps1 -List my_list.txt -Root ../../tmp/c/mock_renderer/
    powershell -ExecutionPolicy Bypass -File tools/qa/shot.ps1 -Only "hop_f3*"

  List format (one shot per line, '#' comments):   name | query-string
    e.g.  hop_f3_wizard_bubble | anim=hop&frame=3&hat=wizard&bubble=1
  Output: tools/qa/out/shots/<name>.png and tools/qa/out/shots_montage.png (-Out X gives X_montage.png)
  Chrome runs with its own profile under ClaudeCodePet/tmp/chrome-qa (never the user's profile).
  Static shots get --virtual-time-budget so the sheets decode; play=1 shots never do (spec quirk list).
#>
param(
  [string]$List = "",
  [string]$Root = "",
  [string]$Only = "*",
  [string]$Out = "",
  [switch]$NoMontage,
  [switch]$Label
)
$ErrorActionPreference = "Stop"
$qa = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $qa "..\..")).Path
if (-not $List) { $List = Join-Path $qa "shots_default.txt" }
if (-not $Out) { $Out = Join-Path $qa "out\shots" }
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$py = "E:\Vibegaming playground\30_Tools\py311\python.exe"
if (-not (Test-Path $chrome)) { Write-Error "Chrome not found at $chrome" }
$profileDir = Join-Path $repo "tmp\chrome-qa"
New-Item -ItemType Directory -Force -Path $Out, $profileDir | Out-Null

$page = [System.Uri]::new((Join-Path $qa "preview.html")).AbsoluteUri
$lines = Get-Content -LiteralPath $List -Encoding UTF8 | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("#") }
$labels = @()
$n = 0
foreach ($line in $lines) {
  $parts = $line.Split("|", 2)
  if ($parts.Count -lt 2) { Write-Warning "bad line: $line"; continue }
  $name = $parts[0].Trim()
  $query = $parts[1].Trim()
  if ($name -notlike $Only) { continue }
  if ($Root) { $query = "$query&root=$Root" }
  if ($Label) { $query = "$query&label=1" }
  $png = Join-Path $Out "$name.png"
  if (Test-Path $png) { Remove-Item -LiteralPath $png -Force }
  $cargs = @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
            "--user-data-dir=$profileDir", "--no-first-run", "--no-default-browser-check",
            "--window-size=300,280", "--default-background-color=00000000", "--screenshot=$png")
  if ($query -notmatch "(^|&)play=1") { $cargs += "--virtual-time-budget=1500" }
  $cargs += "$page`?$query"
  # PowerShell 5.1 joins -ArgumentList without quoting: quote anything with a space
  $cargs = $cargs | ForEach-Object { if ($_ -match " ") { '"' + $_ + '"' } else { $_ } }
  $p = Start-Process -FilePath $chrome -ArgumentList $cargs -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(30000)) { try { taskkill /PID $p.Id /T /F | Out-Null } catch {} ; Write-Warning "timeout: $name" }
  if (Test-Path $png) { $n++; Write-Host ("shot  {0,-36} {1}" -f $name, $query) }
  else { Write-Warning "no screenshot for $name" }
  $labels += "$name.png`t$name  ($query)"
}
$labelFile = Join-Path $Out "_labels.tsv"
$labels | Set-Content -LiteralPath $labelFile -Encoding UTF8
Write-Host "$n screenshots in $Out"
if (-not $NoMontage -and $n -gt 0) {
  $montage = Join-Path (Split-Path -Parent $Out) ((Split-Path -Leaf $Out) + "_montage.png")
  & $py (Join-Path $qa "montage.py") $Out $montage --cols 6 --scale 1 --title "preview.html shots" --labels $labelFile
}
