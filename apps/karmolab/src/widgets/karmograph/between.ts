/**
 * between.ts. **두 카드 사이** (TASK-KL-271 X6).
 *
 * 관계도 앞에서 사람이 가장 자주 하는 질문은 이 둘은 무슨 사이야?다. 그런데 지금까지 그
 * 질문에 답하는 자리가 없었다. 눈으로 선을 따라가는 수밖에. 둘을 고르면 **가장 짧은 길**과
 * **둘 다와 이어진 사람**을 말해 준다.
 *
 * 순수 함수로 둔다: 길찾기는 눈으로 못 보는 셈법이라(고리, 끊긴 그래프, 같은 카드 두 번) 화면을
 * 띄워 확인하면 늦다.
 */

export interface BetweenEdge {
  from: string;
  to: string;
}

export interface BetweenResult {
  /** 시작에서 끝까지의 카드 id 들(양끝 포함). 길이 없으면 빈 배열. */
  path: string[];
  /** 둘 **모두**와 곧바로 이어진 카드 id 들. 둘을 아는 사람. */
  shared: string[];
}

/** 이웃 표. 선은 방향이 있어도 사이를 물을 때는 양쪽으로 걷는다. */
function neighbourMap(edges: BetweenEdge[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string): void => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)?.add(b);
  };
  for (const e of edges) {
    if (!e.from || !e.to || e.from === e.to) continue;
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return m;
}

/**
 * 두 카드 사이의 가장 짧은 길과 공통 이웃.
 *
 * 너비 우선으로 걷는다. 관계도는 수백 장 규모라 이걸로 충분하고, **길이가 같으면 먼저 찾은
 * 것**을 준다(같은 판에서 두 번 물으면 같은 답이 나와야 한다).
 */
export function between(edges: BetweenEdge[], a: string, b: string): BetweenResult {
  const nb = neighbourMap(edges);
  const shared = [...(nb.get(a) ?? [])].filter((x) => nb.get(b)?.has(x)).sort();
  if (!a || !b || a === b) return { path: a && a === b ? [a] : [], shared: [] };

  const prev = new Map<string, string>();
  const seen = new Set([a]);
  let frontier = [a];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const n of nb.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        prev.set(n, cur);
        if (n === b) {
          const path = [b];
          let at = b;
          while (prev.has(at)) { at = prev.get(at) as string; path.push(at); }
          return { path: path.reverse(), shared };
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return { path: [], shared };
}
