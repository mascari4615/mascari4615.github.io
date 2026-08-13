/**
 * ripeness.ts — 이 카드가 **얼마나 익었나** (TASK-KL-271 L5, Heptabase 계보).
 *
 * 세계관을 짓는 일은 「다 적었다」로 끝나지 않는다 — 카드마다 **익는 단계**가 있다:
 * 이름만 있는 씨앗, 반쯤 적은 것, 더 적을 게 없는 것. Heptabase 가 파는 것이 이 감각이다
 * (생각이 익는 단계를 도구가 안다).
 *
 * 새 자료를 만들지 않는다 — **이미 있는 칸**에서 읽어 낸다. 사람이 따로 「익음」을 고르게 하면
 * 그 값도 관리해야 할 또 하나의 칸이 되고, 결국 아무도 안 고친다.
 *
 * 관계망 칸의 「아직 안 적은 칸」이 **판 전체**를 말한다면, 이건 **이 카드 한 장**이다.
 */

export type Ripe =
  /** 칸 자체가 없는 카드 — 말할 것이 없다(그림·쪽지처럼 칸이 필요 없는 것도 있다). */
  | 'none'
  /** 칸은 있는데 하나도 안 적음. */
  | 'seed'
  /** 얼마쯤 적음. */
  | 'growing'
  /** 있는 칸을 다 적음. */
  | 'firm';

export interface RipeReport {
  ripe: Ripe;
  /** 적은 칸 수 */
  filled: number;
  /** 이 카드가 가진 칸 수 */
  total: number;
}

/** 공백만 적은 것은 **안 적은 것**이다 — 「안 적음」과 「띄어쓰기 한 칸」을 다르게 세면 아무 말도 못 한다. */
export function ripenessOf(node: { fields?: Record<string, string> }): RipeReport {
  const entries = Object.entries(node.fields ?? {});
  const total = entries.length;
  const filled = entries.filter(([, v]) => String(v ?? '').trim()).length;
  if (total === 0) return { ripe: 'none', filled: 0, total: 0 };
  if (filled === 0) return { ripe: 'seed', filled, total };
  return { ripe: filled === total ? 'firm' : 'growing', filled, total };
}

/**
 * 이 카드에 대해 **말을 걸 만한가**.
 * 다 적은 카드에 「다 적었어요」라고 하는 건 잔소리다 — 남은 것이 있을 때만 말한다.
 */
export function worthNudging(r: RipeReport): boolean {
  return r.ripe === 'seed' || r.ripe === 'growing';
}
