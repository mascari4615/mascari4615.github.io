/**
 * 뒤집기(오델로) — 입체 화면
 *
 * 판 뼈대는 `board3d.ts`. 둘 수 있는 자리는 반투명 알로 미리 보인다(`ac-can`).
 */
import type { GameView } from '../views';
import { mountBoard3d, paintCell } from '../board3d';
import { N, flips, type ReversiState, type ReversiAction } from './reversi';

export const view3d: GameView<ReversiState, ReversiAction> = {
  id: 'reversi',
  mount(el, act) {
    const { cells, face } = mountBoard3d(el, N, (i) => act({ cell: i }));

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.done && s.turn === mySeat;
      cells.forEach((b, i) => {
        const who = s.board[i];
        const can = myTurn && flips(s.board, i, mySeat + 1).length > 0;
        paintCell(b, who, { last: i === s.last, can, label: who === 1 ? '●' : who === 2 ? '○' : '' });
        b.disabled = !can;
      });
      face.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
