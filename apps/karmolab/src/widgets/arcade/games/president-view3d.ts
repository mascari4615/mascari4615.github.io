/**
 * 대부호 입체 (2026-09-03, C1 과 D1. 입체가 정본)
 *
 * 방 상(`card-stage`)에 사람들이 둘러앉음. 남의 손패는 뒷면으로 장수만, 내 손패는 앞면,
 * 가운데에 깔린 것. 상 위 내 카드를 직접 고르고 장수만 HUD에서 정한다. HUD 끗수 버튼은 키보드용으로 남김.
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { options, power, rankKey, type PresidentState, type PresidentAction } from './president';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const view3d: GameView<PresidentState, PresidentAction> = {
  id: 'president',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acPrHud"><div class="ac-bjlines" id="acPrLines"></div><div class="ac-bjacts ac-tbacts" id="acPrActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acPrHud') as HTMLElement;
    const lineBox = el.querySelector('#acPrLines') as HTMLElement;
    const actBox = el.querySelector('#acPrActs') as HTMLElement;

    const amb = roomAmbience(host);
    let picked = -1;
    let pickable = new Set<number>();
    let actsKey = '';
    const stage: CardStage = mountCardStage(host, {
      scene: sceneOf('president'),
      onPick(id) {
        const rank = Number(id.split(':')[1]);
        if (!id.startsWith('hand:') || !pickable.has(rank)) return;
        picked = picked === rank ? -1 : rank;
        actsKey = '';
        blip('tap');
      }
    });
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let linesKey = '';
    let sawBang = 0;
    let bangUntil = 0;
    let bangText = '';
    let swapKey = -1;

    const nope = (b: HTMLElement): void => {
      blip('bad');
      b.classList.remove('ac-bjnope');
      void b.offsetWidth;
      b.classList.add('ac-bjnope');
    };
    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b) return;
      if (b.disabled) {
        nope(b);
        return;
      }
      const kind = b.dataset.do;
      if (kind === 'rank') {
        const r = Number(b.dataset.n);
        picked = picked === r ? -1 : r;
        blip('tap');
      } else if (kind === 'play') {
        amb.stone();
        blip('tap');
        act({ kind: 'play', rank: picked, count: Number(b.dataset.n) });
        picked = -1;
      } else if (kind === 'pass') {
        blip('tap');
        act({ kind: 'pass' });
      }
      actsKey = '';
    };
    hudEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });

    const btn = (kind: string, text: string, on: boolean, ghost: boolean, n?: number, pick = false): string =>
      '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + (pick ? ' ac-on' : '') + '" data-do="' + kind + '"' +
      (n !== undefined ? ' data-n="' + n + '"' : '') + (on ? '' : ' disabled') + '>' + esc(text) + '</button>';

    return (v, mySeat, now) => {
      const s = v.state;
      const names = v.seats.map((x) => x.name);
      const myTurn = s.turn === mySeat && !s.over && !v.finished;
      const hand = s.hands[mySeat] ?? [];
      const opts = myTurn ? options(s, mySeat) : [];
      pickable = new Set(opts.map((o) => o.rank));

      /* 상 위. 남의 손패는 뒷면, 내 것은 앞면, 가운데는 깔린 것 */
      const hands: CardHand[] = [];
      if (s.pile) {
        hands.push({
          seat: -1,
          cards: Array.from({ length: s.pile.count }, () => ({ rank: s.pile!.rank, up: true })),
          label: t('arcade.president.pileOf', { n: label(s.pile.rank), k: String(s.pile.count) }),
          tone: 'idle'
        });
      }
      s.hands.forEach((h, i) => {
        if (!h.length) return;
        const mine = i === mySeat;
        const sorted = mine ? [...h].sort((a, b) => power(a) - power(b)) : h;
        hands.push({
          seat: i,
          /* 남의 손패는 뒷면 일곱 장까지. 열여덟 장을 다 깔면 상을 다 먹고, 장수는 이름표가 말함 */
          cards: (mine ? sorted : sorted.slice(0, 7)).map((c) => ({
            rank: mine ? c : 1,
            up: mine,
            id: mine ? 'hand:' + c : undefined,
            can: mine && myTurn && pickable.has(c),
            held: mine && c === picked
          })),
          label: (s.ranks ? t(rankKey(s.ranks[i] ?? 0, s.hands.length)) + ' ' : '') + (names[i] ?? '') + ' ' + t('arcade.president.cards', { n: String(h.length) }) + (s.passed[i] && !v.finished ? ' ' + t('arcade.president.passed') : ''),
          tone: s.over ? (s.out[0] === i ? 'win' : 'idle') : s.turn === i ? 'turn' : 'idle'
        });
      });
      stage.setSeats(s.hands.length);
      stage.set(hands, mySeat);

      /* 알림 한 줄. 혁명과 8 자르기가 나면 그것, 아니면 차례 */
      if (s.bang && s.bang.at !== sawBang) {
        sawBang = s.bang.at;
        bangText = t('arcade.president.' + s.bang.kind, { who: names[s.bang.by] ?? '' });
        bangUntil = now + 1600;
      }
      /* 판 시작의 카드 교환. 한 판에 한 번만 알린다 */
      if (s.swaps && s.swaps.length && swapKey !== v.round) {
        swapKey = v.round;
        bangText = s.swaps.map((w) => t('arcade.president.swap', { poor: names[w.poor] ?? '', rich: names[w.rich] ?? '', n: String(w.n) })).join('. ');
        bangUntil = now + 2600;
      }
      const line = now < bangUntil ? bangText : v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: names[s.turn] ?? '' });
      const lk = line + '|' + (s.rev ? 'r' : '');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML =
          (line ? '<div class="ac-bjline ac-me"><span>' + esc(line) + '</span></div>' : '') +
          (s.rev ? '<div class="ac-bjline ac-bjother"><span>' + esc(t('arcade.president.revOn')) + '</span></div>' : '');
      }

      /* 손패 고르기. 끗수 버튼 한 줄, 고르면 장수 버튼, 그리고 넘기기 */
      const ranks = [...new Set(hand)].sort((a, b) => power(a) - power(b));
      const counts = picked >= 0 ? opts.filter((o) => o.rank === picked).map((o) => o.count) : [];
      const ak = myTurn ? ranks.map((r) => r + (opts.some((o) => o.rank === r) ? 'c' : '') + (r === picked ? 'p' : '')).join(',') + '|' + counts.join(',') : 'off';
      if (ak !== actsKey) {
        actsKey = ak;
        actBox.innerHTML = myTurn
          ? ranks.map((r) => {
              const n = hand.filter((c) => c === r).length;
              return btn('rank', label(r) + (n > 1 ? ' ×' + n : ''), opts.some((o) => o.rank === r), true, r, r === picked);
            }).join('') +
            counts.map((n) => btn('play', t('arcade.president.play', { n: String(n) }), true, false, n)).join('') +
            btn('pass', t('arcade.president.pass'), true, true)
          : '';
      }
    };
  }
};
