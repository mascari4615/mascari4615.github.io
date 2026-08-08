/**
 * 알림 → 디스코드 DM (TASK-KL-157).
 *
 * 여기서 지키려는 것: **묶인 알림이 도배가 되지 않는다.** 사이트 종은 「답글 3개」로 묶이지만,
 * DM 은 묶이지 않는다 — 막지 않으면 답글 하나마다 한 통씩 간다. 그건 알림이 아니라 괴롭힘이다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { dmTextFor, shouldSend, resetRepeatGuard } from './karmolab-notify-discord';
import { KarmolabNotificationStore, type Notification } from './karmolab-notifications';

function note(overrides: Partial<Notification> = {}): Notification {
    return {
        id: 'n1',
        accountId: 'a1',
        source: 'community',
        title: '내 글에 답글이 달렸어요',
        body: '무슨 글 — 연보라 수달',
        url: '/karmolab/?p=123#community',
        groupKey: 'post-reply:123',
        count: 1,
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:00.000Z',
        readAt: null,
        ...overrides,
    };
}

beforeEach(() => resetRepeatGuard());

describe('DM 한 줄', () => {
    it('알림이 가진 것만 쓴다 — 제목·몸통·눌러 들어올 주소', () => {
        const text = dmTextFor(note());
        expect(text).toContain('내 글에 답글이 달렸어요');
        expect(text).toContain('연보라 수달');
        expect(text).toContain('https://blog.mascari4615.com/karmolab/?p=123#community');
    });

    it('묶인 알림은 몇 개인지 함께 적는다', () => {
        expect(dmTextFor(note({ count: 3 }))).toContain('(3)');
    });

    it('주소가 없으면 주소 줄도 없다 (빈 링크를 만들지 않는다)', () => {
        expect(dmTextFor(note({ url: null }))).not.toContain('https://');
    });
});

describe('도배 막기', () => {
    it('같은 묶음은 잠깐 동안 한 번만 간다', () => {
        const now = Date.now();
        expect(shouldSend(note(), now)).toBe(true);
        // 같은 글에 답글이 둘 더 달려도 DM 은 한 통이다.
        expect(shouldSend(note({ id: 'n2', count: 2 }), now + 1000)).toBe(false);
        expect(shouldSend(note({ id: 'n3', count: 3 }), now + 2000)).toBe(false);
        // 시간이 충분히 지나면 다시 알린다 — 영영 막으면 그건 알림을 끈 것이다.
        expect(shouldSend(note({ id: 'n4', count: 4 }), now + 11 * 60 * 1000)).toBe(true);
    });

    it('다른 사람 것끼리는 서로 안 막는다', () => {
        const now = Date.now();
        expect(shouldSend(note({ accountId: 'a1' }), now)).toBe(true);
        expect(shouldSend(note({ accountId: 'a2' }), now)).toBe(true);
    });

    it('묶음 열쇠가 없으면 알림마다 따로 센다', () => {
        const now = Date.now();
        expect(shouldSend(note({ groupKey: null, id: 'x1' }), now)).toBe(true);
        expect(shouldSend(note({ groupKey: null, id: 'x2' }), now)).toBe(true);
    });
});

describe('어디로 받을 것인가', () => {
    it('기본은 꺼짐이고, 켜면 다시 켜도 남는다', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl157-notes-'));
        const file = path.join(dir, 'notes.json');
        const first = new KarmolabNotificationStore(file);
        // 부르지도 않았는데 말 거는 일이다 — 기본은 꺼짐이어야 한다.
        expect(first.discordEnabled('a1')).toBe(false);
        first.setDiscordEnabled('a1', true);
        first.flush();

        const second = new KarmolabNotificationStore(file);
        expect(second.discordEnabled('a1')).toBe(true);
        second.setDiscordEnabled('a1', false);
        expect(second.discordEnabled('a1')).toBe(false);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('알림이 생기면 창구가 그 알림을 그대로 받는다 (묶인 것도)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl157-sink-'));
        const store = new KarmolabNotificationStore(path.join(dir, 'notes.json'));
        const seen: Notification[] = [];
        store.onNotify((n) => seen.push(n));

        store.notify({ accountId: 'a1', source: 'community', title: '첫 알림', groupKey: 'g1' });
        store.notify({ accountId: 'a1', source: 'community', title: '같은 묶음', groupKey: 'g1' });
        expect(seen.length).toBe(2);
        // 묶였으므로 저장된 줄은 하나고, 그 줄의 개수가 올라간다.
        expect(store.listFor('a1').length).toBe(1);
        expect(seen[1].count).toBe(2);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
