/**
 * lib/graph/canvas-export.ts — 화면에 그려진 것을 **파일로** (TASK-KL-202 방향① 해체 3조각).
 *
 * 내보내기는 「그리기」와 결이 다르다: 화면용으로만 있던 것들(손잡이·선택 표시·배경 무늬·pan/zoom 변환)을
 * **걷어 내는 일**이 대부분이다. 그 목록이 캔버스 본체에 섞여 있으면, 새 화면 장식이 생길 때마다
 * 내보낸 그림에 슬그머니 끼어든다 — 그래서 「무엇을 걷어 내는가」를 한 곳에 모아 둔다.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 화면에만 있던 것 — 그림에는 남지 않아야 하는 자국들. */
const SCREEN_ONLY_SELECTORS = [
  '.ck-link-handle',   // 선을 뽑는 파란 점
  '.ck-link-temp',     // 끌고 있는 임시 선
  '.ck-size-handle',   // 카드 크기 손잡이
  '.ck-edge-hit',      // 선 클릭용 두꺼운 투명 선
  '.ck-edge-grip',     // 선 휘기 손잡이
];

export interface ExportOptions {
  padding?: number;
  background?: string;
  /** 캔버스 CSS — 그림 안에 인라인으로 넣어 남의 뷰어에서도 같은 모양이 나오게 한다. */
  css?: string;
}

/**
 * @param svg 화면에 붙어 있는 `<svg>` (복제해서 쓰므로 원본은 안 건드린다)
 * @param bounds 그림에 담을 world 범위
 */
export function exportSvgString(
  svg: SVGSVGElement,
  bounds: { minX: number; minY: number; w: number; h: number },
  opts: ExportOptions = {},
): string {
  const pad = opts.padding ?? 32;
  const w = Math.max(1, bounds.w + pad * 2);
  const h = Math.max(1, bounds.h + pad * 2);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(Math.round(w)));
  clone.setAttribute('height', String(Math.round(h)));
  clone.setAttribute('viewBox', `${bounds.minX - pad} ${bounds.minY - pad} ${w} ${h}`);

  // 화면용 변환(pan/zoom)은 viewBox 가 대신한다 — 남겨 두면 두 번 적용된다.
  clone.querySelector('.ck-world')?.removeAttribute('transform');
  // 배경 무늬는 화면 좌표에 깔려 있어 viewBox 를 바꾸면 어긋난다(배경색은 opts.background 가 채운다).
  clone.querySelector('.ck-bg')?.remove();
  for (const sel of SCREEN_ONLY_SELECTORS) clone.querySelectorAll(sel).forEach((el) => el.remove());
  clone.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
  clone.querySelectorAll('.is-dimmed').forEach((el) => el.classList.remove('is-dimmed'));

  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = opts.css ?? '';
  clone.insertBefore(style, clone.firstChild);

  if (opts.background) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(bounds.minX - pad));
    bg.setAttribute('y', String(bounds.minY - pad));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', opts.background);
    clone.insertBefore(bg, style.nextSibling);
  }

  return new XMLSerializer().serializeToString(clone);
}
