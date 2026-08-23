/**
 * 주사위 — 눈을 **점으로 그린다** (change.arcade-redesign)
 *
 * 여태 `⚀⚁⚂` 글자를 썼는데 우리 글꼴에 그 글자가 없어 **두부(□)** 로 나왔다(실측: 주사위
 * 요트·거짓말 주사위 두 판). 글꼴에 없는 글자는 기다려도 안 온다 — 점을 직접 찍으면
 * 어느 기계에서도 같고, 크기를 키워도 또렷하다.
 *
 * 배치는 진짜 주사위와 같다: 홀수 눈은 가운데가 차고, 6은 두 줄이 셋씩.
 */

/** 3×3 자리 중 어디에 점이 찍히나 (0~8, 왼쪽 위부터). */
const SPOTS: number[][] = [
  [],
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8]
];

export interface DieOpts {
  /** 남겨 둔 주사위 (다시 안 굴린다) */
  keep?: boolean;
  /** 누를 수 있나 */
  can?: boolean;
  /** 단추에 붙일 표 */
  data?: Record<string, string | number>;
  /** 글자 대신 읽는 기계에 남길 말 */
  label?: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 눈 하나. `n` 은 1~6, 0 이면 빈 주사위(아직 안 굴림). */
export function die(n: number, o: DieOpts = {}): string {
  const on = new Set(SPOTS[Math.max(0, Math.min(6, n))] ?? []);
  const pips = Array.from({ length: 9 }, (_, i) => '<i' + (on.has(i) ? ' class="ac-on"' : '') + '></i>').join('');
  const d = Object.entries(o.data ?? {})
    .map(([k, v]) => ' data-' + k + '="' + esc(String(v)) + '"')
    .join('');
  const cls = 'ac-die' + (o.keep ? ' ac-keep' : '') + (o.can ? ' ac-can' : '');
  return (
    '<button class="' + cls + '"' + d +
    ' aria-label="' + esc(o.label ?? String(n)) + '"' + (o.can ? '' : ' disabled') + '>' +
    pips + '</button>'
  );
}

/** 글 속에 섞어 쓰는 작은 눈 (「2×⚁」 같은 자리). 단추가 아니라 표시다. */
export function diePip(n: number): string {
  const on = new Set(SPOTS[Math.max(0, Math.min(6, n))] ?? []);
  return (
    '<span class="ac-die ac-mini" aria-label="' + n + '">' +
    Array.from({ length: 9 }, (_, i) => '<i' + (on.has(i) ? ' class="ac-on"' : '') + '></i>').join('') +
    '</span>'
  );
}
