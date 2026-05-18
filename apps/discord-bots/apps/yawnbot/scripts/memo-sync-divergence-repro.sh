#!/usr/bin/env bash
# TASK-KAR-MEMOSYNC — prod memo 동결 근본 fix 의 헤드리스 재현·증명 스크립트.
#
# 황금의 정신 하드게이트: fix 가 "divergence 를 구조적으로 불가능"하게
# 만드는지 추측 X, 결정적 재현 루프로 실증. 외부 네트워크/시크릿 0 — 전부
# 로컬 bare repo + clone 으로 deploy 의 fetch+reset 시퀀스를 재현.
#
# 시나리오:
#   #1 part2(untrack) 적용 → 봇 런타임 mutate → git status = clean(untracked만)
#   #2 origin 새 커밋 → fetch + reset --hard → 성공 + 런타임 값 *보존*
#   #3 대조: part2 *미*적용(tracked) → 같은 시퀀스 → reset 이 런타임 *날림*
#            (= 현 prod 버그 재현 + part2 가 실제로 고침을 입증)
#
# PASS 기준: #1 clean, #2 보존, #3 파괴 — 셋 다 충족해야 exit 0.
set -euo pipefail

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
GI_PATTERN='characters/.active.json
characters/*/relationship.json
characters/*/memory/mood.json
characters/*/memory/logs/'

pass=0
fail=0
ok()   { echo "  PASS — $1"; pass=$((pass+1)); }
ng()   { echo "  FAIL — $1"; fail=$((fail+1)); }

# ── 공통: origin bare + 작업 clone 생성 ──────────────────────────────────
make_origin() {
  local origin="$1" seedmode="$2"   # seedmode = tracked | untracked
  git init -q --bare -b main "$origin"
  local seed="$WORK/seed"
  rm -rf "$seed"; git init -q -b main "$seed"
  git -C "$seed" config user.email t@t; git -C "$seed" config user.name t
  git -C "$seed" config core.autocrlf false
  mkdir -p "$seed/characters/yawn/memory/logs"
  echo '{"default":"yawn","channels":{}}'        > "$seed/characters/.active.json"
  echo '{"conversationCount":0,"level":0}'       > "$seed/characters/yawn/relationship.json"
  echo '{"mood":"seed","updatedAt":"2026-01-01"}'> "$seed/characters/yawn/memory/mood.json"
  echo '# seed log'                              > "$seed/characters/yawn/memory/logs/2026-01-01.md"
  echo '# canon card (정의 — 항상 tracked)'      > "$seed/characters/yawn/card.md"
  if [ "$seedmode" = "untracked" ]; then
    printf '%s\n' "$GI_PATTERN" > "$seed/.gitignore"
    git -C "$seed" add .gitignore "characters/yawn/card.md"
  else
    git -C "$seed" add -A
  fi
  git -C "$seed" commit -qm "seed ($seedmode)"
  git -C "$seed" push -q "$origin" main
}

mutate_runtime() {           # 봇 런타임 mutate 시뮬 (실 서비스 write 와 동형)
  local c="$1"
  # 실 서비스 initialize() 가 fs.mkdirSync(recursive) 로 self-heal 하는 것과 동형
  # (클린 클론엔 gitignored 런타임 디렉토리가 없음 — 봇이 첫 실행 시 생성).
  mkdir -p "$c/characters/yawn/memory/logs"
  echo '{"default":"yawn","channels":{"123":{"core":"echo","skin":"yawn"}}}' > "$c/characters/.active.json"
  echo '{"conversationCount":42,"level":3}' > "$c/characters/yawn/relationship.json"
  echo '{"mood":"행복","updatedAt":"2026-05-18"}' > "$c/characters/yawn/memory/mood.json"
  echo '[12:00 채널] **나**: 런타임 대화' >> "$c/characters/yawn/memory/logs/2026-01-01.md"
}

push_new_origin_commit() {   # origin 에 새 정본 커밋 (deploy 가 당겨올 변경)
  local origin="$1" sd="$WORK/pusher"
  rm -rf "$sd"; git clone -q "$origin" "$sd"
  git -C "$sd" config user.email t@t; git -C "$sd" config user.name t; git -C "$sd" config core.autocrlf false
  echo "new canon $(date +%s)" > "$sd/NEWCANON.md"
  git -C "$sd" add NEWCANON.md
  git -C "$sd" commit -qm "feat: 새 정본 (deploy 가 fetch+reset 로 받아야)"
  git -C "$sd" push -q origin main
}

# deploy-discord-bots.yml 의 part3 결정화 시퀀스 (동형 재현)
deploy_memo_sync() {
  local c="$1"
  git -C "$c" fetch -q origin main
  git -C "$c" reset --hard -q FETCH_HEAD
}

echo "=== #1+#2  part2 적용(untrack) — divergence 구조적 불가 + 런타임 보존 ==="
O1="$WORK/o1.git"; C1="$WORK/c1"
make_origin "$O1" untracked
git clone -q "$O1" "$C1"
git -C "$C1" config user.email t@t; git -C "$C1" config user.name t; git -C "$C1" config core.autocrlf false
mutate_runtime "$C1"

# #1 — 핵심 주장: 봇이 상시 mutate 해도 *런타임 파일*은 tracked diff 0
#   (= 봇 mutate 가 origin divergence 를 만들 수 없음 = merge/reset 동결 불가).
#   라인엔딩 등 무관 노이즈 배제 위해 *런타임 경로*만 명시 검사 (구조 주장 직격).
RUNTIME_TRACKED_DIFF="$(git -C "$C1" status --porcelain -- \
  characters/.active.json 'characters/*/relationship.json' \
  'characters/*/memory/mood.json' 'characters/*/memory/logs/' \
  | grep -vE '^\?\? ' || true)"
