/**
 * poster.ts — 판을 **자랑할 한 장**으로 (TASK-KL-271 O1).
 *
 * 「그림으로 저장」이 판을 있는 그대로 오려 내던 시절, 그 그림을 받은 사람은 제목도 범례도 없이
 * 색깔만 보고 있어야 했다. 공식 캐릭터 상관도가 늘 **제목 위 · 범례 아래**로 나오는 이유가 그것이다
 * (사용자 컨펌 2026-08-13: 위 제목 · 아래 범례 · 판에 맞춘 크기 하나).
 *
 * 하는 일은 **틀을 씌우는 것 하나**다: 이미 만들어진 그림 SVG 를 안쪽에 그대로 앉히고,
 * 위에 제목줄, 아래에 범례줄을 두른다. 그림 자체는 안 건드린다 — 건드리면 「화면과 다른 그림」이 된다.
 *
 * 왜 순수 함수인가: 자리 셈(줄 높이·글자 너비·몇 줄로 접히나)은 눈으로 못 재고, 브라우저 없이
 * 검사할 수 있어야 한다. 그리는 것은 문자열 이어 붙이기뿐이라 DOM 이 필요 없다.
 */
import type { LegendItem } from './poster-legend';

export interface PosterSkin {
  bg: string;
  text: string;
  dim: string;
  line: string;
}

export interface PosterOptions {
  title: string;
  /** 제목 오른쪽 끝에 작게 — 없으면 안 그린다. */
  stamp?: string;
  legend: LegendItem[];
  /** 범례에서 접힌 가짓수 — 0 보다 크면 「그 밖 N가지」를 끝에 붙인다. */
  more?: number;
  skin: PosterSkin;
  /** 종류 id → 앞에 붙일 그림글자(이모지). 없으면 안 붙인다. */
  iconOf?: (item: LegendItem) => string;
  /** 종류 id → 색 점. 없으면 점을 안 찍는다. */
  colorOf?: (item: LegendItem) => string | undefined;
}

/** 제목줄 높이. 글자 20px + 위아래 숨 쉴 자리. */
export const HEAD_H = 56;
/** 범례 한 줄 높이. */
export const LEGEND_ROW_H = 26;
const PAD = 20;
/** 범례 한 칸의 가로 — 글자 수로 어림한다(한글 기준 폭). */
function chipWidth(item: LegendItem, hasIcon: boolean): number {
  return (item.label.length + String(item.count).length) * 13 + (hasIcon ? 26 : 14) + 22;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** 그림 SVG 의 크기 — 없으면 `null`(그때는 틀을 안 씌운다. 크기를 모르면 자리를 못 잡는다). */
export function readSize(svg: string): { w: number; h: number } | null {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!open) return null;
  const w = Number(/\bwidth="([\d.]+)"/.exec(open)?.[1]);
  const h = Number(/\bheight="([\d.]+)"/.exec(open)?.[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

/**
 * 범례를 몇 줄로 접을까 — 한 줄에 넣다가 폭을 넘으면 다음 줄로 (칸 개수를 미리 못 정하는 이유:
 * 「인물」과 「말 안 통하는 사이」의 폭이 다르다).
 */
export function legendRows(items: LegendItem[], width: number, hasIcon: boolean): LegendItem[][] {
  const rows: LegendItem[][] = [];
  let row: LegendItem[] = [];
  let x = 0;
  for (const it of items) {
    const w = chipWidth(it, hasIcon);
    if (row.length > 0 && x + w > width - PAD * 2) { rows.push(row); row = []; x = 0; }
    row.push(it);
    x += w;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * 그림에 틀을 씌워 한 장으로.
 * 크기를 못 읽으면 **원본을 그대로 돌려준다** — 틀을 잘못 씌우느니 안 씌우는 게 낫다.
 */
export function wrapPoster(svg: string, opts: PosterOptions): string {
  const size = readSize(svg);
  if (!size) return svg;
  const hasIcon = Boolean(opts.iconOf);
  const rows = opts.legend.length > 0 ? legendRows(opts.legend, size.w, hasIcon) : [];
  const footH = rows.length > 0 ? rows.length * LEGEND_ROW_H + PAD : 0;
  const totalH = size.h + HEAD_H + footH;
  const { skin } = opts;

  // 안쪽 그림은 **그대로** 앉힌다 — 여는 태그에 자리(x·y)만 얹는다.
  const inner = svg.replace(/<svg\b/, `<svg x="0" y="${HEAD_H}"`);

  const head = `<text x="${PAD}" y="${HEAD_H - 20}" fill="${skin.text}" font-size="21" font-weight="700"`
    + ` font-family="system-ui, sans-serif">${esc(opts.title)}</text>`
    + (opts.stamp
      ? `<text x="${size.w - PAD}" y="${HEAD_H - 21}" fill="${skin.dim}" font-size="12" text-anchor="end"`
        + ` font-family="system-ui, sans-serif">${esc(opts.stamp)}</text>`
      : '')
    + `<line x1="0" y1="${HEAD_H - 1}" x2="${size.w}" y2="${HEAD_H - 1}" stroke="${skin.line}" stroke-width="1"/>`;

  let foot = '';
  if (rows.length > 0) {
    const top = HEAD_H + size.h;
    foot += `<line x1="0" y1="${top}" x2="${size.w}" y2="${top}" stroke="${skin.line}" stroke-width="1"/>`;
    rows.forEach((row, r) => {
      let x = PAD;
      const y = top + PAD / 2 + LEGEND_ROW_H * (r + 1) - 8;
      for (const it of row) {
        const color = opts.colorOf?.(it);
        if (color) {
          foot += `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${color}"/>`;
          x += 16;
        }
        const icon = opts.iconOf?.(it) ?? '';
        const text = `${icon ? `${icon} ` : ''}${it.label} ${it.count}`;
        foot += `<text x="${x}" y="${y}" fill="${skin.dim}" font-size="13"`
          + ` font-family="system-ui, sans-serif">${esc(text)}</text>`;
        x += chipWidth(it, hasIcon) - (color ? 16 : 0);
      }
    });
    if (opts.more && opts.more > 0) {
      foot += `<text x="${size.w - PAD}" y="${top + PAD / 2 + LEGEND_ROW_H * rows.length - 8}" fill="${skin.dim}"`
        + ` font-size="12" text-anchor="end" font-family="system-ui, sans-serif">+${opts.more}</text>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
    + ` width="${Math.round(size.w)}" height="${Math.round(totalH)}"`
    + ` viewBox="0 0 ${Math.round(size.w)} ${Math.round(totalH)}">`
    + `<rect x="0" y="0" width="${size.w}" height="${totalH}" fill="${skin.bg}"/>`
    + head + inner + foot
    + `</svg>`;
}
