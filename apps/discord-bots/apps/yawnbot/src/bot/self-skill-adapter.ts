/**
 * self-skill-adapter — 자가개선 자기 트랙 어댑터 (KAR-018-F slice-2).
 *
 * substrate⊥어댑터(⓪'): self-skill.ts(순수 행동평가) ↔ 실 시나리오 실행/
 * archive/escalate/roster write 사이. 평행정의0 — sub-C·D 어댑터 재사용:
 *  · archive = sub-C `appendArchive`(improvement-archive/<date>.jsonl)
 *  · escalate = sub-D `appendApproval`+`hasPending`(pending) + `NotifyFn`
 *  · accept → roster.skills 추가 = DI(core.md authoring=sub-E 영역, seam만)
 */
import {
  evaluateSkill,
  toSkillArchiveLine,
  type SkillProposal,
  type SkillEvalResults,
  type SkillVerdict,
} from './self-skill';
import { appendArchive } from './self-improve-adapter';
import {
  appendApproval,
  hasPending,
  defaultNotify,
  type NotifyFn,
} from './governance-adapter';

/** 회귀 시나리오 셋 실행 (DI — 테스트 mock, 배선은 실 러너 주입). */
export type ScenarioRunner = (
  meta: SkillProposal,
) => Promise<SkillEvalResults>;

/** accept 시 core.md frontmatter skills 추가 (DI — core.md authoring=sub-E). */
export type ApplyRosterSkill = (meta: SkillProposal) => Promise<void>;

export interface SelfSkillDeps {
  env: NodeJS.ProcessEnv;
  runScenarios: ScenarioRunner;
  notify?: NotifyFn;
  applyRosterSkill?: ApplyRosterSkill;
}

export interface SelfSkillOutcome {
  verdict: SkillVerdict;
  rosterApplied: boolean;
}

/**
 * 스킬 propose 1건 처리 (parent ②'): 시나리오 실행 → evaluateSkill(순수 DGM)
 * → archive(3 verdict 다, sub-C 재사용) → accept=roster.skills 추가+notify /
 * escalate=sub-D pending+#team-bus(⑤ 사람 승인) / reject=폐기 notify.
 */
export async function runSelfSkill(
  meta: SkillProposal,
  deps: SelfSkillDeps,
): Promise<SelfSkillOutcome> {
  const results = await deps.runScenarios(meta);
  const verdict = evaluateSkill(meta, results);
  appendArchive(deps.env, toSkillArchiveLine(verdict.entry));

  const notify = deps.notify ?? defaultNotify(deps.env);

  if (verdict.kind === 'reject') {
    notify(`스킬 reject: ${meta.id}(${meta.name}) — ${verdict.reason} (폐기)`);
    return { verdict, rosterApplied: false };
  }

  if (verdict.kind === 'escalate') {
    // ⑤ persona-core 수정 = sub-D risk-tag escalate 경로 재사용 (중복 억제)
    if (!hasPending(deps.env, meta.id)) {
      appendApproval(deps.env, {
        ts: new Date().toISOString(),
        objId: meta.id,
        core: meta.coreId,
        status: 'pending',
        reason: verdict.reason,
      });
      notify(
        `⚠ 스킬 ${meta.id}(${meta.name}) persona-core 수정 — 사람 승인 대기: ${verdict.reason}`,
      );
    }
    return { verdict, rosterApplied: false };
  }

  // accept → roster.skills 추가 (core.md authoring=sub-E 영역, DI seam)
  let rosterApplied = false;
  if (deps.applyRosterSkill) {
    try {
      await deps.applyRosterSkill(meta);
      rosterApplied = true;
    } catch (e) {
      notify(
        `스킬 ${meta.id} accept 했으나 roster 적용 실패: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { verdict, rosterApplied: false };
    }
  }
  notify(
    `스킬 accept: ${meta.id}(${meta.name}) → roster.skills ${
      rosterApplied ? '추가' : '(applyRosterSkill 미배선 — sub-E 랜딩 시)'
    }`,
  );
  return { verdict, rosterApplied };
}
