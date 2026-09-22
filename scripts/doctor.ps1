# Claw'd health check - read-only, changes nothing.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\doctor.ps1 [-Days 14]
# Looks at everything that has made the pet vanish or skip logon before and says what to do.
# ASCII only: Windows PowerShell 5.1 reads this file as ANSI.
param([int]$Days = 14)

$ErrorActionPreference = "SilentlyContinue"
$script:problems = 0
function Say([string]$level, [string]$msg) {
    $color = @{ OK = "Green"; WARN = "Yellow"; FAIL = "Red"; INFO = "Gray" }[$level]
    if ($level -eq "WARN" -or $level -eq "FAIL") { $script:problems++ }
    Write-Host ("  [{0,-4}] {1}" -f $level, $msg) -ForegroundColor $color
}
function Section([string]$title) { Write-Host ""; Write-Host "== $title" -ForegroundColor Cyan }

# Program part of a Run command line ("C:\a b\x.exe" -arg  /  C:\a b\x.exe -arg)
function Get-Program([string]$cmd) {
    $cmd = $cmd.Trim()
    if ($cmd.StartsWith('"')) { return $cmd.Substring(1, $cmd.IndexOf('"', 1) - 1) }
    $i = $cmd.ToLower().IndexOf(".exe")
    if ($i -ge 0) { return $cmd.Substring(0, $i + 4) }
    return $cmd
}
# For an unquoted command line with spaces: existing files Windows would try first
function Get-Hijackers([string]$cmd) {
    $cmd = $cmd.Trim()
    if ($cmd.StartsWith('"')) { return @() }
    $prog = Get-Program $cmd
    $hits = @()
    for ($i = $prog.IndexOf(' '); $i -gt 0; $i = $prog.IndexOf(' ', $i + 1)) {
        $prefix = $prog.Substring(0, $i)
        foreach ($p in @($prefix, "$prefix.exe")) { if (Test-Path -LiteralPath $p -PathType Leaf) { $hits += $p } }
    }
    return $hits
}

# Anything started from inside an MSIX app (e.g. by a Claude Code session in the Claude desktop app)
# inherits its file-system virtualization, even without a package identity of its own: %APPDATA%
# reads can return that app's stale private copy. Spot it by an ancestor living under WindowsApps.
function Get-MsixAncestor([int]$procId) {
    for ($i = 0; $i -lt 12 -and $procId; $i++) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"
        if (-not $p) { return $null }
        if ($p.ExecutablePath -like "*\WindowsApps\*") { return $p.ExecutablePath }
        $procId = [int]$p.ParentProcessId
    }
    return $null
}
$hostApp = Get-MsixAncestor $PID
if ($hostApp) {
    Write-Host "Note: this check was started from inside an MSIX app ($(Split-Path -Leaf $hostApp))." -ForegroundColor DarkYellow
    Write-Host "      Its view of %APPDATA% can be that app's stale private copy; the pet's own /health view wins." -ForegroundColor DarkYellow
}

