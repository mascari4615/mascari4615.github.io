/**
 * 다트 화면 (TASK-KL-242)
 *
 * 겨눔이 **시각으로 정해지므로** 화면은 커널이 준 `now` 로 같은 자리를 그린다 —
 * 자기 시계를 따로 쓰면 「내가 본 자리」와 「맞은 자리」가 갈린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
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
      const size = Math.min(cv.clientWidth || 260, 300);
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = Math.round(size * dpr);
        cv.height = Math.round(size * dpr);
        cv.style.height = size + 'px';
      }
      const c = cv.getContext('2d');
      if (!c) return;
      const k = cv.width / (R * 2.2);
      c.setTransform(k, 0, 0, k, cv.width / 2, cv.height / 2);
      c.clearRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);

      /* 스무 칸 — 밝고 어두운 칸이 번갈아 */
      for (let i = 0; i < 20; i++) {
        const a0 = (i - 0.5) * (Math.PI * 2) / 20 - Math.PI / 2;
        const a1 = (i + 0.5) * (Math.PI * 2) / 20 - Math.PI / 2;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, R, a0, a1);
        c.closePath();
        c.fillStyle = i % 2 === 0 ? '#111827' : '#f5f5f4';
        c.fill();
      }
      /* 두 배·세 배 띠 */
      for (const [r0, r1] of [[R * 0.62, R * 0.70], [R * 0.92, R]]) {
        for (let i = 0; i < 20; i++) {
          const a0 = (i - 0.5) * (Math.PI * 2) / 20 - Math.PI / 2;
          const a1 = (i + 0.5) * (Math.PI * 2) / 20 - Math.PI / 2;
          c.beginPath();
          c.arc(0, 0, r1, a0, a1);
          c.arc(0, 0, r0, a1, a0, true);
          c.closePath();
          c.fillStyle = i % 2 === 0 ? '#dc2626' : '#16a34a';
          c.fill();
        }
      }
      c.beginPath(); c.arc(0, 0, R * 0.11, 0, Math.PI * 2); c.fillStyle = '#16a34a'; c.fill();
      c.beginPath(); c.arc(0, 0, R * 0.05, 0, Math.PI * 2); c.fillStyle = '#dc2626'; c.fill();

      for (const m of s.marks) {
        c.beginPath();
        c.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
        c.fillStyle = SEAT_COLOR[m.seat % 4];
        c.fill();
      }

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
