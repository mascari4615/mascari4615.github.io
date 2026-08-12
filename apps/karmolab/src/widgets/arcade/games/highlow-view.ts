/**
 * 하이로우 화면 (TASK-KL-242)
 *
 * 쌓인 점수를 **크게** 보여 준다 — 이 놀이의 긴장은 「지금 챙기면 얼마」에서 나온다.
 * 그 숫자가 작으면 「한 장만 더」의 무게가 안 실린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { HighLowState, HighLowAction } from './highlow';

const label = (c: number): string =>
  c === 1 ? 'A' : c === 11 ? 'J' : c === 12 ? 'Q' : c === 13 ? 'K' : String(c);

export const highlowView: GameView<HighLowState, HighLowAction> = {
  id: 'highlow',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-hl">' +
      '<div class="ac-hlcards"><span class="ac-hlc" id="acHlCur"></span>' +
      '<span class="ac-hlc ac-hlnext" id="acHlNext"></span></div>' +
      '<div class="ac-hlpot" id="acHlPot"></div>' +
      '<div class="ac-hlbar">' +
      '<button class="btn btn-primary" id="acHlUp"></button>' +
      '<button class="btn btn-primary" id="acHlDn"></button>' +
      '<button class="btn btn-ghost" id="acHlBank"></button>' +
      '</div>' +
      '<div class="ac-hlleft" id="acHlLeft"></div>' +
      '</div>';
    const cur = el.querySelector('#acHlCur') as HTMLElement;
    const nxt = el.querySelector('#acHlNext') as HTMLElement;
    const pot = el.querySelector('#acHlPot') as HTMLElement;
    const up = el.querySelector('#acHlUp') as HTMLButtonElement;
    const dn = el.querySelector('#acHlDn') as HTMLButtonElement;
    const bank = el.querySelector('#acHlBank') as HTMLButtonElement;
    up.onclick = () => act({ kind: 'high' });
    dn.onclick = () => act({ kind: 'low' });
    bank.onclick = () => act({ kind: 'bank' });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.turn === mySeat && (s.left[mySeat] ?? 0) > 0 && !v.finished;

      cur.textContent = label(s.card);
      nxt.textContent = s.shown ? label(s.shown) : '?';
      nxt.className = 'ac-hlc ac-hlnext' + (s.last === 1 ? ' ac-ok' : s.last === -1 ? ' ac-no' : '');

      pot.innerHTML = s.pot
        ? t('arcade.highlow.pot', { n: String(s.pot) })
        : t('arcade.highlow.nopot');

      up.textContent = t('arcade.highlow.high');
      dn.textContent = t('arcade.highlow.low');
      bank.textContent = t('arcade.highlow.bank', { n: String(s.pot) });
      up.disabled = !myTurn;
      dn.disabled = !myTurn;
      bank.disabled = !myTurn || s.pot === 0;

      el.querySelector('#acHlLeft')!.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.banked[i] ?? 0) + '</b> · ' +
          t('arcade.highlow.left', { n: String(s.left[i] ?? 0) }) + '</span>')
        .join('');
    };
  }
};