# ---------------------------------------------------------------- process
Section "Pet process"
$health = $null
$statusOnly = $null
try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:31126/health" -TimeoutSec 3 } catch { }
if (-not $health) { try { $statusOnly = Invoke-RestMethod -Uri "http://127.0.0.1:31126/status" -TimeoutSec 3 } catch { } }
$running = Get-CimInstance Win32_Process -Filter "Name='Clawd.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' }
if ($health) {
    Say OK ("running: pid {0}, v{1}, up {2:N1} h, {3} MB in {4} processes" -f $health.pid, $health.version, ($health.uptimeSec / 3600), $health.memoryMB, $health.processes)
    if (-not $health.window) { Say FAIL "process alive but the pet window is gone - launch Clawd.exe again to bring it back" }
    elseif (-not $health.window.rendererAlive) { Say FAIL "pet renderer is dead - launch Clawd.exe again to revive it" }
    elseif (-not $health.window.onScreen) { Say WARN "pet window is off-screen - launch Clawd.exe again to bring it home" }
    else { Say OK "pet window alive and on screen" }
    if ($health.rendererRecoveries -gt 0) { Say WARN "renderer crashed and was reloaded $($health.rendererRecoveries) time(s) this run - see the log below" }
    if (-not $health.fullscreenWatcher) { Say WARN "fullscreen watcher helper is not running (it restarts itself every 10 s)" }
} elseif ($statusOnly) {
    Say WARN "running, but this build has no /health (older than the self-check) - rebuild or copy main.js into the packaged app"
} elseif ($running) {
    Say FAIL ("Clawd.exe is running (pid {0}) but not answering on 127.0.0.1:31126 - hung, or the port is taken" -f (($running | Select-Object -ExpandProperty ProcessId) -join ","))
} else {
    Say FAIL "the pet is not running"
}
if ($health -and $health.container) {
    Say FAIL "the pet is stuck inside $($health.container)'s app container (started from a Claude session?) - its %APPDATA% writes are virtualized; quit it and double-click Clawd.exe"
} elseif ($health -and ($health.PSObject.Properties.Name -contains 'container')) {
    Say OK "the pet runs as a normal desktop process (not inside another app's container)"
}

# ---------------------------------------------------------------- config
Section "Config and watchdog"
$exe = $null
if ($health) { $exe = $health.exe }
else {
    foreach ($c in @((Join-Path $PSScriptRoot "..\dist\Clawd-win32-x64\Clawd.exe"), (Join-Path $PSScriptRoot "..\..\..\Clawd.exe"))) {
        if (Test-Path -LiteralPath $c) { $exe = (Resolve-Path -LiteralPath $c).Path; break }
    }
}
if ($exe) { Say INFO "exe: $exe" } else { Say WARN "could not find Clawd.exe (pet not running, and no dist\ next to this script)" }
$cfg = $null
if ($health -and $health.config) { $cfg = $health.config }
else { try { $cfg = Get-Content -LiteralPath (Join-Path $env:APPDATA "clawd-pet\pet-config.json") -Raw | ConvertFrom-Json } catch { } }
if ($cfg) { Say INFO ("pet-config.json: autoStart={0}" -f $cfg.autoStart) }
$wd = $null
$wdFile = if ($exe) { Join-Path (Split-Path $exe) "logs\watchdog.json" } else { $null }
if ($wdFile) { try { $wd = Get-Content -LiteralPath $wdFile -Raw | ConvertFrom-Json } catch { } }
if (-not $wd) { Say WARN "no logs\watchdog.json next to the exe - the hook watchdog can't relaunch the pet until it has started once" }
else {
    if ($wd.quitByUser -eq $true) { Say INFO "you quit the pet from its menu, so the hook watchdog leaves it off until you start it again" }
    else { Say OK "hook watchdog armed: Claude Code activity relaunches the pet if it dies" }
    if ($wd.exePath -and -not (Test-Path -LiteralPath $wd.exePath)) { Say FAIL "watchdog.json points to a missing exe (moved?) - start Clawd.exe once from its new place" }
}

