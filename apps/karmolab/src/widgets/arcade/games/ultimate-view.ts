/**
 * 초월 틱택토 화면 (TASK-KL-242)
 *
 * 이 놀이는 **어디에 둘 수 있는지가 규칙의 전부**다. 그래서 지금 열린 작은 판을 테두리로
 * 또렷하게 표시한다 — 안 그러면 「왜 안 눌리지」가 된다.
 */
import type { GameView } from '../views';
import { playable, type UltimateState, type UltimateAction } from './ultimate';

const MARK = ['', '●', '○'];

export const ultimateView: GameView<UltimateState, UltimateAction> = {
  id: 'ultimate',
  mount(el, act) {
    el.innerHTML = '<div class="ac-ut" id="acUt"></div>';
    const wrap = el.querySelector('#acUt') as HTMLElement;
    wrap.innerHTML = Array.from({ length: 9 }, (_, b) =>
      '<div class="ac-utsmall" data-b="' + b + '">' +
      Array.from({ length: 9 }, (_, i) =>
        '<button class="ac-utcell" data-c="' + (b * 9 + i) + '"></button>').join('') +
      '<span class="ac-utown"></span></div>').join('');
    const smalls = Array.from(wrap.querySelectorAll<HTMLElement>('.ac-utsmall'));
    const cells = Array.from(wrap.querySelectorAll<HTMLButtonElement>('.ac-utcell'));
    cells.forEach((b) => {
      b.onclick = () => act({ cell: Number(b.dataset.c) });
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      smalls.forEach((sm, b) => {
        const owner = s.boards[b];
        const open = s.won === -1 && owner === 0 && (s.next === -1 || s.next === b);
        sm.className = 'ac-utsmall' + (open ? ' ac-open' : '') + (owner && owner < 3 ? ' ac-took' : '');
        const own = sm.querySelector('.ac-utown') as HTMLElement;
        own.textContent = owner === 1 || owner === 2 ? MARK[owner] : '';
      });
      cells.forEach((btn, i) => {
        const mark = MARK[s.cells[i]] || '';
        if (btn.textContent !== mark) btn.textContent = mark;
        btn.classList.toggle('ac-last', i === s.last);
        btn.disabled = !myTurn || !playable(s, i);
      });
      wrap.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
