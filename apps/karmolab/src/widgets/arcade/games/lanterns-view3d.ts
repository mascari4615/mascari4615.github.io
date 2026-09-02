/**
 * 등불 잇기 입체 (2026-09-03, D1. 입체가 정본)
 *
 * 방 상(`card-stage`)에 둘러앉음. 이 놀이는 거꾸로라 **남의 패가 앞면, 내 패가 뒷면**.
 * 등불 색 셋은 무늬 셋으로(색 0, 1, 2 가 무늬 0, 1, 2), 숫자 1~5 는 끗수 그대로.
 * 가운데 줄은 색마다 쌓은 맨 위 카드. 일러 주기와 내기와 버리기는 HUD 버튼 (평면과 같은 손)
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import type { LanternsState, LanternsAction } from './lanterns';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const view3d: GameView<LanternsState, LanternsAction> = {
  id: 'lanterns',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acHbHud"><div class="ac-bjlines" id="acHbLines"></div><div class="ac-bjacts ac-tbacts" id="acHbActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acHbHud') as HTMLElement;
    const lineBox = el.querySelector('#acHbLines') as HTMLElement;
    const actBox = el.querySelector('#acHbActs') as HTMLElement;

    const stage: CardStage = mountCardStage(host, { scene: sceneOf('lanterns') });
    const amb = roomAmbience(host);
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let picked = -1;
    let actsKey = '';
    let linesKey = '';
    let latest: LanternsState | null = null;

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
      blip('tap');
      if (kind === 'mine') {
        const i = Number(b.dataset.n);
        picked = picked === i ? -1 : i;
      } else if (kind === 'play') {
        amb.stone();
        act({ kind: 'play', index: picked });
        picked = -1;
      } else if (kind === 'drop') {
        act({ kind: 'drop', index: picked });
        picked = -1;
      } else if (kind === 'hint') {
        act({ kind: 'hint', seat: Number(b.dataset.s), rank: Number(b.dataset.n) });
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
      const names = v.seats.map((x) => x.name);
      const myTurn = !s.over && s.turn === mySeat && !v.finished;
      const mine = s.hands[mySeat] ?? [];

      /* 상 위. 가운데는 색마다 쌓은 맨 위(없으면 뒷면 자리), 남의 패는 앞면, 내 패는 뒷면 */
      const hands: CardHand[] = [
        {
          seat: -1,
          cards: s.piles.map((n, c) => ({ rank: n, suit: c, up: n > 0 })),
          label: t('arcade.lanterns.deck', { n: String(s.deck.length) }),
          tone: 'idle'
        }
      ];
      s.hands.forEach((h, i) => {
        if (!h.length) return;
        const isMe = i === mySeat;
        hands.push({
          seat: i,
          cards: h.map((c) => ({ rank: isMe ? 1 : c.rank, suit: isMe ? 0 : c.color, up: !isMe })),
          label: (names[i] ?? '') + (isMe ? '' : ' ' + t('arcade.president.cards', { n: String(h.length) })),
          tone: s.over ? 'idle' : s.turn === i ? 'turn' : 'idle'
        });
      });
      stage.setSeats(s.hands.length);
      stage.set(hands, mySeat);

      const head = s.last ? s.last.text : '';
      const line = s.over ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: names[s.turn] ?? '' });
      const sub = t('arcade.lanterns.hints', { n: String(s.hints) }) + ', ' + t('arcade.lanterns.fuses', { n: String(s.fuses) });
      const lk = head + '|' + line + '|' + sub;
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML =
          (line ? '<div class="ac-bjline ac-me"><span>' + esc(line) + '</span></div>' : '') +
          '<div class="ac-bjline ac-bjother"><span>' + esc(sub) + '</span></div>' +
          (head ? '<div class="ac-bjline ac-bjother"><span>' + esc(head) + '</span></div>' : '');
      }

      /* 내 패 고르기(뒷면이라 들은 것만 별표), 고르면 내기와 버리기, 안 고르면 남에게 숫자 일러 주기 */
      const ak = myTurn
        ? mine.map((_, i) => (s.told[mySeat]?.[i]?.rank ? 'r' : '') + (i === picked ? 'p' : '')).join(',') + '|' + s.hints +
          '|' + s.hands.map((h, i) => (i === mySeat ? '' : h.map((c) => c.rank).join(''))).join('/')
        : 'off';
      if (ak !== actsKey) {
        actsKey = ak;
        if (!myTurn) actBox.innerHTML = '';
        else {
          const hints = s.hints > 0
            ? s.hands.flatMap((h, i) => {
                if (i === mySeat) return [];
                const ranks = [...new Set(h.map((c) => c.rank))].sort();
                return ranks.map((r) => btn('hint', (names[i] ?? '') + ' ' + r, true, true, ' data-s="' + i + '" data-n="' + r + '"'));
              })
            : [];
          actBox.innerHTML =
            mine.map((_, i) => btn('mine', (i + 1) + (s.told[mySeat]?.[i]?.rank ? '*' : ''), true, true, ' data-n="' + i + '"', i === picked)).join('') +
            (picked >= 0
              ? btn('play', t('arcade.lanterns.play'), true, false) + btn('drop', t('arcade.lanterns.drop'), true, true)
              : hints.join(''));
        }
      }
    };
  }
};
