/**
 * governance 순수부 행동 테스트 (KAR-018-D slice-1).
 * tracer-bullet: 예산 verdict ladder / ENV override.
 */
import { describe, it, expect } from 'vitest';
import {
  reserveBudget,
  ceilingsFromEnv,
  CONSERVATIVE_CEILINGS,
  type BudgetCeilings,
} from './governance';

const CEIL: BudgetCeilings = { tokens: 1000, ms: 1000, toolCalls: 10 };

describe('reserveBudget — verdict ladder (D-2, 보수적 dual-start)', () => {
  it('risk-tag 존재 → 무조건 escalate (posture 무관)', () => {
    const d = reserveBudget({ core: 'a', riskTag: 'irreversible', estTokens: 1 }, CEIL);
    expect(d.verdict).toBe('escalate');
  });

  it('추정치가 ceiling 초과(어느 축이든) → stop', () => {
    expect(reserveBudget({ core: 'a', estTokens: 1001 }, CEIL).verdict).toBe('stop');
    expect(reserveBudget({ core: 'a', estToolCalls: 11 }, CEIL).verdict).toBe('stop');
  });

  it('soft(0.8) 이상 → narrow + granted 축소', () => {
    const d = reserveBudget({ core: 'a', estTokens: 850 }, CEIL);
    expect(d.verdict).toBe('narrow');
    expect(d.granted.tokens).toBe(800);
  });

  it('여유 → allow, granted=ceiling', () => {
    const d = reserveBudget({ core: 'a', estTokens: 100 }, CEIL);
    expect(d.verdict).toBe('allow');
    expect(d.granted).toEqual(CEIL);
  });

  it('추정 미상 → allow (ceiling 이 상한 bound)', () => {
    expect(reserveBudget({ core: 'a' }, CEIL).verdict).toBe('allow');
  });
});

describe('ceilingsFromEnv — 보수 default + ENV override (dual-start)', () => {
  it('미설정 → 보수 default', () => {
    expect(ceilingsFromEnv({})).toEqual(CONSERVATIVE_CEILINGS);
  });

  it('ENV 양수 → override', () => {
    const c = ceilingsFromEnv({ AGENT_BUDGET_TOKENS: '5000' });
    expect(c.tokens).toBe(5000);
    expect(c.ms).toBe(CONSERVATIVE_CEILINGS.ms); // 미설정 축은 보수치
  });

  it('부정/비수치 → 보수 default (안전)', () => {
    expect(ceilingsFromEnv({ AGENT_BUDGET_TOKENS: '-1' }).tokens).toBe(
      CONSERVATIVE_CEILINGS.tokens,
    );
    expect(ceilingsFromEnv({ AGENT_BUDGET_MS: 'abc' }).ms).toBe(
      CONSERVATIVE_CEILINGS.ms,
    );
  });
});
