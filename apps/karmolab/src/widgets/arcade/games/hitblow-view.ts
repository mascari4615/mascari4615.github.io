/**
 * 숫자 야구 화면 (TASK-KL-242)
 *
 * 내 던진 것과 그 답만 보여 준다 — 남이 어디까지 갔는지는 자리 점수줄로 충분하다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { HitBlowState, HitBlowAction } from './hitblow';

export const hitblowView: GameView<HitBlowState, HitBlowAction> = {
  id: 'hitblow',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-hb">' +
      '<ol class="ac-hblist" id="acHbList"></ol>' +
      '<div class="ac-hbrow">' +
      '<input type="text" id="acHbIn" inputmode="numeric" maxlength="3" autocomplete="off" aria-label="' + t('arcade.hitblow.aria') + '">' +
      '<button class="btn btn-primary" id="acHbGo">' + t('arcade.hitblow.throw') + '</button>' +
      '</div></div>';
    const list = el.querySelector('#acHbList') as HTMLElement;
    const input = el.querySelector('#acHbIn') as HTMLInputElement;
    const go = el.querySelector('#acHbGo') as HTMLButtonElement;

    const send = (): void => {
      const g = input.value.trim();
      if (g.length !== 3) return;
      act({ guess: g });
      input.value = '';
      input.focus();
    };
    go.onclick = send;
    input.onkeydown = (e): void => {
      if (e.key === 'Enter') send();
    };

    let drawn = -1;
    return (v, mySeat) => {
      const s = v.state;
      const mine = s.tries[mySeat] || [];
      if (mine.length !== drawn) {
        drawn = mine.length;
        list.innerHTML = mine
          .map((r) => '<li><b>' + r.guess + '</b><span>' + r.hit + 'S ' + r.blow + 'B</span></li>')
          .join('');
        list.scrollTop = list.scrollHeight;
      }
      const canPlay = s.solved === -1 && mine.length < 10 && !v.finished;
      input.disabled = !canPlay;
      go.disabled = !canPlay;
    };
  }
};
