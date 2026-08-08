/**
 * 흐름 예약 알림 (TASK-KL-183 B).
 *
 * **서버가 흐름을 대신 돌지 않는다.** 우리 도구는 전부 브라우저 안에서 돌기 때문에 서버가
 * 혼자 할 수 있는 일이 없다 — 할 수 있는 것은 「때가 됐다」고 알리는 것뿐이고, 그것을 정직하게
 * 그 이름으로 부른다. 자동 실행이라고 부르면 안 도는 것을 돈다고 말하는 셈이 된다.
 *
 * 알림은 이미 있는 종(`/kl/notifications`)으로 간다 — 알림 통로를 새로 파지 않는다.
 */
import { kstWeekKey, type KarmolabAccountStore } from './karmolab-accounts';
import { getKarmolabFlowStore, type KarmolabFlowStore } from './karmolab-flows';
import type { KarmolabNotificationStore } from './karmolab-notifications';

/** 30분마다 본다. 정시를 놓쳐도 그 요일 안에서 따라잡는다(노트북이 잠깐 꺼져 있었다고 그 주를 건너뛰지 않게). */
const TICK_MS = 30 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

function kstNow(at: Date = new Date()): { weekday: number; hour: number } {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return { weekday: kst.getUTCDay(), hour: kst.getUTCHours() };
}

/**
 * 한 바퀴 — **손으로도 부를 수 있다**(자동화빚 원장 ①).
 * 시각을 기다려야만 확인되는 자동화는 확인 루프가 없는 것과 같다.
 */
export function runFlowReminderTick(
  accounts: KarmolabAccountStore,
  notes: KarmolabNotificationStore,
  flows: KarmolabFlowStore = getKarmolabFlowStore(),
  now: Date = new Date(),
): number {
  const week = kstWeekKey(now);
  const { weekday, hour } = kstNow(now);
  const due = flows.dueReminders(week, weekday, hour);
  let sent = 0;
  for (const flow of due) {
    const owner = flow.ownerHandle ? accounts.byHandle(flow.ownerHandle) : null;
    // 알릴 사람이 없으면 표시만 하고 넘어간다 — 안 그러면 30분마다 다시 시도한다.
    flows.markReminded(flow.id, week);
    if (!owner) continue;
    /* 누르면 **그 흐름이 바로 시작한다** (TASK-KL-191 축1).
     *
     * 예전엔 흐름 **목록**으로 보냈다 — 알림을 눌러 놓고 목록에서 다시 찾아 다시 눌러야 했다.
     * 서버가 대신 돌 수 없는 것은 그대로지만, **사람의 손이 한 번으로 줄어드는 것**은 서버가
     * 할 수 있는 일이다. 스스로 이어가기가 켜진 흐름이면 그 한 번이 끝까지 간다. */
    notes.notify({
      accountId: owner.id,
      source: 'flow',
      title: `「${flow.title}」 할 때예요`,
      body: flow.auto ? `${flow.steps.length}단계 · 눌러서 시작 (스스로 이어감)` : `${flow.steps.length}단계 · 눌러서 시작`,
      url: `/karmolab/?flow=${encodeURIComponent(flow.id)}#flow`,
      groupKey: `flow:${flow.id}`,
    });
    sent += 1;
  }
  // 0건이어도 한 줄 남긴다 — 조용한 자동화는 살아 있는지 죽었는지 구분이 안 된다.
  console.log(`[karmolab-flow-reminder] ${week} ${weekday}요일 ${hour}시 · 알림 ${sent}건`);
  return sent;
}

export function startFlowReminder(
  accounts: KarmolabAccountStore,
  notes: KarmolabNotificationStore,
  flows: KarmolabFlowStore = getKarmolabFlowStore(),
): void {
  if (timer) return;
  runFlowReminderTick(accounts, notes, flows);
  timer = setInterval(() => runFlowReminderTick(accounts, notes, flows), TICK_MS);
  console.log('[karmolab-flow-reminder] 흐름 예약 감시 시작 (30분마다 · 서버가 대신 돌지는 않는다)');
}

export function stopFlowReminder(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
