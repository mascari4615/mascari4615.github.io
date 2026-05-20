// agent-worker-repo 순수 코어 전수검증 (FS·git 무관, 결정적). KAR-018-Y.
import { describe, it, expect } from 'vitest';
import {
  resolveDomainRepo,
  tsStamp,
  workerBranchName,
  workerWorktreeDir,
} from './agent-worker-repo';

const NOW = new Date(Date.UTC(2026, 4, 17, 13, 6, 0)); // 2026-05-17T13:06Z

describe('resolveDomainRepo (순수)', () => {
  it('wm-worker → WitchMendokusai', () => {
    expect(resolveDomainRepo('wm-worker', 'C:/u/karmoddrine')).toEqual({
      repoRoot: 'C:/u/karmoddrine/WitchMendokusai',
      repoDir: 'WitchMendokusai',
    });
  });

  it('kl-worker → Mascari4615.github.io', () => {
    expect(resolveDomainRepo('kl-worker', '/x/karmoddrine')?.repoRoot).toBe(
      '/x/karmoddrine/Mascari4615.github.io',
    );
  });

  it('trailing slash 정규화', () => {
    expect(resolveDomainRepo('wm-worker', '/x/karmoddrine///')?.repoRoot).toBe(
      '/x/karmoddrine/WitchMendokusai',
    );
  });

  it('kar-worker → Mascari4615.github.io (자가개선 = github.io yawnbot)', () => {
    expect(resolveDomainRepo('kar-worker', '/x/karmoddrine')?.repoRoot).toBe(
      '/x/karmoddrine/Mascari4615.github.io',
    );
  });

  it('wm-support → WitchMendokusai (보좌 모델, TASK-KAR-018-WMS)', () => {
    expect(resolveDomainRepo('wm-support', '/x/karmoddrine')?.repoRoot).toBe(
      '/x/karmoddrine/WitchMendokusai',
    );
  });

  it('미지원 코어 / 빈 umbrella = null', () => {
    expect(resolveDomainRepo('atlas', '/x')).toBeNull();
    expect(resolveDomainRepo('producer', '/x')).toBeNull();
    expect(resolveDomainRepo('wm-worker', '')).toBeNull();
  });
});

describe('tsStamp / workerBranchName / workerWorktreeDir (순수·결정적)', () => {
  it('tsStamp = UTC yyMMddHHmm', () => {
    expect(tsStamp(NOW)).toBe('2605171306');
  });

  it('workerBranchName = feature/agent-team + 소문자 슬러그 (KAR-018: ts X, deterministic)', () => {
    expect(workerBranchName('TASK-WM-084')).toBe(
      'feature/agent-team-task-wm-084',
    );
  });

  it('workerBranchName 특수문자 → 단일 하이픈·양끝 trim', () => {
    expect(workerBranchName('TASK-KL-055-B')).toBe(
      'feature/agent-team-task-kl-055-b',
    );
  });

  it('workerBranchName 같은 TASK 다른 시각 = 동일 (연속성)', () => {
    const later = new Date('2026-05-21T07:00:00Z');
    expect(workerBranchName('TASK-WM-084', NOW)).toBe(workerBranchName('TASK-WM-084', later));
  });

  it('workerWorktreeDir = umbrella/.worktrees/aw-<core>-<slug> (KAR-018: ts X)', () => {
    expect(
      workerWorktreeDir('/x/karmoddrine', 'kl-worker', 'TASK-KL-061'),
    ).toBe('/x/karmoddrine/.worktrees/aw-kl-worker-task-kl-061');
  });

  it('branch 와 worktreeDir 의 slug 일관', () => {
    const b = workerBranchName('TASK-WM-116');
    const d = workerWorktreeDir('/r', 'wm-worker', 'TASK-WM-116');
    expect(b.endsWith('task-wm-116')).toBe(true);
    expect(d.endsWith('task-wm-116')).toBe(true);
  });
});
