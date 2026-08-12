/**
 * 윷놀이 화면 (TASK-KL-242)
 *
 * 판을 격자로 그리지 않고 **칸마다 좌표를 준다** — 진짜 윷판은 네모 위에 대각선 둘이 얹힌
 * 모양이라, 격자에 우겨넣으면 지름길이 지름길로 안 보인다. 모서리 두 곳(지름길 입구)은
 * 굵게 그려서 「여기 딱 서면 질러간다」가 눈에 들어오게 했다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { HOME, OUT, type YutState, type YutAction } from './yut';

/** 나온 수의 이름 — 도개걸윷모 */
const NAMES = ['', 'do', 'gae', 'geol', 'yut', 'mo'];

/** 칸 번호 → 판 위 자리(%). 네모 스무 칸 + 대각 두 줄. */
function spot(i: number): [number, number] {
  if (i < 20) {
    const side = Math.floor(i / 5);
    const k = (i % 5) * 25;
    if (side === 0) return [100 - k, 0];
    if (side === 1) return [0, k];
    if (side === 2) return [k, 100];
    return [100, 100 - k];
  }
  /* 대각선 — 한가운데(22·29)는 두 길이 겹치는 같은 자리다. */
  const diag: Record<number, [number, number]> = {
    20: [16.7, 16.7], 21: [33.3, 33.3], 22: [50, 50], 23: [66.7, 66.7], 24: [83.3, 83.3],
    25: [16.7, 83.3], 26: [33.3, 66.7], 29: [50, 50], 27: [66.7, 33.3], 28: [83.3, 16.7]
  };
  return diag[i] ?? [50, 50];
}

const NODES = [...Array.from({ length: 20 }, (_, i) => i), 20, 21, 22, 23, 24, 25, 26, 27, 28];

export const yutView: GameView<YutState, YutAction> = {
  id: 'yut',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-yu">' +
      '<div class="ac-yuboard" id="acYuB">' +
      NODES.map((i) => {
        const [x, y] = spot(i);
        const big = i === 5 || i === 10 || i === 22 || i === 0;
        return '<div class="ac-yun' + (big ? ' ac-big' : '') + '" data-n="' + i + '" ' +
          'style="left:' + x + '%;top:' + y + '%"></div>';
      }).join('') +
      '</div>' +
      '<div class="ac-yumsg" id="acYuMsg"></div>' +
      '<div class="ac-yuctl" id="acYuCtl"></div>' +
      '<div class="ac-yuwho" id="acYuWho"></div>' +
      '</div>';
    const board = el.querySelector('#acYuB') as HTMLElement;
    const msg = el.querySelector('#acYuMsg') as HTMLElement;
    const ctl = el.querySelector('#acYuCtl') as HTMLElement;
    const who = el.querySelector('#acYuWho') as HTMLElement;
    const nodes = Array.from(board.querySelectorAll<HTMLElement>('.ac-yun'));

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.turn === mySeat && s.won === -1 && !v.finished;

      /* 칸마다 누구 말이 서 있나 */
      const on: Record<number, number[]> = {};
      s.pos.forEach((row, seat) => row.forEach((p) => {
        if (p >= 0 && p < OUT) (on[p] ??= []).push(seat);
      }));
      nodes.forEach((el2) => {
        const n = Number(el2.dataset.n);
        /* 한가운데는 두 길이 같은 자리라 둘 다 본다. */
        const here = [...(on[n] ?? []), ...(n === 22 ? on[29] ?? [] : [])];
        el2.innerHTML = here.map((seat) => '<i class="ac-yup ac-p' + seat + '"></i>').join('');
      });

      ctl.innerHTML =
        s.phase === 'throw'
          ? '<button class="btn btn-primary" id="acYuT">' + t('arcade.yut.throw') + '</button>'
          : s.pos[mySeat]
            .map((p, k) =>
              '<button class="btn ac-yupick" data-p="' + k + '"' + (p >= OUT ? ' disabled' : '') + '>' +
              t('arcade.yut.piece', { n: String(k + 1) }) + ' · ' +
              (p === HOME ? t('arcade.yut.home') : p >= OUT ? t('arcade.yut.out') : String(p)) +
              '</button>')
            .join('');
      ctl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.disabled = b.disabled || !mine;
        b.onclick = () =>
          act(b.id === 'acYuT' ? { kind: 'throw' } : { kind: 'move', piece: Number(b.dataset.p) });
      });

      msg.textContent = v.finished
        ? ''
        : (s.rolled ? t('arcade.yut.rolled', { n: t('arcade.yut.' + NAMES[s.rolled]) }) + ' ' : '') +
          (s.caught ? t('arcade.yut.caught') + ' ' : '') +
          (mine
            ? s.phase === 'throw' ? t('arcade.yut.yourthrow') : t('arcade.yut.yourmove')
            : t('arcade.yut.wait', { who: v.seats[s.turn]?.name ?? '' }));

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (i === s.turn ? ' ac-now' : '') + '">' +
          '<i class="ac-yup ac-p' + i + '"></i> ' + seat.name +
          ' <b>' + s.pos[i].filter((p) => p >= OUT).length + '</b>/2</span>')
        .join('');
    };
  }
};
