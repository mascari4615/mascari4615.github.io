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
  type: 'proposal' | 'abort' | 'dedupe' | 'seeded';
  kind: ProposalKind;
  score: number;
  rootCodes: string[];
  headline: string;
  rationale: string;
  /** active 코어로 전이 전 = 'draft' (현 단계 전부). */
  status: 'draft';
  /** seed writer 가 실 TASK 파일 생성 시 채워짐 (memo/tasks/ 상대 경로). */
  seededTaskFile?: string;
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
  /** 자동 생성된 TASK seed 파일명들 (memo/tasks/ 상대). */
  seededTaskFiles?: string[];
  /** proposals.jsonl 에 append 된 envelope id들 (다음 cadence tick deliberation 입력). */
  deliberationIds?: string[];
}

// ── deliberation handoff (출력 layer #3 — 기존 dialogue 엔진 재사용) ─────────

/**
 * proposals.jsonl envelope 형식 변환 — `readLatestProposal` 호환 (`agent-cadence.ts`
 * `runCoreDialogueOnce` 가 읽는 substrate). 평행 정의 X — 같은 파일·같은 schema.
 *
 * INIT proposal 1건 append → 다음 cadence tick 의 dialogue 슬롯이 *자동* 그 envelope
 * 픽업 + 다중턴 deliberation (LT-3 substrate). 기존 governed-producer 가 만든
 * envelope 와 형식 동일, 단 `payload.body` 에 [INITIATOR-AUTO] 마커 + rootCodes
 * (deliberation 측에서 origin 추적 가능).
 */
export function appendDeliberationEnvelope(
  memoRoot: string,
  candidate: ProposalCandidate,
  seq: number,
  ts: string,
): string | null {
  if (!memoRoot) return null;
  const id = `initiator-${seq}-${candidate.kind}`;
  const domainHint: Record<ProposalKind, string> = {
    'new-project': 'meta',
    refactor: 'meta',
    'new-core': 'meta',
    consensus: 'meta',
  };
  const envelope = {
    id,
    ts,
    envelope: {
      projectId: 'kar-018',
      payload: {
        title: candidate.headline,
        summary: candidate.headline,
        body: [
          '[INITIATOR-AUTO] TASK-KAR-018-INIT substrate 발의.',
          `kind=${candidate.kind} rootCodes=${candidate.rootCodes.join(',')} score=${candidate.score.toFixed(2)}`,
          '',
          candidate.rationale,
        ].join('\n'),
        domain: domainHint[candidate.kind],
        derivation: candidate.rationale,
        kind: candidate.kind,
      },
    },
  };
  const p = path.join(memoRoot, '.claude', 'proposals.jsonl');
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(envelope) + '\n', 'utf-8');
    return id;
  } catch {
    return null;
  }
}

// ── seed writer (출력 layer #2 — 실 TASK 파일 생성) ─────────────────────────

/**
 * slug 생성 — headline 에서 ASCII-safe + 한글 보존 (TASK 파일명 정합).
 * 정본 파일명 = `TASK-KAR-NNN-<slug>.md`. 한글·영숫자·`-` 만 보존, 나머지 `-`.
 */
