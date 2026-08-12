/**
 * 체커 화면 (TASK-KL-242)
 *
 * 한 수가 두 칸을 가리키므로 **두 번 누른다**: 내 말을 고르고, 갈 곳을 고른다.
 * 고른 뒤 갈 수 있는 곳을 점으로 보여 준다 — 대각선만 간다는 걸 말로 안 적어도 알게 된다.
 */
import type { GameView } from '../views';
import { N, movesFrom, type CheckersState, type CheckersAction } from './checkers';

const owner = (v: number): number => (v === 0 ? -1 : v === 1 || v === 3 ? 0 : 1);

export const checkersView: GameView<CheckersState, CheckersAction> = {
  id: 'checkers',
  mount(el, act) {
    el.innerHTML = '<div class="ac-ck" id="acCk" style="--n:' + N + '"></div>';
    const grid = el.querySelector('#acCk') as HTMLElement;
    grid.innerHTML = Array.from({ length: N * N }, (_, i) => {
      const dark = ((i % N) + Math.floor(i / N)) % 2 === 1;
      return '<button class="ac-ckc' + (dark ? ' ac-dark' : '') + '" data-c="' + i + '"><i></i></button>';
    }).join('');
    const cells = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-ckc'));
    let pick = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      /* 연달아 뛰는 중이면 그 말이 이미 골라져 있다 — 사람이 다시 고르게 하면 헷갈린다. */
      if (s.chain >= 0 && myTurn) pick = s.chain;
      if (!myTurn) pick = -1;

      const targets = pick >= 0 ? movesFrom(s.board, pick, s.chain >= 0).map((m) => m.to) : [];

      cells.forEach((btn, i) => {
        const val = s.board[i];
        const who = owner(val);
        const king = val >= 3;
        btn.className =
          'ac-ckc' + (((i % N) + Math.floor(i / N)) % 2 === 1 ? ' ac-dark' : '') +
          (who >= 0 ? ' ac-p' + (who + 1) : '') + (king ? ' ac-king' : '') +
          (i === pick ? ' ac-pick' : '') + (targets.includes(i) ? ' ac-can' : '') +
          (i === s.last ? ' ac-last' : '');
        btn.disabled = !myTurn || (who !== mySeat && !targets.includes(i));
        btn.onclick = () => {
          if (targets.includes(i) && pick >= 0) {
            act({ from: pick, to: i });
            if (s.chain < 0) pick = -1;
          } else if (who === mySeat && s.chain < 0) {
            pick = pick === i ? -1 : i;
          }
        };
      });
      grid.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
