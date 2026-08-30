/**
 * 배우기. 판 위에서 한 수씩 (레퍼런스 1.1.11 튜토리얼)
 *
 * 글로 규칙을 설명하지 않는다. **장면을 깔고 한 자리를 짚게** 한다. 맞으면 다음 장, 틀리면 그 수를 물리고 다시.
 * 커널은 그대로. 봇이 안 두는 판(`bot: () => null`)에 장면을 심음
 *
 * 판 크기는 15줄 고정. 칸 번호는 `y * 15 + x`. 아래 표의 [x, y] 를 그대로 옮기면 됨
 *
 * ★ 장면마다 **흑과 백이 같은 수**. 흑부터 번갈아 심으므로 수가 어긋나면 백 차례로 끝나 사람이 못 둔다(실측)
 */
export interface Lesson {
  /** 이 장의 말 (i18n 열쇠) */
  say: string;
  /** 미리 깔아 둘 돌. 흑 먼저, 번갈아 두는 것이 아니라 자리마다 색을 준다 */
  board: Array<{ x: number; y: number; who: 1 | 2 }>;
  /** 여기를 짚으면 맞다. 여럿이면 아무 데나 */
  answer: Array<{ x: number; y: number }>;
  /** 틀렸을 때의 말 */
  miss: string;
}

const N = 15;
export const TUTOR_SIZE = N;
export const cellOf = (x: number, y: number): number => y * N + x;

/** 오목 배우기 일곱 장. 이어라, 막아라, 열린 셋, 사삼, 삼삼 금수, 사사 금수, 장목 금수 */
export const LESSONS: readonly Lesson[] = [
  {
    say: 'arcade.tutor.five',
    board: [
      { x: 5, y: 7, who: 1 }, { x: 6, y: 7, who: 1 }, { x: 7, y: 7, who: 1 }, { x: 8, y: 7, who: 1 },
      { x: 5, y: 9, who: 2 }, { x: 6, y: 9, who: 2 }, { x: 7, y: 9, who: 2 }, { x: 9, y: 9, who: 2 }
    ],
    answer: [{ x: 4, y: 7 }, { x: 9, y: 7 }],
    miss: 'arcade.tutor.five.miss'
  },
  {
    say: 'arcade.tutor.block',
    board: [
      { x: 5, y: 8, who: 2 }, { x: 6, y: 8, who: 2 }, { x: 7, y: 8, who: 2 }, { x: 8, y: 8, who: 2 },
      { x: 5, y: 5, who: 1 }, { x: 7, y: 6, who: 1 }, { x: 9, y: 5, who: 1 }, { x: 3, y: 10, who: 1 }
    ],
    answer: [{ x: 4, y: 8 }, { x: 9, y: 8 }],
    miss: 'arcade.tutor.block.miss'
  },
  {
    say: 'arcade.tutor.open3',
    board: [
      { x: 6, y: 7, who: 1 }, { x: 7, y: 7, who: 1 },
      { x: 3, y: 3, who: 2 }, { x: 11, y: 11, who: 2 }
    ],
    answer: [{ x: 5, y: 7 }, { x: 8, y: 7 }],
    miss: 'arcade.tutor.open3.miss'
  },
  {
    say: 'arcade.tutor.double',
    board: [
      { x: 5, y: 7, who: 1 }, { x: 6, y: 7, who: 1 }, { x: 7, y: 7, who: 1 },
      { x: 8, y: 4, who: 1 }, { x: 8, y: 5, who: 1 }, { x: 8, y: 6, who: 1 },
      { x: 2, y: 2, who: 2 }, { x: 12, y: 12, who: 2 }, { x: 2, y: 12, who: 2 }, { x: 12, y: 2, who: 2 },
      { x: 0, y: 7, who: 2 }, { x: 14, y: 7, who: 2 }
    ],
    answer: [{ x: 8, y: 7 }],
    miss: 'arcade.tutor.double.miss'
  },
  {
    say: 'arcade.tutor.banned',
    board: [
      { x: 5, y: 7, who: 1 }, { x: 6, y: 7, who: 1 },
      { x: 8, y: 5, who: 1 }, { x: 8, y: 6, who: 1 },
      { x: 1, y: 1, who: 2 }, { x: 13, y: 13, who: 2 }, { x: 1, y: 13, who: 2 }, { x: 13, y: 1, who: 2 }
    ],
    /* 삼삼 자리(8,7)를 피해 다른 데. 렌주에서 흑은 거기 못 둔다 */
    answer: [{ x: 7, y: 7 }, { x: 4, y: 7 }],
    miss: 'arcade.tutor.banned.miss'
  },
  {
    /* 사사 금수. 금수 자리는 (8,7) 하나(노드 실측). 흑 여섯, 백 여섯 */
    say: 'arcade.tutor.four4',
    board: [
      { x: 4, y: 7, who: 1 }, { x: 5, y: 7, who: 1 }, { x: 6, y: 7, who: 1 },
      { x: 8, y: 4, who: 1 }, { x: 8, y: 5, who: 1 }, { x: 8, y: 6, who: 1 },
      { x: 2, y: 2, who: 2 }, { x: 12, y: 12, who: 2 }, { x: 2, y: 12, who: 2 },
      { x: 12, y: 2, who: 2 }, { x: 0, y: 0, who: 2 }, { x: 14, y: 14, who: 2 }
    ],
    answer: [{ x: 7, y: 7 }, { x: 3, y: 7 }],
    miss: 'arcade.tutor.four4.miss'
  },
  {
    /* 장목 금수. 여섯이 되는 (6,7) 이 금수(노드 실측). 흑 다섯, 백 다섯 */
    say: 'arcade.tutor.over',
    board: [
      { x: 3, y: 7, who: 1 }, { x: 4, y: 7, who: 1 }, { x: 5, y: 7, who: 1 },
      { x: 7, y: 7, who: 1 }, { x: 8, y: 7, who: 1 },
      { x: 1, y: 1, who: 2 }, { x: 13, y: 13, who: 2 }, { x: 1, y: 13, who: 2 },
      { x: 13, y: 1, who: 2 }, { x: 0, y: 6, who: 2 }
    ],
    answer: [{ x: 9, y: 7 }, { x: 2, y: 7 }],
    miss: 'arcade.tutor.over.miss'
  }
];

export function isAnswer(lesson: Lesson, cell: number): boolean {
  return lesson.answer.some((a) => cellOf(a.x, a.y) === cell);
}
