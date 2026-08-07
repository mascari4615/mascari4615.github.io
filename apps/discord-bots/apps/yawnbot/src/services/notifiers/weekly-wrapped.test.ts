import { describe, it, expect } from 'vitest';
import { emptyState, dueWeeklyPosts, markWeeklyPosted, kstDayKey } from '../server-stats';

/** UTC 시각 → KST 로 읽히는 Date. (UTC+9) */
function kst(iso: string): Date {
  return new Date(new Date(iso + 'Z').getTime() - 9 * 60 * 60 * 1000);
}

function withSchedule() {
  const state = emptyState();
  state.weekly['g1'] = { channelId: 'c1', lastPostedDayKey: null };
  return state;
}

describe('주간 자동 게시 시점', () => {
  it('월요일 아침 10시 이후면 보낸다', () => {
    const due = dueWeeklyPosts(withSchedule(), kst('2026-08-10T10:00:00')); // 월요일
    expect(due).toEqual([{ guildId: 'g1', channelId: 'c1' }]);
  });

  it('월요일 새벽에는 아직 안 보낸다', () => {
    expect(dueWeeklyPosts(withSchedule(), kst('2026-08-10T07:00:00'))).toEqual([]);
  });

  it('봇이 꺼져 월요일을 놓쳤어도 수요일에 따라잡는다', () => {
    // 시각이 딱 맞을 때만 보내면 그 주가 통째로 사라진다.
    const due = dueWeeklyPosts(withSchedule(), kst('2026-08-12T15:00:00')); // 수요일
    expect(due).toHaveLength(1);
  });

  it('이번 주 몫을 이미 보냈으면 다시 안 보낸다', () => {
    const state = withSchedule();
    const monday = kst('2026-08-10T10:00:00');
    markWeeklyPosted(state, 'g1', monday);
    expect(dueWeeklyPosts(state, monday)).toEqual([]);
    expect(dueWeeklyPosts(state, kst('2026-08-12T15:00:00'))).toEqual([]); // 같은 주 수요일
  });

  it('다음 주가 되면 다시 보낸다', () => {
    const state = withSchedule();
    markWeeklyPosted(state, 'g1', kst('2026-08-10T10:00:00'));
    expect(dueWeeklyPosts(state, kst('2026-08-17T10:00:00'))).toHaveLength(1);
  });

  it('표식은 그 주 월요일 날짜다 (수요일에 보내도)', () => {
    const state = withSchedule();
    markWeeklyPosted(state, 'g1', kst('2026-08-12T15:00:00'));
    expect(state.weekly['g1'].lastPostedDayKey).toBe('2026-08-10');
  });

  it('켜지 않은 서버는 목록에 없다', () => {
    expect(dueWeeklyPosts(emptyState(), kst('2026-08-10T10:00:00'))).toEqual([]);
  });

  it('설정은 저장본에서 되살아난다', () => {
    const state = withSchedule();
    markWeeklyPosted(state, 'g1', kst('2026-08-10T10:00:00'));
    const json = JSON.parse(JSON.stringify(state));
    expect(json.weekly.g1.channelId).toBe('c1');
    expect(json.weekly.g1.lastPostedDayKey).toBe(kstDayKey(kst('2026-08-10T10:00:00')));
  });
});
