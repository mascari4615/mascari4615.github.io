// team-portfolio 순수 코어 검증 (FS 무관). TASK-KAR-018-LT 기둥1.
import { describe, it, expect } from 'vitest';
import {
  parsePortfolio,
  topProject,
  validateProjectCitation,
  formatPortfolioBlock,
  renderPortfolioMarkdown,
  shouldRunRetro,
  parseRetroDecision,
  buildRetroPrompt,
  shouldRunQualityCheck,
  buildQualityCheckMessage,
  shouldRunDigest,
  type Portfolio,
  type PortfolioProject,
} from './team-portfolio';

const wm = {
  id: 'wm',
  title: 'Witch-Mendokusai',
  northStar: '팬 100명',
  weight: 100,
  status: 'active',
  currentObjective: { text: 'HomeInside 허브', openedTs: '2026-05-18T00:00:00Z' },
  progressLog: [
    { ts: '2026-05-18T01:00:00Z', projectId: 'wm', delta: '허브 진입 배선', evidence: 'PR#1' },
  ],
};
const infra = {
  id: 'agent-team',
  title: '에이전트 팀 인프라',
  northStar: '살아있는 팀',
  weight: 40,
  status: 'active',
  instrumental: true,
  progressLog: [],
};
const fixture = JSON.stringify({ projects: [infra, wm] });

describe('parsePortfolio (순수·견고)', () => {
  it('정상 파싱 + 필드 보존', () => {
    const p = parsePortfolio(fixture);
    expect(p.projects).toHaveLength(2);
    const w = p.projects.find((x) => x.id === 'wm')!;
    expect(w.weight).toBe(100);
    expect(w.instrumental).toBe(false);
    expect(w.currentObjective?.text).toBe('HomeInside 허브');
    expect(w.progressLog[0].delta).toBe('허브 진입 배선');
  });
  it('이상 입력 = 빈 포트폴리오', () => {
    expect(parsePortfolio('not json').projects).toEqual([]);
    expect(parsePortfolio('{}').projects).toEqual([]);
    expect(parsePortfolio('{"projects":"x"}').projects).toEqual([]);
  });
  it('id/title 없는 프로젝트 + 손상 progress 라인 폐기', () => {
    const p = parsePortfolio(
      JSON.stringify({
        projects: [
          { id: '', title: 'x' },
          { id: 'ok', title: 'OK', weight: -5, progressLog: [{ bad: 1 }, { delta: 'd' }] },
        ],
      }),
    );
    expect(p.projects).toHaveLength(1);
    expect(p.projects[0].weight).toBe(0); // clamp
    expect(p.projects[0].progressLog).toHaveLength(1); // delta 없는 라인 폐기
  });
});

describe('topProject (weight 라우팅 — 영구기관 차단)', () => {
  it('weight 최대 active 선택, 도구적은 으뜸을 못 이김', () => {
    const p = parsePortfolio(fixture);
    expect(topProject(p)?.id).toBe('wm'); // 100 > 40(instrumental)
  });
  it('동률 = id 정렬 첫', () => {
    const p: Portfolio = {
      projects: [
        { id: 'b', title: 'B', northStar: '', weight: 50, status: 'active', progressLog: [] },
        { id: 'a', title: 'A', northStar: '', weight: 50, status: 'active', progressLog: [] },
      ],
    };
    expect(topProject(p)?.id).toBe('a');
  });
  it('active 없음 = null', () => {
    const p: Portfolio = {
      projects: [{ id: 'x', title: 'X', northStar: '', weight: 9, status: 'done', progressLog: [] }],
    };
    expect(topProject(p)).toBeNull();
  });
});

describe('validateProjectCitation (LT-2 게이트)', () => {
  const p = parsePortfolio(fixture);
  it('미기재 거부', () => {
    expect(validateProjectCitation(p, '').ok).toBe(false);
  });
  it('미지 projectId 거부 (포트폴리오 외)', () => {
    const r = validateProjectCitation(p, 'ghost');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('미지');
  });
  it('알려진 active = 통과 + 제목 reason', () => {
    const r = validateProjectCitation(p, 'wm');
    expect(r.ok).toBe(true);
    expect(r.reason).toContain('Witch-Mendokusai');
  });
  it('done 프로젝트 거부', () => {
    const dp = parsePortfolio(
      JSON.stringify({ projects: [{ id: 'z', title: 'Z', status: 'done', progressLog: [] }] }),
    );
    expect(validateProjectCitation(dp, 'z').ok).toBe(false);
  });
});

