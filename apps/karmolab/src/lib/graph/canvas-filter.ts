/**
 * lib/graph/canvas-filter.ts — **무엇이 화면에 남나** (TASK-KL-202 방향① 해체 17조각).
 *
 * 거르기는 지우는 게 아니라 **보기를 줄이는** 일이다. 규칙 넷:
 *  - 꺼 둔 종류 · 꺼 둔 꼬리표가 붙은 것은 뺀다.
 *  - 칸으로 좁히면 그 칸이 있는 것만(값까지 적었으면 그 값인 것만) 남는다.
 *  - 「선이 N개 이상」은 **빠질 게 없을 때까지 되풀이**한다 — 이웃이 빠지면 남은 것의 연결 수도 줄기 때문
 *    (network 쪽 k-core 와 같은 셈법). 한 번만 걸러내면 조건을 못 채운 것이 남는다.
 */
import type { GraphNode, GraphEdge } from './spec';

export interface FilterState {
  nodeKinds: Set<string>;
  edgeKinds: Set<string>;
  tags: Set<string>;
  hideOrphans: boolean;
  minDegree: number;
  fieldName: string;
  fieldValue: string;
}

export function visibleNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filter: FilterState,
  refOf: (ref: string) => string,
): GraphNode[] {
  const kept = nodes.filter((n) => {
    if (filter.nodeKinds.has(n.kind)) return false;
    if ((n.tags ?? []).some((tag) => filter.tags.has(tag))) return false;
    if (filter.fieldName) {
      const v = (n.fields ?? {})[filter.fieldName];
      if (v === undefined) return false;
      if (filter.fieldValue && String(v).trim() !== filter.fieldValue) return false;
    }
    return true;
  });

  const min = Math.max(filter.minDegree, filter.hideOrphans ? 1 : 0);
  if (min <= 0) return kept;

  let live = new Set(kept.map((n) => n.id));
  for (let round = 0; round < 40; round += 1) {
    const deg = new Map<string, number>();
    for (const e of edges) {
      if (filter.edgeKinds.has(e.kind)) continue;
      const a = refOf(e.from);
      const b = refOf(e.to);
      if (!live.has(a) || !live.has(b)) continue;
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    const next = new Set([...live].filter((id) => (deg.get(id) ?? 0) >= min));
    if (next.size === live.size) break;
    live = next;
  }
  return kept.filter((n) => live.has(n.id));
}
