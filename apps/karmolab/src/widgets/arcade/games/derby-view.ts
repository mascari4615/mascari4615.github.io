/**
 * 경마 화면 (TASK-KL-242)
 *
 * **성격표와 배당을 나란히 보여 준다** — 이 놀이의 수는 「이길 말」이 아니라 「얕본 말」을
 * 찾는 것이라, 두 값을 같이 봐야 고를 수 있다. 한쪽만 보이면 그냥 뽑기가 된다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { odds, type DerbyState, type DerbyAction } from './derby';

const SILK = ['🟥', '🟦', '🟩', '🟨', '🟪'];

export const derbyView: GameView<DerbyState, DerbyAction> = {
  id: 'derby',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-db">' +
      '<div class="ac-dbtrack" id="acDbTrack"></div>' +
      '<div class="ac-dbbar" id="acDbBar"></div>' +
      '<div class="ac-dbwho" id="acDbWho"></div>' +
      '</div>';
    const track = el.querySelector('#acDbTrack') as HTMLElement;
    const bar = el.querySelector('#acDbBar') as HTMLElement;
    const who = el.querySelector('#acDbWho') as HTMLElement;
    let amount = 30;

    return (v, mySeat) => {
      const s = v.state;
      const betting = s.since === 0 && s.bet[mySeat] === null && !v.finished;
      const mine = s.bet[mySeat];

      track.innerHTML = s.horses
        .map((h, i) => {
          const pct = Math.min(100, (h.at / 24) * 100);
          const picked = mine?.horse === i;
          return (
            '<div class="ac-dbrow' + (picked ? ' ac-mine' : '') + (s.winner === i ? ' ac-won' : '') + '">' +
            '<span class="ac-dbsilk">' + SILK[i] + '</span>' +
            '<span class="ac-dblane"><i style="left:' + pct + '%">' + SILK[i] + '</i></span>' +
            '<span class="ac-dbodds">×' + odds(s.horses, i) + '</span>' +
            '</div>'
          );
        })
        .join('');

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
      } else {
        bar.innerHTML =
          '<small>' +
          (s.winner >= 0
            ? t('arcade.derby.result', { s: SILK[s.winner] })
            : s.since === 0
              ? t('arcade.derby.waiting')
              : t('arcade.derby.running')) +
          '</small>';
      }

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
    };
  }
};
