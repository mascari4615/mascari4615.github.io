/**
 * 다트 화면 (TASK-KL-242)
 *
 * 겨눔이 **시각으로 정해지므로** 화면은 커널이 준 `now` 로 같은 자리를 그린다 —
 * 자기 시계를 따로 쓰면 「내가 본 자리」와 「맞은 자리」가 갈린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { orb } from '../paint';
import { R, SECTORS, aimAt, scoreAt, type DartsState, type DartsAction } from './darts';

const SEAT_COLOR = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];

export const dartsView: GameView<DartsState, DartsAction> = {
  id: 'darts',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-dt">' +
      '<canvas id="acDtCv"></canvas>' +
      '<div class="ac-dtleft" id="acDtLeft"></div>' +
      '<button class="btn btn-primary" id="acDtGo"></button>' +
      '</div>';
    const cv = el.querySelector('#acDtCv') as HTMLCanvasElement;
    const go = el.querySelector('#acDtGo') as HTMLButtonElement;
    const leftEl = el.querySelector('#acDtLeft') as HTMLElement;
    go.onclick = () => act({ kind: 'throw' });

    return (v, mySeat, now) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      /* 정사각은 CSS(`aspect-ratio`)가 잡는다 — 여기서는 그 크기에 픽셀만 맞춘다. */
      const size = cv.clientWidth || 260;
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = Math.round(size * dpr);
        cv.height = Math.round(size * dpr);
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / (R * 2.2);
      c.setTransform(k, 0, 0, k, cv.width / 2, cv.height / 2);
      c.clearRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);

      const SEC = (Math.PI * 2) / 20;
      const ang = (i: number, d: number): number => (i + d) * SEC - Math.PI / 2;
      /* 바깥 테 — 검은 띠에 숫자가 앉는다. 판 둘레가 있어야 「벽에 걸린 것」으로 보인다. */
      const rim = c.createRadialGradient(0, 0, R, 0, 0, R * 1.1);
      rim.addColorStop(0, '#1b1b1e');
      rim.addColorStop(1, '#08080a');
      c.beginPath(); c.arc(0, 0, R * 1.1, 0, Math.PI * 2); c.fillStyle = rim; c.fill();

      /* 스무 칸 — 크림과 검정이 번갈아. 위에서 오는 빛 때문에 아래쪽이 살짝 어둡다. */
      for (let i = 0; i < 20; i++) {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, R, ang(i, -0.5), ang(i, 0.5));
        c.closePath();
        c.fillStyle = i % 2 === 0 ? '#17161a' : '#e9e2cf';
        c.fill();
      }
      /* 두 배·세 배 띠 */
      for (const [r0, r1] of [[R * 0.62, R * 0.70], [R * 0.92, R]]) {
        for (let i = 0; i < 20; i++) {
          c.beginPath();
          c.arc(0, 0, r1, ang(i, -0.5), ang(i, 0.5));
          c.arc(0, 0, r0, ang(i, 0.5), ang(i, -0.5), true);
          c.closePath();
          c.fillStyle = i % 2 === 0 ? '#b8202b' : '#137a3c';
          c.fill();
        }
      }

      /* 철사 — 칸을 가르는 것은 색이 아니라 **금속 줄**이다. 이게 없으면 색종이 부채가 된다. */
      c.strokeStyle = 'rgba(212,216,224,.75)';
      c.lineWidth = R * 0.012;
      for (let i = 0; i < 20; i++) {
        const a = ang(i, -0.5);
        c.beginPath();
        c.moveTo(Math.cos(a) * R * 0.11, Math.sin(a) * R * 0.11);
        c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        c.stroke();
      }
      for (const rr of [R * 0.11, R * 0.62, R * 0.70, R * 0.92, R]) {
        c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.stroke();
      }

      /* 가운데 — 초록 고리와 빨간 눈. 알로 그려 살짝 솟아 보이게. */
      c.beginPath(); c.arc(0, 0, R * 0.11, 0, Math.PI * 2); c.fillStyle = '#137a3c'; c.fill();
      c.beginPath(); c.arc(0, 0, R * 0.05, 0, Math.PI * 2); c.fillStyle = '#b8202b'; c.fill();

      /* 숫자 — 바깥 테 위. 어느 칸이 몇 점인지 판에 적혀 있어야 겨눌 수 있다. */
      c.fillStyle = 'rgba(236,232,222,.9)';
      c.font = '600 ' + (R * 0.11).toFixed(2) + 'px system-ui,sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      SECTORS.forEach((n, i) => {
        const a = ang(i, 0);
        c.fillText(String(n), Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05);
      });

      for (const m of s.marks) orb(c, m.x, m.y, 1.7, SEAT_COLOR[m.seat % 4]);

      if (myTurn) {
        const at = aimAt(now, s.since);
        c.strokeStyle = '#38bdf8';
        c.lineWidth = 1.2;
        c.beginPath(); c.arc(at.x, at.y, 3.2, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.moveTo(at.x - 5, at.y); c.lineTo(at.x + 5, at.y);
        c.moveTo(at.x, at.y - 5); c.lineTo(at.x, at.y + 5);
        c.stroke();
        go.textContent = t('arcade.darts.throw', { n: String(scoreAt(at.x, at.y)) });
      } else {
        go.textContent = t('arcade.darts.wait');
      }

      leftEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + s.left[i] + '</b></span>')
        .join('');
      go.disabled = !myTurn;
    };
  }
};
