/**
 * self-skill 순수부 행동 테스트 (KAR-018-F slice-1).
 * tracer-bullet: DGM 동형(시나리오 전 PASS 만) + persona-core escalate + 3 verdict archive.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateSkill,
  toSkillArchiveLine,
  type SkillProposal,
  type SkillEvalResults,
} from './self-skill';

const meta: SkillProposal = {
  id: 'SK-1',
  name: 'diagnose-ladder',
  summary: '진단 사다리 체크리스트',
  source: 'self-task',
  coreId: 'atlas',
};
const pass2: SkillEvalResults = {
  scenarios: [
    { name: 's1', passed: true },
    { name: 's2', passed: true },
  ],
  touchesPersonaCore: false,
};

describe('evaluateSkill — DGM 동형 게이트 (parent 2-prime)', () => {
  it('시나리오 전 PASS ∧ persona-core 무수정 → accept', () => {
    const v = evaluateSkill(meta, pass2);
    expect(v.kind).toBe('accept');
    expect(v.entry.verdict).toBe('accept');
  });

  it('시나리오 하나 fail → reject', () => {
    const v = evaluateSkill(meta, {
      ...pass2,
      scenarios: [{ name: 's1', passed: true }, { name: 's2', passed: false }],
    });
    expect(v.kind).toBe('reject');
  });

  it('시나리오 0개 → reject (검증 부재 = 날조 0)', () => {
    const v = evaluateSkill(meta, { scenarios: [], touchesPersonaCore: false });
    expect(v.kind).toBe('reject');
    if (v.kind === 'reject') expect(v.reason).toContain('시나리오 부재');
  });

  it('전 PASS 지만 persona-core 수정 → escalate (⑤ 사람 승인)', () => {
    const v = evaluateSkill(meta, { ...pass2, touchesPersonaCore: true });
    expect(v.kind).toBe('escalate');
    if (v.kind === 'escalate') expect(v.reason).toContain('persona-core');
  });

  it('3 verdict 다 ArchiveEntry 생성 (감사) + track=self', () => {
    expect(evaluateSkill(meta, pass2).entry.track).toBe('self');
    expect(
      evaluateSkill(meta, { ...pass2, touchesPersonaCore: true }).entry.verdict,
    ).toBe('escalate');
    expect(
      evaluateSkill(meta, { scenarios: [{ name: 'x', passed: false }], touchesPersonaCore: false })
        .entry.verdict,
    ).toBe('reject');
  });
});

describe('toSkillArchiveLine — sub-C improvement-archive 재사용 형식', () => {
  it('개행 종료 1줄 JSON', () => {
    const line = toSkillArchiveLine(evaluateSkill(meta, pass2).entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim()).track).toBe('self');
  });
});
