/**
 * 스피드 입체 (2026-09-03, D1)
 *
 * 방 상(`card-stage`)에 둘이 마주 앉음. 가운데 두 장, 내 손패 앞면, 상대는 뒷면.
 * 차례가 없어 빠른 손이 이김. 고르기는 HUD 의 카드 버튼, 양쪽 다 되면 자리 버튼 둘.
 * 상 위 카드 집기는 아직 없음(`card-stage.set` 에 집는 손이 없음)
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { near, type SpeedState, type SpeedAction } from './speed';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const view3d: GameView<SpeedState, SpeedAction> = {
  id: 'speed',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acSpHud"><div class="ac-bjlines" id="acSpLines"></div><div class="ac-bjacts ac-tbacts" id="acSpActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acSpHud') as HTMLElement;
    const lineBox = el.querySelector('#acSpLines') as HTMLElement;
    const actBox = el.querySelector('#acSpActs') as HTMLElement;

    const stage: CardStage = mountCardStage(host, { scene: sceneOf('speed') });
    const amb = roomAmbience(host);
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let picking = -1;
    let actsKey = '';
    let linesKey = '';
    let sawDeals = 0;
    let dealUntil = 0;

    const nope = (b: HTMLElement): void => {
      blip('bad');
      b.classList.remove('ac-bjnope');
      void b.offsetWidth;
      b.classList.add('ac-bjnope');
    };
    let latest: { mine: number[]; center: [number, number] } = { mine: [], center: [0, 0] };
    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b) return;
      if (b.disabled) {
        nope(b);
        return;
      }
      const kind = b.dataset.do;
      const n = Number(b.dataset.n);
      if (kind === 'card') {
        const fits = [0, 1].filter((p) => near(latest.mine[n], latest.center[p]));
        if (fits.length === 1) {
          amb.stone();
          act({ card: n, pile: fits[0] });
          picking = -1;
        } else {
          picking = picking === n ? -1 : n;
          blip('tap');
        }
      } else if (kind === 'pile') {
        amb.stone();
        act({ card: picking, pile: n });
        picking = -1;
      }
      actsKey = '';
    };
    hudEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });

    const btn = (kind: string, text: string, on: boolean, ghost: boolean, n: number, pick = false): string =>
      '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + (pick ? ' ac-on' : '') + '" data-do="' + kind + '" data-n="' + n + '"' +
      (on ? '' : ' disabled') + '>' + esc(text) + '</button>';

    return (v, mySeat, now) => {
      const s = v.state;
      const names = v.seats.map((x) => x.name);
      const mine = s.hands[mySeat] ?? [];
      const other = 1 - mySeat;
      latest = { mine, center: s.center };

      /* 상 위. 가운데 두 장, 내 손패 앞면, 상대 손패 뒷면 */
      const hands: CardHand[] = [
        { seat: -1, cards: s.center.map((c) => ({ rank: c, up: true })), tone: 'idle' },
        {
          seat: mySeat,
          cards: mine.map((c) => ({ rank: c, up: true })),
          label: (names[mySeat] ?? '') + ' ' + t('arcade.speed.mine', { n: String(s.decks[mySeat]?.length ?? 0) }),
          tone: v.finished ? (s.won === mySeat ? 'win' : 'lose') : 'idle'
        },
        {
          seat: other,
          cards: (s.hands[other] ?? []).map(() => ({ rank: 1, up: false })),
          label: (names[other] ?? '') + ' ' + t('arcade.speed.foe', { h: String((s.hands[other] ?? []).length), d: String(s.decks[other]?.length ?? 0) }),
          tone: v.finished ? (s.won === other ? 'win' : 'lose') : 'idle'
        }
      ];
      stage.setSeats(2);
      stage.set(hands, mySeat);

      if ((s.deals ?? 0) !== sawDeals) {
        sawDeals = s.deals ?? 0;
        if (sawDeals > 0) dealUntil = now + 1400;
      }
      const line = now < dealUntil ? t('arcade.speed.deal') : '';
      if (line !== linesKey) {
        linesKey = line;
        lineBox.innerHTML = line ? '<div class="ac-bjline ac-me"><span>' + esc(line) + '</span></div>' : '';
      }

      /* 손패 버튼. 낼 수 있는 것만 켜짐. 양쪽 다 되면 고른 뒤 자리 버튼 둘 */
      const ak = v.finished ? 'off' : mine.map((c, i) => c + (s.center.some((p) => near(c, p)) ? 'c' : '') + (i === picking ? 'p' : '')).join(',') + '|' + s.center.join(',');
      if (ak !== actsKey) {
        actsKey = ak;
        actBox.innerHTML = v.finished
          ? ''
          : mine.map((c, i) => btn('card', label(c), s.center.some((p) => near(c, p)), true, i, i === picking)).join('') +
            (picking >= 0
              ? [0, 1].map((p) => btn('pile', t('arcade.speed.pile', { n: label(s.center[p]) }), near(mine[picking], s.center[p]), false, p)).join('')
              : '');
      }
    };
  }
};
