/**
 * 오목 화면 (TASK-KL-242)
 *
 * 격자는 판 크기가 바뀔 때만 만듦. 매번 다시 만들면 두려던 자리가 손가락 밑에서 사라짐
 *
 * **한 칸의 한가운데가 줄이 만나는 점이다.** 줄은 칸마다 제 십자를 그려 만들고, 판 밖으로
 * 새는 바깥쪽 반 토막만 지운다(`ac-e-*`). 그래서 줄 수가 아홉이든 열아홉이든 같은 코드로
 * 맞고, 손이 올라간 칸과 알이 놓일 점이 어긋나지 않음
 *
 * 화면에 글자를 두지 않는다(`bare`). 차례는 알 색과 눌리는 자리로 앎
 */
import type { GameView } from '../views';
import { DEFAULT_SIZE, starPoints, type GomokuState, type GomokuAction } from './gomoku';

export const gomokuView: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  bare: true,
  mount(el, act) {
    /* 판 크기는 시작할 때 정해진다. 첫 그림이 올 때까지는 표준 줄 수로 세워 둔다 */
    let n = 0;
    let cells: HTMLButtonElement[] = [];
    let board: HTMLElement | null = null;
    /* 글자 돌(●○)이 사는 자리. 칸에 바로 적으면 줄을 그리는 `<i>` 가 지워진다 */
    let marks: HTMLElement[] = [];

    const build = (size: number): void => {
      n = size;
      const stars = new Set(starPoints(n));
      const at = (i: number): string => {
        const x = i % n;
        const y = Math.floor(i / n);
        const edge =
          (y === 0 ? ' ac-e-t' : '') +
          (y === n - 1 ? ' ac-e-b' : '') +
          (x === 0 ? ' ac-e-l' : '') +
          (x === n - 1 ? ' ac-e-r' : '');
        return `<button class="ac-cell${edge}${stars.has(i) ? ' ac-star' : ''}" data-c="${i}"><i></i><b class="ac-mk"></b></button>`;
      };
      el.innerHTML =
        '<div class="ac-goban">' +
        '<span class="ac-bowl ac-bowl-b"></span>' +
        `<div class="ac-board" id="acBoard" style="--n:${n}">` +
        Array.from({ length: n * n }, (_, i) => at(i)).join('') +
        '</div>' +
        '<span class="ac-bowl ac-bowl-w"></span>' +
        '</div>';
      board = el.querySelector('#acBoard');
      cells = Array.from(el.querySelectorAll<HTMLButtonElement>('.ac-cell'));
      cells.forEach((b) => {
        b.onclick = () => act({ cell: Number(b.dataset.c) });
      });
      marks = cells.map((b) => b.querySelector('b') as HTMLElement);
    };
    build(DEFAULT_SIZE);

    return (v, mySeat) => {
      const s = v.state;
      if (s.n !== n) build(s.n);
      const myTurn = s.won === -1 && s.turn === mySeat;
      /* 금수는 흑만, 그리고 흑 차례일 때만 표시한다. 백 차례에 띄우면 남의 사정이다 */
      const banned = new Set(s.turn === 0 ? s.banned : []);
      cells.forEach((b, i) => {
        const who = s.board[i];
        const mark = who === 1 ? '●' : who === 2 ? '○' : '';
        if (marks[i].textContent !== mark) marks[i].textContent = mark;
        /* 글자 돌은 판정, 읽기용으로 남기고, 보이는 돌은 CSS 가 재질로 그린다. */
        b.classList.toggle('ac-s1', who === 1);
        b.classList.toggle('ac-s2', who === 2);
        const no = banned.has(i);
        b.classList.toggle('ac-ban', no);
        b.disabled = !myTurn || who !== 0 || no;
        b.classList.toggle('ac-last', i === s.last);
      });
      board?.classList.toggle('ac-waiting', !myTurn);
    };
  }
};
