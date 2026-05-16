/**
 * agent-factory-adapter — 에이전트 팩토리 어댑터 (KAR-018-E slice-2).
 *
 * substrate⊥어댑터(⓪'): agent-factory.ts(순수 spec 검증) ↔ 실 spec 로드/
 * dry-run/archive/escalate 사이. 평행정의0 — sub-C·D 어댑터 재사용:
 *  · archive = sub-C `appendArchive`(improvement-archive/<date>.jsonl)
 *  · escalate = sub-D `appendApproval`(pending) + `NotifyFn`(④ 새에이전트 승인)
 *
 * 새 에이전트는 *자동 활성화 X* (parent ⑤): valid → escalate(사람 승인) 까지.
 * 실 활성화(core.md status:draft→active) = 사람 승인 후 별도 (slice-3/외부).
 */
import {
  evaluateAgentSpec,
  toFactoryArchiveLine,
  type AgentSpec,
  type FactoryContext,
  type FactoryVerdict,
} from './agent-factory';
import { appendArchive } from './self-improve-adapter';
import {
  appendApproval,
  hasPending,
  defaultNotify,
  type NotifyFn,
} from './governance-adapter';

/** 실 dry-run(스펙 인스턴스화 시뮬) 실행 (DI — 테스트 mock). */
export type DryRunner = (spec: AgentSpec) => Promise<boolean>;

export interface AgentFactoryDeps {
  env: NodeJS.ProcessEnv;
  /** 충돌 검사 컨텍스트(기존 코어 id·점유 slot) 로드 (DI). */
  loadContext: () => Promise<Omit<FactoryContext, 'dryRunOk'>>;
  dryRun: DryRunner;
  notify?: NotifyFn;
}

export interface AgentFactoryOutcome {
  verdict: FactoryVerdict;
}

/**
 * 에이전트 spec 1건 처리 (parent ⑤): context 로드 + dry-run → evaluateAgentSpec
 * (순수 DGM) → archive(verdict 무관, sub-C 재사용) → escalate=sub-D pending+
 * #team-bus(④ 새에이전트 사람 승인, 중복 억제) / reject=폐기 notify.
 * *자동 활성화 절대 X.*
 */
export async function runAgentFactory(
  spec: AgentSpec,
  deps: AgentFactoryDeps,
): Promise<AgentFactoryOutcome> {
  const base = await deps.loadContext();
  const dryRunOk = await deps.dryRun(spec);
  const verdict = evaluateAgentSpec(spec, { ...base, dryRunOk });
  appendArchive(deps.env, toFactoryArchiveLine(verdict.entry));

  const notify = deps.notify ?? defaultNotify(deps.env);

  if (verdict.kind === 'reject') {
    notify(`에이전트 spec reject: ${spec.id}(${spec.coreId}) — ${verdict.reason} (폐기)`);
    return { verdict };
  }

  // escalate — 새 에이전트 = ④ 사람 승인 (sub-D 경로 재사용, 중복 억제)
  if (!hasPending(deps.env, spec.id)) {
    appendApproval(deps.env, {
      ts: new Date().toISOString(),
      objId: spec.id,
      core: spec.coreId,
      status: 'pending',
      reason: verdict.reason,
    });
    notify(
      `⚠ 새 에이전트 ${spec.id}(${spec.coreId}/${spec.name}) — 사람 승인 대기: ${verdict.reason}`,
    );
  }
  return { verdict };
}
