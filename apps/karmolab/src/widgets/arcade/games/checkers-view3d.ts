/**
 * 체커 — 입체 화면
 *
 * 판 뼈대는 `board3d.ts`. 체커만의 것 둘: 어두운 칸이 번갈아 있고, 말을 하나 **집었다가**
 * 갈 곳을 누른다(그 사이 상태는 화면이 들고 있다 — 규칙은 「어디서 어디로」만 받는다).
 */
import type { GameView } from '../views';
import { mountBoard3d, paintCell } from '../board3d';
import { N, movesFrom, type CheckersState, type CheckersAction } from './checkers';

const owner = (v: number): number => (v === 0 ? -1 : v === 1 || v === 3 ? 0 : 1);

export const view3d: GameView<CheckersState, CheckersAction> = {
  id: 'checkers',
  mount(el, act) {
    let pick = -1;
    const { cells, face } = mountBoard3d(el, N, () => { /* 칸마다 다시 배선한다(아래) */ }, {
      cellClass: (i) => (((i % N) + Math.floor(i / N)) % 2 === 1 ? 'ac-dark' : '')
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      /* 연달아 뛰는 중이면 그 말이 이미 골라져 있다 — 사람이 다시 고르게 하면 헷갈린다. */
      if (s.chain >= 0 && myTurn) pick = s.chain;
      if (!myTurn) pick = -1;
      const targets = pick >= 0 ? movesFrom(s.board, pick, s.chain >= 0).map((m) => m.to) : [];

      cells.forEach((b, i) => {
        const val = s.board[i];
        const who = owner(val);
        paintCell(b, who >= 0 ? who + 1 : 0, {
          last: i === s.last,
          can: targets.includes(i),
          label: who < 0 ? '' : (who === 0 ? '●' : '○') + (val >= 3 ? '♔' : '')
        });
        b.classList.toggle('ac-king', val >= 3);
        b.classList.toggle('ac-pick', i === pick);
        b.disabled = !myTurn || (who !== mySeat && !targets.includes(i));
        b.onclick = (): void => {
          if (targets.includes(i) && pick >= 0) {
            act({ from: pick, to: i });
            if (s.chain < 0) pick = -1;
          } else if (who === mySeat && s.chain < 0) {
            pick = pick === i ? -1 : i;
          }
        };
      });
      face.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
