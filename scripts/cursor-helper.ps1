# CCPet cursor helper: long-lived, reads commands on stdin.
#   SET <x> <y>   move the mouse cursor to physical screen pixel (x, y)
#   QUIT          exit
# Spawned lazily by main.js for the "steal the cursor" mischief. ASCII only.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Cur {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@
[void][Cur]::SetProcessDPIAware()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line -eq "QUIT") { break }
    if ($line -match '^SET (-?\d+) (-?\d+)$') {
        [void][Cur]::SetCursorPos([int]$matches[1], [int]$matches[2])
    }
}
