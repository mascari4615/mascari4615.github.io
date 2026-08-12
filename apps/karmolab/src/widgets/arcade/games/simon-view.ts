/**
 * 기억 순서 화면 (TASK-KL-242)
 *
 * 보여 주는 중에는 **누를 수 없다는 것이 눈에 보여야** 한다 — 안 그러면 눌렀는데 아무 일이
 * 없어서 고장 난 줄 안다. 지금까지 몇 칸 쳤는지도 점으로 보여 준다(길어지면 헷갈린다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { PADS, showing, type SimonState, type SimonAction } from './simon';

const COLOR = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'];

export const simonView: GameView<SimonState, SimonAction> = {
  id: 'simon',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-si">' +
      '<div class="ac-simsg" id="acSiMsg"></div>' +
      '<div class="ac-sipads" id="acSiPads"></div>' +
      '<div class="ac-sidots" id="acSiDots"></div>' +
      '<div class="ac-siwho" id="acSiWho"></div>' +
      '</div>';
    const pads = el.querySelector('#acSiPads') as HTMLElement;
    const msg = el.querySelector('#acSiMsg') as HTMLElement;
    const dots = el.querySelector('#acSiDots') as HTMLElement;
    const who = el.querySelector('#acSiWho') as HTMLElement;
    pads.innerHTML = Array.from({ length: PADS }, (_, i) =>
      '<button class="ac-sip" data-i="' + i + '" style="background:' + COLOR[i] + '"></button>').join('');
    const btns = Array.from(pads.querySelectorAll<HTMLButtonElement>('.ac-sip'));
    btns.forEach((b) => {
      b.onclick = () => act({ pad: Number(b.dataset.i) });
    });

    return (v, mySeat, now) => {
      const s = v.state;
      const at = showing(s, now);
      const lit = at >= 0 ? s.seq[at] : -1;
      const mineAlive = s.alive[mySeat];

      btns.forEach((b, i) => {
        b.className = 'ac-sip' + (lit === i ? ' ac-lit' : '');
        b.disabled = at >= 0 || !mineAlive || v.finished;
      });

      msg.textContent = !mineAlive
        ? t('arcade.simon.dead')
        : at >= 0
          ? t('arcade.simon.watch', { n: String(s.len) })
          : t('arcade.simon.repeat');

      dots.innerHTML = Array.from({ length: s.len }, (_, i) =>
        '<i class="' + (i < (s.typed[mySeat] ?? 0) ? 'ac-on' : '') + '"></i>').join('');

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (s.alive[i] ? '' : ' ac-dead') + '">' +
          seat.name + '</span>')
        .join('');
    };
  }
};
