/**
 * 한 판이 얼마나 걸리나 — 손으로 안 적고 **잰 수에서 뽑는다** (TASK-KL-264 E4)
 *
 * 로비에서 「지금 5분밖에 없다」는 아주 흔한 상황이다. 51개를 늘어놓고 이름만 보여 주면
 * 그 사람은 아무것도 못 고른다 — 무엇이 짧은지 알 길이 없기 때문이다.
 *
 * 태그를 **손으로 51개에 붙이지 않는다.** 저울(`bench:arcade`)이 이미 게임마다 봇끼리 200판을
 * 돌려 평균 몇 초인지 적어 뒀다. 손으로 붙이면 두 벌이 되고, 게임을 고치면 한쪽만 낡는다.
 *
 * 정직하게: 이 수는 **봇끼리** 잰 것이다. 사람이 뜸 들이면 더 걸린다. 그래도 「어느 것이 더
 * 짧은가」의 순서는 사람이 해도 뒤집히지 않는다 — 로비에서 필요한 건 그 순서다.
 */
import balance from '../../../data/arcade-balance.json';

export type Length = 'short' | 'mid' | 'long';

/** 가른 자리: 30초·90초. 51개가 23 / 22 / 6 으로 갈린다(2026-08-13 실측). */
const SHORT = 30;
const MID = 90;

const SECONDS: Record<string, number> = Object.fromEntries(
  (balance.game as Array<{ id: string; avgSeconds: number }>).map((g) => [g.id, g.avgSeconds])
);

/** 잰 적 없는 게임은 「보통」으로 둔다 — 없는 수를 0으로 치면 새 게임이 늘 「짧다」가 된다. */
export function secondsOf(id: string): number | null {
  return SECONDS[id] ?? null;
}

export function lengthOf(id: string): Length {
  const s = SECONDS[id];
  if (s === undefined) return 'mid';
  return s <= SHORT ? 'short' : s <= MID ? 'mid' : 'long';
}
