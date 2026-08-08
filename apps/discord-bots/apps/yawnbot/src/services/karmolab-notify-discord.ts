/**
 * 알림을 디스코드로도 보낸다 (TASK-KL-157).
 *
 * 왜 있나: 답글이 달려도 사이트에 다시 들어와야만 안다. 종은 사이트 안에서만 울린다 —
 * 그 사람이 사이트를 안 열고 있으면 그 알림은 없는 것과 같고, 커뮤니티는 거기서 식는다.
 * 그런데 우리는 **그 사람과 이미 대화하는 창**을 가지고 있다. 남들이 메일 시스템을 붙여
 * 푸는 자리를, 우리는 이미 가진 것으로 푼다 (주간 발자국 DM 과 같은 생각).
 *
 * 왜 여기인가 (합성 지점): 알림 저장소는 디스코드를 몰라야 한다. 저장소가 discord.js 를
 * 끌고 들어오면 시험조차 못 돌린다. 그래서 저장소는 「알림이 생겼다」만 알리고(sink),
 * 봇이 살아 있는 이 자리에서 그것을 DM 으로 옮긴다.
 *
 * 규율 셋:
 *  ① **켠 사람에게만** 간다 (기본 꺼짐).
 *  ② 묶인 알림은 **한 번만** 보낸다 — 「답글 3개」로 묶이는 알림이 세 번 오면 그게 곧 도배다.
 *  ③ 보내다 실패해도 사이트 알림은 그대로다. DM 은 덤이지 본체가 아니다.
 */
import type { Client, DMChannel } from 'discord.js';
import type { KarmolabAccountStore } from './karmolab-accounts';
import type { KarmolabNotificationStore, Notification } from './karmolab-notifications';

/** 이 사이트 주소 — DM 한 줄에서 바로 눌러 들어올 수 있게. */
const SITE = 'https://blog.mascari4615.com';

/** 같은 알림을 짧은 시간에 다시 보내지 않는다. 열쇠 → 마지막으로 보낸 시각. */
const lastSent = new Map<string, number>();
const REPEAT_GUARD_MS = 10 * 60 * 1000;

/** DM 한 줄. 알림이 가진 것만 쓴다 — 여기서 새로 지어내지 않는다. */
export function dmTextFor(notification: Notification): string {
    const head = notification.count > 1 ? `${notification.title} (${notification.count})` : notification.title;
    const body = notification.body ? `\n${notification.body}` : '';
    const link = notification.url ? `\n${SITE}${notification.url}` : '';
    return `🔔 ${head}${body}${link}`;
}

/**
 * 지금 이 알림을 보내야 하나.
 *
 * 묶임 열쇠가 있으면 그것으로, 없으면 알림 id 로 센다. 묶인 알림은 같은 줄이 계속 올라오므로
 * 열쇠로 막지 않으면 답글 하나마다 DM 이 한 통씩 간다.
 */
export function shouldSend(notification: Notification, now: number = Date.now()): boolean {
    const key = `${notification.accountId}|${notification.groupKey ?? notification.id}`;
    const previous = lastSent.get(key);
    if (previous !== undefined && now - previous < REPEAT_GUARD_MS) return false;
    lastSent.set(key, now);
    return true;
}

/** 시험에서 상태를 비운다 — 안 그러면 앞 시험이 남긴 열쇠가 뒤 시험을 막는다. */
export function resetRepeatGuard(): void {
    lastSent.clear();
}

/**
 * 알림 저장소에 디스코드 창구를 꽂는다. 봇이 준비된 뒤 한 번만 부른다.
 */
export function wireDiscordNotifications(
    client: Client,
    notes: KarmolabNotificationStore,
    accounts: KarmolabAccountStore,
): void {
    notes.onNotify((notification) => {
        if (!notes.discordEnabled(notification.accountId)) return;
        if (!shouldSend(notification)) return;

        const account = accounts.byId(notification.accountId);
        const discordId = account?.identities.discord?.discordId;
        if (!discordId) return;

        void (async () => {
            try {
                const user = await client.users.fetch(discordId);
                const dm = (await user.createDM()) as DMChannel;
                await dm.send(dmTextFor(notification).slice(0, 1900));
            } catch (error) {
                /* 상대가 DM 을 닫아 뒀거나 봇이 잠깐 못 붙었을 수 있다.
                   사이트 알림은 이미 남았으므로 여기서 실패해도 잃는 것은 없다. */
                console.warn('[karmolab-notify-discord] DM 실패:', error);
            }
        })();
    });
}
