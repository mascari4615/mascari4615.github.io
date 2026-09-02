/**
 * 경마 입체 (2026-09-03, D1. 입체가 정본)
 *
 * 방 안 경주로(`derby-stage`). 말은 실루엣 판, 자리가 바뀌면 그리로 미끄러짐
 * 거는 것은 HUD. 걸 돈 띠와 말 버튼(색과 배당). 결과와 자리별 돈은 HUD 줄
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountDerbyStage, type DerbyStage } from '../derby-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { horseColor } from '../horse';
import { odds, TRACK, type DerbyState, type DerbyAction } from './derby';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SILK = ['🟥', '🟦', '🟩', '🟨', '🟪'];

export const view3d: GameView<DerbyState, DerbyAction> = {
  id: 'derby',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acDbHud"><div class="ac-bjlines" id="acDbLines"></div>' +
      '<div class="ac-bjacts ac-tbacts" id="acDbActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acDbHud') as HTMLElement;
    const lineBox = el.querySelector('#acDbLines') as HTMLElement;
    const actBox = el.querySelector('#acDbActs') as HTMLElement;

    let stage: DerbyStage | null = null;
    const amb = roomAmbience(host);
    let amount = 30;
    let actsKey = '';
    let linesKey = '';
    let sawWin = -1;
    let sawRound = -1;

    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do="pick"]') as HTMLButtonElement | null;
      if (!b) return;
      if (b.disabled) {
        blip('bad');
        return;
      }
      blip('tap');
      act({ horse: Number(b.dataset.n), amount });
    };

    return (v, mySeat) => {
      const s = v.state;
      if (!stage) {
        stage = mountDerbyStage(host, { scene: sceneOf('derby'), lanes: s.horses.length });
        if (!stage.ok) {
          lineBox.textContent = t('arcade.no3d');
          return;
        }
      }
      if (!stage.ok) return;
      const betting = s.since === 0 && s.bet[mySeat] === null && !v.finished;
      const mine = s.bet[mySeat];
      const running = s.since !== 0 && s.winner < 0;

      if (s.round !== sawRound) {
        sawRound = s.round;
        sawWin = -1;
        stage.finish(-1);
      }
      stage.set(s.horses.map((h) => h.at), TRACK, running);
      if (s.winner >= 0 && s.winner !== sawWin) {
        sawWin = s.winner;
        stage.finish(s.winner);
        if (mine && mine.horse === s.winner) blip('good');
        else amb.stone();
      }

      const head = s.winner >= 0
        ? t('arcade.derby.result', { s: SILK[s.winner] ?? '' })
        : s.since === 0
          ? betting ? t('arcade.derby.amount') + ' ' + amount : t('arcade.derby.waiting')
          : t('arcade.derby.running');
      const who = v.seats.map((seat, i) => {
        const b = s.bet[i];
        return seat.name + ' ' + (s.purse[i] ?? 0) + (b && s.since !== 0 ? ' ' + (SILK[b.horse] ?? '') + b.amount : '');
      });
      const lk = head + '|' + who.join('|');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML =
          '<div class="ac-bjline ac-me"><span>' + esc(head) + '</span></div>' +
          who.map((x) => '<div class="ac-bjline ac-bjother"><span>' + esc(x) + '</span></div>').join('');
      }

      /* 걸기. 돈 띠 하나와 말 버튼 다섯. 배당이 바뀌면 다시 그림 */
      const ak = betting ? 'bet|' + s.horses.map((_, i) => odds(s.horses, i)).join(',') : 'off';
      if (ak !== actsKey) {
        actsKey = ak;
        if (!betting) actBox.innerHTML = '';
        else {
          actBox.innerHTML =
            '<label class="ac-dbamt">' + esc(t('arcade.derby.amount')) + ' <input type="range" id="acDbAmt" min="10" max="100" step="10" value="' + amount + '"><b id="acDbAmtV">' + amount + '</b></label>' +
            s.horses.map((_, i) =>
              '<button type="button" class="ac-bjbtn ac-ghost" data-do="pick" data-n="' + i + '" style="border-color:' + horseColor(i) + '">' +
              SILK[i] + ' ×' + odds(s.horses, i) + '</button>').join('');
          const r = actBox.querySelector('#acDbAmt') as HTMLInputElement;
          const val = actBox.querySelector('#acDbAmtV') as HTMLElement;
          r.oninput = () => {
            amount = Number(r.value);
            val.textContent = String(amount);
            linesKey = '';
          };
        }
      }
    };
  }
};
