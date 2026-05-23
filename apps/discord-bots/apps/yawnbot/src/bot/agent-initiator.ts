/**
 * agent-initiator — 팀-드리븐 발의 루프 (TASK-KAR-018-INIT).
 *
 * 헌장 §1·§2.3 명시 비전 "평등 피어로 새 기능·프로젝트·아이디어를
 * *주도적으로 발의·진행*" 의 실행 substrate. 현 코드는 §2.8 자가증강
 * (*적용/revert* layer) 까지만 와 있고 *입력/발의* layer = 0.
 *
 * 갭 증거 (2026-05-23, INIT 시드 시점 upstream 60 commits 진단): workers
 * 가 자기 실패 분석 TASK 를 KAR-115~126 (12개) 자가시드 = 합의 substrate
 * 부재로 redundant proposal 폭주. 발의자 부재의 직접 증거.
 *
 * substrate-first (평행 표면 0):
 *  - 측정 신호 = 기존 `gatherHealthSignals` + `diagnoseHealth` 재사용
 *    (새 평행 측정 파이프 X)
 *  - 점수화 = 순수·결정적 (LLM 무관 = 날조 0)
 *  - 산출 = ledger jsonl append 만 (실 TASK seed write 는 별도 사이클 — INIT
 *    골격 = *제안 표면화* 까지, 실 발의는 §2.8 측정 게이트 active 전이 후)
 *  - core status = draft (`memo/.claude/agents/initiator/core.md`) — 자동
 *    활성화 X (§2.8 안전 바닥)
 *
 * 안전 바닥:
 *  - 비가역·외부영향 액션 발의 0 (§2.3 ①)
 *  - 사용자 영역(세계관·디자인·비전) 발의 0 (§2.3 ③)
 *  - 중복 검사 = ledger 24h 윈도우 dedupe (같은 ProposalKind+근거 issue 중복 X)
 *  - 임계 미만 = silent skip (logged via no-news-is-bad-news = 별 cycle 1줄)
 */

import fs from 'fs';
import path from 'path';
import {
  diagnoseHealth,
  gatherHealthSignals,
  type HealthIssue,
  type HealthSignals,
} from './system-health';

/** 발의 종류 — 4축 매핑 (TASK-KAR-018-INIT § end-state). */
export type ProposalKind =
  | 'new-project' // 신프로젝트 — 미커버 도메인 신호
  | 'refactor' // 전체 리팩터 — rule-violation 누적 / 코드 entropy
  | 'new-core' // 새 역할 코어 — 반복 실패 trace + 결핍 직무
  | 'consensus'; // 합의 표면화 — scout 발화 빈도·합의도 (deliberation 슬롯 트리거)

export interface ProposalCandidate {
  kind: ProposalKind;
  /** 근거 issue code(s) — diagnoseHealth 산출 재사용. */
  rootCodes: string[];
  /** 0~1 정규화 점수. ≥ threshold 시 ledger 진입. */
  score: number;
  /** 헤드라인 1줄 (#team-bus 「📜 발의: …」 본문). */
  headline: string;
  /** 의도 메모 (LLM 무관 결정적 — 어떤 issue 가 어떤 산출을 trigger 했는지). */
  rationale: string;
}

export interface ProposalLedgerEntry {
  ts: string;
  session_id?: string;
  type: 'proposal' | 'abort' | 'dedupe';
  kind: ProposalKind;
  score: number;
  rootCodes: string[];
  headline: string;
  rationale: string;
  /** active 코어로 전이 전 = 'draft' (현 단계 전부). */
  status: 'draft';
}

export interface InitiatorThresholds {
  /** ledger 진입 최소 점수. default 0.5. */
  proposalScore: number;
  /** 같은 kind+rootCodes 중복 dedupe 윈도우(h). default 24. */
  dedupeWindowHrs: number;
}

export const DEFAULT_INITIATOR_THRESHOLDS: InitiatorThresholds = {
  proposalScore: 0.5,
  dedupeWindowHrs: 24,
};

