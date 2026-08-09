/**
 * lib/graph/canvas-anchors.ts — 임시 자리(anchor) (TASK-KL-202 방향① 해체 9조각).
 */
import type { EphemeralAnchor } from './spec';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 임시 자리(anchor) 그리기 — 바깥 자료(파일·서비스)에서 흘러들어오는 것들이 잠깐 놓이는 상자.
 * KarmoMap 에서는 거의 안 쓰이고 cockpit 이 쓴다. 그래도 **캔버스 본체에 남겨 두면**
 * 「이건 뭐지?」로 읽는 시간을 계속 먹는다 — 쓰는 쪽이 분명한 것은 따로 둔다.
 */
export interface AnchorBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function renderAnchors(
  anchors: EphemeralAnchor[],
  layout: Map<string, AnchorBox>,
  layer: SVGGElement,
  theme: { anchorFill: string; anchorStroke: string; anchorText: string },
): void {
  for (const a of anchors ?? []) {
    const eff = layout.get(a.id);
    if (!eff) continue;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(eff.x));
    rect.setAttribute('y', String(eff.y));
    rect.setAttribute('width', String(eff.w));
    rect.setAttribute('height', String(eff.h));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', theme.anchorFill);
    rect.setAttribute('stroke', theme.anchorStroke);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('stroke-dasharray', '4 3');
    layer.appendChild(rect);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(eff.x + 8));
    text.setAttribute('y', String(eff.y + 14));
    text.setAttribute('fill', theme.anchorText);
    text.setAttribute('font-size', '10');
    text.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
    text.textContent = '⚡ ' + a.label;
    layer.appendChild(text);
  }
}
