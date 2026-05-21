/**
 * agent-cadence-worker — 도메인 워커 소비자 (KAR-018-Y).
 * WorkerCore 타입·프롬프트·worktree·voicedWorkerSpeak·runWorkerConsumerOnce.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { getInstallationToken } from './github-app-token';
import {
  getDecisionsForTask,
  formatDecisionsBlock,
} from './agent-decisions';
import {
  resolveDomainRepo,
  workerBranchName,
  workerWorktreeDir,
} from './agent-worker-repo';
import { reserveBudget } from './team-room';
import { appendTrace, defaultNotify, type NotifyFn } from './governance-adapter';
import { spawnTier3, type Tier3Request, type Tier3Result } from './dispatcher';
import {
  listCoreIds,
  loadCoreDef,
  coreLabel,
  appendCoreMemory,
  coreMemPath,
  type CoreDef,
} from '../services/agent-core';
import { commitAndPushMemoFile } from '../services/memo-push';
import {
  spawnTier3Detached,
  readClaims,
  writeClaims,
  activeInFlightTaskIds,
  reapInFlight,
  type InFlightMarker,
  type Tier3DoneResult,
  type ReaperSummary,
} from '../services/tier3-detached';
import {
  isKilled,
  getCoreSpeak,
  generateAgentText,
  buildTier3Deps,
  runMemoScript,
  type CoreSpeakFn,
} from './agent-cadence-state';
import { loadSkinPersona } from './agent-cadence-skin';
import { fetchTeamBusContext as defaultFetchTeamBusContext } from './team-bus-fetcher';

// ── WorkerCore ───────────────────────────────────────────────
export interface WorkerCore {
  coreId: string;
  /** 담당 TASK prefix (frontmatter domain, 대문자). */
  domain: string;
  /** 머신 어피니티 (frontmatter machine, 미지정 any). */
  machine: string;
  /** #team-bus 표시 (emoji displayName). */
  label: string;
  /** core.md skills: [] 에 누적된 검증 자기 스킬. */
  skills: string[];
}

/**
 * 워커 코어 선별 (순수 — 테스트가능). 워커 = frontmatter `kind: worker`
 * + `status: active` + `domain:` 존재.
 */
export function selectWorkerCores(defs: (CoreDef | null)[]): WorkerCore[] {
  const out: WorkerCore[] = [];
  for (const d of defs) {
    if (!d) continue;
    const fm = d.frontmatter || {};
    if ((fm.kind || '').trim() !== 'worker') continue;
    if ((d.status || '').trim() !== 'active') continue;
    const domain = (fm.domain || '').trim().toUpperCase();
    if (!domain) continue;
    out.push({
      coreId: d.id,
      domain,
      machine: (fm.machine || 'any').trim() || 'any',
      label: coreLabel(d),
      skills: d.skills,
    });
  }
  return out;
}

/** decision-needed escalate 마커. */
export const ESCALATE_MARKER = 'NEEDS-USER-DECISION';

/**
 * 결정 필요 task 판별 (순수 — 테스트 결정성). OR 조건:
 *  (a) 스펙 frontmatter `type:` 가 design/decision
 *  (b) agentic 리포트에 명시 escalate 마커
 */
export function detectDecisionNeeded(
  specText: string | undefined,
  reportText: string | undefined,
): boolean {
  if (reportText && reportText.includes(ESCALATE_MARKER)) return true;
  if (!specText) return false;
  const fmMatch = specText.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;
  const typeMatch = fmMatch[1].match(/^\s*type\s*:\s*([A-Za-z_-]+)/m);
  if (!typeMatch) return false;
  const t = typeMatch[1].trim().toLowerCase();
  return t === 'design' || t === 'decision';
}

/**
 * 워커 tier3 지시 프롬프트 (순수). autopilot 안전 룰셋.
 *
 * channelContext (KAR-018-LT-W1) = #team-bus 최근 발언. 빈 문자열·undefined
 * 면 블록 미포함(5입력 호환). 워커가 자기·동료 직전 발언을 read 하여 같은
 * 사유 반복 announce 를 cite/dedupe 하라는 chat=state substrate 진입.
 *
 * skills (KAR-018-LT-15) = core.md frontmatter 에 누적된 검증 자기 스킬 id.
 * 빈 배열·undefined = 블록 미포함.
 */
