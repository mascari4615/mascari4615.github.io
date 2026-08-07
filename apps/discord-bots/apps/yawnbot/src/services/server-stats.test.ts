import { describe, it, expect } from 'vitest';
import {
  emptyState,
  normalizeState,
  kstDayKey,
  kstHour,
  extractEmojiNames,
  recordMessage,
  recordReaction,
  summarize,
  trimState,
  NIGHT_OWL_MIN_MESSAGES,
} from './server-stats';

/** UTC 문자열 → Date (테스트 가독성용). */
function utc(iso: string): Date {
  return new Date(iso);
}

describe('KST 경계', () => {
  it('UTC 15:00 = 다음날 KST 00시', () => {
    // 2026-08-06T15:00Z = 2026-08-07 00:00 KST → 날짜가 넘어간다.
    expect(kstDayKey(utc('2026-08-06T15:00:00Z'))).toBe('2026-08-07');
    expect(kstHour(utc('2026-08-06T15:00:00Z'))).toBe(0);
  });

  it('UTC 14:59 는 아직 같은 날 KST 23시', () => {
    expect(kstDayKey(utc('2026-08-06T14:59:00Z'))).toBe('2026-08-06');
    expect(kstHour(utc('2026-08-06T14:59:00Z'))).toBe(23);
  });
});

describe('이모지 추출', () => {
  it('커스텀·애니메이션·유니코드를 모두 뽑는다', () => {
    const names = extractEmojiNames('<:yon:123> 하이 <a:dance:456> 🎉🎉');
    expect(names).toContain('yon');
    expect(names).toContain('dance');
    expect(names.filter((n) => n === '🎉')).toHaveLength(2);
  });

  it('이모지가 없으면 빈 배열', () => {
    expect(extractEmojiNames('그냥 텍스트')).toEqual([]);
  });
});

describe('메시지 집계', () => {
  it('내용은 저장하지 않고 길이만 센다', () => {
    const state = emptyState();
    recordMessage(state, {
      guildId: 'g1',
      userId: 'u1',
      userName: '욘',
      channelId: 'c1',
      content: '비밀 이야기',
      at: utc('2026-08-06T03:00:00Z'),
    });

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('비밀 이야기');
    expect(state.guilds.g1.days['2026-08-06'].users.u1).toMatchObject({
      msgs: 1,
      chars: '비밀 이야기'.length,
      name: '욘',
    });
  });

  it('KST 새벽(0~6시)만 nightMsgs 로 센다', () => {
    const state = emptyState();
    const base = {
      guildId: 'g1',
      userId: 'u1',
      userName: '욘',
      channelId: 'c1',
      content: 'zzz',
    };
    // 18:00Z = 03:00 KST → 새벽
    recordMessage(state, { ...base, at: utc('2026-08-06T18:00:00Z') });
    // 04:00Z = 13:00 KST → 낮
    recordMessage(state, { ...base, at: utc('2026-08-06T04:00:00Z') });

    const u1Night = state.guilds.g1.days['2026-08-07'].users.u1;
    const u1Day = state.guilds.g1.days['2026-08-06'].users.u1;
    expect(u1Night.nightMsgs).toBe(1);
    expect(u1Day.nightMsgs).toBe(0);
  });
});

describe('반응 집계', () => {
  it('준 사람과 받은 사람을 각각 센다', () => {
    const state = emptyState();
    recordReaction(state, {
      guildId: 'g1',
      giverId: 'u2',
      giverName: '링',
      authorId: 'u1',
      authorName: '욘',
      emojiName: '👍',
      at: utc('2026-08-06T01:00:00Z'),
    });

    const day = state.guilds.g1.days['2026-08-06'];
    expect(day.users.u2.reactionsGiven).toBe(1);
    expect(day.users.u1.reactionsGot).toBe(1);
    expect(day.emojis['👍']).toBe(1);
  });

  it('자기 메시지에 스스로 단 반응은 받은 것으로 세지 않는다', () => {
    const state = emptyState();
    recordReaction(state, {
      guildId: 'g1',
      giverId: 'u1',
      giverName: '욘',
      authorId: 'u1',
      authorName: '욘',
      emojiName: '👍',
      at: utc('2026-08-06T01:00:00Z'),
    });

    const day = state.guilds.g1.days['2026-08-06'];
    expect(day.users.u1.reactionsGiven).toBe(1);
    expect(day.users.u1.reactionsGot).toBe(0);
  });
});

