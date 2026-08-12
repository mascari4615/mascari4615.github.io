/**
 * 블랙잭 화면 (TASK-KL-242)
 *
 * 딜러 자리에 카드를 한 장만 놓고 나머지는 **뒷면 한 장으로 그린다** — 실제로 그 카드는
 * 아직 뽑히지도 않았지만(모두 멈춘 뒤 뽑는다), 눈에는 「감춰져 있다」가 맞는 그림이다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { total, type BlackjackState, type BlackjackAction } from './blackjack';

const label = (c: number): string =>
  c === 1 ? 'A' : c === 11 ? 'J' : c === 12 ? 'Q' : c === 13 ? 'K' : String(c);

const card = (c: number): string => '<span class="ac-bjc">' + label(c) + '</span>';

export const blackjackView: GameView<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-bj">' +
      '<div class="ac-bjrow"><small id="acBjDlabel"></small><div id="acBjDealer"></div></div>' +
      '<div class="ac-bjrow"><small id="acBjMlabel"></small><div id="acBjMine"></div></div>' +
      '<div class="ac-bjbar">' +
      '<button class="btn btn-primary" id="acBjHit"></button>' +
      '<button class="btn btn-ghost" id="acBjStand"></button>' +
      '</div></div>';
    const dealerEl = el.querySelector('#acBjDealer') as HTMLElement;
    const mineEl = el.querySelector('#acBjMine') as HTMLElement;
    const dLabel = el.querySelector('#acBjDlabel') as HTMLElement;
    const mLabel = el.querySelector('#acBjMlabel') as HTMLElement;
    const hit = el.querySelector('#acBjHit') as HTMLButtonElement;
    const stand = el.querySelector('#acBjStand') as HTMLButtonElement;
    hit.onclick = () => act({ kind: 'hit' });
    stand.onclick = () => act({ kind: 'stand' });

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.hands[mySeat] || [];

      if (s.settled) {
        dealerEl.innerHTML = s.dealer.map(card).join('');
        dLabel.textContent = t('arcade.blackjack.dealer', { n: String(total(s.dealer)) });
      } else {
        dealerEl.innerHTML = card(s.up) + '<span class="ac-bjc ac-back">?</span>';
        dLabel.textContent = t('arcade.blackjack.dealerHidden');
      }

      mineEl.innerHTML = mine.map(card).join('');
      const t0 = total(mine);
      mLabel.textContent = t('arcade.blackjack.mine', { n: String(t0) }) +
        (t0 > 21 ? ' · ' + t('arcade.blackjack.bust') : '');

      const canPlay = !s.settled && !s.stood[mySeat] && t0 <= 21;
      hit.textContent = t('arcade.blackjack.hit');
      stand.textContent = t('arcade.blackjack.stand');
      hit.disabled = !canPlay;
      stand.disabled = !canPlay;
    };
  }
};
