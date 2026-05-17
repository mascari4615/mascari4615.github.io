/**
 * agent-factory — 에이전트 팩토리(자기증식) 검증 코어
 * (KAR-018-E slice-1, parent ⑤).
 *
 * 그릴-락:
 *  E-1 토폴로지 = substrate-순수 (self-improve/self-skill/governance 형제, 0 import).
 *  E-2 게이트   = spec valid ∧ id/slot 무충돌 ∧ dry-run OK 만 통과.
 *  E-3 승인     = 새 에이전트 = 항상 ④ 사람 승인 (auto-accept 경로 없음).
 *
 * 핵심: 팩토리는 새 에이전트를 *자동 활성화하지 않는다*. 검증 전 PASS =
 * `escalate`(④ #team-bus 사람 승인, sub-D 재사용) 이 최선 verdict —
 * 활성화는 사람 승인 *후* 별도(슬라이스 외). 검증 fail = reject (날조 0,
 * DGM 동형). dry-run 결과는 입력 boolean (semantic upstream — NLP 날조 X).
 */

export interface AgentSpec {
  /** 제안 id (PROP/AGENT 시퀀스). */
  id: string;
  /** 새 코어 id (memo/.claude/agents/<coreId>/). */
  coreId: string;
  /** 실행 레인 slot 희망 (선택 — 비면 동적 배정). */
  slot?: string;
  role: string;
  name: string;
  source: string;
  /**
   * 코어 종류 — `worker` 면 ⑦(2) 소비자 워커(KAR-018-X): 자기 도메인
   * ready TASK pull→tier3 실행. 미설정 = 생산자/대화형(atlas/echo 동형).
   * 머터리얼라이즈 시 core.md frontmatter 로 pass-through (없으면 무출력
   * = 기존 동작 byte-identical, 후방호환).
   */
  kind?: string;
  /** 워커 담당 TASK prefix (WM/KL/YB/KAR/...). kind=worker 시 필수. */
  domain?: string;
  /** 머신 어피니티 (desktop/laptop/any...). 미설정 = any. */
  machine?: string;
}

export interface FactoryContext {
  /** 기존 코어 id 셋 (충돌 검사). */
  existingCoreIds: string[];
  /** 점유 slot 셋 (충돌 검사). */
  occupiedSlots: string[];
  /** dry-run(스펙 인스턴스화 시뮬) 결과 — undefined=미상=reject. */
  dryRunOk?: boolean;
}

export type FactoryVerdictKind = 'reject' | 'escalate';

export interface FactoryArchiveEntry {
  ts: string;
  track: 'factory';
  proposalId: string;
  coreId: string;
  name: string;
  role: string;
  source: string;
  verdict: FactoryVerdictKind;
  reason: string;
}

export type FactoryVerdict = {
  kind: FactoryVerdictKind;
  reason: string;
  entry: FactoryArchiveEntry;
};

function specComplete(s: AgentSpec): boolean {
  return (
    s.id.trim() !== '' &&
    s.coreId.trim() !== '' &&
    s.role.trim() !== '' &&
    s.name.trim() !== ''
  );
}

/**
 * 에이전트 spec 검증 (parent ⑤, DGM 동형).
 *  · spec 불완전 / coreId·slot 충돌 / dry-run !OK·미상 → reject (날조 0).
 *  · 전 PASS → escalate (④ 새 에이전트 = 사람 승인, sub-D 재사용).
 * verdict 무관 FactoryArchiveEntry 항상 생성 (감사).
 */
export function evaluateAgentSpec(
  spec: AgentSpec,
  ctx: FactoryContext,
): FactoryVerdict {
  let kind: FactoryVerdictKind = 'escalate';
  let reason = 'spec valid ∧ 무충돌 ∧ dry-run OK — ④ 사람 승인 필요 (새 에이전트)';

  if (!specComplete(spec)) {
    kind = 'reject';
    reason = 'spec 불완전 (id/coreId/role/name 누락) — 폐기';
  } else if (ctx.existingCoreIds.includes(spec.coreId)) {
    kind = 'reject';
    reason = `coreId '${spec.coreId}' 충돌 (기존 코어) — 폐기`;
  } else if (spec.slot && ctx.occupiedSlots.includes(spec.slot)) {
    kind = 'reject';
    reason = `slot '${spec.slot}' 점유 충돌 — 폐기`;
  } else if (ctx.dryRunOk !== true) {
    kind = 'reject';
    reason =
      ctx.dryRunOk === false
        ? 'dry-run 실패 — 폐기'
        : 'dry-run 결과 미상 — 검증 불가 폐기 (날조 0)';
  }

  const entry: FactoryArchiveEntry = {
    ts: new Date().toISOString(),
    track: 'factory',
    proposalId: spec.id,
    coreId: spec.coreId,
    name: spec.name,
    role: spec.role,
    source: spec.source,
    verdict: kind,
    reason,
  };

  return { kind, reason, entry };
}

/** FactoryArchiveEntry → jsonl 한 줄 (sub-C improvement-archive 재사용 형식). */
export function toFactoryArchiveLine(entry: FactoryArchiveEntry): string {
  return JSON.stringify(entry) + '\n';
}
