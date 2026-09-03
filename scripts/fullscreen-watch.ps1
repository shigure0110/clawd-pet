# CCPet window watcher
# Polls the foreground window and prints, on change:
#   FS:1 / FS:0   a borderless window covers its whole monitor (fullscreen game / video)
#   WIN:{json}    foreground window + the Claude desktop app's main window (physical px)
# Spawned by main.js: powershell -NoProfile -ExecutionPolicy Bypass -File fullscreen-watch.ps1 -SelfPid <pid>
# ASCII only: Windows PowerShell 5.1 reads this file as ANSI.
param(
    [int]$SelfPid = 0,
    [double]$Interval = 1.5,
    [long]$DebugHwnd = 0   # evaluate this window once instead of polling (for tests)
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FSW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cb; public RECT rcMonitor; public RECT rcWork; public uint flags; }

  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  public static string Cls(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }

  // Main window of the Claude desktop app: visible, titled "Claude", owned by claude.exe
  public static IntPtr ClaudeHwnd = IntPtr.Zero;
  public static IntPtr FindClaude() {
    ClaudeHwnd = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr lp) {
      if (!IsWindowVisible(h)) return true;  // minimized is fine: its rect is filtered later
      string t = Title(h);
      if (t != "Claude" && !t.StartsWith("Claude -") && !t.StartsWith("Claude ")) return true;
      uint p; GetWindowThreadProcessId(h, out p);
      try {
        if (System.Diagnostics.Process.GetProcessById((int)p).ProcessName.ToLower() == "claude") { ClaudeHwnd = h; return false; }
      } catch {}
      return true;
    }, IntPtr.Zero);
    return ClaudeHwnd;
  }
}
"@

$ignoreClasses = @("Progman", "WorkerW", "Shell_TrayWnd", "Windows.UI.Core.CoreWindow")
$lastFs = -1
$lastWin = ""
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8  # window titles may be non-ASCII
$out = [Console]::Out

function Rect-Info($h) {
    $r = New-Object FSW+RECT
    [void][FSW]::GetWindowRect($h, [ref]$r)
    return @{ hwnd = [int64]$h; l = $r.L; t = $r.T; r = $r.R; b = $r.B }
}

while ($true) {
    $fs = 0
    $fgInfo = $null
    try {
        $h = if ($DebugHwnd -ne 0) { [IntPtr]$DebugHwnd } else { [FSW]::GetForegroundWindow() }
        if ($h -ne [IntPtr]::Zero) {
            $wpid = [uint32]0
            [void][FSW]::GetWindowThreadProcessId($h, [ref]$wpid)
            $cls = [FSW]::Cls($h)
            if (($wpid -ne $SelfPid) -and ($ignoreClasses -notcontains $cls) -and -not [FSW]::IsIconic($h)) {
                $r = New-Object FSW+RECT
                [void][FSW]::GetWindowRect($h, [ref]$r)
                $m = [FSW]::MonitorFromWindow($h, 2)
                $mi = New-Object FSW+MONITORINFO
                $mi.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
                [void][FSW]::GetMonitorInfo($m, [ref]$mi)
                $style = [FSW]::GetWindowLong($h, -16)
                $hasCaption = ($style -band 0x00C00000) -eq 0x00C00000
                $covers = ($r.L -le $mi.rcMonitor.L) -and ($r.T -le $mi.rcMonitor.T) -and
                          ($r.R -ge $mi.rcMonitor.R) -and ($r.B -ge $mi.rcMonitor.B)
                if ($covers -and -not $hasCaption) { $fs = 1 }
                $fgInfo = Rect-Info $h
                $fgInfo.title = [FSW]::Title($h)
                $fgInfo.cls = $cls
                $fgInfo.pid = $wpid
                $fgInfo.maximized = [bool][FSW]::IsZoomed($h)
                $fgInfo.fullscreen = ($fs -eq 1)
            }
        }
    } catch { }

    if ($fs -ne $lastFs) {
        $out.WriteLine("FS:$fs")
        $out.Flush()
        $lastFs = $fs
    }
    if ($DebugHwnd -ne 0) { break }

    # Window geometry for perching (foreground + Claude app)
    try {
        $claudeInfo = $null
        $ch = [FSW]::FindClaude()
        if ($ch -ne [IntPtr]::Zero) {
            $claudeInfo = Rect-Info $ch
            $claudeInfo.maximized = [bool][FSW]::IsZoomed($ch)
            $claudeInfo.minimized = [bool][FSW]::IsIconic($ch)
        }
        $payload = @{ fg = $fgInfo; claude = $claudeInfo } | ConvertTo-Json -Compress -Depth 3
        if ($payload -ne $lastWin) {
            $out.WriteLine("WIN:$payload")
            $out.Flush()
            $lastWin = $payload
        }
    } catch { }

    Start-Sleep -Milliseconds ([int]($Interval * 1000))
}
