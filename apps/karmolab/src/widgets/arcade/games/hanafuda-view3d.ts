/**
 * 화투 짝맞추기 입체 (2026-09-03, D1. 입체가 정본)
 *
 * 방 상(`card-stage`)에 둘러앉음. 바닥은 딜러 줄(앞면), 남의 패는 뒷면, 내 패는 앞면.
 * 종이: `hana.ts` 의 열두 달 소재와 광, 열끗, 띠 코드 작화. 내 패와 같은 달 바닥패를 상에서 직접 선택
 * 한 짝은 즉시 가져오기, 짝이 없으면 HUD에서 버리기
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

    const amb = roomAmbience(host);
    let picked = -1;
    let actsKey = '';
    let latest: HanafudaState | null = null;
    let mine = 0;
    const chooseHand = (i: number): void => {
      if (!latest) return;
      const hand = latest.hands[mine] ?? [];
      if (!hand[i]) return;
      const same = latest.floor.filter((f) => monthOf(f) === monthOf(hand[i]));
      blip('tap');
      if (same.length === 1) {
        amb.stone();
        act({ hand: i, floor: latest.floor.indexOf(same[0]) });
        picked = -1;
      } else picked = picked === i ? -1 : i;
      actsKey = '';
    };
    const chooseFloor = (i: number): void => {
      const hand = latest?.hands[mine] ?? [];
      if (!latest || picked < 0 || monthOf(latest.floor[i] ?? -1) !== monthOf(hand[picked] ?? -2)) return;
      amb.stone();
      act({ hand: picked, floor: i });
      picked = -1;
      actsKey = '';
    };
    const stage: CardStage = mountCardStage(host, {
      scene: sceneOf('hanafuda'),
      onPick(id) {
        const n = Number(id.split(':')[1]);
        if (id.startsWith('hand:')) chooseHand(n);
        else if (id.startsWith('floor:')) chooseFloor(n);
      }
    });
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let linesKey = '';

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
      if (kind === 'hand') {
        chooseHand(Number(b.dataset.n));
      } else if (kind === 'floor') {
        chooseFloor(Number(b.dataset.n));
      } else if (kind === 'drop') {
        blip('tap');
        act({ hand: picked, floor: -1 });
        picked = -1;
        actsKey = '';
      } else if (kind === 'stop' || kind === 'koi') {
        blip(kind === 'stop' ? 'good' : 'tap');
        act({ kind: 'koi', continue: kind === 'koi' });
        actsKey = '';
      }
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
      const deciding = s.pending?.seat === mySeat && !v.finished;
      const myTurn = !s.pending && s.turn === mySeat && !v.finished && hand.length > 0;
      if (!myTurn) picked = -1;

      /* 상 위. 바닥은 딜러 줄, 남의 패는 뒷면, 내 패는 앞면. 가져간 것은 이름표 숫자 */
      const hands: CardHand[] = [];
      if (s.floor.length) {
        hands.push({
          seat: -1,
          cards: s.floor.map((n, j) => ({
            rank: 0,
            hana: n,
            up: true,
            id: picked >= 0 && monthOf(n) === monthOf(hand[picked] ?? -1) ? 'floor:' + j : undefined,
            can: myTurn && picked >= 0 && monthOf(n) === monthOf(hand[picked] ?? -1)
          })),
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
          cards: h.map((n, j) => ({
            rank: 0,
            hana: isMe ? n : 0,
            up: isMe,
            id: isMe ? 'hand:' + j : undefined,
            can: isMe && myTurn,
            held: isMe && j === picked
          })),
          label: (names[i] ?? '') + ' ' + (s.taken[i]?.length ?? 0) + (yaku ? ' (' + yaku + ')' : '') +
        (s.koi[i] ? ', ' + t('arcade.hana.koi.count', { n: String(s.koi[i]) }) : ''),
          tone: v.finished ? 'idle' : (s.pending?.seat ?? s.turn) === i ? 'turn' : 'idle'
        });
      });
      stage.setSeats(s.hands.length);
      stage.set(hands, mySeat);

      const line = v.finished
        ? ''
        : s.pending
          ? t('arcade.hana.koi.turn', { who: names[s.pending.seat] ?? '' })
          : myTurn
            ? t('arcade.table.myTurn')
            : t('arcade.table.turnOf', { who: names[s.turn] ?? '' });
      const lk = line + '|' + s.taken.map((x) => x.length).join(',');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML = line ? '<div class="ac-bjline ac-me"><span>' + esc(line) + '</span></div>' : '';
      }

      /* 내 패 버튼. 고르면 같은 달 바닥 버튼, 짝이 없으면 버리기 */
      const wanted = picked >= 0 ? hand[picked] : -1;
      const floorSame = wanted >= 0 ? s.floor.map((f, j) => (monthOf(f) === monthOf(wanted) ? j : -1)).filter((j) => j >= 0) : [];
      const ak = deciding ? 'koi:' + s.pending?.pts : myTurn ? hand.map((n, i) => n + (i === picked ? 'p' : '')).join(',') + '|' + floorSame.join(',') : 'off';
      if (ak !== actsKey) {
        actsKey = ak;
        actBox.innerHTML = deciding
          ? '<span class="ac-bjline">' + esc(t('arcade.hana.koi.offer', { n: String(s.pending?.pts ?? 0) })) + '</span>' +
            btn('stop', t('arcade.hana.koi.stop'), true, false) + btn('koi', t('arcade.hana.koi.go'), true, true)
          : myTurn
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
