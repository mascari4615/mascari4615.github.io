/**
 * lib/graph/canvas-save.ts — **좌표 저장 미루기** (TASK-KL-202 방향① 해체 18조각).
 *
 * 카드를 끄는 동안 좌표는 초당 수십 번 바뀐다. 그때마다 저장하면 저장소가 비명을 지르고,
 * 저장을 안 하면 새로고침에 자리가 날아간다. 그래서 **마지막 값만 모아 한 번**에 보낸다.
 *
 * 규칙 하나가 여기 산다: 같은 것을 여러 번 밀어도 **마지막 좌표만** 남는다
 * (키가 `종류:id` 라 덮어써진다) — 중간 좌표를 다 보내면 서버가 지나간 자리를 다시 그린다.
 */
import type { CoordUpdate } from './spec';

export type PendingSaves = Map<string, { x: number; y: number; kind: 'node' | 'anchor' | 'group' }>;

/** 모아 둔 것을 보낼 모양으로 편다. 키의 앞머리(종류)는 떼고 id 만 남긴다. */
export function drainSaves(pending: PendingSaves): CoordUpdate[] {
  const out: CoordUpdate[] = [];
  for (const [key, v] of pending) {
    out.push({ id: key.split(':').slice(1).join(':'), x: v.x, y: v.y, kind: v.kind });
  }
  pending.clear();
  return out;
}

/** 저장 대기열에 넣는다(같은 대상은 덮어쓴다). */
export function queueSave(
  pending: PendingSaves,
  id: string,
  x: number,
  y: number,
  kind: 'node' | 'anchor' | 'group',
): void {
  pending.set(`${kind}:${id}`, { x, y, kind });
}
