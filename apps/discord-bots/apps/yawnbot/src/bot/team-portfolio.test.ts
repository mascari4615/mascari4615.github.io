// team-portfolio 순수 코어 검증 (FS 무관). TASK-KAR-018-LT 기둥1.
import { describe, it, expect } from 'vitest';
import {
  parsePortfolio,
  topProject,
  validateProjectCitation,
  formatPortfolioBlock,
  renderPortfolioMarkdown,
  type Portfolio,
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
