/**
 * 컬링 화면 (TASK-KL-242)
 *
 * **위에서 내려다본다.** 이 놀이의 전부가 「가운데에서 얼마나 먼가」라서, 비스듬한 3D 로 그리면
 * 거리가 눈으로 안 재진다 — 보기 좋으라고 읽기 어렵게 만들면 손해다.
 * (3D 가 값진 자리는 핀이 서 있는 볼링·당구 쪽이다. 그때 따로 만든다.)
 *
 * 겨눔은 **한 번에 하나씩**: 좌우를 정하고, 세기를 정하고, 던진다. 끌기 한 번으로 둘 다 받으면
 * 폰에서 손가락이 미끄러지는 순간 엉뚱한 데로 간다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, TEE, HOUSE_R, R, type CurlingState, type CurlingAction } from './curling';

const SEAT_COLOR = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];

export const curlingView: GameView<CurlingState, CurlingAction> = {
  id: 'curling',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-cl">' +
      '<canvas id="acClCv"></canvas>' +
      '<div class="ac-clbar">' +
      '<label><span id="acClAimL"></span><input type="range" id="acClAim" min="-35" max="35" value="0"></label>' +
      '<label><span id="acClPowL"></span><input type="range" id="acClPow" min="20" max="100" value="55"></label>' +
      '<button class="btn btn-primary" id="acClGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acClCv') as HTMLCanvasElement;
    const aim = el.querySelector('#acClAim') as HTMLInputElement;
    const pow = el.querySelector('#acClPow') as HTMLInputElement;
    const go = el.querySelector('#acClGo') as HTMLButtonElement;
    const aimL = el.querySelector('#acClAimL') as HTMLElement;
    const powL = el.querySelector('#acClPowL') as HTMLElement;
    go.onclick = () => act({ aim: Number(aim.value) / 100, power: Number(pow.value) / 100 });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.done && !s.moving && s.turn === mySeat && (s.left[mySeat] ?? 0) > 0;

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
      c.clearRect(0, 0, W, H);

      /* 얼음 */
      c.fillStyle = '#eef4fb';
      c.fillRect(0, 0, W, H);

      /* 하우스 — 바깥부터 안쪽으로 */
      const rings: Array<[number, string]> = [
        [HOUSE_R, '#93c5fd'], [HOUSE_R * 0.66, '#f8fafc'], [HOUSE_R * 0.34, '#fca5a5'], [1.6, '#f8fafc']
      ];
      for (const [rr, col] of rings) {
        c.beginPath();
        c.arc(TEE[0], TEE[1], rr, 0, Math.PI * 2);
        c.fillStyle = col;
        c.fill();
      }

      /* 던지는 자리 */
      c.strokeStyle = '#cbd5e1';
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(0, H - 12);
      c.lineTo(W, H - 12);
      c.stroke();

      /* 겨눔 선 — 내 차례일 때만 */
      if (myTurn) {
        const a = (Number(aim.value) / 100) * 1;
        const len = 26 + (Number(pow.value) / 100) * 40;
        c.strokeStyle = '#0ea5e9';
        c.lineWidth = 1;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.moveTo(W / 2, H - 12);
        c.lineTo(W / 2 + Math.sin(a) * len, H - 12 - Math.cos(a) * len);
        c.stroke();
        c.setLineDash([]);
      }

      for (const st of s.stones) {
        c.beginPath();
        c.arc(st.x, st.y, R, 0, Math.PI * 2);
        c.fillStyle = SEAT_COLOR[st.seat % SEAT_COLOR.length];
        c.fill();
        c.lineWidth = 0.8;
        c.strokeStyle = 'rgba(15,23,42,.55)';
        c.stroke();
        /* 손잡이 — 어느 쪽 돌인지 겹쳐도 보이게 */
        c.beginPath();
        c.arc(st.x, st.y, R * 0.38, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,.85)';
        c.fill();
      }

      aimL.textContent = t('arcade.curling.aim');
      powL.textContent = t('arcade.curling.power');
      go.textContent = s.moving
        ? t('arcade.curling.sliding')
        : t('arcade.curling.throw', { n: String(s.left[mySeat] ?? 0) });
      aim.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