describe('프롬프트/투영 (바운드·결정적)', () => {
  it('formatPortfolioBlock = weight 내림차순 + cite 강제 문구', () => {
    const b = formatPortfolioBlock(parsePortfolio(fixture));
    expect(b.indexOf('[wm]')).toBeLessThan(b.indexOf('[agent-team]')); // 100 먼저
    expect(b).toContain('projectId');
    expect(b).toContain('영구기관');
  });
  it('빈 포트폴리오 = 빈 블록(섹션 생략)', () => {
    expect(formatPortfolioBlock({ projects: [] })).toBe('');
  });
  it('renderPortfolioMarkdown = 손편집금지 헤더 + 프로젝트 섹션', () => {
    const md = renderPortfolioMarkdown(parsePortfolio(fixture));
    expect(md).toContain('# 팀 포트폴리오');
    expect(md).toContain('손편집 X');
    expect(md).toContain('## [wm] Witch-Mendokusai');
    expect(md).toContain('허브 진입 배선');
  });
});

// ── LT-7 retro 밸브 (순수) ──
const mkProj = (o: Partial<PortfolioProject> = {}): PortfolioProject => ({
  id: 'wm',
  title: 'WM',
  northStar: '팬100',
  weight: 100,
  status: 'active',
  progressLog: [{ ts: '2026-05-18T00:00:00Z', projectId: 'wm', delta: 'd', evidence: 'e' }],
  ...o,
});

describe('shouldRunRetro — 영속 주기 게이트', () => {
  const NOW = Date.parse('2026-05-18T12:00:00Z');
  it('진전 없음/비active = false', () => {
    expect(shouldRunRetro(mkProj({ progressLog: [] }), NOW, 1000)).toBe(false);
    expect(shouldRunRetro(mkProj({ status: 'paused' }), NOW, 1000)).toBe(false);
  });
  it('lastRetroTs 없음 = 즉시 가능(진전 있으면)', () => {
    expect(shouldRunRetro(mkProj(), NOW, 3600_000)).toBe(true);
  });
  it('interval 미경과 = false / 경과 = true', () => {
    const recent = mkProj({ lastRetroTs: '2026-05-18T11:50:00Z' }); // 10분 전
    expect(shouldRunRetro(recent, NOW, 3600_000)).toBe(false); // 1h 주기
    expect(shouldRunRetro(recent, NOW, 300_000)).toBe(true); // 5분 주기
  });
});

describe('parseRetroDecision — 결정적(불명확=keep)', () => {
  it('유지/조정/달성/불명확', () => {
    expect(parseRetroDecision('유지\n정렬됨').action).toBe('keep');
    const adj = parseRetroDecision('조정: 던전 루프 닫기\n더 가깝다');
    expect(adj.action).toBe('adjust');
    expect(adj.objective).toBe('던전 루프 닫기');
    expect(parseRetroDecision('달성 — 허브 완성').action).toBe('achieved');
    expect(parseRetroDecision('음 글쎄요').action).toBe('keep'); // 불명확=보수
  });
});

describe('buildRetroPrompt — 북극성 불변·심문', () => {
  it('북극성·현목표·진전·"맴돌이" 심문 포함, 결정 형식 강제', () => {
    const p = buildRetroPrompt(
      mkProj({ currentObjective: { text: '허브 만들기', openedTs: '' } }),
      '미션텍스트',
    );
    expect(p).toContain('팬100'); // northStar
    expect(p).toContain('허브 만들기'); // currentObjective
    expect(p).toContain('바꾸지 마라'); // northStar 불변 가드
    expect(p).toMatch(/맴돌이|자가정비/);
    expect(p).toContain('조정:');
  });
});

