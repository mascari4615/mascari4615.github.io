/**
 * governance — 에이전트 거버넌스 코어 (KAR-018-D slice-1, parent ④).
 *
 * 그릴-락:
 *  D-1 토폴로지 = substrate-순수 모듈 (dispatcher.ts 형제, Discord/karmolab-ai 0).
 *  D-2 예산    = tier3 작업단위당 bounded reserve, 보수 ceiling+ENV override,
 *               verdict ladder allow/narrow/escalate/stop (보수적 dual-start).
 *  D-4 드리프트 = objectives.md ④ anchor 3-판정 순수함수 (단일 출처 cite).
 *
 * 본 모듈 = *순수 정책 로직*만 (Discord/프로세스/karmolab-ai 의존 0).
 * team-room.reserveBudget · agent-cadence.deps.reserve = 얇은 어댑터로 위임(slice-2).
 * trace jsonl · #team-bus 게시 · pending-approval 영속 = slice-2/3 어댑터가 소비.
 */

// ── 예산 reserve → evaluate (D-2, parent ④) ──────────────────

/** parent ④ 열거 그대로. allow=진행 / narrow=범위축소 진행 / escalate=#team-bus 승인 / stop=거부. */
export type BudgetVerdict = 'allow' | 'narrow' | 'escalate' | 'stop';

export interface BudgetCeilings {
  tokens: number;
  ms: number;
  toolCalls: number;
}

export interface BudgetRequest {
  core: string;
  /**
   * risk-tag (비가역·외부영향·자가개선 환경변경·비전/페르소나 변경 등 —
   * agent-mission §2.3 게이트 3경우). 존재 시 *posture 무관* 무조건 escalate.
   */
  riskTag?: string;
  /** 작업단위 추정치 (caller/cadence 가 알 때만 — 미상이면 ceiling 으로 bound). */
  estTokens?: number;
  estMs?: number;
  estToolCalls?: number;
}

export interface BudgetDecision {
  verdict: BudgetVerdict;
  /** 승인된 ceiling — narrow 시 soft 치로 축소, stop/escalate 시 요청 ceiling. */
  granted: BudgetCeilings;
  reason: string;
}

/** 보수적 정적 default — process.md § dual 구조 fallback (ENV 로 dial-up). */
export const CONSERVATIVE_CEILINGS: BudgetCeilings = {
  tokens: 80_000,
  ms: 1_800_000, // 30분 — AGENT_TIER3_TIMEOUT_MS 보수 디폴트와 정합
  toolCalls: 60,
};

/** narrow 임계 = ceiling 대비 비율 (이상이면 축소 진행). */
const SOFT_RATIO = 0.8;

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 보수 ceiling + ENV override (D-2 dual-start).
 * AGENT_BUDGET_TOKENS / _MS / _TOOLCALLS — 미설정/부정값이면 보수 디폴트.
 */
export function ceilingsFromEnv(
  env: Record<string, string | undefined>,
): BudgetCeilings {
  return {
    tokens: num(env.AGENT_BUDGET_TOKENS, CONSERVATIVE_CEILINGS.tokens),
    ms: num(env.AGENT_BUDGET_MS, CONSERVATIVE_CEILINGS.ms),
    toolCalls: num(env.AGENT_BUDGET_TOOLCALLS, CONSERVATIVE_CEILINGS.toolCalls),
  };
}

/**
 * tier3 작업단위당 예산 reserve (bounded, B-2 정합 — cross-session 누적 X).
 * 보수적 dual-start posture:
 *  · risk-tag 존재 → 무조건 escalate (posture 무관).
 *  · 추정치가 ceiling 초과(어느 축이든) → stop.
 *  · 추정치가 soft(ceiling*0.8) 이상 → narrow (soft 치로 granted 축소).
 *  · 그 외(추정 미상 포함) → allow (granted=ceiling 이 상한 bound).
 */
export function reserveBudget(
  req: BudgetRequest,
  ceilings: BudgetCeilings,
): BudgetDecision {
  if (req.riskTag && req.riskTag.trim() !== '') {
    return {
      verdict: 'escalate',
      granted: ceilings,
      reason: `risk-tag(${req.riskTag}) — #team-bus 승인 필요 (agent-mission §2.3)`,
    };
  }

  const over =
    (req.estTokens !== undefined && req.estTokens > ceilings.tokens) ||
    (req.estMs !== undefined && req.estMs > ceilings.ms) ||
    (req.estToolCalls !== undefined && req.estToolCalls > ceilings.toolCalls);
  if (over) {
    return {
      verdict: 'stop',
      granted: ceilings,
      reason: '추정 작업량이 예산 ceiling 초과 — 거부 (분할 필요)',
    };
  }

  const soft: BudgetCeilings = {
    tokens: Math.floor(ceilings.tokens * SOFT_RATIO),
    ms: Math.floor(ceilings.ms * SOFT_RATIO),
    toolCalls: Math.floor(ceilings.toolCalls * SOFT_RATIO),
  };
  const nearCap =
    (req.estTokens !== undefined && req.estTokens >= soft.tokens) ||
    (req.estMs !== undefined && req.estMs >= soft.ms) ||
    (req.estToolCalls !== undefined && req.estToolCalls >= soft.toolCalls);
  if (nearCap) {
    return {
      verdict: 'narrow',
      granted: soft,
      reason: 'soft 임계 근접 — 범위 축소 진행 (granted=soft)',
    };
  }

  return { verdict: 'allow', granted: ceilings, reason: 'ok' };
}
