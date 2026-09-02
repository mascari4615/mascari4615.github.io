/**
 * 경매 입체 (2026-09-03, D1. 입체가 정본)
 *
 * 카지노 상(`card-stage` 의 casino). 딜러 줄에 이번 물건이 앞면 카드(끗수가 값어치), 남은 물건은 뒷면.
 * 자리마다 가진 돈이 베팅 서클 위 칩. 부르는 값은 HUD 의 띠와 보내기 버튼 (봉인이라 상 위에 안 놓임)
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import type { AuctionState, AuctionAction } from './auction';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const view3d: GameView<AuctionState, AuctionAction> = {
  id: 'auction',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acAuHud"><div class="ac-bjlines" id="acAuLines"></div>' +
      '<div class="ac-bjacts ac-tbacts ac-aubid"><input type="range" id="acAuR" min="0" max="100" value="0"><div class="ac-aunum" id="acAuN">0</div>' +
      '<button type="button" class="ac-bjbtn" id="acAuGo"></button></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const lineBox = el.querySelector('#acAuLines') as HTMLElement;
    const range = el.querySelector('#acAuR') as HTMLInputElement;
    const num = el.querySelector('#acAuN') as HTMLElement;
    const go = el.querySelector('#acAuGo') as HTMLButtonElement;

    const stage: CardStage = mountCardStage(host, { scene: sceneOf('auction'), table: 'casino' });
    const amb = roomAmbience(host);
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }
    range.oninput = () => { num.textContent = range.value; };
    go.onclick = () => {
      if (go.disabled) {
        blip('bad');
        return;
      }
      blip('tap');
      act({ bid: Number(range.value) });
    };

    let linesKey = '';
    let sawAt = -1;

    return (v, mySeat) => {
      const s = v.state;
      const names = v.seats.map((x) => x.name);
      const mine = s.bids[mySeat];
      const bidding = s.phase === 'bid' && !s.over && !v.finished;
      const total = s.phase === 'bid' ? 14000 : 2200;
      const rest = Math.max(0, Math.min(total, s.until - v.now));

      /* 상 위. 딜러 줄에 남은 물건(뒷면) 뒤에 이번 물건(앞면). 나중 카드가 위에 얹히므로 앞면이 맨 끝
         값어치 3~12 를 끗수로 */
      const left = Math.max(0, s.lots.length - s.at - 1);
      const hands: CardHand[] = [
        {
          seat: -1,
          cards: [...Array.from({ length: left }, () => ({ rank: 1, suit: 0, up: false })), { rank: s.lots[s.at] ?? 1, suit: 0, up: true }],
          label: t('arcade.auction.lot', { i: String(s.at + 1), n: String(s.lots.length) }) + ' ' + (s.lots[s.at] ?? 0),
          tone: 'idle'
        }
      ];
      s.points.forEach((_, i) => {
        const b = s.bids[i];
        hands.push({
          seat: i,
          cards: [],
          label: (names[i] ?? '') + ' ' + t('arcade.auction.tally', { p: String(s.points[i]), m: String(s.money[i]) }) +
            (s.phase === 'show' && b !== null ? ' ' + b : b === null ? '' : ' v'),
          tone: s.phase === 'show' && s.last && s.last.seat === i ? 'win' : b === null && bidding ? 'turn' : 'idle'
        });
      });
      stage.setSeats(s.points.length);
      stage.set(hands, mySeat);
      stage.setChips(s.money.map((m, i) => ({ seat: i, amount: m })));

      /* 낙찰 순간 소리. 내가 가져가면 좋은 소리, 남이면 돌 놓는 소리 */
      if (s.phase === 'show' && s.last && s.at !== sawAt) {
        sawAt = s.at;
        if (s.last.seat === mySeat) blip('good');
        else amb.stone();
      }

      const head = s.last && s.phase === 'show'
        ? s.last.seat < 0
          ? t('arcade.auction.tie')
          : t('arcade.auction.sold', { who: names[s.last.seat] ?? '', paid: String(s.last.paid), n: String(s.last.lot) })
        : t('arcade.auction.hint');
      const secs = bidding ? Math.ceil(rest / 1000) : 0;
      const lk = head + '|' + secs;
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML =
          '<div class="ac-bjline ac-me"><span>' + esc(head) + '</span></div>' +
          (bidding ? '<div class="ac-bjline ac-bjother' + (rest < 4000 ? ' ac-warn' : '') + '"><span>' + secs + 's</span></div>' : '');
      }

      range.max = String(s.money[mySeat]);
      range.disabled = !bidding || mine !== null;
      if (Number(range.value) > s.money[mySeat]) { range.value = String(s.money[mySeat]); num.textContent = range.value; }
      go.disabled = !bidding || mine !== null;
      const goText = mine !== null && mine >= 0 ? t('arcade.auction.sent') : t('arcade.auction.send');
      if (go.textContent !== goText) go.textContent = goText;
    };
  }
};
