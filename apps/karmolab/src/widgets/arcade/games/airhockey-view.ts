/**
 * 에어하키 화면 (TASK-KL-242)
 *
 * 손가락이 닿은 자리를 그대로 보낸다 — 이 놀이의 액션은 「눌렀다」가 아니라 **「여기 있다」**다.
 * 그래서 `pointermove` 를 그대로 흘려보내되, 소식이 너무 잦으면 그물망이 막히므로 프레임당 하나만.
 */
import type { GameView } from '../views';
import { W, H, PUCK_R, PADDLE_R, GOAL_W, type AirState, type AirAction } from './airhockey';

const SEAT_COLOR = ['#ef4444', '#3b82f6'];

export const airhockeyView: GameView<AirState, AirAction> = {
  id: 'airhockey',
  mount(el, act) {
    el.innerHTML = '<div class="ac-ah"><canvas id="acAhCv"></canvas></div>';
    const cv = el.querySelector('#acAhCv') as HTMLCanvasElement;

    /** 프레임당 하나만 보낸다 — 손가락은 1초에 수백 번 움직인다. */
    let pending: { x: number; y: number } | null = null;
    const toBoard = (e: PointerEvent): { x: number; y: number } => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    cv.addEventListener('pointermove', (e) => {
      pending = toBoard(e);
      e.preventDefault();
    });
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pending = toBoard(e);
    });

    return (v, mySeat) => {
      if (pending) {
        act(pending);
        pending = null;
      }
      const s = v.state;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = cv.clientWidth || 260;
      const ch = Math.round((cw * H) / W);
      if (cv.width !== Math.round(cw * dpr)) {
        cv.width = Math.round(cw * dpr);
        cv.height = Math.round(ch * dpr);
        cv.style.height = ch + 'px';
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / W;
      c.setTransform(k, 0, 0, k, 0, 0);

      c.fillStyle = '#0e7490';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.5)';
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, 12, 0, Math.PI * 2); c.stroke();

      /* 골대 */
      c.strokeStyle = '#fbbf24';
      c.lineWidth = 1.6;
      for (const y of [0.8, H - 0.8]) {
        c.beginPath();
        c.moveTo((W - GOAL_W) / 2, y);
        c.lineTo((W + GOAL_W) / 2, y);
        c.stroke();
      }

      s.paddles.forEach((p, i) => {
        c.beginPath();
        c.arc(p.x, p.y, PADDLE_R, 0, Math.PI * 2);
        c.fillStyle = SEAT_COLOR[i];
        c.fill();
        if (i === mySeat) {
          c.lineWidth = 1;
          c.strokeStyle = '#fff';
          c.stroke();
        }
      });

      c.beginPath();
      c.arc(s.puck.x, s.puck.y, PUCK_R, 0, Math.PI * 2);
      c.fillStyle = '#0f172a';
      c.fill();

      c.fillStyle = 'rgba(255,255,255,.9)';
      c.font = 'bold 9px sans-serif';
      c.fillText(String(s.score[1]), 3, 12);
      c.fillText(String(s.score[0]), 3, H - 5);
    };
  }
};
