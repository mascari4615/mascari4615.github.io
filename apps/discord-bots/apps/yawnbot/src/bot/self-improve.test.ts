/**
 * self-improve 순수부 행동 테스트 (KAR-018-C slice-1).
 * tracer-bullet: DGM 게이트 — 위조 불가(부분/미상=reject), accept/reject 둘 다 archive.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateProposal,
  toArchiveLine,
  type ProposalMeta,
  type VerificationResults,
} from './self-improve';

const meta: ProposalMeta = {
  id: 'PROP-1',
  summary: 'hook 개선',
  targetFiles: ['memo/dotfiles/claude-hooks/x.ps1'],
  source: 'self-task:code-structure',
};
const ok: VerificationResults = { compile: true, test: true, hook: true, baselineRegressionDelta: 0 };

describe('evaluateProposal — DGM 게이트 (parent ②)', () => {
  it('전 게이트 PASS ∧ 무악화 → accept', () => {
    const v = evaluateProposal(meta, ok);
    expect(v.accept).toBe(true);
    expect(v.entry.verdict).toBe('accept');
  });

  it('compile fail → reject (부분 통과 X)', () => {
    const v = evaluateProposal(meta, { ...ok, compile: false });
    expect(v.accept).toBe(false);
    expect(v.entry.verdict).toBe('reject');
    if (!v.accept) expect(v.reason).toContain('게이트 fail');
  });

  it('test/hook 하나라도 fail → reject', () => {
    expect(evaluateProposal(meta, { ...ok, test: false }).accept).toBe(false);
    expect(evaluateProposal(meta, { ...ok, hook: false }).accept).toBe(false);
  });

  it('게이트 PASS 지만 베이스라인 악화(delta>0) → reject', () => {
    const v = evaluateProposal(meta, { ...ok, baselineRegressionDelta: 2 });
    expect(v.accept).toBe(false);
    if (!v.accept) expect(v.reason).toContain('회귀 베이스라인 악화');
  });

  it('delta ≤ 0 (개선/동일) → 무악화로 accept', () => {
    expect(evaluateProposal(meta, { ...ok, baselineRegressionDelta: -3 }).accept).toBe(true);
  });

  it('reject 도 ArchiveEntry 생성 (C-5 감사)', () => {
    const v = evaluateProposal(meta, { ...ok, compile: false });
    expect(v.entry.proposalId).toBe('PROP-1');
    expect(v.entry.gates.compile).toBe(false);
  });
});

describe('toArchiveLine — discoveries jsonl 동형', () => {
  it('엔트리 → 개행 종료 1줄 JSON', () => {
    const { entry } = evaluateProposal(meta, ok);
    const line = toArchiveLine(entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim()).verdict).toBe('accept');
  });
});
