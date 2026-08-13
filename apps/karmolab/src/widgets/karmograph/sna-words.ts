/**
 * sna-words.ts — 관계망을 **문장으로** (TASK-KL-271 L2).
 *
 * 관계망 패널은 지금까지 숫자만 줬다(연결 3.4 · 다리 0.21 …). 숫자는 이미 아는 사람에게만
 * 말을 걸고, 처음 보는 사람에게는 「그래서 뭐?」로 끝난다 — 실제로 열어 보고 닫는 칸이었다.
 * InfraNodus 가 파는 것이 정확히 이 자리다: **읽으면 바로 아는 한 줄**.
 *
 * 문장은 여기서만 만든다(순수 함수) — 화면에 섞여 있으면 「이 말이 맞나」를 검사로 못 묻는다.
 * 말 자체는 부르는 쪽이 번역해 넣는다(여기서는 **무슨 말을 할지**만 정한다).
 */

export interface SnaFacts {
  /** 카드 수 · 선 수 */
  nodes: number;
  edges: number;
  /** 가장 많이 이어진 카드 (이름, 선 수) */
  hub?: { name: string; count: number };
  /** 다리 역할이 가장 큰 카드 — 없으면 생략 */
  bridge?: { name: string; score: number };
  /** 아무와도 안 이어진 카드 이름들 */
  lonely: string[];
  /** 서로 안 이어진 덩어리 수 (1 이면 다 이어져 있다) */
  islands: number;
}

export interface SnaLine {
  /** 무슨 말인가 — 부르는 쪽이 이 열쇠로 말을 고른다. */
  kind: 'empty' | 'hub' | 'bridge' | 'lonely' | 'islands' | 'dense';
  /** 말에 끼울 값. */
  vars: Record<string, string | number>;
}

/**
 * 사실 → **읽을 문장 목록**. 많아야 셋 — 넉 줄부터는 아무도 안 읽는다(도움말이 그랬다).
 * 순서는 「놀라운 것 먼저」: 끊긴 덩어리 → 혼자인 카드 → 다리 → 중심.
 */
export function snaLines(f: SnaFacts): SnaLine[] {
  if (f.nodes === 0 || f.edges === 0) return [{ kind: 'empty', vars: {} }];
  const out: SnaLine[] = [];
  if (f.islands > 1) out.push({ kind: 'islands', vars: { n: f.islands } });
  if (f.lonely.length > 0) {
    out.push({
      kind: 'lonely',
      vars: { n: f.lonely.length, names: f.lonely.slice(0, 3).join(' · ') },
    });
  }
  // 다리는 **여럿일 때만** 뜻이 있다 — 셋 이하에서는 누구나 다리다.
  if (f.bridge && f.bridge.score > 0 && f.nodes > 3) {
    out.push({ kind: 'bridge', vars: { name: f.bridge.name } });
  }
  if (out.length < 3 && f.hub && f.hub.count > 1) {
    out.push({ kind: 'hub', vars: { name: f.hub.name, n: f.hub.count } });
  }
  // 할 말이 없다 = 고르게 이어져 있다는 뜻이다. 그것도 말해 준다(빈 칸보다 낫다).
  if (out.length === 0) out.push({ kind: 'dense', vars: { n: f.nodes } });
  return out.slice(0, 3);
}

/** 서로 안 이어진 덩어리 수 — 「이 판이 몇 조각인가」. */
export function islandCount(nodeIds: string[], edges: { from: string; to: string }[]): number {
  const nb = new Map<string, string[]>();
  for (const id of nodeIds) nb.set(id, []);
  for (const e of edges) {
    if (!nb.has(e.from) || !nb.has(e.to) || e.from === e.to) continue;
    nb.get(e.from)?.push(e.to);
    nb.get(e.to)?.push(e.from);
  }
  const seen = new Set<string>();
  let islands = 0;
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    islands += 1;
    const stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      for (const n of nb.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return islands;
}
