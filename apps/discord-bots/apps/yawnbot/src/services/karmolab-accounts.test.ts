/**
 * TASK-KL-098 — 계정 저장소 시험.
 *
 * 여기서 틀리면 **사용자 기록이 조용히 사라진다** (에러도 안 나고, 다음에 열었을 때
 * 도전과제가 비어 있을 뿐이다). 그래서 합치기·다시 저장·세션을 눈으로 볼 수 있게 박는다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabAccountStore, mergeRecords, slugifyHandle, emptyRecords } from './karmolab-accounts';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl098-'));
  statePath = path.join(tmpDir, 'karmolab-accounts-state.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const discordUser = {
  discordId: '1234567890',
  username: 'Mascari4615',
  displayName: '마스카리',
  avatarUrl: 'https://cdn.discordapp.com/avatars/1234567890/abc.png',
};

describe('mergeRecords — 어느 쪽도 잃지 않는다', () => {
  it('도전과제·뱃지는 합집합', () => {
    const a = { ...emptyRecords(), achievements: ['pet_100'], badges: ['early'] };
    const b = { ...emptyRecords(), achievements: ['first_chat'], badges: ['early', 'night'] };
    const merged = mergeRecords(a, b);
    expect(merged.achievements).toEqual(['first_chat', 'pet_100']);
    expect(merged.badges).toEqual(['early', 'night']);
  });

  it('누적값은 큰 쪽이 이긴다 — 낡은 기기가 올려도 안 깎인다', () => {
    const a = { ...emptyRecords(), progress: { pet_strokes: 12000 } };
    const b = { ...emptyRecords(), progress: { pet_strokes: 30, chat_count: 5 } };
    expect(mergeRecords(a, b).progress).toEqual({ pet_strokes: 12000, chat_count: 5 });
  });

  it('연속기록은 최장·최신을 남기고, 최장은 현재보다 작아지지 않는다', () => {
    const a = {
      ...emptyRecords(),
      streaks: { exercise: { current: 9, longest: 3, lastActivityDate: '2026-08-01' } },
    };
    const b = {
      ...emptyRecords(),
      streaks: { exercise: { current: 2, longest: 7, lastActivityDate: '2026-08-06' } },
    };
    expect(mergeRecords(a, b).streaks.exercise).toEqual({
      current: 9,
      longest: 9,
      lastActivityDate: '2026-08-06',
    });
  });

  it('순서를 바꿔도 결과가 같다 — 재시도가 안전하려면 이게 성립해야 한다', () => {
    const a = {
      achievements: ['x'],
      badges: [],
      progress: { n: 3 },
      streaks: { s: { current: 1, longest: 4, lastActivityDate: '2026-01-01' } },
    };
    const b = {
      achievements: ['y'],
      badges: ['b'],
      progress: { n: 8 },
      streaks: { s: { current: 6, longest: 2, lastActivityDate: '2026-02-02' } },
    };
    expect(mergeRecords(a, b)).toEqual(mergeRecords(b, a));
  });

  it('빈 쪽과 합쳐도 원본이 그대로다 — 첫 로그인에 기록이 날아가지 않는다', () => {
    const mine = {
      achievements: ['pet_1000'],
      badges: ['b'],
      progress: { pet_strokes: 1000 },
      streaks: { daily_review: { current: 4, longest: 4, lastActivityDate: '2026-08-07' } },
    };
    expect(mergeRecords(emptyRecords(), mine)).toEqual(mine);
  });
});

describe('slugifyHandle', () => {
  it('주소에 쓸 수 있는 모양으로 깎는다', () => {
    expect(slugifyHandle('Mascari4615')).toBe('mascari4615');
    expect(slugifyHandle('요른 봇!!')).toBe('');
    expect(slugifyHandle('a  b__c')).toBe('a-b__c');
  });
});

describe('KarmolabAccountStore', () => {
  it('같은 디스코드로 두 번 들어오면 계정은 하나다', () => {
    const store = new KarmolabAccountStore(statePath);
    const first = store.upsertFromDiscord(discordUser);
    const second = store.upsertFromDiscord({ ...discordUser, displayName: '이름 바꿈' });
    expect(second.id).toBe(first.id);
    expect(second.handle).toBe(first.handle); // 주소는 안 흔들린다
    expect(second.displayName).toBe('이름 바꿈');
    expect(store.stats().accounts).toBe(1);
  });

  it('handle 이 겹치면 뒤에 번호를 붙인다', () => {
    const store = new KarmolabAccountStore(statePath);
    const a = store.upsertFromDiscord(discordUser);
    const b = store.upsertFromDiscord({ ...discordUser, discordId: '999', username: 'Mascari4615' });
    expect(a.handle).toBe('mascari4615');
    expect(b.handle).toBe('mascari4615-2');
  });

  it('세션으로 계정을 되찾고, 로그아웃하면 못 찾는다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    const { token } = store.createSession(account.id);
    expect(store.accountForSession(token)?.id).toBe(account.id);
    store.destroySession(token);
    expect(store.accountForSession(token)).toBeNull();
    expect(store.accountForSession('아무거나')).toBeNull();
  });

  it('다시 켜도 계정·세션·기록이 남는다 — 이게 안 되면 「저장된다」가 거짓말이다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    const { token } = store.createSession(account.id);
    store.mergeRecordsForAccount(account.id, { ...emptyRecords(), progress: { pet_strokes: 42 } });

    const reopened = new KarmolabAccountStore(statePath);
    const found = reopened.accountForSession(token);
    expect(found?.handle).toBe(account.handle);
    expect(found?.records.progress.pet_strokes).toBe(42);
    expect(reopened.byHandle('MASCARI4615')?.id).toBe(account.id);
  });

  it('공개 프로필에는 디스코드 id·안쪽 id 가 안 나간다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    store.mergeRecordsForAccount(account.id, {
      ...emptyRecords(),
      achievements: ['pet_100'],
      progress: { secret_counter: 7 },
      streaks: { exercise: { current: 3, longest: 5, lastActivityDate: '2026-08-07' } },
    });
    const profile = store.publicProfile(store.byHandle(account.handle)!);
    const asText = JSON.stringify(profile);
    expect(asText).not.toContain(discordUser.discordId);
    expect(asText).not.toContain(account.id);
    expect(profile.avatarPath).toBe(`/kl/u/${account.handle}/avatar`);
    expect(profile.achievements).toEqual(['pet_100']);
    // 누적 카운터는 공개 프로필에 안 싣는다 (Cycle 1 은 도전과제·뱃지·연속기록만 공개).
    expect(asText).not.toContain('secret_counter');
    expect(profile.streaks.exercise).toEqual({ current: 3, longest: 5 });
  });

  it('상태 파일이 깨져 있어도 기동한다 — 로그인 하나 때문에 사이트가 멈추면 안 된다', () => {
    fs.writeFileSync(statePath, '{ 깨진 JSON', 'utf-8');
    const store = new KarmolabAccountStore(statePath);
    expect(store.stats().accounts).toBe(0);
    expect(() => store.upsertFromDiscord(discordUser)).not.toThrow();
  });
});
