/**
 * packs.ts — KarmoMap 의 **어휘 팩** (TASK-KL-202 격차 A).
 *
 * 원래 여기엔 세계관 어휘 5종이 하드코딩돼 있었다(`kinds.ts`). 그런데 레퍼런스
 * 두 개(三角関係ジェネレーター / カードゲーム展開ジェネレーター)를 나란히 보면
 * **같은 엔진에 어휘만 갈아끼운 것**이다 — 노드·선·그룹은 똑같고, 다른 건
 * 「인물/♡好き」이냐 「카드/☆召喚」이냐 뿐.
 *
 * 그래서 어휘를 데이터로 뺐다. 캔버스(lib/graph)는 어휘를 모르고, 위젯은 팩을
 * 골라 끼운다. 새 용도가 생기면 코드가 아니라 팩 한 덩이가 늘어난다.
 *
 * 노드 종류 id 는 팩마다 겹치지 않게 prefix 를 둔다 — 팩을 바꿔도 이미 놓아둔
 * 노드가 색을 잃지 않도록 `ALL_KIND_COLORS` 가 전 팩을 합쳐 캔버스에 넘어간다.
 */
import type { EdgeKindDef, EdgeStyle } from '../../lib/graph/spec';

export interface NodeKindDef {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface EdgeKindPreset {
  id: string;
  label: string;
  color: string;
  style: EdgeStyle;
  arrow: boolean;
  /** 출발 쪽에도 화살표 — 서로 오가는 관계(↔). */
  arrowStart?: boolean;
  /** 선 굵기(px). 없으면 1.5 — 굵을수록 「센 관계」로 읽힌다. */
  width?: number;
}

export interface GroupPreset {
  label: string;
  color: string;
}

export interface CanvasPack {
  id: string;
  label: string;
  icon: string;
  /** 팩을 골랐을 때 캔버스가 비어 있으면 보여줄 한 줄. */
  hint: string;
  nodeKinds: NodeKindDef[];
  edgeKinds: EdgeKindPreset[];
  groupPresets: GroupPreset[];
}

// ── 팩 정의 ───────────────────────────────────────────────────────────────────

const WORLDVIEW: CanvasPack = {
  id: 'worldview',
  label: '세계관',
  icon: '🌍',
  hint: '인물·장소·사건을 놓고 관계로 이어서 세계관을 펼쳐 보세요.',
  nodeKinds: [
    { id: 'character', label: '인물', icon: '👤', color: '#f472b6' },
    { id: 'place',     label: '장소', icon: '🗺', color: '#34d399' },
    { id: 'item',      label: '물건', icon: '🔮', color: '#fbbf24' },
    { id: 'event',     label: '사건', icon: '⚡', color: '#60a5fa' },
    { id: 'concept',   label: '개념', icon: '💭', color: '#a78bfa' },
  ],
  edgeKinds: [
    { id: 'relates',      label: '관련', color: '#94a3b8', style: 'solid',  arrow: false },
    { id: 'parent',       label: '상위', color: '#a78bfa', style: 'solid',  arrow: true },
    { id: 'contains',     label: '포함', color: '#34d399', style: 'dashed', arrow: true },
    { id: 'opposes',      label: '대립', color: '#f87171', style: 'dotted', arrow: false },
    { id: 'before-after', label: '선후', color: '#60a5fa', style: 'solid',  arrow: true },
  ],
  groupPresets: [
    { label: '진영', color: '#a78bfa' },
    { label: '지역', color: '#34d399' },
    { label: '시대', color: '#60a5fa' },
  ],
};

/** 三角関係ジェネレーター 계열 — 팬이 최애 관계도를 그리는 용도. */
const RELATION: CanvasPack = {
  id: 'relation',
  label: '인물 관계도',
  icon: '💞',
  hint: '인물을 놓고 ♡좋아함 · ✕싫어함 · ⚡라이벌 로 이어 보세요.',
  nodeKinds: [
    { id: 'rel-person', label: '인물',   icon: '👤', color: '#f472b6' },
    { id: 'rel-group',  label: '집단',   icon: '👥', color: '#f59e0b' },
    { id: 'rel-stage',  label: '무대',   icon: '🏙', color: '#34d399' },
    { id: 'rel-note',   label: '한마디', icon: '💬', color: '#94a3b8' },
  ],
  edgeKinds: [
    { id: 'rel-like',    label: '♡ 좋아함',   color: '#fb7185', style: 'solid',  arrow: true, width: 2.2 },
    { id: 'rel-hate',    label: '✕ 싫어함',   color: '#64748b', style: 'dotted', arrow: true },
    { id: 'rel-rival',   label: '⚡ 라이벌',   color: '#f59e0b', style: 'solid',  arrow: true, arrowStart: true },
    { id: 'rel-trust',   label: '★ 신뢰',     color: '#38bdf8', style: 'solid',  arrow: true },
    { id: 'rel-curious', label: '? 신경쓰임', color: '#a78bfa', style: 'wavy',   arrow: true },
    { id: 'rel-family',  label: '🏠 가족',    color: '#34d399', style: 'solid',  arrow: true, arrowStart: true },
    { id: 'rel-broken',  label: '💔 금이 감', color: '#ef4444', style: 'crack',  arrow: false },
  ],
  groupPresets: [
    { label: '가족',  color: '#fbcfe8' },
    { label: '학교',  color: '#bfdbfe' },
    { label: '직장',  color: '#bbf7d0' },
    { label: '적대',  color: '#fecaca' },
  ],
};

/** カードゲーム展開ジェネレーター 계열 — 콤보·전개 루트 정리. */
const CARDGAME: CanvasPack = {
  id: 'cardgame',
  label: '카드 전개',
  icon: '🃏',
  hint: '카드를 놓고 ☆소환 · ⚡효과 · ➲서치 로 이어 전개 루트를 그려 보세요.',
  nodeKinds: [
    { id: 'cg-card',   label: '카드',   icon: '🃏', color: '#60a5fa' },
    { id: 'cg-branch', label: '분기',   icon: '◈', color: '#f59e0b' },
    { id: 'cg-token',  label: '토큰',   icon: '🔸', color: '#34d399' },
    { id: 'cg-note',   label: '해설',   icon: '📝', color: '#94a3b8' },
  ],
  edgeKinds: [
    { id: 'cg-summon',  label: '☆ 소환',     color: '#fbbf24', style: 'solid',  arrow: true },
    { id: 'cg-special', label: '✦ 특수소환', color: '#a78bfa', style: 'solid',  arrow: true },
    { id: 'cg-effect',  label: '⚡ 효과발동', color: '#38bdf8', style: 'solid',  arrow: true },
    { id: 'cg-search',  label: '➲ 서치/드로우', color: '#34d399', style: 'dashed', arrow: true },
    { id: 'cg-revive',  label: '✺ 소생/회수', color: '#f472b6', style: 'dashed', arrow: true },
    { id: 'cg-attack',  label: '⚔ 공격',     color: '#ef4444', style: 'solid',  arrow: true },
    { id: 'cg-destroy', label: '✕ 파괴/묘지', color: '#64748b', style: 'crack',  arrow: true },
    { id: 'cg-cost',    label: '◆ 코스트',   color: '#f59e0b', style: 'dotted', arrow: true },
  ],
  groupPresets: [
    { label: '패',    color: '#bfdbfe' },
    { label: '필드',  color: '#bbf7d0' },
    { label: '묘지',  color: '#e5e7eb' },
    { label: '덱',    color: '#ddd6fe' },
    { label: '제외',  color: '#fed7aa' },
  ],
};

/** 전문가가 개념·논증을 설명하는 용도. */
const CONCEPT: CanvasPack = {
  id: 'concept',
  label: '개념 설명',
  icon: '🧠',
  hint: '개념을 놓고 근거·사례·반론을 붙여 설명 한 장을 만들어 보세요.',
  nodeKinds: [
    { id: 'cn-concept', label: '개념',   icon: '💡', color: '#a78bfa' },
    { id: 'cn-example', label: '사례',   icon: '📌', color: '#34d399' },
    { id: 'cn-evidence',label: '근거',   icon: '📖', color: '#60a5fa' },
    { id: 'cn-counter', label: '반론',   icon: '⚖', color: '#f87171' },
    { id: 'cn-result',  label: '결론',   icon: '🎯', color: '#fbbf24' },
  ],
  edgeKinds: [
    { id: 'cn-leads',    label: '이끎',   color: '#60a5fa', style: 'solid',  arrow: true },
    { id: 'cn-supports', label: '뒷받침', color: '#34d399', style: 'solid',  arrow: true },
    { id: 'cn-contrast', label: '대조',   color: '#f59e0b', style: 'wavy',   arrow: false },
    { id: 'cn-refutes',  label: '반박',   color: '#f87171', style: 'dotted', arrow: true },
    { id: 'cn-partof',   label: '부분',   color: '#94a3b8', style: 'dashed', arrow: true },
  ],
  groupPresets: [
    { label: '전제', color: '#bfdbfe' },
    { label: '본론', color: '#ddd6fe' },
    { label: '한계', color: '#fecaca' },
  ],
};

/** 새로 만들려는 것을 구상할 때. */
const IDEA: CanvasPack = {
  id: 'idea',
  label: '구상',
  icon: '✨',
  hint: '떠오른 것을 던져 놓고 파생·막힘으로 이어 구상을 굴려 보세요.',
  nodeKinds: [
    { id: 'id-idea',  label: '아이디어', icon: '✨', color: '#fbbf24' },
    { id: 'id-ask',   label: '질문',     icon: '❓', color: '#60a5fa' },
    { id: 'id-todo',  label: '할 일',    icon: '☑', color: '#34d399' },
    { id: 'id-memo',  label: '메모',     icon: '📝', color: '#94a3b8' },
    { id: 'id-risk',  label: '위험',     icon: '⚠', color: '#f87171' },
  ],
  edgeKinds: [
    { id: 'id-derives', label: '파생',   color: '#fbbf24', style: 'solid',  arrow: true },
    { id: 'id-relates', label: '관련',   color: '#94a3b8', style: 'solid',  arrow: false },
    { id: 'id-blocks',  label: '막힘',   color: '#f87171', style: 'crack',  arrow: true },
    { id: 'id-then',    label: '이어짐', color: '#60a5fa', style: 'dashed', arrow: true },
  ],
  groupPresets: [
    { label: '지금',   color: '#bbf7d0' },
    { label: '나중',   color: '#e5e7eb' },
    { label: '안 함',  color: '#fecaca' },
  ],
};

/** 사람·팀·산출물 배치. */
const ORG: CanvasPack = {
  id: 'org',
  label: '조직·프로젝트',
  icon: '🏢',
  hint: '사람·팀·산출물을 놓고 담당·보고로 이어 보세요.',
  nodeKinds: [
    { id: 'og-person',  label: '사람',   icon: '🧑', color: '#f472b6' },
    { id: 'og-team',    label: '팀',     icon: '🏢', color: '#60a5fa' },
    { id: 'og-role',    label: '역할',   icon: '🎽', color: '#a78bfa' },
    { id: 'og-output',  label: '산출물', icon: '📦', color: '#34d399' },
  ],
  edgeKinds: [
    { id: 'og-reports', label: '보고',   color: '#60a5fa', style: 'solid',  arrow: true },
    { id: 'og-owns',    label: '담당',   color: '#a78bfa', style: 'solid',  arrow: true },
    { id: 'og-works',   label: '협업',   color: '#94a3b8', style: 'dashed', arrow: true, arrowStart: true },
    { id: 'og-makes',   label: '만듦',   color: '#34d399', style: 'solid',  arrow: true },
  ],
  groupPresets: [
    { label: '본부', color: '#bfdbfe' },
    { label: '외부', color: '#fed7aa' },
  ],
};

export const PACKS: CanvasPack[] = [WORLDVIEW, RELATION, CARDGAME, CONCEPT, IDEA, ORG];

export const DEFAULT_PACK_ID = WORLDVIEW.id;

export function packById(id: string): CanvasPack {
  return PACKS.find((p) => p.id === id) ?? WORLDVIEW;
}

/**
 * 전 팩의 노드 색을 합친 표. 캔버스에 이걸 넘겨야 팩을 바꿔도 **이미 놓아둔
 * 다른 팩 노드가 회색으로 죽지 않는다** — 한 캔버스에 여러 팩 어휘를 섞어
 * 쓰는 것도 막을 이유가 없다.
 */
export const ALL_KIND_COLORS: Record<string, string> = Object.fromEntries(
  PACKS.flatMap((p) => p.nodeKinds.map((k) => [k.id, k.color] as const))
);

/** 전 팩의 아이콘 합본 — 노드 카드·사이드 패널 표시에 쓴다. */
export const ALL_KIND_ICONS: Record<string, string> = Object.fromEntries(
  PACKS.flatMap((p) => p.nodeKinds.map((k) => [k.id, k.icon] as const))
);

/** 전 팩의 노드 종류 라벨 합본. */
export const ALL_KIND_LABELS: Record<string, string> = Object.fromEntries(
  PACKS.flatMap((p) => p.nodeKinds.map((k) => [k.id, k.label] as const))
);

/** 전 팩의 선 정의 합본 — 캔버스가 `_edge_kinds` 로 받는다. */
export const ALL_EDGE_KIND_DEFS: Record<string, EdgeKindDef> = Object.fromEntries(
  PACKS.flatMap((p) =>
    p.edgeKinds.map(
      (e) =>
        [e.id, { color: e.color, style: e.style, arrow: e.arrow, arrowStart: e.arrowStart, width: e.width } as EdgeKindDef] as const
    )
  )
);

/** 전 팩의 선 라벨 합본. */
export const ALL_EDGE_LABELS: Record<string, string> = Object.fromEntries(
  PACKS.flatMap((p) => p.edgeKinds.map((e) => [e.id, e.label] as const))
);
