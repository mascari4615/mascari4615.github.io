/**
 * lib/graph/canvas-math.ts — 캔버스의 **셈법만** (TASK-KL-202 방향① 해체 1조각).
 *
 * `canvas.ts` 는 2865 줄짜리 한 덩이였다. 그 안에는 DOM 을 만드는 일과 **순수한 계산**이
 * 섞여 있었는데, 계산은 화면 없이도 맞는지 틀리는지 말할 수 있는 것들이다
 * (색 고르기·베지어 위의 점·볼록 껍질·격자 스냅·물결 선).
 *
 * 여기로 떼어 내면 두 가지가 생긴다:
 *  1. **1초 단위 검사**로 잠글 수 있다(브라우저 없이) — 해체를 계속할 안전망.
 *  2. `canvas.ts` 가 「그리는 일」에 가까워진다.
 *
 * 규칙: 이 파일은 `document`·`window`·SVG 를 **모른다**. 문자열(패스 d)까지만 만든다.
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * 꼬리표 색 — 어두운 판에서도 서로 구별되는 열 가지. 이름을 해시해 고르므로 **같은 말이면 늘 같은 색**이다
 * (색을 손으로 정하게 하면 꼬리표를 만들 때마다 결정이 하나 늘어난다).
 * 열 개 남짓으로 묶는 것은 범주형 팔레트의 통설 — 그 이상은 사람이 못 가른다.
 */
export const TAG_COLORS = [
  '#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa',
  '#fb7185', '#38bdf8', '#4ade80', '#f59e0b', '#c084fc',
];

export function colorForTag(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

/** 격자에 맞춰 당긴다. `grid` 가 0 이하면 그대로 둔다(스냅 끄기). */
export function snapTo(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** 3차 베지어 위의 점 — 선 위 이름표·손잡이 자리를 잡는 데 쓴다. */
export function pointOnCubic(g: { p1: Pt; c1: Pt; c2: Pt; p2: Pt }, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * g.p1.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.p2.x,
    y: u * u * u * g.p1.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.p2.y,
  };
}

/**
 * 볼록 껍질 (Andrew monotone chain). 점이 셋보다 적으면 빈 배열 —
 * 껍질이 선이 되면 그릴 뜻이 없다(그럴 땐 네모가 낫다).
 */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return [];
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: Pt, a: Pt, b: Pt): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return hull.length >= 3 ? hull : [];
}

/**
 * 껍질을 **모서리 둥근 닫힌 경로**로. 각 꼭짓점에서 이웃 쪽으로 `r` 만큼 물러난 두 점을
 * 이차 곡선으로 잇는다 — 각진 껍질은 「임시로 그은 선」처럼 보인다.
 */
