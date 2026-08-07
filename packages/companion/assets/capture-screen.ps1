# Captures the primary screen to a PNG file.
# ASCII only on purpose: generated/invoked PowerShell files with non-ASCII
# characters break under the console codepage used here.
param(
  [Parameter(Mandatory = $true)][string]$OutPath,
  [int]$MaxWidth = 1280
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$full = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($full)
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $full.Size)
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
