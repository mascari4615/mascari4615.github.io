/**
 * 만칼라 화면 (TASK-KL-242)
 *
 * 구덩이에 손을 얹으면 **마지막 알이 멎을 자리**를 표시한다 — 이 놀이의 수는 「어디를 집을까」가
 * 아니라 「마지막 알이 어디서 멎을까」라, 안 보여 주면 손가락으로 세게 된다.
 */
import type { GameView } from '../views';
import { PITS, STORE, ownsPit, sow, type MancalaState, type MancalaAction } from './mancala';

export const mancalaView: GameView<MancalaState, MancalaAction> = {
  id: 'mancala',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-mn">' +
      '<div class="ac-mnrow" id="acMnTop"></div>' +
      '<div class="ac-mnmid"><div class="ac-mnstore" id="acMnS1"></div>' +
      '<div class="ac-mnhint" id="acMnHint"></div>' +
      '<div class="ac-mnstore" id="acMnS0"></div></div>' +
      '<div class="ac-mnrow" id="acMnBot"></div>' +
      '</div>';
    const top = el.querySelector('#acMnTop') as HTMLElement;
    const bot = el.querySelector('#acMnBot') as HTMLElement;
    const s0 = el.querySelector('#acMnS0') as HTMLElement;
    const s1 = el.querySelector('#acMnS1') as HTMLElement;
    let hover = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.over && s.turn === mySeat && !v.finished;
      if (!myTurn) hover = -1;

      const landing = hover >= 0 && s.board[hover] > 0 ? sow(s.board, mySeat, hover).last : -1;

      const pit = (i: number): string =>
        '<button class="ac-mnp' +
        (i === landing ? ' ac-land' : '') +
        (i === s.last ? ' ac-last' : '') +
        '" data-i="' + i + '"><b>' + s.board[i] + '</b></button>';

      /* 내 줄이 아래로 오게 그린다 — 남의 줄이 앞에 있으면 매번 헷갈린다. */
      const mineRow = Array.from({ length: PITS }, (_, k) => (mySeat === 0 ? k : PITS + 1 + k));
      const foeRow = Array.from({ length: PITS }, (_, k) => (mySeat === 0 ? PITS + 1 + k : k)).reverse();

      top.innerHTML = foeRow.map(pit).join('');
      bot.innerHTML = mineRow.map(pit).join('');
      s0.innerHTML = '<small>' + v.seats[mySeat].name + '</small><b>' + s.board[STORE[mySeat]] + '</b>';
      s1.innerHTML = '<small>' + v.seats[1 - mySeat].name + '</small><b>' + s.board[STORE[1 - mySeat]] + '</b>';

      el.querySelectorAll<HTMLButtonElement>('.ac-mnp').forEach((b) => {
        const i = Number(b.dataset.i);
        const mine = ownsPit(mySeat, i);
        b.disabled = !myTurn || !mine || s.board[i] === 0;
        b.onmouseenter = () => { if (myTurn && mine) hover = i; };
        b.onmouseleave = () => { hover = -1; };
        b.onclick = () => {
          act({ pit: i });
          hover = -1;
        };
      });
    };
  }
};
