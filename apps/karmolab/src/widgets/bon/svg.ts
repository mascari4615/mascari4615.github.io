/**
 * 「본」 — SVG 로 내보내기 (TASK-KL-254 · 1단계)
 *
 * 화면에 그릴 때도, 파일로 저장할 때도 **여기 하나**를 지난다. 두 벌로 적으면 「화면이랑
 * 저장한 게 다르다」가 생긴다 — 먹에서 합성을 직접 짠 이유와 같다.
 *
 * 브라우저를 모른다. 문자열만 만든다 — 그래서 화면 없이 검사할 수 있고, 나중에 서버에서
 * 무더기로 뽑아낼 때도 같은 코드가 쓰인다.
 */

import type { Doc, Layer, Node, Paint, Stroke } from './model';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** 소수점 세 자리까지. 파일이 쓸데없이 길어지지 않게, 그리고 판이 달라도 같은 글자가 나오게. */
const n = (v: number): string => String(Math.round(v * 1000) / 1000);

interface Defs { entries: string[] }

function paintRef(paint: Paint | undefined, defs: Defs): string {
  if (!paint) return 'none';
  if (paint.kind === 'solid') return paint.color;
  // 각도는 시계 방향, 0 = 왼→오른쪽. SVG 의 x1y1x2y2 로 옮긴다.
  const rad = (paint.angle * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  const id = `g${defs.entries.length}`;
  defs.entries.push(
    `<linearGradient id="${id}" x1="${n(0.5 - dx)}" y1="${n(0.5 - dy)}" x2="${n(0.5 + dx)}" y2="${n(0.5 + dy)}">` +
      `<stop offset="0" stop-color="${esc(paint.from)}"/><stop offset="1" stop-color="${esc(paint.to)}"/></linearGradient>`
  );
  return `url(#${id})`;
}

function strokeAttrs(stroke: Stroke | undefined, defs: Defs): string {
  if (!stroke || stroke.width <= 0) return '';
  return ` stroke="${paintRef(stroke.paint, defs)}" stroke-width="${n(stroke.width)}"`;
}

/** 테두리를 안/바깥에 그리는 흉내 — SVG 는 가운데만 안다. 모양을 반 두께만큼 물린다. */
function inset(stroke: Stroke | undefined): number {
  if (!stroke || stroke.width <= 0) return 0;
  if (stroke.align === 'inside') return stroke.width / 2;
  if (stroke.align === 'outside') return -stroke.width / 2;
  return 0;
}

function nodeToSvg(node: Node, defs: Defs): string {
  const op = node.opacity !== undefined && node.opacity < 1 ? ` opacity="${n(node.opacity)}"` : '';
  switch (node.kind) {
    case 'rect': {
      const d = inset(node.stroke);
      const w = Math.max(0, node.w - d * 2);
      const h = Math.max(0, node.h - d * 2);
      // 모서리는 반쪽보다 둥글 수 없다 — 넘겨 주면 SVG 가 조용히 잘라 먹으니 여기서 맞춘다.
      const r = Math.max(0, Math.min(node.radius, w / 2, h / 2));
      return `<rect x="${n(node.x + d)}" y="${n(node.y + d)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" ry="${n(r)}" fill="${paintRef(node.fill, defs)}"${strokeAttrs(node.stroke, defs)}${op}/>`;
    }
    case 'ellipse': {
      const d = inset(node.stroke);
      return `<ellipse cx="${n(node.cx)}" cy="${n(node.cy)}" rx="${n(Math.max(0, node.rx - d))}" ry="${n(Math.max(0, node.ry - d))}" fill="${paintRef(node.fill, defs)}"${strokeAttrs(node.stroke, defs)}${op}/>`;
    }
    case 'path':
      return `<path d="${esc(node.d)}" fill="${paintRef(node.fill, defs)}"${strokeAttrs(node.stroke, defs)}${op}/>`;
    case 'group':
      return `<g${op}>${node.children.map((c) => nodeToSvg(c, defs)).join('')}</g>`;
  }
}

function layerToSvg(layer: Layer, defs: Defs): string {
  if (!layer.visible) return '';
  const op = layer.opacity < 1 ? ` opacity="${n(layer.opacity)}"` : '';
  return `<g data-layer="${esc(layer.name)}"${op}>${layer.nodes.map((nd) => nodeToSvg(nd, defs)).join('')}</g>`;
}

/** 문서 한 벌 → SVG 글자. 이 결과가 화면에도 들어가고 파일로도 저장된다. */
export function toSvg(doc: Doc): string {
  const defs: Defs = { entries: [] };
  const body = doc.layers.map((l) => layerToSvg(l, defs)).join('');
  const defsBlock = defs.entries.length ? `<defs>${defs.entries.join('')}</defs>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(doc.w)} ${n(doc.h)}" width="${n(doc.w)}" height="${n(doc.h)}">` +
    defsBlock +
    body +
    '</svg>'
  );
}
