/**
 * 하이로우 화면 (TASK-KL-242)
 *
 * 카드 한 장 보고 다음이 위인지 아래인지. 맞히면 판돈이 두 배, 챙기면 내 점수.
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위에 자리 카드, 가운데 카드 둘, 아래 위, 아래, 챙기기
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardMark, cardBack } from '../card';
import { mountTable } from '../table2d';
import type { HighLowState, HighLowAction } from './highlow';

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const highlowView: GameView<HighLowState, HighLowAction> = {
  id: 'highlow',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    /* 카드 두 장은 공용 한 벌(`card.ts`)이 그린다. 이 판만의 64×90 을 따로 두지 않는다. */
    tb.center.innerHTML = '<div class="ac-hlcards"><span id="acHlCur"></span><span id="acHlNext"></span></div><div class="ac-hlleft" id="acHlLeft"></div>';
    tb.acts.innerHTML =
      '<button class="btn btn-primary" id="acHlUp"></button>' +
      '<button class="btn btn-primary" id="acHlDn"></button>' +
      '<button class="btn btn-ghost" id="acHlBank"></button>';
    tb.acts.classList.add('ac-hlbar');
    const cur = el.querySelector('#acHlCur') as HTMLElement;
    const nxt = el.querySelector('#acHlNext') as HTMLElement;
    const left = el.querySelector('#acHlLeft') as HTMLElement;
    const up = el.querySelector('#acHlUp') as HTMLButtonElement;
    const dn = el.querySelector('#acHlDn') as HTMLButtonElement;
    const bank = el.querySelector('#acHlBank') as HTMLButtonElement;
    up.onclick = () => act({ kind: 'high' });
    dn.onclick = () => act({ kind: 'low' });
    bank.onclick = () => act({ kind: 'bank' });
    let cardKey = '';
    let leftKey = '';

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.turn === mySeat && (s.left[mySeat] ?? 0) > 0 && !v.finished;

      /* 손패가 없는 놀이. 부채는 안 그리고 차례 금테만 */
      tb.paint(v as never, mySeat, () => 0, v.finished ? -1 : s.turn);
      tb.toast(
        (v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' }) + '. ') +
        (s.pot ? t('arcade.highlow.pot', { n: String(s.pot) }) : t('arcade.highlow.nopot'))
      );

      const ck = s.card + '|' + s.shown + '|' + s.last;
      if (ck !== cardKey) {
        cardKey = ck;
        cur.innerHTML = cardMark(label(s.card));
        /* 아직 안 뒤집힌 다음 장은 **뒷면**이다. 물음표를 적는 것보다 카드답다. */
        nxt.innerHTML = s.shown ? cardMark(label(s.shown)) : cardBack();
        nxt.className = 'ac-hlnext' + (s.last === 1 ? ' ac-ok' : s.last === -1 ? ' ac-no' : '');
      }

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

      const lk = v.seats.map((seat, i) => seat.name + ':' + (s.banked[i] ?? 0) + '/' + (s.left[i] ?? 0)).join(',');
      if (lk !== leftKey) {
        leftKey = lk;
        left.innerHTML = v.seats
          .map((seat, i) =>
            '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
            seat.name + ' <b>' + (s.banked[i] ?? 0) + '</b>, ' +
            t('arcade.highlow.left', { n: String(s.left[i] ?? 0) }) + '</span>')
          .join('');
      }
    };
  }
};
