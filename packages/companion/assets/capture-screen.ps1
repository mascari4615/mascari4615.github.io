# Captures the primary screen to a PNG file.
# ASCII only on purpose: generated/invoked PowerShell files with non-ASCII
# characters break under the console codepage used here.
param(
  [Parameter(Mandatory = $true)][string]$OutPath,
  # The reader shrinks anything wider than ~1568px anyway, so carrying more
  # pixels than that costs time and buys nothing.
  [int]$MaxWidth = 1568,
  # How many to CARRY BACK -- not how many the reader is shown. The picking is
  # done on the other side, by worth rather than by tree order (140th round:
  # Discord had 292 touchable things and only 59 made the list, because the cut
  # was "first 120 in tree order" and tree order puts the window frame first).
  # This has to match press-element.ps1's -MaxElements: the numbers come from
  # walking the window, and pressing walks it again to find the same one.
  [int]$MaxElements = 600
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
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
try {
  Add-Type -TypeDefinition $dpi
  [void][CompanionDpi]::SetProcessDPIAware()
} catch {
  # Already aware (or too old to say so) -- keep going with whatever we get.
}

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

# Shoot the monitor the FOREGROUND WINDOW is on, not the primary one.
#
# The text below is read from the foreground window. If the picture is always
# taken at the primary monitor's origin, then on a multi-monitor desk the two
# describe DIFFERENT SCREENS -- and the reader gets them as one scene.
#
# Measured 2026-08-21 (138th round): the foreground window sat at
# (326,-1080,1920,1032) -- a negative y, i.e. the monitor ABOVE the primary --
# while CopyFromScreen(0, 0, ...) handed back 1568x882 of the primary. The text
# listed 120 elements of a browser the picture did not contain a single pixel of.
# That is the other half of "there is only a small F up there" (98th round).
$bounds = $null
try {
  $bounds = [System.Windows.Forms.Screen]::FromHandle([CompanionDpi]::GetForegroundWindow()).Bounds
} catch {
  $bounds = $null
}
if ($null -eq $bounds -or $bounds.Width -le 0 -or $bounds.Height -le 0) {
  # SM_CXSCREEN / SM_CYSCREEN, asked after the DPI call above, are real pixels.
  $primaryWidth = [CompanionDpi]::GetSystemMetrics(0)
  $primaryHeight = [CompanionDpi]::GetSystemMetrics(1)
  if ($primaryWidth -le 0 -or $primaryHeight -le 0) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  } else {
    $bounds = New-Object System.Drawing.Rectangle 0, 0, $primaryWidth, $primaryHeight
  }
}
$originX = $bounds.X
$originY = $bounds.Y
$width = $bounds.Width
$height = $bounds.Height

$full = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($full)
$graphics.CopyFromScreen($originX, $originY, 0, 0, $full.Size)
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

# Say WHERE this was shot and how big that area was. Without it nobody can put
# the text's coordinates back onto the picture -- and nobody can check that the
# two are even the same screen.
Write-Output ("ORIGIN=" + $originX + "," + $originY)
Write-Output ("AREA=" + $width + "," + $height)

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

