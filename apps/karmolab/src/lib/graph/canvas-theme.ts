/**
 * lib/graph/canvas-theme.ts — **판의 색을 앱 테마에서 가져온다** (2026-08-12).
 *
 * 왜 있나: 캔버스 색이 코드에 박혀 있었다(카드 바탕 `#131720`, 글 `#e2e8f0` …). 그래서 앱을
 * 밝은 테마로 바꾸면 판만 **까만 채로 남아** 다른 앱에서 오려 붙인 것처럼 보였다
 * (실측 2026-08-12, 밝은 테마 실화면).
 *
 * 왜 CSS 로 안 하고 값을 뽑아 넘기나: 판은 **SVG 한 장으로 내보내진다**(발표·공유). 색을
 * `fill: var(--x)` 로 두면 내보낸 파일에는 그 변수가 없어 글자가 까맣게 뭉개진다. 그래서
 * 그릴 때 **그 순간의 색 값**을 읽어 박는다 — 화면도 맞고 내보낸 파일도 혼자 선다.
 *
 * 테마를 바꾸면 부르는 쪽이 다시 읽어 `setTheme()` 로 넣어 준다.
 */
import type { GraphCanvasTheme } from './canvas';

/** 아무 앱에도 안 붙었을 때(시험·헤드리스) 쓰는 값 — 예전 하드코딩 그대로다. */
export const DEFAULT_THEME: Required<GraphCanvasTheme> = {
  nodeFill: '#131720',
  nodeText: '#e2e8f0',
  childText: 'rgba(226,232,240,0.65)',
  edgeDotFill: '#0a0c10',
  edgeDefaultColor: '#64748b',
  ephemeralFill: '#0f1520',
  ephemeralStroke: '#22d3ee60',
  ephemeralText: '#22d3ee',
  anchorFill: 'rgba(34,211,238,0.04)',
  anchorStroke: 'rgba(34,211,238,0.35)',
  anchorText: 'rgba(34,211,238,0.85)',
  minimapBg: 'var(--glass-strong)',
  minimapBorder: 'var(--border)',
};

/** 값이 비어 있으면 기본값 — 토큰 이름이 바뀌어도 판이 투명해지지는 않는다. */
function tok(cs: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = cs.getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * 지금 앱이 쓰는 색으로 판의 색표를 만든다.
 *
 * 흘러가는 카드·닻의 물색은 **테마와 무관한 뜻**(사람이 만든 것이 아니라는 표시)이라 그대로 둔다.
 */
export function themeFromCss(el: Element): Required<GraphCanvasTheme> {
  const cs = getComputedStyle(el);
  return {
    ...DEFAULT_THEME,
    // 카드는 판(--bg-primary)보다 한 단 위 — 밝은 테마에서는 하얀 카드가 된다.
    nodeFill: tok(cs, '--bg-secondary', DEFAULT_THEME.nodeFill),
    nodeText: tok(cs, '--text-primary', DEFAULT_THEME.nodeText),
    childText: tok(cs, '--text-secondary', DEFAULT_THEME.childText),
    // 선 위의 점은 판 색으로 뚫어야 선이 끊겨 보인다.
    edgeDotFill: tok(cs, '--bg-primary', DEFAULT_THEME.edgeDotFill),
    edgeDefaultColor: tok(cs, '--text-tertiary', DEFAULT_THEME.edgeDefaultColor),
  };
}
