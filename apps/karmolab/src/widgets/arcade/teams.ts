/**
 * 편 가르기 — 자리를 둘로 묶는다 (TASK-KL-264 E1)
 *
 * 커널을 안 건드린다. 자리는 그대로 각자 점수를 내고, **묶어서 합치는 것은 좌석·화면 층**의
 * 일이다. 그래서 게임 파일 51개는 편이 있다는 것을 모르고, 그러면서도 제기·두더지·눈치가
 * 그날로 새 놀이가 된다 — 「내가 잘하기」가 「우리가 잘하기」로 바뀌면 같은 규칙이 달리 놀린다.
 *
 * **번갈아 앉힌다**(0,1,0,1…). 앞자리 둘을 한 편으로 묶으면 차례가 도는 놀이에서 한 편이
 * 연달아 두게 되어 판이 기운다 — 자리 순서가 곧 차례인 놀이가 절반이다.
 *
 * 여기서 안 하는 것: **봇끼리 협동하게 만들기.** 그건 게임마다 뜻이 달라(눈치의 협동과
 * 제기의 협동은 다른 것이다) 바깥에서 아는 척하면 51개 중 어딘가는 반드시 망가진다.
 * 편은 「점수를 어떻게 세나」까지다 — 그 선을 넘지 않는 것이 이 파일이 작은 이유다.
 */

/** 자리 → 편 번호. 편은 둘뿐이다(셋 이상은 편이 아니라 그냥 개인전이다). */
export type Plan = number[];

export const TEAM_NAMES = ['청', '홍'];

/** 자리 수만큼 번갈아 나눈다. */
export function split(seats: number): Plan {
  return Array.from({ length: seats }, (_, i) => i % 2);
}

/** 편이 성립하나 — 한 편에 둘 이상씩 있어야 편이다. */
export function isTeamy(seats: number): boolean {
  return seats >= 4;
}

/** 편별 점수 = 그 편 자리들의 합. */
export function teamScores(plan: Plan, seatScores: number[]): number[] {
  const out = [0, 0];
  seatScores.forEach((s, i) => {
    const t = plan[i];
    if (t === 0 || t === 1) out[t] += s;
  });
  return out;
}

/** 내 편이 이겼나 — 비겼으면 null. */
export function winner(plan: Plan, seatScores: number[]): number | null {
  const [a, b] = teamScores(plan, seatScores);
  return a === b ? null : a > b ? 0 : 1;
}
