/**
 * 하이로우 입체 (2026-09-03, D1)
 *
 * 방 상 가운데에 카드 둘. 지금 장은 앞면, 다음 장은 뒤집히기 전까지 뒷면.
 * 위, 아래, 챙기기는 HUD 버튼. 판돈과 차례는 오른쪽 위 줄
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import type { HighLowState, HighLowAction } from './highlow';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const view3d: GameView<HighLowState, HighLowAction> = {
  id: 'highlow',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acHlHud"><div class="ac-bjlines" id="acHlLines"></div><div class="ac-bjacts ac-tbacts" id="acHlActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acHlHud') as HTMLElement;
    const lineBox = el.querySelector('#acHlLines') as HTMLElement;
    const actBox = el.querySelector('#acHlActs') as HTMLElement;

    const stage: CardStage = mountCardStage(host, { scene: sceneOf('highlow') });
    const amb = roomAmbience(host);
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let actsKey = '';
    let linesKey = '';
    let lastSeen = 0;

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
      amb.stone();
      act({ kind: b.dataset.do as 'high' | 'low' | 'bank' });
    };
    hudEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });

    const btn = (kind: string, text: string, on: boolean, ghost: boolean, good = false): string =>
      '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + (good ? ' ac-on' : '') + '" data-do="' + kind + '"' +
      (on ? '' : ' disabled') + '>' + esc(text) + '</button>';

    return (v, mySeat) => {
      const s = v.state;
      const names = v.seats.map((x) => x.name);
      const myTurn = s.turn === mySeat && (s.left[mySeat] ?? 0) > 0 && !v.finished;

      /* 상 가운데 두 장. 다음 장은 뒤집히기 전까지 뒷면 */
      const hands: CardHand[] = [
        {
          seat: -1,
          cards: [{ rank: s.card, up: true }, { rank: s.shown || 1, up: !!s.shown }],
          label: s.pot ? t('arcade.highlow.pot', { n: String(s.pot) }) : t('arcade.highlow.nopot'),
          tone: s.last === 1 ? 'win' : s.last === -1 ? 'lose' : 'idle'
        }
      ];
      stage.setSeats(v.seats.length);
      stage.set(hands, mySeat);
      /* 맞았나 틀렸나 소리 한 번 */
      if (s.last && s.shown !== lastSeen) {
        lastSeen = s.shown;
        blip(s.last === 1 ? 'good' : 'bad');
      }

      const lines = [
        v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: names[s.turn] ?? '' }),
        ...v.seats.map((seat, i) => seat.name + ' ' + (s.banked[i] ?? 0) + ', ' + t('arcade.highlow.left', { n: String(s.left[i] ?? 0) }))
      ];
      const lk = lines.join('|');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML = lines
          .map((x, i) => (x ? '<div class="ac-bjline' + (i === 0 ? ' ac-me' : ' ac-bjother') + '"><span>' + esc(x) + '</span></div>' : ''))
          .join('');
      }

      const upPct = Math.round(((13 - s.card + 1) / 13) * 100);
      const dnPct = Math.round((s.card / 13) * 100);
      const ak = [myTurn, s.card, s.pot].join('|');
      if (ak !== actsKey) {
        actsKey = ak;
        actBox.innerHTML = v.finished
          ? ''
          : btn('high', t('arcade.highlow.high') + ' ' + upPct + '%', myTurn, false, myTurn && upPct >= dnPct) +
            btn('low', t('arcade.highlow.low') + ' ' + dnPct + '%', myTurn, false, myTurn && dnPct > upPct) +
            btn('bank', s.pot ? t('arcade.highlow.bank', { n: String(s.pot) }) : t('arcade.highlow.bankNone'), myTurn && s.pot > 0, true);
      }
    };
  }
};