export function roundedHullPath(hull: Pt[], r = 14): string | null {
  if (hull.length < 3) return null;
  const at = (i: number): Pt => hull[(i + hull.length) % hull.length];
  const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  let d = '';
  for (let i = 0; i < hull.length; i += 1) {
    const prev = at(i - 1);
    const cur = at(i);
    const next = at(i + 1);
    const dPrev = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const dNext = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const a = lerp(cur, prev, Math.min(0.5, r / dPrev));
    const b = lerp(cur, next, Math.min(0.5, r / dNext));
    d += i === 0 ? `M ${a.x.toFixed(1)},${a.y.toFixed(1)}` : ` L ${a.x.toFixed(1)},${a.y.toFixed(1)}`;
    d += ` Q ${cur.x.toFixed(1)},${cur.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

/** 노드 네 모서리를 `pad` 만큼 부풀린 점들 — 껍질 재료. */
export function boxCorners(box: { x: number; y: number; w: number; h: number }, pad = 0): Pt[] {
  return [
    { x: box.x - pad, y: box.y - pad },
    { x: box.x + box.w + pad, y: box.y - pad },
    { x: box.x + box.w + pad, y: box.y + box.h + pad },
    { x: box.x - pad, y: box.y + box.h + pad },
  ];
}

/**
 * 물결·금 간 선 — 「애매한 사이」·「깨진 사이」를 점선만으로는 못 나타낸다.
 * 베지어를 잘게 나눠 법선 방향으로 흔든다. `mode='wavy'` 는 사인파, `'crack'` 은 지그재그.
 * 양 끝은 흔들지 않는다(노드에 닿는 자리가 떨리면 어디에 붙었는지가 흐려진다).
 */
export function wobblePath(
  g: { p1: Pt; c1: Pt; c2: Pt; p2: Pt },
  mode: 'wavy' | 'crack',
  opts: { steps?: number; amp?: number } = {},
): string {
  const steps = opts.steps ?? 24;
  const amp = opts.amp ?? (mode === 'wavy' ? 5 : 4);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = pointOnCubic(g, t);
    const q = pointOnCubic(g, Math.min(1, t + 0.001));
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const taper = Math.sin(t * Math.PI);   // 끝으로 갈수록 0
    const off = mode === 'wavy'
      ? Math.sin(t * Math.PI * (steps / 3)) * amp * taper
      : (i % 2 === 0 ? amp : -amp) * taper;
    pts.push(`${(p.x - (dy / len) * off).toFixed(2)},${(p.y + (dx / len) * off).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')}`;
}

/** 미니맵·맞춤보기가 쓰는 「세계 → 작은 판」 투영. */
export interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

/**
 * 세계 전체를 `size` 안에 **가운데 맞춰** 담는 배율·여백. `margin` 은 가장자리를 조금 남기는 비율
 * (1 이면 딱 붙어 그림이 판에 물린 것처럼 보인다).
 *
 * 세계가 비면(폭·높이 0) 배율 0 을 돌려준다 — 호출한 쪽이 「그릴 게 없다」로 곧장 빠져나가게.
 */
export function fitProjection(bounds: WorldBounds, size: { w: number; h: number }, margin = 0.9): Projection {
  if (bounds.w <= 0 || bounds.h <= 0) return { scale: 0, offsetX: 0, offsetY: 0 };
  const scale = Math.min(size.w / bounds.w, size.h / bounds.h) * margin;
  return {
    scale,
    offsetX: (size.w - bounds.w * scale) / 2,
    offsetY: (size.h - bounds.h * scale) / 2,
  };
}

/** 세계 좌표 → 작은 판 좌표. */
export function projectPoint(bounds: WorldBounds, p: Projection, x: number, y: number): Pt {
  return {
    x: (x - bounds.minX) * p.scale + p.offsetX,
    y: (y - bounds.minY) * p.scale + p.offsetY,
  };
}

/**
 * 지금 화면이 덮는 자리를 작은 판 위 사각형으로. 판 밖으로 삐져나간 만큼은 잘라 낸다
 * — 안 자르면 미니맵의 「지금 보는 곳」 상자가 판을 넘어가 어디를 보는지 되레 흐려진다.
 */
export function viewportRectOnMap(
  bounds: WorldBounds,
  p: Projection,
  view: { tx: number; ty: number; scale: number; w: number; h: number },
  size: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const left = -view.tx / view.scale;
  const top = -view.ty / view.scale;
  const a = projectPoint(bounds, p, left, top);
  const b = projectPoint(bounds, p, left + view.w / view.scale, top + view.h / view.scale);
  const x = Math.max(0, a.x);
  const y = Math.max(0, a.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(size.w - x, b.x - a.x)),
    h: Math.max(0, Math.min(size.h - y, b.y - a.y)),
  };
}


/** 상자의 어느 면에서 선이 나가나. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * 두 박스 중심 상대 위치 → 가장 가까운 면 쌍 선택.
 * 반환 = {p1, p2, side1, side2}, side ∈ 'top'|'right'|'bottom'|'left'.
 * 면의 중점이 anchor. 베지어 control 은 면에 수직으로 밀어냄.
 */
export function chooseAnchors(
b1: { x: number; y: number; w: number; h: number },
b2: { x: number; y: number; w: number; h: number },
): { p1: Pt; p2: Pt; side1: Side; side2: Side } {
  const c1 = { x: b1.x + b1.w / 2, y: b1.y + b1.h / 2 };
  const c2 = { x: b2.x + b2.w / 2, y: b2.y + b2.h / 2 };
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  let side1: 'top' | 'right' | 'bottom' | 'left';
  let side2: 'top' | 'right' | 'bottom' | 'left';
  if (horizontal) {
    side1 = dx >= 0 ? 'right' : 'left';
    side2 = dx >= 0 ? 'left' : 'right';
  } else {
    side1 = dy >= 0 ? 'bottom' : 'top';
    side2 = dy >= 0 ? 'top' : 'bottom';
  }
  const sidePoint = (b: { x: number; y: number; w: number; h: number }, side: string) => {
    switch (side) {
      case 'top':    return { x: b.x + b.w / 2, y: b.y };
      case 'bottom': return { x: b.x + b.w / 2, y: b.y + b.h };
      case 'left':   return { x: b.x,           y: b.y + b.h / 2 };
      case 'right':  return { x: b.x + b.w,     y: b.y + b.h / 2 };
      default:       return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
  };
  return { p1: sidePoint(b1, side1), p2: sidePoint(b2, side2), side1, side2 };
}
