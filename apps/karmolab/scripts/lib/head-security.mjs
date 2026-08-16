/**
 * **머리에 박는 보안 한 줄 — 한 벌** (2026-08-16)
 *
 * 왜: 이 사이트는 GitHub Pages 로 나간다. 실측(2026-08-16) 응답 헤더에 보안 헤더가 **하나도**
 * 없다 — 그리고 Pages 에서는 헤더를 못 붙인다. 붙일 수 있는 자리는 `<meta http-equiv>` 뿐이다.
 *
 * 무엇을 막나 — 스크립트를 막는 게 아니라 **끼어든 스크립트가 할 수 있는 일**을 줄인다:
 *   object-src 'none'  — 플러그인(<object>/<embed>) 주입. 우리는 0개 쓴다.
 *   base-uri 'self'    — <base> 를 심어 모든 상대경로를 남의 서버로 돌리는 수법. 우리는 안 쓴다.
 *   form-action 'self' — 폼 제출을 남의 서버로 돌려 입력값을 빼가는 수법.
 *                        우리 폼 12개는 전부 `action` 없이 JS 가 처리한다(확인함).
 *
 * 왜 script-src 를 안 넣나: 지금 화면은 인라인 스크립트·인라인 스타일 위에 서 있다.
 * 그것부터 막으면 사이트가 통째로 죽는다 — 「깨지는 안전」은 곧 꺼진다.
 * 여기 있는 셋은 **아무것도 안 깨면서** 흔한 확대 경로 셋을 닫는다. 나머지는 인라인을
 * 줄여 가며 한 칸씩(그 진행은 스타일 SSOT 작업과 같은 줄기다).
 *
 * frame-ancestors·report-uri 는 meta 에서 무시된다 — 넣지 않는다(있는 척이 제일 나쁘다).
 */
export const CSP_CONTENT = "object-src 'none'; base-uri 'self'; form-action 'self'";
export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}">`;
