# Bring the Claude desktop app to the front, launching it if it is not running.
# Spawned by main.js on double-click / "Open Claude". Prints FOCUSED | LAUNCHED | NOTFOUND.

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CF {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static IntPtr Found = IntPtr.Zero;
  public static uint FoundPid = 0;
  public static bool Cb(IntPtr h, IntPtr lp) {
    uint p; GetWindowThreadProcessId(h, out p);
    if (!IsWindowVisible(h)) return true;
    var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
    string t = sb.ToString();
    // Main window of the Claude desktop app is titled exactly "Claude"
    if (t == "Claude" || t.StartsWith("Claude -")) {
      if (System.Diagnostics.Process.GetProcessById((int)p).ProcessName.ToLower() == "claude") {
        Found = h; FoundPid = p; return false;
      }
    }
    return true;
  }
}
"@

[CF]::EnumWindows([CF+EnumWindowsProc]{ param($h, $lp) [CF]::Cb($h, $lp) }, [IntPtr]::Zero) | Out-Null

if ([CF]::Found -ne [IntPtr]::Zero) {
    $h = [CF]::Found
    if ([CF]::IsIconic($h)) { [void][CF]::ShowWindow($h, 9) } else { [void][CF]::ShowWindow($h, 5) }  # SW_RESTORE / SW_SHOW
    # Tap Alt so Windows lets a background process take the foreground
    [CF]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [CF]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [void][CF]::SetForegroundWindow($h)
    try { (New-Object -ComObject WScript.Shell).AppActivate([int][CF]::FoundPid) | Out-Null } catch {}
    "FOCUSED"
    exit 0
}

# Not running -> launch. The Store/MSIX install lives under WindowsApps with a versioned
# folder, so resolve it through the Start menu app list instead of a hard-coded path.
$app = Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "Claude" } | Select-Object -First 1
if ($app) {
    Start-Process "explorer.exe" -ArgumentList "shell:AppsFolder\$($app.AppID)"
    "LAUNCHED $($app.AppID)"
    exit 0
}
$exe = Get-ChildItem "C:\Program Files\WindowsApps\Claude_*\app\Claude.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { $exe = Get-ChildItem "$env:LOCALAPPDATA\Programs\claude*\Claude.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 }
if ($exe) {
    Start-Process $exe.FullName
    "LAUNCHED $($exe.FullName)"
    exit 0
}
"NOTFOUND"
exit 2
