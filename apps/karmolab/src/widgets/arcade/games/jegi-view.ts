/**
 * 제기차기 화면 (TASK-KL-242)
 *
 * 제기가 **어디쯤 있는지**가 화면의 전부다 — 신호를 기다리는 게 아니라 내려오는 걸 보고 차는
 * 놀이라, 높이가 실제 시간과 맞아야 한다. 발에 닿는 틈은 바닥의 띠로 그려서, 제기가 그 띠에
 * 들어왔을 때 차면 된다는 걸 말 없이 알 수 있게 했다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { flight, window_, type JegiState, type JegiAction } from './jegi';

export const jegiView: GameView<JegiState, JegiAction> = {
  id: 'jegi',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-jg">' +
      '<div class="ac-jglanes" id="acJgL"></div>' +
      '<button class="btn btn-primary ac-jgkick" id="acJgK"></button>' +
      '<div class="ac-jgmsg" id="acJgM"></div>' +
      '</div>';
    const lanes = el.querySelector('#acJgL') as HTMLElement;
    const kick = el.querySelector('#acJgK') as HTMLButtonElement;
    const msg = el.querySelector('#acJgM') as HTMLElement;
    kick.onclick = () => act({ kind: 'kick' });
    let built = 0;

    return (v, mySeat, now) => {
      const s = v.state;

      if (built !== v.seats.length) {
        built = v.seats.length;
        lanes.innerHTML = v.seats
          .map((_, i) =>
            '<div class="ac-jglane" data-i="' + i + '">' +
            '<div class="ac-jgband"></div><i class="ac-jgball"></i>' +
            '<div class="ac-jgtag"></div></div>')
          .join('');
      }

      lanes.querySelectorAll<HTMLElement>('.ac-jglane').forEach((lane, i) => {
        const fly = flight(s.count[i]);
        /* 찬 순간 0 → 발에 닿는 순간 1. 그 사이를 포물선으로 띄운다. */
        const p = Math.min(1, Math.max(0, 1 - (s.landAt[i] - now) / fly));
        const h = Math.sin(p * Math.PI);
        const ball = lane.querySelector('.ac-jgball') as HTMLElement;
        ball.style.bottom = (6 + h * 78) + '%';
        /* 닿는 틈을 바닥 띠 높이로 — 좁아지는 게 눈에 보인다. */
        const band = lane.querySelector('.ac-jgband') as HTMLElement;
        band.style.height = 6 + (window_(s.count[i]) / fly) * 78 + '%';
        lane.className = 'ac-jglane' + (i === mySeat ? ' ac-me' : '') + (s.alive[i] ? '' : ' ac-dead');
        (lane.querySelector('.ac-jgtag') as HTMLElement).textContent =
          v.seats[i].name + ' ' + s.count[i];
      });

      kick.textContent = s.alive[mySeat] ? t('arcade.jegi.kick') : t('arcade.jegi.dropped');
      kick.disabled = !s.alive[mySeat] || v.finished;
      msg.textContent = v.finished ? '' : t('arcade.jegi.hint');
    };
  }
};