# Read the foreground window as TEXT, not only as pixels.
#
# A screenshot is one modality and it fails the same way every time: small text
# is a coin flip. The 2026 consensus for computer-use agents is hybrid -- read
# the accessibility tree (UI Automation on Windows, the same API a screen reader
# uses) for anything structured, and fall back to pixels for the rest. Measured
# here 2026-08-21: 274ms for the whole foreground window, 28 elements. That is
# cheap next to the ~1s the capture above already costs.
#
# Every element carries a rectangle, which is also the raw material for the next
# step: clicking things instead of only looking at them.
$tree = '[]'
# Why the list looks the way it does.
#
# "Read nothing" has FOUR causes -- never got the window, the tree is empty,
# everything was nameless, everything was offscreen -- and collapsing them into
# one sentence makes the reader hear "the screen is blank" every time. Measured
# 2026-08-21 across every running window: Discord 532/445/350, msedge
# 777/510/233, Unity 9/9/9, WindowsTerminal 28/19/18, NVIDIA Overlay 0,
# TextInputHost 0. Note msedge: 233 onscreen against a cap of 120 -- half the
# window is dropped and the list still claims to be the whole thing.
$readRoot = 'no'
$readRaw = 0
$readNamed = 0
$readOnscreen = 0
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([Win32.Native]::GetForegroundWindow())
  if ($null -ne $root) {
    $readRoot = 'yes'
    $found = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    # Actions worth telling the reader about. Everything else is plumbing.
    $wanted = @('Invoke', 'Toggle', 'SelectionItem', 'ExpandCollapse', 'Value')
    $rows = New-Object System.Collections.ArrayList
    $readRaw = $found.Count
    # Walk the WHOLE tree even after the cap -- the counts are the point.
    # Stopping at 120 would report "120 of 120" and hide that half the window
    # never made it into the list.
    foreach ($node in $found) {
      $now = $node.Current
      $name = $now.Name
      # Nameless boxes tell the reader nothing -- they are layout, not content.
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      $readNamed++
      if ($now.IsOffscreen) { continue }
      $readOnscreen++
      if ($rows.Count -ge $MaxElements) { continue }
      $box = $now.BoundingRectangle
      # Off-screen elements report an infinite rectangle; JSON has no infinity,
      # and a reader that sees one stops trusting every other number.
      $nums = @(0, 0, 0, 0)
      if ([double]::IsInfinity($box.X) -eq $false -and [double]::IsNaN($box.X) -eq $false) {
        $nums = @([int]$box.X, [int]$box.Y, [int]$box.Width, [int]$box.Height)
      }
      # What can actually be DONE to this element.
      #
      # Reading the screen is half of it; the other half is acting on it. The way
      # that works on Windows is not "click at x,y" -- it is asking the control to
      # perform the action it already exposes (Invoke, Toggle, ...). That survives
      # window moves and DPI scaling, which coordinate clicks do not. Measured
      # 2026-08-21: 85ms for a whole window, next to ~274ms for the tree itself.
      #
      # Only the patterns that mean "a person could do this" are kept. ScrollItem
      # and friends are on nearly every node and would drown the useful ones.
      $acts = New-Object System.Collections.ArrayList
      foreach ($pattern in $node.GetSupportedPatterns()) {
        $short = $pattern.ProgrammaticName.Replace('PatternIdentifiers.Pattern', '')
        if ($wanted -contains $short) { [void]$acts.Add($short) }
      }
      # A number the reader can point at.
      #
      # Names are not unique: measured 2026-08-21, one window had 19 named
      # elements but only 12 distinct names -- four of them called "close tab".
      # Telling the reader "press close tab" is not enough to find the thing
      # again. Agents elsewhere solve this by painting numbers on the screenshot
      # (set-of-mark); we hand back a list, so the list carries the numbers.
      [void]$rows.Add([pscustomobject]@{
        i = $rows.Count + 1
        k = $now.ControlType.ProgrammaticName.Replace('ControlType.', '')
        n = $name.Substring(0, [Math]::Min(120, $name.Length))
        r = $nums
        p = @($acts)
      })
    }
    # -Compress: this travels on one line. Depth 4 is enough for {k,n,r}.
    $tree = ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress
    if ([string]::IsNullOrWhiteSpace($tree)) { $tree = '[]' }
  }
} catch {
  # No tree is survivable; a crash here is not. The picture still goes out.
  $tree = '[]'
}

# Machine-readable lines for the caller. One line each, TREE is compact JSON.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output ("TITLE=" + $title)
Write-Output ("TREE=" + $tree)
Write-Output ("READ=" + $readRoot + "," + $readRaw + "," + $readNamed + "," + $readOnscreen)
