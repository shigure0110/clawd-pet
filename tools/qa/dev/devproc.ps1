<#
  devproc.ps1 - dev-instance identity checks shared by start_dev.ps1 and stop_dev.ps1 (dot-sourced).

  tmp/dev.pid holds one line "<pid> <StartTime as FileTimeUtc>". A PID alone is not an identity:
  Windows reuses PIDs, and Claude Code sessions / MCP servers on this machine run as node.exe, so a
  stale file could otherwise point at an unrelated process. A process is "the dev pet" only when
    - it is still the process that was recorded (same StartTime), and
    - Win32_Process answers for it, and
    - electron.exe: its ExecutablePath is this repo's node_modules\electron\dist\electron.exe;
      cmd.exe / node.exe (the launcher wrapper, or npx): its CommandLine names electron AND this repo.
  Anything else (Clawd.exe - the live pet - included) is refused.
#>

function Read-DevPid([string]$pidFile) {
  # → @{ Pid = <int>; Start = <long or $null> } or $null
  if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
  $parts = ((Get-Content -LiteralPath $pidFile -Raw) -as [string]).Trim() -split "\s+"
  $devPid = 0
  if (-not $parts -or -not [int]::TryParse($parts[0], [ref]$devPid)) { return $null }
  $start = $null
  if ($parts.Count -ge 2) { $s = 0L; if ([long]::TryParse($parts[1], [ref]$s)) { $start = $s } }
  return @{ Pid = $devPid; Start = $start }
}

function Write-DevPid([string]$pidFile, [int]$devPid) {
  $p = Get-Process -Id $devPid -ErrorAction Stop
  Set-Content -LiteralPath $pidFile -Value ("{0} {1}" -f $devPid, $p.StartTime.ToFileTimeUtc()) -Encoding ASCII
}

# → "" when $devPid is the dev pet of $repo (and, if $start is given, the same process), else the reason
function Test-DevProcess([int]$devPid, $start, [string]$repo) {
  $proc = Get-Process -Id $devPid -ErrorAction SilentlyContinue
  if (-not $proc) { return "PID $devPid is not running" }
  $name = $proc.ProcessName.ToLower()
  if ($name -like "clawd*") { return "PID $devPid is $($proc.ProcessName) - that is the live pet" }
  if ($null -ne $start) {
    $t = $null
    try { $t = $proc.StartTime.ToFileTimeUtc() } catch { return "cannot read the start time of PID $devPid" }
    if ($t -ne $start) { return "PID $devPid was reused: it started at $($proc.StartTime), not at the recorded time" }
  }
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $devPid" -ErrorAction SilentlyContinue
  if (-not $cim) { return "Win32_Process has no entry for PID $devPid; cannot verify it" }
  $electronExe = Join-Path $repo "node_modules\electron\dist\electron.exe"
  switch ($name) {
    "electron" {
      if (-not $cim.ExecutablePath -or ($cim.ExecutablePath -ne $electronExe)) {
        return "PID $devPid runs '$($cim.ExecutablePath)', not $electronExe"
      }
    }
    { $_ -in @("cmd", "node") } {
      $cl = [string]$cim.CommandLine
      if (-not ($cl -like "*electron*") -or -not ($cl.ToLower().Contains($repo.ToLower()))) {
        return "PID $devPid is $name but its command line does not start electron from $repo"
      }
    }
    default { return "PID $devPid is '$($proc.ProcessName)', not the dev electron" }
  }
  return ""
}

# The electron PID a clean quit may be sent to (else $null): the repo electron.exe that listens on the
# dev HTTP port ($port, via Get-DevByPort) AND on the DevTools port ($cdpPort), and that is $devPid itself
# or a descendant of it (start_dev records electron, or the cmd / npx launcher when electron is missing).
function Get-DevElectronFor([int]$devPid, [int]$port, [int]$cdpPort, [string]$repo) {
  if ($port -eq 31126 -or $cdpPort -eq 31126 -or $cdpPort -eq $port) { return $null }
  $el = Get-DevByPort $port $repo
  if (-not $el) { return $null }
  $c = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c -or [int]$c.OwningProcess -ne $el) { return $null }
  $p = $el
  for ($i = 0; $i -lt 6 -and $p; $i++) {
    if ($p -eq $devPid) { return $el }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $p" -ErrorAction SilentlyContinue
    if (-not $cim) { return $null }
    $p = [int]$cim.ParentProcessId
  }
  return $null
}

# The process listening on 127.0.0.1:$port, when it is this repo's electron.exe (else $null).
# Finds a dev pet whose PID file is gone or stale (e.g. after a /restart relaunch).
function Get-DevByPort([int]$port, [string]$repo) {
  if ($port -eq 31126) { return $null }
  $c = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { return $null }
  if ((Test-DevProcess $c.OwningProcess $null $repo) -ne "") { return $null }
  if ((Get-Process -Id $c.OwningProcess).ProcessName.ToLower() -ne "electron") { return $null }
  return [int]$c.OwningProcess
}
