/**
 * 작은 쇼기 화면 (TASK-KL-242)
 *
 * 말을 고르면 **갈 수 있는 칸을 점으로** 보여 준다 — 여섯 가지 말의 움직임을 외운 사람만
 * 놀 수 있으면 그건 오락실이 아니다. 손에 든 말도 고르면 놓을 수 있는 칸이 밝아진다.
 */
import type { GameView } from '../views';
import { N, reach, KING, GOLD, SILVER, ROOK, BISHOP, PAWN, type ShogiState, type ShogiAction } from './minishogi';

const GLYPH: Record<number, string> = {
  [KING]: '王', [GOLD]: '金', [SILVER]: '銀', [ROOK]: '飛', [BISHOP]: '角', [PAWN]: '歩'
};

export const minishogiView: GameView<ShogiState, ShogiAction> = {
  id: 'minishogi',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-sg">' +
      '<div class="ac-sghand" id="acSgH1"></div>' +
      '<div class="ac-sgboard" id="acSgB" style="--n:' + N + '"></div>' +
      '<div class="ac-sghand" id="acSgH0"></div>' +
      '</div>';
    const board = el.querySelector('#acSgB') as HTMLElement;
    const h0 = el.querySelector('#acSgH0') as HTMLElement;
    const h1 = el.querySelector('#acSgH1') as HTMLElement;
    board.innerHTML = Array.from({ length: N * N }, (_, i) =>
      '<button class="ac-sgc" data-c="' + i + '"></button>').join('');
    const cells = Array.from(board.querySelectorAll<HTMLButtonElement>('.ac-sgc'));

    let pickFrom = -1;
    let pickHand = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat && !v.finished;
      if (!myTurn) { pickFrom = -1; pickHand = -1; }

      const targets =
        pickFrom >= 0 ? reach(s.board, pickFrom)
        : pickHand >= 0 ? s.board.map((p, i) => (p === 0 ? i : -1)).filter((i) => i >= 0)
        : [];

      cells.forEach((b, i) => {
        const p = s.board[i];
        const owner = p === 0 ? -1 : p > 0 ? 0 : 1;
        b.textContent = p ? GLYPH[Math.abs(p)] ?? '?' : '';
        b.className =
          'ac-sgc' + (owner === 1 ? ' ac-flip' : '') + (owner >= 0 ? ' ac-p' + owner : '') +
          (i === pickFrom ? ' ac-pick' : '') + (targets.includes(i) ? ' ac-can' : '') +
          (i === s.last ? ' ac-last' : '');
        b.disabled = !myTurn;
        b.onclick = () => {
          if (targets.includes(i)) {
            if (pickHand >= 0) act({ kind: 'drop', piece: pickHand, to: i });
            else act({ kind: 'move', from: pickFrom, to: i });
            pickFrom = -1;
            pickHand = -1;
            return;
          }
          pickHand = -1;
          pickFrom = owner === mySeat ? (pickFrom === i ? -1 : i) : -1;
        };
      });

      const paint = (box: HTMLElement, seat: number): void => {
        const hand = s.hand[seat] ?? [];
        box.innerHTML = hand
          .map((k, j) => '<button class="ac-sgh' + (seat === mySeat && pickHand === k ? ' ac-pick' : '') +
            '" data-k="' + k + '" data-j="' + j + '">' + (GLYPH[k] ?? '?') + '</button>')
          .join('');
        box.querySelectorAll<HTMLButtonElement>('.ac-sgh').forEach((b) => {
          b.disabled = !myTurn || seat !== mySeat;
          b.onclick = () => {
            pickFrom = -1;
            const k = Number(b.dataset.k);
            pickHand = pickHand === k ? -1 : k;
          };
        });
      };
      paint(h0, mySeat);
      paint(h1, 1 - mySeat);
    };
  }
};