export function buildWorkerPrompt(
  task: { id: string; file: string },
  missionText: string,
  specText?: string,
  worktreeBranch?: string,
  decisionsText?: string,
  channelContext?: string,
  skills?: string[],
): string {
  const skillBlock =
    skills && skills.length > 0
      ? [
          '[검증된 자기 스킬 — 행동평가를 통과해 core.md skills 에 누적된 작업 방식]',
          ...skills.map((s) => `- ${s}`),
          '',
        ]
      : [];
  const specBlock = specText
    ? [
        `[TASK 스펙 — 아래 *내용* 이 정본. memo 는 cwd 밖이라 경로로 못 읽음]`,
        '<<<SPEC',
        specText.trim().slice(0, 12000),
        'SPEC',
        '',
      ]
    : [`[스펙 파일] ${task.file} (내용 임베드 실패 — cwd 내 단서로 진단)`, ''];
  const channelBlock = channelContext && channelContext.trim()
    ? [
        `[팀 최근 채팅 — 너·동료들의 직전 발언. 같은 사유·결론 반복 X.`,
        `이미 누군가 같은 (TASK·에러) announce 했으면 그 사실을 cite 하고`,
        `다른 가설/접근으로 진입하거나 멈춰라. 새 정보·관점이면 응답·반응.]`,
        '<<<CHANNEL',
        channelContext.trim().slice(0, 3000),
        'CHANNEL',
        '',
      ]
    : [];
  const step2 = worktreeBranch
    ? [
        `2. 너는 *이미* 격리 worktree(현재 cwd) 안, 브랜치 \`${worktreeBranch}\``,
        '   에 있다. git worktree 새로 만들지 마라. main/master checkout·',
        '   HEAD swap 절대 X. 최신 정본 필요시 `git fetch origin` 후 참고.',
      ]
    : [
        '2. 자기 worktree 에서만 작업 — main worktree(memo/WitchMendokusai/',
        '   Mascari4615.github.io) HEAD swap 절대 X. 없으면 new-worktree.ps1.',
      ];
  const step4 = worktreeBranch
    ? `4. \`${worktreeBranch}\` 에 commit → \`gh auth setup-git\` (GH_TOKEN 환경변수로 git 자격 배선, 1회) → \`git push -u origin ${worktreeBranch}\` → \`gh pr create --draft --fill\` **까지만**. merge / master·main 직접 push / force-push **절대 금지**. push·gh 인증 실패 시 그 에러 원문을 6번 요약에 명시(은폐 X).`
    : '4. feature 브랜치 commit + push + **Draft PR 까지만**. merge / master·main 직접 push / force-push **절대 금지**.';
  return [
    `너는 karmoddrine 에이전트 팀의 도메인 소비자 워커다. 아래 TASK 1건을`,
    `autopilot 안전 룰셋으로 *끝까지* 수행한다 (bounded — 이 1건 후 종료).`,
    '',
    `[대상 TASK] ${task.id} (원 스펙경로 ${task.file} — 참고용, cwd 밖)`,
    `[작업 위치] 현재 cwd = 도메인 *코드 repo* 의 격리 worktree. memo`,
    `(룰·TASK 정본)는 여기 없음. 스펙은 아래 [TASK 스펙] 본문이 정본.`,
    '',
    ...(decisionsText ? [decisionsText, ''] : []),
    ...channelBlock,
    ...skillBlock,
    ...specBlock,
    '[절차]',
    `1. 위 [TASK 스펙] 본문 + cwd 내 코드·정본 정독. 진단 우선(가설 박기 X).`,
    ...step2,
    '3. 코드 변경 + 가능한 검증(build/test/typecheck). 검증 불가 영역은',
    '   PR Test plan 에 명시.',
    step4,
    '5. 다른 세션 영역 침범 금지. TASK 진행/결정은 *PR 설명* 에 기재',
    '   (memo TASK 문서는 cwd 밖 — 편집 시도 X, 봇이 별도 반영).',
    '6. 끝나면 무엇을 했는지 *한 문단* 으로 요약(= #team-bus 보고용).',
    '   실패·미완·인증오류면 그것도 솔직히(가짜 성공 보고 X).',
    '',
    '[미션 정렬 anchor — 이 작업이 아래에 정렬되는지 자가검사]',
    missionText.trim(),
    '',
    '확신 안 서거나 사람 컨펌 필요한 비가역 결정이면 멈추고 그 사유를',
    `요약에 명시(추측 진행 X). 이 경우 요약 첫 줄에 정확히 \`${ESCALATE_MARKER}\``,
    '토큰을 쓰고 이어서 사용자가 골라야 할 *선택지*를 명시하라(봇이 이를',
    '#team-bus 의 이 TASK 스레드로 escalate → 사용자가 디코에서 결정).',
  ].join('\n');
}

// ── 워커 목록 기본 로더 ──────────────────────────────────────
export function defaultListWorkers(memoRoot: string): WorkerCore[] {
  return selectWorkerCores(
    listCoreIds(memoRoot).map((id) => loadCoreDef(memoRoot, id)),
  );
}

/**
 * 봇 startup 시 자기(=이 노트북 단일 봇 인스턴스) 가 잡고 죽었던 worker claim 을 reap.
 * 사용자 진단 (2026-05-21): claim 파일 TTL=6h 라 봇 재시작 후에도 stale claim
 * 이 후보 제외 → 같은 task 재시도 시 'claim-lost'. deterministic 워크트리는
 * 보존(reuse) 이라 진행은 누적되나, claim 이 발목.
 *
 * 정합 안전: by 가 worker coreId 인 claim 만 reap. 다른 source (cloud routine
 * 등 다른 코어명) 의 claim 은 보존 — 다세션·다머신 미래 확장 충돌 회피.
 * 단일 노트북 prod 가정 = 이 봇이 모든 worker coreId 의 유일 owner.
 *
 * 반환 = reap 된 id 목록 (#team-bus 알림·로그용).
 */
