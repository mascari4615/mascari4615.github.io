/**
 * packs.ts — KarmoGraph 의 **어휘 팩** (TASK-KL-202 격차 A).
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
import { t } from '../../lib/i18n';

export interface NodeKindDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  /**
   * 이 종류가 흔히 갖는 **칸 이름들** (TASK-KL-202, World Anvil 의 template 계보).
   * 스키마를 강요하지는 않는다 — 빈 칸에서 시작하면 사람이 무엇을 적을지 몰라 아무것도 안 적기에,
   * 「한 벌 채우기」 버튼의 **시작값**으로만 쓴다. 지우거나 다른 이름을 적어도 된다.
   */
  fields?: string[];
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

const packLabel = (packId: string) => t(`karmograph.pack.${packId}.label`);
const packHint = (packId: string) => t(`karmograph.pack.${packId}.hint`);
const nodeLabel = (packId: string, nodeId: string) => t(`karmograph.pack.${packId}.node.${nodeId}.label`);
const nodeFields = (packId: string, nodeId: string, fieldIds: string[]) =>
  fieldIds.map((fieldId) => t(`karmograph.pack.${packId}.node.${nodeId}.field.${fieldId}`));
const edgeLabel = (packId: string, edgeId: string) => t(`karmograph.pack.${packId}.edge.${edgeId}.label`);
const groupLabel = (packId: string, groupId: string) => t(`karmograph.pack.${packId}.group.${groupId}.label`);

// ── 팩 정의 ───────────────────────────────────────────────────────────────────

const WORLDVIEW: CanvasPack = {
  id: 'worldview',
  label: packLabel('worldview'),
  icon: '🌍',
  hint: packHint('worldview'),
  nodeKinds: [
    { id: 'character', label: nodeLabel('worldview', 'character'), icon: '👤', color: '#f472b6', fields: nodeFields('worldview', 'character', ['origin', 'faction', 'firstAppearance']) },
    { id: 'place', label: nodeLabel('worldview', 'place'), icon: '🗺', color: '#34d399', fields: nodeFields('worldview', 'place', ['where', 'rule']) },
    { id: 'item', label: nodeLabel('worldview', 'item'), icon: '🔮', color: '#fbbf24', fields: nodeFields('worldview', 'item', ['owner', 'power']) },
    { id: 'event', label: nodeLabel('worldview', 'event'), icon: '⚡', color: '#60a5fa', fields: nodeFields('worldview', 'event', ['when', 'where', 'result']) },
    { id: 'concept', label: nodeLabel('worldview', 'concept'), icon: '💭', color: '#a78bfa' },
  ],
  edgeKinds: [
    { id: 'relates', label: edgeLabel('worldview', 'relates'), color: '#94a3b8', style: 'solid', arrow: false },
    { id: 'parent', label: edgeLabel('worldview', 'parent'), color: '#a78bfa', style: 'solid', arrow: true },
    { id: 'contains', label: edgeLabel('worldview', 'contains'), color: '#34d399', style: 'dashed', arrow: true },
    { id: 'opposes', label: edgeLabel('worldview', 'opposes'), color: '#f87171', style: 'dotted', arrow: false },
    { id: 'before-after', label: edgeLabel('worldview', 'before-after'), color: '#60a5fa', style: 'solid', arrow: true },
  ],
  groupPresets: [
    { label: groupLabel('worldview', 'faction'), color: '#a78bfa' },
    { label: groupLabel('worldview', 'region'), color: '#34d399' },
    { label: groupLabel('worldview', 'era'), color: '#60a5fa' },
  ],
};

/** 三角関係ジェネレーター 계열 — 팬이 최애 관계도를 그리는 용도. */
const RELATION: CanvasPack = {
  id: 'relation',
  label: packLabel('relation'),
  icon: '💞',
  hint: packHint('relation'),
  nodeKinds: [
    { id: 'rel-person', label: nodeLabel('relation', 'rel-person'), icon: '👤', color: '#f472b6', fields: nodeFields('relation', 'rel-person', ['hook', 'firstAppearance']) },
    { id: 'rel-group', label: nodeLabel('relation', 'rel-group'), icon: '👥', color: '#f59e0b' },
    { id: 'rel-stage', label: nodeLabel('relation', 'rel-stage'), icon: '🏙', color: '#34d399' },
    { id: 'rel-note', label: nodeLabel('relation', 'rel-note'), icon: '💬', color: '#94a3b8' },
  ],
  edgeKinds: [
    { id: 'rel-like', label: edgeLabel('relation', 'rel-like'), color: '#fb7185', style: 'solid', arrow: true, width: 2.2 },
    { id: 'rel-hate', label: edgeLabel('relation', 'rel-hate'), color: '#64748b', style: 'dotted', arrow: true },
    { id: 'rel-rival', label: edgeLabel('relation', 'rel-rival'), color: '#f59e0b', style: 'solid', arrow: true, arrowStart: true },
    { id: 'rel-trust', label: edgeLabel('relation', 'rel-trust'), color: '#38bdf8', style: 'solid', arrow: true },
    { id: 'rel-curious', label: edgeLabel('relation', 'rel-curious'), color: '#a78bfa', style: 'wavy', arrow: true },
    { id: 'rel-family', label: edgeLabel('relation', 'rel-family'), color: '#34d399', style: 'solid', arrow: true, arrowStart: true },
    { id: 'rel-broken', label: edgeLabel('relation', 'rel-broken'), color: '#ef4444', style: 'crack', arrow: false },
  ],
  groupPresets: [
    { label: groupLabel('relation', 'family'), color: '#fbcfe8' },
    { label: groupLabel('relation', 'school'), color: '#bfdbfe' },
    { label: groupLabel('relation', 'work'), color: '#bbf7d0' },
    { label: groupLabel('relation', 'rivals'), color: '#fecaca' },
  ],
};

