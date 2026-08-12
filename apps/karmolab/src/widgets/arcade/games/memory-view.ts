/**
 * 짝 맞추기 화면 (TASK-KL-242)
 *
 * 카드 얼굴은 **글자 하나**다 — 그림을 쓰면 화풍이 필요하고, 화풍은 코드로 못 만든다.
 * 대신 여덟 짝이 서로 확실히 달라 보이게 골랐다.
 */
import type { GameView } from '../views';
import type { MemoryState, MemoryAction } from './memory';

const FACES = ['🜁', '🜂', '🜃', '🜄', '☾', '✦', '❖', '⌘'];

export const memoryView: GameView<MemoryState, MemoryAction> = {
  id: 'memory',
  mount(el, act) {
    el.innerHTML = '<div class="ac-mem" id="acMem"></div>';
    const grid = el.querySelector('#acMem') as HTMLElement;
    let cards: HTMLButtonElement[] = [];

    return (v, mySeat) => {
      const s = v.state;
      if (cards.length !== s.cards.length) {
        grid.innerHTML = s.cards.map((_, i) => '<button class="ac-card2" data-i="' + i + '"></button>').join('');
        cards = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-card2'));
        cards.forEach((b) => {
          b.onclick = () => act({ cell: Number(b.dataset.i) });
        });
      }
      const myTurn = s.hideAt === 0 && s.turn === mySeat && s.up.length < 2;
      cards.forEach((b, i) => {
        const open = s.up.includes(i) || s.taken[i] !== 0;
        const face = open ? FACES[s.cards[i] % FACES.length] : '';
        if (b.textContent !== face) b.textContent = face;
        b.classList.toggle('ac-open', open);
        b.classList.toggle('ac-gone', s.taken[i] !== 0);
        b.disabled = !myTurn || open;
      });
      grid.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
