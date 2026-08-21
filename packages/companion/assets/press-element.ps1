# Presses one element on the foreground window, by the number the reader saw.
#
# ASCII only on purpose: PS 5.1 reads non-BOM files as the console codepage, and
# a Korean comment here turns the whole file into a parse error (measured).
#
# Why by number and not by name: names are not unique. Measured 2026-08-21, one
# window had 19 named elements but only 12 distinct names -- four of them
# "close tab". The number comes from the same walk capture-screen.ps1 does, so
# both sides count the elements the same way.
#
# Why Invoke and not a coordinate click: the control performs the action it
# already exposes, so it survives window moves and DPI scaling. Coordinate
# clicks do not, and they fail silently. Surveyed 2026-08-21: on the apps we
# actually sit next to, about half of the named elements expose Invoke
# (file explorer: 77 of 86 expose something actionable).
param(
  [Parameter(Mandatory = $true)][int]$Number,
  # What the reader thought it was pressing. If the tree moved under us, the
  # name will not line up and we stop instead of pressing the wrong thing.
  [string]$ExpectName = '',
  [int]$MaxElements = 120
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Namespace Win32Press -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = [System.Windows.Automation.AutomationElement]::FromHandle([Win32Press.Native]::GetForegroundWindow())
if ($null -eq $root) { Write-Output 'PRESS=no-window'; exit 1 }

$found = $root.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.Condition]::TrueCondition)

# Walk exactly like capture-screen.ps1 does, so the numbers line up.
$index = 0
$target = $null
$targetName = ''
foreach ($node in $found) {
  if ($index -ge $MaxElements) { break }
  $now = $node.Current
  if ([string]::IsNullOrWhiteSpace($now.Name)) { continue }
  if ($now.IsOffscreen) { continue }
  $index++
  if ($index -eq $Number) { $target = $node; $targetName = $now.Name; break }
}

if ($null -eq $target) { Write-Output "PRESS=no-element number=$Number seen=$index"; exit 1 }

if ($ExpectName -ne '' -and $targetName -ne $ExpectName) {
  # The screen moved between looking and pressing. Pressing anyway is how an
  # agent closes the wrong tab.
  Write-Output ("PRESS=moved expected=" + $ExpectName + " found=" + $targetName)
  exit 1
}

# What the window looked like BEFORE. "Pressed" and "it worked" are not the
# same statement -- saying only the first is how an agent reports success for
# something that did nothing. Cheap version of what the field calls a
# post-condition: window name plus how many named things are on screen.
function Get-WindowShape($element) {
  $name = $element.Current.Name
  $count = 0
  try {
    $kids = $element.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($kid in $kids) {
      if ([string]::IsNullOrWhiteSpace($kid.Current.Name) -eq $false) { $count++ }
    }
  } catch { $count = -1 }
  return @{ name = $name; count = $count }
}
$before = Get-WindowShape $root

$patterns = @()
foreach ($p in $target.GetSupportedPatterns()) {
  $patterns += $p.ProgrammaticName.Replace('PatternIdentifiers.Pattern', '')
}

# Invoke first; a checkbox-like thing exposes Toggle instead; a list row exposes
# SelectionItem. Anything else, we say we cannot press it -- there is no
# coordinate fallback on purpose (see TASK-KAR-241).
$how = ''
if ($patterns -contains 'Invoke') {
  $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $how = 'Invoke'
} elseif ($patterns -contains 'Toggle') {
  $target.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle()
  $how = 'Toggle'
} elseif ($patterns -contains 'SelectionItem') {
  $target.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
  $how = 'Select'
}
if ($how -ne '') {
  # Give the window a moment to react, then look again.
  Start-Sleep -Milliseconds 600
  $after = Get-WindowShape $root
  Write-Output ("PRESS=ok how=" + $how + " name=" + $targetName +
    " was=" + $before.name + " now=" + $after.name +
    " count=" + $before.count + ">" + $after.count)
} else {
  Write-Output ("PRESS=cannot name=" + $targetName + " patterns=" + ($patterns -join ','))
  exit 1
}
