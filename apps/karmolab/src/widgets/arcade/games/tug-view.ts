/**
 * 줄다리기 화면 (TASK-KL-242)
 *
 * 헛심을 냈을 때 **바로 알려 준다** — 안 알려 주면 「빨리 누를수록 좋다」고 믿고 계속 그렇게 한다.
 * 규칙을 글로 적어 두는 것보다 그 순간에 보여 주는 쪽이 배운다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { GOAL, type TugState, type TugAction } from './tug';

export const tugView: GameView<TugState, TugAction> = {
  id: 'tug',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-tg">' +
      '<div class="ac-tgline"><i id="acTgKnot"></i></div>' +
      '<div class="ac-tgmsg" id="acTgMsg"></div>' +
      '<button class="btn btn-primary ac-tgbtn" id="acTgGo"></button>' +
      '</div>';
    const knot = el.querySelector('#acTgKnot') as HTMLElement;
    const msg = el.querySelector('#acTgMsg') as HTMLElement;
    const go = el.querySelector('#acTgGo') as HTMLButtonElement;
    go.onclick = () => act({ kind: 'pull' });

    let seenWaste = 0;
    let warnUntil = 0;

    return (v, mySeat, now) => {
      const s = v.state;
      /* 내 쪽이 늘 오른쪽으로 끌려오게 — 자리1이면 방향을 뒤집어 그린다. */
      const dir = mySeat === 0 ? 1 : -1;
      const pct = 50 + (s.rope * dir * 50) / GOAL;
      knot.style.left = Math.max(2, Math.min(98, pct)) + '%';

      const waste = s.waste[mySeat] ?? 0;
      if (waste > seenWaste) {
        seenWaste = waste;
        warnUntil = now + 700;
      }
      msg.textContent = v.finished
        ? ''
        : now < warnUntil
          ? t('arcade.tug.tooFast')
          : t('arcade.tug.hint');
      msg.className = 'ac-tgmsg' + (now < warnUntil ? ' ac-warn' : '');

      go.textContent = t('arcade.tug.pull');
      go.disabled = v.finished;
    };
  }
};
