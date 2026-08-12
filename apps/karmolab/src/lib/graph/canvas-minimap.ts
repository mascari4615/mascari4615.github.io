/**
 * lib/graph/canvas-minimap.ts — **판 전체를 손바닥만 하게** (TASK-KL-202 방향① 해체: 보기 조각).
 *
 * 미니맵은 두 가지 일만 한다: 판 위 것들을 축소해 깔고, 「지금 보는 곳」 상자를 얹는다.
 * 규칙 하나가 여기 박혀 있다 — **카드가 서넛뿐이면 아예 안 띄운다.** 그때 미니맵은 길잡이가
 * 아니라 화면 구석의 정체 모를 검은 상자다(빈 판에서 특히 그렇게 보인다).
 *
 * 자리 계산(무엇이 어디에 몇 픽셀로)은 순수 함수로 빼서 브라우저 없이 시험한다. 그리기는
 * 그 결과를 받아 칠하기만 한다 — **「1픽셀짜리 점이 돼 안 보인다」 같은 것이 숫자로 잡힌다.**
 */
import { projectPoint } from './canvas-math';

/** 이 수 미만이면 미니맵을 아예 안 띄운다. */
export const MINIMAP_MIN_NODES = 4;
/** 축소해도 이보다 작게는 안 그린다 — 0.4px 짜리는 안 보인다. */
export const MINIMAP_MIN_PX = 2;

/**
 * 작은 판을 띄울 값어치가 있나.
 *
 * ★ 카드 수만 보면 안 된다. 카드 여섯 장이 화면에 **전부 보이는데도** 구석에 축소판이 떠서,
 * 큼직한 색 덩어리 몇 개가 로딩 자리표시자처럼 보였다(실측 2026-08-12). 작은 판이 하는 일은
 * 「화면 밖에 뭐가 더 있는지」 알려 주는 것 하나뿐이다 — **밖에 아무것도 없으면 뺀다**.
 */
/**
 * 판 전체가 지금 화면 안에 다 들어와 있나. 순수 셈이라 브라우저 없이 시험한다.
 * `view` 는 **화면 픽셀** 기준(폭·높이·배율·평행이동) — 세계 좌표로 되돌려 비교한다.
 */
export function worldFitsInView(
  bounds: { minX: number; minY: number; w: number; h: number },
  view: { w: number; h: number; scale: number; tx: number; ty: number },
): boolean {
  if (bounds.w <= 0 || bounds.h <= 0 || view.scale <= 0) return false;
  const vw = view.w / view.scale;
  const vh = view.h / view.scale;
  const vx = -view.tx / view.scale;
  const vy = -view.ty / view.scale;
  return bounds.minX >= vx && bounds.minY >= vy
    && bounds.minX + bounds.w <= vx + vw && bounds.minY + bounds.h <= vy + vh;
}

export function minimapWorthIt(nodeCount: number, worldFitsInView = false): boolean {
  if (nodeCount < MINIMAP_MIN_NODES) return false;
  return !worldFitsInView;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MiniRect extends Box {
  fill: string;
  stroke?: string;
  rx?: number;
}

export interface MinimapModel {
  groups: { bbox: Box; color: string }[];
  nodes: { x: number; y: number; w: number; h: number; color: string }[];
  ephemeral: { x: number; y: number; w: number; h: number }[];
}

/** 흘러가는(임시) 카드는 늘 같은 물색 — 사람이 만든 것과 구별돼야 한다. */
export const EPHEMERAL_FILL = '#22d3ee40';

/**
 * 무엇을 어디에 그릴지. 그리는 순서가 곧 겹치는 순서다 — 묶음 바탕 → 카드 → 임시 카드.
 */
export function minimapRects(
  model: MinimapModel,
  /** 판 전체가 차지한 범위 — `worldBounds()` 가 주는 그 모양(minX/minY 기준). */
  bounds: { minX: number; minY: number; w: number; h: number },
  proj: { scale: number; offsetX: number; offsetY: number },
): MiniRect[] {
  const ms = proj.scale;
  const at = (x: number, y: number) => projectPoint(bounds, proj, x, y);
  const out: MiniRect[] = [];

  for (const g of model.groups) {
    const p = at(g.bbox.x, g.bbox.y);
    out.push({
      x: p.x, y: p.y, w: g.bbox.w * ms, h: g.bbox.h * ms,
      fill: g.color + '10', stroke: g.color + '30',
    });
  }
  for (const n of model.nodes) {
    const p = at(n.x, n.y);
    out.push({
      x: p.x, y: p.y,
      w: Math.max(MINIMAP_MIN_PX, n.w * ms),
      h: Math.max(MINIMAP_MIN_PX, n.h * ms),
      fill: n.color + '70', rx: 2,
    });
  }
  for (const e of model.ephemeral) {
    const p = at(e.x, e.y);
    out.push({
      x: p.x, y: p.y,
      w: Math.max(MINIMAP_MIN_PX, e.w * ms),
      h: Math.max(MINIMAP_MIN_PX, e.h * ms),
      fill: EPHEMERAL_FILL, rx: 2,
    });
  }
  return out;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 계산된 것을 칠한다. 「지금 보는 곳」 상자는 지우지 않고 **그 앞에** 끼워 넣는다. */
export function paintMinimap(
  svg: SVGSVGElement,
  viewportRect: SVGRectElement,
  rects: MiniRect[],
): void {
  Array.from(svg.children).filter((c) => c !== viewportRect).forEach((c) => c.remove());
  for (const r of rects) {
    const el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('x', String(r.x));
    el.setAttribute('y', String(r.y));
    el.setAttribute('width', String(r.w));
    el.setAttribute('height', String(r.h));
    if (r.rx !== undefined) el.setAttribute('rx', String(r.rx));
    el.setAttribute('fill', r.fill);
    if (r.stroke) {
      el.setAttribute('stroke', r.stroke);
      el.setAttribute('stroke-width', '0.5');
    }
    svg.insertBefore(el, viewportRect);
  }
}
