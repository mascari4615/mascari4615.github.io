/**
 * 블랙잭 평면 화면 (TASK-KL-242, 2026-09-01 전면 개편)
 *
 * 옛 화면은 카드에 무늬가 없었다. `cardMark` 로 글자만 찍어서 스페이드도 하트도, 빨강과
 * 검정도 없었다. 남의 손패도 안 보여 입체와 다른 놀이를 보여 줬다. 이겼는지 졌는지도
 * 카드 옆에 뜨지도 않았음
 *
 * 지금은 `card.ts` 의 `cardOf` 로 무늬와 색을 함께 찍는다. 값은 `deck.ts` 한 곳에서
 * 나오므로 입체와 같은 그림
 *
 * 화면이 지는 짐 넷.
 *  1. 칩과 판돈. 얼마 걸지 고르고, 지금 얼마 남았나
 *  2. 자리마다의 손. 나뉜 손은 나란히, 지금 치는 손에 테
 *  3. 결과. 손마다 이겼다, 비겼다, 죽었다를 카드 옆에
 *  4. 슈. 남은 장수가 줄어드는 것이 보임
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardBack, cardOf, applyDeckSkin } from '../card';
import { codeRank, codeSuit } from '../deck';
import {
  BETS,
  HANDS,
  activeHand,
  options,
  total,
  type BjHand,
  type BjRes,
  type BlackjackState,
  type BlackjackAction
} from './blackjack';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const card = (code: number): string => cardOf(codeRank(code), codeSuit(code));

const resKey: Record<BjRes, string> = {
  bj: 'arcade.blackjack.resBj',
  win: 'arcade.blackjack.resWin',
  push: 'arcade.blackjack.resPush',
  lose: 'arcade.blackjack.resLose',
  bust: 'arcade.blackjack.resBust',
  surrender: 'arcade.blackjack.resSurrender'
};

/** 손 하나. 카드 줄과 합계와 결과 */
const handHtml = (h: BjHand, live: boolean): string => {
  const tot = total(h.cards);
  const cls =
    'ac-bjhand' +
    (live ? ' ac-live' : '') +
    (h.res ? ' ac-res-' + h.res : '');
  const tag = h.res ? '<b class="ac-bjres">' + esc(t(resKey[h.res])) + '</b>' : '';
  const bet = h.bet > 0 ? '<span class="ac-bjbet">' + esc(t('arcade.blackjack.chips', { n: String(h.bet) })) + '</span>' : '';
  return (
    '<div class="' + cls + '">' +
    '<div class="ac-bjcards">' + h.cards.map(card).join('') + '</div>' +
    '<div class="ac-bjmeta"><span>' + tot + '</span>' + bet + tag + '</div>' +
    '</div>'
  );
};

