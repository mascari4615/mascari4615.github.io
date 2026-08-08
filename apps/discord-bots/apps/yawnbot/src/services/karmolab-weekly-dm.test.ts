/**
 * 주간 발자국 DM (TASK-KL-156 D6).
 *
 * 여기서 틀리면 **부르지도 않은 사람에게 말을 건다** — 알림은 한 번 잘못 가면 그 채널이 통째로
 * 꺼진다. 그래서 「켠 사람만」·「같은 주에 한 번」·「빈 주엔 안 보냄」을 눈으로 박는다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabAccountStore, kstWeekKey } from './karmolab-accounts';
import { weeklyMessage } from './karmolab-weekly-dm';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl156-weekly-'));
  statePath = path.join(tmpDir, 'state.json');
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const discordUser = { discordId: '42', username: 'tester', displayName: '시험용', avatarUrl: null };

describe('주간 발자국 DM (KL-156 D6)', () => {
  it('기본은 꺼짐 — 켠 사람만 대상이 된다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    expect(store.weeklyDmOn(account.id)).toBe(false);
    expect(store.weeklyDmTargets()).toEqual([]);

    store.setWeeklyDm(account.id, true);
    expect(store.weeklyDmTargets().map((t) => t.discordId)).toEqual(['42']);
  });

  it('같은 주에 두 번 안 간다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    store.setWeeklyDm(account.id, true);
    const week = kstWeekKey();

    store.markWeeklyDmSent(account.id, week);
    expect(store.weeklyDmTargets(week)).toEqual([]);
    // 다음 주가 되면 다시 대상이다
    expect(store.weeklyDmTargets('2099-W01').map((t) => t.discordId)).toEqual(['42']);
  });

  it('아무것도 안 한 주에는 보낼 글이 없다 — 「0일」을 보내는 건 잔소리다', () => {
    const empty = {
      days: {},
      tools: {},
      totals: { opens: 0, activeDays: 0, distinctTools: 0 },
      streak: { current: 0, longest: 0 },
    };
    expect(weeklyMessage('시험용', empty)).toBeNull();
  });

  it('지난 7일만 센다 — 통산을 보내면 매주 같은 글이 간다', () => {
    const now = new Date('2026-08-10T01:00:00Z'); // KST 2026-08-10 10:00
    const yesterday = '2026-08-09';
    const longAgo = '2026-01-01';
    const text = weeklyMessage(
      '시험용',
      {
        days: { [yesterday]: 3, [longAgo]: 99 },
        tools: { pet: 5 },
        totals: { opens: 102, activeDays: 2, distinctTools: 1 },
        streak: { current: 2, longest: 9 },
      },
      now,
    );
    expect(text).toContain('다녀간 날 1일');
    expect(text).toContain('도구 3번');
    expect(text).not.toContain('102');
    // 끄는 길을 글 안에 적는다 — 알림은 끄는 법이 같이 와야 한다
    expect(text).toContain('끄기');
  });
});
