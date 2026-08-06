/**
 * kinds.ts — KarmoMap 의 세계관 어휘 (TASK-KL-087 단위 1).
 *
 * 일반 마인드맵과의 차별점이 여기다. 노드는 그냥 "박스" 가 아니라
 * *인물 / 장소 / 물건 / 사건 / 개념* 중 하나고, 연결은 그냥 "선" 이 아니라
 * *관련 / 상위 / 포함 / 대립 / 선후* 중 하나다. 세계관을 설명할 때 실제로
 * 쓰는 말에 맞춘 것.
 *
 * cockpit 은 자기 셋(domain/app/canon/…)을 쓴다 — 캔버스는 양쪽 다 모른다.
 */
import type { EdgeKindDef } from '../../lib/graph/spec';

export const NODE_KINDS = ['character', 'place', 'item', 'event', 'concept'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  character: '인물',
  place: '장소',
  item: '물건',
  event: '사건',
  concept: '개념',
};

/** 노드 좌측 색띠 + 테두리 + 미니맵 색. */
export const NODE_KIND_COLORS: Record<string, string> = {
  character: '#f472b6',
  place:     '#34d399',
  item:      '#fbbf24',
  event:     '#60a5fa',
  concept:   '#a78bfa',
};

export const NODE_KIND_ICONS: Record<NodeKind, string> = {
  character: '👤',
  place: '🗺',
  item: '🔮',
  event: '⚡',
  concept: '💭',
};

export const EDGE_KINDS = ['relates', 'parent', 'contains', 'opposes', 'before-after'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  relates: '관련',
  parent: '상위',
  contains: '포함',
  opposes: '대립',
  'before-after': '선후',
};

/**
 * 관계 종류별 선 모양. 화살표 유무가 방향성 유무를 그대로 나타낸다 —
 * 「관련」·「대립」은 상호적이라 화살표 없음, 나머지는 방향이 있다.
 */
export const EDGE_KIND_DEFS: Record<string, EdgeKindDef> = {
  relates:        { color: '#94a3b8', style: 'solid',  arrow: false },
  parent:         { color: '#a78bfa', style: 'solid',  arrow: true },
  contains:       { color: '#34d399', style: 'dashed', arrow: true },
  opposes:        { color: '#f87171', style: 'dotted', arrow: false },
  'before-after': { color: '#60a5fa', style: 'solid',  arrow: true },
};

export function isNodeKind(v: string): v is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(v);
}

export function isEdgeKind(v: string): v is EdgeKind {
  return (EDGE_KINDS as readonly string[]).includes(v);
}
