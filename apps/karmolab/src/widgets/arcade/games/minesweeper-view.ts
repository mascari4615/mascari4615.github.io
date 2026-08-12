/**
 * 지뢰 찾기 화면 (TASK-KL-242)
 *
 * 깃발은 **길게 누르기**로 받는다 — 폰에는 오른쪽 단추가 없다. 데스크톱에서는 오른쪽 단추도 받는다.
 * 숫자는 `nums` 에서 온다(지뢰는 손님에게 안 간다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, type SweepState, type SweepAction } from './minesweeper';

const NUM_COLOR = ['', '#3b82f6', '#16a34a', '#ef4444', '#7c3aed', '#b45309', '#0891b2', '#334155', '#64748b'];

export const minesweeperView: GameView<SweepState, SweepAction> = {
  id: 'minesweeper',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-ms">' +
      '<div class="ac-msgrid" id="acMsGrid" style="--w:' + W + '"></div>' +
      '<div class="ac-msbar" id="acMsBar"></div>' +
      '</div>';
    const grid = el.querySelector('#acMsGrid') as HTMLElement;
    const bar = el.querySelector('#acMsBar') as HTMLElement;
    grid.innerHTML = Array.from({ length: W * H }, (_, i) =>
      '<button class="ac-mc" data-c="' + i + '"></button>').join('');
    const cells = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-mc'));

    let hold = 0;
    cells.forEach((b) => {
      const c = Number(b.dataset.c);
      b.oncontextmenu = (e): void => {
        e.preventDefault();
        act({ cell: c, flag: true });
      };
      b.onpointerdown = (): void => {
        hold = window.setTimeout(() => {
          hold = 0;
          act({ cell: c, flag: true });
        }, 450);
      };
      const cancel = (): void => {
        if (hold) { clearTimeout(hold); hold = 0; }
      };
      b.onpointerleave = cancel;
      b.onpointerup = (): void => {
        if (!hold) return; /* 길게 눌러 깃발이 이미 꽂혔다 */
        clearTimeout(hold);
        hold = 0;
        act({ cell: c });
      };
    });

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.seen[mySeat] ?? [];
      const dead = s.dead[mySeat];

      cells.forEach((b, i) => {
        const st = mine[i] ?? 0;
        const n = s.nums[i] ?? -1;
        let face = '';
        if (st === 2) face = '⚑';
        else if (st === 1) face = n > 0 ? String(n) : '';
        b.textContent = face;
        b.className = 'ac-mc' + (st === 1 ? ' ac-open' : '') + (st === 2 ? ' ac-flag' : '');
        b.style.color = st === 1 && n > 0 ? NUM_COLOR[n] : '';
        b.disabled = dead || s.over || st === 1;
      });

      bar.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (s.dead[i] ? ' ac-dead' : '') + '">' +
          seat.name + ' <b>' + (s.opened[i] ?? 0) + '</b></span>')
        .join('') + (dead ? '<span class="ac-dts">' + t('arcade.mine.dead') + '</span>' : '');
    };
  }
};
