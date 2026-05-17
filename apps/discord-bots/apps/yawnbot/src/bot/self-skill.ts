/**
 * self-skill — 자가개선 자기 트랙 (Voyager형 스킬 누적) 코어
 * (KAR-018-F slice-1, parent ②').
 *
 * 그릴-락:
 *  F-1 토폴로지 = substrate-순수 (self-improve.ts·governance.ts 형제, 0 import).
 *  F-2 게이트   = 회귀 시나리오 셋 *전부* PASS ∧ persona-core 무수정 = accept.
 *  F-4 persona-core 수정 = escalate (⑤ 사람 승인 = sub-D risk-tag escalate 재사용).
 *
 * DGM 동형(self-improve.ts 와 같은 정신): 시나리오 *전부* PASS 만 accept,
 * 부분/미상 = reject — 스킬 효과 날조 경로 0 (황금의 정신). persona-core
 * (이름·역할·가치) 수정 감지는 *입력 boolean* (semantic upstream — sub-D
 * flagNonGoal 동형, NLP 날조 X). 실 시나리오 실행·roster write·escalate
 * 배선 = 어댑터(slice-2 DI).
 */

export interface SkillProposal {
  id: string;
  /** 스킬/체크리스트 명 (roster.skills 후보). */
  name: string;
  summary: string;
  /** 도출 근거 (self-task / objective). */
  source: string;
  /** 대상 코어 (core.md). */
  coreId: string;
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
}

export interface SkillEvalResults {
  /** 회귀 시나리오 셋 결과 (비어있으면 reject — 검증 부재 = 날조 위험). */
  scenarios: ScenarioResult[];
  /**
   * 페르소나 코어(이름·역할·가치) 수정 여부 — semantic 판정은 upstream
   * 자가검사(sub-D flagNonGoal 동형). self-skill 은 enforce 만.
   */
  touchesPersonaCore: boolean;
}

export type SkillVerdictKind = 'accept' | 'reject' | 'escalate';

export interface SkillArchiveEntry {
  ts: string;
  track: 'self';
  proposalId: string;
  skillName: string;
  coreId: string;
  source: string;
  verdict: SkillVerdictKind;
  scenarios: ScenarioResult[];
  touchesPersonaCore: boolean;
  reason: string;
}

export type SkillVerdict =
  | { kind: 'accept'; entry: SkillArchiveEntry }
  | { kind: 'reject'; reason: string; entry: SkillArchiveEntry }
  | { kind: 'escalate'; reason: string; entry: SkillArchiveEntry };

/**
 * 스킬 propose 행동평가 (parent ②', DGM 동형).
 *  · 시나리오 0개 또는 하나라도 fail → reject (검증 부재·부분 = 날조 0).
 *  · 전 PASS ∧ persona-core 수정 → escalate (⑤ 사람 승인, sub-D 재사용).
 *  · 전 PASS ∧ persona-core 무수정 → accept (roster.skills 추가 대상).
 * 3 verdict 무관 SkillArchiveEntry 항상 생성 (감사).
 */
export function evaluateSkill(
  meta: SkillProposal,
  results: SkillEvalResults,
): SkillVerdict {
  const allPass =
    results.scenarios.length > 0 &&
    results.scenarios.every((s) => s.passed);

  const kind: SkillVerdictKind = !allPass
    ? 'reject'
    : results.touchesPersonaCore
      ? 'escalate'
      : 'accept';

  const reason =
    kind === 'accept'
      ? '회귀 시나리오 전 PASS ∧ persona-core 무수정 — roster.skills 추가'
      : kind === 'escalate'
        ? 'persona-core(이름·역할·가치) 수정 — ⑤ 사람 승인 필요 (sub-D escalate)'
        : results.scenarios.length === 0
          ? '회귀 시나리오 부재 — 검증 불가 폐기 (날조 0)'
          : '회귀 시나리오 fail — 폐기';

  const entry: SkillArchiveEntry = {
    ts: new Date().toISOString(),
    track: 'self',
    proposalId: meta.id,
    skillName: meta.name,
    coreId: meta.coreId,
    source: meta.source,
    verdict: kind,
    scenarios: results.scenarios,
    touchesPersonaCore: results.touchesPersonaCore,
    reason,
  };

  if (kind === 'accept') return { kind, entry };
  return { kind, reason, entry };
}

/** SkillArchiveEntry → jsonl 한 줄 (sub-C improvement-archive 재사용 형식). */
export function toSkillArchiveLine(entry: SkillArchiveEntry): string {
  return JSON.stringify(entry) + '\n';
}
