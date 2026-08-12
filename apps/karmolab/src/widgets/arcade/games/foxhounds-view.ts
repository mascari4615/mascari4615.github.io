/**
 * 여우와 사냥개 화면 (TASK-KL-242)
 *
 * **내가 여우인지 개인지에 따라 말이 바뀐다** — 이길 조건이 서로 다르므로 「무엇을 하면 이기나」를
 * 한 줄로 적어 준다. 안 적으면 개를 쥔 사람이 왜 앞으로만 가는지 모른 채 둔다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { N, moves, type FoxState, type FoxAction } from './foxhounds';

export const foxhoundsView: GameView<FoxState, FoxAction> = {
  id: 'foxhounds',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-fx">' +
      '<div class="ac-fxrole" id="acFxRole"></div>' +
      '<div class="ac-fxboard" id="acFxB" style="--n:' + N + '"></div>' +
      '</div>';
    const boardEl = el.querySelector('#acFxB') as HTMLElement;
    const role = el.querySelector('#acFxRole') as HTMLElement;
    boardEl.innerHTML = Array.from({ length: N * N }, (_, i) => {
      const dark = ((i % N) + Math.floor(i / N)) % 2 === 1;
      return '<button class="ac-fxc' + (dark ? ' ac-dark' : '') + '" data-c="' + i + '"></button>';
    }).join('');
    const cells = Array.from(boardEl.querySelectorAll<HTMLButtonElement>('.ac-fxc'));
    let pick = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat && !v.finished;
      if (!myTurn) pick = -1;

      role.textContent = mySeat === 0 ? t('arcade.fox.youFox') : t('arcade.fox.youHound');

      const targets = pick >= 0 ? moves(s, pick, mySeat) : [];
      cells.forEach((b, i) => {
        const isFox = s.fox === i;
        const isHound = s.hounds.includes(i);
        b.textContent = isFox ? '🦊' : isHound ? '🐶' : '';
        const mine = (mySeat === 0 && isFox) || (mySeat === 1 && isHound);
        b.className =
          'ac-fxc' + (((i % N) + Math.floor(i / N)) % 2 === 1 ? ' ac-dark' : '') +
          (i === pick ? ' ac-pick' : '') + (targets.includes(i) ? ' ac-can' : '');
        b.disabled = !myTurn || (!mine && !targets.includes(i));
        b.onclick = () => {
          if (targets.includes(i)) {
            act({ from: pick, to: i });
            pick = -1;
            return;
          }
          pick = mine ? (pick === i ? -1 : i) : -1;
        };
      });
    };
  }
};
