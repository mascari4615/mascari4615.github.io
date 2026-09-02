/**
 * 화투 짝맞추기 입체 (2026-09-03, D1. 입체가 정본)
 *
 * 방 상(`card-stage`)에 둘러앉음. 바닥은 딜러 줄(앞면), 남의 패는 뒷면, 내 패는 앞면.
 * 종이는 `hana.ts` 의 약도(꽃 글자, 달 색, 광 열끗 띠 표식). 고르기는 HUD 버튼 (평면과 같은 손).
 * 내 패를 고르면 같은 달 바닥 버튼만 켜지고, 짝이 하나면 바로, 없으면 버리기
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { FLOWER } from '../hana';
import { monthOf, pointOf, yakuOf, type HanafudaState, type HanafudaAction } from './hanafuda';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const name = (n: number): string => FLOWER[monthOf(n)] + (monthOf(n) + 1) + ' ' + pointOf(n);

export const view3d: GameView<HanafudaState, HanafudaAction> = {
  id: 'hanafuda',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acHfHud"><div class="ac-bjlines" id="acHfLines"></div><div class="ac-bjacts ac-tbacts" id="acHfActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acHfHud') as HTMLElement;
    const lineBox = el.querySelector('#acHfLines') as HTMLElement;
    const actBox = el.querySelector('#acHfActs') as HTMLElement;

    const stage: CardStage = mountCardStage(host, { scene: sceneOf('hanafuda') });
    const amb = roomAmbience(host);
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let picked = -1;
    let actsKey = '';
    let linesKey = '';
    let latest: HanafudaState | null = null;
    let mine = 0;

    const nope = (b: HTMLElement): void => {
      blip('bad');
      b.classList.remove('ac-bjnope');
      void b.offsetWidth;
      b.classList.add('ac-bjnope');
    };
    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b || !latest) return;
      if (b.disabled) {
        nope(b);
        return;
      }
      const kind = b.dataset.do;
      const hand = latest.hands[mine] ?? [];
      blip('tap');
      if (kind === 'hand') {
        const i = Number(b.dataset.n);
        const same = latest.floor.filter((f) => monthOf(f) === monthOf(hand[i] ?? -1));
        if (same.length === 1) {
          amb.stone();
          act({ hand: i, floor: latest.floor.indexOf(same[0]) });
          picked = -1;
        } else picked = picked === i ? -1 : i;
      } else if (kind === 'floor') {
        amb.stone();
        act({ hand: picked, floor: Number(b.dataset.n) });
        picked = -1;
      } else if (kind === 'drop') {
        act({ hand: picked, floor: -1 });
        picked = -1;
      }
      actsKey = '';
    };
    hudEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });

    const btn = (kind: string, text: string, on: boolean, ghost: boolean, data = '', pick = false): string =>
      '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + (pick ? ' ac-on' : '') + '" data-do="' + kind + '"' +
      data + (on ? '' : ' disabled') + '>' + esc(text) + '</button>';

    return (v, mySeat) => {
      const s = v.state;
      latest = s;
      mine = mySeat;
      const names = v.seats.map((x) => x.name);
      const hand = s.hands[mySeat] ?? [];
      const myTurn = s.turn === mySeat && !v.finished && hand.length > 0;
      if (!myTurn) picked = -1;

      /* 상 위. 바닥은 딜러 줄, 남의 패는 뒷면, 내 패는 앞면. 가져간 것은 이름표 숫자 */
      const hands: CardHand[] = [];
      if (s.floor.length) {
        hands.push({
          seat: -1,
          cards: s.floor.map((n) => ({ rank: 0, hana: n, up: true })),
          label: t('arcade.lanterns.deck', { n: String(s.deck.length) }),
          tone: 'idle'
        });
      }
      s.hands.forEach((h, i) => {
        if (!h.length) return;
        const isMe = i === mySeat;
        const yaku = yakuOf(s.taken[i] ?? []).map((y) => t('arcade.hana.yaku.' + y.key, { n: String(y.n) })).join(' ');
        hands.push({
          seat: i,
          cards: h.map((n) => ({ rank: 0, hana: isMe ? n : 0, up: isMe })),
          label: (names[i] ?? '') + ' ' + (s.taken[i]?.length ?? 0) + (yaku ? ' (' + yaku + ')' : ''),
          tone: v.finished ? 'idle' : s.turn === i ? 'turn' : 'idle'
        });
      });
      stage.setSeats(s.hands.length);
      stage.set(hands, mySeat);

      const line = v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: names[s.turn] ?? '' });
      const lk = line + '|' + s.taken.map((x) => x.length).join(',');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML = line ? '<div class="ac-bjline ac-me"><span>' + esc(line) + '</span></div>' : '';
      }

      /* 내 패 버튼. 고르면 같은 달 바닥 버튼, 짝이 없으면 버리기 */
      const wanted = picked >= 0 ? hand[picked] : -1;
      const floorSame = wanted >= 0 ? s.floor.map((f, j) => (monthOf(f) === monthOf(wanted) ? j : -1)).filter((j) => j >= 0) : [];
      const ak = myTurn ? hand.map((n, i) => n + (i === picked ? 'p' : '')).join(',') + '|' + floorSame.join(',') : 'off';
      if (ak !== actsKey) {
        actsKey = ak;
        actBox.innerHTML = myTurn
          ? hand.map((n, i) => btn('hand', name(n), true, true, ' data-n="' + i + '"', i === picked)).join('') +
            (picked >= 0
              ? floorSame.length
                ? floorSame.map((j) => btn('floor', name(s.floor[j]), true, false, ' data-n="' + j + '"')).join('')
                : btn('drop', t('arcade.hana.drop'), true, false)
              : '')
          : '';
      }
    };
  }
};
