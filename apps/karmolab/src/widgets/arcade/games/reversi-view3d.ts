/**
 * 뒤집기(오델로) — 입체 화면
 *
 * 무대는 `three-board.ts`. 오목과 달리 **칸 안**에 둔다(교차점 아님).
 * 둘 수 있는 자리는 판 위에 옅은 점으로 미리 보인다 — 오델로는 놓을 자리가 몇 개뿐이라
 * 표시해 주지 않으면 사람이 아무 데나 눌러 보고 헤맨다.
 */
import type { GameView } from '../views';
import { mountThreeBoard, type Board3d, type Stone } from '../three-board';
import { N, flips, type ReversiState, type ReversiAction } from './reversi';

export const view3d: GameView<ReversiState, ReversiAction> = {
  id: 'reversi',
  mount(el, act) {
    el.innerHTML = '<div class="ac-t3" id="acT3"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;

    let board: Board3d | null = mountThreeBoard(host, {
      n: N,
      /* 오델로판은 칸이 어둡고 밝은 것이 아니라 한 색이다 — 대신 칸 안에 둔다. */
      onCell: (i) => act({ cell: i })
    });
    if (!board.ok) {
      board = null;
      host.innerHTML = '';
    }

    return (v, mySeat) => {
      if (!board) return;
      const s = v.state;
      const myTurn = !s.done && s.turn === mySeat;
      const stones: Stone[] = [];
      const can: number[] = [];
      for (let i = 0; i < s.board.length; i += 1) {
        const who = s.board[i];
        if (who) stones.push({ cell: i, who, last: i === s.last });
        else if (myTurn && flips(s.board, i, mySeat + 1).length > 0) can.push(i);
      }
      board.place(stones, { can });
      host.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
