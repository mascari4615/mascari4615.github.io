/**
 * 거짓말 주사위 화면 (TASK-KL-242)
 *
 * 부를 수 있는 말만 단추로 낸다 — 「앞말보다 세야 한다」를 글로 적어 두면 아무도 안 읽고
 * 안 되는 말을 고르고 헤맨다. 규칙을 설명하는 대신 **못 고르게** 한다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { LiarsState, LiarsAction } from './liars';

const PIP = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export const liarsView: GameView<LiarsState, LiarsAction> = {
  id: 'liars',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-li">' +
      '<div class="ac-libid" id="acLiBid"></div>' +
      '<div class="ac-lidice" id="acLiDice"></div>' +
      '<div class="ac-liwho" id="acLiWho"></div>' +
      '<div class="ac-libar" id="acLiBar"></div>' +
      '</div>';
    const bidEl = el.querySelector('#acLiBid') as HTMLElement;
    const diceEl = el.querySelector('#acLiDice') as HTMLElement;
    const whoEl = el.querySelector('#acLiWho') as HTMLElement;
    const bar = el.querySelector('#acLiBar') as HTMLElement;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.showAt === 0 && s.alive[mySeat] && s.turn === mySeat && !v.finished;

      bidEl.innerHTML = s.bid
        ? t('arcade.liars.bid', { n: String(s.bid.count), f: PIP[s.bid.face] })
        : '<small>' + t('arcade.liars.nobid') + '</small>';

      diceEl.innerHTML =
        '<small>' + t('arcade.liars.mine') + '</small><div>' +
        (s.dice[mySeat] ?? []).map((d) => '<span class="ac-lid">' + PIP[d] + '</span>').join('') +
        '</div>';

      whoEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (s.alive[i] ? '' : ' ac-dead') + '">' +
          seat.name + ' ' + (s.dice[i]?.length ?? 0) + '</span>')
        .join('') +
        (s.showAt !== 0 && s.last?.kind === 'call'
          ? '<span class="ac-dts">' + t('arcade.liars.real', { n: s.last.text }) + '</span>'
          : '');

      if (!myTurn) {
        bar.innerHTML = '<small>' + t('arcade.liars.waiting') + '</small>';
        return;
      }

      /* 부를 수 있는 말만 만든다. 개수는 앞말 +0/+1, 눈은 그보다 높은 것만. */
      const opts: Array<{ face: number; count: number }> = [];
      const base = s.bid;
      for (let count = base ? base.count : 1; count <= (base ? base.count + 1 : 3); count++) {
        for (let face = 2; face <= 6; face++) {
          if (base && !(count > base.count || (count === base.count && face > base.face))) continue;
          opts.push({ face, count });
        }
      }
      bar.innerHTML =
        '<div class="ac-liopts">' +
        opts.slice(0, 10)
          .map((o) => '<button class="ac-liopt" data-f="' + o.face + '" data-c="' + o.count + '">' +
            o.count + '×' + PIP[o.face] + '</button>')
          .join('') +
        '</div>' +
        (base ? '<button class="btn btn-primary" id="acLiCall">' + t('arcade.liars.call') + '</button>' : '');

      bar.querySelectorAll<HTMLButtonElement>('.ac-liopt').forEach((b) => {
        b.onclick = () => act({ kind: 'bid', face: Number(b.dataset.f), count: Number(b.dataset.c) });
      });
      const call = bar.querySelector('#acLiCall') as HTMLButtonElement | null;
      if (call) call.onclick = () => act({ kind: 'call' });
    };
  }
};
