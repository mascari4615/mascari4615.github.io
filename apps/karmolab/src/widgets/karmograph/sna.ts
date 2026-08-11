/**
 * sna.ts — 관계망 지표 (TASK-KL-202 격차 U).
 *
 * 관계도를 다 그리고 나면 다음 질문은 늘 같다: **누가 중심인가, 누가 다리인가.**
 * 눈으로는 안 보인다 — 선이 많은 것과 「없으면 그림이 두 조각 나는 것」은 다르다.
 *
 * 세 가지만 낸다(Kumu 가 쓰는 것과 같은 뜻):
 * - `degree`    닿은 선의 수 — 허브. 「없어지면 곤란한 자리」의 1차 신호.
 * - `betweenness` 남들 사이의 **다리**가 된 횟수 — 중개자·병목.
 * - `closeness` 다른 모두에게 얼마나 가까운가 — 소문이 빨리 퍼지는 자리.
 *
 * 방향은 무시한다(관계도에서 「좋아함」이 한쪽이어도 두 사람은 이어져 있다).
 */

export interface SnaInput {
  nodes: { id: string }[];
  edges: { from: string; to: string }[];
}

export interface SnaResult {
  degree: Map<string, number>;
  betweenness: Map<string, number>;
  closeness: Map<string, number>;
}

/** 선 목록 → 이웃 표. 포트 suffix(`node:port`)는 떼어 낸다. */
function adjacency(input: SnaInput): Map<string, Set<string>> {
  const bare = (ref: string): string => {
    const i = ref.lastIndexOf(':');
    return i < 0 ? ref : ref.slice(0, i);
  };
  const adj = new Map<string, Set<string>>();
  for (const n of input.nodes) adj.set(n.id, new Set());
  for (const e of input.edges) {
    const a = bare(e.from);
    const b = bare(e.to);
    if (a === b || !adj.has(a) || !adj.has(b)) continue;
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  }
  return adj;
}

/**
 * Brandes 알고리즘 — 모든 노드에서 너비 우선으로 훑으며 최단 경로 수를 세고,
 * 되돌아오며 「내가 몇 번 다리였나」를 쌓는다. 노드 수 V, 선 수 E 에 대해 O(V·E) —
 * 관계도 규모(수백)에서는 즉시 끝난다.
 */
export function computeSna(input: SnaInput): SnaResult {
  const adj = adjacency(input);
  const ids = [...adj.keys()];
  const degree = new Map<string, number>();
  const betweenness = new Map<string, number>();
  const closeness = new Map<string, number>();
  for (const id of ids) {
    degree.set(id, adj.get(id)?.size ?? 0);
    betweenness.set(id, 0);
    closeness.set(id, 0);
  }

  for (const s of ids) {
    const stack: string[] = [];
    const preds = new Map<string, string[]>();
    const sigma = new Map<string, number>();   // s→v 최단 경로 수
    const dist = new Map<string, number>();
    for (const id of ids) { preds.set(id, []); sigma.set(id, 0); dist.set(id, -1); }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head]; head += 1;
      stack.push(v);
      for (const w of adj.get(v) ?? []) {
        if ((dist.get(w) ?? -1) < 0) {
          dist.set(w, (dist.get(v) ?? 0) + 1);
          queue.push(w);
        }
        if (dist.get(w) === (dist.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          preds.get(w)?.push(v);
        }
      }
    }

    // 닿은 것들까지의 거리 합 → closeness (닿지 않는 것은 세지 않는다)
    let sum = 0;
    let reached = 0;
    for (const id of ids) {
      const d = dist.get(id) ?? -1;
      if (id === s || d <= 0) continue;
      sum += d;
      reached += 1;
    }
    closeness.set(s, sum > 0 ? reached / sum : 0);

    const delta = new Map<string, number>();
    for (const id of ids) delta.set(id, 0);
    while (stack.length > 0) {
      const w = stack.pop() as string;
      for (const v of preds.get(w) ?? []) {
        const c = ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + c);
      }
      if (w !== s) betweenness.set(w, (betweenness.get(w) ?? 0) + (delta.get(w) ?? 0));
    }
  }

  // 방향 없는 그래프에서는 각 쌍을 두 번 센다 — 절반으로 되돌린다.
  for (const id of ids) betweenness.set(id, (betweenness.get(id) ?? 0) / 2);
  return { degree, betweenness, closeness };
}

/** 값이 큰 순으로 상위 n개. 값이 0 인 것은 넣지 않는다(「1등인데 0」은 아무 말도 아니다). */
export function topBy(map: Map<string, number>, n: number): { id: string; value: number }[] {
  return [...map.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, value]) => ({ id, value }));
}

/**
 * 「이어질 법한데 안 이어진 자리」 (TASK-KL-202, InfraNodus 의 structural gap 계보).
 *
 * 관계망 읽기는 지금까지 **순위**만 냈다(허브·다리·가까움). 그런데 사람이 그림을 보다 얻는 것은
 * 대개 「어? 얘랑 얘는 왜 안 이어져 있지?」다 — **공통 이웃이 여럿인데 서로는 안 이어진 쌍**이
 * 그 자리다. 세계관에서는 대개 아직 안 쓴 이야기이고, 정리 도구에서는 빠뜨린 연결이다.
 *
 * 공통 이웃이 하나뿐인 쌍은 흔해서 소음이 된다 — 둘 이상만 본다.
 */
export function structuralGaps(
  graph: { nodes: { id: string }[]; edges: { from: string; to: string }[] },
  min = 2,
): { a: string; b: string; shared: number }[] {
  const ids = graph.nodes.map((n) => n.id);
  const near = new Map<string, Set<string>>();
  for (const id of ids) near.set(id, new Set());
  for (const e of graph.edges) {
    const a = e.from.split(':')[0];
    const b = e.to.split(':')[0];
    if (!near.has(a) || !near.has(b)) continue;
    near.get(a)?.add(b);
    near.get(b)?.add(a);
  }
  const out: { a: string; b: string; shared: number }[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (near.get(a)?.has(b)) continue;                 // 이미 이어진 쌍은 자리가 아니다
      let shared = 0;
      for (const n of near.get(a) ?? []) if (near.get(b)?.has(n)) shared += 1;
      if (shared >= min) out.push({ a, b, shared });
    }
  }
  return out.sort((x, y) => y.shared - x.shared || x.a.localeCompare(y.a));
}
