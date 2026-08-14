/**
 * 탁구 화면 (TASK-KL-242)
 *
 * 에어하키와 같은 손놀림(닿은 자리를 보낸다)인데 **x 하나만** 쓴다.
 * 내 라켓이 늘 아래로 오게 그린다 — 남의 라켓이 앞에 있으면 방향이 뒤집혀 헷갈린다.
 */
import type { GameView } from '../views';
import { W, H, PAD, type PongState, type PongAction } from './pong';

const SEAT_COLOR = ['#ef4444', '#3b82f6'];

export const pongView: GameView<PongState, PongAction> = {
  id: 'pong',
  mount(el, act) {
    el.innerHTML = '<div class="ac-pg"><canvas id="acPgCv"></canvas></div>';
    const cv = el.querySelector('#acPgCv') as HTMLCanvasElement;

    let pending: number | null = null;
    const toX = (e: PointerEvent): number => {
      const r = cv.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * W;
    };
    cv.addEventListener('pointermove', (e) => {
      pending = toX(e);
      e.preventDefault();
    });
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pending = toX(e);
    });

    /* ── 키로도 친다 (TASK-KL-317) ────────────────────────────────
       마우스는 *어디에 있나*를 그대로 주지만 키는 *어느 쪽으로*밖에 못 준다. 그래서
       **여기서** 속도를 위치로 바꾼다 — 규칙(커널)은 지금처럼 위치만 받는다.
       속도는 px 이 아니라 **판 너비의 비율**로 잡는다: 한 변을 1.1초에 건넌다.
       폰이든 와이드든 같은 놀이여야 하기 때문이다. */
    const CROSS_S = 1.1;
    const held = new Set<string>();
    let pad: number | null = null;
    let last = 0;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (e.type === 'keydown') held.add(e.key);
      else held.delete(e.key);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    if (typeof Toolbox !== 'undefined') {
      Toolbox.onDispose?.(() => {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
      });
    }
    /** 눌린 키를 라켓 자리로 옮긴다. 마우스를 쓰면 그쪽이 이긴다(둘 다 산다). */
    const fromKeys = (now: number, mine: number): void => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const dir = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
      if (!dir) { pad = null; return; }
      /* 키를 처음 누른 순간에는 **지금 라켓이 있는 자리**에서 출발한다 — 안 그러면 순간이동한다. */
      if (pad === null) pad = mine;
      pad = Math.max(0, Math.min(W, pad + (dir * W * dt) / CROSS_S));
      pending = pad;
    };

    return (v, mySeat) => {
      fromKeys(performance.now(), v.state.pad[mySeat] ?? W / 2);
      if (pending !== null) {
        act({ x: pending });
        pending = null;
      }
      const s = v.state;
      /* 내가 자리1이면 판을 뒤집어 그린다 — 내 라켓이 늘 아래다. */
      const flip = mySeat === 1;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const wpx = cv.clientWidth || 260;
      const hpx = Math.round((wpx * H) / W);
      if (cv.width !== Math.round(wpx * dpr)) {
        cv.width = Math.round(wpx * dpr);
        cv.height = Math.round(hpx * dpr);
        cv.style.height = hpx + 'px';
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / W;
      c.setTransform(k, 0, 0, k, 0, 0);
      c.fillStyle = '#0f172a';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.25)';
      c.setLineDash([2, 3]);
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, H / 2);
      c.lineTo(W, H / 2);
      c.stroke();
      c.setLineDash([]);

      const fy = (y: number): number => (flip ? H - y : y);

      [0, 1].forEach((i) => {
        const y = i === 0 ? H - 4 : 4;
        c.fillStyle = SEAT_COLOR[i];
        c.fillRect(s.pad[i] - PAD / 2, fy(y) - 1, PAD, 2);
      });

      c.fillStyle = '#f8fafc';
      c.beginPath();
      c.arc(s.ball.x, fy(s.ball.y), 1.6, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = 'rgba(255,255,255,.9)';
      c.font = 'bold 7px sans-serif';
      c.fillText(String(s.score[mySeat]), 3, H - 8);
      c.fillText(String(s.score[1 - mySeat]), 3, 12);
    };
  }
};
