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

/**
 * 계정별 발자국 (TASK-KL-152 C1).
 *
 * 여기가 틀리면 잔디·돌아보기가 **조용히 거짓말한다** — 화면은 멀쩡히 그려지고 숫자만 틀린다.
 * 그래서 「밤에 연 것이 어제로 안 밀리나」·「그냥 다녀간 날도 칠해지나」를 눈으로 박는다.
 */
describe('발자국 (KL-152 C1)', () => {
  const at = (iso: string) => new Date(iso);

  it('도구를 열면 그 날짜(KST)와 도구가 함께 쌓인다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    store.noteFootprint(account.id, { toolId: 'imageconvert', at: at('2026-08-08T01:00:00Z') });
    store.noteFootprint(account.id, { toolId: 'imageconvert', at: at('2026-08-08T02:00:00Z') });

    const activity = store.footprintFor(account.id, at('2026-08-08T05:00:00Z'));
    expect(activity.days['2026-08-08']).toBe(2);
    expect(activity.tools.imageconvert).toBe(2);
    expect(activity.totals).toEqual({ opens: 2, activeDays: 1, distinctTools: 1 });
  });

  it('한국 시간으로 날짜를 가른다 — 밤 10시(UTC 13시)에 연 것이 어제로 안 밀린다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    // 2026-08-08 22:00 KST = 2026-08-08 13:00 UTC
    store.noteFootprint(account.id, { toolId: 'pet', at: at('2026-08-08T13:00:00Z') });
    // 2026-08-09 01:00 KST = 2026-08-08 16:00 UTC — UTC 로 세면 같은 날로 뭉개진다
    store.noteFootprint(account.id, { toolId: 'pet', at: at('2026-08-08T16:00:00Z') });

    const activity = store.footprintFor(account.id, at('2026-08-08T16:30:00Z'));
    expect(Object.keys(activity.days).sort()).toEqual(['2026-08-08', '2026-08-09']);
  });

  it('도구를 안 연 날도 칠해진다 — 둘러보기만 한 날을 「안 온 날」로 적으면 거짓말이다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    store.noteFootprint(account.id, { at: at('2026-08-07T03:00:00Z') });

    const activity = store.footprintFor(account.id, at('2026-08-07T05:00:00Z'));
    expect(activity.days['2026-08-07']).toBe(0);
    expect(activity.totals.activeDays).toBe(1);
    expect(activity.totals.opens).toBe(0);
  });

  it('연속일은 어제까지 이어져 있으면 살아 있다 — 오늘 아직 안 왔다고 0 으로 지우지 않는다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    for (const day of ['2026-08-05', '2026-08-06', '2026-08-07']) {
      store.noteFootprint(account.id, { toolId: 'pet', at: at(`${day}T05:00:00Z`) });
    }
    // 오늘 = 08-08, 아직 안 왔다 (KST 오후)
    const activity = store.footprintFor(account.id, at('2026-08-08T05:00:00Z'));
    expect(activity.streak.current).toBe(3);
    expect(activity.streak.longest).toBe(3);
  });

  it('이틀 넘게 비면 연속은 끊긴다 (가장 길었던 것은 남는다)', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    for (const day of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']) {
      store.noteFootprint(account.id, { toolId: 'pet', at: at(`${day}T05:00:00Z`) });
    }
    const activity = store.footprintFor(account.id, at('2026-08-08T05:00:00Z'));
    expect(activity.streak.current).toBe(0);
    expect(activity.streak.longest).toBe(4);
  });

  it('다시 열어도 남는다 (파일에 저장된다)', () => {
    const first = new KarmolabAccountStore(statePath);
    const account = first.upsertFromDiscord(discordUser);
    first.noteFootprint(account.id, { toolId: 'memo', at: at('2026-08-08T05:00:00Z') });

    const reopened = new KarmolabAccountStore(statePath);
    expect(reopened.footprintFor(account.id, at('2026-08-08T06:00:00Z')).tools.memo).toBe(1);
  });

  it('발자국이 한 번도 없어도 빈 채로 답한다 (없는 것을 0 으로 지어내지 않는다)', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    const activity = store.footprintFor(account.id);
    expect(activity.days).toEqual({});
    expect(activity.totals).toEqual({ opens: 0, activeDays: 0, distinctTools: 0 });
    expect(activity.streak).toEqual({ current: 0, longest: 0 });
  });
});

