/**
 * 격자 판 공용 (2026-09-02 감사 B4)
 *
 * 규칙 파일 열 개가 `xy`, `idx`, `DIRS` 를 각자 적고 있었음. 한 벌로.
 * 판 크기가 다르므로 `grid(n)` 이 그 크기의 변환 함수 둘을 만듦
 */

/** 줄 방향 넷. 가로, 세로, 대각 둘. 오목, 사목처럼 이어진 것을 세는 판 */
export const LINE_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** 여덟 방향. 리버시처럼 둘레를 다 보는 판 */
export const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
];

/** 상하좌우. 뱀처럼 움직이는 판 (위, 오른쪽, 아래, 왼쪽 차례) */
export const STEP_DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export interface Grid {
  /** 칸 번호에서 (x, y) */
  xy: (c: number) => [number, number];
  /** (x, y) 에서 칸 번호. 판 밖이면 -1 */
  idx: (x: number, y: number) => number;
}

/** n x n 정사각 판의 변환 둘 */
export function grid(n: number): Grid {
  return {
    xy: (c) => [c % n, Math.floor(c / n)],
    idx: (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? -1 : y * n + x)
  };
}

/** 두 자리 승부의 점수. 이긴 자리가 1 */
export const duel = (win: number): [number, number] => (win === 0 ? [1, 0] : [0, 1]);
