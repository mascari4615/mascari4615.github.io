/**
 * lib/graph/canvas-fields.ts — 카드에 접어 넣는 **칸 줄** (TASK-KL-202 방향① 해체 10조각).
 *
 * 칸(출신·첫 등장…)은 **카드에서 읽혀야** 값이 있다 — 패널을 열어야만 보이면 아무도 안 적는다.
 * 다만 카드가 표가 되면 그림이 안 읽히므로 **세 줄까지만**, 나머지는 `+N` 으로 접는다.
 */

import { TYPE } from './canvas-type';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 칸 줄 높이·최대 줄 수. */
export const NODE_FIELD_ROW_H = 11;
export const NODE_FIELD_MAX_ROWS = 3;

export function buildFieldRows(
  fields: Record<string, string> | undefined,
  opts: { x: number; y: number; width: number; color: string },
): SVGTextElement[] {
  const rows = Object.entries(fields ?? {}).filter(([, v]) => String(v).trim());
  if (rows.length === 0) return [];
  const shown = rows.slice(0, NODE_FIELD_MAX_ROWS);
  const maxChars = Math.max(6, Math.floor((opts.width - opts.x - 10) / 5.2));
  const out: SVGTextElement[] = [];

  const line = (text: string, i: number, opacity?: string): SVGTextElement => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('x', String(opts.x));
    el.setAttribute('y', String(opts.y + i * NODE_FIELD_ROW_H));
    el.setAttribute('fill', opts.color);
    el.setAttribute('font-size', String(TYPE.meta));
    el.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    el.setAttribute('pointer-events', 'none');
    if (opacity) el.setAttribute('opacity', opacity);
    el.textContent = text;
    return el;
  };

  shown.forEach(([name, value], i) => {
    const raw = `${name}: ${value}`;
    out.push(line(raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw, i));
  });
  if (rows.length > shown.length) out.push(line(`+${rows.length - shown.length}`, shown.length, '0.7'));
  return out;
}
