/**
 * 점과 상자 화면 (TASK-KL-242)
 *
 * 점 사이의 **틈**이 누르는 자리다. 선은 가늘어서 손가락으로 못 짚으므로, 보이는 선보다
 * 누르는 자리를 넓게 잡는다(가로선은 위아래로, 세로선은 좌우로 여유를 준다).
 */
import type { GameView } from '../views';
import { C, HCOUNT, type DotsState, type DotsAction } from './dots';

export const dotsView: GameView<DotsState, DotsAction> = {
  id: 'dots',
  mount(el, act) {
    const parts: string[] = ['<div class="ac-dots" id="acDots" style="--c:' + C + '">'];
    for (let r = 0; r <= C; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        parts.push(
          '<button class="ac-h" data-l="' + i + '" style="grid-row:' + (r * 2 + 1) + ';grid-column:' + (c * 2 + 2) + '"></button>'
        );
      }
    }
    for (let c = 0; c <= C; c++) {
      for (let r = 0; r < C; r++) {
        const i = HCOUNT + c * C + r;
        parts.push(
          '<button class="ac-v" data-l="' + i + '" style="grid-row:' + (r * 2 + 2) + ';grid-column:' + (c * 2 + 1) + '"></button>'
        );
      }
    }
    for (let r = 0; r < C; r++) {
      for (let c = 0; c < C; c++) {
        parts.push(
          '<span class="ac-box" data-b="' + (r * C + c) + '" style="grid-row:' + (r * 2 + 2) + ';grid-column:' + (c * 2 + 2) + '"></span>'
        );
      }
    }
    for (let r = 0; r <= C; r++) {
      for (let c = 0; c <= C; c++) {
        parts.push('<span class="ac-dot" style="grid-row:' + (r * 2 + 1) + ';grid-column:' + (c * 2 + 1) + '"></span>');
      }
    }
    parts.push('</div>');
    el.innerHTML = parts.join('');

    const wrap = el.querySelector('#acDots') as HTMLElement;
    const lines = Array.from(wrap.querySelectorAll<HTMLButtonElement>('[data-l]'));
    const boxes = Array.from(wrap.querySelectorAll<HTMLElement>('[data-b]'));
    lines.forEach((b) => {
      b.onclick = () => act({ line: Number(b.dataset.l) });
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.turn === mySeat && !v.finished;
      lines.forEach((b) => {
        const owner = s.lines[Number(b.dataset.l)];
        b.classList.toggle('ac-on', owner !== 0);
        b.classList.toggle('ac-last', Number(b.dataset.l) === s.last);
        b.disabled = !myTurn || owner !== 0;
      });
      boxes.forEach((sp) => {
        const owner = s.boxes[Number(sp.dataset.b)];
        sp.className = 'ac-box' + (owner ? ' ac-p' + owner : '');
      });
      wrap.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
