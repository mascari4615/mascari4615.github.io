/**
 * 경매 화면 (TASK-KL-242)
 *
 * 봉인 입찰. 값어치는 다 보이고 부른 값은 낙찰 순간에 열린다. 한 물건에 열넉 초.
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드, 가운데 물건과 남은 시간 띠, 아래 값 부르기
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountTable } from '../table2d';
import type { AuctionState, AuctionAction } from './auction';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const auctionView: GameView<AuctionState, AuctionAction> = {
  id: 'auction',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML =
      '<div class="ac-aulot"><span id="acAuNo"></span><b id="acAuVal"></b></div>' +
      '<div class="ac-autime" id="acAuTime" aria-hidden="true"><i></i></div>' +
      '<div class="ac-auwho" id="acAuWho"></div>';
    tb.acts.innerHTML =
      '<div class="ac-aubid">' +
      '<input type="range" id="acAuR" min="0" max="100" value="0">' +
      '<div class="ac-aunum" id="acAuN">0</div>' +
      '<button class="btn btn-primary" id="acAuGo"></button>' +
      '</div>';
    const no = el.querySelector('#acAuNo') as HTMLElement;
    const val = el.querySelector('#acAuVal') as HTMLElement;
    const range = el.querySelector('#acAuR') as HTMLInputElement;
    const num = el.querySelector('#acAuN') as HTMLElement;
    const go = el.querySelector('#acAuGo') as HTMLButtonElement;
    const who = el.querySelector('#acAuWho') as HTMLElement;
    range.oninput = () => { num.textContent = range.value; };
    go.onclick = () => act({ bid: Number(range.value) });
    /* 한 물건에 열넉 초. 남은 시간이 안 보이면 갑자기 끝나 억울하다 */
    const timeEl = el.querySelector('#acAuTime') as HTMLElement;
    const bar = timeEl.firstElementChild as HTMLElement;
    let whoKey = '';

    return (v, mySeat) => {
      const s = v.state;
      /* 남은 시간 띠. 커널의 시계(`v.now`)와 상태의 마감(`until`)으로 잰다 */
      const total = s.phase === 'bid' ? 14000 : 2200;
      const rest = Math.max(0, Math.min(total, s.until - v.now));
      bar.style.width = ((rest / total) * 100).toFixed(1) + '%';
      timeEl.classList.toggle('ac-warn', s.phase === 'bid' && rest < 4000);
      const mine = s.bids[mySeat];
      const bidding = s.phase === 'bid' && !s.over && !v.finished;

      tb.paint(v as never, mySeat, () => 0, -1);
      tb.toast(
        s.last && s.phase === 'show'
          ? s.last.seat < 0
            ? t('arcade.auction.tie')
            : t('arcade.auction.sold', { who: v.seats[s.last.seat]?.name ?? '', paid: String(s.last.paid), n: String(s.last.lot) })
          : t('arcade.auction.hint')
      );

      no.textContent = t('arcade.auction.lot', { i: String(s.at + 1), n: String(s.lots.length) });
      val.textContent = String(s.lots[s.at] ?? 0);

      range.max = String(s.money[mySeat]);
      range.disabled = !bidding || mine !== null;
      if (Number(range.value) > s.money[mySeat]) { range.value = String(s.money[mySeat]); num.textContent = range.value; }
      go.disabled = !bidding || mine !== null;
      go.textContent = mine !== null && mine >= 0 ? t('arcade.auction.sent') : t('arcade.auction.send');

      const wk = v.seats.map((seat, i) => seat.name + ':' + s.points[i] + '/' + s.money[i] + '/' + (s.phase === 'show' && s.bids[i] !== null ? s.bids[i] : s.bids[i] === null ? '-' : 'v')).join(',');
      if (wk !== whoKey) {
        whoKey = wk;
        who.innerHTML = v.seats
          .map((seat, i) => {
            const b = s.bids[i];
            /* 부른 값은 낙찰 순간에만 열린다. 그전엔 불렀다 표시뿐 */
            const shown = s.phase === 'show' && b !== null ? String(b) : b === null ? ', ' : '✓';
            return '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
              esc(seat.name) + ' ' + esc(t('arcade.auction.tally', { p: String(s.points[i]), m: String(s.money[i]) })) +
              ' <i>' + shown + '</i></span>';
          })
          .join('');
      }
    };
  }
};