function slugifyHeadline(headline: string): string {
  return headline
    .replace(/^📜\s*발의\s*\([^)]+\)\s*:\s*/u, '')
    .replace(/[^\p{L}\p{N}\- ]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/**
 * 다음 KAR 시퀀스 = `tasks/` 디렉토리 스캔 → 최대값 + 1. race 가능성 낮음
 * (INIT 1틱 = 30분). 동시 시드 race 면 파일 존재 시 +1 retry (max 5).
 */
function nextKarSequence(memoRoot: string): number {
  const dir = path.join(memoRoot, 'tasks');
  if (!fs.existsSync(dir)) return 1;
  let max = 0;
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^TASK-KAR-(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * proposal kind → TASK frontmatter + 본문. 정본 = `memo/TASK-SCHEMA.md`.
 *
 * 안전 바닥:
 *  - status: seed (worker 픽업 전 사용자 가시 윈도우)
 *  - tags: [initiator-auto, kar-018] — 식별 가능
 *  - parent: TASK-KAR-018 — 계보 명시
 *  - **사용자 발화 인용 = INIT origin 명시** (task-quality-gate 「§ 목표
 *    발화 인용」 통과). 사용자 직접 발화 X → "INIT 자동 발의 (TASK-KAR-018
 *    헌장 §1·§2.3 위임)" 메타-인용.
 */
export function buildTaskSeedBody(
  candidate: ProposalCandidate,
  seq: number,
  ts: string,
): { filename: string; content: string } {
  const slug = slugifyHeadline(candidate.headline);
  const filename = `TASK-KAR-${String(seq).padStart(3, '0')}-${slug || candidate.kind}.md`;
  const titleKind: Record<ProposalKind, string> = {
    'new-project': '신프로젝트',
    refactor: '전체 리팩터',
    'new-core': '새 역할 코어',
    consensus: '합의',
  };
  const fm = [
    '---',
    `id: TASK-KAR-${String(seq).padStart(3, '0')}`,
    'status: seed',
    'priority: normal',
    'path: [karmoddrine, kar-018, init, auto-proposed]',
    'parent: TASK-KAR-018-INIT',
    'tags: [initiator-auto, kar-018, agent-team]',
    'machine: any',
    'scope: S',
    '---',
    '',
  ].join('\n');
  const body = [
    `# TASK-KAR-${String(seq).padStart(3, '0')} — ${titleKind[candidate.kind]} (initiator 자동 발의)`,
    '',
    `> **[INITIATOR-AUTO]** TASK-KAR-018-INIT substrate 발의. status=seed (사용자 가시 윈도우). 14d 무반응 시 worker 픽업 자동 진행 또는 사용자 \`!kill\`/TASK-OK 마킹.`,
    '',
    '## 목표',
    '',
    '> 사용자 발화 (위임 인용, 2026-05-23 TASK-KAR-018-INIT 시드): "우리 에이전트 팀 빠르게 자가발전 하고, 자기들끼리 뭘 만들어볼까 아이디어 내서  새로운 프로젝트들도 만들고,  전체 리펙토링도 하고, 서로 논의해서 새로운 역할의 에이전트로 만드는. 그런 순수 자율 에이전트 팀이 있으면 좋겠어."',
    '',
    `${candidate.headline}`,
    '',
    '## 근거 (initiator 측정 신호)',
    '',
    `- **kind**: \`${candidate.kind}\` (${titleKind[candidate.kind]})`,
    `- **rootCodes**: ${candidate.rootCodes.map((c) => `\`${c}\``).join(', ')}`,
    `- **score**: ${candidate.score.toFixed(2)} (≥ 0.5 임계 통과)`,
    `- **rationale**: ${candidate.rationale}`,
    `- **proposed_at**: ${ts}`,
    '',
    '## 다음 단계 (worker/사용자 진입 시)',
    '',
    candidate.kind === 'new-project'
      ? '- 미커버 도메인 후보 1~3개 추출 (current progressLog 분석)\n- 가장 임팩트 큰 1개 선택 후 정식 TASK 분해'
      : candidate.kind === 'refactor'
        ? '- rootCodes 의 entropy 누적 원인 추적\n- 영향면 분석 + 분해 (1 commit < 1 주제)'
        : candidate.kind === 'new-core'
          ? '- 결핍 직무 추론 (반복 실패 패턴 분석)\n- `agents/<id>/core.md` Draft + §2.8 측정 게이트 진입'
          : '- deliberation 슬롯에서 방향 합의\n- 합의 결과를 별 TASK 시드로 승격',
    '',
    '## 안전 바닥 (§2.8 안전 바닥 상속)',
    '',
    '- 비가역·외부영향 액션 = 별도 사용자 게이트 (§2.3 ①)',
    '- 사용자 영역 (세계관·디자인·비전) = TASK-OK 마킹 후 종결',
    '- worker 픽업 전 사용자가 본 TASK 재정의 가능 (initiator 자동 = 합의 1차안)',
    '',
    '## 정본 cross-cut',
    '',
    '- `memo/tasks/TASK-KAR-018-INIT-팀-드리븐-발의-루프.md` (substrate 정본)',
    '- `memo/.claude/agent-mission.md` §1·§2.3·§2.8',
    '- `.claude/initiator-ledger.jsonl` (이 발의의 ledger entry)',
  ].join('\n');
  return { filename, content: fm + body + '\n' };
}

/**
 * proposal 1건 → 실 TASK seed 파일 작성. ledger 에 `seededTaskFile` 마킹.
 *
 * 재시드 방지 = ledger 의 seededTaskFile 필드. 같은 proposal entry 에 이미
 * seed file 박힌 경우 skip (no-op).
 */
export function seedTaskFile(
  memoRoot: string,
  entry: ProposalLedgerEntry,
  nowMs: number,
): string | null {
  if (!memoRoot) return null;
  if (entry.seededTaskFile) return null;
  if (entry.type !== 'proposal') return null;
  const seq = nextKarSequence(memoRoot);
  const ts = new Date(nowMs).toISOString();
  const { filename, content } = buildTaskSeedBody(
    {
      kind: entry.kind,
      rootCodes: entry.rootCodes,
      score: entry.score,
      headline: entry.headline,
      rationale: entry.rationale,
    },
    seq,
    ts,
  );
  const target = path.join(memoRoot, 'tasks', filename);
  if (fs.existsSync(target)) {
    // race or 동일 seq 충돌 — +1 retry up to 5
    for (let i = 1; i <= 5; i++) {
      const altSeq = seq + i;
      const alt = buildTaskSeedBody(
        {
          kind: entry.kind,
          rootCodes: entry.rootCodes,
          score: entry.score,
          headline: entry.headline,
          rationale: entry.rationale,
        },
        altSeq,
        ts,
      );
      const altPath = path.join(memoRoot, 'tasks', alt.filename);
      if (!fs.existsSync(altPath)) {
        fs.mkdirSync(path.dirname(altPath), { recursive: true });
        fs.writeFileSync(altPath, alt.content, 'utf-8');
        return alt.filename;
      }
    }
    return null; // 5회 retry 실패 = silent skip
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
  return filename;
}

/**
 * #team-bus 헤드라인 포맷 — 신규 proposal 만 모아 1메시지. evolution-ticker
 * (🧬/🩸/📈) 와 의미 다르므로 자체 marker (📜) 사용 (평행 정의 X — 같은
 * notify seam 재사용, 토픽만 분리).
 */
export function formatProposalTicker(
  accepted: ProposalCandidate[],
  deduped: number,
  seededTaskFiles: string[] = [],
): string {
  if (accepted.length === 0) {
    return deduped > 0
      ? `[initiator] ${deduped}건 dedupe (24h 윈도우, 재발의 X)`
      : '';
  }
  const lines = accepted.map((c) => `- ${c.headline}`);
  const trail =
    deduped > 0 ? `\n_(추가로 ${deduped}건 dedupe)_` : '';
  const seededBlock =
    seededTaskFiles.length > 0
      ? `\n**자동 시드된 TASK 파일** (status=seed, 14d 가시 윈도우):\n${seededTaskFiles.map((f) => `- \`memo/tasks/${f}\``).join('\n')}`
      : '\n_(이번 cycle 자동 시드 X — proposal ledger 만 박힘)_';
  return [
    `📜 **새 발의 ${accepted.length}건** (initiator — TASK-KAR-018-INIT)`,
    ...lines,
    trail,
    seededBlock,
    '_ledger: `.claude/initiator-ledger.jsonl` · 사용자 `!kill` 또는 TASK-OK 마킹으로 종결 가능_',
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
    /**
     * 실 TASK seed 파일 자동 생성 (출력 layer #2). default true — `status: seed`
     * + `[INITIATOR-AUTO]` 마커 + 사용자 가시 윈도우(14d) = 안전 바닥 충족.
     * 사용자가 비활성 원하면 env `AGENT_INIT_SEED_TASKS=0` 또는 opts.seedTasks=false.
     */
    seedTasks?: boolean;
    /**
     * deliberation handoff (출력 layer #3) — proposals.jsonl 에 envelope append.
     * default true. 다음 cadence tick 의 `runCoreDialogueOnce` 가 그 envelope 픽업
     * → 다중턴 deliberation 자동 발동. env `AGENT_INIT_DELIBERATE=0` 비활성.
     */
    deliberate?: boolean;
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

  // 실 TASK seed 파일 생성 (출력 layer #2) — 매 cycle 1건만 (가시성 + race 회피).
  const seedEnabled =
    opts.seedTasks !== false && env.AGENT_INIT_SEED_TASKS !== '0';
  const seededFiles: string[] = [];
  if (seedEnabled && accepted.length > 0) {
    const first = accepted[0]; // 매 cycle 1건만 — 다음 cycle 에서 추가 (dedupe 24h 윈도우 자연 조절)
    try {
      const entry: ProposalLedgerEntry = {
        ts: new Date(nowMs).toISOString(),
        session_id: opts.sessionId,
        type: 'proposal',
        kind: first.kind,
        score: first.score,
        rootCodes: first.rootCodes,
        headline: first.headline,
        rationale: first.rationale,
        status: 'draft',
      };
      const file = seedTaskFile(memoRoot, entry, nowMs);
      if (file) {
        seededFiles.push(file);
        // 별도 seeded ledger entry append (append-only 정합)
        appendLedger(memoRoot, {
          ts: new Date(nowMs).toISOString(),
          session_id: opts.sessionId,
          type: 'seeded',
          kind: first.kind,
          score: first.score,
          rootCodes: first.rootCodes,
          headline: first.headline,
          rationale: first.rationale,
          status: 'draft',
          seededTaskFile: file,
        });
      }
    } catch {
      /* seed write 실패 = ledger 만 박힘 (안전) */
    }
  }

  // deliberation handoff (출력 layer #3) — proposals.jsonl envelope append.
  // 매 cycle accepted 후보 *전부* (각각 별 envelope) → 다음 cadence tick 의
  // dialogue 슬롯이 latest 1건씩 픽업 (LT-3 다중턴 substrate 자동 발동).
  // 평행 정의 X — `readLatestProposal` 가 읽는 동일 파일·schema.
  const deliberateEnabled =
    opts.deliberate !== false && env.AGENT_INIT_DELIBERATE !== '0';
  const deliberationIds: string[] = [];
  if (deliberateEnabled && accepted.length > 0) {
    const tsIso = new Date(nowMs).toISOString();
    for (let i = 0; i < accepted.length; i++) {
      try {
        const id = appendDeliberationEnvelope(memoRoot, accepted[i], nowMs + i, tsIso);
        if (id) deliberationIds.push(id);
      } catch {
        /* envelope append 실패 = ledger·seed 는 이미 박힘 (안전) */
      }
    }
  }

  if (appended > 0 && opts.notify) {
    try {
      const msg = formatProposalTicker(accepted, deduped, seededFiles);
      if (msg) opts.notify(msg);
    } catch {
      /* notify 실패 = tick 비차단 (ledger 는 이미 박힘) */
    }
  }

  const seededLabel = seededFiles.length > 0 ? `+seeded:${seededFiles.length}` : '';
  const deliberateLabel =
    deliberationIds.length > 0 ? `+deliberate:${deliberationIds.length}` : '';
  return {
    label: label + seededLabel + deliberateLabel,
    candidates: accepted,
    appended,
    deduped,
    seededTaskFiles: seededFiles,
    deliberationIds,
  };
}
