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
  /** 「가 — 이어진 것 3개」 처럼 **방금 고른 것**을 알리는 한 줄. */
  picked?: (name: string, links: number) => string;
  /** 선을 골랐을 때 — 「가 → 나: 친구」. */
  pickedEdge?: (from: string, to: string, label: string) => string;
  /** 여럿을 골랐을 때 — 「3장 골랐음」. */
  pickedMany?: (count: number) => string;
}

export const DEFAULT_BOARD_WORDS: BoardWords = {
  label: (nodes, edges) => `graph: ${nodes} cards, ${edges} links`,
  picked: (name, links) => `${name} — ${links} links`,
  pickedEdge: (from, to, label) => `${from} → ${to}${label ? `: ${label}` : ''}`,
  pickedMany: (count) => `${count} selected`,
};

let words: BoardWords = DEFAULT_BOARD_WORDS;

/** 화면이 뜰 때 한 번 얹는다. */
export function setBoardWords(w: BoardWords): void {
  words = w;
}

/**
 * 방금 고른 카드를 한 줄로 — **고르는 것은 눈에만 보이는 일이었다**.
 *
 * 카드를 고르면 화면은 테두리로 알리지만 읽어 주는 도구에는 아무 일도 안 일어난다(초점이 안
 * 움직이니 읽을 것도 없다). 그래서 「무엇을 골랐는지」를 말로 한 줄 흘려 준다.
 * 이름이 없는 카드는 **없는 이름을 지어내지 않는다** — 그런 카드가 있다는 사실 자체가 정보다.
 */
export function pickedLabel(name: string, links: number): string {
  const say = words.picked ?? DEFAULT_BOARD_WORDS.picked!;
  const safe = Number.isFinite(links) && links > 0 ? Math.floor(links) : 0;
  return say((name ?? '').trim() || '(…)', safe);
}

/** 고른 **선**을 한 줄로 — 카드만 말하고 선은 안 말하면 절반만 들린다. */
export function pickedEdgeLabel(from: string, to: string, label: string): string {
  const say = words.pickedEdge ?? DEFAULT_BOARD_WORDS.pickedEdge!;
  const nm = (v: string): string => (v ?? '').trim() || '(…)';
  return say(nm(from), nm(to), (label ?? '').trim());
}

/** **여럿**을 골랐을 때 — 몇 장인지가 곧 정보다. */
export function pickedManyLabel(count: number): string {
  const say = words.pickedMany ?? DEFAULT_BOARD_WORDS.pickedMany!;
  return say(Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
}

/** 지금 판을 한 줄로. 숫자가 이상해도(음수·NaN) **0 으로 읽는다** — 이름이 깨지면 안 들린다. */
export function boardLabel(nodes: number, edges: number): string {
  const safe = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return words.label(safe(nodes), safe(edges));
}

/**
 * 판(svg)에 **이름과 들어올 문**을 붙인다 — 그릴 때마다 한 번.
 *
 * ★ 이름만으로는 반쪽이었다: 판 안에서 Tab 으로 카드를 훑는 길은 **초점이 판에 있을 때만**
 * 열리는데, 판 자체가 자판 순회 대상이 아니라 **거기에 닿을 방법이 마우스뿐이었다**
 * (실측 2026-08-14: 손잡이를 다 돌아도 초점이 판에 한 번도 안 온다). `tabindex` 는 이미 있으면
 * 안 건드린다 — 화면이 제 뜻으로 뺀 것을 그림 그릴 때마다 되돌리지 않기 위해서다.
 */
export function describeBoard(svg: Element, nodes: number, edges: number): void {
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', boardLabel(nodes, edges));
  if (svg.getAttribute('tabindex') === null) svg.setAttribute('tabindex', '0');
}
