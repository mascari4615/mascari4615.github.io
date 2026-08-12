/**
 * lib/graph/canvas-photo.ts — **사진이 주인공인 카드** (TASK-KL-202 방향① 그리기 조각).
 *
 * 관계도에서 얼굴은 이름보다 빨리 읽힌다. 그래서 사진 카드는 그림이 카드를 꽉 채우고,
 * 이름은 **아래 반투명 띠** 에 얹어 그림을 안 가린다(그림 위에 흰 글씨만 얹으면 밝은 사진에서 증발한다).
 *
 * 잘라내기 모양 id 에 캔버스 고유값(uid)을 섞는다 — 한 페이지에 캔버스가 둘이면 id 가 부딪혀
 * **한쪽 사진이 통째로 안 보인다**.
 */

import { TYPE } from './canvas-type';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 이름 띠 높이 · 글자 기준선 — 카드 크기와 무관하게 고정(작은 카드에서도 이름은 같은 크기로 읽혀야 한다). */
export const PHOTO_BAND_H = 26;

export function buildPhotoCard(
  opts: { id: string; label: string; w: number; effH: number; src: string; uid: string },
): SVGElement[] {
  const { id, label, w, effH, src, uid } = opts;
  const clipId = `ck-photo-${uid}-${id}`;
  const out: SVGElement[] = [];

  const defs = document.createElementNS(SVG_NS, 'defs');
  const clip = document.createElementNS(SVG_NS, 'clipPath');
  clip.setAttribute('id', clipId);
  const r = document.createElementNS(SVG_NS, 'rect');
  r.setAttribute('width', String(w));
  r.setAttribute('height', String(effH));
  r.setAttribute('rx', '6');
  clip.appendChild(r);
  defs.appendChild(clip);
  out.push(defs);

  const img = document.createElementNS(SVG_NS, 'image');
  img.setAttribute('x', '0');
  img.setAttribute('y', '0');
  img.setAttribute('width', String(w));
  img.setAttribute('height', String(effH));
  // 비율을 지키며 꽉 채운다 — 늘어난 얼굴은 「잘못 올렸나」 싶게 만든다.
  img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  img.setAttribute('clip-path', `url(#${clipId})`);
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
  img.setAttribute('href', src);
  img.setAttribute('pointer-events', 'none');
  out.push(img);

  const band = document.createElementNS(SVG_NS, 'rect');
  band.setAttribute('x', '0');
  band.setAttribute('y', String(effH - PHOTO_BAND_H));
  band.setAttribute('width', String(w));
  band.setAttribute('height', String(PHOTO_BAND_H));
  band.setAttribute('fill', 'rgba(0,0,0,0.62)');
  band.setAttribute('clip-path', `url(#${clipId})`);
  band.setAttribute('pointer-events', 'none');
  out.push(band);

  const nameEl = document.createElementNS(SVG_NS, 'text');
  nameEl.setAttribute('x', String(w / 2));
  nameEl.setAttribute('y', String(effH - 9));
  nameEl.setAttribute('text-anchor', 'middle');
  nameEl.setAttribute('fill', '#fff');
  nameEl.setAttribute('font-size', String(TYPE.title));
  nameEl.setAttribute('font-weight', '600');
  nameEl.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
  nameEl.setAttribute('pointer-events', 'none');
  nameEl.textContent = label;
  out.push(nameEl);

  return out;
}

/**
 * 카드에 붙는 두 손잡이.
 * - **크기 손잡이는 고른 카드에만.** 늘 보이면 카드가 지저분해지고 잘못 잡는다.
 * - **연결 손잡이**(오른쪽 파란 점)는 Miro·FigJam 계보 — 「연결 시작」을 누르고 다시 클릭하던 2단계를 없앤다.
 */
export function buildSizeHandle(id: string, w: number, effH: number, fill: string, stroke: string): SVGElement {
  const grip = document.createElementNS(SVG_NS, 'rect');
  grip.setAttribute('class', 'ck-size-handle');
  (grip as SVGElement).dataset.sizeFor = id;
  grip.setAttribute('x', String(w - 7));
  grip.setAttribute('y', String(effH - 7));
  grip.setAttribute('width', '10');
  grip.setAttribute('height', '10');
  grip.setAttribute('rx', '2');
  grip.setAttribute('fill', fill);
  grip.setAttribute('stroke', stroke);
  grip.setAttribute('stroke-width', '1.5');
  grip.setAttribute('cursor', 'nwse-resize');
  return grip;
}

export function buildLinkHandle(id: string, w: number, effH: number, fill: string, stroke: string): SVGElement {
  const handle = document.createElementNS(SVG_NS, 'circle');
  handle.setAttribute('class', 'ck-link-handle');
  (handle as SVGElement).dataset.linkFrom = id;
  handle.setAttribute('cx', String(w));
  handle.setAttribute('cy', String(effH / 2));
  handle.setAttribute('r', '5');
  handle.setAttribute('fill', fill);
  handle.setAttribute('stroke', stroke);
  handle.setAttribute('stroke-width', '1.5');
  return handle;
}
