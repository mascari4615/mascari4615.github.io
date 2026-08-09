/**
 * lib/graph/canvas-ephemeral.ts — **흘러가는 카드** (TASK-KL-202 방향① 그리기 조각).
 *
 * 사람이 놓은 카드가 아니라 바깥(라이브 데이터)에서 잠깐 들어와 붙는 카드다. 그래서 생김새가
 * 다르다 — 점선 테두리 · 살짝 투명 · 고정폭 글꼴. **사람 것과 헷갈리면 지우기가 무서워진다.**
 *
 * 이름이 상자보다 길면 잘라서 `…` 로 접고, 잘린 이름은 마우스를 얹으면 통째로 보인다
 * (잘린 채로 두면 「이름이 저게 전부인 줄」 안다).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 고정폭 10px 글꼴 한 글자 ≈ 6.2px, 좌우 여백 16px. */
export const EPH_CHAR_W = 6.2;
export const EPH_PADDING = 16;

/** 상자 폭에 들어갈 만큼만 남기고 접는다. */
export function foldEphemeralLabel(label: string, width: number): string {
  const maxChars = Math.max(4, Math.floor((width - EPH_PADDING) / EPH_CHAR_W));
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

export interface EphemeralTheme {
  ephemeralFill: string;
  ephemeralStroke: string;
  ephemeralText: string;
}

export function buildEphemeralNode(
  en: { id: string; label: string; x: number; y: number; w: number; h: number },
  offsetY: number,
  theme: EphemeralTheme,
): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('class', 'ck-node ck-node-ephemeral');
  g.dataset.id = en.id;
  g.setAttribute('transform', `translate(${en.x},${en.y + offsetY})`);
  g.style.opacity = '0.85';

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', String(en.w));
  rect.setAttribute('height', String(en.h));
  rect.setAttribute('rx', '4');
  rect.setAttribute('fill', theme.ephemeralFill);
  rect.setAttribute('stroke', theme.ephemeralStroke);
  rect.setAttribute('stroke-width', '1');
  rect.setAttribute('stroke-dasharray', '4 2');
  g.appendChild(rect);

  // 잘린 이름은 마우스를 얹으면 통째로 보인다.
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = en.label;
  g.appendChild(title);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', '8');
  text.setAttribute('y', String(en.h / 2 + 4));
  text.setAttribute('fill', theme.ephemeralText);
  text.setAttribute('font-size', '10');
  text.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
  text.setAttribute('pointer-events', 'none');
  text.textContent = foldEphemeralLabel(en.label, en.w);
  g.appendChild(text);

  return g;
}
