/**
 * 오목 화면 (TASK-KL-242)
 *
 * 격자는 한 번만 만든다. 81칸을 매번 다시 만들면 두려던 칸이 손가락 밑에서 사라진다.
 */
import type { GameView } from '../views';
import { N, type GomokuState, type GomokuAction } from './gomoku';

export const gomokuView: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  mount(el, act) {
    el.innerHTML = `<div class="ac-board" id="acBoard" style="--n:${N}"></div>`;
    const board = el.querySelector('#acBoard') as HTMLElement;
    board.innerHTML = Array.from({ length: N * N }, (_, i) => `<button class="ac-cell" data-c="${i}"></button>`).join('');
    const cells = Array.from(board.querySelectorAll<HTMLButtonElement>('.ac-cell'));
    cells.forEach((b) => {
      b.onclick = () => act({ cell: Number(b.dataset.c) });
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      cells.forEach((b, i) => {
        const who = s.board[i];
        const mark = who === 1 ? '●' : who === 2 ? '○' : '';
        if (b.textContent !== mark) b.textContent = mark;
        b.disabled = !myTurn || who !== 0;
        b.classList.toggle('ac-last', i === s.last);
      });
      board.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
