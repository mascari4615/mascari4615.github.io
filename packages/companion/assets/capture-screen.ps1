# Captures the primary screen to a PNG file.
# ASCII only on purpose: generated/invoked PowerShell files with non-ASCII
# characters break under the console codepage used here.
param(
  [Parameter(Mandatory = $true)][string]$OutPath,
  # The reader shrinks anything wider than ~1568px anyway, so carrying more
  # pixels than that costs time and buys nothing.
  [int]$MaxWidth = 1568
)

$ErrorActionPreference = 'Stop'

# Declare DPI awareness BEFORE asking how big the screen is.
#
# Without this, Windows lies to us: on a 1920x1080 screen at 175% scaling it
# reports 1097x617, and CopyFromScreen then hands back a blurred-down frame of
# that size -- a third of the real pixels. Window text turns to mush, and the
# companion reads mush: the live session where it said "only a small F is up
# there" was looking at a 1097px grab of a 1920px screen. Measured 2026-08-21.
$dpi = @'
using System;
using System.Runtime.InteropServices;
public class CompanionDpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
}
'@
try {
  Add-Type -TypeDefinition $dpi
  [void][CompanionDpi]::SetProcessDPIAware()
} catch {
  # Already aware (or too old to say so) -- keep going with whatever we get.
}

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

# SM_CXSCREEN / SM_CYSCREEN, asked after the call above, are real pixels.
$width = [CompanionDpi]::GetSystemMetrics(0)
$height = [CompanionDpi]::GetSystemMetrics(1)
if ($width -le 0 -or $height -le 0) {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $width = $bounds.Width
  $height = $bounds.Height
}

$full = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($full)
$graphics.CopyFromScreen(0, 0, 0, 0, $full.Size)
$graphics.Dispose()

# Shrink before saving: a full 4K frame is slow to move around and the reader
# does not need pixel detail to tell what is on screen.
if ($full.Width -gt $MaxWidth) {
  $ratio = $MaxWidth / $full.Width
  $small = New-Object System.Drawing.Bitmap $MaxWidth, ([int]($full.Height * $ratio))
  $g2 = [System.Drawing.Graphics]::FromImage($small)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($full, 0, 0, $small.Width, $small.Height)
  $g2.Dispose()
  $full.Dispose()
  $full = $small
}

$full.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$full.Dispose()

$title = ''
try {
  # CharSet.Unicode is not optional here. Without it this binds to the old
  # byte-based call, and every non-ASCII character in the title comes back as
  # "?" -- Korean window titles turn into rows of question marks, and the
  # companion then decides what you are doing from garbage. (Measured: a browser
  # window reported as "Microsoft? Edge".)
  Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
'@
  $sb = New-Object System.Text.StringBuilder 512
  [void][Win32.Native]::GetWindowText([Win32.Native]::GetForegroundWindow(), $sb, 512)
  $title = $sb.ToString()
} catch {
  $title = ''
}

# Single machine-readable line for the caller.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output ("TITLE=" + $title)
