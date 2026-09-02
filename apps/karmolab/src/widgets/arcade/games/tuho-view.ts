/**
 * 투호 화면 (TASK-KL-242)
 *
 * 던지는 사람 뒤에서 낮게 본다. 이 놀이가 겨루는 것은 **멀고 가까움**이라, 위에서 내려다보면
 * 세게 던졌는지 약하게 던졌는지가 화면에서 사라진다(볼링을 3D 로 그린 것과 같은 이유).
 *
 * 항아리는 서 있는 원기둥, 귀는 그 옆에 낮은 원기둥 둘, 꽂힌 화살은 서 있는 가는 막대.
 * 날아가는 동안 화살을 **점점 낮아지는 막대**로 그려서 내려앉는 중이 보이게 했다.
 * WebGL 이 없는 기기에서는 위에서 보는 2D 로 물러선다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { createGl, type Gl } from '../gl';
import { W, H, FROM, POT, EAR_DX, EAR_R, type TuhoState, type TuhoAction } from './tuho';
import { SEAT_COLOR as SEAT_CSS } from '../paint';

const SEAT_COLOR: Array<[number, number, number]> = [
  [0.93, 0.27, 0.27], [0.23, 0.51, 0.96], [0.13, 0.77, 0.37], [0.92, 0.7, 0.03],
  [0.66, 0.33, 0.97], [0.02, 0.71, 0.83]
];

export const tuhoView: GameView<TuhoState, TuhoAction> = {
  id: 'tuho',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-th">' +
      '<canvas id="acThCv"></canvas>' +
      '<div class="ac-thscore" id="acThS"></div>' +
      '<div class="ac-clbar">' +
      '<label><span id="acThAimL"></span><input type="range" id="acThAim" min="0" max="100" value="50"></label>' +
      '<label><span id="acThPowL"></span><input type="range" id="acThPow" min="0" max="100" value="50"></label>' +
      '<button class="btn btn-primary" id="acThGo"></button>' +
      '</div></div>';
    const cv = el.querySelector('#acThCv') as HTMLCanvasElement;
    const aim = el.querySelector('#acThAim') as HTMLInputElement;
    const pow = el.querySelector('#acThPow') as HTMLInputElement;
    const go = el.querySelector('#acThGo') as HTMLButtonElement;
    const scoreEl = el.querySelector('#acThS') as HTMLElement;
    go.onclick = () => act({ ang: Number(aim.value) / 100, pow: Number(pow.value) / 100 });

    let gl: Gl | null = null;
    let tried = false;

    return (v, mySeat, now) => {
      const s = v.state;
      const myTurn = !s.over && !s.fly && s.turn === mySeat && s.left[mySeat] > 0;
      if (!tried) { tried = true; gl = createGl(cv); }

      /* 날아가는 화살. 시작점에서 떨어질 자리까지, 위로 솟았다 내려온다. */
      let air: { x: number; y: number; up: number } | null = null;
      if (s.fly) {
        const p = Math.min(1, Math.max(0, 1 - (s.fly.at - now) / 900));
        air = {
          x: s.fly.from.x + (s.fly.to.x - s.fly.from.x) * p,
          y: s.fly.from.y + (s.fly.to.y - s.fly.from.y) * p,
          up: Math.sin(p * Math.PI)
        };
      }

      const lat = ((Number(aim.value) / 100) - 0.5) * 0.62;
      const aimLine = myTurn
        ? { x: FROM.x, y: FROM.y, dx: Math.sin(lat), dy: -Math.cos(lat), len: 46 + (Number(pow.value) / 100) * 76 }
        : undefined;

      if (gl) {
        gl.draw({
          w: W,
          h: H,
          floor: { w: W, h: H, color: [0.36, 0.30, 0.22] },
          aim: aimLine,
          pieces: [
            { x: POT.x, y: POT.y, r: POT.r, h: 15, color: [0.42, 0.24, 0.16] },
            { x: POT.x - EAR_DX, y: POT.y, r: EAR_R, h: 8, color: [0.52, 0.32, 0.2] },
            { x: POT.x + EAR_DX, y: POT.y, r: EAR_R, h: 8, color: [0.52, 0.32, 0.2] },
            ...s.shots.map((sh) => ({
              x: sh.x,
              y: sh.y,
              r: 0.9,
              /* 들어간 화살은 항아리 밖으로 삐죽 나오게, 빗나간 것은 바닥에 눕힌다. */
              h: sh.worth ? 20 : 6,
              color: SEAT_COLOR[sh.seat % 6],
              fallen: sh.worth === 0
            })),
            ...(air
              ? [{ x: air.x, y: air.y, r: 1, h: 6 + air.up * 26, color: SEAT_COLOR[s.fly!.seat % 6] }]
              : [])
          ]
        });
      } else {
        const c = cv.getContext('2d');
        if (c) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          cv.width = Math.round((cv.clientWidth || 260) * dpr);
          cv.height = Math.round(((cv.clientWidth || 260) * H) / W * dpr);
          const k = cv.width / W;
          c.setTransform(k, 0, 0, k, 0, 0);
          c.clearRect(0, 0, W, H);
          c.fillStyle = '#5c4d38';
          c.fillRect(0, 0, W, H);
          for (const [x, r, col] of [[POT.x - EAR_DX, EAR_R, '#85522f'], [POT.x + EAR_DX, EAR_R, '#85522f'], [POT.x, POT.r, '#6b3d28']] as Array<[number, number, string]>) {
            c.beginPath(); c.arc(x, POT.y, r, 0, Math.PI * 2); c.fillStyle = col; c.fill();
          }
          for (const sh of s.shots) {
            c.beginPath(); c.arc(sh.x, sh.y, 1.4, 0, Math.PI * 2);
            c.fillStyle = SEAT_CSS[sh.seat % 6]; c.fill();
          }
          if (air) { c.beginPath(); c.arc(air.x, air.y, 1.8, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
        }
      }

      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (i === s.turn ? ' ac-now' : '') + '">' +
          '<i style="background:' + SEAT_CSS[i % 6] + '"></i> ' + seat.name +
          ' <b>' + s.score[i] + '</b>, ' + t('arcade.tuho.left', { n: String(s.left[i]) }) + '</span>')
        .join('');

      (el.querySelector('#acThAimL') as HTMLElement).textContent = t('arcade.tuho.aim');
      (el.querySelector('#acThPowL') as HTMLElement).textContent = t('arcade.tuho.power');
      go.textContent = s.fly ? t('arcade.tuho.flying') : t('arcade.tuho.throw');
      aim.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
