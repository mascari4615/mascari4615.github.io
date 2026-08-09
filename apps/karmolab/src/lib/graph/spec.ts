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

/**
 * 노드 얼굴 (TASK-KL-202 격차 B). 관계도에서 「누구인지」는 글자보다 얼굴로 읽힌다 —
 * 이모지 하나, 색 원 하나, 또는 붙여 넣은 사진. 이미지는 data URL 로 스펙 안에 들어간다
 * (서버 전송 0 · JSON 한 덩이로 옮겨짐 — 대신 큰 사진은 저장 용량을 먹는다).
 */
export type NodeAvatar =
  | { kind: 'emoji'; value: string }
  | { kind: 'color'; value: string }
  | { kind: 'image'; value: string };

/**
 * 노드 겉모양. rect = 기본 카드, circle = 동그라미, bubble = 말풍선,
 * note = **메모** (테두리 없는 종이쪽지 — 손으로 갈겨 둔 한마디. 레퍼런스의 「書き込み」 자리).
 */
export type NodeShape = 'rect' | 'circle' | 'bubble' | 'note';

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  /**
   * 소속 묶음. `group` = 주 소속(옛 필드, cockpit 이 아직 이 이름으로 읽는다),
   * `groups` = **여러 묶음에 동시에 들 때**의 정본 (TASK-KL-202 D-2).
   * 둘 다 있을 때는 `groups` 가 이긴다 — 캔버스의 `isMember()` 한 곳에서만 판정한다.
   */
  group: string;
  groups?: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  ports: Port[];
  doc?: string;
  live?: LiveSpec;
  children?: string[];  // 노드 카드 안에 표시할 서브항목 레이블
  shape?: NodeShape;    // 없으면 'rect'
  avatar?: NodeAvatar;
  note?: string;        // 이름 밑 한 줄 — 「한마디」
  /** 기울기(도). 메모를 삐딱하게 붙여 두면 「정리된 것」과 「갈겨 둔 것」이 눈으로 갈린다. */
  rotate?: number;
}

/**
 * 선 모양. `wavy`(물결) 와 `crack`(금 간 선) 은 관계도에서 「애매함」·「깨진 사이」를
 * 점선만으로는 못 나타내서 넣었다 (TASK-KL-202 격차 C, 레퍼런스 三角関係ジェネレーター).
 */
export type EdgeStyle = 'solid' | 'dashed' | 'dotted' | 'wavy' | 'crack';

export interface GraphEdge {
  id: string;
  from: string;   // "nodeId" 또는 "nodeId:portId" (포트 suffix 는 렌더 시 무시)
  to: string;
  kind: string;
  label?: string;
  /** 이 선만 따로 — 없으면 kind 정의를 따른다. */
  color?: string;
  width?: number;
  style?: EdgeStyle;
  /** 휘는 정도. 0 = 기본 경로, 부호를 바꾸면 반대쪽으로 휜다(같은 두 노드의 선 겹침도 이걸로 푼다). */
  curve?: number;
  /** 이 선만 따로 양쪽 화살표. */
  arrowStart?: boolean;
  /** 이름표 자리. 0 = 출발점, 0.5 = 가운데(기본), 1 = 도착점. */
  labelPos?: number;
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
  /**
   * 소속 묶음. `group` = 주 소속(옛 필드, cockpit 이 아직 이 이름으로 읽는다),
   * `groups` = **여러 묶음에 동시에 들 때**의 정본 (TASK-KL-202 D-2).
   * 둘 다 있을 때는 `groups` 가 이긴다 — 캔버스의 `isMember()` 한 곳에서만 판정한다.
   */
  group: string;
  groups?: string[];
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
  style: EdgeStyle;
  /** 도착 쪽 화살표. */
  arrow: boolean;
  /** 출발 쪽에도 화살표 — 둘 다 켜면 ↔ (「서로 좋아함」·「라이벌」처럼 오가는 관계). */
  arrowStart?: boolean;
  /** 선 굵기(px). 없으면 1.5. */
  width?: number;
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

/** 캔버스 배경 무늬 (TASK-KL-202 격차 I). 점이 기본 — 축소했을 때 눈에 덜 걸린다. */
export type BackgroundKind = 'dots' | 'grid' | 'cross' | 'none';

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