export function reapMyWorkerClaims(memoRoot: string): string[] {
  const base = path.join(memoRoot, '.claude', 'task-claims.json');
  let raw: Record<string, { by?: string; at?: number }> = {};
  try {
    if (!fs.existsSync(base)) return [];
    const text = fs.readFileSync(base, 'utf-8');
    raw = JSON.parse(text);
  } catch { return []; }
  if (!raw || typeof raw !== 'object') return [];

  const myCoreIds = new Set(defaultListWorkers(memoRoot).map((w) => w.coreId));
  if (myCoreIds.size === 0) return [];

  const reaped: string[] = [];
  const next: typeof raw = {};
  for (const [id, entry] of Object.entries(raw)) {
    const by = (entry && entry.by) || '';
    if (myCoreIds.has(by)) {
      reaped.push(id);
    } else {
      next[id] = entry;
    }
  }
  if (reaped.length === 0) return [];

  try {
    const tmp = `${base}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(tmp, base);
  } catch { /* best-effort — 다음 startup 재시도 */ }
  return reaped;
}

// ── worktree 헬퍼 ────────────────────────────────────────────
type WorktreeSetup =
  | { cwd: string; repoRoot: string; wtDir: string; branch: string }
  | { error: string };

export type { WorktreeSetup };

function setupWorkerWorktree(
  memoRoot: string,
  coreId: string,
  taskId: string,
): WorktreeSetup {
  const umbrella = path.dirname(memoRoot);
  const repo = resolveDomainRepo(coreId, umbrella);
  if (!repo) return { error: `domain-unresolved(core=${coreId})` };
  if (!fs.existsSync(repo.repoRoot))
    return { error: `repo-missing(${repo.repoRoot})` };
  const branch = workerBranchName(taskId);
  const wtDir = workerWorktreeDir(umbrella, coreId, taskId);

  try {
    try {
      execSync(
        `git config --global --add safe.directory "${repo.repoRoot}"`,
        { timeout: 15_000, stdio: 'ignore' },
      );
    } catch { /* best-effort */ }

    // KAR-018 (2026-05-21 사용자 진단): 매 호출마다 새 브랜치 만들지 X.
    // 같은 TASK = 같은 브랜치 = 진행 누적. 재진입 4가지 케이스:
    //
    //  1. 워크트리 디렉토리 이미 존재  → 그대로 reuse (claude CLI 가 state read)
    //  2. 로컬에 브랜치만 존재         → worktree add <dir> <branch> (no -b)
    //  3. origin 에만 브랜치 존재      → fetch + worktree add 로 트래킹
    //  4. 둘 다 없음                  → worktree add -b <branch> HEAD (기존 동작)

    // 1. 워크트리 디렉토리 재사용
    if (fs.existsSync(wtDir)) {
      return { cwd: wtDir, repoRoot: repo.repoRoot, wtDir, branch };
    }

    const branchExistsLocal = (() => {
      try {
        execSync(
          `git -C "${repo.repoRoot}" show-ref --verify --quiet "refs/heads/${branch}"`,
          { timeout: 15_000, stdio: 'ignore' },
        );
        return true;
      } catch { return false; }
    })();

    const branchExistsOrigin = (() => {
      try {
        const out = execSync(
          `git -C "${repo.repoRoot}" ls-remote --heads origin "${branch}"`,
          { timeout: 30_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
        );
        return out.trim().length > 0;
      } catch { return false; }
    })();

    if (branchExistsLocal) {
      // 2. 로컬 브랜치 → worktree add (no -b)
      execSync(
        `git -C "${repo.repoRoot}" worktree add "${wtDir}" "${branch}"`,
        { timeout: 60_000, stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } else if (branchExistsOrigin) {
      // 3. origin 브랜치 → fetch + worktree add (트래킹)
      try {
        execSync(
          `git -C "${repo.repoRoot}" fetch origin "${branch}:${branch}"`,
          { timeout: 60_000, stdio: ['ignore', 'ignore', 'pipe'] },
        );
      } catch { /* best-effort - 다음 step 에서 다시 시도 */ }
      execSync(
        `git -C "${repo.repoRoot}" worktree add "${wtDir}" "${branch}"`,
        { timeout: 60_000, stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } else {
      // 4. 신규 브랜치 (기존 동작)
      execSync(
        `git -C "${repo.repoRoot}" worktree add -b "${branch}" "${wtDir}" HEAD`,
        { timeout: 60_000, stdio: ['ignore', 'ignore', 'pipe'] },
      );
    }
    return { cwd: wtDir, repoRoot: repo.repoRoot, wtDir, branch };
  } catch (e: unknown) {
    const x = e as { stderr?: Buffer; message?: string };
    const raw = (x.stderr?.toString() || x.message || String(e)).trim();
    return { error: `worktree-add: ${raw.replace(/\s+/g, ' ').slice(0, 280)}` };
  }
}

function branchPushedToOrigin(repoRoot: string, branch: string): boolean {
  try {
    const out = execSync(
      `git -C "${repoRoot}" ls-remote --heads origin "${branch}"`,
      { timeout: 30_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function cleanupWorkerWorktree(repoRoot: string, wtDir: string): void {
  try {
    execSync(`git -C "${repoRoot}" worktree remove --force "${wtDir}"`, {
      timeout: 30_000, stdio: 'ignore',
    });
  } catch { /* leak 방지 best-effort */ }
  try {
    execSync(`git -C "${repoRoot}" worktree prune`, {
      timeout: 15_000, stdio: 'ignore',
    });
  } catch { /* noop */ }
}

// ── WorkerConsumerDeps ───────────────────────────────────────
export interface WorkerConsumerDeps {
  listWorkers?: (memoRoot: string) => WorkerCore[];
  scan?: (domain: string, machine: string, repo?: string) => { id: string; file: string }[];
  claim?: (id: string, by: string) => boolean;
  release?: (id: string, by: string) => void;
  spawn?: (req: Tier3Request) => Promise<Tier3Result>;
  branchPushed?: (repoRoot: string, branch: string) => boolean;
  setupWorktree?: (memoRoot: string, coreId: string, taskId: string) => WorktreeSetup;
  notify?: NotifyFn;
  speak?: CoreSpeakFn;
  voice?: (prompt: string) => Promise<string>;
  /**
   * #team-bus 최근 N 발언 fetch (KAR-018-LT-W1). 미주입 = chat=state 비활성
   * (현행 5입력 호환). 실패 시 undefined 반환(silent X — 호출 측이 fallback).
   * Phase 2 (LT-W1-WIRE) 가 main.ts startup 에서 wire.
   */
  fetchTeamBusContext?: (limit: number) => Promise<string | undefined>;
  missionText?: string;
}

// ── voicedWorkerSpeak ────────────────────────────────────────
const lastWorkerStatus = new Map<string, string>();
/** 테스트 전용 — 워커 상태 dedupe 리셋. */
export function resetWorkerStatus(): void {
  lastWorkerStatus.clear();
  noArtifactCooldown.clear();
  escalateCooldown.clear();
}

export function workerRawLedgerPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'agent-worker-raw.jsonl') : '';
}

export function appendWorkerRaw(
  env: NodeJS.ProcessEnv,
  coreId: string,
  status: string,
): void {
  const p = workerRawLedgerPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({ ts: new Date().toISOString(), coreId, status: (status || '').slice(0, 8000) }) + '\n',
      'utf-8',
    );
  } catch { /* best-effort */ }
}

/**
 * TASK-KAR-018-LT-W2-A: cli exit-1 진단 게이트. error 상태(`res.status==='error'`)
 * 일 때 untruncated stderr/stdout 을 별 `kind:'diag'` entry 로 적재 → 다음
 * 세션이 jsonl grep 으로 진짜 원인(인증·quota·tool 거부 등) 진단. chat 발화
 * 는 cap 유지(1200/600), 본 함수만 full(40k cap). 진단 데이터 부재(둘 다
 * undefined·빈) = entry 생략(노이즈 X). bounded cap = disk 폭주 방지.
 */
export function appendWorkerRawDiag(
  env: NodeJS.ProcessEnv,
  coreId: string,
  taskId: string,
  errMsg: string,
  stderrFull?: string,
  stdoutFull?: string,
  exitCode?: number | null,
): void {
  const p = workerRawLedgerPath(env);
  if (!p) return;
  const hasStderr = (stderrFull ?? '').length > 0;
  const hasStdout = (stdoutFull ?? '').length > 0;
  if (!hasStderr && !hasStdout) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({
        ts: new Date().toISOString(),
        coreId,
        taskId,
        kind: 'diag',
        exitCode: exitCode ?? null,
        errMsg: (errMsg || '').slice(0, 2000),
        stderrFull: (stderrFull || '').slice(0, 40000),
        stdoutFull: (stdoutFull || '').slice(0, 40000),
      }) + '\n',
      'utf-8',
    );
  } catch { /* best-effort */ }
}

function rememberWorkerOutcome(
  memoRoot: string,
  coreId: string,
  taskId: string,
  kind: 'fix' | 'fail' | 'decision',
  summary: string,
): void {
  appendCoreMemory(memoRoot, coreId, {
    session: 'worker',
    type: kind,
    topic: `worker:${taskId}`,
    summary,
  });
  // KAR-018-PUSH-CLOSURE Phase 2/4 — core mem 파일을 memo origin 으로 push.
  // fire-and-forget · best-effort · race 시 skip (다음 worker outcome 또는 tick
  // 에서 재시도, append-only 라 변경 lost 0). 같은 코어 동시 작업은 dispatcher
  // busy 락 (per-agent 동시1) 가 보호 → 같은 mem 파일 동시 push 0.
  const memPath = coreMemPath(memoRoot, coreId);
  if (memPath) {
    void commitAndPushMemoFile(
      process.env,
      memPath,
      `chore(KAR-018-worker): ${coreId} ${kind} ${taskId.slice(0, 40)}`,
    ).catch(() => {
      /* silent 비차단 — push 결과 trace 별도 없음. 다음 cadence stats digest
       * 가 ledger 자체를 push 하므로 outcome 가시화는 그쪽이 cover. */
    });
  }
}

export async function voicedWorkerSpeak(
  coreId: string,
  status: string,
  speak: CoreSpeakFn,
  voice: (prompt: string) => Promise<string>,
  env: NodeJS.ProcessEnv = process.env,
  skinHint?: string | null,
): Promise<void> {
  if (lastWorkerStatus.get(coreId) === status) return;
  lastWorkerStatus.set(coreId, status);
  appendWorkerRaw(env, coreId, status);
  let line = status;
  try {
    const skinBlock = skinHint ? `\n[너의 캐릭터] 이름·말투: ${skinHint}` : '';
    const prompt = [
      `너는 karmoddrine 에이전트 팀의 도메인 워커다. 아래 [작업상태]를`,
      `*너의 캐릭터 목소리*로 팀(#team-bus)에 1~2문장 짧게 보고하라.`,
      `절대 규칙: [작업상태]에 *명시된 것만* 말한다. 거기 없는 행동·`,
      `결과·약속을 추가·추정·과장 X (예: "PR 만들었다/완료했다/검토`,
      `해달라" 등은 [작업상태]에 그 단어가 있을 때만). TASK id·상태·`,
      `사유·브랜치 = 사실 그대로. 이모지/말머리 과용 X. 동료 말투.`,
      skinBlock,
      ``,
      `[작업상태]`,
      status,
    ].join('\n');
    const v = (await voice(prompt)).trim();
    if (v) line = v.slice(0, 1900);
  } catch { /* voice 실패 = raw status 그대로 */ }
  try {
    await speak(coreId, line);
  } catch { /* speak 실패가 워커 막지 X */ }
}