/** カードゲーム展開ジェネレーター 계열 — 콤보·전개 루트 정리. */
const CARDGAME: CanvasPack = {
  id: 'cardgame',
  label: packLabel('cardgame'),
  icon: '🃏',
  hint: packHint('cardgame'),
  nodeKinds: [
    { id: 'cg-card', label: nodeLabel('cardgame', 'cg-card'), icon: '🃏', color: '#60a5fa' },
    { id: 'cg-branch', label: nodeLabel('cardgame', 'cg-branch'), icon: '◈', color: '#f59e0b' },
    { id: 'cg-token', label: nodeLabel('cardgame', 'cg-token'), icon: '🔸', color: '#34d399' },
    { id: 'cg-note', label: nodeLabel('cardgame', 'cg-note'), icon: '📝', color: '#94a3b8' },
  ],
  edgeKinds: [
    { id: 'cg-summon', label: edgeLabel('cardgame', 'cg-summon'), color: '#fbbf24', style: 'solid', arrow: true },
    { id: 'cg-special', label: edgeLabel('cardgame', 'cg-special'), color: '#a78bfa', style: 'solid', arrow: true },
    { id: 'cg-effect', label: edgeLabel('cardgame', 'cg-effect'), color: '#38bdf8', style: 'solid', arrow: true },
    { id: 'cg-search', label: edgeLabel('cardgame', 'cg-search'), color: '#34d399', style: 'dashed', arrow: true },
    { id: 'cg-revive', label: edgeLabel('cardgame', 'cg-revive'), color: '#f472b6', style: 'dashed', arrow: true },
    { id: 'cg-attack', label: edgeLabel('cardgame', 'cg-attack'), color: '#ef4444', style: 'solid', arrow: true },
    { id: 'cg-destroy', label: edgeLabel('cardgame', 'cg-destroy'), color: '#64748b', style: 'crack', arrow: true },
    { id: 'cg-cost', label: edgeLabel('cardgame', 'cg-cost'), color: '#f59e0b', style: 'dotted', arrow: true },
  ],
  groupPresets: [
    { label: groupLabel('cardgame', 'hand'), color: '#bfdbfe' },
    { label: groupLabel('cardgame', 'field'), color: '#bbf7d0' },
    { label: groupLabel('cardgame', 'graveyard'), color: '#e5e7eb' },
    { label: groupLabel('cardgame', 'deck'), color: '#ddd6fe' },
    { label: groupLabel('cardgame', 'banished'), color: '#fed7aa' },
  ],
};

/** 전문가가 개념·논증을 설명하는 용도. */
const CONCEPT: CanvasPack = {
  id: 'concept',
  label: packLabel('concept'),
  icon: '🧠',
  hint: packHint('concept'),
  nodeKinds: [
    { id: 'cn-concept', label: nodeLabel('concept', 'cn-concept'), icon: '💡', color: '#a78bfa' },
    { id: 'cn-example', label: nodeLabel('concept', 'cn-example'), icon: '📌', color: '#34d399' },
    { id: 'cn-evidence', label: nodeLabel('concept', 'cn-evidence'), icon: '📖', color: '#60a5fa' },
    { id: 'cn-counter', label: nodeLabel('concept', 'cn-counter'), icon: '⚖', color: '#f87171' },
    { id: 'cn-result', label: nodeLabel('concept', 'cn-result'), icon: '🎯', color: '#fbbf24' },
  ],
  edgeKinds: [
    { id: 'cn-leads', label: edgeLabel('concept', 'cn-leads'), color: '#60a5fa', style: 'solid', arrow: true },
    { id: 'cn-supports', label: edgeLabel('concept', 'cn-supports'), color: '#34d399', style: 'solid', arrow: true },
    { id: 'cn-contrast', label: edgeLabel('concept', 'cn-contrast'), color: '#f59e0b', style: 'wavy', arrow: false },
    { id: 'cn-refutes', label: edgeLabel('concept', 'cn-refutes'), color: '#f87171', style: 'dotted', arrow: true },
    { id: 'cn-partof', label: edgeLabel('concept', 'cn-partof'), color: '#94a3b8', style: 'dashed', arrow: true },
  ],
  groupPresets: [
    { label: groupLabel('concept', 'topic'), color: '#bfdbfe' },
    { label: groupLabel('concept', 'thesis'), color: '#ddd6fe' },
    { label: groupLabel('concept', 'counterpoint'), color: '#fecaca' },
  ],
};

