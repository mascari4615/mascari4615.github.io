/**
 * 하이로우 화면 (TASK-KL-242)
 *
 * 쌓인 점수를 **크게** 보여 준다. 이 놀이의 긴장은 지금 챙기면 얼마에서 나온다.
 * 그 숫자가 작으면 한 장만 더의 무게가 안 실린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardBack, cardMark } from '../card';
import type { HighLowState, HighLowAction } from './highlow';

const label = (c: number): string =>
  c === 1 ? 'A' : c === 11 ? 'J' : c === 12 ? 'Q' : c === 13 ? 'K' : String(c);

export const highlowView: GameView<HighLowState, HighLowAction> = {
  id: 'highlow',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-hl">' +
      /* 카드 두 장은 공용 한 벌(`card.ts`)이 그린다. 이 판만의 64×90 을 따로 두지 않는다. */
      '<div class="ac-hlcards"><span id="acHlCur"></span><span id="acHlNext"></span></div>' +
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

      cur.innerHTML = cardMark(label(s.card));
      /* 아직 안 뒤집힌 다음 장은 **뒷면**이다. 물음표를 적는 것보다 카드답다. */
      nxt.innerHTML = s.shown ? cardMark(label(s.shown)) : cardBack();
      nxt.className = 'ac-hlnext' + (s.last === 1 ? ' ac-ok' : s.last === -1 ? ' ac-no' : '');

      pot.innerHTML = s.pot
        ? t('arcade.highlow.pot', { n: String(s.pot) })
        : t('arcade.highlow.nopot');

      /* 위, 아래가 나올 확률. 한 벌 열세 끗에서 지금 카드 위와 아래가 몇 끗인가
         같은 끗은 맞은 것으로 치므로 양쪽에 다 센다. 카드가 K 면 위가 8%, 아래가 100% */
      const upPct = Math.round(((13 - s.card + 1) / 13) * 100);
      const dnPct = Math.round((s.card / 13) * 100);
      up.textContent = t('arcade.highlow.high') + ' ' + upPct + '%';
      dn.textContent = t('arcade.highlow.low') + ' ' + dnPct + '%';
      up.classList.toggle('ac-good', myTurn && upPct >= dnPct);
      dn.classList.toggle('ac-good', myTurn && dnPct > upPct);
      bank.textContent = s.pot ? t('arcade.highlow.bank', { n: String(s.pot) }) : t('arcade.highlow.bankNone');
      up.disabled = !myTurn;
      dn.disabled = !myTurn;
      bank.disabled = !myTurn || s.pot === 0;
      /* 왜 못 누르나. 흐린 단추만 두면 고장으로 읽는다 */
      bank.title = s.pot === 0 ? t('arcade.highlow.bankWhy') : '';

      el.querySelector('#acHlLeft')!.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.banked[i] ?? 0) + '</b>, ' +
          t('arcade.highlow.left', { n: String(s.left[i] ?? 0) }) + '</span>')
        .join('');
    };
  }
};
