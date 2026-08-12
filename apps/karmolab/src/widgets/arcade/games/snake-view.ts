/**
 * 뱀 경주 화면 (TASK-KL-242)
 *
 * 폰에서는 **쓸어서** 방향을 바꾼다(십자 단추는 화면을 반이나 먹는다). 키보드도 받는다.
 * 방향은 누름이 아니라 상태라, 한 번 쓸면 바꿀 때까지 그대로 간다.
 */
import type { GameView } from '../views';
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
      c.fillStyle = '#0f172a';
      c.fillRect(0, 0, W, H);

      c.fillStyle = '#f59e0b';
      for (const f of s.food) {
        c.beginPath();
        c.arc((f % W) + 0.5, Math.floor(f / W) + 0.5, 0.34, 0, Math.PI * 2);
        c.fill();
      }

      s.snakes.forEach((sn, i) => {
        c.fillStyle = SEAT_COLOR[i % 4];
        c.globalAlpha = sn.alive ? 1 : 0.3;
        sn.body.forEach((cell, k2) => {
          const x = cell % W;
          const y = Math.floor(cell / W);
          const pad = k2 === 0 ? 0.02 : 0.12;
          c.fillRect(x + pad, y + pad, 1 - pad * 2, 1 - pad * 2);
        });
        if (i === mySeat && sn.alive) {
          c.globalAlpha = 1;
          c.strokeStyle = '#fff';
          c.lineWidth = 0.12;
          const head = sn.body[0];
          c.strokeRect((head % W) + 0.06, Math.floor(head / W) + 0.06, 0.88, 0.88);
        }
        c.globalAlpha = 1;
      });
    };
  }
};

declare const Toolbox: { onDispose?: (fn: () => void) => void } | undefined;