// ── no-artifact / escalate cooldown ─────────────────────────
// KAR-018-LT-W2: 같은 (task, errHash) N회 반복 시 harder cooldown 사다리.
// 같은 사유로 무한 재pick → 12시간 24회 announce 의 근본 fix.
const NOARTIFACT_COOLDOWN_MS = 30 * 60_000;       // 기본 30분 (1-3회)
const NOARTIFACT_COOLDOWN_HARD_MS = 6 * 3600_000; // 4-9회
const NOARTIFACT_COOLDOWN_PEAK_MS = 24 * 3600_000;// 10+회 (24h)

interface NoArtifactState {
  ts: number;
  /** errHash — 빈 문자열 = 성공-no-artifact(push 없음). 같은 hash N회 = 사다리. */
  hash: string;
  /** 같은 hash 연속 반복 횟수. 다른 hash 면 1로 reset. */
  count: number;
}
const noArtifactCooldown = new Map<string, NoArtifactState>();

function cooldownMsForCount(count: number): number {
  if (count <= 3) return NOARTIFACT_COOLDOWN_MS;
  if (count <= 9) return NOARTIFACT_COOLDOWN_HARD_MS;
  return NOARTIFACT_COOLDOWN_PEAK_MS;
}

function inNoArtifactCooldown(taskId: string, now: number): boolean {
  const s = noArtifactCooldown.get(taskId);
  return s !== undefined && now - s.ts < cooldownMsForCount(s.count);
}

/**
 * cooldown 등록. errHash 미전달(성공 케이스) = count 1 reset(기존 동작).
 * errHash 전달 + 같은 hash = count++, 다른 hash = count 1 새로 시작.
 */
