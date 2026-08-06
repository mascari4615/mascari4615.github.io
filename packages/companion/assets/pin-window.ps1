# Opens the companion in an app window and pins it above other windows.
# ASCII only on purpose (console codepage safety).
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [int]$Width = 420,
  [int]$Height = 640,
  [int]$Margin = 24
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$signature = @'
[DllImport("user32.dll")]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

[DllImport("user32.dll")]
public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

[DllImport("user32.dll")]
public static extern bool IsWindowVisible(IntPtr hWnd);
'@
Add-Type -Namespace Companion -Name Win -MemberDefinition $signature

# Find a Chromium-family browser. App mode gives a window with no tabs or address bar.
$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Error 'No Chrome or Edge found.'
  exit 1
}

# A dedicated profile keeps the companion window out of the normal browsing session
# and lets microphone permission stick without touching the main profile.
$profileDir = Join-Path $env:LOCALAPPDATA 'companion-window'
$args = @(
  "--app=$Url",
  "--user-data-dir=$profileDir",
  "--window-size=$Width,$Height",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=TranslateUI',
  "--unsafely-treat-insecure-origin-as-secure=$Url",
  '--autoplay-policy=no-user-gesture-required'
)

$process = Start-Process -FilePath $browser -ArgumentList $args -PassThru

# Bottom-right of the working area, above the taskbar.
$work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$x = $work.Right - $Width - $Margin
$y = $work.Bottom - $Height - $Margin

$HWND_TOPMOST = [IntPtr](-1)
$SWP_SHOWWINDOW = 0x0040

# The window is not there the instant the process starts, so keep trying briefly.
$pinned = $false
for ($i = 0; $i -lt 60 -and -not $pinned; $i++) {
  Start-Sleep -Milliseconds 250
  $process.Refresh()
  $handle = $process.MainWindowHandle
  if ($handle -ne [IntPtr]::Zero -and [Companion.Win]::IsWindowVisible($handle)) {
    [void][Companion.Win]::SetWindowPos($handle, $HWND_TOPMOST, $x, $y, $Width, $Height, $SWP_SHOWWINDOW)
    $pinned = $true
  }
}

if ($pinned) {
  Write-Output "PINNED pid=$($process.Id)"
} else {
  Write-Output "OPENED pid=$($process.Id) (could not pin on top)"
}
