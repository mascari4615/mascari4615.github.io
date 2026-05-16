/**
 * self-improve-adapter 행동 테스트 (KAR-018-C slice-2).
 * tracer-bullet: 검증 DI → archive(accept∧reject) → Draft PR / 폐기 + notify.
 * FS 격리 = tmpdir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runSelfImprove,
  archivePath,
  type SelfImproveDeps,
  type VerifyRunner,
} from './self-improve-adapter';
import type { ProposalMeta } from './self-improve';

const meta: ProposalMeta = {
  id: 'PROP-1',
  summary: 'hook 개선',
  targetFiles: ['memo/dotfiles/claude-hooks/x.ps1'],
  source: 'self-task',
};

const PASS: VerifyRunner = {
  compile: async () => true,
  test: async () => true,
  hook: async () => true,
  baselineDelta: async () => 0,
};

let root: string;
let notes: string[];
function deps(over: Partial<SelfImproveDeps> = {}): SelfImproveDeps {
  return {
    env: { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv,
    verify: PASS,
    notify: (m) => notes.push(m),
    ...over,
  };
}
function archiveLines(): string[] {
  const p = archivePath({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv);
  return fs.readFileSync(p, 'utf-8').trim().split('\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'si-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  notes = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('runSelfImprove — accept 경로', () => {
  it('전 PASS → accept + archive + Draft PR + notify', async () => {
    const openDraftPr = vi.fn().mockResolvedValue({ url: 'http://pr/1' });
    const out = await runSelfImprove(meta, deps({ openDraftPr }));
    expect(out.verdict.accept).toBe(true);
    expect(out.prUrl).toBe('http://pr/1');
    expect(openDraftPr).toHaveBeenCalledOnce();
    expect(JSON.parse(archiveLines()[0]).verdict).toBe('accept');
    expect(notes.join()).toContain('accept');
  });

  it('Draft PR fn 미배선 → accept 기록은 되되 prUrl 없음', async () => {
    const out = await runSelfImprove(meta, deps());
    expect(out.verdict.accept).toBe(true);
    expect(out.prUrl).toBeUndefined();
  });
});

describe('runSelfImprove — reject 경로 (DGM)', () => {
  it('test fail → reject + archive(reject) + 폐기 notify, Draft PR X', async () => {
    const openDraftPr = vi.fn();
    const out = await runSelfImprove(
      meta,
      deps({ verify: { ...PASS, test: async () => false }, openDraftPr }),
    );
    expect(out.verdict.accept).toBe(false);
    expect(openDraftPr).not.toHaveBeenCalled();
    expect(JSON.parse(archiveLines()[0]).verdict).toBe('reject');
    expect(notes.join()).toContain('reject');
  });

  it('베이스라인 악화(delta>0) → reject', async () => {
    const out = await runSelfImprove(
      meta,
      deps({ verify: { ...PASS, baselineDelta: async () => 3 } }),
    );
    expect(out.verdict.accept).toBe(false);
  });
});

describe('archive 경로 (C-1 — improvement-archive/<date>.jsonl)', () => {
  it('MEMO_REPO_PATH 없으면 no-op (throw X)', async () => {
    const out = await runSelfImprove(meta, {
      env: {} as NodeJS.ProcessEnv,
      verify: PASS,
      notify: () => {},
    });
    expect(out.verdict.accept).toBe(true); // 판정은 됨, archive 만 skip
  });
  it('경로가 .claude/improvement-archive 하위', () => {
    expect(
      archivePath({ MEMO_REPO_PATH: '/x' } as NodeJS.ProcessEnv).replace(/\\/g, '/'),
    ).toContain('/.claude/improvement-archive/');
  });
});
