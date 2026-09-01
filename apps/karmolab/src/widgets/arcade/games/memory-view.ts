/**
 * 짝 맞추기 화면 (TASK-KL-242, change.arcade-cards)
 *
 * 카드 얼굴은 **글자 하나**. 그림을 쓰면 화풍이 필요하고, 화풍은 코드로 못 만듦
 * 열두 짝이 서로 확실히 달라 보이게 고름. 어느 글꼴에나 있는 글자만(트럼프 낱자는 두부로 뜸)
 *
 * 판 아래 한 줄에 자리마다 가져간 짝 수와 지금 차례. 맞히고 빗나간 것도 한 줄로
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { MemoryState, MemoryAction } from './memory';

/** 열두 개. 값이 열둘이라 나머지 연산으로 겹치면 짝이 아닌 카드가 같은 얼굴이 된다 */
const FACES = ['♠', '♣', '♥', '♦', '★', '●', '■', '▲', '☾', '✦', '❖', '✚'];
/** 얼굴마다 색. 같은 모양이 없어도 눈이 먼저 색으로 찾는다 */
const HUES = ['#2b2b2b', '#2b2b2b', '#b3242c', '#b3242c', '#c08a1e', '#2f7358', '#3b5aa0', '#8a4bbf', '#4a7fb5', '#c05a2a', '#2e8f6f', '#a02b52'];

export const memoryView: GameView<MemoryState, MemoryAction> = {
  id: 'memory',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-mem" id="acMem"></div>' +
      '<div class="ac-memhud" id="acMemHud"></div>' +
      '<div class="ac-memsay" id="acMemSay" role="status"></div>';
    const grid = el.querySelector('#acMem') as HTMLElement;
    const hudEl = el.querySelector('#acMemHud') as HTMLElement;
    const sayEl = el.querySelector('#acMemSay') as HTMLElement;
    let cards: HTMLButtonElement[] = [];
    let hudKey = '';
    let sawAt = 0;

    return (v, mySeat) => {
      const s = v.state;
      if (cards.length !== s.cards.length) {
        /* 종이는 공용 부품(.ac-pc). 뒤집기는 **다시 그리지 않고** 클래스와 글자만 바꾼다 . 
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
        if (open) b.style.setProperty('--hue', HUES[s.cards[i] % HUES.length]);
        else b.style.removeProperty('--hue');
        const mark = b.firstElementChild as HTMLElement;
        if (mark.textContent !== face) mark.textContent = face;
        b.classList.toggle('ac-back', !open);
        b.classList.toggle('ac-can', myTurn && !open);
        b.classList.toggle('ac-gone', s.taken[i] !== 0);
        b.disabled = !myTurn || open;
      });
      grid.classList.toggle('ac-waiting', !myTurn);

      /* 자리마다 가져간 짝. `taken` 은 0 이 아직 판 위, 그 밖은 가져간 자리 번호 + 1 */
      const got = v.seats.map((_, i) => s.taken.filter((x) => x === i + 1).length / 2);
      const key = JSON.stringify([got, s.turn, mySeat, v.seats.map((x) => x.name)]);
      if (key !== hudKey) {
        hudKey = key;
        hudEl.innerHTML = v.seats
          .map((seat, i) =>
            '<span class="ac-memseat' + (i === s.turn ? ' ac-cur' : '') + '">' +
            (seat.name || '') + (i === mySeat ? ' <small>' + t('arcade.memory.me') + '</small>' : '') +
            ' <b>' + got[i] + '</b></span>'
          )
          .join('');
      }

      /* 맞혔나 빗나갔나. 같은 일을 두 번 말하지 않게 시각으로 가른다 */
      if (s.last && s.last.at !== sawAt) {
        sawAt = s.last.at;
        const who = v.seats[s.last.by]?.name || '';
        sayEl.textContent = t(s.last.hit ? 'arcade.memory.hit' : 'arcade.memory.miss', { who });
      } else if (!s.last) {
        sayEl.textContent = '';
      }
    };
  }
};
