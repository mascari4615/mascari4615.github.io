/**
 * 주간 미션 (TASK-KL-182 F1).
 *
 * 여기가 틀리면 **한 번도 못 깨는 미션**이나 **첫 주에 다 깨지는 미션**이 나온다 —
 * 둘 다 화면은 멀쩡하고 숫자만 이상하다.
 */
import { describe, it, expect } from 'vitest';
import { missionsOfWeek, weekProgress, SEASON_WEEKS } from './karmolab-missions';

describe('주간 미션 (KL-182 F1)', () => {
  it('같은 주면 같은 미션 — 서로 이야기할 수 있어야 미션이다', () => {
    expect(missionsOfWeek('2026-W32')).toEqual(missionsOfWeek('2026-W32'));
  });

  it('주가 바뀌면 미션도 바뀐다 (적어도 한 주 건너서는)', () => {
    const weeks = ['2026-W30', '2026-W31', '2026-W32', '2026-W33'].map((w) =>
      missionsOfWeek(w).map((m) => m.id).join(','),
    );
    expect(new Set(weeks).size).toBeGreaterThan(1);
  });

  it('한 주에 세 개 · 같은 종류가 겹치지 않는다', () => {
    for (const week of ['2026-W01', '2026-W17', '2026-W44', '2026-W52']) {
      const missions = missionsOfWeek(week);
      expect(missions).toHaveLength(3);
      expect(new Set(missions.map((m) => m.kind)).size).toBe(3);
    }
  });

  it('진행도는 **이번 주만** 센다 — 통산을 세면 첫 주에 다 깨진다', () => {
    const now = new Date('2026-08-06T01:00:00Z'); // KST 목요일
    const thisWeek = ['2026-08-03', '2026-08-04', '2026-08-06'];
    const lastWeek = ['2026-07-28', '2026-07-29'];
    const days: Record<string, number> = {};
    thisWeek.forEach((d) => (days[d] = 4));
    lastWeek.forEach((d) => (days[d] = 9));

    const progress = weekProgress({ days, tools: { pet: 1, memo: 1 }, streak: { current: 3 } }, now);
    expect(progress.days).toBe(3);
    expect(progress.opens).toBe(12); // 4×3 — 지난주 18 은 안 센다
    expect(progress.streak).toBe(3);
  });

  it('아무것도 안 한 주는 0 — 지어낸 수가 없다', () => {
    const progress = weekProgress({ days: {}, tools: {}, streak: { current: 0 } }, new Date('2026-08-06T01:00:00Z'));
    expect(progress).toEqual({ days: 0, opens: 0, tools: 0, streak: 0 });
  });

  it('시즌은 4주', () => {
    expect(SEASON_WEEKS).toBe(4);
  });
});
