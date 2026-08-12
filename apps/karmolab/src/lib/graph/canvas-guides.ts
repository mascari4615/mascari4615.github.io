/**
 * lib/graph/canvas-guides.ts — **이웃 줄에 맞추기** (TASK-KL-237).
 *
 * 격자(8px)는 「대충 맞음」까지다. 사람이 실제로 맞추려는 것은 격자가 아니라 **옆 카드**다 —
 * 왼쪽 줄을 맞추거나, 가운데를 맞추거나, 아랫줄을 맞춘다. 격자만 있으면 카드 폭이 제각각일 때
 * 가운데는 영원히 안 맞는다(폭의 반이 4의 배수가 아니면 격자 위에 없다).
 *
 * 그래서 끌 때 **가까운 줄이 있으면 그 줄에 붙이고, 붙은 줄을 그어 보여 준다.** 셈은 전부
 * 여기서 하고(브라우저 없이 검사한다), 캔버스는 결과만 받아 그린다.
 */

export interface GuideBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 그어 줄 선 하나. `axis:'v'` = 세로선(x=at), `'h'` = 가로선(y=at). */
export interface GuideLine {
  axis: 'v' | 'h';
  at: number;
  from: number;
  to: number;
}

export interface GuideResult {
  x: number;
  y: number;
  lines: GuideLine[];
}

/** 한 축에서 「끌리는 세 자리」 — 앞줄 · 가운데 · 뒷줄. */
function slots(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

/**
 * 끌고 있는 상자를 이웃들의 줄에 붙인다.
 *
 * - 축마다 **가장 가까운 한 줄**만 잡는다. 여러 줄을 동시에 잡으면 어느 줄에 붙었는지 못 읽는다.
 * - `tol` 은 판 위 거리(px)다 — 화면 거리로 주려면 부르는 쪽에서 배율로 나눠 넣는다.
 *   그래야 확대해도 「손끝에서 6px」이 유지된다.
 * - 이웃이 하나도 안 가까우면 **자리를 그대로 돌려준다**(격자 결과를 안 건드린다).
 */
export function alignGuides(
  moving: GuideBox,
  others: GuideBox[],
  tol: number,
): GuideResult {
  const lines: GuideLine[] = [];
  let outX = moving.x;
  let outY = moving.y;

  for (const axis of ['v', 'h'] as const) {
    const vertical = axis === 'v';
    const mStart = vertical ? moving.x : moving.y;
    const mSize = vertical ? moving.w : moving.h;
    const mine = slots(mStart, mSize);

    let best: { delta: number; at: number; other: GuideBox } | null = null;
    for (const o of others) {
      if (o.id === moving.id) continue;
      const theirs = slots(vertical ? o.x : o.y, vertical ? o.w : o.h);
      for (const a of mine) {
        for (const b of theirs) {
          const delta = b - a;
          if (Math.abs(delta) > tol) continue;
          if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at: b, other: o };
        }
      }
    }
    if (!best) continue;

    // 붙은 줄은 **두 상자를 함께 지나가게** 긋는다 — 어느 카드에 맞춘 건지가 선 하나로 읽힌다.
    const near = best.other;
    if (vertical) {
      outX = moving.x + best.delta;
      lines.push({
        axis, at: best.at,
        from: Math.min(moving.y, near.y),
        to: Math.max(moving.y + moving.h, near.y + near.h),
      });
    } else {
      outY = moving.y + best.delta;
      lines.push({
        axis, at: best.at,
        from: Math.min(outX, near.x),
        to: Math.max(outX + moving.w, near.x + near.w),
      });
    }
  }

  return { x: outX, y: outY, lines };
}

/** 줄을 맞출 상대 = **보이는 카드만**. 걸러 놓은 카드의 줄에 붙으면 「왜 여기서 멈추지」가 된다. */
export function neighborBoxes<T extends { id: string }>(
  visible: T[],
  exceptId: string,
  box: (id: string) => { x: number; y: number; w: number; h: number } | null,
): GuideBox[] {
  return visible.flatMap((n) => {
    if (n.id === exceptId) return [];
    const b = box(n.id);
    return b ? [{ id: n.id, ...b }] : [];
  });
}

const GUIDE_CLASS = 'ck-guide';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 그어 놓은 줄을 지운다. 끌기가 끝나면 **아무 자국도 안 남아야 한다**(그림에 찍히면 안 된다). */
export function clearGuides(layer: SVGGElement): void {
  layer.querySelectorAll(`.${GUIDE_CLASS}`).forEach((el) => el.remove());
}

/** 줄을 다시 긋는다 — 매 프레임 통째로 지우고 새로. 두 개뿐이라 아끼는 게 더 비싸다. */
export function drawGuides(layer: SVGGElement, lines: GuideLine[], color: string): void {
  clearGuides(layer);
  for (const g of lines) {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('class', GUIDE_CLASS);
    el.setAttribute('x1', String(g.axis === 'v' ? g.at : g.from));
    el.setAttribute('y1', String(g.axis === 'v' ? g.from : g.at));
    el.setAttribute('x2', String(g.axis === 'v' ? g.at : g.to));
    el.setAttribute('y2', String(g.axis === 'v' ? g.to : g.at));
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', '1');
    el.setAttribute('stroke-dasharray', '4 3');
    el.setAttribute('pointer-events', 'none');
    layer.appendChild(el);
  }
}
