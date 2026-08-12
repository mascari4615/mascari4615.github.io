/**
 * 조각 맞추기 화면 (TASK-KL-242)
 *
 * 빈 칸 옆 조각만 누를 수 있다 — 못 미는 조각을 눌러 보고 「고장 났나」 하지 않도록 흐리게 둔다.
 */
import type { GameView } from '../views';
import { N, type SlideState, type SlideAction } from './slide';

export const slideView: GameView<SlideState, SlideAction> = {
  id: 'slide',
  mount(el, act) {
    el.innerHTML = '<div class="ac-sl" id="acSl" style="--n:' + N + '"></div>';
    const grid = el.querySelector('#acSl') as HTMLElement;
    grid.innerHTML = Array.from({ length: N * N }, (_, i) =>
      '<button class="ac-slt" data-i="' + i + '"></button>').join('');
    const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-slt'));
    tiles.forEach((b) => {
      b.onclick = () => act({ cell: Number(b.dataset.i) });
    });

    return (v, mySeat) => {
      const b = v.state.boards[mySeat] || [];
      const empty = b.indexOf(0);
      const ex = empty % N;
      const ey = Math.floor(empty / N);
      tiles.forEach((t, i) => {
        const val = b[i] ?? 0;
        const label = val === 0 ? '' : String(val);
        if (t.textContent !== label) t.textContent = label;
        const x = i % N;
        const y = Math.floor(i / N);
        const can = val !== 0 && Math.abs(x - ex) + Math.abs(y - ey) === 1 && v.state.won === -1;
        t.className = 'ac-slt' + (val === 0 ? ' ac-hole' : '') + (can ? ' ac-can' : '') +
          (val !== 0 && val === i + 1 ? ' ac-home' : '');
        t.disabled = !can;
      });
    };
  }
};