// ── LT-QC: 사용자 품질 체크 강제 (순수) ──
describe('shouldRunQualityCheck — HITL 게이트', () => {
  const NOW = Date.parse('2026-05-19T10:00:00Z');
  const INTERVAL = 24 * 3600_000;

  it('비active = false', () => {
    expect(shouldRunQualityCheck(mkProj({ status: 'paused' }), NOW, INTERVAL)).toBe(false);
  });
  it('lastQualityCheckTs 없음 = 즉시 가능(진전 없어도)', () => {
    expect(shouldRunQualityCheck(mkProj({ progressLog: [] }), NOW, INTERVAL)).toBe(true);
  });
  it('interval 미경과 = false / 경과 = true', () => {
    const recent = mkProj({ lastQualityCheckTs: '2026-05-19T09:00:00Z' }); // 1h 전
    expect(shouldRunQualityCheck(recent, NOW, INTERVAL)).toBe(false); // 24h 주기
    expect(shouldRunQualityCheck(recent, NOW, 3600_000)).toBe(true); // 1h 주기
  });
  it('retro 와 독립 — progressLog 없어도 품질 체크 가능', () => {
    const noProgress = mkProj({ progressLog: [], lastQualityCheckTs: undefined });
    expect(shouldRunQualityCheck(noProgress, NOW, INTERVAL)).toBe(true);
  });
});

describe('buildQualityCheckMessage — 판정 요청 포함', () => {
  it('프로젝트명·북극성·판정 안내 포함', () => {
    const msg = buildQualityCheckMessage(
      mkProj({ currentObjective: { text: '허브 만들기', openedTs: '' } }),
    );
    expect(msg).toContain('품질 체크');
    expect(msg).toContain('WM'); // title
    expect(msg).toContain('팬100'); // northStar
    expect(msg).toContain('✅');
    expect(msg).toContain('❌');
    expect(msg).toContain('허브 만들기'); // objective
  });
  it('진전 없으면 "기록된 전진 없음" 포함', () => {
    const msg = buildQualityCheckMessage(mkProj({ progressLog: [] }));
    expect(msg).toContain('기록된 전진 없음');
  });
  it('최근 진전 최대 2건 요약', () => {
    const p = mkProj({
      progressLog: [
        { ts: 't1', projectId: 'wm', delta: '작업A', evidence: 'e1' },
        { ts: 't2', projectId: 'wm', delta: '작업B', evidence: 'e2' },
        { ts: 't3', projectId: 'wm', delta: '작업C', evidence: 'e3' },
      ],
    });
    const msg = buildQualityCheckMessage(p);
    // 최신 2건(B,C) 포함, 오래된 A 는 잘림
    expect(msg).toContain('작업B');
    expect(msg).toContain('작업C');
  });
});

describe('parsePortfolio top-level 보존 (LT-DIGEST · 기둥4 잠복 버그 fix)', () => {
  it('lastSurgeryTs 보존 — 미보존 시 주기 게이트 영구 통과 (잠복)', () => {
    const raw = JSON.stringify({
      projects: [wm],
      lastSurgeryTs: '2026-05-20T12:00:00Z',
    });
    expect(parsePortfolio(raw).lastSurgeryTs).toBe('2026-05-20T12:00:00Z');
  });
  it('lastDigestTs 보존', () => {
    const raw = JSON.stringify({
      projects: [wm],
      lastDigestTs: '2026-05-20T12:00:00Z',
    });
    expect(parsePortfolio(raw).lastDigestTs).toBe('2026-05-20T12:00:00Z');
  });
  it('non-string top-level = undefined (견고)', () => {
    const raw = JSON.stringify({ projects: [wm], lastDigestTs: 12345 });
    expect(parsePortfolio(raw).lastDigestTs).toBeUndefined();
  });
});

describe('shouldRunDigest — LT-DIGEST 주기 게이트', () => {
  const INTERVAL = 12 * 3600_000;
  it('lastDigestTs 없으면 즉시 실행', () => {
    expect(shouldRunDigest({ projects: [] }, Date.now(), INTERVAL)).toBe(true);
  });
  it('주기 미경과 = skip', () => {
    const now = Date.parse('2026-05-20T12:00:00Z');
    const p: Portfolio = {
      projects: [],
      lastDigestTs: '2026-05-20T06:00:00Z', // 6h 전
    };
    expect(shouldRunDigest(p, now, INTERVAL)).toBe(false);
  });
  it('주기 경과 = 실행', () => {
    const now = Date.parse('2026-05-20T12:00:00Z');
    const p: Portfolio = {
      projects: [],
      lastDigestTs: '2026-05-19T23:00:00Z', // 13h 전
    };
    expect(shouldRunDigest(p, now, INTERVAL)).toBe(true);
  });
  it('lastDigestTs 파싱 실패 = 즉시 실행 (견고)', () => {
    const p: Portfolio = { projects: [], lastDigestTs: 'not-a-date' };
    expect(shouldRunDigest(p, Date.now(), INTERVAL)).toBe(true);
  });
});
