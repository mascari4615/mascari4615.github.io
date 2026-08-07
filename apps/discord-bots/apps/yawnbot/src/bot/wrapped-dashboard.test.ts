import { describe, it, expect } from 'vitest';
import { renderDashboardPage } from './wrapped-dashboard';
import { buildAnalytics, emptyState, recordMessage, recordReaction, weekdayOf } from '../services/server-stats';

const NOW = new Date('2026-08-06T12:00:00Z'); // KST 2026-08-06 21:00

function seeded() {
  const state = emptyState();
  const say = (userId: string, name: string, count: number, iso: string, channelId = 'c1') => {
    for (let i = 0; i < count; i += 1) {
      recordMessage(state, { guildId: 'g1', userId, userName: name, channelId, content: '가나다 🎉', at: new Date(iso) });
    }
  };
  // 이번 주 (최근 7일 안)
  say('u1', '카르모', 10, '2026-08-05T05:00:00Z');
  say('u2', '링', 4, '2026-08-04T05:00:00Z', 'c2');
  recordReaction(state, {
    guildId: 'g1', giverId: 'u2', giverName: '링', authorId: 'u1', authorName: '카르모',
    emojiName: '👍', at: new Date('2026-08-05T05:00:00Z'),
  });
  // 지난 주 (직전 같은 길이 기간) — 비교 대상
  say('u1', '카르모', 5, '2026-07-28T05:00:00Z');
  return state;
}

function render(state = seeded(), days = 7) {
  return renderDashboardPage({
    guildName: '카르모 서버',
    analytics: buildAnalytics(state, 'g1', { days, now: NOW }),
    channelNames: { c1: '#잡담', c2: '#작업로그' },
    basePath: '/w/testkey/board',
  });
}

describe('요일 계산', () => {
  it('KST 날짜 문자열을 그대로 요일로 읽는다', () => {
    expect(weekdayOf('2026-08-06')).toBe(4); // 목요일
    expect(weekdayOf('2026-08-09')).toBe(0); // 일요일
  });
});

describe('분석', () => {
  it('직전 같은 기간과 비교한다', () => {
    const a = buildAnalytics(seeded(), 'g1', { days: 7, now: NOW });
    expect(a.current.messages).toBe(14);
    expect(a.previous.messages).toBe(5);
    expect(a.current.activeUsers).toBe(2);
    expect(a.current.reactions).toBe(1);
  });

  it('쉰 날도 0 으로 채워 자리를 남긴다', () => {
    const a = buildAnalytics(seeded(), 'g1', { days: 7, now: NOW });
    expect(a.daily).toHaveLength(7);
    expect(a.daily.some((d) => d.msgs === 0)).toBe(true);
  });

  it('처음 온 사람과 전에도 있던 사람을 가른다', () => {
    const a = buildAnalytics(seeded(), 'g1', { days: 7, now: NOW });
    // u1 = 지난 주에도 말함(재방문), u2 = 이번이 처음
    expect(a.returningUsers).toBe(1);
    expect(a.newUsers).toBe(1);
  });

  it('요일×시각 표에 실제 시각이 찍힌다', () => {
    const a = buildAnalytics(seeded(), 'g1', { days: 7, now: NOW });
    // 2026-08-05T05:00Z = KST 8/5(수) 14시
    expect(a.weekdayHour[3][14]).toBe(10);
  });

  it('기록 없는 서버도 터지지 않는다', () => {
    const a = buildAnalytics(emptyState(), 'nope', { days: 7, now: NOW });
    expect(a.current.messages).toBe(0);
    expect(a.busiestDay).toBeNull();
    expect(a.weekdayHour).toHaveLength(7);
  });
});

describe('대시보드 페이지', () => {
  it('KPI 타일과 증감이 실린다', () => {
    const html = render();
    expect(html).toContain('메시지');
    expect(html).toContain('참여한 사람');
    expect(html).toContain('처음 온 사람');
    expect(html).toContain('늘었다'); // 14 vs 5
  });

  it('증감은 화살표만이 아니라 말로도 적는다 (색만으로 뜻 전달 X)', () => {
    const html = render();
    expect(html).toMatch(/늘었다|줄었다|같음|새로 시작/);
  });

  it('기간 전환 링크가 있고 현재 기간이 표시된다', () => {
    const html = render();
    expect(html).toContain('?days=30');
    expect(html).toContain('class="range on"');
  });

  it('히트맵과 날짜 그래프가 있다', () => {
    const html = render();
    expect(html).toContain('요일 × 시각');
    expect(html).toContain('날짜별 메시지');
    expect(html).toContain('적음');
  });

  it('셀마다 읽을 수 있는 설명이 붙는다 (색만으로 읽히지 않게)', () => {
    expect(render()).toContain('aria-label="수요일 오후 2시 · 10개"');
  });

  it('채널을 이름으로 보여준다', () => {
    const html = render();
    expect(html).toContain('#잡담');
    expect(html).toContain('#작업로그');
  });

  it('날짜별 표는 접혀 있다 — 30일이면 페이지를 삼킨다', () => {
    const html = render(seeded(), 30);
    expect(html).toContain('날짜별 표 펼치기');
    expect(html).not.toContain('<details open');
  });

  it('비중 막대는 고정 폭 트랙 안에 있다 (좁은 칸에서 점이 되지 않게)', () => {
    expect(render()).toContain('class="track"');
  });

  it('이모지는 표가 아니라 칩으로 눕는다', () => {
    expect(render()).toContain('class="chips"');
  });

  it('빈 서버도 페이지가 뜬다', () => {
    const html = render(emptyState(), 7);
    expect(html).toContain('대시보드');
    expect(html).toContain('아직 없음');
  });

  it('검색엔진에 안 잡히게 막아 둔다 (사적인 통계)', () => {
    expect(render()).toContain('name="robots" content="noindex"');
  });
});
