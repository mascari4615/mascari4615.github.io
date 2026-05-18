import { describe, it, expect } from 'vitest';
import {
  renderCompact,
  renderDetailed,
  parseWorkerStates,
  type DashboardSnapshot,
} from './team-dashboard';

const SNAP: DashboardSnapshot = {
  atKST: '2026-05-18 18:42',
  lastTickKST: '2026-05-18 18:40',
  tickSummary: 'producer:objective p2 +worker:kar-worker:done:TASK-KAR-018-X',
  workers: parseWorkerStates(
    'kar-worker:done:TASK-KAR-018-X,kl-worker:idle,wm-worker:cooldown-all',
  ),
  queue: [
    { repo: 'KL→io', count: 5 },
    { repo: 'WM', count: 11 },
    { repo: 'KAR→io', count: 2 },
  ],
  alive: true,
};

describe('parseWorkerStates (CSV 계약 — 우리 자체 안정 포맷)', () => {
  it('idle/cooldown-all/claim-lost/done/done-no-artifact/error 매핑', () => {
    const w = parseWorkerStates(
      'kar-worker:done:TASK-KAR-1,kl-worker:idle,wm-worker:cooldown-all,x-worker:claim-lost,y-worker:done-no-artifact:TASK-Y-2,z-worker:error',
    );
    expect(w[0]).toMatchObject({ core: 'KAR', emoji: '🟢', kind: 'active' });
    expect(w[0].text).toContain('TASK-KAR-1');
    expect(w[1]).toMatchObject({ core: 'KL', kind: 'wait' });
    expect(w[2].text).toContain('쿨다운');
    expect(w[3].text).toContain('경합');
    expect(w[4]).toMatchObject({ emoji: '🟡', kind: 'noop' });
    expect(w[5]).toMatchObject({ emoji: '🔴', kind: 'error' });
  });
  it('빈/이상 입력 = graceful (throw X, [] 또는 skip)', () => {
    expect(parseWorkerStates(undefined)).toEqual([]);
    expect(parseWorkerStates('')).toEqual([]);
    expect(parseWorkerStates('garbage-no-colon')).toEqual([]);
  });
});

describe('team-dashboard embed 렌더 (TASK-KAR-077, 상태색+이모지)', () => {
  it('renderCompact: embed 구조 — accent색·author태그·워커/큐 필드·footer', () => {
    const e = renderCompact(SNAP);
    expect(typeof e.color).toBe('number');
    expect(e.color).toBe(0x2ecc71); // active 워커 있음 → green
    expect(e.author?.name).toContain('욘봇 팀');
    expect(e.author?.name).toContain('🟢');
    const flat = JSON.stringify(e);
    expect(flat).toContain('KAR'); // 워커 라인
    expect(flat).toContain('TASK-KAR-018-X');
    expect(flat).toContain('합'); // 큐 합
    expect(e.footer?.text).toContain('KST');
  });

  it('renderDetailed: title·워커상태·큐 라우팅·직전틱 필드', () => {
    const e = renderDetailed(SNAP);
    expect(e.title).toContain('상세');
    const flat = JSON.stringify(e);
    expect(flat).toContain('KAR-075'); // 큐 라우팅 라벨
    expect(flat).toContain('cadence tick');
    expect(flat).toContain('alive');
  });

  it('동적 색: 에러>노op>큐0>green 우선순위', () => {
    const err = { ...SNAP, workers: parseWorkerStates('a-worker:boom') };
    expect(renderCompact(err).color).toBe(0xe74c3c); // red
    const idle = {
      ...SNAP,
      workers: parseWorkerStates('a-worker:idle'),
      queue: [],
    };
    expect(renderCompact(idle).color).toBe(0xf1c40f); // yellow(큐0)
    const down = { ...SNAP, alive: false };
    expect(renderCompact(down).color).toBe(0x95a5a6); // grey
  });

  it('빈 스냅샷 graceful + Discord embed 한도(필드값 ≤1024)', () => {
    const empty: DashboardSnapshot = {
      atKST: '2026-05-18 19:00',
      lastTickKST: null,
      tickSummary: 'x'.repeat(5000),
      workers: [],
      queue: [],
      alive: false,
    };
    expect(() => renderCompact(empty)).not.toThrow();
    const e = renderDetailed(empty);
    for (const f of e.fields) expect(f.value.length).toBeLessThanOrEqual(1024);
  });
});