# ---------------------------------------------------------------- autostart
Section "Start with Windows"
$runKey = Get-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$approved = Get-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
$petEntries = @()
if ($runKey) {
    foreach ($n in $runKey.GetValueNames()) {
        $v = [string]$runKey.GetValue($n)
        if ($v -match 'Clawd\.exe') { $petEntries += [pscustomobject]@{ Name = $n; Value = $v } }
    }
}
$wanted = -not ($cfg -and $cfg.autoStart -eq $false)
if ($petEntries.Count -eq 0) {
    if ($wanted) { Say FAIL "no Run entry for Clawd.exe - it will NOT start at logon (start the pet once, or tick Start with Windows)" }
    else { Say OK "off (as configured)" }
}
if ($petEntries.Count -gt 1) { Say WARN ("{0} Run entries point at Clawd.exe - only one is expected" -f $petEntries.Count) }
foreach ($e in $petEntries) {
    Say INFO ("{0} = {1}" -f $e.Name, $e.Value)
    $prog = Get-Program $e.Value
    if (-not $e.Value.Trim().StartsWith('"') -and $prog.Contains(' ')) {
        Say FAIL "path has spaces but no quotes - Windows may try a shorter path first ('Open with' at logon)"
    } else { Say OK "path is quoted" }
    foreach ($h in (Get-Hijackers $e.Value)) { Say FAIL "stray file hijacks this entry at logon: $h" }
    if (-not (Test-Path -LiteralPath $prog)) { Say FAIL "points to a missing exe (folder moved?) - start Clawd.exe once from its new place" }
    elseif ($exe -and ($prog -ne $exe)) { Say WARN "points to a different exe than the one in use: $prog" }
    else { Say OK "points to an existing exe" }
    $state = $null
    if ($approved) { $state = $approved.GetValue($e.Name) }
    if ($state -and ($state[0] -band 1)) { Say WARN "disabled in Task Manager > Startup - Windows will skip it" }
    else { Say OK "enabled in Task Manager > Startup" }
    if (-not $wanted) { Say WARN "config says autoStart=false but a Run entry exists" }
}
if ($health -and $health.autoStart) {
    $a = $health.autoStart
    Say INFO ("pet's own view (real registry): wanted={0} registered={1} willLaunch={2}" -f $a.wanted, $a.registered, $a.willLaunch)
    if ($a.wanted -and -not $a.registered) { Say FAIL "the pet says its Run value is missing, or isn't the quoted path of this exe" }
    elseif ($a.wanted -and -not $a.willLaunch) { Say WARN "the pet says Windows won't launch it at logon (disabled in Task Manager?)" }
}

# Other programs' unquoted Run entries that a stray file already hijacks (the 2026-09-17 kind)
foreach ($root in @("HKCU", "HKLM")) {
    $k = Get-Item "${root}:\Software\Microsoft\Windows\CurrentVersion\Run"
    if (-not $k) { continue }
    foreach ($n in $k.GetValueNames()) {
        $v = [string]$k.GetValue($n)
        if ($v -match 'Clawd\.exe') { continue }
        foreach ($h in (Get-Hijackers $v)) { Say WARN "${root} Run '$n' is unquoted and '$h' exists - that one may pop 'Open with' at logon" }
    }
}
# Files named like a truncated pet path are what tripped the old unquoted entry
if ($exe) {
    for ($i = $exe.IndexOf(' '); $i -gt 0; $i = $exe.IndexOf(' ', $i + 1)) {
        $prefix = $exe.Substring(0, $i)
        if (Test-Path -LiteralPath $prefix -PathType Leaf) { Say WARN "stray file '$prefix' exists (a tool wrote to a path cut at a space); harmless for a quoted entry, safe to rename" }
    }
}

# ---------------------------------------------------------------- hooks
Section "Claude Code hooks"
$settings = Join-Path $env:USERPROFILE ".claude\settings.json"
$hookCmds = @()
try {
    $s = Get-Content -LiteralPath $settings -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($ev in $s.hooks.PSObject.Properties) {
        foreach ($group in @($ev.Value)) {
            foreach ($h in @($group.hooks)) {
                if ($h.command -match 'notify\.js') { $hookCmds += [pscustomobject]@{ Event = $ev.Name; Command = $h.command } }
            }
        }
    }
} catch { }
if ($hookCmds.Count -eq 0) { Say WARN "no pet hooks in $settings (npm run hooks:install) - the pet won't see Claude Code" }
else {
    Say OK ("{0} hooks point at notify.js: {1}" -f $hookCmds.Count, (($hookCmds | ForEach-Object { $_.Event }) -join ", "))
    if ($hookCmds[0].Command -match '"([^"]*notify\.js)"') {
        $notify = $matches[1]
        if (Test-Path -LiteralPath $notify) { Say OK "notify.js found: $notify" }
        else { Say FAIL "hooks point at a missing notify.js: $notify" }
        # The same folders notify.js searches; it uses the newest watchdog.json among them
        $hookDir = Split-Path -Parent $notify
        $seen = @(
            (Join-Path $hookDir "..\dist\Clawd-win32-x64\logs\watchdog.json"),
            (Join-Path $hookDir "..\..\..\logs\watchdog.json"),
            (Join-Path $env:APPDATA "clawd-pet\logs\watchdog.json")
        ) | Where-Object { Test-Path -LiteralPath $_ } | Sort-Object { (Get-Item -LiteralPath $_).LastWriteTime } -Descending
        if (-not $seen) { Say WARN "the hooks can't see any watchdog.json from where they live, so they can't relaunch the pet" }
        else {
            $hookView = $null
            try { $hookView = Get-Content -LiteralPath @($seen)[0] -Raw | ConvertFrom-Json } catch { }
            if ($hookView -and $exe -and ($hookView.exePath -ne $exe)) { Say WARN "the hooks would relaunch $($hookView.exePath), not the exe in use" }
            elseif ($hookView) { Say OK "the hooks read the watchdog.json this exe writes" }
        }
    }
}