describe('요약', () => {
  const now = utc('2026-08-06T12:00:00Z'); // KST 2026-08-06 21:00

  function seed() {
    const state = emptyState();
    const push = (userId: string, userName: string, count: number, at: Date, channelId = 'c1') => {
      for (let i = 0; i < count; i += 1) {
        recordMessage(state, { guildId: 'g1', userId, userName, channelId, content: '가나다', at });
      }
    };
    push('u1', '욘', 10, utc('2026-08-06T05:00:00Z')); // KST 14시
    push('u2', '링', 4, utc('2026-08-06T05:00:00Z'));
    push('u3', '알리사', NIGHT_OWL_MIN_MESSAGES, utc('2026-08-05T18:00:00Z'), 'c2'); // KST 8/6 03시 = 새벽
    return state;
  }

  it('총합·수다왕·붐빈 시각을 뽑는다', () => {
    const s = summarize(seed(), 'g1', { days: 7, now });
    expect(s.totalMessages).toBe(24);
    expect(s.activeUsers).toBe(3);
    expect(s.topTalkers[0]).toMatchObject({ userId: 'u1', value: 10 });
    expect(s.busiestHour).toEqual({ hour: 14, count: 14 });
    expect(s.busiestChannel).toEqual({ channelId: 'c1', count: 14 });
  });

  it('새벽 비율이 가장 높은 사람을 새벽 유령으로 고른다', () => {
    const s = summarize(seed(), 'g1', { days: 7, now });
    expect(s.nightOwl?.userId).toBe('u3');
    expect(s.nightOwl?.ratio).toBe(1);
  });

  it('표본이 최소치 미만이면 새벽 유령을 뽑지 않는다', () => {
    const state = emptyState();
    recordMessage(state, {
      guildId: 'g1',
      userId: 'u9',
      userName: '적게쓴사람',
      channelId: 'c1',
      content: 'zzz',
      at: utc('2026-08-05T18:00:00Z'),
    });
    const s = summarize(state, 'g1', { days: 7, now });
    expect(s.nightOwl).toBeNull();
  });

  it('기록이 없는 서버는 0 으로 답한다 (터지지 않는다)', () => {
    const s = summarize(emptyState(), 'nope', { days: 7, now });
    expect(s.totalMessages).toBe(0);
    expect(s.daysWithData).toBe(0);
    expect(s.topTalkers).toEqual([]);
    expect(s.busiestHour).toBeNull();
  });

  it('집계 범위 밖의 날은 세지 않는다', () => {
    const state = emptyState();
    recordMessage(state, {
      guildId: 'g1',
      userId: 'u1',
      userName: '욘',
      channelId: 'c1',
      content: '옛날',
      at: utc('2026-07-01T05:00:00Z'),
    });
    expect(summarize(state, 'g1', { days: 7, now }).totalMessages).toBe(0);
    expect(summarize(state, 'g1', { days: 60, now }).totalMessages).toBe(1);
  });
});

describe('보관·복구', () => {
  it('보관 기간 밖 날짜를 버린다', () => {
    const state = emptyState();
    recordMessage(state, {
      guildId: 'g1',
      userId: 'u1',
      userName: '욘',
      channelId: 'c1',
      content: 'old',
      at: utc('2020-01-01T05:00:00Z'),
    });
    trimState(state, utc('2026-08-06T12:00:00Z'), 30);
    expect(Object.keys(state.guilds.g1.days)).toEqual([]);
  });

  it('깨진 JSON 조각도 기본값으로 메운다', () => {
    const restored = normalizeState({
      guilds: {
        g1: { days: { '2026-08-06': { users: { u1: { msgs: 3 } } } } },
      },
    } as never);
    const day = restored.guilds.g1.days['2026-08-06'];
    expect(day.users.u1).toMatchObject({ msgs: 3, chars: 0, nightMsgs: 0, name: 'u1' });
    expect(day.hours).toHaveLength(24);
    expect(day.channels).toEqual({});
  });
});
