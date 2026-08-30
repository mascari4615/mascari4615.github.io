/**
 * 오목. 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`gomoku.ts`)은 이 파일을 모른다. `views.ts` 의 좁은 구멍 하나로만 붙는다 . 
 * 그래서 2D 화면과 나란히 존재하고, 사람이 판 안에서 고른다(2D/3D 단추).
 *
 * 무대는 `three-board.ts` 가 짓는다(받아 둔 three). 여기 있는 일은 **상태를 알로 옮기는 것**뿐.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountThreeBoard, type Board3d, type Stone } from '../three-board';
import { DEFAULT_SIZE, starPoints, type GomokuState, type GomokuAction } from './gomoku';

export const view3d: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  bare: true,
  mount(el, act) {
    /* 무대는 제 자리를 다 쓴다. 크기는 무대 계약(`--ac-stage`)이 정한다. */
    el.innerHTML = '<div class="ac-t3 ac-t3room" id="acT3"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;

    /* 오목은 **줄이 만나는 점**에 둔다. 칸 안에 두면 그건 다른 놀이다. */
    let n = 0;
    let board: Board3d | null = null;
    let dead = false;
    const build = (size: number): void => {
      n = size;
      const stars = new Set(starPoints(size));
      /* 방 표현. 다다미, 스포트, 알 떨어지는 손맛, 카메라 동작까지 한 벌(`three-board.ts`) */
      board = mountThreeBoard(host, { n, star: (i) => stars.has(i), onCross: true, bowls: true, room: true, onCell: (i) => act({ cell: i }) });
      if (!board.ok) {
        /* WebGL 을 못 얻었다. 판이 없으면 안 되므로 조용히 비운다(부르는 쪽이 2D 로 물러선다). */
        board = null;
        dead = true;
        host.innerHTML = '';
      } else if (board.software && !el.querySelector('.ac-t3warn')) {
        /* CPU 로 그리는 중. 판 탓이 아니라 브라우저 설정이라고 사람에게 말한다. 2D 는 이 상태에서도 가볍다 */
        const warn = document.createElement('div');
        warn.className = 'ac-t3warn';
        warn.setAttribute('role', 'status');
        const msg = document.createElement('span');
        msg.textContent = t('arcade.t3.software');
        const to2d = document.createElement('button');
        to2d.type = 'button';
        to2d.className = 'btn btn-ghost';
        to2d.textContent = t('arcade.t3.software.btn');
        /* 표현 단추(`#acDim`)는 오락실 본체 것. 같은 손으로 눌러야 저장과 갈아 끼우기가 한 길로 간다 */
        to2d.onclick = () => document.getElementById('acDim')?.click();
        warn.append(msg, to2d);
        el.prepend(warn);
      }
    };
    build(DEFAULT_SIZE);

    return (v, mySeat) => {
      const s = v.state;
      if (!dead && s.n !== n) build(s.n);
      if (!board) return;
      const myTurn = s.won === -1 && s.turn === mySeat;
      const stones: Stone[] = [];
      for (let i = 0; i < s.board.length; i += 1) {
        const who = s.board[i];
        if (who) stones.push({ cell: i, who, last: i === s.last });
      }
      /* 여기 둘 수 있다는 빈 칸 전부라 표시하지 않는다. 판이 온통 점으로 덮인다.
         자리를 좁혀 주는 놀이(오델로, 체커)에서만 쓴다. */
      board.place(stones);
      if (s.won !== -1) board.finish();
      host.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
