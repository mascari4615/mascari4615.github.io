/**
 * 두더지 잡기 화면 (TASK-KL-242)
 *
 * 때리면 안 되는 것은 **모양이 확실히 다르다** — 색만 다르면 빠르게 두드리는 중에 못 가린다.
 * 남은 시간을 막대로 보여 준다(끝이 언제인지 모르면 서두를 이유가 없다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { HOLES, upNow, type WhackState, type WhackAction } from './whack';

export const whackView: GameView<WhackState, WhackAction> = {
  id: 'whack',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-wk">' +
      '<div class="ac-bar"><div class="ac-fill" id="acWkFill"></div></div>' +
      '<div class="ac-wkgrid" id="acWkGrid"></div>' +
      '<div class="ac-wkwho" id="acWkWho"></div>' +
      '</div>';
    const grid = el.querySelector('#acWkGrid') as HTMLElement;
    const fill = el.querySelector('#acWkFill') as HTMLElement;
    const who = el.querySelector('#acWkWho') as HTMLElement;
    grid.innerHTML = Array.from({ length: HOLES }, (_, i) =>
      '<button class="ac-wkh" data-h="' + i + '"><span></span></button>').join('');
    const holes = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-wkh'));
    holes.forEach((b) => {
      b.onclick = () => act({ hole: Number(b.dataset.h) });
    });

    return (v, mySeat, now) => {
      const s = v.state;
      const up = upNow(s, now);
      const shown = new Map<number, boolean>();
      for (const i of up) shown.set(s.moles[i].hole, s.moles[i].bad);

      holes.forEach((b, h) => {
        const has = shown.has(h);
        const bad = shown.get(h) === true;
        b.className = 'ac-wkh' + (has ? (bad ? ' ac-bad' : ' ac-up') : '');
        const span = b.firstElementChild as HTMLElement;
        span.textContent = has ? (bad ? '💣' : '🐹') : '';
        b.disabled = v.finished;
      });

      const left = Math.max(0, s.endsAt - now);
      fill.style.width = Math.min(100, (left / 30000) * 100) + '%';

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.score[i] ?? 0) + '</b></span>')
        .join('') + '<span class="ac-dts">' + t('arcade.whack.bad') + '</span>';
    };
  }
};
