/**
 * 따내기 바둑 — 입체 화면
 *
 * 바둑이므로 **교차점**에 둔다(오목과 같다). 점수줄과 「넘기기」는 판 밖에 둔다 —
 * 3D 판 위에 글자를 얹으면 각도 따라 읽히지 않는다.
 */
import type { GameView } from '../views';
import { mountThreeBoard, type Board3d, type Stone } from '../three-board';
import { N, tryPlay, type GoState, type GoAction } from './capturego';
import { t } from '../../../lib/i18n';

export const view3d: GameView<GoState, GoAction> = {
  id: 'capturego',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-goscore" id="acGo3Score"></div>' +
      '<div class="ac-t3" id="acT3"></div>' +
      '<button class="btn btn-ghost" id="acGo3Pass"></button>';
    const scoreEl = el.querySelector('#acGo3Score') as HTMLElement;
    const pass = el.querySelector('#acGo3Pass') as HTMLButtonElement;
    pass.onclick = (): void => act({ cell: -1 });
    const host = el.querySelector('#acT3') as HTMLElement;

    let board: Board3d | null = mountThreeBoard(host, {
      n: N,
      onCross: true,
      onCell: (i) => act({ cell: i })
    });
    if (!board.ok) {
      board = null;
      host.innerHTML = '';
    }

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat && !v.finished;

      if (board) {
        const stones: Stone[] = [];
        for (let i = 0; i < s.board.length; i += 1) {
          const who = s.board[i];
          if (who) stones.push({ cell: i, who, last: i === s.last });
        }
        /* 「둘 수 있는 자리」는 빈 곳 대부분이라 안 그린다 — 판이 온통 점이 된다.
           못 두는 자리(자충)는 눌러도 커널이 막는다. */
        board.place(stones);
        host.classList.toggle('ac-waiting', !myTurn);
      }

      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-gos' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.caught[i] ?? 0) + '</b>/5</span>')
        .join('');
      pass.textContent = t('arcade.go.pass');
      pass.disabled = !myTurn;
      /* 자충인지 여부는 커널만 안다 — 화면은 「내 차례인가」까지만 본다(`tryPlay` 로 미리 재지 않는다). */
      void tryPlay;
    };
  }
};
