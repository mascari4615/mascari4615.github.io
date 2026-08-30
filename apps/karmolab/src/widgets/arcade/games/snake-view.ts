/**
 * 뱀 경주 화면 (TASK-KL-242)
 *
 * 폰에서는 **쓸어서** 방향을 바꾼다(십자 단추는 화면을 반이나 먹는다). 키보드도 받는다.
 * 방향은 누름이 아니라 상태라, 한 번 쓸면 바꿀 때까지 그대로 간다.
 */
import type { GameView } from '../views';
import { orb, shade } from '../paint';
import { W, H, type SnakeState, type SnakeAction } from './snake';

const SEAT_COLOR = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];

export const snakeView: GameView<SnakeState, SnakeAction> = {
  id: 'snake',
  mount(el, act) {
    el.innerHTML = '<div class="ac-sn"><canvas id="acSnCv"></canvas></div>';
    const cv = el.querySelector('#acSnCv') as HTMLCanvasElement;

    let from: { x: number; y: number } | null = null;
    cv.addEventListener('pointerdown', (e) => {
      from = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointerup', (e) => {
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      from = null;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      act({ dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0 });
    });

    const onKey = (e: KeyboardEvent): void => {
      const map: Record<string, number> = {
        ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
        w: 0, d: 1, s: 2, a: 3
      };
      const d = map[e.key];
      if (d === undefined) return;
      e.preventDefault();
      act({ dir: d });
    };
    window.addEventListener('keydown', onKey);
    if (typeof Toolbox !== 'undefined') Toolbox.onDispose?.(() => window.removeEventListener('keydown', onKey));

    return (v, mySeat) => {
      const s = v.state;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.min(cv.clientWidth || 280, 340);
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = Math.round(size * dpr);
        cv.height = Math.round((size * H) / W * dpr);
        cv.style.height = Math.round((size * H) / W) + 'px';
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / W;
      c.setTransform(k, 0, 0, k, 0, 0);
      /* 바닥. 어두운 판에 옅은 모눈. 새까만 사각형 하나면 어디가 한 칸인지 안 보인다. */
      const floor = c.createLinearGradient(0, 0, W, H);
      floor.addColorStop(0, '#18202e');
      floor.addColorStop(1, '#0e141d');
      c.fillStyle = floor;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.045)';
      c.lineWidth = 0.03;
      for (let i = 1; i < W; i += 1) {
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i, H); c.stroke();
      }
      for (let i = 1; i < H; i += 1) {
        c.beginPath(); c.moveTo(0, i); c.lineTo(W, i); c.stroke();
      }

      /* 먹이 = 빛나는 알. 어두운 판에서 눈이 먼저 가야 하는 것. */
      for (const f of s.food) {
        const fx = (f % W) + 0.5;
        const fy = Math.floor(f / W) + 0.5;
        const halo = c.createRadialGradient(fx, fy, 0.05, fx, fy, 0.75);
        halo.addColorStop(0, 'rgba(255,196,80,.5)');
        halo.addColorStop(1, 'rgba(255,196,80,0)');
        c.fillStyle = halo;
        c.beginPath();
        c.arc(fx, fy, 0.75, 0, Math.PI * 2);
        c.fill();
        orb(c, fx, fy, 0.32, '#f0a91e', '#ffe89a', false);
      }

      s.snakes.forEach((sn, i) => {
        const col = SEAT_COLOR[i % 4];
        c.globalAlpha = sn.alive ? 1 : 0.3;
        /* 몸은 **꼬리로 갈수록 어두워진다**. 어디가 머리인지 한눈에 보인다. */
        sn.body.forEach((cell, k2) => {
          const x = cell % W;
          const y = Math.floor(cell / W);
          const far = Math.min(1, k2 / Math.max(6, sn.body.length));
          const pad = k2 === 0 ? 0.04 : 0.12;
          const r = k2 === 0 ? 0.34 : 0.24;
          c.fillStyle = shade(col, -0.12 - far * 0.35);
          c.beginPath();
          c.roundRect(x + pad, y + pad, 1 - pad * 2, 1 - pad * 2, r);
          c.fill();
        });
        /* 머리는 알로. 몸과 같은 색이되 빛을 받는다. */
        const head = sn.body[0];
        if (head !== undefined) orb(c, (head % W) + 0.5, Math.floor(head / W) + 0.5, 0.42, col, '#ffffff', false);
        if (i === mySeat && sn.alive) {
          c.globalAlpha = 1;
          c.strokeStyle = 'rgba(255,255,255,.9)';
          c.lineWidth = 0.09;
          c.beginPath();
          c.arc((head % W) + 0.5, Math.floor(head / W) + 0.5, 0.47, 0, Math.PI * 2);
          c.stroke();
        }
        c.globalAlpha = 1;
      });
    };
  }
};

declare const Toolbox: { onDispose?: (fn: () => void) => void } | undefined;
