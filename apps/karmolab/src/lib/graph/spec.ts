/**
 * lib/graph/spec.ts — 그래프 타입 정의 (Tauri 의존 없음).
 * 정본. 각 어댑터는 GraphSpec 을 이 타입으로 produce/consume.
 */

export interface Port {
  id: string;
}

export interface LiveSpec {
  source: string;
  repo?: string;
  signal?: string;
  host?: string;
  service?: string;
}

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ports: Port[];
  doc?: string;
  live?: LiveSpec;
  children?: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
}

export interface GroupDef {
  id: string;
  label: string;
  color: string;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface EphemeralAnchor {
  id: string;
  label: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: { kind: string; file?: string; filter?: string };
  spawn_kind: string;
  id_template: string;
  label_template: string;
  highlight?: string;
}

export interface CoordUpdate {
  id: string;
  x: number;
  y: number;
  kind?: 'node' | 'anchor' | 'group';
}

export interface EdgeKindDef {
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  arrow: boolean;
  animated_on_active?: boolean;
}

export interface GraphSpec {
  version: number;
  _meta: Record<string, string>;
  groups: GroupDef[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  ephemeral_anchors: EphemeralAnchor[];
  _edge_kinds: Record<string, EdgeKindDef>;
}

export interface NodeCoord {
  id: string;
  x: number;
  y: number;
  kind?: 'node' | 'anchor' | 'group';
}
