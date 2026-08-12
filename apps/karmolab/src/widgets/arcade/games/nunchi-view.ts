/**
 * 눈치 게임 화면 (TASK-KL-242)
 *
 * 다음에 외칠 수를 **아주 크게** 띄운다 — 이 놀이는 화면을 읽는 게 아니라 사람을 읽는 거라,
 * 눈이 숫자에 붙잡히면 안 된다. 큰 단추 하나, 큰 숫자 하나면 충분하다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { NunchiState, NunchiAction } from './nunchi';

export const nunchiView: GameView<NunchiState, NunchiAction> = {
  id: 'nunchi',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-nu">' +
      '<div class="ac-nunum" id="acNuNum"></div>' +
      '<button class="btn btn-primary ac-nubtn" id="acNuGo"></button>' +
      '<div class="ac-nulog" id="acNuLog"></div>' +
      '<div class="ac-nuwho" id="acNuWho"></div>' +
      '</div>';
    const num = el.querySelector('#acNuNum') as HTMLElement;
    const go = el.querySelector('#acNuGo') as HTMLButtonElement;
    const log = el.querySelector('#acNuLog') as HTMLElement;
    const who = el.querySelector('#acNuWho') as HTMLElement;
    go.onclick = () => act({ kind: 'call' });

    return (v, mySeat, now) => {
      const s = v.state;
      const mineAlive = s.alive[mySeat];
      const waiting = s.pending.some((p) => p.seat === mySeat);

      num.textContent = String(s.next);
      go.textContent = !mineAlive
        ? t('arcade.nunchi.dead')
        : waiting
          ? t('arcade.nunchi.called', { n: String(s.next) })
          : t('arcade.nunchi.call', { n: String(s.next) });
      go.disabled = !mineAlive || waiting || v.finished;

      const left = Math.max(0, Math.ceil((s.endsAt - now) / 1000));
      log.innerHTML =
        s.log
          .slice(-4)
          .map((l) =>
            '<div class="ac-nul' + (l.clash ? ' ac-clash' : '') + '">' +
            l.n + ' — ' + l.seats.map((i) => v.seats[i]?.name ?? '?').join(', ') +
            (l.clash ? ' ' + t('arcade.nunchi.clash') : '') + '</div>')
          .join('') +
        (v.finished ? '' : '<small>' + t('arcade.nunchi.left', { n: String(left) }) + '</small>');

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (s.alive[i] ? '' : ' ac-dead') + '">' +
          seat.name + '</span>')
        .join('');
    };
  }
};
