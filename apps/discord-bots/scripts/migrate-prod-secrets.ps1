# yawnbot prod .env -> GitHub Secret 일괄 등록 (TASK-YB-003 secret split)
#
# 일회용 마이그레이션 helper. push 2 (workflow 갱신) 후 스크립트 자체 삭제 (자기소멸 룰).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File apps\discord-bots\scripts\migrate-prod-secrets.ps1 `
#       -EnvPath apps\discord-bots\apps\yawnbot\.env
#
# 동작:
#   1) .env 파싱 (KEY=VALUE 라인만, 주석/빈값 skip)
#   2) 각 키마다 `gh secret set YB_PROD_<KEY> --repo <repo>` 호출
#   3) 결과 보고
#
# 검증:
#   gh secret list --repo Mascari4615/Mascari4615.github.io | Select-String YB_PROD_
#
# 안전:
#   - gh CLI 인증 필요 (`gh auth status`)
#   - 기존 YB_PROD_<KEY> 값 덮어쓰기 (write-only 라 비교 불가)
#   - 빈 값은 skip (workflow 측에서 빈 값 키는 .env 라인 안 박음 — 정합)

param(
    [Parameter(Mandatory = $true)]
    [string]$EnvPath,
    [string]$Repo = 'Mascari4615/Mascari4615.github.io',
    [string]$Prefix = 'YB_PROD_'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Test-Path $EnvPath)) {
    Write-Error ".env not found: $EnvPath"
    exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "gh (GitHub CLI) not in PATH. Install: winget install --id GitHub.cli"
    exit 1
}

# gh auth 검증
$authStatus = & gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "gh not authenticated. Run: gh auth login"
    exit 1
}

Write-Host "[migrate-prod-secrets] reading $EnvPath -> repo $Repo (prefix $Prefix)" -ForegroundColor Cyan
Write-Host ""

$count = 0
$skipped = 0
$failed = 0

Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) {
        return
    }
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        Write-Warning "skip non-KEY=VALUE line: $line"
        $script:skipped++
        return
    }
    $key = $matches[1]
    $value = $matches[2]
    # quote 제거 (env 파일 흔히 쓰는 양쪽 따옴표)
    if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
        $value = $matches[1]
    }
    if (-not $value) {
        Write-Host "  skip empty: $key" -ForegroundColor DarkGray
        $script:skipped++
        return
    }
    $secretName = "$Prefix$key"
    Write-Host "  set $secretName ..." -NoNewline

    # gh secret set --body "$value" — 큰따옴표 포함 값에 안전하기 위해 stdin 으로
    $value | & gh secret set $secretName --repo $Repo 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
        $script:failed++
        return
    }
    Write-Host " OK" -ForegroundColor Green
    $script:count++
}

Write-Host ""
Write-Host "=== 결과 ===" -ForegroundColor Cyan
Write-Host "  set:     $count"
Write-Host "  skipped: $skipped"
Write-Host "  failed:  $failed"

if ($failed -gt 0) {
    exit 1
}

Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "  1. 검증: gh secret list --repo $Repo | Select-String $Prefix"
Write-Host "  2. push 2 (workflow 갱신) 가 master 박히면 deploy 가 자동 새 secrets 사용"
Write-Host "  3. 확인 후 본 스크립트 + 옛 YB_PROD_ENV blob secret 폐기"
