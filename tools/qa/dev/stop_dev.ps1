<#
  stop_dev.ps1 - stop the DEV Claw'd started by start_dev.ps1.

    powershell -ExecutionPolicy Bypass -File tools/qa/dev/stop_dev.ps1 [-Port 31127] [-CdpPort 9231]

  First a clean quit through the app's own path: cdp.js evals window.ccPet.quit() in the dev renderer
  (preload -> ipc "quit-app" -> main.js quitApp), so the run marker is cleared and the next start does
  not log "previous run ... ended without a clean quit". POST /action refuses "quit" by design, so the
  HTTP API cannot do this. It is only sent when the DevTools port and the dev HTTP port are owned by the
  same verified repo electron.exe, which is the verified PID below or its child (launcher case).
  If that is not possible or the process is still there after 6 s: only ever by PID,
  `taskkill /PID <pid> /T` (and /F added on the same, re-verified PID tree when the soft kill is refused
  or has not ended it within 5 s). Never by image name, never Clawd.exe, never the live pet on port 31126.

  Which PID:
    1. the one in <repo>/tmp/dev.pid ("<pid> <StartTime FileTimeUtc>"), but only when devproc.ps1's
       Test-DevProcess confirms it is still that process (same start time) and is this repo's
       electron.exe, or a cmd/node launcher whose command line starts electron from this repo;
       a stale or reused PID is refused and the file removed, nothing is killed;
    2. otherwise the process listening on 127.0.0.1:<Port>, when it is this repo's electron.exe
       (a dev pet whose pid file went stale, e.g. after a /restart relaunch).
#>
param([int]$Port = 31127, [int]$CdpPort = 9231)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here "..\..\..")).Path
$pidFile = Join-Path $repo "tmp\dev.pid"
. (Join-Path $here "devproc.ps1")
if ($Port -eq 31126) { Write-Error "Port 31126 belongs to the live pet. Refusing." }

$devPid = $null
$rec = Read-DevPid $pidFile
if ($rec) {
  $why = Test-DevProcess $rec.Pid $rec.Start $repo
  if ($why -eq "") {
    $devPid = $rec.Pid
    if ($null -eq $rec.Start) { Write-Warning "tmp/dev.pid has no start time (older start_dev.ps1); identity checked by path / command line only" }
  } else {
    Write-Host "tmp/dev.pid is stale ($why): not killing it; removing the file"
    Remove-Item -LiteralPath $pidFile -Force
  }
} elseif (Test-Path -LiteralPath $pidFile) {
  Write-Host "tmp/dev.pid is unreadable: removing it"
  Remove-Item -LiteralPath $pidFile -Force
}

if (-not $devPid) {
  $devPid = Get-DevByPort $Port $repo
  if ($devPid) { Write-Host "found the dev pet by its port: PID $devPid listens on 127.0.0.1:$Port and runs this repo's electron.exe" }
}
if (-not $devPid) { Write-Host "no dev pet to stop (nothing verified in tmp/dev.pid, nothing of this repo on port $Port)"; exit 0 }

# 1. clean quit (see the header)
$how = "killed"
$el = Get-DevElectronFor $devPid $Port $CdpPort $repo
if ($el) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($node) {
    $cdpJs = Join-Path $here "cdp.js"
    Write-Host "asking the dev pet (PID $el) to quit through its own quit path (DevTools port $CdpPort)"
    $np = Start-Process -FilePath $node.Source -ArgumentList ('"{0}" --port {1} eval "window.ccPet.quit()"' -f $cdpJs, $CdpPort) -WindowStyle Hidden -PassThru
    # cdp.js is ours: if the socket closes under it before the reply, stop that node by its own PID
    if (-not $np.WaitForExit(5000)) { Stop-Process -Id $np.Id -Force -ErrorAction SilentlyContinue }
    $deadline = (Get-Date).AddSeconds(6)
    while ((Get-Date) -lt $deadline -and (Get-Process -Id $devPid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 200 }
    if (-not (Get-Process -Id $devPid -ErrorAction SilentlyContinue)) { $how = "quit cleanly" }
    else { Write-Host "the dev pet did not quit within 6 s; falling back to taskkill" }
  } else {
    Write-Host "node.exe not on PATH: no clean quit, falling back to taskkill"
  }
} else {
  Write-Host "no verified DevTools port $CdpPort on the dev electron (started with -NoCdp?): falling back to taskkill"
}

# 2. taskkill by the verified PID
if (Get-Process -Id $devPid -ErrorAction SilentlyContinue) {
  taskkill /PID $devPid /T | Out-Host
  # a refused soft kill ("can only be terminated forcefully") will not end it by waiting: go straight to /F
  if ($LASTEXITCODE -eq 0) {
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline -and (Get-Process -Id $devPid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 250 }
  }
}
if (Get-Process -Id $devPid -ErrorAction SilentlyContinue) {
  # re-verify before forcing: the PID must still be the same dev process
  if ((Test-DevProcess $devPid $(if ($rec -and $rec.Pid -eq $devPid) { $rec.Start } else { $null }) $repo) -eq "") {
    Write-Host "still running; forcing the same PID tree"
    taskkill /PID $devPid /T /F | Out-Host
  }
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
$deadline = (Get-Date).AddSeconds(2)
while ((Get-Date) -lt $deadline -and (Get-Process -Id $devPid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 200 }
if (Get-Process -Id $devPid -ErrorAction SilentlyContinue) { Write-Warning "PID $devPid is still running"; exit 1 }
Write-Host "dev pet stopped (PID $devPid, $how)"
