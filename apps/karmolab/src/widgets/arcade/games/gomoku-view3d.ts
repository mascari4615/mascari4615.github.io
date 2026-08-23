/**
 * 오목 — 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`gomoku.ts`)은 이 파일을 모른다. `views.ts` 의 좁은 구멍 하나로만 붙는다 —
 * 그래서 2D 화면과 나란히 존재할 수 있고, 사람이 고른다.
 *
 * **WebGL 을 안 쓴다.** 판 놀이는 평면 위에 돌이 놓이는 것이라 CSS 원근으로 충분하고,
 * 대신 얻는 것이 크다: 라이브러리 0KB · 글자가 또렷함 · 지금 되는 자판 조작과 접근성이
 * 그대로 산다(칸이 여전히 `<button>` 이다). 나중에 진짜 3D 가 필요하면 같은 구멍에
 * 하나 더 꽂으면 된다 — 이 파일을 고칠 필요가 없다.
 *
 * 기울기는 눕히다 만 각이다: 판을 많이 눕히면 위쪽 칸이 납작해져 다섯을 세기 어렵다.
 * 사람이 판을 앞에 두고 앉은 각(52도)에서 멈춘다.
 */
import type { GameView } from '../views';
import { N, type GomokuState, type GomokuAction } from './gomoku';

export const view3d: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-b3">' +
      '<div class="ac-b3tilt">' +
      '<div class="ac-b3edge"></div>' +
      '<div class="ac-b3face" id="acBoard3" style="--n:' + N + '"></div>' +
      '</div></div>';
    const board = el.querySelector('#acBoard3') as HTMLElement;
    board.innerHTML = Array.from(
      { length: N * N },
      (_, i) => '<button class="ac-c3" data-c="' + i + '"><i></i></button>'
    ).join('');
    const cells = Array.from(board.querySelectorAll<HTMLButtonElement>('.ac-c3'));
    cells.forEach((b) => {
      b.onclick = (): void => act({ cell: Number(b.dataset.c) });
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      cells.forEach((b, i) => {
        const who = s.board[i];
        /* 글자 돌은 2D 화면과 같은 자리에 남긴다 — 읽는 기계(스크린리더)와 검사가 같은 것을 본다. */
        const mark = who === 1 ? '●' : who === 2 ? '○' : '';
        if (b.getAttribute('aria-label') !== mark) b.setAttribute('aria-label', mark);
        b.classList.toggle('ac-s1', who === 1);
        b.classList.toggle('ac-s2', who === 2);
        b.disabled = !myTurn || who !== 0;
        b.classList.toggle('ac-last', i === s.last);
      });
      board.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
