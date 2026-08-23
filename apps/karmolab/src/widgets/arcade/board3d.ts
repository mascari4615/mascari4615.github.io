/**
 * 입체 판 — 판 놀이가 함께 쓰는 **부품 하나** (change.arcade-redesign)
 *
 * 오목·오델로·체커·따내기 바둑은 전부 같은 모양이다: 눕힌 판 + N×N 칸 + 칸 위의 알.
 * 그 뼈대를 여기 한 번만 두고, 각 놀이의 입체 화면은 **상태를 칸에 칠하는 일**만 한다
 * (`gomoku-view3d.ts` 등, 한 판에 서른 줄 안쪽).
 *
 * WebGL 을 안 쓴다: 칸이 그대로 `<button>` 이라 자판 조작·읽는 기계가 살고, 받아 오는
 * 무게가 0 이다. 대신 판을 눕히는 각(`TILT`)을 알에서 **되돌려 세운다** — 안 세우면
 * 알이 판과 같이 누워 타원 전병이 된다(실측).
 */

/** 판을 눕히는 각. 알 세우기가 이 값을 그대로 되돌려 쓴다 — 두 곳이 갈리면 알이 기운다. */
export const TILT = 52;

export interface Board3d {
  /** 칸 단추들 — 놀이가 상태를 여기에 칠한다. */
  cells: HTMLButtonElement[];
  /** 판 면 — 「내 차례 아님」 같은 판 전체 표시를 여기에 건다. */
  face: HTMLElement;
}

export interface Board3dOpts {
  /** 칸마다 더 붙일 이름 (체커의 어두운 칸처럼) */
  cellClass?: (i: number) => string;
  /** 알을 담을 `<i>` 를 칸 안에 둘까 (오목처럼 칸 배경으로 그리면 필요 없다) */
  pip?: boolean;
  /**
   * 화점(기준점)을 찍을 칸.
   *
   * 놀이마다 칸 수가 달라서 **자리를 CSS 에 박으면 안 된다** — 9칸 판 기준으로 박아 뒀더니
   * 8칸 판(오델로·체커)에 엉뚱한 점이 찍혔다(실측). 판을 아는 쪽이 정한다.
   */
  star?: (i: number) => boolean;
}

/**
 * 눕힌 판을 짓고 칸을 돌려준다. **한 번만 짓는다** — 매 수마다 다시 지으면 두려던 칸이
 * 손가락 밑에서 사라진다(2D 화면들이 같은 이유로 그렇게 한다).
 */
export function mountBoard3d(
  el: HTMLElement,
  n: number,
  onCell: (i: number) => void,
  opts: Board3dOpts = {}
): Board3d {
  el.innerHTML =
    '<div class="ac-b3">' +
    '<div class="ac-b3tilt">' +
    '<div class="ac-b3edge"></div>' +
    '<div class="ac-b3face" style="--n:' + n + '"></div>' +
    '</div></div>';
  const face = el.querySelector('.ac-b3face') as HTMLElement;
  face.innerHTML = Array.from({ length: n * n }, (_, i) => {
    const extra = opts.cellClass?.(i) ?? '';
    const star = opts.star?.(i) ? ' ac-star' : '';
    return (
      '<button class="ac-c3' + (extra ? ' ' + extra : '') + star + '" data-c="' + i + '">' +
      (opts.pip === false ? '' : '<i></i>') +
      '</button>'
    );
  }).join('');
  const cells = Array.from(face.querySelectorAll<HTMLButtonElement>('.ac-c3'));
  cells.forEach((b) => {
    b.onclick = (): void => onCell(Number(b.dataset.c));
  });
  return { cells, face };
}

/**
 * 칸 하나에 알을 칠한다 — **놀이마다 같은 손짓**이라 여기 둔다.
 * `who` 0 = 빈 칸. 색은 `ac-s1`·`ac-s2`(그리고 필요하면 `ac-s3`…)로 CSS 가 정한다.
 */
export function paintCell(
  b: HTMLButtonElement,
  who: number,
  opts: { last?: boolean; can?: boolean; label?: string } = {}
): void {
  for (let k = 1; k <= 4; k += 1) b.classList.toggle('ac-s' + k, who === k);
  b.classList.toggle('ac-last', !!opts.last);
  b.classList.toggle('ac-can', !!opts.can);
  /* 읽는 기계가 볼 글자 — 2D 화면이 글자 돌을 두는 자리와 같은 뜻이다. */
  if (opts.label !== undefined && b.getAttribute('aria-label') !== opts.label) {
    b.setAttribute('aria-label', opts.label);
  }
}
