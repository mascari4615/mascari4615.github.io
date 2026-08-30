/**
 * 탁구 화면 (TASK-KL-242)
 *
 * 에어하키와 같은 손놀림(닿은 자리를 보낸다)인데 **x 하나만** 쓴다.
 * 내 라켓이 늘 아래로 오게 그린다. 남의 라켓이 앞에 있으면 방향이 뒤집혀 헷갈린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, PAD, type PongState, type PongAction } from './pong';
import { keyDrive } from '../key-drive';
import { felt, orb, woodRail } from '../paint';

const SEAT_COLOR = ['#ef4444', '#3b82f6'];

export const pongView: GameView<PongState, PongAction> = {
  id: 'pong',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-pg"><div class="ac-plscore" id="acPgScore"></div><canvas id="acPgCv"></canvas></div>';
    const cv = el.querySelector('#acPgCv') as HTMLCanvasElement;
    const scoreEl = el.querySelector('#acPgScore') as HTMLElement;

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

    /* 자판 길. **누른 시간만큼** 민다 (TASK-KL-317, 2026-08-15).
     * 전에는 keydown 한 번에 한 칸씩(W/24) 옮겼고, 그마저 판(canvas)에서 듣고 있어서
     * **초점이 판에 안 와 한 번도 안 먹었다**(실측: 화살표를 눌러도 40.0 에서 안 움직였다).
     * 이제 창에서 듣고, 라켓 자리를 화면이 들고 있다가 매 프레임 시간만큼 민다.
     * 보내는 통로는 마우스와 같은 `pending`. 서버로 가는 길이 갈리면 안 된다. */
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
         단 **키를 누르고 있는 동안은 안 맞춘다**. 서버 메아리가 한 박자 늦어 라켓이 뒤로 끌린다. */
      if (!key.held) padX = s.pad[mySeat] ?? padX;
      /* 내가 자리1이면 판을 뒤집어 그린다. 내 라켓이 늘 아래다. */
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
      /* 탁구대. 파란 천에 흰 선, 둘레는 나무. 검정 사각형 하나면 판이 아니라 배경이다. */
      felt(c, W, H, 'blue');
      woodRail(c, W, H, 2.2);
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 0.55;
      c.beginPath();
      c.moveTo(2, H / 2);
      c.lineTo(W - 2, H / 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.35)';
      c.beginPath();
      c.moveTo(W / 2, 2);
      c.lineTo(W / 2, H - 2);
      c.stroke();

      const fy = (y: number): number => (flip ? H - y : y);

      [0, 1].forEach((i) => {
        /* 라켓. 판 위에 놓인 것이라 아래에 그림자가 깔린다. */
        const y = i === 0 ? H - 4 : 4;
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.fillRect(s.pad[i] - PAD / 2 + 0.5, fy(y) - 0.4, PAD, 2);
        c.fillStyle = SEAT_COLOR[i];
        c.fillRect(s.pad[i] - PAD / 2, fy(y) - 1, PAD, 2);
        c.fillStyle = 'rgba(255,255,255,.4)';
        c.fillRect(s.pad[i] - PAD / 2, fy(y) - 1, PAD, 0.6);
      });

      /* 공 = 구슬(`orb`). 판마다 같은 규칙. */
      orb(c, s.ball.x, fy(s.ball.y), 1.7, '#f4efe4');

      /* 점수는 판 밖 알약. 캔버스 안 7px 글자는 무대가 커져도 안 커진다. */
      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-plc' + (i === mySeat ? ' ac-me' : '') + '" style="--c:' + SEAT_COLOR[i] + '">' +
          seat.name + ' <b>' + (s.score[i] ?? 0) + '</b></span>')
        .join('');
    };
  }
};
