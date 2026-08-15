/**
 * 탁구 화면 (TASK-KL-242)
 *
 * 에어하키와 같은 손놀림(닿은 자리를 보낸다)인데 **x 하나만** 쓴다.
 * 내 라켓이 늘 아래로 오게 그린다 — 남의 라켓이 앞에 있으면 방향이 뒤집혀 헷갈린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, PAD, type PongState, type PongAction } from './pong';
import { keyDrive } from '../key-drive';

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

    /* 자판 길 — **누른 시간만큼** 민다 (TASK-KL-317, 2026-08-15).
     * 전에는 keydown 한 번에 한 칸씩(W/24) 옮겼고, 그마저 판(canvas)에서 듣고 있어서
     * **초점이 판에 안 와 한 번도 안 먹었다**(실측: 화살표를 눌러도 40.0 에서 안 움직였다).
     * 이제 창에서 듣고, 라켓 자리를 화면이 들고 있다가 매 프레임 시간만큼 민다.
     * 보내는 통로는 마우스와 같은 `pending` — 서버로 가는 길이 갈리면 안 된다. */
    let padX = W / 2;
    const drive = keyDrive(W);
    cv.tabIndex = 0;
    cv.setAttribute('role', 'application');
    cv.setAttribute('aria-label', t('arcade.pong.kb'));

    return (v, mySeat) => {
      // 키를 누르고 있으면 시간만큼 민다. 마우스가 방금 자리를 줬으면 그쪽이 이긴다(둘 다 산다).
      const key = drive.step();
      if (key.held && pending === null) {
        padX = Math.max(0, Math.min(W, padX + key.dx));
        pending = padX;
      }
      if (pending !== null) {
        act({ x: pending });
        pending = null;
      }
      const s = v.state;
      /* 마우스로 옮겼거나 서버가 되돌렸으면 자판 자리도 거기에 맞춘다(둘이 어긋나면 튄다).
         단 **키를 누르고 있는 동안은 안 맞춘다** — 서버 메아리가 한 박자 늦어 라켓이 뒤로 끌린다. */
      if (!key.held) padX = s.pad[mySeat] ?? padX;
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