function markNoArtifact(taskId: string, now: number, errHash?: string): void {
  if (!errHash) {
    noArtifactCooldown.set(taskId, { ts: now, hash: '', count: 1 });
    return;
  }
  const prev = noArtifactCooldown.get(taskId);
  if (prev && prev.hash === errHash) {
    noArtifactCooldown.set(taskId, { ts: now, hash: errHash, count: prev.count + 1 });
  } else {
    noArtifactCooldown.set(taskId, { ts: now, hash: errHash, count: 1 });
  }
}

/**
 * 같은 (task, error) 재시도 정도 (테스트·디버그용). 0 = 미등록 또는 성공 cooldown.
 */
export function getNoArtifactRepeatCount(taskId: string): number {
  const s = noArtifactCooldown.get(taskId);
  return s && s.hash ? s.count : 0;
}

/**
 * errMsg 정규화 후 SHA8 — timestamp/hex/large-num 변동 흡수해서 같은 사유
 * 반복을 stable hash 로 묶음. cli-claude 의 "Claude CLI 종료 코드 N: <stderr>"
 * 가 stderr 일부에 timestamp 포함해도 hash 안정.
 */
export function computeErrHash(errMsg: string): string {
  const norm = errMsg
    .replace(/\d{4}-\d{2}-\d{2}T?[\d:.]+Z?/g, 'TS')
    .replace(/\d{2}:\d{2}:\d{2}(\.\d+)?/g, 'TIME')
    .replace(/\b[a-f0-9]{8,40}\b/gi, 'HEX')
    .replace(/\b\d{6,}\b/g, 'NUM')
    .slice(0, 500);
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 12);
}

const ESCALATE_DEDUPE_MS = 6 * 3600_000;
const escalateCooldown = new Map<string, number>();
function inEscalateCooldown(taskId: string, now: number): boolean {
  const t = escalateCooldown.get(taskId);
  return t !== undefined && now - t < ESCALATE_DEDUPE_MS;
}
function markEscalated(taskId: string, now: number): void {
  escalateCooldown.set(taskId, now);
}

// ── lastWorkerCsv (대시보드용 캐시) ─────────────────────────
let lastWorkerCsv = '';
/** KAR-077 — 최근 워커 결과 CSV (refreshDashboard 입력). */
export function getLastWorkerCsv(): string { return lastWorkerCsv; }

// ── runWorkerConsumerOnce ────────────────────────────────────
/**
 * 한 소비자 tick — 활성 워커마다: 자기 도메인 큐 스캔 → claim →
 * tier3 실행 → done=#team-bus 보고 / 실패=점유 해제·재대기.
 */
