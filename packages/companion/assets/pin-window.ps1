# Opens the companion in an app window and pins it above other windows.
# ASCII only on purpose (console codepage safety).
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [int]$Width = 420,
  [int]$Height = 640,
  [int]$Margin = 24,
  [switch]$Transparent,
  # The color the page paints its background with, RRGGBB. The caller owns this
  # value and hands the same one to the page through the URL -- if only one side
  # knows it, nothing matches and the window stays opaque.
  [string]$KeyColor = 'FF00FE'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$signature = @'
[DllImport("user32.dll")]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

[DllImport("user32.dll")]
public static extern bool IsWindowVisible(IntPtr hWnd);

[DllImport("user32.dll", SetLastError = true)]
public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

[DllImport("user32.dll")]
public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

[DllImport("user32.dll")]
public static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint crKey, byte bAlpha, uint dwFlags);

// Makes one exact color see-through. A browser cannot make its own window
// transparent, but Windows can punch out a chosen color afterwards.
public static void MakeColorTransparent(IntPtr hWnd, uint colorRef) {
  const int GWL_EXSTYLE = -20;
  const int WS_EX_LAYERED = 0x00080000;
  const uint LWA_COLORKEY = 0x00000001;
  int style = GetWindowLong(hWnd, GWL_EXSTYLE);
  SetWindowLong(hWnd, GWL_EXSTYLE, style | WS_EX_LAYERED);
  SetLayeredWindowAttributes(hWnd, colorRef, 255, LWA_COLORKEY);
}
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
$launchArgs = @(
  "--app=$Url",
  "--user-data-dir=$profileDir",
  "--window-size=$Width,$Height",
  '--no-first-run',
  '--no-default-browser-check',
  # Edge signs a fresh profile into the Windows account and syncs the user's
  # extensions in, which pops their extension and sign-in windows on every start.
  # This window is not a browser session; it should bring nothing with it.
  '--disable-sync',
  '--disable-extensions',
  '--disable-background-networking',
  '--no-service-autorun',
  '--disable-features=TranslateUI,msImplicitSignIn,msEdgeIdentityAutoSignIn,EdgeCollections,msEdgeShoppingAssist',
  '--autoplay-policy=no-user-gesture-required'
)
# Note: no --unsafely-treat-insecure-origin-as-secure. localhost is already a
# secure context, and that flag makes the browser show a warning bar that looks
# exactly like an address bar.

$process = Start-Process -FilePath $browser -ArgumentList $launchArgs -PassThru

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
  # The handle can be $null, not just zero: when a companion window is already
  # open, the browser hands the URL to that instance and this process exits, so
  # there is never a window of our own. Passing $null into the Win32 call throws
  # and the whole launch is reported as a failure -- guard it and keep trying.
  $handle = $process.MainWindowHandle
  if ($null -ne $handle -and $handle -ne [IntPtr]::Zero -and [Companion.Win]::IsWindowVisible($handle)) {
    [void][Companion.Win]::SetWindowPos($handle, $HWND_TOPMOST, $x, $y, $Width, $Height, $SWP_SHOWWINDOW)
    if ($Transparent) {
      # Windows wants the key as 0x00BBGGRR, so flip the RRGGBB the caller gave us.
      $hex = $KeyColor.TrimStart('#')
      $r = [Convert]::ToInt32($hex.Substring(0, 2), 16)
      $g = [Convert]::ToInt32($hex.Substring(2, 2), 16)
      $b = [Convert]::ToInt32($hex.Substring(4, 2), 16)
      $key = [uint32](($b -shl 16) -bor ($g -shl 8) -bor $r)
      # Give the page a moment to paint before punching the color out.
      Start-Sleep -Milliseconds 900
      [Companion.Win]::MakeColorTransparent($handle, $key)
    }
    $pinned = $true
  }
}

if ($pinned) {
  Write-Output "PINNED pid=$($process.Id)"
} else {
  Write-Output "OPENED pid=$($process.Id) (could not pin on top)"
}
