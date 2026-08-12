/**
 * 낚시 화면 (TASK-KL-242)
 *
 * 입질은 **글자가 아니라 움직임**으로 알린다 — 「지금!」이라고 써 두면 읽는 데 시간이 걸려
 * 창을 놓친다. 찌가 확 들어가고 물결이 커지는 것으로 충분하다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { FishState, FishAction } from './fishing';

export const fishingView: GameView<FishState, FishAction> = {
  id: 'fishing',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-fi">' +
      '<canvas id="acFiCv"></canvas>' +
      '<button class="btn btn-primary ac-fibtn" id="acFiGo"></button>' +
      '<div class="ac-fibag" id="acFiBag"></div>' +
      '<div class="ac-fiwho" id="acFiWho"></div>' +
      '</div>';
    const cv = el.querySelector('#acFiCv') as HTMLCanvasElement;
    const go = el.querySelector('#acFiGo') as HTMLButtonElement;
    const bag = el.querySelector('#acFiBag') as HTMLElement;
    const who = el.querySelector('#acFiWho') as HTMLElement;

    const names = (() => {
      const raw = t('arcade.fish.kinds');
      return raw && raw !== 'arcade.fish.kinds' ? raw.split(',').map((x) => x.trim()) : ['물고기'];
    })();

    return (v, mySeat, now) => {
      const s = v.state;
      const casted = s.biteAt[mySeat] !== 0;
      const biting = casted && now >= s.biteAt[mySeat];

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const wpx = cv.clientWidth || 280;
      const hpx = 150;
      if (cv.width !== Math.round(wpx * dpr)) {
        cv.width = Math.round(wpx * dpr);
        cv.height = Math.round(hpx * dpr);
        cv.style.height = hpx + 'px';
      }
      const c = cv.getContext('2d');
      if (c) {
        const k = cv.width / 100;
        c.setTransform(k, 0, 0, k, 0, 0);
        const hh = cv.height / k;
        const grad = c.createLinearGradient(0, 0, 0, hh);
        grad.addColorStop(0, '#0c4a6e');
        grad.addColorStop(1, '#082f49');
        c.fillStyle = grad;
        c.fillRect(0, 0, 100, hh);

        /* 물결 — 입질이 오면 크게 흔들린다 */
        const amp = biting ? 2.2 : 0.7;
        c.strokeStyle = 'rgba(255,255,255,.25)';
        c.lineWidth = 0.5;
        for (let row = 0; row < 3; row++) {
          c.beginPath();
          for (let x = 0; x <= 100; x += 2) {
            const y = 22 + row * 9 + Math.sin((x + now / (biting ? 60 : 200) + row * 30) / 7) * amp;
            if (x === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }

        /* 찌 — 물면 쑥 들어간다 */
        if (casted) {
          const bob = biting ? 12 + Math.sin(now / 40) * 2 : 16 + Math.sin(now / 300);
          c.fillStyle = biting ? '#ef4444' : '#f8fafc';
          c.beginPath();
          c.arc(50, bob, biting ? 3.2 : 2.2, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = 'rgba(255,255,255,.5)';
          c.lineWidth = 0.3;
          c.beginPath();
          c.moveTo(50, 0);
          c.lineTo(50, bob);
          c.stroke();
        }
      }

      const done = (s.left[mySeat] ?? 0) <= 0;
      go.textContent = done
        ? t('arcade.fish.done')
        : casted
          ? t('arcade.fish.pull')
          : t('arcade.fish.cast', { n: String(s.left[mySeat] ?? 0) });
      go.disabled = done || v.finished;
      go.onclick = () => act({ kind: casted ? 'pull' : 'cast' });
      go.className = 'btn ac-fibtn ' + (biting ? 'btn-primary ac-bite' : 'btn-primary');

      const mine = s.caught[mySeat] ?? [];
      bag.innerHTML = mine.length
        ? mine.map((f) => '<span>' + (names[f.kind % names.length] ?? '?') + ' <b>' + f.size + '</b></span>').join('')
        : '<small>' + (s.last[mySeat] === -1 ? t('arcade.fish.missed') : t('arcade.fish.empty')) + '</small>';

      who.innerHTML = v.seats
        .map((seat, i) => {
          const sum = (s.caught[i] ?? []).reduce((a, f) => a + f.size, 0);
          return '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' + seat.name + ' <b>' + sum + '</b></span>';
        })
        .join('');
    };
  }
};
