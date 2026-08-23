/**
 * 오목 — 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`gomoku.ts`)은 이 파일을 모른다. `views.ts` 의 좁은 구멍 하나로만 붙는다 —
 * 그래서 2D 화면과 나란히 존재할 수 있고, 사람이 고른다.
 *
 * 판의 뼈대는 `board3d.ts` 가 짓는다. 여기 있는 일은 **상태를 칸에 칠하는 것**뿐이다.
 */
import type { GameView } from '../views';
import { mountBoard3d, paintCell } from '../board3d';
import { N, type GomokuState, type GomokuAction } from './gomoku';

export const view3d: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  mount(el, act) {
    /* 화점 — 9칸 판의 네 귀와 한가운데(2·6 교차, 4,4). */
    const star = (i: number): boolean => {
      const x = i % N;
      const y = Math.floor(i / N);
      return (x === 2 || x === 6 || x === 4) && (y === 2 || y === 6 || y === 4) && !(x === 4 !== (y === 4));
    };
    const { cells, face } = mountBoard3d(el, N, (i) => act({ cell: i }), { star });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      cells.forEach((b, i) => {
        const who = s.board[i];
        paintCell(b, who, {
          last: i === s.last,
          /* 2D 화면이 글자 돌(●○)을 두는 자리와 같은 뜻을 읽는 기계에 남긴다. */
          label: who === 1 ? '●' : who === 2 ? '○' : ''
        });
        b.disabled = !myTurn || who !== 0;
      });
      face.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
