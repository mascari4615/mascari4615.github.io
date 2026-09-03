/**
 * 낚시 화면 (TASK-KL-242)
 *
 * 입질은 **글자가 아니라 움직임**으로 알린다. 지금!이라고 써 두면 읽는 데 시간이 걸려
 * 창을 놓친다. 찌가 확 들어가고 물결이 커지는 것으로 충분하다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { blip } from '../../../lib/blip';
import { orb } from '../paint';
import { BAR_H, NIBBLE_MS, type FishState, type FishAction } from './fishing';

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

    /* 긴장 단계는 누르고 있는 동안 당김. 판 위와 버튼 어디서든 */
    let holding = false;
    const setHold = (on: boolean): void => {
      if (holding === on) return;
      holding = on;
      act({ kind: 'hold', on });
    };
    let fightNow = false;
    const down = (ev: PointerEvent): void => { if (fightNow) { setHold(true); ev.preventDefault(); } };
    const up = (): void => { if (holding) setHold(false); };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', up);
    go.addEventListener('pointerdown', down);
    go.addEventListener('pointerup', up);
    go.addEventListener('pointercancel', up);
    go.addEventListener('pointerleave', up);
    let sawLast = 0;

    const names = (() => {
      const raw = t('arcade.fish.kinds');
      return raw && raw !== 'arcade.fish.kinds' ? raw.split(',').map((x) => x.trim()) : ['물고기'];
    })();

    return (v, mySeat, now) => {
      const s = v.state;
      const casted = s.biteAt[mySeat] !== 0;
      const fight = s.fight[mySeat];
      fightNow = !!fight;
      /* 입질 시각은 커널 시계(`v.now`)로 잰다. 그림용 `now` 는 벽시계라 비교하면 입질이 엉뚱한 때에 뜸 (2026-09-03 실측: 물기 전에 버튼이 붉어짐) */
      const kt = v.now;
      const biting = casted && !fight && kt >= s.biteAt[mySeat];
      /* 헛입질. 찌가 0.3초 살짝 잠긴다. 진짜 입질 0.8초 전에는 물결이 찌 쪽으로 모임 */
      const nibbling = casted && !fight && (s.nibbleAt[mySeat] ?? []).some((a) => kt >= a && kt < a + NIBBLE_MS);
      const warning = casted && !fight && !biting && s.biteAt[mySeat] - kt < 800;
      /* 소리. 결과가 바뀐 순간 한 번 */
      const lastNow = s.last[mySeat] * 1000 + s.left[mySeat];
      if (lastNow !== sawLast) {
        sawLast = lastNow;
        if (s.last[mySeat] > 0) blip('good');
        else if (s.last[mySeat] < 0) blip('bad');
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const wpx = cv.clientWidth || 280;
      /* 물은 **깊어야** 물로 보인다. 칸이 높이를 주면(전체 화면) 그만큼, 아니면 폭의 절반 */
      const hpx = cv.clientHeight || Math.round(Math.min(300, Math.max(150, wpx * 0.5)));
      if (cv.width !== Math.round(wpx * dpr) || cv.height !== Math.round(hpx * dpr)) {
        cv.width = Math.round(wpx * dpr);
        cv.height = Math.round(hpx * dpr);
      }
      const c = cv.getContext('2d');
      if (c) {
        const k = cv.width / 100;
        c.setTransform(k, 0, 0, k, 0, 0);
        const hh = cv.height / k;
        /* 수면. 물 위와 물 밑을 **가르는 선**이 있어야 찌가 어디 떠 있는지 읽힌다.
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

        /* 물속 빛기둥. 수면에서 비스듬히 내려오는 옅은 띠. 깊이가 보인다. */
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

        /* 물결. 입질이 오면 크게 흔들린다. 수면 줄이 가장 또렷하다. */
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

        /* 찌. 물면 쑥 들어간다. 헛입질이면 살짝, 잠긴 만큼 물결이 퍼진다. */
        if (casted && !fight) {
          const bob = SURF - 6 + (biting ? 6 + Math.sin(now / 40) * 2 : nibbling ? 8 + Math.sin(now / 60) : 10 + Math.sin(now / 300));
          if (warning) {
            /* 예고. 찌 쪽으로 모이는 물결 */
            c.strokeStyle = 'rgba(215,240,255,.35)';
            c.lineWidth = 0.4;
            for (let k = 0; k < 3; k += 1) {
              const r = 14 - ((now / 120 + k * 4) % 12);
              c.beginPath();
              c.ellipse(50, bob + 1, r, r * 0.34, 0, 0, Math.PI * 2);
              c.stroke();
            }
          }
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

        /* 긴장 단계. 오른쪽 세로 트랙에 바(초록)와 물고기, 왼쪽에 진행도 */
        if (fight) {
          const top = SURF + 4;
          const bottom = hh - 4;
          const span = bottom - top;
          const tx = 86;
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.fillRect(tx - 4, top, 8, span);
          const barY = bottom - (fight.bar + BAR_H) * span;
          c.fillStyle = fight.perfect ? 'rgba(120,230,140,.85)' : 'rgba(120,200,255,.8)';
          c.fillRect(tx - 4, barY, 8, BAR_H * span);
          const fy = bottom - fight.fish * span;
          orb(c, tx, fy, 2.6, '#f2b33a', '#ffffff', false);
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.fillRect(tx + 7, top, 3, span);
          c.fillStyle = fight.prog > 0.5 ? '#7ee787' : '#ffb454';
          c.fillRect(tx + 7, bottom - fight.prog * span, 3, fight.prog * span);
        }
      }

      const done = (s.left[mySeat] ?? 0) <= 0;
      go.textContent = done
        ? t('arcade.fish.done')
        : fight
          ? t('arcade.fish.hold')
          : casted
            ? t('arcade.fish.pull')
            : t('arcade.fish.cast', { n: String(s.left[mySeat] ?? 0) });
      go.disabled = done || v.finished;
      go.onclick = () => { if (!fight) act({ kind: casted ? 'pull' : 'cast' }); };
      go.className = 'btn ac-fibtn ' + (biting ? 'btn-primary ac-bite' : 'btn-primary');

      const mine = s.caught[mySeat] ?? [];
      bag.innerHTML = mine.length
        ? mine.map((f) => '<span>' + (names[f.kind % names.length] ?? '?') + ' <b>' + f.size + '</b></span>').join('') +
          (s.last[mySeat] === 2 ? ' <small class="ac-fiperfect">' + t('arcade.fish.perfect') + '</small>' : '')
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
