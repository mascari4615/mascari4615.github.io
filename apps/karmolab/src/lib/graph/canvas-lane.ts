/**
 * lib/graph/canvas-lane.ts — 단계 띠(레인).
 *
 * 노드가 많아지면 「무엇 다음에 무엇」은 선으로 보이지만 「지금 몇 번째 단계인가」는 안 보인다.
 * 기술 트리·로드맵이 늘 가로 띠를 까는 이유다. 띠는 자리(y 범위)만 알고 어느 노드가 속하는지는 모른다 —
 * 그래야 노드를 옮겨도 띠가 안 깨진다.
 */
import type { LaneDef } from './spec';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface LaneRenderOptions {
  layer: SVGGElement;
  /** 띠가 가로로 덮을 범위 — 보통 전체 노드의 x 범위 + 여백. */
  x: number;
  w: number;
  defaultColor?: string;
}

/** 띠를 다시 그린다(있던 것은 지우고). */
export function renderLanes(lanes: LaneDef[], opts: LaneRenderOptions): void {
  opts.layer.querySelectorAll('.ck-lane').forEach((el) => el.remove());
  const color = opts.defaultColor ?? 'rgba(148,163,184,0.06)';

  lanes.forEach((lane, i) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'ck-lane');
    g.dataset.laneId = lane.id;

    const band = document.createElementNS(SVG_NS, 'rect');
    band.setAttribute('x', String(opts.x));
    band.setAttribute('y', String(lane.y));
    band.setAttribute('width', String(opts.w));
    band.setAttribute('height', String(lane.h));
    /* 홀짝을 살짝 다르게 — 경계선을 긋는 것보다 눈이 덜 피로하다. */
    band.setAttribute('fill', lane.color ?? (i % 2 === 0 ? color : 'transparent'));
    g.appendChild(band);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'ck-lane-label');
    label.setAttribute('x', String(opts.x + 12));
    label.setAttribute('y', String(lane.y + 18));
    label.textContent = lane.label;
    g.appendChild(label);

    opts.layer.appendChild(g);
  });
}
