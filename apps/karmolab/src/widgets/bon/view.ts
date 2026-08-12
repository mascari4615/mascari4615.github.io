/**
 * 「본」 — 보기 (TASK-KL-254 · 2단계)
 *
 * 화면에 닿는 첫 파일. 하는 일은 셋뿐이다:
 *  ① 문서를 SVG 글자로 만들어 화면에 얹는다 — **내보낼 때와 같은 길**(`toSvg`)을 쓴다.
 *     화면용으로 따로 그리면 「보이는 것과 저장한 것이 다르다」가 언젠가 생긴다.
 *  ② 그 위에 **덧그림**(고른 테두리·손잡이·격자)을 따로 얹는다. 이건 그림 데이터가 아니라
 *     안내선이라, 저장할 때 섞이면 안 된다 — 그래서 SVG 두 겹으로 나눠 둔다.
 *  ③ 화면 좌표 ↔ 문서 좌표를 옮긴다. 셈(`geom`)은 문서 좌표만 안다.
 */

import type { Doc } from './model';
import { bounds, handlePoints, type Box } from './geom';
import { clampSlice, type Slice } from './slice';
import { toSvg } from './svg';

export class BonView {
  readonly root: HTMLElement;
  private art: HTMLElement;      // 그림 (문서 그대로)
  private guides: SVGSVGElement; // 덧그림 (안내선)
  /** 확대율. 1 = 문서 1px 이 화면 1px */
  scale = 2;
  /** 격자 간격(문서 px). 0 = 안 그림 */
  grid = 8;
  /** 9-slice 경계선을 보일까. 켜면 선 넷이 뜨고 잡아서 끌 수 있다. */
  sliceOn = false;
  slice: Slice = { left: 0, right: 0, top: 0, bottom: 0 };

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'bon-stage';
    this.art = document.createElement('div');
    this.art.className = 'bon-art';
    this.guides = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.guides.setAttribute('class', 'bon-guides');
    this.root.append(this.art, this.guides);
    parent.append(this.root);
  }

  /** 화면 위 한 점 → 문서 좌표. 확대·스크롤을 되돌린다. */
  toDoc(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.art.getBoundingClientRect();
    return { x: (event.clientX - r.left) / this.scale, y: (event.clientY - r.top) / this.scale };
  }

  /** 화면에서 손가락 굵기 몇 px 이 문서 좌표로 얼마인지 — 확대해도 잡기 쉬움이 그대로다. */
  slop(screenPx = 6): number { return screenPx / this.scale; }

  /** 9-slice 선 넷의 문서 좌표. 화면이 「어느 선을 잡았나」를 물을 때 쓴다. */
  sliceLines(doc: Doc): { name: keyof Slice; at: number; vertical: boolean }[] {
    const s = clampSlice(this.slice, doc.w, doc.h);
    return [
      { name: 'left', at: s.left, vertical: true },
      { name: 'right', at: doc.w - s.right, vertical: true },
      { name: 'top', at: s.top, vertical: false },
      { name: 'bottom', at: doc.h - s.bottom, vertical: false }
    ];
  }

  draw(doc: Doc, selected: { layer: number; index: number } | null): void {
    const w = doc.w * this.scale;
    const h = doc.h * this.scale;
    this.root.style.width = `${w}px`;
    this.root.style.height = `${h}px`;
    this.art.style.width = `${w}px`;
    this.art.style.height = `${h}px`;
    this.art.innerHTML = toSvg(doc).replace('<svg ', `<svg style="width:${w}px;height:${h}px" `);

    this.guides.setAttribute('width', String(w));
    this.guides.setAttribute('height', String(h));
    this.guides.setAttribute('viewBox', `0 0 ${doc.w} ${doc.h}`);

    const parts: string[] = [];
    if (this.grid > 0 && this.scale >= 1.5) {
      const step = this.grid;
      const lines: string[] = [];
      for (let x = step; x < doc.w; x += step) lines.push(`M${x} 0V${doc.h}`);
      for (let y = step; y < doc.h; y += step) lines.push(`M0 ${y}H${doc.w}`);
      parts.push(`<path d="${lines.join('')}" class="bon-grid" vector-effect="non-scaling-stroke"/>`);
    }
    if (this.sliceOn) {
      // 늘려도 안 뭉개지는 자리를 사람이 보이게 — 저장물에는 안 들어간다(안내선 겹이다).
      for (const line of this.sliceLines(doc)) {
        const d = line.vertical ? `M${line.at} 0V${doc.h}` : `M0 ${line.at}H${doc.w}`;
        parts.push(`<path d="${d}" class="bon-slice" vector-effect="non-scaling-stroke"/>`);
      }
    }
    if (selected) {
      const node = doc.layers[selected.layer]?.nodes[selected.index];
      if (node) {
        const b: Box = bounds(node);
        parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" class="bon-sel" vector-effect="non-scaling-stroke"/>`);
        // 손잡이는 확대해도 같은 크기로 보여야 잡기 쉽다 — 문서 좌표로 되돌려 그린다.
        const r = 4 / this.scale;
        for (const p of Object.values(handlePoints(b))) {
          parts.push(`<rect x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}" class="bon-handle" vector-effect="non-scaling-stroke"/>`);
        }
      }
    }
    this.guides.innerHTML = parts.join('');
  }
}
