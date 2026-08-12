/**
 * 볼링 화면 (TASK-KL-242)
 *
 * 던지는 쪽 뒤에서 낮게 본다 — **핀이 서 있는 것**이 이 놀이의 그림이다.
 * WebGL 을 못 얻는 기기에서는 위에서 내려다보는 2D 로 물러선다(화면이 죽는 것보다 낫다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { createGl, type Gl } from '../gl';
import { W, H, BALL_R, PIN_R, scoreOf, type BowlingState, type BowlingAction } from './bowling';

const SEAT_COLOR: Array<[number, number, number]> = [
  [0.93, 0.27, 0.27], [0.23, 0.51, 0.96], [0.13, 0.77, 0.37], [0.92, 0.7, 0.03]
];

export const bowlingView: GameView<BowlingState, BowlingAction> = {
  id: 'bowling',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-bw">' +
      '<canvas id="acBwCv"></canvas>' +
      '<div class="ac-bwscore" id="acBwScore"></div>' +
      '<div class="ac-clbar">' +
      '<label><span id="acBwAimL"></span><input type="range" id="acBwAim" min="-22" max="22" value="0"></label>' +
      '<label><span id="acBwPowL"></span><input type="range" id="acBwPow" min="30" max="100" value="70"></label>' +
      '<button class="btn btn-primary" id="acBwGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acBwCv') as HTMLCanvasElement;
    const aim = el.querySelector('#acBwAim') as HTMLInputElement;
    const pow = el.querySelector('#acBwPow') as HTMLInputElement;
    const go = el.querySelector('#acBwGo') as HTMLButtonElement;
    const scoreEl = el.querySelector('#acBwScore') as HTMLElement;
    go.onclick = () => act({ aim: Number(aim.value) / 100, power: Number(pow.value) / 100 });

    let gl: Gl | null = null;
    let tried = false;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.done && !s.moving && s.turn === mySeat;

      if (!tried) { tried = true; gl = createGl(cv); }

      const ang = (Number(aim.value) / 100) * 1;
      const aimLine = myTurn
        ? { x: W / 2, y: H - 8, dx: Math.sin(ang), dy: -Math.cos(ang), len: 40 + (Number(pow.value) / 100) * 40 }
        : undefined;

      if (gl) {
        gl.draw({
          w: W,
          h: H,
          aim: aimLine,
          pieces: s.bodies.map((b) => ({
            x: b.x,
            y: b.y,
            r: b.pin ? PIN_R : BALL_R,
            h: b.pin ? PIN_R * 5.2 : BALL_R * 1.7,
            color: b.pin ? ([0.97, 0.97, 0.98] as [number, number, number]) : SEAT_COLOR[s.turn % 4],
            fallen: !!b.down
          }))
        });
      } else {
        /* WebGL 이 없으면 위에서 본다. */
        const c = cv.getContext('2d');
        if (c) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          cv.width = Math.round((cv.clientWidth || 260) * dpr);
          cv.height = Math.round(((cv.clientWidth || 260) * H) / W * dpr);
          const k = cv.width / W;
          c.setTransform(k, 0, 0, k, 0, 0);
          c.clearRect(0, 0, W, H);
          c.fillStyle = '#e8d5ae';
          c.fillRect(2, 0, W - 4, H);
          for (const b of s.bodies) {
            c.beginPath();
            c.arc(b.x, b.y, b.pin ? PIN_R : BALL_R, 0, Math.PI * 2);
            c.fillStyle = b.pin ? (b.down ? '#cbd5e1' : '#f8fafc') : '#ef4444';
            c.fill();
          }
        }
      }

      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-bws' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + scoreOf(s.rolls[i] ?? []) + '</b></span>')
        .join('');

      el.querySelector('#acBwAimL')!.textContent = t('arcade.bowling.aim');
      el.querySelector('#acBwPowL')!.textContent = t('arcade.bowling.power');
      go.textContent = s.moving ? t('arcade.bowling.rolling') : t('arcade.bowling.roll');
      aim.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
