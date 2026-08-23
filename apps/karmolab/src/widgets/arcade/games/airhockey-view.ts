/**
 * 에어하키 화면 (TASK-KL-242)
 *
 * 손가락이 닿은 자리를 그대로 보낸다 — 이 놀이의 액션은 「눌렀다」가 아니라 **「여기 있다」**다.
 * 그래서 `pointermove` 를 그대로 흘려보내되, 소식이 너무 잦으면 그물망이 막히므로 프레임당 하나만.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { keyDrive } from '../key-drive';
import { ice, orb, woodRail } from '../paint';
import { W, H, PUCK_R, PADDLE_R, GOAL_W, type AirState, type AirAction } from './airhockey';

const SEAT_COLOR = ['#ef4444', '#3b82f6'];

export const airhockeyView: GameView<AirState, AirAction> = {
  id: 'airhockey',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-ah"><div class="ac-plscore" id="acAhScore"></div><canvas id="acAhCv"></canvas></div>';
    const cv = el.querySelector('#acAhCv') as HTMLCanvasElement;
    const scoreEl = el.querySelector('#acAhScore') as HTMLElement;

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

    /* 자판 길 — **누른 시간만큼** 민다 (TASK-KL-317, 2026-08-15).
     * 전에는 keydown 한 번에 한 칸씩이었고 판(canvas)에서 듣고 있어 초점이 안 와 안 먹었다.
     * 이제 창에서 듣고 두 축을 함께 민다 — 대각은 정규화한다(안 하면 비스듬할 때만 1.41배 빠르다). */
    let mallet: { x: number; y: number } | null = null;
    const drive = keyDrive(W, H);
    cv.tabIndex = 0;
    cv.setAttribute('role', 'application');
    cv.setAttribute('aria-label', t('arcade.ah.kb'));

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.paddles[mySeat];
      // 키를 누르고 있으면 시간만큼 민다. 마우스가 방금 자리를 줬으면 그쪽이 이긴다(둘 다 산다).
      const key = drive.step();
      if (key.held && !pending) {
        const from = mallet ?? (mine ? { x: mine.x, y: mine.y } : { x: W / 2, y: H / 2 });
        mallet = {
          x: Math.max(0, Math.min(W, from.x + key.dx)),
          y: Math.max(0, Math.min(H, from.y + key.dy))
        };
        pending = { x: mallet.x, y: mallet.y };
      }
      if (pending) {
        act(pending);
        pending = null;
      }
      /* 자판이 아는 자리를 **서버가 말한 내 채 자리**로 맞춘다 — 어긋나면 채가 튄다.
         단 **누르고 있는 동안은 안 맞춘다** — 서버 메아리가 한 박자 늦어 채가 뒤로 끌린다. */
      if (mine && !key.held) mallet = { x: mine.x, y: mine.y };

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

      /* 얼음판 — 공용 붓(`paint.ts`). 평평한 청록 하나면 판이 종이가 된다. */
      ice(c, W, H);
      woodRail(c, W, H, 2.6);
      c.strokeStyle = 'rgba(40,80,120,.35)';
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(2, H / 2); c.lineTo(W - 2, H / 2); c.stroke();
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
        /* 손잡이는 **얼음 위에 놓인 알**이다(`orb`) — 그림자와 빛이 한 규칙. */
        orb(c, p.x, p.y, PADDLE_R, SEAT_COLOR[i]);
        if (i === mySeat) {
          c.beginPath();
          c.arc(p.x, p.y, PADDLE_R * 0.42, 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,255,255,.9)';
          c.fill();
        }
      });

      /* 퍽은 검은 고무 — 빛을 조금만 받는다. */
      orb(c, s.puck.x, s.puck.y, PUCK_R, '#2b3446', '#7c8798');

      /* 점수는 판 밖 알약으로 — 캔버스 안 글자는 무대가 커져도 안 커진다. */
      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-plc' + (i === mySeat ? ' ac-me' : '') + '" style="--c:' + SEAT_COLOR[i] + '">' +
          seat.name + ' <b>' + (s.score[i] ?? 0) + '</b></span>')
        .join('');
    };
  }
};
