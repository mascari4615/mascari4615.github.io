# Prints milliseconds since the last keyboard/mouse input.
# ASCII only on purpose (console codepage safety).
$ErrorActionPreference = 'Stop'

$signature = @'
[StructLayout(LayoutKind.Sequential)]
public struct LASTINPUTINFO {
  public uint cbSize;
  public uint dwTime;
}

[DllImport("user32.dll")]
public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

public static uint IdleMs() {
  LASTINPUTINFO info = new LASTINPUTINFO();
  info.cbSize = (uint)Marshal.SizeOf(info);
  if (!GetLastInputInfo(ref info)) return 0;
  return (uint)Environment.TickCount - info.dwTime;
}
'@

# No -UsingNamespace here: Add-Type already emits `using System.Runtime.InteropServices;`
# for MemberDefinition, and repeating it is a compile error.
Add-Type -Namespace Companion -Name Idle -MemberDefinition $signature
Write-Output ([Companion.Idle]::IdleMs())
