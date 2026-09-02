/**
 * 거짓말 주사위 화면 (TASK-KL-242)
 *
 * 걸린 말을 올리거나 거짓말이라고 부른다. 1 은 만능.
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드(주사위 수는 알림 줄), 가운데 걸린 말과 내 주사위, 아래 부를 말
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { diePip, die } from '../die';
import { mountTable } from '../table2d';
import { expectOf, type LiarsState, type LiarsAction } from './liars';

export const liarsView: GameView<LiarsState, LiarsAction> = {
  id: 'liars',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-libid" id="acLiBid"></div><div class="ac-lidice" id="acLiDice"></div><div class="ac-lihint" id="acLiHint"></div>';
    const bidEl = el.querySelector('#acLiBid') as HTMLElement;
    const diceEl = el.querySelector('#acLiDice') as HTMLElement;
    /* 판에 주사위가 몇 개고 한 눈이 몇 개쯤 있을 만한지. 1 이 만능이라 기대는 전체의 3분의 1 */
    const hintEl = el.querySelector('#acLiHint') as HTMLElement;
    let bidKey = '';
    let diceKey = '';
    let barKey = '';

    return (v, mySeat) => {
      const s = v.state;
      const total = s.dice.reduce((a, d) => a + d.length, 0);
      const myTurn = s.showAt === 0 && s.alive[mySeat] && s.turn === mySeat && !v.finished;

      /* 주사위는 손패가 아니라 부채 없음. 자리마다 몇 개 남았나는 알림 줄 */
      tb.paint(v as never, mySeat, () => 0, v.finished || s.showAt !== 0 ? -1 : s.turn);
      const judged = s.showAt !== 0 && s.last?.kind === 'call' ? t('arcade.liars.real', { n: s.last.text }) + '. ' : '';
      const turnText = v.finished ? '' : myTurn ? t('arcade.table.myTurn') + '. ' : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' }) + '. ';
      tb.toast(judged + turnText + v.seats.map((seat, i) => seat.name + ' ' + (s.dice[i]?.length ?? 0) + (s.alive[i] ? '' : ' x')).join(', '));
      hintEl.textContent = t('arcade.liars.hint', { n: String(total), m: String(expectOf(total)) });

      const bk = s.bid ? s.bid.count + 'x' + s.bid.face : '-';
      if (bk !== bidKey) {
        bidKey = bk;
        bidEl.innerHTML = s.bid
          ? t('arcade.liars.bid', { n: String(s.bid.count), f: diePip(s.bid.face) })
          : '<small>' + t('arcade.liars.nobid') + '</small>';
      }
      const dk = (s.dice[mySeat] ?? []).join(',');
      if (dk !== diceKey) {
        diceKey = dk;
        diceEl.innerHTML =
          '<small>' + t('arcade.liars.mine') + '</small><div>' +
          /* 내 주사위. 점으로 그린다(`die.ts`). 굴리는 것이 아니라 보는 것이라 단추가 아니다 */
          (s.dice[mySeat] ?? []).map((d) => die(d)).join('') +
          '</div>';
      }

      const ak = myTurn ? 'on|' + bk : 'off';
      if (ak === barKey) return;
      barKey = ak;
      if (!myTurn) {
        tb.acts.innerHTML = '<small>' + t('arcade.liars.waiting') + '</small>';
        return;
      }
      /* 부를 수 있는 말만 만든다. 개수는 앞말 +0/+1, 눈은 그보다 높은 것만 */
      const opts: Array<{ face: number; count: number }> = [];
      const base = s.bid;
      for (let count = base ? base.count : 1; count <= (base ? base.count + 1 : 3); count++) {
        for (let face = 2; face <= 6; face++) {
          if (base && !(count > base.count || (count === base.count && face > base.face))) continue;
          opts.push({ face, count });
        }
      }
      tb.acts.innerHTML =
        '<div class="ac-liopts">' +
        opts.slice(0, 10)
          .map((o) => '<button class="ac-liopt" data-f="' + o.face + '" data-c="' + o.count + '">' +
            o.count + '×' + diePip(o.face) + '</button>')
          .join('') +
        '</div>' +
        (base ? '<button class="btn btn-primary" id="acLiCall">' + t('arcade.liars.call') + '</button>' : '');
      tb.acts.querySelectorAll<HTMLButtonElement>('.ac-liopt').forEach((b) => {
        b.onclick = () => act({ kind: 'bid', face: Number(b.dataset.f), count: Number(b.dataset.c) });
      });
      const call = tb.acts.querySelector('#acLiCall') as HTMLButtonElement | null;
      if (call) call.onclick = () => act({ kind: 'call' });
    };
  }
};
