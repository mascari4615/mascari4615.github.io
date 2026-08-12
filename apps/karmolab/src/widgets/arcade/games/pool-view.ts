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
      '<canvas id="acPlCv"></canvas>' +
      '<div class="ac-clbar">' +
      '<label><span id="acPlAimL"></span><input type="range" id="acPlAim" min="-180" max="180" value="0"></label>' +
      '<label><span id="acPlPowL"></span><input type="range" id="acPlPow" min="15" max="100" value="60"></label>' +
      '<button class="btn btn-primary" id="acPlGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acPlCv') as HTMLCanvasElement;
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

      c.fillStyle = '#166534';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#78350f';
      c.lineWidth = 2;
      c.strokeRect(1, 1, W - 2, H - 2);

      for (const [px, py] of POCKETS) {
        c.beginPath();
        c.arc(px, py, 5.4, 0, Math.PI * 2);
        c.fillStyle = '#0b1220';
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
        c.beginPath();
        c.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        c.fillStyle = b.cue ? '#f8fafc' : '#fbbf24';
        c.fill();
        c.lineWidth = 0.5;
        c.strokeStyle = 'rgba(0,0,0,.5)';
        c.stroke();
      }

      /* 넣은 수 — 화면 위에 작게 */
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.font = '6px sans-serif';
      v.seats.forEach((seat, i) => {
        c.fillStyle = SEAT_COLOR[i % 4];
        c.fillText(`${seat.name} ${s.potted[i] ?? 0}`, 4, 8 + i * 7);
      });

      el.querySelector('#acPlAimL')!.textContent = t('arcade.pool.aim');
      el.querySelector('#acPlPowL')!.textContent = t('arcade.pool.power');
      go.textContent = s.moving ? t('arcade.pool.rolling') : t('arcade.pool.hit');
      aim.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
