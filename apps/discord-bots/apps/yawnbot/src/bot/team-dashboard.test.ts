import { describe, it, expect } from 'vitest';
import {
  renderCompact,
  renderDetailed,
  type DashboardSnapshot,
} from './team-dashboard';

const SNAP: DashboardSnapshot = {
  atKST: '2026-05-18 18:42',
  lastTickKST: '2026-05-18 18:40',
  tickSummary: 'producer:objective p2 +worker:kar-worker:착수 TASK-KAR-018-X',
  queue: [
    { repo: 'KL→io', count: 5 },
    { repo: 'WM', count: 11 },
    { repo: 'KAR→io', count: 2 },
  ],
  alive: true,
};

describe('team-dashboard 순수 렌더 (TASK-KAR-077)', () => {
  it('renderCompact: 시각·큐합·직전틱 요약 포함, 비-fragile(파싱 0)', () => {
    const c = renderCompact(SNAP);
    expect(c).toContain('2026-05-18 18:42 KST');
    expect(c).toContain('🟢 가동');
    expect(c).toContain('합 18'); // 5+11+2
    expect(c).toContain('KL→io 5');
    expect(c).toContain(SNAP.tickSummary.slice(0, 40));
  });

  it('renderDetailed: repo별 큐 분해 + 직전틱 전체 + 시스템', () => {
    const d = renderDetailed(SNAP);
    expect(d).toContain('욘봇 팀 — 상세');
    expect(d).toContain('WM');
    expect(d).toContain('11');
    expect(d).toContain('🟢 alive');
    expect(d).toContain('KAR-075'); // idle 도배 X 주석
  });

  it('빈 큐 / 유휴 틱 = graceful (미상·유휴 표기, throw X)', () => {
    const empty: DashboardSnapshot = {
      atKST: '2026-05-18 19:00',
      lastTickKST: null,
      tickSummary: '',
      queue: [],
      alive: false,
    };
    expect(() => renderCompact(empty)).not.toThrow();
    expect(() => renderDetailed(empty)).not.toThrow();
    expect(renderCompact(empty)).toContain('(미상)');
    expect(renderCompact(empty)).toContain('(유휴)');
    expect(renderCompact(empty)).toContain('—');
    expect(renderDetailed(empty)).toContain('유휴');
  });

  it('Discord 한도: compact·detailed 각 2000자 이하', () => {
    const big: DashboardSnapshot = {
      ...SNAP,
      tickSummary: 'x'.repeat(5000),
    };
    expect(renderCompact(big).length).toBeLessThan(2000);
    expect(renderDetailed(big).length).toBeLessThan(2000);
  });
});
