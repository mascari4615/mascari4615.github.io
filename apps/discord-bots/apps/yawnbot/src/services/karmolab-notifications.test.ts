/**
 * TASK-KL-098 — 공용 알림 시험.
 *
 * 여기서 틀리면 두 방향으로 나쁘다: 알림이 **안 가서** 사람이 안 돌아오거나,
 * 알림이 **너무 가서** 사람이 알림을 꺼 버린다. 둘 다 커뮤니티를 죽인다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabNotificationStore } from './karmolab-notifications';

let tmpDir: string;
let statePath: string;
let notes: KarmolabNotificationStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl098-notif-'));
  statePath = path.join(tmpDir, 'state.json');
  notes = new KarmolabNotificationStore(statePath);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const base = { accountId: 'me', source: 'community', title: '답글이 달렸어요' };

describe('알림 — 공용', () => {
  it('내가 한 일로 나에게는 안 온다', () => {
    expect(notes.notify({ ...base, actorAccountId: 'me' })).toBeNull();
    expect(notes.unreadCount('me')).toBe(0);
  });

  it('남이 한 일은 온다', () => {
    expect(notes.notify({ ...base, actorAccountId: 'other' })).not.toBeNull();
    expect(notes.unreadCount('me')).toBe(1);
  });

  it('같은 열쇠는 묶인다 — 답글 다섯 개가 다섯 줄이 되면 못 읽는다', () => {
    for (let i = 0; i < 5; i += 1) {
      notes.notify({ ...base, actorAccountId: `other-${i}`, groupKey: 'post-reply:p1' });
    }
    const list = notes.listFor('me');
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(5);
    expect(notes.unreadCount('me')).toBe(1);
  });

  it('읽고 나면 다시 새 줄로 온다 — 묶임은 안 읽은 것끼리만', () => {
    notes.notify({ ...base, actorAccountId: 'a', groupKey: 'g' });
    notes.markRead('me');
    notes.notify({ ...base, actorAccountId: 'b', groupKey: 'g' });
    expect(notes.listFor('me')).toHaveLength(2);
    expect(notes.unreadCount('me')).toBe(1);
  });

  it('열쇠가 다르면 따로 쌓인다', () => {
    notes.notify({ ...base, actorAccountId: 'a', groupKey: 'post:1' });
    notes.notify({ ...base, actorAccountId: 'a', groupKey: 'post:2' });
    expect(notes.unreadCount('me')).toBe(2);
  });

  it('하나만 읽을 수도, 전부 읽을 수도 있다', () => {
    const first = notes.notify({ ...base, actorAccountId: 'a', groupKey: 'x' })!;
    notes.notify({ ...base, actorAccountId: 'a', groupKey: 'y' });
    expect(notes.markRead('me', first.id)).toBe(1);
    expect(notes.unreadCount('me')).toBe(1);
    expect(notes.markRead('me')).toBe(1);
    expect(notes.unreadCount('me')).toBe(0);
  });

  it('남의 알림은 안 보이고 못 읽는다', () => {
    notes.notify({ ...base, accountId: 'you', actorAccountId: 'a' });
    expect(notes.listFor('me')).toHaveLength(0);
    expect(notes.markRead('me')).toBe(0);
    expect(notes.unreadCount('you')).toBe(1);
  });

  it('제목이 비면 안 보낸다', () => {
    expect(notes.notify({ ...base, title: '   ', actorAccountId: 'a' })).toBeNull();
  });

  it('한 사람이 너무 많이 들고 있지 않는다', () => {
    for (let i = 0; i < 60; i += 1) {
      notes.notify({ ...base, actorAccountId: 'a', groupKey: `g-${i}` });
    }
    expect(notes.listFor('me', 100).length).toBeLessThanOrEqual(50);
  });

  it('다시 켜도 알림이 남는다', () => {
    notes.notify({ ...base, actorAccountId: 'a' });
    notes.flush();
    expect(new KarmolabNotificationStore(statePath).unreadCount('me')).toBe(1);
  });

  it('상태 파일이 깨져도 기동한다', () => {
    fs.writeFileSync(statePath, 'broken', 'utf-8');
    const reopened = new KarmolabNotificationStore(statePath);
    expect(reopened.unreadCount('me')).toBe(0);
    expect(() => reopened.notify({ ...base, actorAccountId: 'a' })).not.toThrow();
  });
});
