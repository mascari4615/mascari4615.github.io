/**
 * 주사위 요트 화면 (TASK-KL-242)
 *
 * 칸마다 **지금 적으면 몇 점인지 미리 보여 준다** — 규칙 열두 줄을 외운 사람만 놀 수 있으면
 * 그건 오락실이 아니다. 0점이 되는 칸은 흐리게 두되 막지는 않는다(버리는 것도 수다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { CATS, scoreOf, totalOf, type Cat, type YachtState, type YachtAction } from './yacht';

const PIP = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export const yachtView: GameView<YachtState, YachtAction> = {
  id: 'yacht',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-yc">' +
      '<div class="ac-ycdice" id="acYcDice"></div>' +
      '<div class="ac-ycbar"><button class="btn btn-primary" id="acYcRoll"></button>' +
      '<span id="acYcLeft"></span></div>' +
      '<div class="ac-ycsheet" id="acYcSheet"></div>' +
      '</div>';
    const diceEl = el.querySelector('#acYcDice') as HTMLElement;
    const rollBtn = el.querySelector('#acYcRoll') as HTMLButtonElement;
    const leftEl = el.querySelector('#acYcLeft') as HTMLElement;
    const sheetEl = el.querySelector('#acYcSheet') as HTMLElement;
    rollBtn.onclick = () => act({ kind: 'roll' });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.turn === mySeat;
      const mine = s.sheet[mySeat];

      diceEl.innerHTML = s.dice
        .map((d, i) => '<button class="ac-ycd' + (s.keep[i] ? ' ac-keep' : '') + '" data-i="' + i + '">' + PIP[d] + '</button>')
        .join('');
      diceEl.querySelectorAll<HTMLButtonElement>('.ac-ycd').forEach((b) => {
        b.disabled = !myTurn || s.rolled >= 3;
        b.onclick = () => act({ kind: 'keep', index: Number(b.dataset.i) });
      });

      rollBtn.textContent = t('arcade.yacht.roll');
      rollBtn.disabled = !myTurn || s.rolled >= 3;
      leftEl.textContent = t('arcade.yacht.left', { n: String(Math.max(0, 3 - s.rolled)) });

      sheetEl.innerHTML = CATS.map((c: Cat) => {
        const done = mine?.[c];
        const would = scoreOf(c, s.dice);
        const cls = done !== null && done !== undefined ? ' ac-done' : would === 0 ? ' ac-zero' : '';
        return (
          '<button class="ac-yccat' + cls + '" data-c="' + c + '">' +
          '<span>' + t('arcade.yacht.cat.' + c) + '</span>' +
          '<b>' + (done !== null && done !== undefined ? done : would) + '</b></button>'
        );
      }).join('') + '<div class="ac-yctotal">' + t('arcade.yacht.total', { n: String(mine ? totalOf(mine) : 0) }) + '</div>';

      sheetEl.querySelectorAll<HTMLButtonElement>('.ac-yccat').forEach((b) => {
        const c = b.dataset.c as Cat;
        b.disabled = !myTurn || (mine?.[c] ?? null) !== null;
        b.onclick = () => act({ kind: 'write', cat: c });
      });
    };
  }
};
