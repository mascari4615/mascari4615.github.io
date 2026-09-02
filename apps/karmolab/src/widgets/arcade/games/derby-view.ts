/**
 * 경마 화면 (TASK-KL-242)
 *
 * 말을 고르고 돈을 건다. 배당은 승률 근사(파리뮤추얼, 집 몫 14%).
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드, 가운데 경주로, 아래 걸 돈과 말
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountTable } from '../table2d';
import { SEAT_COLOR } from '../paint';
import { odds, type DerbyState, type DerbyAction } from './derby';

/** 말마다 색 표. 이름 대신 색으로 부름 */
const SILK = ['🟥', '🟦', '🟩', '🟨', '🟪'];
/** 경주로 위의 말. 색 네모 대신 달리는 실루엣 (감사 C3). 기수 색은 자리 팔레트 */
const horseSvg = (i: number): string =>
  '<svg viewBox="0 0 64 40" width="46" height="29" aria-hidden="true"><path fill="' + SEAT_COLOR[i % SEAT_COLOR.length] + '" d="M6 30c3-8 9-12 17-12h12c4 0 7-2 9-5l4-6 4 2-2 6 8 1c3 0 5 2 5 5v6h-5l-2-4-6 1-2 8h-5l1-7h-9l-3 7h-5l2-8c-6 0-10 2-13 9z"/><path fill="' + SEAT_COLOR[i % SEAT_COLOR.length] + '" opacity=".55" d="M2 33c4-4 8-6 13-6l-3 5z"/></svg>';

export const derbyView: GameView<DerbyState, DerbyAction> = {
  id: 'derby',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-dbtrack" id="acDbTrack"></div><div class="ac-dbwho" id="acDbWho"></div>';
    tb.acts.innerHTML = '<div class="ac-dbbar" id="acDbBar"></div>';
    const track = el.querySelector('#acDbTrack') as HTMLElement;
    const bar = el.querySelector('#acDbBar') as HTMLElement;
    const who = el.querySelector('#acDbWho') as HTMLElement;
    let amount = 30;
    let rows: HTMLElement[] = [];
    let barKey = '';
    let whoKey = '';

    return (v, mySeat) => {
      const s = v.state;
      const betting = s.since === 0 && s.bet[mySeat] === null && !v.finished;
      const mine = s.bet[mySeat];

      tb.paint(v as never, mySeat, () => 0, -1);
      tb.toast(
        s.winner >= 0
          ? t('arcade.derby.result', { s: SILK[s.winner] })
          : s.since === 0
            ? betting ? '' : t('arcade.derby.waiting')
            : t('arcade.derby.running')
      );

      /* 경주로는 한 번 세우고 말 자리만 옮긴다. 매 프레임 다시 그리면 말이 순간이동한다 */
      if (rows.length !== s.horses.length) {
        track.innerHTML = s.horses
          .map((_, i) =>
            '<div class="ac-dbrow" data-i="' + i + '">' +
            '<span class="ac-dbsilk">' + SILK[i] + '</span>' +
            '<span class="ac-dblane"><i>' + horseSvg(i) + '</i></span>' +
            '<span class="ac-dbodds"></span>' +
            '</div>')
          .join('');
        rows = Array.from(track.querySelectorAll<HTMLElement>('.ac-dbrow'));
      }
      s.horses.forEach((h, i) => {
        const row = rows[i];
        const pct = Math.min(100, (h.at / 24) * 100);
        (row.querySelector('.ac-dblane i') as HTMLElement).style.left = pct + '%';
        const o = '×' + odds(s.horses, i);
        const oddsEl = row.querySelector('.ac-dbodds') as HTMLElement;
        if (oddsEl.textContent !== o) oddsEl.textContent = o;
        row.classList.toggle('ac-mine', mine?.horse === i);
        row.classList.toggle('ac-won', s.winner === i);
      });

      const bk = betting ? 'bet|' + s.horses.map((_, i) => odds(s.horses, i)).join(',') : 'off';
      if (bk !== barKey) {
        barKey = bk;
        if (betting) {
          bar.innerHTML =
            '<div class="ac-dbamt"><label>' + t('arcade.derby.amount') +
            ' <input type="range" id="acDbAmt" min="10" max="100" step="10" value="' + amount + '"></label>' +
            '<b id="acDbAmtV">' + amount + '</b></div>' +
            '<div class="ac-dbpick">' +
            s.horses.map((_, i) =>
              '<button class="ac-dbp" data-i="' + i + '">' + SILK[i] + ' ×' + odds(s.horses, i) + '</button>').join('') +
            '</div>';
          const r = bar.querySelector('#acDbAmt') as HTMLInputElement;
          const val = bar.querySelector('#acDbAmtV') as HTMLElement;
          r.oninput = () => {
            amount = Number(r.value);
            val.textContent = String(amount);
          };
          bar.querySelectorAll<HTMLButtonElement>('.ac-dbp').forEach((b) => {
            b.onclick = () => act({ horse: Number(b.dataset.i), amount });
          });
        } else bar.innerHTML = '';
      }

      const wk = v.seats.map((seat, i) => { const b = s.bet[i]; return seat.name + ':' + (s.purse[i] ?? 0) + (b && s.since !== 0 ? SILK[b.horse] + b.amount : ''); }).join(',');
      if (wk !== whoKey) {
        whoKey = wk;
        who.innerHTML = v.seats
          .map((seat, i) => {
            const b = s.bet[i];
            return (
              '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
              seat.name + ' <b>' + (s.purse[i] ?? 0) + '</b>' +
              (b && s.since !== 0 ? ' ' + SILK[b.horse] + b.amount : '') +
              '</span>'
            );
          })
          .join('');
      }
    };
  }
};
