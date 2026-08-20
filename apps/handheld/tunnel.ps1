# Handheld — 유니티 로컬 서버를 https 로 노출한다 (TASK-KAR-230).
#
# 폰의 WebXR/센서는 https 에서만 돈다. quick tunnel 이면 계정도 설정도 필요 없다.
# 주소는 실행할 때마다 바뀐다 — 뜬 주소를 폰 Chrome 으로 열어라.
#
#   powershell -File apps/handheld/tunnel.ps1
#   powershell -File apps/handheld/tunnel.ps1 -Port 8842

param(
    [int]$Port = 8842
)

$ErrorActionPreference = 'Stop'

$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
if (-not (Test-Path $cf)) {
    Write-Error "cloudflared 를 못 찾았다. winget install --id Cloudflare.cloudflared"
    exit 1
}

# 유니티가 Play 중인지 먼저 본다 — 터널만 띄우고 헤매는 일이 흔하다.
$listening = $false
try {
    $listening = [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
} catch { }

if (-not $listening) {
    Write-Host "⚠ localhost:$Port 에 아무도 안 듣고 있다 — 유니티에서 Handheld 씬을 Play 했나?" -ForegroundColor Yellow
    Write-Host "  (터널은 그래도 띄운다. Play 하면 바로 붙는다)`n"
}

# ~/.cloudflared/config.yml (욘봇 named tunnel 용) 에는 ingress 규칙이 들어 있다.
# 그 파일이 잡히면 catch-all `http_status:404` 가 --url 을 눌러 **모든 요청이 빈 404** 가 된다
# (2026-08-20 실측: 로컬 200 · 터널 404 · 로그 `ingressRule=1 originService=http_status:404`).
# 그래서 이 터널만의 설정 파일을 따로 만들어 격리한다.
$cfgDir = Join-Path $env:TEMP 'handheld-tunnel'
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$cfg = Join-Path $cfgDir 'config.yml'
"url: http://127.0.0.1:$Port" | Out-File -FilePath $cfg -Encoding utf8

Write-Host "▶ 터널 여는 중 — http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "  뜨는 https://....trycloudflare.com 주소를 폰 Chrome 으로 열어라.`n"

# localhost 대신 127.0.0.1 — localhost 는 ::1 로 먼저 풀릴 수 있는데 서버는 IPv4 로 듣는다.
& $cf --config $cfg tunnel --url "http://127.0.0.1:$Port"