export async function runWorkerConsumerOnce(
  env: NodeJS.ProcessEnv,
  deps: WorkerConsumerDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';

  const listWorkers = deps.listWorkers ?? defaultListWorkers;
  const workers = listWorkers(memoRoot);
  if (workers.length === 0) return 'no-workers';

  const thisMachine = env.KAR_MACHINE?.trim() || 'any';
  const notify = deps.notify ?? defaultNotify(env);
  const speak: CoreSpeakFn =
    deps.speak ??
    getCoreSpeak() ??
    (async (_cid, t) => { notify(t); return true; });
  const voice =
    deps.voice ??
    ((p: string) => generateAgentText(env, p, 20_000).catch(() => ''));
  const missionText = deps.missionText ?? (() => {
    try {
      return fs.readFileSync(path.join(memoRoot, '.claude', 'agent-mission.md'), 'utf-8').trim();
    } catch { return ''; }
  })();
  const t3deps = buildTier3Deps(env);

  const scan =
    deps.scan ??
    ((domain: string, machine: string, repo?: string) => {
      const a = ['--json', '--domain', domain, '--machine', machine];
      if (repo) a.push('--repo', repo);
      const r = runMemoScript(memoRoot, 'task-queue.mjs', a);
      try { return JSON.parse(r.out).candidates ?? []; } catch { return []; }
    });
  const claim =
    deps.claim ??
    ((id: string, by: string) =>
      runMemoScript(memoRoot, 'task-claim.mjs', ['--claim', id, '--by', by]).code === 0);
  const release =
    deps.release ??
    ((id: string, by: string) => {
      runMemoScript(memoRoot, 'task-claim.mjs', ['--release', id, '--by', by]);
    });
  const spawn =
    deps.spawn ?? ((req: Tier3Request) => spawnTier3(req, t3deps));
  const branchPushed = deps.branchPushed ?? branchPushedToOrigin;

  const results: string[] = [];
  const processWorker = async (w: WorkerCore): Promise<void> => {
    if (isKilled()) return;
    const wRepo = resolveDomainRepo(w.coreId, path.dirname(memoRoot))?.repoDir;
    const rawCands = scan(
      w.domain,
      w.machine === 'any' ? thisMachine : w.machine,
      wRepo,
    );
    const tickNow = Date.now();
    const cands = rawCands.filter(
      (c) => !inNoArtifactCooldown(c.id, tickNow) && !inEscalateCooldown(c.id, tickNow),
    );
    // KAR-094 후속: detached in-flight 인 task 는 이중 claim 방지로 제외.
    const inFlightIds = activeInFlightTaskIds(memoRoot);
    const filtered = cands.filter((c) => !inFlightIds.has(c.id));
    if (rawCands.length === 0) { results.push(`${w.coreId}:idle`); return; }
    if (cands.length === 0) { results.push(`${w.coreId}:cooldown-all`); return; }
    if (filtered.length === 0) { results.push(`${w.coreId}:in-flight-all`); return; }

    let chosen: { id: string; file: string } | null = null;
    for (const c of filtered.slice(0, 3)) {
      if (claim(c.id, w.coreId)) { chosen = c; break; }
    }
    if (!chosen) { results.push(`${w.coreId}:claim-lost`); return; }

    const wtRes = (deps.setupWorktree ?? setupWorkerWorktree)(memoRoot, w.coreId, chosen.id);
    const wt = 'error' in wtRes ? null : wtRes;
    const wtErr = 'error' in wtRes ? wtRes.error : null;

    // 착수 알림 — 사용자 가시성 (이전엔 silent → 완료까지 #team-bus 무발화).
    // voicedWorkerSpeak 가 lastWorkerStatus 로 dedupe → 동일 status 중복 X.
    await voicedWorkerSpeak(
      w.coreId,
      `🤖 착수: ${chosen.id}${wt ? ` (worktree=${wt.branch})` : ` (worktree 실패: ${wtErr ?? '?'})`}`,
      speak, voice, env,
      loadSkinPersona(memoRoot, w.coreId),
    );

    let specText: string | undefined;
    try { specText = fs.readFileSync(path.join(memoRoot, chosen.file), 'utf-8'); } catch { specText = undefined; }

    // KAR-018-LT-W1: chat=state inject. deps 미주입 = module-level fallback
    // (LT-W1-WIRE: main.ts startup 이 setTeamBusContextFetcher 로 wire).
    // fetch 실패·wire 안 됨 = undefined → 5입력 호환(블록 미포함).
    const fetchCtx = deps.fetchTeamBusContext ?? defaultFetchTeamBusContext;
    let channelContext: string | undefined;
    try {
      channelContext = await fetchCtx(20);
    } catch (e) {
      // chat=state fetch 실패 = silent X (drift trace 1줄). 워커는 5입력
      // fallback 으로 계속 — 채팅 read 만 누락, TASK 실행 자체는 진행.
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'drift',
        core: w.coreId,
        reason: `team-bus-fetch-fail: ${String(e).replace(/\s+/g, ' ').slice(0, 200)}`,
      });
      channelContext = undefined;
    }

    const req: Tier3Request = {
      core: w.coreId,
      machine: w.machine,
      prompt: buildWorkerPrompt(
        chosen,
        missionText,
        specText,
        wt?.branch,
        formatDecisionsBlock(getDecisionsForTask(memoRoot, chosen.id)) || undefined,
        channelContext,
        w.skills,
      ),
      repoCwd: wt?.cwd,
    };

    if (wt) {
      const wmTok = w.coreId === 'wm-worker' ? env.WM_GITHUB_PAT?.trim() || '' : '';
      const tok =
        wmTok || (await getInstallationToken(env)) || env.GH_TOKEN?.trim() || '';
      if (tok) {
        try {
          const url = execSync(`git -C "${wt.wtDir}" remote get-url origin`, {
            timeout: 15_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
          }).trim();
          const authed = url.replace(
            /^https:\/\/(?:x-access-token:[^@]*@)?github\.com\//,
            `https://x-access-token:${tok}@github.com/`,
          );
          execSync(`git -C "${wt.wtDir}" remote set-url origin "${authed}"`, {
            timeout: 15_000, stdio: 'ignore',
          });
        } catch { /* push 시 claude 가 에러 정직 보고 */ }
        req.childEnv = { ...(req.childEnv ?? {}), GH_TOKEN: tok };
      }
    }

    // KAR-094 후속 (2026-05-22 사용자 진단 "봇 죽으면 워커도 죽음"):
    // WORKER_TIER3_DETACHED=1 면 wrapper 로 detached spawn → 봇 무관 생존.
    // 후처리는 reapWorkerInFlight 가 cadence/startup 에서 done.json 보고 수행.
    // wt 없으면 (비-agentic 폴백) detached 의미 없음 → 기존 attached 만.
    const detachEnabled = env.WORKER_TIER3_DETACHED === '1' && !!wt;
    if (detachEnabled && wt) {
      const cmd = env.CLAUDE_CLI_COMMAND?.trim() || 'claude';
      const cliArgs = ['--print', '--no-session-persistence', '--dangerously-skip-permissions'];
      try {
        const handle = spawnTier3Detached({
          memoRoot,
          taskId: chosen.id,
          coreId: w.coreId,
          branch: wt.branch,
          cwd: wt.cwd,
          cmd,
          args: cliArgs,
          prompt: req.prompt,
          env: req.childEnv,
        });
        // claim 파일에 inFlight 마커 추가 (다음 워커 scan 이 제외, reaper 가 후처리).
        try {
          const claims = readClaims(memoRoot);
          const prev = claims[chosen.id] ?? { by: w.coreId, at: Date.now() };
          claims[chosen.id] = {
            ...prev,
            by: w.coreId,
            at: Date.now(),
            inFlight: handle.marker,
          };
          writeClaims(memoRoot, claims);
        } catch (e) {
          // claim 파일 write 실패해도 wrapper 는 detached 로 살아있음. 다음
          // claim TTL 6h reap 이 백업. 알림에 명시.
          console.warn(`[worker] inFlight marker write fail: ${e instanceof Error ? e.message : String(e)}`);
        }
        appendTrace(env, {
          ts: new Date().toISOString(),
          type: 'budget',
          core: w.coreId,
          reason: `worker ${chosen.id} detached spawn pid=${handle.pid} branch=${wt.branch}`,
        });
        results.push(`${w.coreId}:detached:${chosen.id}:pid=${handle.pid}`);
        // worktree cleanup 은 reaper 가 (claude CLI 가 worktree 안에서 작업 중).
        return;
      } catch (e) {
        // detached spawn 실패 = 즉시 escalate (attached 폴백 X — 의도된 토폴로지 차이).
        const msg = e instanceof Error ? e.message : String(e);
        appendTrace(env, {
          ts: new Date().toISOString(),
          type: 'drift',
          core: w.coreId,
          reason: `worker ${chosen.id} detached spawn 실패: ${msg.slice(0, 200)}`,
        });
        release(chosen.id, w.coreId);
        if (wt) cleanupWorkerWorktree(wt.repoRoot, wt.wtDir);
        results.push(`${w.coreId}:detached-spawn-fail:${chosen.id}`);
        await voicedWorkerSpeak(
          w.coreId,
          `${w.label} ⚠ ${chosen.id} detached spawn 실패: ${msg.slice(0, 200)} — 점유 해제.`,
          speak, voice, env,
          loadSkinPersona(memoRoot, w.coreId),
        );
        return;
      }
    }

    let res: Awaited<ReturnType<typeof spawn>>;
    try {
      res = await spawn(req);
    } finally {
      if (wt) cleanupWorkerWorktree(wt.repoRoot, wt.wtDir);
    }
    if (res.status === 'done') {
      const report = (res.text || '').trim().slice(0, 8000);
      const pushed = wt ? branchPushed(wt.repoRoot, wt.branch) : false;
      let head: string;
      let traceStatus: 'done' | 'escalated' | 'done-no-artifact';
      if (pushed && wt) {
        traceStatus = 'done';
        head = `${w.label} ▶ ${chosen.id} 수행 — 브랜치 \`${wt.branch}\` origin push 확인 (Draft PR 검토 대기). 도메인=${w.domain}`;
        results.push(`${w.coreId}:done:${chosen.id}`);
        rememberWorkerOutcome(
          memoRoot,
          w.coreId,
          chosen.id,
          'fix',
          `Draft PR 준비 완료: branch=${wt.branch}, domain=${w.domain}`,
        );
      } else if (detectDecisionNeeded(specText, res.text)) {
        traceStatus = 'escalated';
        release(chosen.id, w.coreId);
        markEscalated(chosen.id, tickNow);
        head = `${w.label} ⚠ ${chosen.id} = 사용자 결정 필요(type:design/escalate) — 자동 진행 불가. 이 스레드에서 결정해 주세요. 결정은 다음 워커 실행에 자동 반영됨. 도메인=${w.domain}`;
        results.push(`${w.coreId}:escalated:${chosen.id}`);
        rememberWorkerOutcome(
          memoRoot,
          w.coreId,
          chosen.id,
          'decision',
          `사용자 결정 필요로 escalated: domain=${w.domain}`,
        );
      } else {
        traceStatus = 'done-no-artifact';
        release(chosen.id, w.coreId);
        markNoArtifact(chosen.id, tickNow);
        head = `${w.label} ⚠ ${chosen.id} 실행 완료했으나 origin 브랜치 미푸시 = 실산출 0 → 점유 해제. 30분 쿨다운(다른 task 회전, 무한 재pick X). ${wt ? `(브랜치 ${wt.branch} 로컬뿐)` : `worktree 실패: ${wtErr}`}. 도메인=${w.domain}`;
        results.push(`${w.coreId}:done-no-artifact:${chosen.id}`);
        rememberWorkerOutcome(
          memoRoot,
          w.coreId,
          chosen.id,
          'fail',
          `실산출 0(done-no-artifact): ${wt ? `branch=${wt.branch} not pushed` : `worktree=${wtErr}`}`,
        );
      }
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'budget',
        core: w.coreId,
        reason: `worker ${chosen.id} ${traceStatus}${wt ? ` agentic ${wt.branch}` : ` non-agentic(${wtErr})`}${res.error ? ` err=${res.error.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
      });
      await voicedWorkerSpeak(
        w.coreId,
        report ? `${head}\n· 보고: ${report}` : head,
        speak, voice, env,
        loadSkinPersona(memoRoot, w.coreId),
      );
    } else {
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'budget',
        core: w.coreId,
        reason: `worker ${chosen.id} ${res.status}${wt ? ` agentic ${wt.branch}` : ` non-agentic(${wtErr})`}${res.error ? ` err=${res.error.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
      });
      release(chosen.id, w.coreId);
      // KAR-018-LT-W2: 같은 (task, errHash) 사다리 cooldown. 1-3회=30min,
      // 4-9회=6h, 10+회=24h. 다른 errHash 면 count reset(현행 동작 유지).
      const errMsgRaw = (res.error || '').trim();
      const errHash = errMsgRaw ? computeErrHash(errMsgRaw) : undefined;
      // TASK-KAR-018-LT-W2-A: error 시 full stderr/stdout 을 별 diag entry 로
      // 적재(chat cap 유지, 원장만 full). 다음 세션 grep 으로 진단 가능.
      appendWorkerRawDiag(
        env, w.coreId, chosen.id, errMsgRaw,
        res.stderrFull, res.stdoutFull, res.exitCode,
      );
      markNoArtifact(chosen.id, tickNow, errHash);
      const repeatCount = errHash ? getNoArtifactRepeatCount(chosen.id) : 0;
      const cooldownLabel =
        repeatCount <= 3 ? '30분' : repeatCount <= 9 ? '6h' : '24h(반복 한도)';
      const errDetail = errMsgRaw.slice(0, 3000);
      const repeatTag = repeatCount > 1
        ? ` · 같은 사유 ${repeatCount}회 — cooldown ${cooldownLabel}`
        : '';
      // KAR-018-LT-16: 결과를 work-memory 에 append → 다음 대화 자기 기억.
      rememberWorkerOutcome(
        memoRoot,
        w.coreId,
        chosen.id,
        'fail',
        `${res.status}${wt ? ` on ${wt.branch}` : ` non-agentic:${wtErr}`}${errDetail ? ` — ${errDetail.slice(0, 200)}` : ''}`,
      );
      await voicedWorkerSpeak(
        w.coreId,
        `${w.label} ⚠ ${chosen.id} ${res.status}(${wt ? `agentic ${wt.branch}` : `non-agentic:${wtErr}`}) — 점유 해제·재대기${repeatTag}. 도메인=${w.domain}${errDetail ? `\n· 사유: ${errDetail}` : ''}`,
        speak, voice, env,
        loadSkinPersona(memoRoot, w.coreId),
      );
      results.push(`${w.coreId}:${res.status}`);
    }
  };

  const concurrency = Math.max(1, Number(env.AGENT_WORKER_CONCURRENCY) || workers.length);
  let nextIdx = 0;
  const runner = async (): Promise<void> => {
    for (;;) {
      if (isKilled()) return;
      const i = nextIdx++;
      if (i >= workers.length) return;
      await processWorker(workers[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, workers.length) }, runner));
  const csv = results.join(',');
  if (csv) lastWorkerCsv = csv;
  return csv || 'no-workers';
}

