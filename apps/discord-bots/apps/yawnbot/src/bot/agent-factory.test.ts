/**
 * agent-factory 순수부 행동 테스트 (KAR-018-E slice-1).
 * tracer-bullet: DGM 동형(전 PASS=escalate, 부분/미상=reject), 자동 활성화 0.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateAgentSpec,
  toFactoryArchiveLine,
  type AgentSpec,
  type FactoryContext,
} from './agent-factory';

const spec: AgentSpec = {
  id: 'AG-1',
  coreId: 'nova',
  role: 'research',
  name: 'Nova',
  source: 'self-task',
};
const ctx: FactoryContext = {
  existingCoreIds: ['atlas'],
  occupiedSlots: ['A'],
  dryRunOk: true,
};

describe('evaluateAgentSpec — parent ⑤ (auto-accept 경로 없음)', () => {
  it('전 PASS → escalate (④ 사람 승인, accept X)', () => {
    const v = evaluateAgentSpec(spec, ctx);
    expect(v.kind).toBe('escalate');
    expect(v.entry.verdict).toBe('escalate');
  });

  it('spec 불완전 → reject', () => {
    expect(evaluateAgentSpec({ ...spec, name: '' }, ctx).kind).toBe('reject');
  });

  it('coreId 충돌 → reject', () => {
    expect(evaluateAgentSpec({ ...spec, coreId: 'atlas' }, ctx).kind).toBe('reject');
  });

  it('slot 점유 충돌 → reject', () => {
    expect(evaluateAgentSpec({ ...spec, slot: 'A' }, ctx).kind).toBe('reject');
  });

  it('dry-run 실패 → reject', () => {
    expect(evaluateAgentSpec(spec, { ...ctx, dryRunOk: false }).kind).toBe('reject');
  });

  it('dry-run 미상 → reject (날조 0)', () => {
    const v = evaluateAgentSpec(spec, { ...ctx, dryRunOk: undefined });
    expect(v.kind).toBe('reject');
    expect(v.reason).toContain('미상');
  });

  it('slot 미지정 + 나머지 OK → escalate', () => {
    const { slot, ...noSlot } = spec;
    expect(evaluateAgentSpec(noSlot as AgentSpec, ctx).kind).toBe('escalate');
  });

  it('verdict 무관 ArchiveEntry 생성 (감사) + track=factory', () => {
    expect(evaluateAgentSpec(spec, ctx).entry.track).toBe('factory');
    expect(evaluateAgentSpec({ ...spec, name: '' }, ctx).entry.verdict).toBe('reject');
  });
});

describe('toFactoryArchiveLine — improvement-archive 재사용 형식', () => {
  it('개행 종료 1줄 JSON', () => {
    const line = toFactoryArchiveLine(evaluateAgentSpec(spec, ctx).entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim()).track).toBe('factory');
  });
});
