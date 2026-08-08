/**
 * 주간 발자국 DM (TASK-KL-156 D6).
 *
 * 왜 있나: Duolingo·Strava 가 주간 리포트로 사람을 다시 데려온다. 그들은 그걸 하려고 메일
 * 시스템을 붙인다 — 우리는 **그 사람과 이미 대화하는 창(디스코드)**을 가지고 있다.
 * 남들이 제일 비싸게 붙이는 자리를 우리는 이미 가진 것으로 한다.
 *
 * 규율 셋:
 *  ① **켠 사람에게만** 간다 (기본 꺼짐). 부르지도 않았는데 말 거는 일이다.
 *  ② 같은 주에 두 번 안 간다 (`weeklyDmSentWeek`).
 *  ③ 값은 전부 실측이다. 지어낸 수는 한 개도 없고, 아무것도 안 한 주는 **안 보낸다** —
 *     「이번 주 0일」을 보내는 것은 알림이 아니라 잔소리다.
 */
import type { Client, DMChannel } from 'discord.js';
import { getKarmolabAccountStore, kstWeekKey, type KarmolabAccountStore } from './karmolab-accounts';
import { notifyIfWanted } from './karmolab-notify-gate';
import { getKarmolabNotificationStore, type KarmolabNotificationStore } from './karmolab-notifications';

/** 얼마나 자주 「보낼 때인가」를 보나. 정시를 놓쳐도 다음 시각에 따라잡는다. */
const TICK_MS = 30 * 60 * 1000;

/** 월요일 오전 10시(KST). 주말이 끝나고 한 주가 시작될 때 지난주를 돌아본다. */
const SEND_DAY = 1;
const SEND_HOUR = 10;

let timer: ReturnType<typeof setInterval> | null = null;

/** 지금이 KST 로 며칠 몇 시인가. */
function kstNow(at: Date = new Date()): { day: number; hour: number } {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return { day: kst.getUTCDay(), hour: kst.getUTCHours() };
}

/**
 * 보낼 글 한 덩이. 실측값만 쓰고, 쓸 말이 없으면 `null` 을 준다(그러면 안 보낸다).
 */
export function weeklyMessage(
  displayName: string,
  activity: {
    days: Record<string, number>;
    tools: Record<string, number>;
    totals: { opens: number; activeDays: number; distinctTools: number };
    streak: { current: number; longest: number };
  },
  now: Date = new Date(),
): string | null {
  // 지난 7일치만 본다 — 「주간」이라면서 통산을 보내면 매주 같은 글이 간다.
  const days: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(now.getTime() + 9 * 60 * 60 * 1000 - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  const came = days.filter((day) => activity.days[day] !== undefined);
  const opens = came.reduce((sum, day) => sum + (activity.days[day] ?? 0), 0);
  if (came.length === 0) return null; // 안 온 주에 「0일」을 보내는 건 알림이 아니라 잔소리다.

  const top = Object.entries(activity.tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => `${id}(${count})`);

  const lines = [
    `🌱 ${displayName} 님의 지난 주 KarmoLab`,
    `· 다녀간 날 ${came.length}일 · 도구 ${opens}번`,
    `· 지금 연속 ${activity.streak.current}일 (최장 ${activity.streak.longest}일)`,
  ];
  if (top.length) lines.push(`· 많이 쓴 것: ${top.join(' · ')}`);
  lines.push('', '끄기: 내 정보 › 계정 › 주간 발자국');
  return lines.join('\n');
}

/**
 * 30분마다 「보낼 때인가」를 보고, 맞으면 켠 사람들에게 보낸다.
 *
 * 정확히 10:00 을 노리지 않는다 — 노트북이 잠깐 꺼져 있었다고 그 주를 통째로 건너뛰면
 * 안 된다. 그날 10시가 지났고 이번 주에 아직 안 보냈으면 보낸다.
 */
/**
 * 한 바퀴 돌린다 — **손으로도 부를 수 있다** (자동화빚 원장 ①).
 *
 * 시각을 기다리는 것 말고 지금 당장 돌려 볼 길이 없으면, 「보내지는가」를 확인하려면
 * 월요일 아침까지 기다려야 한다. 그건 확인 루프가 없는 것과 같다.
 * `force` 를 주면 보낼 시각인지 안 따진다 (그 외 규칙 — 켠 사람만·주 1회 — 은 그대로다).
 */
export async function runKarmolabWeeklyDmTick(
  client: Client,
  store: KarmolabAccountStore = getKarmolabAccountStore(),
  options: { force?: boolean; notes?: KarmolabNotificationStore } = {},
): Promise<void> {
  const { day, hour } = kstNow();
  if (!options.force && (day !== SEND_DAY || hour < SEND_HOUR)) return;
  const week = kstWeekKey();
  for (const target of store.weeklyDmTargets(week)) {
    const text = weeklyMessage(target.displayName, store.footprintFor(target.accountId));
    // 보낼 말이 없어도 **보낸 것으로 적는다** — 안 그러면 30분마다 다시 시도한다.
    store.markWeeklyDmSent(target.accountId, week);
    if (!text) continue;
    /* 사이트 안에도 남긴다 (TASK-KL-191 축7).
     *
     * 지난 주 발자국은 디스코드 DM 으로만 갔다 — DM 을 닫아 둔 사람에게는 **아무 데도**
     * 안 남았고, 그건 그 사람 입장에서 켠 적 없는 기능과 같다. 종은 사이트 안의 한 자리라
     * DM 이 막혀도 닿는다. 거르는 문은 여기서도 지난다. */
    {
      /* 기본으로 켜져 있다 — 넣어 줄 때만 도는 기능은 실서비스에서 한 번도 안 돈다
       * (시험만 통과하는 자리가 된다). 시험은 자기 원장을 건네서 격리한다. */
      const notes = options.notes ?? getKarmolabNotificationStore();
      notifyIfWanted(store, notes, {
        accountId: target.accountId,
        source: 'weekly',
        title: '지난 주 발자국',
        body: text.split('\n').slice(1, 3).join(' ').replace(/^·\s*/, ''),
        url: '/karmolab/#user',
        groupKey: `weekly:${week}`,
      });
    }
    try {
      const user = await client.users.fetch(target.discordId);
      const dm = (await user.createDM()) as DMChannel;
      await dm.send(text.slice(0, 1900));
      console.log(`[karmolab-weekly] 보냄 — ${target.displayName}`);
    } catch (error) {
      // DM 을 닫아 둔 사람도 있다. 그건 고장이 아니라 그 사람의 선택이다.
      console.warn('[karmolab-weekly] 못 보냈다:', error instanceof Error ? error.message : error);
    }
  }
}

export function startKarmolabWeeklyDm(client: Client, store: KarmolabAccountStore = getKarmolabAccountStore()): void {
  if (timer) return;
  const tick = (): Promise<void> => runKarmolabWeeklyDmTick(client, store);
  void tick();
  timer = setInterval(() => void tick(), TICK_MS);
  console.log('[karmolab-weekly] 주간 발자국 DM 감시 시작 (월 10시 KST, 켠 사람만)');
}

export function stopKarmolabWeeklyDm(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