/**
 * 공개 범위 (TASK-KL-152 C4).
 *
 * 여기가 틀리면 **가렸다고 믿는 것이 그대로 새어 나간다** — 화면에는 안 보이니 아무도 모른다.
 * 그래서 「응답 자체에서 사라지나」를 문자열로 확인한다.
 */
describe('공개 범위 (KL-152 C4)', () => {
  it('기본은 지금까지와 같은 전부 공개 — 링크 걸어 둔 사람이 하루아침에 안 깨지게', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    expect(store.visibilityFor(account.id)).toEqual({
      profile: true, achievements: true, badges: true, streaks: true, community: true, activity: true,
    });
  });

  it('가린 항목은 공개 프로필 **응답에서 사라진다** (화면에서만 숨기는 게 아니다)', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    store.mergeRecordsForAccount(account.id, {
      ...emptyRecords(),
      achievements: ['pet_100'],
      badges: ['toolbox_explorer'],
      streaks: { exercise: { current: 3, longest: 5, lastActivityDate: '2026-08-07' } },
    });
    store.setVisibility(account.id, { achievements: false, streaks: false });

    const profile = store.publicProfile(store.byHandle(account.handle)!);
    const asText = JSON.stringify(profile);
    expect(asText).not.toContain('pet_100');
    expect(asText).not.toContain('exercise');
    // 가리지 않은 것은 그대로 나간다
    expect(profile.badges).toEqual(['toolbox_explorer']);
    // 「없는 것」과 「가린 것」은 다르다 — 가렸다는 사실은 알려 준다
    expect(profile.hidden).toEqual(['achievements', 'streaks']);
  });

  it('모르는 칸은 무시하고, 보낸 칸만 바뀐다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    const next = store.setVisibility(account.id, { community: false, 장난: true, badges: 'yes' });
    expect(next).toEqual({
      profile: true, achievements: true, badges: true, streaks: true, community: false, activity: true,
    });
  });

  it('다시 열어도 남는다', () => {
    const first = new KarmolabAccountStore(statePath);
    const account = first.upsertFromDiscord(discordUser);
    first.setVisibility(account.id, { profile: false });
    expect(new KarmolabAccountStore(statePath).visibilityFor(account.id).profile).toBe(false);
  });
});

/** 프로필 꾸미기 (TASK-KL-152 C5) — 남의 화면에 그려지는 값이라 좁게 받는다. */
describe('프로필 꾸미기 (KL-152 C5)', () => {
  it('한 줄 소개는 다듬어 담고, 대표 도구는 3개까지·모양 확인·중복 제거', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    const card = store.setCard(account.id, {
      bio: '  도구   만드는   사람  ',
      pins: ['pet', 'pet', 'memo', 'imageconvert', 'tierlist', '<script>', 'BAD ID'],
    });
    expect(card).toEqual({ bio: '도구 만드는 사람', pins: ['pet', 'memo', 'imageconvert'] });
  });

  it('안 채우면 지금과 같은 모습 — 빈 값이 나간다', () => {
    const store = new KarmolabAccountStore(statePath);
    const account = store.upsertFromDiscord(discordUser);
    expect(store.publicProfile(account).card).toEqual({ bio: '', pins: [] });
  });

  it('공개 프로필에 실려 나가고, 다시 열어도 남는다', () => {
    const first = new KarmolabAccountStore(statePath);
    const account = first.upsertFromDiscord(discordUser);
    first.setCard(account.id, { bio: '안녕', pins: ['pet'] });
    const reopened = new KarmolabAccountStore(statePath);
    expect(reopened.publicProfile(reopened.byHandle(account.handle)!).card).toEqual({ bio: '안녕', pins: ['pet'] });
  });
});
