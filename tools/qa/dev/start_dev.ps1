<#
  start_dev.ps1 - start the DEV Claw'd next to the user's live pet (spec F7, §7 C).

  The dev pet starts with mischief OFF and roaming OFF (main.js/pet.js dev defaults when CLAWD_PORT is set):
  no cursor stealing, no footprints, no perching on the user's windows. Scenarios switch them on explicitly
  through POST /action.

    powershell -ExecutionPolicy Bypass -File tools/qa/dev/start_dev.ps1 [-NoCdp] [-CdpPort 9231]

  Environment given to the dev process only (never persisted):
    CLAWD_PORT=31127                         (the live pet owns 31126 - refused here)
    CLAWD_USER_DATA=<repo>/tmp/dev-profile   (separate single-instance lock and config)
    CLAWD_QA_DIR=<repo>/tmp/qa               (POST /debug/capture writes here)
    CLAWD_NO_REVIVE=1
  The PID goes to <repo>/tmp/dev.pid; stop ONLY with tools/qa/dev/stop_dev.ps1 (taskkill /PID <pid> /T).
  -Cdp (default on) adds --remote-debugging-port=9231 for tools/qa/dev/cdp.js (drag/hover/file-drop input).
  Refuses to start unless main.js applies CLAWD_USER_DATA before requestSingleInstanceLock and reads CLAWD_PORT.
#>
param(
  [switch]$NoCdp,
  [int]$CdpPort = 9231,
  [int]$Port = 31127,
  [int]$WaitSec = 45,
  [switch]$DryRun   # run the guards and print the command, never launch
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here "..\..\..")).Path
$tmp = Join-Path $repo "tmp"
$pidFile = Join-Path $tmp "dev.pid"

if ($Port -eq 31126) { Write-Error "Port 31126 belongs to the live pet. Refusing." }

# Guard 1: main.js must honour CLAWD_USER_DATA before the single-instance lock, and CLAWD_PORT
$main = Get-Content -Raw -LiteralPath (Join-Path $repo "main.js")
$iUD = $main.IndexOf("CLAWD_USER_DATA")
$iLock = $main.IndexOf("requestSingleInstanceLock")
if ($iUD -lt 0 -or $iLock -lt 0 -or $iUD -gt $iLock) {
  Write-Error "main.js does not apply CLAWD_USER_DATA before requestSingleInstanceLock (executor B, F7). Not starting: the dev pet would collide with the live one."
}
if ($main.IndexOf("CLAWD_PORT") -lt 0) {
  Write-Error "main.js does not read CLAWD_PORT (executor B, F7). Not starting: it would try port 31126."
}

. (Join-Path $here "devproc.ps1")

# Guard 2: one dev instance at a time (a recorded PID counts only if it is still that dev process)
$rec = Read-DevPid $pidFile
if ($rec) {
  $why = Test-DevProcess $rec.Pid $rec.Start $repo
  if ($why -eq "") { Write-Error "A dev instance is already running (PID $($rec.Pid)). Stop it with tools/qa/dev/stop_dev.ps1." }
  Write-Host "stale tmp/dev.pid ($why): removing it"
}
if (Test-Path $pidFile) { Remove-Item -LiteralPath $pidFile -Force }

# Guard 3: the dev port must be free
function Test-Port([int]$p) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $iar = $c.BeginConnect("127.0.0.1", $p, $null, $null); $ok = $iar.AsyncWaitHandle.WaitOne(300) -and $c.Connected; return $ok }
  catch { return $false } finally { $c.Close() }
}
if (Test-Port $Port) { Write-Error "Something already listens on 127.0.0.1:$Port. Not starting." }
if (-not $NoCdp -and (Test-Port $CdpPort)) { Write-Error "DevTools port $CdpPort is taken. Use -CdpPort." }

$userData = Join-Path $tmp "dev-profile"
$qaDir = Join-Path $tmp "qa"
$logDir = Join-Path $tmp "dev-logs"
New-Item -ItemType Directory -Force -Path $userData, $qaDir, $logDir | Out-Null

$env:CLAWD_PORT = "$Port"
$env:CLAWD_USER_DATA = $userData
$env:CLAWD_QA_DIR = $qaDir
$env:CLAWD_NO_REVIVE = "1"
Remove-Item Env:CCPET_AUTOCONFIG -ErrorAction SilentlyContinue   # never auto-configure hooks from the dev pet

