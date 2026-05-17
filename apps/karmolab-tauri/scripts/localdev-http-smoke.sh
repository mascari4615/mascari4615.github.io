#!/usr/bin/env bash
# TASK-KL-065 — 비-GUI localdev HTTP 인터페이스 자가구동 스모크.
#
# 전제: 새 코드가 포함된 karmolab-desktop(데스크톱 앱)이 떠 있어야 한다
#       (HTTP 리스너는 .setup 훅에서 기동 — 앱 없으면 카드도 안 됨, 자연 전제).
# 동작: health → repo-root get → tracked → log(스냅샷) → (옵션) start/stop.
#       기본은 *비파괴* 읽기 경로만. PROFILE 인자를 주면 start→tracked→stop 까지.
#
# 사용:
#   bash localdev-http-smoke.sh                 # 읽기 전용 스모크
#   bash localdev-http-smoke.sh yawnbot-tunnel  # start/stop 라운드트립 포함
#
# 토큰/포트는 앱이 자동 생성한 localdev-http.json 에서 읽는다.
set -euo pipefail

CFG="${LOCALDEV_HTTP_CONFIG:-$LOCALAPPDATA/com.mascari4615.karmolab/localdev-http.json}"
if [[ ! -f "$CFG" ]]; then
  # Tauri identifier 변형 대비 — 최근 수정된 localdev-http.json 자동 탐색.
  CFG="$(find "$LOCALAPPDATA" -maxdepth 3 -name localdev-http.json 2>/dev/null | head -1 || true)"
fi
[[ -f "$CFG" ]] || { echo "FAIL: localdev-http.json 미발견 (앱이 한 번 떠야 생성됨): $CFG"; exit 1; }

PORT="$(node -e "console.log(require('$CFG').port)")"
TOKEN="$(node -e "console.log(require('$CFG').token)")"
BASE="http://127.0.0.1:${PORT}/localdev"
AUTH="Authorization: Bearer ${TOKEN}"
PROFILE="${1:-}"

echo "[smoke] base=$BASE  cfg=$CFG"

pass() { echo "  PASS $1"; }
req()  { curl -fsS -m 15 -H "$AUTH" "$@"; }

# 1) health (무인증)
curl -fsS -m 5 "$BASE/health" | grep -q '"ok":true' && pass "health"

# 2) repo-root 조회 (인증 검증 겸)
req "$BASE/repo-root" | grep -q '"ok":true' && pass "repo-root(get) + auth"

# 3) 인증 없으면 401
code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$BASE/tracked")"
[[ "$code" == "401" ]] && pass "no-token → 401"

# 4) tracked 목록
req "$BASE/tracked" | grep -q '"ok":true' && pass "tracked"

if [[ -n "$PROFILE" ]]; then
  # 5) start → tracked 에 포함 → log 스냅샷 → stop (라운드트립)
  req -X POST -H 'Content-Type: application/json' \
      -d "{\"profile\":\"$PROFILE\"}" "$BASE/start" | grep -q '"ok":true' \
    && pass "start $PROFILE"
  sleep 2
  req "$BASE/tracked" | grep -q "\"$PROFILE\"" && pass "tracked contains $PROFILE"
  req "$BASE/log?profile=$PROFILE&tail=20" | grep -q '"ok":true' && pass "log snapshot"
  req -X POST -H 'Content-Type: application/json' \
      -d "{\"profile\":\"$PROFILE\"}" "$BASE/stop" | grep -q '"ok":true' \
    && pass "stop $PROFILE"
fi

echo "[smoke] ALL PASS"
