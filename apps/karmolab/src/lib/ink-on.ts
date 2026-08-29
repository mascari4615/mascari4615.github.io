/**
 * 이 바탕 위에 **어느 글자색이 읽히나**. 밝기 문턱 대신 실제로 재서 고른다 (2026-08-13)
 *
 * 무작위 뽑기의 색 카드는 바탕이 매번 다르다. 예전에는 체감 밝기(YIQ)가 0.6 을 넘으면 검정
 * 이라는 문턱 하나로 정했는데, 순수 초록 `#00ff00` 의 YIQ 는 0.587 이라 문턱을 못 넘고
 * **흰 글자**가 됐다. 그때 대비가 1.22 다(기준 2.2). 전 색을 훑어 보면 문턱 방식의 최악은
 * 1.22, 두 후보를 재서 고르는 방식의 최악은 **3.13** 이다. 문턱은 어디에 두든 그 언저리에서 틀린다.
 *
 * 글자가 반투명이면 **바탕과 섞인 뒤의 색**으로 재야 맞다. 그래서 후보에 불투명도를 함께 준다.
 */

/** sRGB 한 칸을 빛의 양으로 (WCAG). */
function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(rgb: number[]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** `#rrggbb` → `[r, g, b]`. 못 읽으면 `null`. */
export function parseHex(hex: string): number[] | null {
  const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** 두 색의 대비 (1 ~ 21). */
export function contrastRatio(a: number[], b: number[]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 반투명 글자를 바탕 위에 얹은 뒤의 색. */
function over(fg: number, alpha: number, bg: number[]): number[] {
  return bg.map((c) => fg * alpha + c * (1 - alpha));
}

export interface InkChoice {
  /** 'dark' = 검정 글자가 낫다, 'light' = 흰 글자가 낫다 */
  kind: 'dark' | 'light';
  /** 고른 쪽의 대비. 검사, 진단용 */
  ratio: number;
}

/**
 * 이 바탕 위에서 **더 잘 읽히는** 글자색을 고른다.
 * @param hex 바탕색 `#rrggbb`
 * @param lightAlpha 흰 글자 불투명도 (기본 0.8)
 * @param darkAlpha 검정 글자 불투명도 (기본 0.6)
 */
export function inkOn(hex: string, lightAlpha = 0.8, darkAlpha = 0.6): InkChoice {
  const bg = parseHex(hex);
  if (!bg) return { kind: 'light', ratio: 0 };
  const dark = contrastRatio(over(0, darkAlpha, bg), bg);
  const light = contrastRatio(over(255, lightAlpha, bg), bg);
  return dark > light ? { kind: 'dark', ratio: dark } : { kind: 'light', ratio: light };
}
