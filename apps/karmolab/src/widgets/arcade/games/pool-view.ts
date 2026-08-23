/**
 * 당구 화면 (TASK-KL-242)
 *
 * 위에서 내려다본다 — 당구는 **각도를 재는 놀이**라 비스듬히 보면 각이 안 읽힌다.
 * 겨눔은 흰 공에서 뻗는 점선. 세기는 막대로 따로 받는다(끌기 하나로 둘 다 받으면 폰에서 어긋난다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, BALL_R, POCKETS, type PoolState, type PoolAction } from './pool';

const SEAT_COLOR = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];

export const poolView: GameView<PoolState, PoolAction> = {
  id: 'pool',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-pl">' +
      '<div class="ac-plscore" id="acPlScore"></div>' +
      '<canvas id="acPlCv"></canvas>' +
      '<div class="ac-clbar">' +
      '<label><span id="acPlAimL"></span><input type="range" id="acPlAim" min="-180" max="180" value="0"></label>' +
      '<label><span id="acPlPowL"></span><input type="range" id="acPlPow" min="15" max="100" value="60"></label>' +
      '<button class="btn btn-primary" id="acPlGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acPlCv') as HTMLCanvasElement;
    const scoreEl = el.querySelector('#acPlScore') as HTMLElement;
    const aim = el.querySelector('#acPlAim') as HTMLInputElement;
    const pow = el.querySelector('#acPlPow') as HTMLInputElement;
    const go = el.querySelector('#acPlGo') as HTMLButtonElement;
    go.onclick = () => act({ aim: (Number(aim.value) / 180) * Math.PI, power: Number(pow.value) / 100 });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && !s.moving && s.turn === mySeat;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = cv.clientWidth || 300;
      const ch = Math.round((cw * H) / W);
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
        cv.width = Math.round(cw * dpr);
        cv.height = Math.round(ch * dpr);
        cv.style.height = ch + 'px';
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / W;
      c.setTransform(k, 0, 0, k, 0, 0);

      /* 천 — 가운데가 밝고 가장자리가 어두운 한 겹. 평평한 초록 하나로 칠하면 판이 종이가 된다. */
      const felt = c.createRadialGradient(W / 2, H * 0.34, 2, W / 2, H / 2, H * 0.72);
      felt.addColorStop(0, '#1c7d5c');
      felt.addColorStop(0.55, '#146349');
      felt.addColorStop(1, '#0d4633');
      c.fillStyle = felt;
      c.fillRect(0, 0, W, H);

      /* 나무 쿠션 — 안쪽에 밝은 선을 하나 더 그어 두께를 만든다. */
      const rail = c.createLinearGradient(0, 0, 0, H);
      rail.addColorStop(0, '#7d5216');
      rail.addColorStop(1, '#4a2f0d');
      c.strokeStyle = rail;
      c.lineWidth = 3.4;
      c.strokeRect(1.7, 1.7, W - 3.4, H - 3.4);
      c.strokeStyle = 'rgba(255,214,150,.28)';
      c.lineWidth = 0.5;
      c.strokeRect(3.6, 3.6, W - 7.2, H - 7.2);

      for (const [px, py] of POCKETS) {
        /* 구멍은 **파인 것**이다 — 안쪽이 새까맣고 가장자리에만 빛이 걸린다. */
        const hole = c.createRadialGradient(px, py - 1, 0.4, px, py, 5.4);
        hole.addColorStop(0, '#000000');
        hole.addColorStop(0.75, '#070a10');
        hole.addColorStop(1, '#2a1e10');
        c.beginPath();
        c.arc(px, py, 5.4, 0, Math.PI * 2);
        c.fillStyle = hole;
        c.fill();
      }

      const cue = s.balls.find((b) => b.cue && !b.in);
      if (myTurn && cue) {
        const a = (Number(aim.value) / 180) * Math.PI;
        const len = 18 + (Number(pow.value) / 100) * 46;
        c.strokeStyle = 'rgba(255,255,255,.75)';
        c.lineWidth = 0.7;
        c.setLineDash([2.5, 2.5]);
        c.beginPath();
        c.moveTo(cue.x, cue.y);
        c.lineTo(cue.x + Math.sin(a) * len, cue.y - Math.cos(a) * len);
        c.stroke();
        c.setLineDash([]);
      }

      for (const b of s.balls) {
        if (b.in) continue;
        /* 공은 **구슬**이다: 바닥 그림자 · 좌상단에서 오는 빛 · 위쪽 하이라이트 한 점.
           평평한 원으로 칠하면 판 위에 스티커를 붙인 그림이 된다. */
        c.beginPath();
        c.ellipse(b.x + BALL_R * 0.25, b.y + BALL_R * 0.4, BALL_R * 0.95, BALL_R * 0.62, 0, 0, Math.PI * 2);
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.fill();

        const dark = b.cue ? '#b9b3a6' : '#8a5c05';
        const mid = b.cue ? '#f4efe4' : '#f0b429';
        const lit = b.cue ? '#ffffff' : '#ffe680';
        const g = c.createRadialGradient(
          b.x - BALL_R * 0.34, b.y - BALL_R * 0.38, BALL_R * 0.12,
          b.x, b.y, BALL_R
        );
        g.addColorStop(0, lit);
        g.addColorStop(0.45, mid);
        g.addColorStop(1, dark);
        c.beginPath();
        c.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        c.fillStyle = g;
        c.fill();

        c.beginPath();
        c.ellipse(b.x - BALL_R * 0.32, b.y - BALL_R * 0.42, BALL_R * 0.26, BALL_R * 0.17, -0.5, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,.72)';
        c.fill();
      }

      /* 넣은 수는 **판 밖**에 적는다 — 캔버스 안에 글자를 그리면 판마다 제 글꼴·제 크기가 되고
         (여기선 6px sans-serif 였다) 무대가 커져도 안 따라 커진다. 판 위는 공만 있는 자리다. */
      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-plc' + (i === mySeat ? ' ac-me' : '') + '" style="--c:' + SEAT_COLOR[i % 4] + '">' +
          seat.name + ' <b>' + (s.potted[i] ?? 0) + '</b></span>')
        .join('');

      el.querySelector('#acPlAimL')!.textContent = t('arcade.pool.aim');
      el.querySelector('#acPlPowL')!.textContent = t('arcade.pool.power');
      go.textContent = s.moving ? t('arcade.pool.rolling') : t('arcade.pool.hit');
      aim.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
