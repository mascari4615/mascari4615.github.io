/**
 * 체커. 입체 화면
 *
 * 무대는 `three-board.ts`. 체커만의 것 셋: 칸이 번갈아 어둡고, 말을 **집었다가** 갈 곳을
 * 누르고(그 사이 상태는 화면이 든다. 규칙은 어디서 어디로만 받는다), 왕은 두껍다.
 */
import type { GameView } from '../views';
import { mountThreeBoard, type Board3d, type Stone } from '../three-board';
import { N, movesFrom, type CheckersState, type CheckersAction } from './checkers';

const owner = (v: number): number => (v === 0 ? -1 : v === 1 || v === 3 ? 0 : 1);

export const view3d: GameView<CheckersState, CheckersAction> = {
  id: 'checkers',
  mount(el, act) {
    el.innerHTML = '<div class="ac-t3" id="acT3"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;

    let pick = -1;
    /* 누른 칸이 집기인지 놓기인지는 그때 판을 봐야 안다. 마지막으로 그린 것을 들고 있는다. */
    let cur: { s: CheckersState; mySeat: number } | null = null;

    let board: Board3d | null = mountThreeBoard(host, {
      n: N,
      dark: (i) => ((i % N) + Math.floor(i / N)) % 2 === 1,
      onCell: (i) => {
        if (!cur) return;
        const { s, mySeat } = cur;
        const targets = pick >= 0 ? movesFrom(s.board, pick, s.chain >= 0).map((m) => m.to) : [];
        if (targets.includes(i) && pick >= 0) {
          act({ from: pick, to: i });
          if (s.chain < 0) pick = -1;
        } else if (owner(s.board[i]) === mySeat && s.chain < 0) {
          pick = pick === i ? -1 : i;
        }
      }
    });
    if (!board.ok) {
      board = null;
      host.innerHTML = '';
    }

    return (v, mySeat) => {
      if (!board) return;
      const s = v.state;
      cur = { s, mySeat };
      const myTurn = s.won === -1 && s.turn === mySeat;
      /* 연달아 뛰는 중이면 그 말이 이미 골라져 있다. 사람이 다시 고르게 하면 헷갈린다. */
      if (s.chain >= 0 && myTurn) pick = s.chain;
      if (!myTurn) pick = -1;

      const stones: Stone[] = [];
      for (let i = 0; i < s.board.length; i += 1) {
        const val = s.board[i];
        const who = owner(val);
        if (who >= 0) {
          stones.push({ cell: i, who: who + 1, king: val >= 3, last: i === s.last, pick: i === pick });
        }
      }
      const can = pick >= 0 ? movesFrom(s.board, pick, s.chain >= 0).map((m) => m.to) : [];
      board.place(stones, { can });
      host.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
