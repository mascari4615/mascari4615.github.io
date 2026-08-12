/**
 * lib/graph/canvas-edge.ts — 선 하나를 그리는 일 (TASK-KL-202 방향① 해체 6조각).
 *
 * 「무슨 색·굵기·모양인가」는 **이미 정해져서** 여기로 온다(선 자체 > 종류 정의 > 테마 순서로
 * 고르는 일은 캔버스가 한다). 여기서는 그 값으로 path 하나를 만들 뿐이다.
 *
 * 이 갈라놓기가 값을 하는 자리: 새 선 모양(물결·금 간 선 …)을 더할 때 고칠 곳이 한 군데다.
 */
import type { EdgeStyle } from './spec';
import { wobblePath, pointOnCubic } from './canvas-math';
import type { Pt } from './canvas-math';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface EdgeLook {
  style: EdgeStyle;
  color: string;
  width: number;
  arrowEnd: boolean;
  arrowStart: boolean;
}

export function buildEdgePath(
  edgeId: string,
  g: { p1: Pt; c1: Pt; c2: Pt; p2: Pt },
  look: EdgeLook,
): SVGPathElement {
  const { p1, c1, c2, p2 } = g;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'ck-edge');
  path.dataset.edgeId = edgeId;

  const wobbly = look.style === 'wavy' || look.style === 'crack';
  // 흔들림의 잘기는 **선 길이**에 맞춘다 — 짧은 선을 촘촘히 흔들면 뭉개진다.
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const steps = Math.max(12, Math.min(120, Math.round(dist / (look.style === 'wavy' ? 6 : 12))));
  path.setAttribute(
    'd',
    wobbly
      ? wobblePath(g, look.style as 'wavy' | 'crack', { steps, amp: look.style === 'wavy' ? 3.5 : 5 })
      : `M ${p1.x},${p1.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`,
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', look.color);
  path.setAttribute('stroke-width', String(look.width));
  path.setAttribute('stroke-opacity', '0.7');
  if (look.style === 'crack') path.setAttribute('stroke-linejoin', 'miter');
  if (look.style === 'dashed') path.setAttribute('stroke-dasharray', '6 3');
  else if (look.style === 'dotted') path.setAttribute('stroke-dasharray', '2 3');
  if (look.arrowEnd) path.setAttribute('marker-end', 'url(#ck-arrow)');
  if (look.arrowStart) path.setAttribute('marker-start', 'url(#ck-arrow-start)');
  return path;
}


/**
 * 선 위 **이름표**. 자리(`labelPos`)는 선 위 비율 — 0 = 출발, 1 = 도착(draw.io 의 라벨 위치와 같은 개념).
 * 끌 수 있어야 한다: 선 위 어디에 둘지는 그림마다 다르고, 가운데 고정은 곧 겹친다.
 */
export function buildEdgeLabel(
  edgeId: string,
  text: string,
  g: { p1: Pt; c1: Pt; c2: Pt; p2: Pt },
  opts: { at?: number; color: string; plateFill: string; textColor: string; draggable: boolean },
): SVGGElement | null {
  const label = text.trim();
  if (!label) return null;
  const at = pointOnCubic(g, Math.min(1, Math.max(0, opts.at ?? 0.5)));
  const w = label.length * 7 + 12;
  const h = 16;

  const wrap = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  wrap.setAttribute('class', 'ck-edge-label');
  wrap.dataset.edgeId = edgeId;
  if (opts.draggable) wrap.style.cursor = 'grab';
  else wrap.setAttribute('pointer-events', 'none');

  const plate = document.createElementNS(SVG_NS, 'rect');
  plate.setAttribute('x', String(at.x - w / 2));
  plate.setAttribute('y', String(at.y - h / 2));
  plate.setAttribute('width', String(w));
  plate.setAttribute('height', String(h));
  plate.setAttribute('rx', '8');
  plate.setAttribute('fill', opts.plateFill);
  plate.setAttribute('stroke', `${opts.color}80`);
  plate.setAttribute('stroke-width', '1');
  wrap.appendChild(plate);

  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(at.x));
  t.setAttribute('y', String(at.y + 3.5));
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('fill', opts.textColor);
  t.setAttribute('font-size', '9.5');
  t.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
  t.textContent = label;
  wrap.appendChild(t);
  return wrap;
}


/**
 * 메모 **지시선** — 메모에서 그것이 가리키는 것(노드 또는 선)까지 잇는 옅은 점선.
 * 관계선이 아니다: 관계는 세계관의 사실이고, 지시선은 「이 메모가 저것에 대한 말」이라는 표시라
 * 종류·화살표·이름표가 없다. 그래서 **선 층 맨 뒤**에 깔린다(관계선을 가리면 안 된다).
 */
export function buildLeaderLine(from: Pt, to: Pt, color: string): SVGPathElement {
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('class', 'ck-leader');
  line.setAttribute('d', `M ${from.x},${from.y} L ${to.x},${to.y}`);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '2 4');
  line.setAttribute('stroke-opacity', '0.55');
  line.setAttribute('pointer-events', 'none');
  return line;
}


/**
 * 흐르는 선 표시를 지금 상태에 맞춘다 — **요소를 새로 만들지 않고** 클래스만 갈아 준다.
 * (본체에서 떼어 낸 이유: 선을 부분만 다시 그릴 때도 그대로 부를 수 있어야 해서.)
 */
export function applyEdgeFlow(layer: SVGGElement, animated: Set<string>, only?: Set<string>): void {
  // ★ `only` 가 있으면 **그 선들만** 훑는다. 없으면 선 전부를 훑는데, 카드 600장짜리 판에서
  //   그건 끄는 동안 매 프레임 1800개 요소를 다시 뒤지는 일이 된다(실측 2026-08-12).
  const sel = only ? [...only].map((id) => `.ck-edge[data-edge-id="${CSS.escape(id)}"]`).join(',') : '.ck-edge';
  if (!sel) return;
  layer.querySelectorAll(sel).forEach((el) => {
    const path = el as SVGPathElement;
    path.classList.toggle('is-flowing', animated.has(path.dataset.edgeId ?? ''));
  });
}
