/**
 * tidy.ts — 가지런히 놓기 (TASK-KL-202 격차 T).
 *
 * 사람은 캔버스에 마구 던져 놓고 나중에 정리한다. 그런데 손으로 정리하는 건 지루하고,
 * 그렇다고 「자동 배치」로 통째로 흩어 놓으면 **사람이 잡아 둔 뜻**(왼쪽은 과거, 오른쪽은 현재
 * 같은 것)이 날아간다.
 *
 * 그래서 두 가지만 한다 — 둘 다 **결정적**이고, 사람이 잡아 둔 순서를 존중한다:
 *
 * 1. `snapToGrid` — 격자에 맞춰 살짝 당긴다. 위치의 뜻은 그대로 두고 줄만 맞춘다.
 * 2. `unoverlap` — 겹친 것만 민다. 겹치지 않은 것은 **손대지 않는다**.
 *
 * 일반 그래프 자동 배치(force-directed 등)는 여기 없다. 그건 매번 다른 그림을 내놓아
 * 「어제 본 그 자리」를 잃게 만든다.
 */

export interface Boxish {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 격자에 맞춰 당긴 좌표. 값이 안 바뀌는 것은 결과에 넣지 않는다. */
export function snapToGrid(boxes: Boxish[], grid: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const b of boxes) {
    const x = Math.round(b.x / grid) * grid;
    const y = Math.round(b.y / grid) * grid;
    if (x !== b.x || y !== b.y) out.set(b.id, { x, y });
  }
  return out;
}

/**
 * 겹친 것만 민다. 위→아래, 왼→오른 순으로 훑으며 앞선 것과 겹치면 **오른쪽으로** 밀고,
 * 너무 밀리면 아랫줄로 내린다.
 *
 * 여러 번 돌려도 결과가 같아야 하므로(멱등), 이미 안 겹치는 배치에서는 아무것도 안 바뀐다.
 */
export function unoverlap(boxes: Boxish[], gap: number): Map<string, { x: number; y: number }> {
  const sorted = [...boxes].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const placed: Boxish[] = [];
  const moved = new Map<string, { x: number; y: number }>();

  const hits = (a: Boxish, b: Boxish): boolean =>
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

  for (const box of sorted) {
    const cur: Boxish = { ...box };
    let guard = 0;
    // 겹치는 동안 오른쪽으로 민다. 한 줄이 너무 길어지면 아랫줄 왼쪽으로 내린다.
    while (guard < 400) {
      const clash = placed.find((p) => hits(cur, p));
      if (!clash) break;
      cur.x = clash.x + clash.w + gap;
      if (cur.x - box.x > 2400) {
        cur.x = box.x;
        cur.y = clash.y + clash.h + gap;
      }
      guard += 1;
    }
    if (cur.x !== box.x || cur.y !== box.y) moved.set(box.id, { x: Math.round(cur.x), y: Math.round(cur.y) });
    placed.push(cur);
  }
  return moved;
}