if [ -z "$RUNTIME_TRACKED_DIFF" ]; then
  ok "#1 봇 런타임 mutate 후 런타임 파일 tracked diff = 0 (gitignore 처리, untracked 만) → origin divergence 구조적 불가 → merge/reset 동결 불가"
else
  ng "#1 런타임 tracked diff 잔존 (divergence 엔진 살아있음): $RUNTIME_TRACKED_DIFF"
fi
# 보조 단언: 런타임 4종이 실제로 git-ignored (untracked) 인지 명시 확인
IGN_OK=1
for f in characters/.active.json characters/yawn/relationship.json \
         characters/yawn/memory/mood.json; do
  git -C "$C1" check-ignore -q "$f" || IGN_OK=0
done
if [ "$IGN_OK" = 1 ]; then ok "#1 런타임 4종 git check-ignore 확인 (= .gitignore 가 실제 제외)"
else ng "#1 일부 런타임 파일이 ignore 되지 않음 (gitignore 패턴 불일치)"; fi

# #2 — origin 새 커밋 → fetch+reset → 성공 + 런타임 값 보존
push_new_origin_commit "$O1"
MOOD_BEFORE="$(cat "$C1/characters/yawn/memory/mood.json")"
deploy_memo_sync "$C1"
if [ -f "$C1/NEWCANON.md" ]; then ok "#2 fetch+reset 성공 — 새 origin 정본 prod 도달 (동결 해소)"
else ng "#2 새 정본 미도달"; fi
MOOD_AFTER="$(cat "$C1/characters/yawn/memory/mood.json" 2>/dev/null || echo MISSING)"
if [ "$MOOD_AFTER" = '{"mood":"행복","updatedAt":"2026-05-18"}' ]; then
  ok "#2 reset --hard 가 untracked 런타임 *보존* (mood='행복' 생존, 값 불변)"
else
  ng "#2 런타임 손실/변형: before=$MOOD_BEFORE after=$MOOD_AFTER"
fi

echo
echo "=== #3  대조: part2 *미*적용(tracked) — 현 prod 버그 재현 ==="
O3="$WORK/o3.git"; C3="$WORK/c3"
make_origin "$O3" tracked
git clone -q "$O3" "$C3"
git -C "$C3" config user.email t@t; git -C "$C3" config user.name t; git -C "$C3" config core.autocrlf false
mutate_runtime "$C3"

# tracked 면 봇 mutate 가 곧 tracked diff = divergence 엔진
PORC3="$(git -C "$C3" status --porcelain)"
if echo "$PORC3" | grep -qE '^ ?M .*(mood\.json|\.active\.json|relationship\.json|logs/)'; then
  ok "#3 (재현) tracked 라 봇 mutate = tracked diff → origin divergence 엔진 확인"
else
  ng "#3 예상과 달리 tracked diff 없음: $PORC3"
fi

push_new_origin_commit "$O3"
deploy_memo_sync "$C3"   # 현 워크플로 = merge 댄스였지만 결정화 후엔 reset --hard
MOOD3="$(cat "$C3/characters/yawn/memory/mood.json" 2>/dev/null || echo MISSING)"
if [ "$MOOD3" = '{"mood":"seed","updatedAt":"2026-01-01"}' ]; then
  ok "#3 (입증) tracked 면 reset --hard 가 런타임을 origin(seed)으로 *되돌림* — 봇 상태 파괴. part2(untrack)가 이걸 고침(#2 대조)"
else
  ng "#3 예상 파괴 미발생: $MOOD3"
fi

echo
echo "================ 결과: PASS=$pass  FAIL=$fail ================"
[ "$fail" -eq 0 ] || { echo "재현 실패 — fix 미증명"; exit 1; }
echo "재현 증명 완료 — part2(untrack) 가 divergence 를 구조적으로 불가능하게 만들고, reset --hard 가 런타임을 보존함을 #2↔#3 대조로 실증."
