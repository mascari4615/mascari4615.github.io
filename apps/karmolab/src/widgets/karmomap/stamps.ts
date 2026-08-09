/**
 * stamps.ts — 자주 쓰는 **한 벌을 「본」으로** (TASK-KL-202 방향⑤, Excalidraw 라이브러리 계보).
 *
 * 세계관을 여러 판에 그리다 보면 같은 덩어리를 계속 다시 그린다 — 「세력 한 벌(수장·부관·부대)」,
 * 「전형적 삼각관계」, 「사건 → 결과 → 여파」. 매번 손으로 놓으면 모양도 이름도 조금씩 갈린다.
 *
 * 그래서 고른 것들을 **본**으로 떠서 사람 창고(`karmomap.stamps`)에 두고, 다른 맵에 찍는다.
 * 노트 창고와 같은 규칙: 맵보다 오래 살고, 저장 칸이 차면 조용히 포기한다(맵 저장이 우선).
 */
import type { GraphSpec, GraphNode, GraphEdge } from '../../lib/graph/spec';

const KEY = 'karmomap.stamps';

export interface Stamp {
  id: string;
  name: string;
  at: number;
  /** 왼쪽 위를 (0,0) 으로 맞춘 상대 좌표의 노드들. */
  nodes: GraphNode[];
  /** 본 **안쪽만** 잇는 선들(밖으로 나가는 선은 찍을 자리에 상대가 없다). */
  edges: GraphEdge[];
}

export function loadStamps(): Stamp[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as Stamp[]) : [];
  } catch {
    return [];
  }
}

function save(list: Stamp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 칸이 차면 맵 저장이 우선 — 본은 조용히 포기한다.
  }
}

/** 고른 노드들을 본으로 뜬다. 좌표는 **왼쪽 위 기준 상대값**으로 눕힌다(어디에 찍든 모양이 같게). */
export function captureStamp(spec: GraphSpec, ids: string[], name: string): Stamp | null {
  const picked = spec.nodes.filter((n) => ids.includes(n.id));
  if (picked.length === 0) return null;
  const minX = Math.min(...picked.map((n) => n.x));
  const minY = Math.min(...picked.map((n) => n.y));
  const inside = new Set(ids);
  const stamp: Stamp = {
    id: `stamp-${Date.now().toString(36)}`,
    name: name.trim() || `본 ${picked.length}개`,
    at: Date.now(),
    nodes: picked.map((n) => ({ ...JSON.parse(JSON.stringify(n)) as GraphNode, x: n.x - minX, y: n.y - minY })),
    edges: spec.edges
      .filter((e) => inside.has(e.from.split(':')[0]) && inside.has(e.to.split(':')[0]))
      .map((e) => JSON.parse(JSON.stringify(e)) as GraphEdge),
  };
  save([...loadStamps().filter((s) => s.name !== stamp.name), stamp]);
  return stamp;
}

export function deleteStamp(id: string): void {
  save(loadStamps().filter((s) => s.id !== id));
}

/**
 * 본을 이 맵에 찍는다. **id 는 새로 뽑는다** — 같은 본을 두 번 찍어도 서로 다른 인물이어야 한다
 * (노트와 정반대다: 노트는 같은 글이어야 하고, 본은 같은 *모양*일 뿐이다).
 * 새로 놓인 노드 id 들을 돌려준다(찍자마자 골라 두려고).
 */
export function applyStamp(
  spec: GraphSpec,
  stamp: Stamp,
  at: { x: number; y: number },
  nextId: (prefix: 'node' | 'edge', taken: Set<string>) => string,
): string[] {
  const takenN = new Set(spec.nodes.map((n) => n.id));
  const takenE = new Set(spec.edges.map((e) => e.id));
  const map = new Map<string, string>();

  for (const n of stamp.nodes) {
    const id = nextId('node', takenN);
    takenN.add(id);
    map.set(n.id, id);
    spec.nodes.push({ ...n, id, x: Math.round(at.x + n.x), y: Math.round(at.y + n.y) });
  }
  for (const e of stamp.edges) {
    const from = map.get(e.from.split(':')[0]);
    const to = map.get(e.to.split(':')[0]);
    if (!from || !to) continue;
    const id = nextId('edge', takenE);
    takenE.add(id);
    spec.edges.push({ ...e, id, from, to });
  }
  return [...map.values()];
}
