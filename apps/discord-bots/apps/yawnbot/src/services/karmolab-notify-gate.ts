/**
 * 알림이 지나는 **단 하나의 문** (TASK-KL-191 축7).
 *
 * 사람이 「이 갈래는 안 받겠다」고 껐으면 그 알림은 **쌓이지도 않아야** 한다. 쌓아 두고
 * 화면에서만 숨기면 「안 읽음 12」가 안 없어지고, 그 수를 없애려고 사람은 결국 종을 통째로
 * 끈다 — 그러면 정말 필요한 알림까지 같이 죽는다.
 *
 * 거르는 자리는 원래 `karmolab-api.ts` 안의 지역 함수였다. 그래서 그 파일 **밖**에서 알리는
 * 곳(흐름 예약)은 문을 안 지났고, 흐름 알림을 꺼 둔 사람에게도 쌓였다. 문을 파일 밖으로
 * 꺼내 놓는다 — 문이 한 파일 안에만 있으면 그 파일 밖은 언제나 뒷문이다.
 *
 * 게이트 `scripts/check-notify-gate.mjs` 가 「이 문을 안 지나는 곳」을 막는다.
 */
import type { KarmolabAccountStore } from './karmolab-accounts';
import type { KarmolabNotificationStore } from './karmolab-notifications';

export type NotifyInput = Parameters<KarmolabNotificationStore['notify']>[0];

/** 받기로 한 사람에게만. 껐으면 조용히 버린다 — 버린 것을 세지도 않는다. */
export function notifyIfWanted(
  accounts: KarmolabAccountStore,
  notes: KarmolabNotificationStore,
  input: NotifyInput,
): boolean {
  if (!accounts.wantsNotification(input.accountId, input.source)) return false;
  notes.notify(input);
  return true;
}
