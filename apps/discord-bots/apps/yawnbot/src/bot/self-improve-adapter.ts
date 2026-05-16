/**
 * self-improve-adapter — 자가개선 환경트랙 어댑터 (KAR-018-C slice-2).
 *
 * substrate⊥어댑터(parent ⓪'): self-improve.ts(순수 판정) ↔ 실 검증 실행/
 * git Draft PR/jsonl write 사이. 실 명령·git·fs 형은 어댑터만, 코어는 모름.
 *
 * slice-2 책임:
 *  · VerifyRunner DI(compile/test/hook + repo-metrics 베이스라인 delta)
 *  · improvement-archive/<date>.jsonl write (discoveries 형식, accept∧reject 둘 다)
 *  · accept → Draft PR(C-4 git.md autopilot 예외, 직접 push X) / reject → 폐기
 *  · #team-bus notify = sub-D governance-adapter NotifyFn 재사용 (평행정의0)
 */
import fs from 'fs';
import path from 'path';
import {
  evaluateProposal,
  toArchiveLine,
  type ProposalMeta,
  type ProposalVerdict,
} from './self-improve';
import { defaultNotify, type NotifyFn } from './governance-adapter';

function memoRoot(env: NodeJS.ProcessEnv): string {
  return env.MEMO_REPO_PATH?.trim() || '';
}

export function archivePath(env: NodeJS.ProcessEnv, date = new Date()): string {
  const root = memoRoot(env);
  if (!root) return '';
  const d = date.toISOString().slice(0, 10); // YYYY-MM-DD (discoveries 패턴)
  return path.join(root, '.claude', 'improvement-archive', `${d}.jsonl`);
}

/** accept/reject 무관 archive append (C-5 감사). best-effort. */
export function appendArchive(
  env: NodeJS.ProcessEnv,
  line: string,
  date = new Date(),
): void {
  const p = archivePath(env, date);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, line, 'utf-8');
  } catch {
    /* best-effort — 감사 실패가 판정을 막지 않음 */
  }
}

/** 실 검증 실행 (DI — 테스트는 mock, 배선은 npm/repo-metrics 래퍼 주입). */
export interface VerifyRunner {
  compile: () => Promise<boolean>;
  test: () => Promise<boolean>;
  hook: () => Promise<boolean>;
  /** KAR-003 repo-metrics --json 전후 비교 → 악화 delta (>0=회귀). */
  baselineDelta: () => Promise<number>;
}

/** accept 시 Draft PR (C-4, git DI — 직접 push X). */
export type OpenDraftPr = (
  meta: ProposalMeta,
) => Promise<{ url?: string }>;

export interface SelfImproveDeps {
  env: NodeJS.ProcessEnv;
  verify: VerifyRunner;
  notify?: NotifyFn;
  openDraftPr?: OpenDraftPr;
}

export interface SelfImproveOutcome {
  verdict: ProposalVerdict;
  prUrl?: string;
}

/**
 * 자가개선 1건 처리 (parent ②): 검증 실행 → evaluateProposal(순수 DGM) →
 * archive(accept∧reject) → accept 면 Draft PR + notify / reject 면 폐기 + notify.
 * *직접 main push 절대 X* (C-4, agent-mission §2.3 ②).
 */
export async function runSelfImprove(
  meta: ProposalMeta,
  deps: SelfImproveDeps,
): Promise<SelfImproveOutcome> {
  const [compile, test, hook, baselineRegressionDelta] = await Promise.all([
    deps.verify.compile(),
    deps.verify.test(),
    deps.verify.hook(),
    deps.verify.baselineDelta(),
  ]);

  const verdict = evaluateProposal(meta, {
    compile,
    test,
    hook,
    baselineRegressionDelta,
  });
  appendArchive(deps.env, toArchiveLine(verdict.entry));

  const notify = deps.notify ?? defaultNotify(deps.env);
  if (verdict.accept === false) {
    notify(`자가개선 reject: ${meta.id} — ${verdict.reason} (폐기)`);
    return { verdict };
  }

  let prUrl: string | undefined;
  if (deps.openDraftPr) {
    try {
      prUrl = (await deps.openDraftPr(meta)).url;
    } catch (e) {
      notify(
        `자가개선 ${meta.id} accept 했으나 Draft PR 실패: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { verdict };
    }
  }
  notify(
    `자가개선 accept: ${meta.id} → Draft PR ${prUrl ?? '(PR fn 미배선 — 미러 랜딩 시)'}`,
  );
  return { verdict, prUrl };
}
