/**
 * 따내기 바둑 화면 (TASK-KL-242)
 *
 * **잡힌 수를 크게 보여 준다** — 이 판의 승부는 집이 아니라 잡은 수라, 그 숫자가 작으면
 * 무엇을 겨루는지 안 읽힌다. 못 두는 자리(자살수·패)는 눌러도 아무 일이 없어야 하고,
 * 그건 규칙이 이미 막아 준다(화면은 흐리게만 한다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { N, tryPlay, type GoState, type GoAction } from './capturego';

export const capturegoView: GameView<GoState, GoAction> = {
  id: 'capturego',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-go">' +
      '<div class="ac-goscore" id="acGoScore"></div>' +
      '<div class="ac-goboard" id="acGoB" style="--n:' + N + '"></div>' +
      '<button class="btn btn-ghost" id="acGoPass"></button>' +
      '</div>';
    const boardEl = el.querySelector('#acGoB') as HTMLElement;
    const scoreEl = el.querySelector('#acGoScore') as HTMLElement;
    const pass = el.querySelector('#acGoPass') as HTMLButtonElement;
    boardEl.innerHTML = Array.from({ length: N * N }, (_, i) =>
      '<button class="ac-goc" data-c="' + i + '"><i></i></button>').join('');
    const cells = Array.from(boardEl.querySelectorAll<HTMLButtonElement>('.ac-goc'));
    pass.onclick = () => act({ kind: 'pass' });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat && !v.finished;

      cells.forEach((b, i) => {
        const who = s.board[i];
        const legal = myTurn && who === 0 && tryPlay(s, i, mySeat) !== null;
        b.className =
          'ac-goc' + (who ? ' ac-p' + who : '') + (i === s.last ? ' ac-last' : '') +
          (legal ? ' ac-can' : '');
        b.disabled = !legal;
        b.onclick = () => act({ cell: i });
      });

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
