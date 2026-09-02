/**
 * 짝맞추기 화면 (TASK-KL-242)
 *
 * 열두 쌍 6x4. 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드(가져간 짝은 점수),
 * 가운데 격자, 알림 한 줄. 손패가 없는 놀이라 뒷면 부채는 없음
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountTable } from '../table2d';
import type { MemoryState, MemoryAction } from './memory';

/** 얼굴 열둘. 열두 쌍이라 여덟이면 짝이 아닌 카드가 같은 얼굴이 된다 (2026-09-01 실측) */
export const FACES = ['♠', '♣', '♥', '♦', '★', '●', '■', '▲', '☾', '✦', '❖', '✚'];
/** 얼굴마다 색. 같은 기호라도 색이 다르면 다른 카드 */
export const HUES = ['#2b2b2b', '#2b2b2b', '#b3242c', '#b3242c', '#c08a1e', '#2f7358', '#3b5aa0', '#8a4bbf', '#4a7fb5', '#c05a2a', '#2e8f6f', '#a02b52'];

export const memoryView: GameView<MemoryState, MemoryAction> = {
  id: 'memory',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-mem" id="acMem"></div>';
    const grid = el.querySelector('#acMem') as HTMLElement;
    let cards: HTMLButtonElement[] = [];
    let sawAt = 0;
    let sayUntil = 0;
    let sayText = '';

    return (v, mySeat, now) => {
      const s = v.state;
      if (cards.length !== s.cards.length) {
        /* 종이는 공용 부품(.ac-pc). 뒤집기는 **다시 그리지 않고** 클래스와 글자만 바꿈.
           매 tick innerHTML 을 새로 쓰면 뒤집는 사이 카드가 깜빡임 */
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

      /* 자리 카드 금테. 손패가 없어 부채는 안 그림 */
      tb.paint(v as never, mySeat, () => 0, v.finished ? -1 : s.turn);

      /* 맞혔나 빗나갔나. 같은 일을 두 번 말하지 않게 시각으로 가름. 1.6초 뒤 차례 글로 */
      if (s.last && s.last.at !== sawAt) {
        sawAt = s.last.at;
        sayText = t(s.last.hit ? 'arcade.memory.hit' : 'arcade.memory.miss', { who: v.seats[s.last.by]?.name || '' });
        sayUntil = now + 1600;
      }
      const got = v.seats.map((_, i) => s.taken.filter((x) => x === i + 1).length / 2);
      const turnText = v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' });
      tb.toast(now < sayUntil ? sayText : turnText + (turnText ? '. ' : '') + v.seats.map((seat, i) => seat.name + ' ' + got[i]).join(', '));
    };
  }
};
