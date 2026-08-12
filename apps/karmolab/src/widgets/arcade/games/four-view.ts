/**
 * 사목 화면 (TASK-KL-242)
 *
 * 누르는 곳은 칸이 아니라 **줄**이다 — 중력이 자리를 정하므로 칸을 고르게 하면 거짓말이 된다.
 */
import type { GameView } from '../views';
import { W, H, type FourState, type FourAction } from './four';

export const fourView: GameView<FourState, FourAction> = {
  id: 'four',
  mount(el, act) {
    el.innerHTML = '<div class="ac-four" id="acFour" style="--w:' + W + '"></div>';
    const wrap = el.querySelector('#acFour') as HTMLElement;
    wrap.innerHTML =
      Array.from({ length: W }, (_, c) => '<button class="ac-col" data-c="' + c + '"></button>').join('') +
      '<div class="ac-fgrid" id="acFGrid"></div>';
    const grid = wrap.querySelector('#acFGrid') as HTMLElement;
    grid.innerHTML = Array.from({ length: W * H }, () => '<span class="ac-disc"></span>').join('');
    const discs = Array.from(grid.querySelectorAll<HTMLElement>('.ac-disc'));
    const cols = Array.from(wrap.querySelectorAll<HTMLButtonElement>('.ac-col'));
    cols.forEach((b) => {
      b.onclick = () => act({ col: Number(b.dataset.c) });
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      discs.forEach((d, i) => {
        const who = s.board[i];
        d.className = 'ac-disc' + (who ? ' ac-p' + who : '') + (i === s.last ? ' ac-last' : '');
      });
      cols.forEach((b, c) => {
        b.disabled = !myTurn || s.board[c] !== 0;
      });
      wrap.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