/**
 * HealthSignals + HealthIssue 를 ProposalCandidate 로 매핑 (순수·결정적).
 *
 * 매핑 룰 (담백 — first iteration, 추후 LT-12 측정 baseline 결과로 튜닝):
 *  - `progress-stale` → new-project (팀 전진 0 = 미커버 도메인 신호)
 *  - `worker-fail-{warn,critical}` → new-core (반복 실패 = 결핍 직무)
 *  - `cadence-{slow,stale}` → refactor (시스템 entropy)
 *  - `broken-loop` → refactor (status drift 잔존 = 구조결함)
 *  - 그 외 → consensus (deliberation 슬롯에서 합의 끌어내기)
 *
 * 점수 = severity 기반: critical=0.8 / warn=0.5. 다중 issue 시 max.
 */
export function mapIssuesToProposals(issues: HealthIssue[]): ProposalCandidate[] {
  if (issues.length === 0) return [];

  const byKind = new Map<ProposalKind, ProposalCandidate>();
  for (const i of issues) {
    const kind = issueToKind(i.code);
    const score = i.severity === 'critical' ? 0.8 : 0.5;
    const cur = byKind.get(kind);
    if (cur) {
      cur.rootCodes.push(i.code);
      if (score > cur.score) cur.score = score;
    } else {
      byKind.set(kind, {
        kind,
        rootCodes: [i.code],
        score,
        headline: defaultHeadline(kind, [i.code]),
        rationale: `근거 issue: ${i.code} (${i.severity}) — ${i.detail}`,
      });
    }
  }
  // 다중 issue 헤드라인 재합성
  for (const c of byKind.values()) {
    c.headline = defaultHeadline(c.kind, c.rootCodes);
  }
  return Array.from(byKind.values());
}

function issueToKind(code: string): ProposalKind {
  if (code === 'progress-stale') return 'new-project';
  if (code.startsWith('worker-fail')) return 'new-core';
  if (code.startsWith('cadence-') || code === 'broken-loop') return 'refactor';
  return 'consensus';
}

function defaultHeadline(kind: ProposalKind, codes: string[]): string {
  const join = codes.join(',');
  switch (kind) {
    case 'new-project':
      return `📜 발의 (신프로젝트): 팀 전진 0 신호 [${join}] — 미커버 도메인 후보 합의 필요`;
    case 'refactor':
      return `📜 발의 (전체 리팩터): 시스템 entropy 누적 [${join}] — 구조 정합 회복 후보`;
    case 'new-core':
      return `📜 발의 (새 역할 코어): 반복 실패 패턴 [${join}] — 결핍 직무 spec 후보`;
    case 'consensus':
      return `📜 발의 (합의): 다중 신호 [${join}] — deliberation 슬롯에서 방향 합의 필요`;
  }
}

// ── ledger ──────────────────────────────────────────────────────────────────

function ledgerPath(memoRoot: string): string {
  return path.join(memoRoot, '.claude', 'initiator-ledger.jsonl');
}

export function readLedger(memoRoot: string): ProposalLedgerEntry[] {
  if (!memoRoot) return [];
  const p = ledgerPath(memoRoot);
  if (!fs.existsSync(p)) return [];
  try {
    return fs
      .readFileSync(p, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as ProposalLedgerEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is ProposalLedgerEntry => !!e);
  } catch {
    return [];
  }
}

