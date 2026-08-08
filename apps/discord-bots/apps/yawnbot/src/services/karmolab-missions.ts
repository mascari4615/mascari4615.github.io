/**
 * 주간 미션과 시즌 (TASK-KL-182 F1).
 *
 * 왜: 발자국(KL-152)은 「내가 무엇을 했나」를 보여 준다. 그런데 **무엇을 해 볼까**는 아무도
 * 말해 주지 않는다 — 도구가 160개면 고르는 것 자체가 일이다.
 * 미션은 그 자리에 놓는 한 줄이다: 이번 주엔 이걸 해 보면 어때요.
 *
 * 성질 셋:
 *  ① **저장하지 않는다.** 미션 목록은 주(週) 이름에서 **계산해서** 나오고, 진행도는 발자국에서
 *     그때그때 센다. 따로 적어 두면 두 벌이 갈라지고, 갈라진 순간 숫자가 거짓이 된다.
 *  ② 매주 같은 사람에게 같은 미션이 나온다(주 이름이 씨앗) — 그래야 「이번 주 미션」을 서로
 *     이야기할 수 있다. 사람마다 다르면 그건 미션이 아니라 광고다.
 *  ③ 판정은 **실측만**. 할 수 없는 것을 미션으로 내지 않는다.
 */
import { kstWeekKey, type KarmolabAccountStore } from './karmolab-accounts';

export interface Mission {
  id: string;
  title: string;
  /** 목표치 */
  goal: number;
  /** 무엇을 세나 — 판정이 이 이름 하나로 갈린다 */
  kind: 'days' | 'tools' | 'opens' | 'streak';
}

/** 시즌 = 4주. 짧으면 정산이 잦아 지치고, 길면 시작한 주가 기억에서 사라진다. */
export const SEASON_WEEKS = 4;

/** 이번 주에 낼 수 있는 미션 후보. 전부 **발자국만으로 판정된다** — 셀 수 없는 것은 안 낸다. */
const POOL: Mission[] = [
  { id: 'days-3', title: '이번 주 3일 다녀가기', goal: 3, kind: 'days' },
  { id: 'days-5', title: '이번 주 5일 다녀가기', goal: 5, kind: 'days' },
  { id: 'tools-3', title: '안 써 본 것 포함 도구 3가지 열기', goal: 3, kind: 'tools' },
  { id: 'tools-5', title: '도구 5가지 열기', goal: 5, kind: 'tools' },
  { id: 'opens-10', title: '도구를 10번 열기', goal: 10, kind: 'opens' },
  { id: 'opens-20', title: '도구를 20번 열기', goal: 20, kind: 'opens' },
  { id: 'streak-3', title: '3일 연속 오기', goal: 3, kind: 'streak' },
  { id: 'streak-7', title: '7일 연속 오기', goal: 7, kind: 'streak' },
];

/** 주 이름을 숫자로 — 같은 주면 어느 서버에서 돌려도 같은 미션이 나온다. */
function seedOf(week: string): number {
  let hash = 0;
  for (let i = 0; i < week.length; i += 1) hash = (hash * 31 + week.charCodeAt(i)) >>> 0;
  return hash;
}

/** 이번 주 미션 셋 — 겹치지 않게 고른다(같은 종류 두 개는 미션이 아니라 반복이다). */
export function missionsOfWeek(week: string = kstWeekKey()): Mission[] {
  const seed = seedOf(week);
  const picked: Mission[] = [];
  const usedKinds = new Set<string>();
  for (let step = 0; step < POOL.length && picked.length < 3; step += 1) {
    const mission = POOL[(seed + step * 3) % POOL.length];
    if (usedKinds.has(mission.kind)) continue;
    usedKinds.add(mission.kind);
    picked.push(mission);
  }
  return picked;
}

/** 이번 주 며칠·몇 번·몇 가지였나 — 발자국에서 그때그때 센다. */
export function weekProgress(
  activity: { days: Record<string, number>; tools: Record<string, number>; streak: { current: number } },
  now: Date = new Date(),
): { days: number; opens: number; tools: number; streak: number } {
  // 이번 주(월~일, KST)의 날짜 칸만 본다 — 통산을 세면 첫 주에 모든 미션이 끝난다.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    keys.push(day.toISOString().slice(0, 10));
  }
  const mine = keys.filter((key) => activity.days[key] !== undefined);
  return {
    days: mine.length,
    opens: mine.reduce((sum, key) => sum + (activity.days[key] ?? 0), 0),
    // 「몇 가지」는 이번 주만 따로 셀 수 없다(도구별 날짜를 안 적는다) — 통산 가짓수를 쓴다.
    // 이 사실을 화면에도 적는다. 모르는 것을 아는 척하지 않는다.
    tools: Object.keys(activity.tools).length,
    streak: activity.streak.current,
  };
}

export function missionState(
  store: KarmolabAccountStore,
  accountId: string,
  now: Date = new Date(),
): {
  week: string;
  seasonWeek: number;
  missions: Array<Mission & { now: number; done: boolean }>;
  clearedThisWeek: number;
} {
  const week = kstWeekKey(now);
  const activity = store.footprintFor(accountId, now);
  const progress = weekProgress(activity, now);
  const missions = missionsOfWeek(week).map((mission) => {
    const value = progress[mission.kind];
    return { ...mission, now: value, done: value >= mission.goal };
  });
  // 시즌 안에서 몇 째 주인가 (1~4). 주 번호를 4로 나눈 나머지라 서버가 아무것도 안 적어도 된다.
  const weekNumber = Number(week.slice(-2)) || 1;
  return {
    week,
    seasonWeek: ((weekNumber - 1) % SEASON_WEEKS) + 1,
    missions,
    clearedThisWeek: missions.filter((mission) => mission.done).length,
  };
}