export const blackjackView: GameView<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-bj">' +
      '<div class="ac-bjtop"><span id="acBjHand"></span><span id="acBjShoe"></span></div>' +
      '<div class="ac-bjrow ac-bjdealer"><small id="acBjDlabel"></small><div class="ac-bjcards" id="acBjDealer"></div></div>' +
      '<div class="ac-bjseats" id="acBjSeats"></div>' +
      '<div class="ac-bjbar" id="acBjBar"></div>' +
      '</div>';
    applyDeckSkin(el.querySelector('.ac-bj') as HTMLElement);
    const dealerEl = el.querySelector('#acBjDealer') as HTMLElement;
    const dLabel = el.querySelector('#acBjDlabel') as HTMLElement;
    const seatsEl = el.querySelector('#acBjSeats') as HTMLElement;
    const barEl = el.querySelector('#acBjBar') as HTMLElement;
    const handEl = el.querySelector('#acBjHand') as HTMLElement;
    const shoeEl = el.querySelector('#acBjShoe') as HTMLElement;

    /* 누르는 자리는 한 곳에서 받음. 다시 그려도 손이 안 끊김 */
    barEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      const kind = b.dataset.do as string;
      if (kind === 'bet') act({ kind: 'bet', amount: Number(b.dataset.n || 1) });
      else if (kind === 'insure') act({ kind: 'insure', take: b.dataset.n === '1' });
      else act({ kind } as BlackjackAction);
    };

    let barKey = '';

    return (v, mySeat) => {
      const s = v.state;
      const me = s.seats[mySeat];

      handEl.textContent = t('arcade.blackjack.handNo', {
        i: String(Math.min(s.hand + 1, HANDS)),
        n: String(HANDS)
      });
      shoeEl.textContent = t('arcade.blackjack.shoe', { n: String(Math.max(0, s.shoe.length - s.next)) });

      /* 딜러. 감춘 카드는 뒤집기 전까지 뒷면 */
      if (s.dealer.length === 0) {
        dealerEl.innerHTML = '';
        dLabel.textContent = t('arcade.blackjack.waiting');
      } else if (s.revealed) {
        dealerEl.innerHTML = s.dealer.map(card).join('');
        dLabel.textContent = t('arcade.blackjack.dealer', { n: String(total(s.dealer)) });
      } else {
        dealerEl.innerHTML =
          card(s.dealer[0]) + cardBack({ label: t('arcade.blackjack.dealerHidden') });
        dLabel.textContent = t('arcade.blackjack.dealerHidden');
      }

      /* 자리마다. 내 자리가 먼저 */
      const order = s.seats.map((_, i) => i).sort((a, b) => (a === mySeat ? -1 : b === mySeat ? 1 : a - b));
      seatsEl.innerHTML = order
        .map((i) => {
          const st = s.seats[i];
          const name = v.seats[i]?.name ?? '';
          const mine = i === mySeat;
          const cur = activeHand(st);
          return (
            '<div class="ac-bjseat' + (mine ? ' ac-me' : '') + '">' +
            '<small>' + esc(name) + ' <b>' + esc(t('arcade.blackjack.chips', { n: String(st.chips) })) + '</b>' +
            (st.insurance > 0 ? ' <i>' + esc(t('arcade.blackjack.insure')) + '</i>' : '') +
            '</small>' +
            '<div class="ac-bjhands">' +
            (st.hands.some((h) => h.cards.length)
              ? st.hands.map((h) => handHtml(h, s.phase === 'play' && h === cur && !h.done)).join('')
              : '<div class="ac-bjwait">' +
                esc(st.bet > 0 ? t('arcade.blackjack.betPlaced', { n: String(st.bet) }) : t('arcade.blackjack.betting')) +
                '</div>') +
            '</div></div>'
          );
        })
        .join('');

      /* 아래 단추. 판이 무엇을 묻고 있나에 따라 갈림 */
      let bar = '';
      if (!me) bar = '';
      else if (s.over) bar = '';
      else if (s.phase === 'bet') {
        bar =
          '<span class="ac-bjask">' + esc(t('arcade.blackjack.bet')) + '</span>' +
          BETS.map(
            (b) =>
              '<button class="btn btn-primary" data-do="bet" data-n="' + b + '"' +
              (me.bet > 0 || me.chips < b ? ' disabled' : '') + '>' + b + '</button>'
          ).join('');
      } else if (s.phase === 'insure') {
        const half = Math.floor(me.bet / 2);
        bar =
          '<span class="ac-bjask">' + esc(t('arcade.blackjack.insureAsk', { n: String(half) })) + '</span>' +
          '<button class="btn btn-primary" data-do="insure" data-n="1"' +
          (me.answered || half < 1 || me.chips < half ? ' disabled' : '') + '>' +
          esc(t('arcade.blackjack.insureYes')) + '</button>' +
          '<button class="btn btn-ghost" data-do="insure" data-n="0"' +
          (me.answered ? ' disabled' : '') + '>' + esc(t('arcade.blackjack.insureNo')) + '</button>';
      } else if (s.phase === 'play') {
        const o = options(s, mySeat);
        const btn = (kind: string, key: string, on: boolean, ghost = false): string =>
          '<button class="btn ' + (ghost ? 'btn-ghost' : 'btn-primary') + '" data-do="' + kind + '"' +
          (on ? '' : ' disabled') + '>' + esc(t(key)) + '</button>';
        bar =
          btn('hit', 'arcade.blackjack.hit', o.hit) +
          btn('stand', 'arcade.blackjack.stand', o.stand, true) +
          btn('double', 'arcade.blackjack.double', o.double, true) +
          btn('split', 'arcade.blackjack.split', o.split, true) +
          btn('surrender', 'arcade.blackjack.surrender', o.surrender, true);
      }
      if (bar !== barKey) {
        barKey = bar;
        barEl.innerHTML = bar;
      }
    };
  }
};
