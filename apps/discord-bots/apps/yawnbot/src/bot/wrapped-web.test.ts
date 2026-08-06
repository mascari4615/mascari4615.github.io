import { describe, it, expect } from 'vitest';
import { renderWrappedPage } from './wrapped-web';
import { emptyState, recordMessage, summarize, getOrCreateShareKey, guildIdForShareKey } from '../services/server-stats';

const NOW = new Date('2026-08-06T12:00:00Z');

function page(seed: boolean) {
  const state = emptyState();
  if (seed) {
    for (let i = 0; i < 5; i += 1) {
      recordMessage(state, {
        guildId: 'g1', userId: 'u1', userName: '<script>알림</script>', channelId: 'c1',
        content: '안녕 🎉', at: new Date('2026-08-05T05:00:00Z'),
      });
    }
  }
  return renderWrappedPage({
    guildName: '카르모 서버',
    days: 7,
    summary: summarize(state, 'g1', { days: 7, now: NOW }),
    generatedAt: NOW.toISOString(),
  });
}

describe('공유 키', () => {
  it('한 번 만들면 주소가 안 바뀐다', () => {
    const state = emptyState();
    const first = getOrCreateShareKey(state, 'g1');
    expect(getOrCreateShareKey(state, 'g1')).toBe(first);
  });

  it('서버마다 다르고, 키로 서버를 되찾을 수 있다', () => {
    const state = emptyState();
    const a = getOrCreateShareKey(state, 'g1');
    const b = getOrCreateShareKey(state, 'g2');
    expect(a).not.toBe(b);
    expect(guildIdForShareKey(state, a)).toBe('g1');
    expect(guildIdForShareKey(state, '아무키나')).toBeNull();
  });

  it('짧지 않다 — 무작위로 못 맞힌다', () => {
    expect(getOrCreateShareKey(emptyState(), 'g1').length).toBeGreaterThanOrEqual(20);
  });
});

describe('웹 결산 페이지', () => {
  it('숫자와 칭호가 실린다', () => {
    const html = page(true);
    expect(html).toContain('카르모 서버 결산');
    expect(html).toContain('수다왕');
    expect(html).toContain('하루의 리듬');
  });

  it('이름에 태그가 섞여 있어도 그대로 실행되지 않는다', () => {
    const html = page(true);
    expect(html).not.toContain('<script>알림</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('기록이 없으면 빈 카드 대신 안내를 띄운다', () => {
    expect(page(false)).toContain('아직 셀 게 없어요');
  });

  it('프라이버시 약속이 페이지에도 박혀 있다', () => {
    expect(page(true)).toContain('저장하지 않습니다');
  });
});
