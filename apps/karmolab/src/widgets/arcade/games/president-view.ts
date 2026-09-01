/**
 * 대부호 화면 (TASK-KL-242)
 *
 * 한 수가 여러 장이라 **무엇을 몇 장**을 골라야 한다. 카드를 누르면 그 수로 낼 수 있는
 * 장수들이 단추로 뜬다. 장수를 먼저 고르게 하면 낼 수 없는 조합을 고르고 헤맨다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardMark } from '../card';
import { options, power, type PresidentState, type PresidentAction } from './president';

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const presidentView: GameView<PresidentState, PresidentAction> = {
  id: 'president',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-pr">' +
      '<div class="ac-prtop"><span class="ac-prsay" id="acPrSay" role="status"></span><span class="ac-prrev" id="acPrRev" hidden></span></div>' +
      '<div class="ac-prpile" id="acPrPile"></div>' +
      '<div class="ac-prhand" id="acPrHand"></div>' +
      '<div class="ac-prpick" id="acPrPick"></div>' +
      '<button class="btn btn-ghost" id="acPrPass"></button>' +
      '</div>';
    const pileEl = el.querySelector('#acPrPile') as HTMLElement;
    /* 혁명과 8 자르기. 세기가 뒤집혔는데 아무 말이 없으면 왜 못 내는지 모른다 */
    const sayEl = el.querySelector('#acPrSay') as HTMLElement;
    const revEl = el.querySelector('#acPrRev') as HTMLElement;
    let sawBang = 0;
    let bangTimer = 0;
    const handEl = el.querySelector('#acPrHand') as HTMLElement;
    const pickEl = el.querySelector('#acPrPick') as HTMLElement;
    const passBtn = el.querySelector('#acPrPass') as HTMLButtonElement;
    passBtn.onclick = () => act({ kind: 'pass' });
    let picked = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.turn === mySeat && !v.finished;
      const hand = s.hands[mySeat] ?? [];
      const opts = myTurn ? options(s, mySeat) : [];

      if (s.bang && s.bang.at !== sawBang) {
        sawBang = s.bang.at;
        const who = v.seats[s.bang.by]?.name ?? '';
        sayEl.textContent = t('arcade.president.' + s.bang.kind, { who });
        sayEl.classList.add('ac-hit');
        window.clearTimeout(bangTimer);
        bangTimer = window.setTimeout(() => { sayEl.classList.remove('ac-hit'); }, 1600);
      }
      /* 혁명 중이면 늘 보인다. 한 번 알리고 마는 것이 아니라 상태다 */
      revEl.hidden = !s.rev;
      if (s.rev) revEl.textContent = t('arcade.president.revOn');

      /* 카드는 공용 한 벌(`card.ts`)로 그린다. 이 판만의 치수, 모양을 따로 두지 않는다. */
      pileEl.innerHTML = s.pile
        ? Array.from({ length: s.pile.count }, (_, i) =>
            cardMark(label(s.pile!.rank), { tilt: (i - (s.pile!.count - 1) / 2) * 7 })
          ).join('')
        : '<small>' + t('arcade.president.empty') + '</small>';

      const ranks = [...new Set(hand)].sort((a, b) => power(a) - power(b));
      handEl.innerHTML = ranks
        .map((r) => {
          const n = hand.filter((c) => c === r).length;
          const can = opts.some((o) => o.rank === r);
          /* 같은 수가 여러 장이면 장수를 **아래 제 줄**에 적는다. 끗수와 겹치면 둘 다 안 읽힌다. */
          return cardMark(label(r), {
            can,
            pick: r === picked,
            dim: !can,
            note: n > 1 ? '×' + n : undefined,
            label: label(r) + (n > 1 ? ' ' + n + '장' : ''),
            data: { r }
          });
        })
        .join('');
      handEl.querySelectorAll<HTMLButtonElement>('.ac-pc[data-r]').forEach((b) => {
        b.onclick = () => {
          const r = Number(b.dataset.r);
          picked = picked === r ? -1 : r;
        };
      });

      const counts = picked >= 0 ? opts.filter((o) => o.rank === picked).map((o) => o.count) : [];
      pickEl.innerHTML = counts
        .map((n) => '<button class="btn btn-primary ac-prgo" data-n="' + n + '">' + t('arcade.president.play', { n: String(n) }) + '</button>')
        .join('');
      pickEl.querySelectorAll<HTMLButtonElement>('.ac-prgo').forEach((b) => {
        b.onclick = () => {
          act({ kind: 'play', rank: picked, count: Number(b.dataset.n) });
          picked = -1;
        };
      });

      passBtn.textContent = t('arcade.president.pass');
      passBtn.disabled = !myTurn;
      passBtn.style.display = myTurn && !opts.length ? '' : myTurn ? '' : 'none';
    };
  }
};
