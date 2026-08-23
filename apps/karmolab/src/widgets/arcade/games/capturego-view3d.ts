/**
 * 따내기 바둑 — 입체 화면
 *
 * 판 뼈대는 `board3d.ts`. 여기 있는 일은 상태를 칸에 칠하고, 점수줄을 쓰는 것뿐이다.
 */
import type { GameView } from '../views';
import { mountBoard3d, paintCell } from '../board3d';
import { N, tryPlay, type GoState, type GoAction } from './capturego';
import { t } from '../../../lib/i18n';

export const view3d: GameView<GoState, GoAction> = {
  id: 'capturego',
  mount(el, act) {
    el.innerHTML = '<div class="ac-goscore" id="acGo3Score"></div><div id="acGo3B"></div>' +
      '<button class="btn btn-ghost" id="acGo3Pass"></button>';
    const scoreEl = el.querySelector('#acGo3Score') as HTMLElement;
    const pass = el.querySelector('#acGo3Pass') as HTMLButtonElement;
    pass.onclick = (): void => act({ cell: -1 });
    const { cells, face } = mountBoard3d(el.querySelector('#acGo3B') as HTMLElement, N, (i) => act({ cell: i }));

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat && !v.finished;

      cells.forEach((b, i) => {
        const who = s.board[i];
        const legal = myTurn && who === 0 && tryPlay(s, i, mySeat) !== null;
        paintCell(b, who, { last: i === s.last, can: legal, label: who === 1 ? '●' : who === 2 ? '○' : '' });
        b.disabled = !legal;
      });
      face.classList.toggle('ac-waiting', !myTurn);

      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-gos' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.caught[i] ?? 0) + '</b>/5</span>')
        .join('');
      pass.textContent = t('arcade.go.pass');
      pass.disabled = !myTurn;
    };
  }
};
