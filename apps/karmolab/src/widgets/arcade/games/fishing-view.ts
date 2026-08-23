/**
 * 낚시 화면 (TASK-KL-242)
 *
 * 입질은 **글자가 아니라 움직임**으로 알린다 — 「지금!」이라고 써 두면 읽는 데 시간이 걸려
 * 창을 놓친다. 찌가 확 들어가고 물결이 커지는 것으로 충분하다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { orb } from '../paint';
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
      /* 물은 **깊어야** 물로 보인다 — 150px 고정이면 넓은 화면에서 띠 한 줄이 된다. */
      const hpx = Math.round(Math.min(300, Math.max(150, wpx * 0.5)));
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
        /* 수면 — 물 위와 물 밑을 **가르는 선**이 있어야 찌가 어디 떠 있는지 읽힌다.
           한 색으로 칠하면 파란 사각형에 흰 줄이 그어진 그림이 된다. */
        const SURF = hh * 0.2;
        const sky = c.createLinearGradient(0, 0, 0, SURF);
        sky.addColorStop(0, '#1a2b3d');
        sky.addColorStop(1, '#2d4a63');
        c.fillStyle = sky;
        c.fillRect(0, 0, 100, SURF);

        const deep = c.createLinearGradient(0, SURF, 0, hh);
        deep.addColorStop(0, '#12617f');
        deep.addColorStop(0.4, '#0b4361');
        deep.addColorStop(1, '#04202f');
        c.fillStyle = deep;
        c.fillRect(0, SURF, 100, hh - SURF);

        /* 물속 빛기둥 — 수면에서 비스듬히 내려오는 옅은 띠. 깊이가 보인다. */
        for (let i = 0; i < 3; i++) {
          const x0 = 18 + i * 32;
          const beam = c.createLinearGradient(x0, SURF, x0 + 14, hh);
          beam.addColorStop(0, 'rgba(190,235,255,.14)');
          beam.addColorStop(1, 'rgba(190,235,255,0)');
          c.fillStyle = beam;
          c.beginPath();
          c.moveTo(x0 - 4, SURF); c.lineTo(x0 + 4, SURF);
          c.lineTo(x0 + 20, hh); c.lineTo(x0 + 4, hh);
          c.closePath();
          c.fill();
        }

        /* 물결 — 입질이 오면 크게 흔들린다. 수면 줄이 가장 또렷하다. */
        const amp = biting ? 2.2 : 0.7;
        for (let row = 0; row < 3; row++) {
          c.strokeStyle = row === 0 ? 'rgba(215,240,255,.72)' : 'rgba(255,255,255,.16)';
          c.lineWidth = row === 0 ? 0.7 : 0.45;
          c.beginPath();
          for (let x = 0; x <= 100; x += 2) {
            const y = SURF + row * 9 + Math.sin((x + now / (biting ? 60 : 200) + row * 30) / 7) * amp;
            if (x === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }

        /* 찌 — 물면 쑥 들어간다. 잠긴 만큼 물결이 퍼진다. */
        if (casted) {
          const bob = SURF - 6 + (biting ? 6 + Math.sin(now / 40) * 2 : 10 + Math.sin(now / 300));
          c.strokeStyle = 'rgba(255,255,255,.45)';
          c.lineWidth = 0.3;
          c.beginPath();
          c.moveTo(50, 0);
          c.lineTo(50, bob);
          c.stroke();
          const ring = biting ? 5 + ((now / 90) % 6) : 3.4;
          c.strokeStyle = 'rgba(215,240,255,' + (biting ? 0.5 : 0.22) + ')';
          c.lineWidth = 0.5;
          c.beginPath();
          c.ellipse(50, bob + 1, ring, ring * 0.34, 0, 0, Math.PI * 2);
          c.stroke();
          orb(c, 50, bob, biting ? 3.2 : 2.4, biting ? '#e23a3a' : '#f3f6fa', '#ffffff', false);
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
