#!/usr/bin/env pwsh
# generate.ps1 — dev 아이콘 생성 (TASK-KL-039)
#
# 소스 아이콘에 빨간 원 배지 추가 → icons/dev/ 저장.
# 알고리즘 = lib.rs::apply_dev_overlay_rgba 와 동일:
#   center = (width*3/4, height/4), radius = min(w,h)/5, rgba(220,60,60,255)
#
# 실행: pwsh -File apps/karmolab-tauri/src-tauri/icons/dev/generate.ps1
# 워킹 디렉토리: 레포 루트 또는 apps/karmolab-tauri/src-tauri

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconsDir  = Split-Path -Parent $scriptDir   # icons/
$devDir    = $scriptDir                      # icons/dev/

$sources = @(
    "32x32.png",
    "128x128.png",
    "128x128@2x.png"
)

foreach ($name in $sources) {
    $src = Join-Path $iconsDir $name
    $dst = Join-Path $devDir $name

    if (-not (Test-Path $src)) {
        Write-Warning "Source not found: $src — skip"
        continue
    }

    $bmp = [System.Drawing.Bitmap]::new($src)
    $w   = $bmp.Width
    $h   = $bmp.Height
    $cx  = [int]($w * 3 / 4)
    $cy  = [int]($h / 4)
    $r   = [int]([Math]::Min($w, $h) / 5)
    $r2  = $r * $r

    for ($y = [Math]::Max(0, $cy - $r); $y -le [Math]::Min($h - 1, $cy + $r); $y++) {
        for ($x = [Math]::Max(0, $cx - $r); $x -le [Math]::Min($w - 1, $cx + $r); $x++) {
            $dx = $x - $cx
            $dy = $y - $cy
            if ($dx * $dx + $dy * $dy -le $r2) {
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 220, 60, 60))
            }
        }
    }

    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $dst"
}

Write-Host "Done. dev icons in: $devDir"
