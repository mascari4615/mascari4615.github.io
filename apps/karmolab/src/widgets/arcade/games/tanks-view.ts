/**
 * 탱크 화면 (TASK-KL-242)
 *
 * **지난 탄착점을 남긴다**. 빗나간 자리를 보고 고쳐 쏘는 것이 이 놀이라, 안 남기면 매번
 * 감으로 다시 찍게 된다. 포신도 지금 고른 각도로 돌아가 있어 쏘기 전에 방향이 보인다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { shade, SEAT_COLOR } from '../paint';
import { W, H, type TanksState, type TanksAction } from './tanks';


export const tanksView: GameView<TanksState, TanksAction> = {
  id: 'tanks',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-tk">' +
      '<div class="ac-plscore" id="acTkHp"></div>' +
      '<canvas id="acTkCv"></canvas>' +
      '<div class="ac-clbar">' +
      '<label><span id="acTkAl"></span><input type="range" id="acTkA" min="5" max="85" value="45"></label>' +
      '<label><span id="acTkPl"></span><input type="range" id="acTkP" min="20" max="100" value="60"></label>' +
      '<button class="btn btn-primary" id="acTkGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acTkCv') as HTMLCanvasElement;
    const hpEl = el.querySelector('#acTkHp') as HTMLElement;
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
      /* y 를 뒤집는다. 규칙은 위가 크다로 쓰였고 화면은 반대다. */
      c.setTransform(k, 0, 0, -k, 0, cv.height);

      /* 하늘. 지평선이 밝고 위가 어둡다. 한 색이면 배경이 아니라 벽이 된다. */
      const sky = c.createLinearGradient(0, H, 0, 0);
      sky.addColorStop(0, '#2b3b52');
      sky.addColorStop(0.45, '#1d2a3c');
      sky.addColorStop(1, '#101825');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);
      /* 해질녘 기운. 지평선 근처만 옅게 덥힌다. */
      const glow = c.createLinearGradient(0, 0, 0, H * 0.42);
      glow.addColorStop(0, 'rgba(255,176,92,.22)');
      glow.addColorStop(1, 'rgba(255,176,92,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H * 0.42);

      /* 땅. 겉흙이 밝고 속이 어둡다(단면). 평평한 초록 하나면 색종이다. */
      const soil = c.createLinearGradient(0, H * 0.4, 0, 0);
      soil.addColorStop(0, '#4e7a24');
      soil.addColorStop(0.22, '#3d5f1c');
      soil.addColorStop(1, '#2a3d16');
      c.fillStyle = soil;
      c.beginPath();
      c.moveTo(0, 0);
      s.ground.forEach((g, x) => c.lineTo(x, g));
      c.lineTo(W, 0);
      c.closePath();
      c.fill();
      /* 풀. 땅 윤곽선 위에만 밝은 실선 한 줄. */
      c.strokeStyle = 'rgba(150,205,90,.8)';
      c.lineWidth = 0.5;
      c.beginPath();
      s.ground.forEach((g, x) => (x ? c.lineTo(x, g) : c.moveTo(x, g)));
      c.stroke();

      for (const m of s.marks) {
        c.fillStyle = 'rgba(250,250,250,.55)';
        c.beginPath();
        c.arc(m.x, Math.max(1, m.y), 1, 0, Math.PI * 2);
        c.fill();
      }

      s.tank.forEach((x, i) => {
        const g = s.ground[Math.round(x)] ?? 10;
        /* 몸통은 위가 밝다. 빛이 위에서 온다. 포탑은 둥근 알(`orb`)로 같은 규칙. */
        const hull = c.createLinearGradient(0, g, 0, g + 2.4);
        hull.addColorStop(0, shade(SEAT_COLOR[i], -0.35));
        hull.addColorStop(1, shade(SEAT_COLOR[i], 0.15));
        c.fillStyle = hull;
        c.fillRect(x - 2.5, g, 5, 2.4);
        /* 궤도. 아래쪽에 어두운 띠 하나면 굴러가는 것으로 읽힌다. */
        c.fillStyle = 'rgba(0,0,0,.45)';
        c.fillRect(x - 2.5, g, 5, 0.7);
        c.beginPath();
        c.arc(x, g + 2.6, 1.5, 0, Math.PI * 2);
        c.fillStyle = SEAT_COLOR[i];
        c.fill();
        /* 포신. 내 차례면 지금 고른 각도로 */
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
        /* 포탄. 불붙은 알. 뒤에 옅은 꼬리를 남겨 어디로 가는지 보인다. */
        const t = c.createRadialGradient(s.shell.x, s.shell.y, 0.2, s.shell.x, s.shell.y, 2.4);
        t.addColorStop(0, 'rgba(255,214,120,.65)');
        t.addColorStop(1, 'rgba(255,160,60,0)');
        c.fillStyle = t;
        c.beginPath();
        c.arc(s.shell.x, s.shell.y, 2.4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffe27a';
        c.beginPath();
        c.arc(s.shell.x, s.shell.y, 0.9, 0, Math.PI * 2);
        c.fill();
      }

      /* 남은 목숨은 판 밖 알약으로. 캔버스 안 4px 글자는 무대가 커져도 안 커진다. */
      c.setTransform(k, 0, 0, k, 0, 0);
      hpEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-plc' + (i === mySeat ? ' ac-me' : '') + '" style="--c:' + SEAT_COLOR[i] + '">' +
          seat.name + ' <b>' + '♥'.repeat(Math.max(0, s.hp[i] ?? 0)) + '</b></span>')
        .join('');

      (el.querySelector('#acTkAl') as HTMLElement).textContent = t('arcade.tanks.angle');
      (el.querySelector('#acTkPl') as HTMLElement).textContent = t('arcade.tanks.power');
      go.textContent = s.shell ? t('arcade.tanks.flying') : t('arcade.tanks.fire');
      ang.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
