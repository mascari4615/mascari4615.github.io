/**
 * karmomap/kinds.ts — KarmoMap 세계관 특화 노드/엣지 타입 + 시각화 정의.
 */

import type { EdgeKindDef } from '../../lib/graph/spec';

export const NODE_KINDS = ['Character', 'Place', 'Item', 'Event', 'Concept'] as const;
export type NodeKind = typeof NODE_KINDS[number];

export const EDGE_KINDS = ['relates', 'parent', 'contains', 'opposes', 'before-after'] as const;
export type EdgeKind = typeof EDGE_KINDS[number];

export const NODE_KIND_COLORS: Record<NodeKind, string> = {
  Character:  '#f472b6',  // pink  — 캐릭터
  Place:      '#34d399',  // green — 장소
  Item:       '#fbbf24',  // amber — 아이템
  Event:      '#60a5fa',  // blue  — 사건
  Concept:    '#a78bfa',  // violet — 개념
};

export const NODE_KIND_ICONS: Record<NodeKind, string> = {
  Character:  '👤',
  Place:      '🗺',
  Item:       '⚔',
  Event:      '⚡',
  Concept:    '💡',
};

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  Character:  '캐릭터',
  Place:      '장소',
  Item:       '아이템',
  Event:      '사건',
  Concept:    '개념',
};

export const EDGE_KIND_DEFS: Record<EdgeKind, EdgeKindDef & { label: string }> = {
  'relates':      { color: '#94a3b8', style: 'solid',  arrow: true,  label: '관련' },
  'parent':       { color: '#a78bfa', style: 'solid',  arrow: true,  label: '상위' },
  'contains':     { color: '#34d399', style: 'dashed', arrow: true,  label: '포함' },
  'opposes':      { color: '#f87171', style: 'solid',  arrow: false, label: '대립' },
  'before-after': { color: '#60a5fa', style: 'dotted', arrow: true,  label: '전후' },
};

export const DEFAULT_NODE_W = 140;
export const DEFAULT_NODE_H = 32;
