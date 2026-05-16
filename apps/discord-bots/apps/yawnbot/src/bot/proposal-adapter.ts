/**
 * proposal-adapter — ⑦' 생산자 발굴→파싱→라우팅→디스패치 (KAR-018-W slice-2).
 *
 * substrate⊥어댑터(⓪'): proposal.ts(순수 envelope/router) ↔ 실 발굴 LLM·
 * 엔진 디스패치 사이. 평행정의0 — sub-D `appendTrace`/`NotifyFn` 재사용.
 *
 * W-4 no-auto-exec: dispatch 는 *seed TASK / proposed objective 또는 엔진
 * 게이트까지만*. 즉시 main 반영·활성화 X (각 엔진의 ②/②'/④ 게이트가 차단,
 * 활성화는 slice-3 사람승인 reconcile). 발굴 실패·미배선 = 폐기 + trace.
 */
import fs from 'fs';
import path from 'path';
import {
  parseProposalEnvelope,
  routeProposal,
  type ProposalEnvelope,
  type RouteTarget,
} from './proposal';
import { appendTrace, defaultNotify, type NotifyFn } from './governance-adapter';

/** 발굴 LLM 호출 (DI — generateAssistantText 'claude-cli' 래퍼 주입). */
export type DiscoverFn = () => Promise<string>;

/** kind 별 엔진 디스패치 (DI — 각 run·seed·append 어댑터 주입). */
export type ProposalDispatch = Partial<
  Record<RouteTarget, (env: ProposalEnvelope) => Promise<void>>
>;

export interface ProposalProducerDeps {
  env: NodeJS.ProcessEnv;
  discover: DiscoverFn;
  dispatch: ProposalDispatch;
  notify?: NotifyFn;
}

/**
 * ⑦' 생산자 1 tick: 발굴 → parse(검증) → route → dispatch.
 *  · 파싱 실패(형식·부분·미지) → 'parse-fail' (폐기 + trace, 날조 0).
 *  · 타겟 미배선 → 'no-dispatch' (해당 엔진 어댑터 미주입 — graceful).
 *  · 정상 → RouteTarget (dispatch 가 seed/proposed/엔진게이트까지만, no-auto-exec).
 */
export async function runProducerOnce(
  deps: ProposalProducerDeps,
): Promise<string> {
  const notify = deps.notify ?? defaultNotify(deps.env);
  let raw: string;
  try {
    raw = await deps.discover();
  } catch (e) {
    notify(
      `⑦' 발굴 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 'discover-error';
  }

  const envelope = parseProposalEnvelope(raw);
  if (!envelope) {
    appendTrace(deps.env, {
      ts: new Date().toISOString(),
      type: 'drift',
      core: 'producer',
      reason: '발굴물 파싱 실패(형식·부분·미지) — 폐기',
    });
    notify('⑦\' 발굴물 파싱 실패 — 폐기 (날조 0)');
    return 'parse-fail';
  }

  const target = routeProposal(envelope);
  const fn = deps.dispatch[target];
  if (!fn) {
    notify(`⑦' ${envelope.kind}→${target} 디스패치 미배선 — 보류`);
    return 'no-dispatch';
  }

  await fn(envelope); // no-auto-exec: dispatch=인박스/seed/엔진게이트까지만
  appendTrace(deps.env, {
    ts: new Date().toISOString(),
    type: 'budget',
    core: 'producer',
    reason: `발굴→${target} (${envelope.kind})`,
  });
  notify(`⑦' 발굴 → ${target} (${envelope.kind}) — 게이트 대기`);
  return target;
}

// ── 보수적 materialization: proposals 인박스 (canon 자동변경 X) ──
// objectives.md 「발굴물 자동 실행 절대 X」 최보수 해석 — 발굴물은 사람
// 검토용 인박스(jsonl)에만 기록. seed TASK/objective row/엔진 실행은
// *사람·후속 단계*가 인박스에서 승격 (slice-3/W 후속). agent-state/
// approvals/archive 와 동급 런타임 아티팩트(gitignore 됨).

export function proposalsPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'proposals.jsonl') : '';
}

export interface ProposalInboxEntry {
  ts: string;
  target: RouteTarget;
  kind: ProposalEnvelope['kind'];
  envelope: ProposalEnvelope;
}

export function appendProposal(
  env: NodeJS.ProcessEnv,
  entry: ProposalInboxEntry,
): void {
  const p = proposalsPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    /* best-effort — 인박스 실패가 발굴을 막지 않음 */
  }
}

/**
 * 보수 dispatch: 모든 타겟 → proposals 인박스 기록 (canon 무변경).
 * 엔진 실행/seed/active 승격은 사람 검토 후 (W slice-3/후속 — 데드
 * 인터페이스 방지 + 「자동 실행 절대 X」 최보수).
 */
export function inboxDispatch(env: NodeJS.ProcessEnv): ProposalDispatch {
  const targets: RouteTarget[] = [
    'self-improve',
    'self-skill',
    'agent-factory',
    'task-new',
    'objectives',
  ];
  const d: ProposalDispatch = {};
  for (const t of targets) {
    d[t] = async (envelope) => {
      appendProposal(env, {
        ts: new Date().toISOString(),
        target: t,
        kind: envelope.kind,
        envelope,
      });
    };
  }
  return d;
}
