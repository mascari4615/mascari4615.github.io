/**
 * 스도쿠 경주 화면 (TASK-KL-242)
 *
 * **줄, 칸에서 겹치는 숫자를 붉게** 보여 준다. 정답을 알려 주는 게 아니라(정답은 화면에 안 온다)
 * 이미 화면에 있는 것끼리 부딪히는 것만 짚어 준다. 그 정도는 종이로 풀 때도 눈에 보인다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { N, BOX_W, BOX_H, type SudokuState, type SudokuAction } from './sudoku';

export const sudokuView: GameView<SudokuState, SudokuAction> = {
  id: 'sudoku',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-su">' +
      '<div class="ac-suboard" id="acSuB" style="--n:' + N + '"></div>' +
      '<div class="ac-supad" id="acSuPad"></div>' +
      '<div class="ac-suwho" id="acSuWho"></div>' +
      '</div>';
    const boardEl = el.querySelector('#acSuB') as HTMLElement;
    const pad = el.querySelector('#acSuPad') as HTMLElement;
    const who = el.querySelector('#acSuWho') as HTMLElement;
    boardEl.innerHTML = Array.from({ length: N * N }, (_, i) => {
      const r = Math.floor(i / N);
      const c = i % N;
      const edge =
        (c % BOX_W === 0 ? ' ac-bl' : '') + (r % BOX_H === 0 ? ' ac-bt' : '');
      return '<button class="ac-suc' + edge + '" data-c="' + i + '"></button>';
    }).join('');
    const cells = Array.from(boardEl.querySelectorAll<HTMLButtonElement>('.ac-suc'));
    let pick = -1;

    pad.innerHTML = [1, 2, 3, 4, 5, 6, 0]
      .map((v) => '<button class="ac-sun" data-v="' + v + '">' + (v || '×') + '</button>')
      .join('');

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.filled[mySeat] ?? [];
      const live = !s.over && s.won === -1;

      /* 부딪히는 칸 찾기. 화면에 이미 있는 것끼리만 본다. */
      const clash = new Set<number>();
      for (let i = 0; i < N * N; i++) {
        if (!mine[i]) continue;
        for (let j = i + 1; j < N * N; j++) {
          if (mine[j] !== mine[i]) continue;
          const sameRow = Math.floor(i / N) === Math.floor(j / N);
          const sameCol = i % N === j % N;
          const box = (c: number): number =>
            Math.floor(Math.floor(c / N) / BOX_H) * BOX_H + Math.floor((c % N) / BOX_W);
          if (sameRow || sameCol || box(i) === box(j)) { clash.add(i); clash.add(j); }
        }
      }

      cells.forEach((b, i) => {
        const val = mine[i] ?? 0;
        b.textContent = val ? String(val) : '';
        const given = s.given[i] !== 0;
        b.className =
          'ac-suc' + ((i % N) % BOX_W === 0 ? ' ac-bl' : '') +
          (Math.floor(i / N) % BOX_H === 0 ? ' ac-bt' : '') +
          (given ? ' ac-given' : '') + (i === pick ? ' ac-pick' : '') +
          (clash.has(i) ? ' ac-clash' : '');
        b.disabled = given || !live;
        b.onclick = () => { pick = pick === i ? -1 : i; };
      });

      pad.querySelectorAll<HTMLButtonElement>('.ac-sun').forEach((b) => {
        b.disabled = pick < 0 || !live;
        b.onclick = () => {
          act({ cell: pick, value: Number(b.dataset.v) });
        };
      });

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.right[i] ?? 0) + '</b>/' + N * N +
          ((s.wrong?.[i] ?? 0) > 0 ? ' <small>' + t((s.wrong[i] ?? 0) >= 3 ? 'arcade.sudoku.out' : 'arcade.sudoku.wrong', { n: String(s.wrong[i]) }) + '</small>' : '') + '</span>')
        .join('') + (pick < 0 && live ? '<span class="ac-dts">' + t('arcade.sudoku.hint') + '</span>' : '');
    };
  }
};
