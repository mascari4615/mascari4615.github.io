/**
 * 대부호 화면 (TASK-KL-242)
 *
 * 한 수가 여러 장이라 **무엇을 몇 장**을 골라야 한다. 카드를 누르면 그 수로 낼 수 있는
 * 장수들이 단추로 뜬다. 장수를 먼저 고르게 하면 낼 수 없는 조합을 고르고 헤맨다.
 *
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-02, C1 첫 판). 상대는 위에 자리 카드와 뒷면 부채,
 * 가운데 깔린 것, 아래 내 손패. 전에는 폼이 위에 뭉치고 아래 3분의 2 가 빈 천
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardMark } from '../card';
import { mountTable } from '../table2d';
import { options, power, type PresidentState, type PresidentAction } from './president';

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const presidentView: GameView<PresidentState, PresidentAction> = {
  id: 'president',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-prpile" id="acPrPile"></div><span class="ac-prrev" id="acPrRev" hidden></span>';
    tb.acts.innerHTML = '<span class="ac-prpick" id="acPrPick"></span><button class="btn btn-ghost" id="acPrPass"></button>';
    const pileEl = el.querySelector('#acPrPile') as HTMLElement;
    const revEl = el.querySelector('#acPrRev') as HTMLElement;
    const pickEl = el.querySelector('#acPrPick') as HTMLElement;
    const passBtn = el.querySelector('#acPrPass') as HTMLButtonElement;
    passBtn.onclick = () => act({ kind: 'pass' });
    /* 혁명과 8 자르기. 세기가 뒤집혔는데 아무 말이 없으면 왜 못 내는지 모른다. 알림은 1.6초 뒤 차례 글로 돌아감 */
    let sawBang = 0;
    let bangUntil = 0;
    let bangText = '';
    let swapKey = -1;
    let picked = -1;
    let pileKey = '';
    let handKey = '';

    return (v, mySeat, now) => {
      const s = v.state;
      const myTurn = s.turn === mySeat && !s.over && !v.finished;
      const hand = s.hands[mySeat] ?? [];
      const opts = myTurn ? options(s, mySeat) : [];

      if (s.bang && s.bang.at !== sawBang) {
        sawBang = s.bang.at;
        const who = v.seats[s.bang.by]?.name ?? '';
        bangText = t('arcade.president.' + s.bang.kind, { who });
        bangUntil = now + 1600;
      }
      /* 판 시작의 카드 교환. 한 판에 한 번만 알린다 */
      if (s.swaps && s.swaps.length && swapKey !== v.round) {
        swapKey = v.round;
        bangText = s.swaps.map((w) => t('arcade.president.swap', { poor: v.seats[w.poor]?.name ?? '', rich: v.seats[w.rich]?.name ?? '', n: String(w.n) })).join('. ');
        bangUntil = now + 2600;
      }
      /* 가운데 위 한 줄. 사건이 있으면 그것, 아니면 누구 차례인지 */
      const turnText = v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' });
      tb.toast(now < bangUntil ? bangText : turnText);
      /* 혁명 중이면 늘 보인다. 한 번 알리고 마는 것이 아니라 상태다 */
      revEl.hidden = !s.rev;
      if (s.rev) revEl.textContent = t('arcade.president.revOn');

      /* 상대 자리 아래 뒷면 부채. 손 장수는 redact 로 지워져도 길이는 남음 */
      tb.paint(v as never, mySeat, (i) => s.hands[i]?.length ?? 0, v.finished ? -1 : s.turn);

      /* 카드는 공용 한 벌(`card.ts`)로 그린다. 바뀐 때만 다시 그려 전환이 산다 */
      const pk = s.pile ? s.pile.rank + 'x' + s.pile.count : '-';
      if (pk !== pileKey) {
        pileKey = pk;
        pileEl.innerHTML = s.pile
          ? Array.from({ length: s.pile.count }, (_, i) =>
              cardMark(label(s.pile!.rank), { tilt: (i - (s.pile!.count - 1) / 2) * 7 })
            ).join('')
          : '<small>' + t('arcade.president.empty') + '</small>';
      }

      const ranks = [...new Set(hand)].sort((a, b) => power(a) - power(b));
      const hk = ranks.map((r) => r + ':' + hand.filter((c) => c === r).length + (opts.some((o) => o.rank === r) ? 'c' : '') + (r === picked ? 'p' : '')).join(',');
      if (hk !== handKey) {
        handKey = hk;
        tb.hand.innerHTML = ranks
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
        tb.hand.querySelectorAll<HTMLButtonElement>('.ac-pc[data-r]').forEach((b) => {
          b.onclick = () => {
            const r = Number(b.dataset.r);
            picked = picked === r ? -1 : r;
          };
        });
      }

      const counts = picked >= 0 ? opts.filter((o) => o.rank === picked).map((o) => o.count) : [];
      const ck = counts.join(',');
      if (pickEl.dataset.k !== ck) {
        pickEl.dataset.k = ck;
        pickEl.innerHTML = counts
          .map((n) => '<button class="btn btn-primary ac-prgo" data-n="' + n + '">' + t('arcade.president.play', { n: String(n) }) + '</button>')
          .join('');
        pickEl.querySelectorAll<HTMLButtonElement>('.ac-prgo').forEach((b) => {
          b.onclick = () => {
            act({ kind: 'play', rank: picked, count: Number(b.dataset.n) });
            picked = -1;
          };
        });
      }

      passBtn.textContent = t('arcade.president.pass');
      passBtn.disabled = !myTurn;
      passBtn.style.display = myTurn ? '' : 'none';
    };
  }
};