/**
 * 완료된 detached tier3 후처리 (KAR-094, 2026-05-22).
 *
 * tier3-detached.ts:reapInFlight 의 caller — 각 완료 in-flight 마다:
 *   - exit 0 + branch pushed → done (PR 검토 대기)
 *   - exit 0 + 미푸시 + escalate marker → escalated
 *   - exit 0 + 미푸시 → done-no-artifact
 *   - exit != 0 → error (cooldown 적용)
 *   - voicedWorkerSpeak + appendTrace + 워크트리 cleanup
 * crashed (PID 죽었으나 done.json 없음) → 짧은 알림 + cleanup.
 *
 * 호출: main.ts startup + 매 cadence tick (worker 후) + /관리자 워커틱.
 */
export async function reapWorkerInFlight(
  env: NodeJS.ProcessEnv,
  speakOverride?: CoreSpeakFn,
): Promise<ReaperSummary> {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) {
    return { total: 0, alive: 0, completed: [], crashed: [], errors: [] };
  }
  const notify = defaultNotify(env);
  const speak: CoreSpeakFn =
    speakOverride ??
    getCoreSpeak() ??
    (async (_cid: string, t: string) => { notify(t); return true; });
  const voice = (p: string): Promise<string> =>
    generateAgentText(env, p, 20_000).catch(() => '');

  const workersByCoreId = new Map(defaultListWorkers(memoRoot).map((w) => [w.coreId, w]));

  return reapInFlight(memoRoot, {
    onCompleted: async (taskId, marker, result, output) => {
      const w = workersByCoreId.get(marker.coreId);
      const label = w?.label ?? marker.coreId;
      const domain = w?.domain ?? '?';
      const branch = marker.branch ?? '?';
      const stdout = (output.stdout || '').trim();
      const exitOk = result.exitCode === 0;
      const escalate = stdout.includes(ESCALATE_MARKER);
      // branchPushed: marker.cwd 있으면 거기서 origin ls-remote 체크.
      let pushed = false;
      if (exitOk && marker.cwd && marker.branch) {
        try {
          // cwd 가 워크트리 → 그 안에서 git 명령 가능 (cleanup 전).
          const out = execSync(
            `git -C "${marker.cwd}" ls-remote --heads origin "${marker.branch}"`,
            { timeout: 30_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
          );
          pushed = out.trim().length > 0;
        } catch { pushed = false; }
      }
      const tickNow = Date.now();
      let head: string;
      let traceStatus: string;
      if (!exitOk) {
        traceStatus = `error(exit=${result.exitCode}${result.signal ? `,sig=${result.signal}` : ''})`;
        markNoArtifact(taskId, tickNow);
        head = `${label} ⚠ ${taskId} detached tier3 종료코드 ${result.exitCode}${result.signal ? ` (${result.signal})` : ''} — 30분 cooldown. 도메인=${domain}`;
      } else if (pushed) {
        traceStatus = 'done';
        head = `${label} ▶ ${taskId} 수행 — 브랜치 \`${branch}\` origin push 확인 (Draft PR 검토 대기, detached). 도메인=${domain}`;
      } else if (escalate) {
        traceStatus = 'escalated';
        markEscalated(taskId, tickNow);
        head = `${label} ⚠ ${taskId} = 사용자 결정 필요(escalate, detached) — 자동 진행 불가. 이 스레드에서 결정해 주세요. 도메인=${domain}`;
      } else {
        traceStatus = 'done-no-artifact';
        markNoArtifact(taskId, tickNow);
        head = `${label} ⚠ ${taskId} detached 실행 완료했으나 origin 브랜치 미푸시 = 실산출 0 → 30분 cooldown. (브랜치 ${branch} 로컬뿐). 도메인=${domain}`;
      }
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'budget',
        core: marker.coreId,
        reason: `worker ${taskId} detached ${traceStatus} branch=${branch} duration=${Math.round(result.durationMs / 1000)}s`,
      });
      const report = stdout.slice(-2000);
      await voicedWorkerSpeak(
        marker.coreId,
        report ? `${head}\n· 보고: ${report}` : head,
        speak, voice, env,
        loadSkinPersona(memoRoot, marker.coreId),
      );
      rememberWorkerOutcome(
        memoRoot, marker.coreId, taskId,
        pushed ? 'fix' : escalate ? 'decision' : 'fail',
        `detached ${traceStatus} branch=${branch}`,
      );
      // 워크트리 cleanup (claude CLI 가 끝났으니 안전).
      if (marker.cwd) {
        try {
          const repoRoot = execSync(
            `git -C "${marker.cwd}" rev-parse --show-superproject-working-tree`,
            { timeout: 10_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim();
          const root = repoRoot || marker.cwd.replace(/[/\\]\.worktrees[/\\][^/\\]+$/, '');
          if (root && root !== marker.cwd) {
            cleanupWorkerWorktree(root, marker.cwd);
          }
        } catch { /* best-effort */ }
      }
    },
    onCrashed: async (taskId, marker) => {
      const w = workersByCoreId.get(marker.coreId);
      const label = w?.label ?? marker.coreId;
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'drift',
        core: marker.coreId,
        reason: `worker ${taskId} detached crashed (pid=${marker.pid} dead, done.json 없음) — wrapper crash 의심`,
      });
      await voicedWorkerSpeak(
        marker.coreId,
        `${label} ⚠ ${taskId} detached wrapper crash 의심 (pid=${marker.pid} 죽음, 결과 없음) — 점유 해제·재시도 가능.`,
        speak, voice, env,
        loadSkinPersona(memoRoot, marker.coreId),
      );
      if (marker.cwd) {
        try {
          const root = marker.cwd.replace(/[/\\]\.worktrees[/\\][^/\\]+$/, '');
          if (root && root !== marker.cwd) {
            cleanupWorkerWorktree(root, marker.cwd);
          }
        } catch { /* best-effort */ }
      }
    },
  });
}
