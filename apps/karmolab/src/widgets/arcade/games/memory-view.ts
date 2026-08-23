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
        /* 종이는 공용 부품(.ac-pc). 뒤집기는 **다시 그리지 않고** 클래스와 글자만 바꾼다 —
           매 tick innerHTML 을 새로 쓰면 뒤집는 사이 카드가 깜빡인다. */
        grid.innerHTML = s.cards
          .map((_, i) => '<button class="ac-pc ac-back" data-i="' + i + '"><span class="ac-pcm"></span></button>')
          .join('');
        cards = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-pc'));
        cards.forEach((b) => {
          b.onclick = () => act({ cell: Number(b.dataset.i) });
        });
      }
      const myTurn = s.hideAt === 0 && s.turn === mySeat && s.up.length < 2;
      cards.forEach((b, i) => {
        const open = s.up.includes(i) || s.taken[i] !== 0;
        const face = open ? FACES[s.cards[i] % FACES.length] : '';
        const mark = b.firstElementChild as HTMLElement;
        if (mark.textContent !== face) mark.textContent = face;
        b.classList.toggle('ac-back', !open);
        b.classList.toggle('ac-can', myTurn && !open);
        b.classList.toggle('ac-gone', s.taken[i] !== 0);
        b.disabled = !myTurn || open;
      });
      grid.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
