/**
 * lib/graph/canvas-press.ts — **누르면 무슨 뜻인가** (TASK-KL-202 방향① 해체: 입력 조각).
 *
 * 캔버스에서 손가락/마우스를 한 번 누르는 것은 여덟 가지 중 하나다: 선 끝 다시 잇기 · 묶음 이름
 * 끌기 · 선 휘기 · 크기 조절 · 선 뽑기 · 카드 끌기 · 묶음 끌기 · 범위 고르기 · 화면 밀기.
 * 지금까지 이 판단이 `bindEvents` 안에 500줄짜리 if 사다리로 눌려 있었다 — **순서가 곧 규칙인데**
 * 그 순서를 시험할 방법이 없었다(「손잡이보다 카드가 먼저 먹혀 선을 못 뽑는다」가 그 사다리의 사고다).
 *
 * 그래서 판단만 떼어 낸다. 여기 있는 것은 DOM 도, 상태도 모른다 — **무엇이 눌렸나(hits) + 무엇이
 * 켜져 있나(caps) + 어떤 키를 쥐고 있나(mods)** 를 받아 뜻 하나를 돌려준다. 그래서 Node 에서 시험된다.
 */

/** 눌린 자리에서 찾아낸 것들. 없으면 undefined — 하나도 없으면 「배경」이다. */
export interface PressHits {
  edgeEnd?: { edgeId: string; end: 'from' | 'to' };
  groupLabel?: string;
  edgeGrip?: string;
  edgeLabel?: string;
  sizeHandle?: string;
  linkHandle?: string;
  node?: string;
  group?: string;
}

/** 지금 이 캔버스가 할 수 있는 것 — 콜백을 안 준 캔버스에서는 그 몸짓이 아예 없다. */
export interface PressCaps {
  canRewire: boolean;
  canMoveGroup: boolean;
  canEditEdge: boolean;
  canLink: boolean;
  canSelectMany: boolean;
  /** 잠긴 묶음은 아예 안 잡힌다 — 「잡히는데 안 움직이는」 것보다 안 잡히는 게 덜 헷갈린다. */
  groupLocked?: boolean;
}

export type PressIntent =
  | { kind: 'rewire'; edgeId: string; end: 'from' | 'to' }
  | { kind: 'label-drag'; groupId: string }
  | { kind: 'edge-drag'; edgeId: string; mode: 'curve' | 'label' }
  | { kind: 'resize'; nodeId: string }
  | { kind: 'link'; fromId: string }
  | { kind: 'node-drag'; nodeId: string }
  | { kind: 'group-drag'; groupId: string }
  | { kind: 'marquee' }
  | { kind: 'pan' };

/**
 * 우선순위가 이 파일의 전부다. 위에 있을수록 먼저 이긴다 — **작고 또렷한 손잡이가 큰 판보다 먼저**.
 * 손잡이를 카드보다 뒤에 두면 손잡이를 눌러도 카드가 끌린다(선을 영영 못 뽑는다).
 */
export function pressIntent(
  hits: PressHits,
  caps: PressCaps,
  mods: { shiftKey?: boolean } = {},
): PressIntent {
  if (hits.edgeEnd && caps.canRewire) {
    return { kind: 'rewire', edgeId: hits.edgeEnd.edgeId, end: hits.edgeEnd.end };
  }
  if (hits.groupLabel && caps.canMoveGroup) return { kind: 'label-drag', groupId: hits.groupLabel };
  if (hits.edgeGrip && caps.canEditEdge) return { kind: 'edge-drag', edgeId: hits.edgeGrip, mode: 'curve' };
  if (hits.edgeLabel && caps.canEditEdge) return { kind: 'edge-drag', edgeId: hits.edgeLabel, mode: 'label' };
  if (hits.sizeHandle) return { kind: 'resize', nodeId: hits.sizeHandle };
  if (hits.linkHandle && caps.canLink) return { kind: 'link', fromId: hits.linkHandle };
  if (hits.node) return { kind: 'node-drag', nodeId: hits.node };
  if (hits.group) {
    // 잠긴 묶음은 없는 셈 치고 그 아래 배경 동작(밀기/고르기)으로 떨어진다.
    if (!caps.groupLocked) return { kind: 'group-drag', groupId: hits.group };
  }
  // 배경: Shift 를 쥐고 있을 때만 범위 고르기. 두 뜻을 같은 몸짓에 주면 「밀려다 골라지는」 사고가 난다.
  if (mods.shiftKey && caps.canSelectMany) return { kind: 'marquee' };
  return { kind: 'pan' };
}

/** DOM 에서 무엇이 눌렸나만 읽어 낸다 — 판단은 `pressIntent` 가 한다. */
export function readPressHits(target: Element, fallbackLinkFrom?: string): PressHits {
  const hits: PressHits = {};
  const endEl = target.closest('.ck-edge-end') as SVGElement | null;
  const endId = endEl?.dataset.edgeId;
  if (endId) hits.edgeEnd = { edgeId: endId, end: (endEl?.dataset.end ?? 'to') as 'from' | 'to' };

  const labelDragEl = target.closest('.ck-group-label') as SVGElement | null;
  if (labelDragEl?.dataset.groupId) hits.groupLabel = labelDragEl.dataset.groupId;

  const gripEl = target.closest('.ck-edge-grip') as SVGElement | null;
  if (gripEl?.dataset.edgeId) hits.edgeGrip = gripEl.dataset.edgeId;

  const labelEl = target.closest('.ck-edge-label') as SVGElement | null;
  if (labelEl?.dataset.edgeId) hits.edgeLabel = labelEl.dataset.edgeId;

  const sizeEl = target.closest('.ck-size-handle') as SVGElement | null;
  if (sizeEl?.dataset.sizeFor) hits.sizeHandle = sizeEl.dataset.sizeFor;

  const nodeEl = target.closest('.ck-node') as SVGElement | null;
  const handleEl = target.closest('.ck-link-handle') as SVGElement | null;
  const from = handleEl ? (handleEl.dataset.linkFrom ?? nodeEl?.dataset.id ?? fallbackLinkFrom) : undefined;
  if (from) hits.linkHandle = from;

  if (nodeEl?.dataset.id) hits.node = nodeEl.dataset.id;

  const groupEl = target.closest('.ck-group') as SVGElement | null;
  if (groupEl?.dataset.groupId) hits.group = groupEl.dataset.groupId;

  return hits;
}
