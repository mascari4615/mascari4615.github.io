/**
 * 대부호 화면 (TASK-KL-242)
 *
 * 한 수가 여러 장이라 **「무엇을 몇 장」**을 골라야 한다. 카드를 누르면 그 수로 낼 수 있는
 * 장수들이 단추로 뜬다 — 장수를 먼저 고르게 하면 낼 수 없는 조합을 고르고 헤맨다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { options, power, type PresidentState, type PresidentAction } from './president';

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const presidentView: GameView<PresidentState, PresidentAction> = {
  id: 'president',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-pr">' +
      '<div class="ac-prpile" id="acPrPile"></div>' +
      '<div class="ac-prhand" id="acPrHand"></div>' +
      '<div class="ac-prpick" id="acPrPick"></div>' +
      '<button class="btn btn-ghost" id="acPrPass"></button>' +
      '</div>';
    const pileEl = el.querySelector('#acPrPile') as HTMLElement;
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

      pileEl.innerHTML = s.pile
        ? Array.from({ length: s.pile.count }, () => '<span class="ac-prc">' + label(s.pile!.rank) + '</span>').join('')
        : '<small>' + t('arcade.president.empty') + '</small>';

      const ranks = [...new Set(hand)].sort((a, b) => power(a) - power(b));
      handEl.innerHTML = ranks
        .map((r) => {
          const n = hand.filter((c) => c === r).length;
          const can = opts.some((o) => o.rank === r);
          return (
            '<button class="ac-prc ac-prpickable' + (can ? ' ac-can' : '') + (r === picked ? ' ac-pick' : '') +
            '" data-r="' + r + '"' + (can ? '' : ' disabled') + '>' + label(r) +
            (n > 1 ? '<i>×' + n + '</i>' : '') + '</button>'
          );
        })
        .join('');
      handEl.querySelectorAll<HTMLButtonElement>('.ac-prpickable').forEach((b) => {
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
