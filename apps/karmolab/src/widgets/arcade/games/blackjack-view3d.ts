/**
 * 블랙잭. 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`blackjack.ts`)은 이 파일을 모른다. 무대는 `card-stage.ts`(방 안 탁자)
 * 여기 있는 일은 상태를 손패 줄로 옮기는 것과 버튼 둘을 두는 것뿐
 *
 * 딜러 줄은 판이 끝나기 전에는 **연 카드 한 장과 뒷면 한 장**. 규칙은 감출 카드를
 * 아예 안 만들고 모두 멈춘 뒤에 뽑으므로, 뒷면은 아직 없는 카드를 눈에만 놓은 것
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { total, type BlackjackState, type BlackjackAction } from './blackjack';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const view3d: GameView<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acBjHud"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acBjHud') as HTMLElement;

    const scene = sceneOf('blackjack');
    let stage: CardStage | null = mountCardStage(host, { scene });
    /* 방 소리. 알이 놓이는 소리를 카드 놓는 소리로 쓴다 */
    const amb = roomAmbience(host);

    if (!stage.ok) {
      /* WebGL 이 없는 창. 셸이 평면으로 내려 준다 */
      hudEl.textContent = t('arcade.no3d');
      return () => {};
    }

    let hudKey = '';
    let shownSeats = 0;

    const paintHud = (s: BlackjackState, mySeat: number): void => {
      const mine = s.hands[mySeat] || [];
      const my = total(mine);
      const can = !s.settled && !s.stood[mySeat] && my <= 21;
      const key = JSON.stringify([s.hands, s.stood, s.settled, s.dealer, s.up, mySeat]);
      if (key === hudKey) return;
      hudKey = key;
      const dealerLine = s.settled
        ? t('arcade.blackjack.dealer', { n: String(total(s.dealer)) })
        : t('arcade.blackjack.dealerHidden');
      hudEl.innerHTML =
        '<div class="ac-bjline"><span>' + esc(dealerLine) + '</span></div>' +
        '<div class="ac-bjline ac-me"><span>' + esc(t('arcade.blackjack.mine', { n: String(my) })) +
        (my > 21 ? ' <b>' + esc(t('arcade.blackjack.bust')) + '</b>' : '') + '</span></div>' +
        '<div class="ac-bjacts">' +
        '<button type="button" class="ac-bjbtn" id="acBjHit"' + (can ? '' : ' disabled') + '>' + esc(t('arcade.blackjack.hit')) + '</button>' +
        '<button type="button" class="ac-bjbtn ac-ghost" id="acBjStand"' + (can ? '' : ' disabled') + '>' + esc(t('arcade.blackjack.stand')) + '</button>' +
        '</div>';
      const hit = hudEl.querySelector<HTMLButtonElement>('#acBjHit');
      const stand = hudEl.querySelector<HTMLButtonElement>('#acBjStand');
      if (hit) hit.onclick = () => { amb.stone(); act({ kind: 'hit' }); };
      if (stand) stand.onclick = () => { amb.stone(); act({ kind: 'stand' }); };
    };

    return (v, mySeat) => {
      const s = v.state;
      if (!stage) return;
      if (shownSeats !== s.hands.length) shownSeats = s.hands.length;

      /* 딜러 줄. 끝나기 전에는 연 카드 하나와 뒷면 하나 */
      const dealer: CardHand = s.settled
        ? { seat: -1, cards: s.dealer.map((c) => ({ rank: c, up: true })) }
        : { seat: -1, cards: [{ rank: s.up, up: true }, { rank: 0, up: false }] };

      const hands: CardHand[] = [dealer];
      s.hands.forEach((h, i) => {
        /* 남의 손패도 다 보인다. 블랙잭은 서로의 수가 승패를 안 바꾼다 */
        hands.push({ seat: i, cards: h.map((c) => ({ rank: c, up: true })) });
      });
      stage.set(hands, mySeat);
      paintHud(s, mySeat);
    };
  }
};
