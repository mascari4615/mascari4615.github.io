/**
 * lib/graph/canvas-decor.ts — **어떻게 보일지 정하는 순서** (TASK-KL-202 방향① 해체 16조각).
 *
 * 색·크기를 정하는 근거가 넷이나 된다(규칙 목록 · 칸 색 · 꼬리표 색 · 종류 색). 순서가 흐려지면
 * 「분명 빨갛게 해 뒀는데 파랗다」가 생긴다. 그래서 **이기는 순서**를 이 파일 하나에 못 박는다:
 *
 *   ① 꾸미기 **규칙**(사람이 「이런 것은 이렇게」라고 직접 적은 것)
 *   ② 칸 값으로 물들이기(방금 고른 기준)
 *   ③ 꼬리표 색
 *   ④ 종류 색(기본)
 *
 * 크기도 같은 결: 규칙의 배율은 「연결 수만큼 크게」와 **곱해진다**(둘 다 사람이 켠 것이라 하나만 이기면 놀란다).
 */
import type { GraphNode, DecorRule } from './spec';
import { colorForTag } from './canvas-math';

export interface DecorFlags {
  sizeByDegree: boolean;
  colorByTag: boolean;
  colorByField: string;
}

/** 규칙 목록에서 맞는 것들을 모은다 — **뒤에 있는 규칙이 이긴다**(목록을 위에서 아래로 읽는다). */
export function matchRules(node: GraphNode, rules: DecorRule[]): { color?: string; scale?: number } {
  const out: { color?: string; scale?: number } = {};
  for (const r of rules) {
    let hit = false;
    if (r.on === 'kind') hit = node.kind === r.value;
    else if (r.on === 'tag') hit = (node.tags ?? []).includes(r.value ?? '');
    else if (r.on === 'field') {
      const v = (node.fields ?? {})[r.key ?? ''];
      hit = v !== undefined && (!r.value || String(v).trim() === r.value);
    }
    if (!hit) continue;
    if (r.color) out.color = r.color;
    if (r.scale) out.scale = r.scale;
  }
  return out;
}

export function nodeColor(
  node: GraphNode,
  rules: DecorRule[],
  flags: DecorFlags,
  colorForKind: (kind: string) => string,
): string {
  const ruled = matchRules(node, rules).color;
  if (ruled) return ruled;
  if (flags.colorByField) {
    const v = (node.fields ?? {})[flags.colorByField];
    if (v && String(v).trim()) return colorForTag(String(v).trim());
  }
  if (flags.colorByTag) {
    const tag = (node.tags ?? [])[0];
    if (tag) return colorForTag(tag);
  }
  return colorForKind(node.kind);
}

/** 크기 배율. 연결 수 배율은 1.6 에서 멈춘다 — 안 멈추면 허브 하나가 화면을 덮는다. */
export function nodeScale(
  node: GraphNode | undefined,
  rules: DecorRule[],
  flags: DecorFlags,
  degree: number,
): number {
  const ruled = node ? matchRules(node, rules).scale : undefined;
  if (!flags.sizeByDegree) return ruled ?? 1;
  return Math.min(1.6, 1 + degree * 0.12) * (ruled ?? 1);
}
