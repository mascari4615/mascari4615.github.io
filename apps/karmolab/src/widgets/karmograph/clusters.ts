/**
 * clusters.ts. **무리 찾기** (TASK-KL-271 L3).
 *
 * 관계망 칸은 이미 끊긴 덩어리를 센다. 그런데 사람이 진짜 궁금한 건 **다 이어져 있는 판 안에서**
 * 누가 누구랑 한 패인가다. 학교 무리와 가족 무리가 한 사람으로만 이어져 있어도, 눈으로는
 * 그 경계가 안 보인다. Gephi, Kumu 가 파는 것이 이 자리(커뮤니티 검출)다.
 *
 * 쓰는 셈법 = **이름표 퍼뜨리기**(label propagation). 무거운 최적화 대신, 이웃 중 가장 흔한 이름표를
 * 받아 적기를 되풀이한다. 관계도 규모(수십~수백)에서 충분히 빠르고, 무엇보다 **눈으로 못 재는**
 * 결과라 검사로 잠글 수 있게 순수 함수로 둔다.
 *
 * ★ **같은 판은 두 번 돌려도 같은 답이어야 한다.** 원래 이 셈법은 도는 순서에 따라 답이 흔들리는데,
 *   그러면 어제 본 무리와 오늘 본 무리가 달라져 아무도 안 믿는다. 그래서 순서를 못 박는다:
 *   카드는 **이름표 순서로** 돌고, 이웃 표가 같으면 **작은 이름표**를 고른다.
 */

export interface Cluster {
  /** 이 무리에 든 카드 id. 이름표 순. */
  members: string[];
}

/** 되풀이 상한. 이보다 오래 안 끝나면 어차피 요동치는 판이다(둘이 서로를 물고 도는 꼴). */
const MAX_PASSES = 20;

/**
 * 무리 찾기.
 *
 * @param nodeIds 판에 있는 카드 id
 * @param edges 선 (양쪽 다 판에 있는 것만 쳐 준다)
 * @returns 큰 무리부터. 카드가 없으면 빈 배열.
 */
export function findClusters(
  nodeIds: string[],
  edges: { from: string; to: string }[],
): Cluster[] {
  const ids = [...nodeIds].sort();
  if (ids.length === 0) return [];
  const alive = new Set(ids);
  const near = new Map<string, string[]>();
  for (const id of ids) near.set(id, []);
  for (const e of edges) {
    if (!alive.has(e.from) || !alive.has(e.to) || e.from === e.to) continue;
    near.get(e.from)?.push(e.to);
    near.get(e.to)?.push(e.from);
  }

  /** 두 카드가 **함께 아는 카드**가 몇인가. 표가 갈릴 때 이걸로 정한다. */
  const shared = (a: string, b: string): number => {
    const setB = new Set(near.get(b) ?? []);
    let n = 0;
    for (const m of near.get(a) ?? []) if (setB.has(m)) n += 1;
    return n;
  };

  const label = new Map<string, string>(ids.map((id) => [id, id]));
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let moved = false;
    for (const id of ids) {
      const mates = near.get(id) ?? [];
      if (mates.length === 0) continue;   // 혼자인 카드는 제 이름표를 지킨다
      const votes = new Map<string, number>();
      /** 그 이름표를 든 이웃 중, 나와 **함께 아는 카드**가 가장 많은 수. */
      const kin = new Map<string, number>();
      for (const m of mates) {
        const l = label.get(m) as string;
        votes.set(l, (votes.get(l) ?? 0) + 1);
        kin.set(l, Math.max(kin.get(l) ?? 0, shared(id, m)));
      }
      let best = label.get(id) as string;
      let bestN = votes.get(best) ?? 0;
      let bestKin = kin.get(best) ?? 0;
      for (const [l, n] of votes) {
        const k = kin.get(l) ?? 0;
        /* 표가 많으면 이긴다. **표가 같으면 함께 아는 카드가 많은 쪽**이 이긴다 . 
           이 한 줄이 다리 하나로 붙은 두 패를 안 뭉치게 한다(다리 건너편과는 아는 사람이 없다).
           그것마저 같으면 작은 이름표. 두 번 돌려도 같은 답이어야 하기 때문이다. */
        if (n > bestN
          || (n === bestN && k > bestKin)
          || (n === bestN && k === bestKin && l < best)) { best = l; bestN = n; bestKin = k; }
      }
      if (best !== label.get(id)) { label.set(id, best); moved = true; }
    }
    if (!moved) break;
  }

  const box = new Map<string, string[]>();
  for (const id of ids) {
    const l = label.get(id) as string;
    if (!box.has(l)) box.set(l, []);
    box.get(l)?.push(id);
  }
  const out = [...box.values()].map((members) => ({ members }));
  // 큰 무리부터. 크기가 같으면 첫 이름표 순. 순서까지 못 박아야 같은 답이다.
  out.sort((a, b) => (b.members.length - a.members.length) || a.members[0].localeCompare(b.members[0]));
  return out;
}

/**
 * 무리 이야기를 **할 만한가**.
 * 무리가 하나면 다 한 패입니다라 할 말이 없고, 카드마다 제 무리면(전부 혼자) 그것도 할 말이 아니다
 *. 그건 아무도 안 이어져 있다이고 관계망 칸이 이미 말한다.
 */
export function clustersWorthTelling(clusters: Cluster[]): boolean {
  if (clusters.length < 2) return false;
  return clusters.some((c) => c.members.length >= 2);
}
