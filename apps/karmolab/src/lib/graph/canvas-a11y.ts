/**
 * lib/graph/canvas-a11y.ts — **판을 글로도 알린다** (TASK-KL-271).
 *
 * 그림 판은 화면 읽어 주는 도구에게 아무 말도 안 한다 — 「여기 무엇이 있는지」조차 모른 채
 * 지나간다(실측 2026-08-14: svg 에 이름도 설명도 없었다). 낱낱을 다 읽어 주는 것은 이 판의
 * 일이 아니지만(그건 표 칸·관계망 칸이 한다) **무엇이 얼마나 있는지** 한 줄은 있어야 한다.
 *
 * 말은 자료 층이 아니라 **화면이 정한다** — 여기 기본값은 중립적인 영어고, 위젯이 제 나라 말을
 * 얹는다(`notes.ts` 의 말 얹기와 같은 손).
 */

export interface BoardWords {
  /** 「카드 N장, 선 M개」 같은 한 줄. */
  label: (nodes: number, edges: number) => string;
}

export const DEFAULT_BOARD_WORDS: BoardWords = {
  label: (nodes, edges) => `graph: ${nodes} cards, ${edges} links`,
};

let words: BoardWords = DEFAULT_BOARD_WORDS;

/** 화면이 뜰 때 한 번 얹는다. */
export function setBoardWords(w: BoardWords): void {
  words = w;
}

/** 지금 판을 한 줄로. 숫자가 이상해도(음수·NaN) **0 으로 읽는다** — 이름이 깨지면 안 들린다. */
export function boardLabel(nodes: number, edges: number): string {
  const safe = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return words.label(safe(nodes), safe(edges));
}
