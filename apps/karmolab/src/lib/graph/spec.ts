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
 * note = **메모** (테두리 없는 종이쪽지 — 손으로 갈겨 둔 한마디. 레퍼런스의 「書き込み」 자리),
 * photo = **사진 카드** (그림이 카드를 채우고 이름은 아래 띠에 — 팬 관계도가 실제로 생긴 모습).
 */
export type NodeShape = 'rect' | 'circle' | 'bubble' | 'note' | 'photo';

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
  /**
   * 이 자리가 가리키는 **공용 글**(`spec.notes`)의 id. 있으면 `doc` 대신 그쪽이 보인다 —
   * 같은 설정을 여러 인물에게 붙여 두고 한 번만 고치기 위한 것 (TASK-KL-202 노트 1급 객체).
   */
  docRef?: string;
  live?: LiveSpec;
  children?: string[];  // 노드 카드 안에 표시할 서브항목 레이블
  shape?: NodeShape;    // 없으면 'rect'
  avatar?: NodeAvatar;
  note?: string;        // 이름 밑 한 줄 — 「한마디」
  /** 기울기(도). 메모를 삐딱하게 붙여 두면 「정리된 것」과 「갈겨 둔 것」이 눈으로 갈린다. */
  rotate?: number;
  /**
   * 이 노드가 가리키는 대상(노드 id 또는 선 id) — **메모의 지시선**(leader line).
   * 관계선(`edges`)이 아니다. 관계는 세계관의 사실이고, 지시선은 「이 메모가 저것에 대한 말」
   * 이라는 표시일 뿐이라 종류·화살표·라벨이 없다 (TASK-KL-202 E-2).
   */
  attachedTo?: string;
  /**
   * 이 노드만의 **칸**들 (TASK-KL-202, Tana 슈퍼태그 계보). 「출신: 마계」·「첫 등장: 3화」처럼
   * 종류마다 적고 싶은 것이 다르다. 스키마를 미리 정의하게 하지 않고 **쓰면서 생기게** 둔다 —
   * 같은 종류의 다른 노드가 쓴 칸 이름이 그대로 후보로 뜬다(이름이 곧 스키마).
   */
  fields?: Record<string, string>;
  /**
   * 사람이 모서리를 끌어 **직접 정한 크기**. 켜져 있으면 글자 길이에 맞춘 자동 크기가 손대지 않는다
   * — 손으로 맞춘 판이 타자 한 번에 도로 튀는 것이 가장 짜증나는 일이다 (TASK-KL-202, tldraw 계보).
   */
  sized?: boolean;
  /**
   * 꼬리표 (TASK-KL-202 격차 R). 종류(`kind`)는 **하나만** 고를 수 있는 신분이고,
   * 꼬리표는 **여럿 붙는 성질**이다 — 「영향력 큼」·「나중에 다시 볼 것」처럼.
   * 둘을 한 칸에 몰아넣으면 종류가 금세 수십 개로 불어난다(Kumu 가 같은 이유로 나눠 둔다).
   */
  tags?: string[];
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
  /**
   * 이 관계에 대한 긴 설명 (TASK-KL-202 격차 Z). 「언제부터 라이벌인가」 같은 것은
   * 어느 한쪽 인물의 설명이 아니라 **그 선의 이야기**다 — 노드에만 적을 곳을 두면 갈 데가 없다.
   */
  doc?: string;
  /** 공용 글 참조 — 노드와 같은 규칙(있으면 `doc` 대신 이쪽). */
  docRef?: string;
  tags?: string[];
}

export interface GroupDef {
  id: string;
  label: string;
  color: string;
  bbox: { x: number; y: number; w: number; h: number };
  /** 상자를 안 그린다. 소속은 그대로 — 「지금은 이 묶음 말고 저 묶음만 보고 싶다」 (TASK-KL-202 D-3). */
  hidden?: boolean;
  /**
   * 테두리 모양. 'box' = 네모(예전 그대로), 'hull' = **멤버를 감싸는 윤곽** (TASK-KL-202 D-4).
   * 겹치는 묶음을 네모로 그리면 서로 남의 빈 자리를 크게 물어 「누가 누구에 속하는지」가 흐려진다.
   * Bubble Sets 계열이 말하는 문제이고, 볼록 껍질은 그 중 가장 싼 해법이다.
   */
  shape?: 'box' | 'hull';
  /**
   * 잠금 — 끌어도 안 움직인다 (TASK-KL-202 D-6). 「배경처럼 깔아 둔 묶음」을 실수로
   * 통째 옮기는 사고를 막는다. 안에 든 노드는 따로 움직일 수 있다(자리만 잠근다).
   */
  locked?: boolean;
  /** 이름표를 기본 자리에서 얼마나 옮겼나 (TASK-KL-202 D-5). */
  labelDx?: number;
  labelDy?: number;
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

/**
 * 발표 한 장 (TASK-KL-202 M-2). 관계도를 남에게 *설명*할 때는 전체를 한 번에 펼치면
 * 아무도 못 읽는다 — 볼 것을 몇 장으로 나눠 차례로 연다 (Kumu 의 presentation 슬라이드).
 */
export interface StoryStep {
  id: string;
  title: string;
  /** 이 장에서 또렷하게 둘 노드들. 비면 전체를 보여 준다. */
  nodeIds: string[];
  /** 화면 아래에 띄울 설명 한 줄. */
  note?: string;
}

/**
 * 여러 자리가 함께 가리키는 **공용 글** (TASK-KL-202). 노드 안에 갇힌 글은 복붙하는 순간
 * 갈라지지만, 이건 집이 하나라 고치면 가리키는 모든 자리가 함께 바뀐다.
 */
export interface GraphNote {
  id: string;
  /** 목록에서 고를 때 쓰는 이름. 비면 본문 첫 줄. */
  title?: string;
  text: string;
}

export interface GraphSpec {
  version: number;
  _meta: Record<string, string>;
  groups: GroupDef[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  ephemeral_anchors: EphemeralAnchor[];
  _edge_kinds: Record<string, EdgeKindDef>;
  /** 여러 자리가 나눠 쓰는 글들. 없으면 공용 글을 아직 안 만든 맵. */
  notes?: GraphNote[];
  /** 발표 순서. 없으면 발표 모드 버튼이 「첫 장 담기」로 시작한다. */
  story?: StoryStep[];
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
