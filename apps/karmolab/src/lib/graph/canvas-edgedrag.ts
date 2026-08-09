/**
 * lib/graph/canvas-edgedrag.ts — **선을 손으로 휘고 이름표를 옮기는 셈법** (TASK-KL-202 방향① 입력 조각 3).
 *
 * 선 가운데 손잡이를 끌면 선이 휘고, 이름표를 끌면 이름표가 선 위를 미끄러진다. 둘 다
 * 「커서가 두 끝점을 잇는 직선에서 **얼마나 벗어났나(법선)** / **얼마나 나아갔나(접선)**」 하나로 정해진다.
 *
 * 이 셈법이 캔버스 본체 안에 있던 동안은 손으로 끌어 보는 것 말고 확인할 길이 없었다 —
 * 「휘는 양이 너무 민감하다」, 「이름표가 카드 뒤로 숨는다」 같은 것은 숫자로 잠글 수 있는 규칙이다.
 */

export interface Pt {
  x: number;
  y: number;
}

/** 너무 휘면 선이 어디서 어디로 가는지 안 읽힌다 — 양쪽 0.8 에서 멈춘다. */
export const CURVE_LIMIT = 0.8;
/** 이만큼 아래면 「곧은 선」으로 되돌린다(사람 손은 0 을 못 맞춘다). */
export const CURVE_DEADZONE = 0.02;
/** 이름표는 끝에 딱 붙지 않는다 — 카드 뒤로 숨어 안 보이게 된다. */
export const LABEL_MIN = 0.05;
export const LABEL_MAX = 0.95;

/**
 * 휘는 정도. 직선에서 **옆으로 벗어난 거리**를 선 길이로 나눈 값이라, 선이 길든 짧든
 * 손을 같은 만큼 움직이면 같은 만큼 휜다(안 그러면 짧은 선이 미친 듯이 휜다).
 * 곧게 편 상태는 `undefined` — 저장 파일에 `curve: 0` 을 남기지 않는다.
 */
export function curveFromPointer(p1: Pt, p2: Pt, w: Pt): number | undefined {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = (w.x - (p1.x + p2.x) / 2) * nx + (w.y - (p1.y + p2.y) / 2) * ny;
  const curve = Math.max(-CURVE_LIMIT, Math.min(CURVE_LIMIT, (off / len) * 1.35));
  return Math.abs(curve) < CURVE_DEADZONE ? undefined : Number(curve.toFixed(3));
}

/** 이름표 자리 — 0 이 시작 카드, 1 이 끝 카드. 양 끝 5% 는 남겨 둔다. */
export function labelPosFromPointer(p1: Pt, p2: Pt, w: Pt): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = ((w.x - p1.x) * dx + (w.y - p1.y) * dy) / (len * len);
  return Number(Math.min(LABEL_MAX, Math.max(LABEL_MIN, t)).toFixed(3));
}
