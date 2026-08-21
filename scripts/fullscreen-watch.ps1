# CCPet fullscreen watcher
# Polls the foreground window; prints "FS:1" when a borderless window covers its
# whole monitor (fullscreen game / video), "FS:0" otherwise. Only prints on change.
# Spawned by main.js with: powershell -NoProfile -ExecutionPolicy Bypass -File fullscreen-watch.ps1 -SelfPid <pid>
param(
    [int]$SelfPid = 0,
    [double]$Interval = 1.5,
    [long]$DebugHwnd = 0   # evaluate this window once instead of polling the foreground (for tests)
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
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cb; public RECT rcMonitor; public RECT rcWork; public uint flags; }
}
"@

$ignoreClasses = @("Progman", "WorkerW", "Shell_TrayWnd", "Windows.UI.Core.CoreWindow")
$last = -1
$out = [Console]::Out

while ($true) {
    $fs = 0
    try {
        if ($DebugHwnd -ne 0) { $h = [IntPtr]$DebugHwnd } else { $h = [FSW]::GetForegroundWindow() }
        if ($h -ne [IntPtr]::Zero) {
            $wpid = [uint32]0
            [void][FSW]::GetWindowThreadProcessId($h, [ref]$wpid)
            $sb = New-Object System.Text.StringBuilder 256
            [void][FSW]::GetClassName($h, $sb, 256)
            $cls = $sb.ToString()
            if (($wpid -ne $SelfPid) -and ($ignoreClasses -notcontains $cls)) {
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
            }
        }
    } catch { }
    if ($fs -ne $last) {
        $out.WriteLine("FS:$fs")
        $out.Flush()
        $last = $fs
    }
    if ($DebugHwnd -ne 0) { break }
    Start-Sleep -Milliseconds ([int]($Interval * 1000))
}