/** 새로 만들려는 것을 구상할 때. */
const IDEA: CanvasPack = {
  id: 'idea',
  label: packLabel('idea'),
  icon: '✨',
  hint: packHint('idea'),
  nodeKinds: [
    { id: 'id-idea', label: nodeLabel('idea', 'id-idea'), icon: '✨', color: '#fbbf24' },
    { id: 'id-ask', label: nodeLabel('idea', 'id-ask'), icon: '❓', color: '#60a5fa' },
    { id: 'id-todo', label: nodeLabel('idea', 'id-todo'), icon: '☑', color: '#34d399' },
    { id: 'id-memo', label: nodeLabel('idea', 'id-memo'), icon: '📝', color: '#94a3b8' },
    { id: 'id-risk', label: nodeLabel('idea', 'id-risk'), icon: '⚠', color: '#f87171' },
  ],
  edgeKinds: [
    { id: 'id-derives', label: edgeLabel('idea', 'id-derives'), color: '#fbbf24', style: 'solid', arrow: true },
    { id: 'id-relates', label: edgeLabel('idea', 'id-relates'), color: '#94a3b8', style: 'solid', arrow: false },
    { id: 'id-blocks', label: edgeLabel('idea', 'id-blocks'), color: '#f87171', style: 'crack', arrow: true },
    { id: 'id-then', label: edgeLabel('idea', 'id-then'), color: '#60a5fa', style: 'dashed', arrow: true },
  ],
  groupPresets: [
    { label: groupLabel('idea', 'now'), color: '#bbf7d0' },
    { label: groupLabel('idea', 'later'), color: '#e5e7eb' },
    { label: groupLabel('idea', 'blocked'), color: '#fecaca' },
  ],
};

/** 사람·팀·산출물 배치. */
const ORG: CanvasPack = {
  id: 'org',
  label: packLabel('org'),
  icon: '🏢',
  hint: packHint('org'),
  nodeKinds: [
    { id: 'og-person', label: nodeLabel('org', 'og-person'), icon: '🧑', color: '#f472b6' },
    { id: 'og-team', label: nodeLabel('org', 'og-team'), icon: '🏢', color: '#60a5fa' },
    { id: 'og-role', label: nodeLabel('org', 'og-role'), icon: '🎽', color: '#a78bfa' },
    { id: 'og-output', label: nodeLabel('org', 'og-output'), icon: '📦', color: '#34d399' },
  ],
  edgeKinds: [
    { id: 'og-reports', label: edgeLabel('org', 'og-reports'), color: '#60a5fa', style: 'solid', arrow: true },
    { id: 'og-owns', label: edgeLabel('org', 'og-owns'), color: '#a78bfa', style: 'solid', arrow: true },
    { id: 'og-works', label: edgeLabel('org', 'og-works'), color: '#94a3b8', style: 'dashed', arrow: true, arrowStart: true },
    { id: 'og-makes', label: edgeLabel('org', 'og-makes'), color: '#34d399', style: 'solid', arrow: true },
  ],
  groupPresets: [
    { label: groupLabel('org', 'hq'), color: '#bfdbfe' },
    { label: groupLabel('org', 'remote'), color: '#fed7aa' },
  ],
};

export const PACKS: CanvasPack[] = [WORLDVIEW, RELATION, CARDGAME, CONCEPT, IDEA, ORG];

export const DEFAULT_PACK_ID = WORLDVIEW.id;

/**
 * ★ 종류는 **고르는 게 아니라 분류되는 것** (사용자 지시 2026-08-09).
 *
 * 팩을 먼저 고르게 하면 「이 맵은 세계관용」처럼 칸이 나뉘는데, 실제 세계관에는 인물도 장소도
 * 카드도 개념도 **같이 있다**. 그래서 종류 목록은 언제나 **전부** 내주고, 팩은 그저 **묶음 이름**
 * 으로만 남는다(고르기 창에서 「세계관 / 인물 관계도 / 카드 전개 …」 소제목).
 */
export function allNodeKindGroups(): { title: string; kinds: NodeKindDef[] }[] {
  return PACKS.map((pk) => ({ title: `${pk.icon} ${pk.label}`, kinds: pk.nodeKinds }));
}

export function allEdgeKindGroups(): { title: string; kinds: EdgeKindPreset[] }[] {
  return PACKS.map((pk) => ({ title: `${pk.icon} ${pk.label}`, kinds: pk.edgeKinds }));
}

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
