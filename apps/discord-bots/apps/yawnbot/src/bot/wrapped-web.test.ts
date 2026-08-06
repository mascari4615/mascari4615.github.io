import { describe, it, expect } from 'vitest';
import { renderWrappedPage } from './wrapped-web';
import { debugDump, emptyState, recordMessage, summarize, getOrCreateShareKey, guildIdForShareKey } from '../services/server-stats';

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
    recordMessage(state, {
      guildId: 'g1', userId: 'u2', userName: '링', channelId: 'c2',
      content: '나도', at: new Date('2026-08-04T05:00:00Z'),
    });
  }
  return renderWrappedPage({
    guildName: '카르모 서버',
    days: 7,
    summary: summarize(state, 'g1', { days: 7, now: NOW }),
    detail: {
      ...debugDump(state, 'g1', { days: 7, now: NOW }),
      dirty: false,
      statePath: 'C:/secret/path/server-stats-state.json',
      stateFileExists: true,
      stateFileMtime: '2026-08-06T12:00:00.000Z',
    },
    channelNames: { c1: '#잡담', c2: '#작업로그' },
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

  it('채널은 디스코드 멘션이 아니라 이름 글자로 나온다', () => {
    const html = page(true);
    // `<#id>` 로 넣으면 브라우저가 모르는 태그로 먹어 줄이 통째로 사라진다.
    expect(html).toContain('가장 붐빈 채널');
    expect(html).toContain('#잡담');
    expect(html).not.toContain('<#c1>');
  });

  it('프라이버시 약속이 페이지에도 박혀 있다', () => {
    expect(page(true)).toContain('저장하지 않습니다');
  });
});

describe('자세히 절', () => {
  it('같은 페이지 안에 접힌 채로 있다', () => {
    const html = page(true);
    expect(html).toContain('<details');
    expect(html).toContain('자세히 보기');
    expect(html).not.toContain('<details open');
  });

  it('전원·채널·날짜·시각·이모지 표가 다 있다', () => {
    const html = page(true);
    for (const heading of ['사람별', '채널별', '날짜별', '시각별', '이모지', '집계 상태']) {
      expect(html).toContain(heading);
    }
  });

  it('채널을 ID 가 아니라 이름으로 보여준다', () => {
    const html = page(true);
    expect(html).toContain('#잡담');
    expect(html).toContain('#작업로그');
  });

  it('카드에 안 나오던 사람도 표에는 나온다', () => {
    // 카드는 top3 만 — 표는 전원이라야 "자세히"다.
    expect(page(true)).toContain('링');
  });

  it('봇 머신의 파일 경로는 페이지에 안 나온다', () => {
    expect(page(true)).not.toContain('C:/secret/path');
  });
});