# ---------------------------------------------------------------- log
Section "Log (last $Days days: warnings and errors)"
$logDir = $null
if ($health -and $health.logDir) { $logDir = $health.logDir } elseif ($exe) { $logDir = Join-Path (Split-Path $exe) "logs" }
$logFile = if ($logDir) { Join-Path $logDir "clawd.log" } else { $null }
if (-not $logFile -or -not (Test-Path -LiteralPath $logFile)) { Say INFO "no clawd.log yet" }
else {
    Say INFO "log: $logFile"
    $since = (Get-Date).AddDays(-$Days).ToString("yyyy-MM-dd")
    $bad = Get-Content -LiteralPath $logFile -Encoding UTF8 | Where-Object { ($_.Length -ge 10) -and ($_ -match ' (WARN|ERROR) ') -and ($_.Substring(0, 10) -ge $since) }
    if (-not $bad) { Say OK "nothing to report" }
    else { $bad | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }; Say INFO ("{0} warning/error line(s) in total" -f @($bad).Count) }
}

# ---------------------------------------------------------------- Windows side
Section "Windows event log (last $Days days)"
$start = (Get-Date).AddDays(-$Days)
$crashes = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = $start } | Where-Object { $_.Properties[0].Value -eq 'Clawd.exe' }
if ($crashes) { $crashes | ForEach-Object { Say FAIL ("{0:yyyy-MM-dd HH:mm} Clawd.exe {1}" -f $_.TimeCreated, $(if ($_.Id -eq 1002) { "hung and was closed" } else { "crashed" })) } }
else { Say OK "no Clawd.exe crash or hang reports" }
$lowMem = Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'; StartTime = $start }
if ($lowMem) {
    $lowDays = $lowMem | ForEach-Object { $_.TimeCreated.ToString("yyyy-MM-dd") } | Sort-Object -Unique
    Say WARN ("low-memory events on {0} - any app can die then; see what used the memory in Event Viewer (System, id 2004)" -f ($lowDays -join ", "))
} else { Say OK "no low-memory events" }

# Helpers that outlived their pet (the watcher now exits on its own; old builds could leave one)
$alive = @(Get-CimInstance Win32_Process -Filter "Name='Clawd.exe'" | ForEach-Object { $_.ProcessId })
$orphans = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'fullscreen-watch\.ps1|cursor-helper\.ps1' -and $alive -notcontains $_.ParentProcessId }
if ($orphans) { $orphans | ForEach-Object { Say WARN ("orphaned helper pid {0} ({1}) - safe to end" -f $_.ProcessId, $(if ($_.CommandLine -match '(\w[\w-]*\.ps1)') { $matches[1] })) } }
else { Say OK "no orphaned helper processes" }

Write-Host ""
if ($script:problems -eq 0) { Write-Host "All good." -ForegroundColor Green }
else { Write-Host ("{0} thing(s) to look at." -f $script:problems) -ForegroundColor Yellow }
