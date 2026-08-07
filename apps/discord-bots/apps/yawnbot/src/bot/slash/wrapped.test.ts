import { describe, it, expect } from 'vitest';
import { buildWrappedEmbed, buildDebugText, sparkline, hourLabel } from './wrapped';
import { debugDump, emptyState, recordMessage, recordReaction, summarize } from '../../services/server-stats';

const NOW = new Date('2026-08-06T12:00:00Z');

function seededState() {
  const state = emptyState();
  const say = (userId: string, name: string, count: number, at: string, channelId = 'c1') => {
    for (let i = 0; i < count; i += 1) {
      recordMessage(state, { guildId: 'g1', userId, userName: name, channelId, content: '가나다라마 🎉', at: new Date(at) });
    }
  };
  say('u1', '욘', 40, '2026-08-05T05:00:00Z');
  say('u2', '링', 25, '2026-08-05T05:00:00Z');
  say('u3', '알리사', 15, '2026-08-05T18:00:00Z', 'c2');
  recordReaction(state, {
    guildId: 'g1', giverId: 'u2', giverName: '링', authorId: 'u1', authorName: '욘',
    emojiName: '👍', at: new Date('2026-08-05T05:00:00Z'),
  });
  return state;
}

function seededSummary() {
  return summarize(seededState(), 'g1', { days: 7, now: NOW });
}

describe('스파크라인', () => {
  it('24칸을 채우고 최대값이 가장 높다', () => {
    const line = sparkline([0, 5, 10, ...Array.from({ length: 21 }, () => 0)]);
    expect([...line]).toHaveLength(24);
    expect(line[0]).toBe('▁');
    expect(line[2]).toBe('█');
  });

  it('전부 0이어도 터지지 않는다', () => {
    expect([...sparkline(Array.from({ length: 24 }, () => 0))]).toHaveLength(24);
  });
});

describe('시각 표기', () => {
  it('사람 말로 읽힌다', () => {
    expect(hourLabel(0)).toBe('자정');
    expect(hourLabel(3)).toBe('새벽 3시');
    expect(hourLabel(9)).toBe('오전 9시');
    expect(hourLabel(12)).toBe('정오');
    expect(hourLabel(14)).toBe('오후 2시');
    expect(hourLabel(22)).toBe('밤 10시');
  });
});

describe('결산 카드', () => {
  it('칭호와 숫자가 카드에 실린다', () => {
    const embed = buildWrappedEmbed(seededSummary(), '카르모 서버').toJSON();
    expect(embed.title).toContain('카르모 서버');
    const text = JSON.stringify(embed);
    expect(text).toContain('수다왕');
    expect(text).toContain('욘');
    expect(text).toContain('새벽 유령');
    expect(text).toContain('인기상');
  });

  it('기록이 없으면 "지금부터 센다"고 말한다 (빈 카드 X)', () => {
    const empty = summarize(emptyState(), 'g1', { days: 7, now: NOW });
    const embed = buildWrappedEmbed(empty, '새 서버').toJSON();
    expect(embed.description).toContain('지금부터');
    expect(embed.fields ?? []).toHaveLength(0);
  });

  it('디버그 창은 원시 수치와 저장 상태를 같이 보여준다', () => {
    const dump = {
      ...debugDump(seededState(), 'g1', { days: 7, now: NOW }),
      dirty: true,
      statePath: 'C:/x/server-stats-state.json',
      stateFileExists: false,
      stateFileMtime: null,
    };
    const text = buildDebugText(dump, 7);
    expect(text).toContain('오늘(KST) = 2026-08-06');
    expect(text).toContain('아직 없음 (첫 저장 전)');
    expect(text).toContain('미저장 변경 있음');
    expect(text).toContain('욘');
  });

  it('아무도 안 잡혔으면 뭘 하라고 알려준다', () => {
    const dump = {
      ...debugDump(emptyState(), 'g1', { days: 7, now: NOW }),
      dirty: false,
      statePath: 'x',
      stateFileExists: false,
      stateFileMtime: null,
    };
    expect(buildDebugText(dump, 7)).toContain('한 마디 하고 다시');
  });

  it('푸터에 프라이버시 약속이 박혀 있다', () => {
    const embed = buildWrappedEmbed(seededSummary(), 'x').toJSON();
    expect(embed.footer?.text).toContain('저장하지 않습니다');
  });
});
