/**
 * lib/graph/spec.ts — 그래프 데이터 타입 정의 (TASK-KL-087 단위 0).
 *
 * 순수 타입만. 저장소(Tauri / localStorage / 서버)를 **모른다** —
 * 읽기·쓰기는 `adapter.ts` 의 `GraphPersistAdapter` 구현체가 책임진다.
 *
 * 원본 = `widgets/cockpit/graph-spec.ts` (TASK-KL-082). 그 파일은 타입 +
 * Tauri invoke 가 한 몸이라 cockpit 밖에서 재사용이 불가능했다. 본 파일은
 * 타입만 떼어낸 것이고, Tauri 부분은 `widgets/cockpit/graph-tauri-adapter.ts`
 * 로 격리됐다.
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
  children?: string[];  // 노드 카드 안에 표시할 서브항목 레이블
}

export interface GraphEdge {
  id: string;
  from: string;   // "nodeId" 또는 "nodeId:portId" (포트 suffix 는 렌더 시 무시)
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
  source: {
    kind: string;
    file?: string;
    filter?: string;
  };
  spawn_kind: string;
  id_template: string;
  label_template: string;
  highlight?: string;
}

/** save 시 보낼 좌표 패치 — kind 로 어느 컬렉션 patch 할지 분기. */
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

/** 빈 스펙 — 새 캔버스 시작점. */
export function emptyGraphSpec(): GraphSpec {
  return {
    version: 1,
    _meta: {},
    groups: [],
    nodes: [],
    edges: [],
    ephemeral_anchors: [],
    _edge_kinds: {},
  };
}
