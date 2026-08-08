/**
 * KarmoLab 알림 — **공용** substrate (TASK-KL-098).
 *
 * 왜 공용인가 (사용자 발화: "알림 기능 같은 경우에는 다른 기능도 함께 쓸 수 있도록 Common하게.
 * 커뮤니티만 쓸 기능은 아닌듯?"): 알림은 커뮤니티의 기능이 아니라 **플랫폼의 기능**이다.
 * 커뮤니티는 첫 사용처일 뿐이고, 도구·계정·봇·앞으로 올 것들이 같은 자리를 쓴다.
 * 그래서 이 파일은 「답글」이나 「좋아요」를 모른다 — 그건 부르는 쪽이 정한다.
 *
 * 왜 필요한가: 내 글에 답글이 달려도 모르면 사람은 안 돌아온다. 커뮤니티가 사는지 죽는지는
 * 여기서 갈린다.
 *
 * 규칙 셋:
 *  - **자기 자신에게는 안 보낸다.** 내가 내 글에 단 답글로 알림이 오면 그 순간 알림을 끈다.
 *  - **같은 일은 묶는다.** 한 글에 답글이 다섯 개 달렸다고 다섯 줄이 쌓이면 못 읽는다.
 *  - **오래된 것은 버린다.** 알림은 쌓아 두는 기록이 아니라 지금 봐야 할 것이다.
 *
 * 저장 = `data/karmolab-notifications-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

export interface Notification {
    id: string;
    /** 받을 사람 (계정 id). */
    accountId: string;
    /**
     * 어디서 온 알림인가 — `community` / `tool` / `account` … 부르는 쪽이 정한다.
     * 화면이 갈래별로 묶거나 끌 수 있게 하려고 둔다.
     */
    source: string;
    /** 한 줄 제목. 목록에서 이것만 보인다. */
    title: string;
    /** 한 줄 더 — 없어도 된다. */
    body: string | null;
    /** 누르면 갈 곳 (사이트 안 상대 주소). */
    url: string | null;
    /**
     * 묶음 열쇠. 같은 열쇠의 알림이 이미 안 읽힌 채로 있으면 **새로 만들지 않고 그것을 올린다**.
     * 예: 한 글의 답글은 전부 같은 열쇠 → 「답글 3개」로 묶인다.
     */
    groupKey: string | null;
    /** 묶인 개수 (1 이면 안 묶인 것). */
    count: number;
    createdAt: string;
    updatedAt: string;
    readAt: string | null;
}

interface NotificationsState {
    version: 1;
    items: Notification[];
    /**
     * 알림을 **디스코드로도** 받기로 한 사람들 (TASK-KL-157).
     *
     * 왜 여기인가: 이건 계정의 성질이 아니라 알림의 성질이다. 「어디로 받을 것인가」는
     * 알림 도메인이 답할 질문이고, 계정 파일에 또 하나의 설정 서랍을 만들지 않는다.
     *
     * 기본은 **꺼짐**이다. 부르지도 않았는데 말 거는 일은 켠 사람에게만 한다.
     */
    discordOn?: string[];
}

const STATE_FILE = 'karmolab-notifications-state.json';

/** 한 사람이 들고 있을 알림 수 상한. 넘으면 오래된 것부터 버린다. */
const MAX_PER_ACCOUNT = 50;

export const TITLE_MAX = 80;
export const BODY_MAX = 120;

export class KarmolabNotificationStore {
    private state: NotificationsState;
    private dirty = false;

    constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
        this.state = this.load();
    }

    private load(): NotificationsState {
        try {
            if (fs.existsSync(this.statePath)) {
                const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<NotificationsState>;
                return { version: 1, items: parsed.items ?? [], discordOn: parsed.discordOn ?? [] };
            }
        } catch (error) {
            console.error('[karmolab-notifications] 상태 파일을 못 읽었다 — 빈 목록으로 시작한다:', error);
        }
        return { version: 1, items: [], discordOn: [] };
    }

    private markDirty(): void {
        this.dirty = true;
    }

    flush(): void {
        if (!this.dirty) return;
        try {
            fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
            const tmp = `${this.statePath}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
            fs.renameSync(tmp, this.statePath);
            this.dirty = false;
        } catch (error) {
            console.error('[karmolab-notifications] 상태 저장 실패:', error);
        }
    }

    /**
     * 알림 하나 보낸다.
     * @param input.actorAccountId 이 일을 한 사람. 받을 사람과 같으면 **안 보낸다**.
     * @returns 실제로 보냈으면 알림, 안 보냈으면 null.
     */
    notify(
        input: {
            accountId: string;
            source: string;
            title: string;
            body?: string | null;
            url?: string | null;
            groupKey?: string | null;
            actorAccountId?: string | null;
        },
        now: Date = new Date(),
    ): Notification | null {
        if (!input.accountId) return null;
        // 내가 한 일로 나에게 알리지 않는다.
        if (input.actorAccountId && input.actorAccountId === input.accountId) return null;

        const at = now.toISOString();
        const title = String(input.title ?? '').trim().slice(0, TITLE_MAX);
        if (!title) return null;
        const body = input.body ? String(input.body).trim().slice(0, BODY_MAX) : null;

        // 같은 열쇠로 아직 안 읽은 것이 있으면 그것을 올린다 (줄이 쌓이지 않게).
        if (input.groupKey) {
            const existing = this.state.items.find(
                (n) => n.accountId === input.accountId && n.groupKey === input.groupKey && n.readAt === null,
            );
            if (existing) {
                existing.count += 1;
                existing.title = title;
                existing.body = body;
                existing.updatedAt = at;
                this.markDirty();
                this.sink?.(existing);
                return existing;
            }
        }

        const notification: Notification = {
            id: crypto.randomUUID(),
            accountId: input.accountId,
            source: input.source,
            title,
            body,
            url: input.url ?? null,
            groupKey: input.groupKey ?? null,
            count: 1,
            createdAt: at,
            updatedAt: at,
            readAt: null,
        };
        this.state.items.unshift(notification);

        // 한 사람이 너무 많이 들고 있지 않게 — 오래된 것부터 버린다.
        const mine = this.state.items.filter((n) => n.accountId === input.accountId);
        if (mine.length > MAX_PER_ACCOUNT) {
            const drop = new Set(mine.slice(MAX_PER_ACCOUNT).map((n) => n.id));
            this.state.items = this.state.items.filter((n) => !drop.has(n.id));
        }

        this.markDirty();
        this.sink?.(notification);
        return notification;
    }

    // ── 어디로 받을 것인가 (TASK-KL-157) ──────────────────────────────────────

    /** 이 사람이 디스코드로도 받기로 했나. */
    discordEnabled(accountId: string): boolean {
        return (this.state.discordOn ?? []).includes(accountId);
    }

    setDiscordEnabled(accountId: string, on: boolean): void {
        const list = new Set(this.state.discordOn ?? []);
        if (on) list.add(accountId);
        else list.delete(accountId);
        this.state.discordOn = [...list];
        this.markDirty();
    }

    /**
     * 알림이 실제로 만들어질 때마다 불린다.
     *
     * 저장소는 디스코드를 **모른다.** 보내는 일은 봇이 있는 자리(합성 지점)에서 꽂는다 —
     * 안 그러면 이 파일이 discord.js 를 끌고 들어와 시험조차 못 돌게 된다.
     */
    private sink: ((notification: Notification) => void) | null = null;

    onNotify(fn: (notification: Notification) => void): void {
        this.sink = fn;
    }

    /** 이 사람의 알림 (새 것부터). */
    listFor(accountId: string, limit = 30): Notification[] {
        return this.state.items
            .filter((n) => n.accountId === accountId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit);
    }

    unreadCount(accountId: string): number {
        return this.state.items.filter((n) => n.accountId === accountId && n.readAt === null).length;
    }

    /** 읽음 표시. id 를 안 주면 그 사람의 것 전부. */
    markRead(accountId: string, id?: string, now: Date = new Date()): number {
        let changed = 0;
        for (const item of this.state.items) {
            if (item.accountId !== accountId || item.readAt !== null) continue;
            if (id && item.id !== id) continue;
            item.readAt = now.toISOString();
            changed += 1;
        }
        if (changed) this.markDirty();
        return changed;
    }
}

let singleton: KarmolabNotificationStore | null = null;

export function getKarmolabNotificationStore(): KarmolabNotificationStore {
    if (!singleton) singleton = new KarmolabNotificationStore();
    return singleton;
}