$electron = Join-Path $repo "node_modules\electron\dist\electron.exe"
$eargs = @(".")
if (-not $NoCdp) { $eargs = @("--remote-debugging-port=$CdpPort", ".") }
if ($DryRun) {
  Write-Host "DRY RUN: guards passed. Would run: $electron $($eargs -join ' ')  (cwd $repo)"
  Write-Host "  CLAWD_PORT=$Port CLAWD_USER_DATA=$userData CLAWD_QA_DIR=$qaDir CLAWD_NO_REVIVE=1"
  exit 0
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $logDir "dev-$stamp.out.log"
$errLog = Join-Path $logDir "dev-$stamp.err.log"
# Detached launch. Start-Process -RedirectStandardOutput starts the child with handle inheritance on,
# so electron inherited the CALLER's stdout/stderr pipes and a synchronous caller (a Bash tool, a CI
# step) hung until the dev pet exited. Instead a hidden cmd.exe is started through ShellExecute (no
# inherited handles), sets the dev environment itself and does the log redirection:
#   cmd /c "set "CLAWD_PORT=..."&& ... && "<electron.exe>" <args> > "<out.log>" 2> "<err.log>""
$envSet = @(
  ('set "CLAWD_PORT={0}"' -f $Port),
  ('set "CLAWD_USER_DATA={0}"' -f $userData),
  ('set "CLAWD_QA_DIR={0}"' -f $qaDir),
  'set "CLAWD_NO_REVIVE=1"',
  'set "CCPET_AUTOCONFIG="'
) -join "&& "
if (Test-Path $electron) {
  $run = '"{0}" {1}' -f $electron, ($eargs -join " ")
} else {
  # same thing through npx (spec wording); the tree then is cmd > npx > node > electron, and /T stops it
  $run = "npx electron " + ($eargs -join " ")
}
$cmdLine = '/c "{0}&& {1} > "{2}" 2> "{3}""' -f $envSet, $run, $outLog, $errLog
$p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdLine -WorkingDirectory $repo -WindowStyle Hidden -PassThru

# Record electron.exe itself (child of the wrapper) when it shows up; else the wrapper
$devPid = $p.Id
if (Test-Path $electron) {
  $until = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $until -and -not $p.HasExited) {
    $child = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($p.Id) AND Name = 'electron.exe'" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($child) { $devPid = [int]$child.ProcessId; break }
    Start-Sleep -Milliseconds 200
  }
}
$devProc = Get-Process -Id $devPid -ErrorAction SilentlyContinue
if (-not $devProc) { Write-Warning "dev process exited at once; see $errLog"; exit 1 }
Write-DevPid $pidFile $devPid
Write-Host "dev pet started: PID $devPid$(if ($devPid -ne $p.Id) { " (launcher cmd $($p.Id))" }), port $Port, userData $userData, logs $outLog"

# Wait until the debug API answers
$deadline = (Get-Date).AddSeconds($WaitSec)
$state = $null
$refused = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if ($devProc.HasExited) { Write-Warning "dev process exited (code $($devProc.ExitCode)); see $errLog"; Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; exit 1 }
  try {
    $state = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/debug/state" -Headers @{ "X-Clawd-Debug" = "1" } -TimeoutSec 2
    break
  } catch {
    # A 403 means the pet is up but refused us: name the cause now instead of waiting out the timeout
    $resp = $_.Exception.Response
    if ($resp -and [int]$resp.StatusCode -eq 403) {
      $msg = "$($_.ErrorDetails.Message)"
      if (-not $msg) {   # Windows PowerShell 5.1 often leaves ErrorDetails empty: read the body itself
        try { $msg = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch { }
      }
      if ($msg -match "bad Host") {
        Write-Warning "dev pet up but GET /debug/state answered 403 `"bad Host`": the Host header was not 127.0.0.1:$Port or localhost:$Port (a system proxy rewriting it?). The process is still running: stop it with stop_dev.ps1."
      } else {
        Write-Warning "dev pet up but GET /debug/state answered 403 ($msg): the X-Clawd-Debug header did not arrive. The process is still running: stop it with stop_dev.ps1."
      }
      $state = $null; $refused = $true
      break
    }
  }
}
if ($state) {
  Write-Host ("debug API up: anim={0} mischief={1} roam={2} rowsAvailable={3}" -f $state.anim, $state.mischief, $state.roam, $state.rowsAvailable)
  if ($state.mischief -or $state.roam) { Write-Warning "dev pet reports mischief/roam ON at start - spec §0.7 says both must start OFF" }
} elseif (-not $refused) {
  Write-Warning "GET /debug/state did not answer within $WaitSec s (endpoint missing, or the app failed). The process is still running: stop it with stop_dev.ps1."
}
