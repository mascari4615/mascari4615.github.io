/**
 * 탱크 화면 (TASK-KL-242)
 *
 * **지난 탄착점을 남긴다** — 빗나간 자리를 보고 고쳐 쏘는 것이 이 놀이라, 안 남기면 매번
 * 감으로 다시 찍게 된다. 포신도 지금 고른 각도로 돌아가 있어 쏘기 전에 방향이 보인다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, type TanksState, type TanksAction } from './tanks';

const SEAT_COLOR = ['#ef4444', '#3b82f6'];

export const tanksView: GameView<TanksState, TanksAction> = {
  id: 'tanks',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-tk">' +
      '<canvas id="acTkCv"></canvas>' +
      '<div class="ac-clbar">' +
      '<label><span id="acTkAl"></span><input type="range" id="acTkA" min="5" max="85" value="45"></label>' +
      '<label><span id="acTkPl"></span><input type="range" id="acTkP" min="20" max="100" value="60"></label>' +
      '<button class="btn btn-primary" id="acTkGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acTkCv') as HTMLCanvasElement;
    const ang = el.querySelector('#acTkA') as HTMLInputElement;
    const pow = el.querySelector('#acTkP') as HTMLInputElement;
    const go = el.querySelector('#acTkGo') as HTMLButtonElement;
    go.onclick = () => act({ angle: Number(ang.value), power: Number(pow.value) / 100 });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.over && !s.shell && s.turn === mySeat;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const wpx = cv.clientWidth || 300;
      const hpx = Math.round((wpx * H) / W);
      if (cv.width !== Math.round(wpx * dpr)) {
        cv.width = Math.round(wpx * dpr);
        cv.height = Math.round(hpx * dpr);
        cv.style.height = hpx + 'px';
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / W;
      /* y 를 뒤집는다 — 규칙은 「위가 크다」로 쓰였고 화면은 반대다. */
      c.setTransform(k, 0, 0, -k, 0, cv.height);

      const sky = c.createLinearGradient(0, H, 0, 0);
      sky.addColorStop(0, '#1e293b');
      sky.addColorStop(1, '#0f172a');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);

      c.fillStyle = '#3f6212';
      c.beginPath();
      c.moveTo(0, 0);
      s.ground.forEach((g, x) => c.lineTo(x, g));
      c.lineTo(W, 0);
      c.closePath();
      c.fill();

      for (const m of s.marks) {
        c.fillStyle = 'rgba(250,250,250,.55)';
        c.beginPath();
        c.arc(m.x, Math.max(1, m.y), 1, 0, Math.PI * 2);
        c.fill();
      }

      s.tank.forEach((x, i) => {
        const g = s.ground[Math.round(x)] ?? 10;
        c.fillStyle = SEAT_COLOR[i];
        c.fillRect(x - 2.5, g, 5, 2.4);
        c.beginPath();
        c.arc(x, g + 2.6, 1.5, 0, Math.PI * 2);
        c.fill();
        /* 포신 — 내 차례면 지금 고른 각도로 */
        const a = (i === mySeat && myTurn ? Number(ang.value) : 45) * (Math.PI / 180);
        const dir = i === 0 ? 1 : -1;
        c.strokeStyle = SEAT_COLOR[i];
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(x, g + 2.6);
        c.lineTo(x + Math.cos(a) * 5 * dir, g + 2.6 + Math.sin(a) * 5);
        c.stroke();
      });

      if (s.shell) {
        c.fillStyle = '#fbbf24';
        c.beginPath();
        c.arc(s.shell.x, s.shell.y, 0.9, 0, Math.PI * 2);
        c.fill();
      }

      /* 남은 목숨 — 화면 위쪽에 */
      c.setTransform(k, 0, 0, k, 0, 0);
      c.fillStyle = '#f8fafc';
      c.font = 'bold 4px sans-serif';
      c.fillText('♥'.repeat(Math.max(0, s.hp[0])), 2, 6);
      const r = '♥'.repeat(Math.max(0, s.hp[1]));
      c.fillText(r, W - 2 - r.length * 3.4, 6);

      (el.querySelector('#acTkAl') as HTMLElement).textContent = t('arcade.tanks.angle');
      (el.querySelector('#acTkPl') as HTMLElement).textContent = t('arcade.tanks.power');
      go.textContent = s.shell ? t('arcade.tanks.flying') : t('arcade.tanks.fire');
      ang.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