function appendLedger(memoRoot: string, entry: ProposalLedgerEntry): void {
  if (!memoRoot) return;
  const p = ledgerPath(memoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * 24h 윈도우 dedupe: 같은 kind + 같은 rootCodes set 이면 중복 = skip.
 * (rationale 본문 차이는 무시 — 동일 신호의 noise 재발 차단.)
 */
function isDuplicate(
  ledger: ProposalLedgerEntry[],
  candidate: ProposalCandidate,
  nowMs: number,
  windowHrs: number,
): boolean {
  const cutoff = nowMs - windowHrs * 3_600_000;
  const keyA = [...candidate.rootCodes].sort().join('|');
  return ledger.some((e) => {
    if (e.type !== 'proposal') return false;
    if (e.kind !== candidate.kind) return false;
    const ts = Date.parse(e.ts || '');
    if (!isFinite(ts) || ts < cutoff) return false;
    const keyB = [...e.rootCodes].sort().join('|');
    return keyA === keyB;
  });
}

// ── 진입점 ──────────────────────────────────────────────────────────────────

export interface InitiatorTickResult {
  /** 1줄 결과 라벨 (cadence trace 용 — "no-news-is-bad-news" 정합). */
  label: string;
  candidates: ProposalCandidate[];
  appended: number;
  deduped: number;
}

/**
 * #team-bus 헤드라인 포맷 — 신규 proposal 만 모아 1메시지. evolution-ticker
 * (🧬/🩸/📈) 와 의미 다르므로 자체 marker (📜) 사용 (평행 정의 X — 같은
 * notify seam 재사용, 토픽만 분리).
 */
export function formatProposalTicker(
  accepted: ProposalCandidate[],
  deduped: number,
): string {
  if (accepted.length === 0) {
    return deduped > 0
      ? `[initiator] ${deduped}건 dedupe (24h 윈도우, 재발의 X)`
      : '';
  }
  const lines = accepted.map((c) => `- ${c.headline}`);
  const trail =
    deduped > 0 ? `\n_(추가로 ${deduped}건 dedupe)_` : '';
  return [
    `📜 **새 발의 ${accepted.length}건** (initiator — TASK-KAR-018-INIT)`,
    ...lines,
    trail,
    '_ledger: `.claude/initiator-ledger.jsonl` · status=draft (실 시드 write 는 active 전이 후)_',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * INIT 1틱: 신호 수집 → 매핑 → dedupe → ledger append.
 *
 * 실 TASK seed write / Discord 발화 = 별도 사이클 (active 전이 후). 본 함수는
 * *제안 표면화* 까지 — ledger 가 사용자 가시 윈도우 (cadence trace 라벨 + 별도
 * commit ledger jsonl).
 *
 * best-effort: 어떤 단계 실패도 cadence-tick 비차단 (try/catch caller 측에서).
 */
export function runInitiatorOnce(
  env: NodeJS.ProcessEnv,
  opts: {
    nowMs?: number;
    thresholds?: Partial<InitiatorThresholds>;
    /** 테스트 hook — 측정 단계 stub. default = gatherHealthSignals. */
    gatherSignals?: (env: NodeJS.ProcessEnv, nowMs: number) => HealthSignals;
    sessionId?: string;
    /**
     * #team-bus 발화 hook (evolution-observatory 와 같은 seam). 신규 proposal
     * appended > 0 일 때만 호출. dedupe-only 는 silent (사용자 노이즈 차단,
     * 단 cadence trace 라벨은 별도 박힘 = no-news-is-bad-news 정합).
     * default undefined = 발화 X (테스트·draft 코어 stage 안전).
     */
    notify?: (message: string) => void;
  } = {},
): InitiatorTickResult {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) {
    return { label: 'init:no-memo-root', candidates: [], appended: 0, deduped: 0 };
  }

  const thresholds: InitiatorThresholds = {
    ...DEFAULT_INITIATOR_THRESHOLDS,
    ...(opts.thresholds || {}),
  };
  const nowMs = opts.nowMs ?? Date.now();
  const gather = opts.gatherSignals ?? gatherHealthSignals;

  const signals = gather(env, nowMs);
  const issues = diagnoseHealth(signals);
  const all = mapIssuesToProposals(issues);
  const passing = all.filter((c) => c.score >= thresholds.proposalScore);

  if (passing.length === 0) {
    return {
      label: issues.length === 0 ? 'init:no-signal' : 'init:below-threshold',
      candidates: [],
      appended: 0,
      deduped: 0,
    };
  }

  const ledger = readLedger(memoRoot);
  let appended = 0;
  let deduped = 0;
  const accepted: ProposalCandidate[] = [];
  for (const c of passing) {
    if (isDuplicate(ledger, c, nowMs, thresholds.dedupeWindowHrs)) {
      deduped++;
      continue;
    }
    const entry: ProposalLedgerEntry = {
      ts: new Date(nowMs).toISOString(),
      session_id: opts.sessionId,
      type: 'proposal',
      kind: c.kind,
      score: c.score,
      rootCodes: c.rootCodes,
      headline: c.headline,
      rationale: c.rationale,
      status: 'draft',
    };
    appendLedger(memoRoot, entry);
    appended++;
    accepted.push(c);
  }

  const label =
    appended > 0
      ? `init:proposed:${appended}${deduped ? `+deduped:${deduped}` : ''}`
      : `init:all-deduped:${deduped}`;

  if (appended > 0 && opts.notify) {
    try {
      const msg = formatProposalTicker(accepted, deduped);
      if (msg) opts.notify(msg);
    } catch {
      /* notify 실패 = tick 비차단 (ledger 는 이미 박힘) */
    }
  }

  return { label, candidates: accepted, appended, deduped };
}
