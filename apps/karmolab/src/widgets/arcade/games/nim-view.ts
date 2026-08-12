/**
 * 돌 가져가기 화면 (TASK-KL-242)
 *
 * 돌을 누르면 **그 돌부터 줄 끝까지** 가져간다 — 「몇 개?」를 따로 물으면 셈이 두 번이 된다.
 * 가져갈 범위를 미리 밝게 칠해 보여 주므로 누르기 전에 결과가 보인다.
 */
import type { GameView } from '../views';
import type { NimState, NimAction } from './nim';

export const nimView: GameView<NimState, NimAction> = {
  id: 'nim',
  mount(el, act) {
    el.innerHTML = '<div class="ac-nim" id="acNim"></div>';
    const wrap = el.querySelector('#acNim') as HTMLElement;
    let hover = { row: -1, from: -1 };

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.lost === -1 && s.turn === mySeat && !v.finished;

      wrap.innerHTML = s.rows
        .map((n, r) =>
          '<div class="ac-nimrow">' +
          Array.from({ length: n }, (_, i) =>
            '<button class="ac-nims' + (hover.row === r && i >= hover.from ? ' ac-take' : '') +
            '" data-r="' + r + '" data-i="' + i + '"' + (myTurn ? '' : ' disabled') + '></button>').join('') +
          '</div>')
        .join('');

      wrap.querySelectorAll<HTMLButtonElement>('.ac-nims').forEach((b) => {
        const r = Number(b.dataset.r);
        const i = Number(b.dataset.i);
        b.onmouseenter = () => { hover = { row: r, from: i }; };
        b.onmouseleave = () => { hover = { row: -1, from: -1 }; };
        b.onclick = () => {
          act({ row: r, take: s.rows[r] - i });
          hover = { row: -1, from: -1 };
        };
      });
    };
  }
};
