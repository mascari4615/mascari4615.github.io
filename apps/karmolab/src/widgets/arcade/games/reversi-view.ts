/**
 * 뒤집기 화면 (TASK-KL-242)
 *
 * 둘 수 있는 자리를 **점으로 알려 준다** — 아무 데나 못 두는 놀이라, 안 알려 주면
 * 처음 온 사람은 화면이 고장 난 줄 안다.
 */
import type { GameView } from '../views';
import { N, flips, type ReversiState, type ReversiAction } from './reversi';

export const reversiView: GameView<ReversiState, ReversiAction> = {
  id: 'reversi',
  mount(el, act) {
    el.innerHTML = '<div class="ac-rv" id="acRv" style="--n:' + N + '"></div>';
    const grid = el.querySelector('#acRv') as HTMLElement;
    grid.innerHTML = Array.from({ length: N * N }, (_, i) =>
      '<button class="ac-rvcell" data-c="' + i + '"><i></i></button>').join('');
    const cells = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-rvcell'));
    cells.forEach((b) => {
      b.onclick = () => act({ cell: Number(b.dataset.c) });
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.done && s.turn === mySeat;
      cells.forEach((b, i) => {
        const who = s.board[i];
        const can = myTurn && flips(s.board, i, mySeat + 1).length > 0;
        b.className =
          'ac-rvcell' + (who ? ' ac-p' + who : '') + (can ? ' ac-can' : '') + (i === s.last ? ' ac-last' : '');
        b.disabled = !can;
      });
      grid.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
