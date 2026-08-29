/**
 * 오목. 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`gomoku.ts`)은 이 파일을 모른다. `views.ts` 의 좁은 구멍 하나로만 붙는다 . 
 * 그래서 2D 화면과 나란히 존재하고, 사람이 판 안에서 고른다(2D/3D 단추).
 *
 * 무대는 `three-board.ts` 가 짓는다(받아 둔 three). 여기 있는 일은 **상태를 알로 옮기는 것**뿐.
 */
import type { GameView } from '../views';
import { mountThreeBoard, type Board3d, type Stone } from '../three-board';
import { N, type GomokuState, type GomokuAction } from './gomoku';

/* 화점. 9칸 판의 네 귀와 한가운데(2, 6 교차, 4,4). */
const star = (i: number): boolean => {
  const x = i % N;
  const y = Math.floor(i / N);
  const on = (v: number): boolean => v === 2 || v === 6;
  return (on(x) && on(y)) || (x === 4 && y === 4);
};

export const view3d: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  mount(el, act) {
    /* 무대는 제 자리를 다 쓴다. 크기는 무대 계약(`--ac-stage`)이 정한다. */
    el.innerHTML = '<div class="ac-t3" id="acT3"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;

    /* 오목은 **줄이 만나는 점**에 둔다. 칸 안에 두면 그건 다른 놀이다. */
    let board: Board3d | null = mountThreeBoard(host, { n: N, star, onCross: true, onCell: (i) => act({ cell: i }) });
    if (!board.ok) {
      /* WebGL 을 못 얻었다. 판이 안 서면 안 되므로 조용히 비운다(부르는 쪽이 2D 로 물러선다). */
      board = null;
      host.innerHTML = '';
    }

    return (v, mySeat) => {
      if (!board) return;
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      const stones: Stone[] = [];
      for (let i = 0; i < s.board.length; i += 1) {
        const who = s.board[i];
        if (who) stones.push({ cell: i, who, last: i === s.last });
      }
      /* 여기 둘 수 있다는 빈 칸 전부라 표시하지 않는다. 판이 온통 점으로 덮인다.
         자리를 좁혀 주는 놀이(오델로, 체커)에서만 쓴다. */
      board.place(stones);
      host.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
