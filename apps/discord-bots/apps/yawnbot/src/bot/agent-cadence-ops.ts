/**
 * agent-cadence-ops — 주기적 운영 작업: Retro / QC / Surgery / Idle Chatter.
 * 모두 gated(영속 타임스탬프)·best-effort·비차단 패턴.
 */
import fs from 'fs';
import path from 'path';
import {
  loadPortfolio,
  topProject,
  shouldRunRetro,
  buildRetroPrompt,
  parseRetroDecision,
  recordRetro,
  shouldRunQualityCheck,
  buildQualityCheckMessage,
  recordQualityCheck,
  shouldRunSurgery,
  buildSurgerySeedPrompt,
  parseSurgeryDecision,
  recordSurgery,
  shouldRunDigest,
  recordDigest,
  type Portfolio,
} from './team-portfolio';
import {
  gatherHealthSignals,
  diagnoseHealth,
  formatHealthBlock,
  type HealthSignals,
  type HealthIssue,
} from './system-health';
import { readEvolutionEvents, type EvolutionEvent } from './evolution-observatory';
import { buildDigestText, filterEventsByWindow } from './team-digest';
import { appendTrace, defaultNotify, type NotifyFn } from './governance-adapter';
import { materializeTaskProposal } from './proposal-adapter';
import {
  commitAndPushMemoFile,
  type MemoPushResult,
} from '../services/memo-push';
import { listCoreIds, loadCoreDef, type CoreDef } from '../services/agent-core';
import {
  isKilled,
  generateAgentText,
  getCoreSpeak,
  type CoreSpeakFn,
} from './agent-cadence-state';
import { loadSkinCardBody } from './agent-cadence-skin';
import { fetchTeamBusContext } from './team-bus-fetcher';

// ── readMissionText (로컬 — ops 내부 기본값 전용) ────────────
const MISSION_FALLBACK =
  '§1 공통목표: karmoddrine 세계(3 레포+메타 인프라+앞으로 만들 것)를 ' +
  '황금의 정신(근본·최고 코드·미래 안전망·환경 재현성·AI Native)으로 ' +
  '주도적으로 키운다(개선뿐 X — 새 기능/프로젝트/아이디어). ' +
  '§3 비목표(드리프트): 검증 우회 자가개선/날조 · 승인없는 정본 변경 · ' +
  'objective 무한증식/미션무관 발굴 · 면적/리소스 핑계 · 외부 프레임워크 이중화.';

function readMissionText(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  if (!root) return MISSION_FALLBACK;
  try {
    const p = path.join(root, '.claude', 'agent-mission.md');
    const t = fs.readFileSync(p, 'utf-8').trim();
    return t.length > 0 ? t : MISSION_FALLBACK;
  } catch {
    return MISSION_FALLBACK;
  }
}

// ── summarizeTick ────────────────────────────────────────────
/**
 * tick 결과 코드 → #team-bus 하트비트 한 줄 (순수·동료 평이체).
 * 의미 있는 활동만 한 줄 요약, 순수 idle 은 null(스팸 X).
 */
export function summarizeTick(r: string, anchor = ''): string | null {
  const s = (r || '').trim();
  if (!s) return null;
  const bits: string[] = [];
  const dlb = s.match(/deliberation:(\d+):(adopt-mods|adopt|reject|escalate)/);
  if (dlb) {
    const n = dlb[1];
    const v =
      dlb[2] === 'adopt' ? `채택`
      : dlb[2] === 'adopt-mods' ? `수정 채택`
      : dlb[2] === 'reject' ? `반려`
      : `⚠ 동료 판단 필요`;
    bits.push(`팀이 ${n}턴 토론 끝에 — ${v}`);
  }
  const rt = s.match(/retro:(adjust|achieved|keep)/);
  if (rt && rt[1] !== 'keep') {
    bits.push(rt[1] === 'adjust' ? '회고 끝에 목표 갱신' : '현 목표 달성 — 다음으로');
  }
  const dlg = s.match(/(?<!delibera)\bdialogue:([a-z0-9_-]+)/i);
  if (dlg) bits.push(`동료 ${dlg[1]} 가 팀 채팅에 한마디 보탬`);
  const wk = s.match(/\+worker:([^+]+)/);
  if (wk) {
    for (const seg of wk[1].split(',')) {
      const m = seg.match(/^([a-z0-9_-]+):done:([A-Z]+-[A-Z]*-?\d+|\S+)/i);
      if (m) bits.push(`${m[1]} 가 «${m[2]}» 자율 착수 (검토 대기)`);
    }
  }
  const cons = s.match(/\+consumed:(\d+)/);
  if (cons) bits.push(`승인된 발굴 ${cons[1]}건 → 새 작업으로 만듦`);
  if (/(?:^|[^a-z])(self-improve|self-skill|agent-factory|task|objective)\b/.test(s) &&
      /idle→producer:(self-improve|self-skill|agent-factory|task|objective)/.test(s)) {
    bits.push('새 아이디어 1건 발굴 → 승인 기다리는 중');
  }
  if (/\bescalated\b/.test(s)) bits.push('판단 필요한 건 — 동료 승인 대기');
  if (/budget-stop/.test(s)) bits.push('예산 한도 — 이번 바퀴는 멈춤');
  if (/drift-skip/.test(s)) bits.push('미션과 안 맞는 방향 — 건너뜀');
  const evo = s.match(/\+evolution:(\d+)/);
  if (evo && Number(evo[1]) > 0) bits.push(`팀 진화 이벤트 ${evo[1]}건 기록`);
  const surg = s.match(/\+surgery:(seed:[^+]*|escalate)/);
  if (surg) {
    bits.push(
      surg[1].startsWith('seed:')
        ? `⚕ 자기수술 진단 완료 — 과제 시드 작성`
        : `⚕ 자기수술 — 사람 판단 필요`,
    );
  }
  if (bits.length === 0) return null;
  const head = anchor.trim() || '🛰 팀 한 바퀴';
  return `${head}: ${bits.join(' · ')}`;
}

// ── Retro ────────────────────────────────────────────────────
export interface RetroDeps {
  generate?: (prompt: string) => Promise<string>;
  notify?: NotifyFn;
  missionText?: string;
  healthSignals?: HealthSignals;
}

/**
 * LT-7 retro 밸브 + 기둥4 헬스 주입 (1회·gated·best-effort).
 * shouldRunRetro 영속 게이트(intervalMs, default 6h).
 */
export async function runRetroOnce(
  env: NodeJS.ProcessEnv,
  deps: RetroDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';
  const top = topProject(loadPortfolio(memoRoot));
  if (!top) return 'retro-skip';
  const intervalMs = Number(env.AGENT_RETRO_INTERVAL_MS) || 6 * 3600_000;
  if (!shouldRunRetro(top, Date.now(), intervalMs)) return 'retro-skip';

  const missionText = deps.missionText ?? readMissionText(env);
  const signals = deps.healthSignals ?? gatherHealthSignals(env);
  const issues = diagnoseHealth(signals);
  const healthCtx = issues.length > 0 ? `\n\n${formatHealthBlock(signals, issues)}` : '';

  const generate =
    deps.generate ??
    ((prompt: string) =>
      generateAgentText(env, prompt, Number(env.AGENT_DIALOGUE_TIMEOUT_MS) || 90_000));
  let text = '';
  try { text = await generate(buildRetroPrompt(top, missionText) + healthCtx); }
  catch { return 'retro-error'; }
  const decision = parseRetroDecision(text);
  recordRetro(memoRoot, top.id, decision);
  const notify = deps.notify ?? defaultNotify(env);
  const human =
    decision.action === 'adjust' ? `목표 조정 → «${decision.objective}»`
    : decision.action === 'achieved' ? '현 목표 달성 — 다음 발굴로'
    : '현 목표 유지 (북극성 정렬 확인)';
  const healthSuffix = issues.length > 0 ? ` | ⚠ 헬스 이슈 ${issues.length}건(surgery 경로 확인)` : '';
  notify(`🔭 «${top.title}» 회고: ${human}${healthSuffix}`);
  appendTrace(env, {
    ts: new Date().toISOString(), type: 'drift', core: 'retro',
    reason: `retro «${top.id}» ${decision.action}${decision.objective ? ` → ${decision.objective.slice(0, 80)}` : ''}${healthSuffix}`,
  });
  return `retro:${decision.action}`;
}

// ── QualityCheck ─────────────────────────────────────────────
export interface QualityCheckDeps {
  notify?: NotifyFn;
  healthSignals?: HealthSignals;
}

/**
 * 사용자 품질 체크 (1회·gated·best-effort). HITL 요청 + 헬스 신호 인라인.
 * LLM 호출 없음. shouldRunQualityCheck 영속 게이트(24h).
 */
export async function runQualityCheckOnce(
  env: NodeJS.ProcessEnv,
  deps: QualityCheckDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';
  const top = topProject(loadPortfolio(memoRoot));
  if (!top) return 'qc-skip';
  const intervalMs = Number(env.AGENT_QUALITY_CHECK_INTERVAL_MS) || 24 * 3600_000;
  if (!shouldRunQualityCheck(top, Date.now(), intervalMs)) return 'qc-skip';

  const signals = deps.healthSignals ?? gatherHealthSignals(env);
  const issues = diagnoseHealth(signals);
  const healthSuffix = issues.length > 0 ? `\n\n${formatHealthBlock(signals, issues)}` : '';
  const msg = buildQualityCheckMessage(top) + healthSuffix;
  const notify = deps.notify ?? defaultNotify(env);
  notify(msg);
  recordQualityCheck(memoRoot, top.id);
  appendTrace(env, {
    ts: new Date().toISOString(), type: 'drift', core: 'quality-check',
    reason: `품질 체크 — «${top.id}» 사용자 관측 요청${issues.length > 0 ? ` | 헬스 이슈 ${issues.length}건 포함` : ''}`,
  });
  return 'qc:sent';
}

// ── SelfSurgery ──────────────────────────────────────────────
export interface SelfSurgeryDeps {
  generate?: (prompt: string) => Promise<string>;
  notify?: NotifyFn;
  missionText?: string;
  healthSignals?: HealthSignals;
  writeTask?: (env: NodeJS.ProcessEnv, payload: { title: string; body: string; domain: string }) => string | null;
  /** force=true → 12h gate 우회 (수동 슬래시 트리거용). */
  force?: boolean;
  /**
   * KAR-018-PUSH-CLOSURE Phase 1 — surgery seed 파일을 memo origin 으로 push.
   * 기본 = commitAndPushMemoFile. 테스트에서 stub 주입 가능. 실패 = tick 비차단.
   */
  pushArtifact?: (
    env: NodeJS.ProcessEnv,
    absPath: string,
    message: string,
  ) => Promise<MemoPushResult>;
}

/**
 * 기둥4 자기수술 (1회·gated·best-effort). 헬스 신호 수집 →
 * critical 이슈 있으면 LLM 자율 진단 → task seed OR escalate.
 * shouldRunSurgery 게이트(기본 12h).
 */
export async function runSelfSurgeryOnce(
  env: NodeJS.ProcessEnv,
  deps: SelfSurgeryDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';

  const portfolio = loadPortfolio(memoRoot);
  const top = topProject(portfolio);
  if (!top) return 'surgery-skip';

  // 2026-05-22 사용자 발화 「12h? 왜 12h인데?」 — 12h default 너무 길어 「지혼자
  // 자가발전」 체감 0. 30분 default + critical 시 gate 우회. health signal 먼저
  // 수집해서 critical 이면 interval 무관 즉시 진단 (Cronbot → 즉응성).
  const intervalMs = Number(env.AGENT_SURGERY_INTERVAL_MS) || 30 * 60_000;
  const signals = deps.healthSignals ?? gatherHealthSignals(env);
  const issues = diagnoseHealth(signals);
  const critical = issues.filter((i) => i.severity === 'critical');
  const hasCritical = critical.length > 0;
  // gate: force OR critical OR interval 경과. critical = 즉시 진입 (사용자 발화 정합).
  if (!deps.force && !hasCritical && !shouldRunSurgery(portfolio, Date.now(), intervalMs)) {
    return 'surgery-skip';
  }
  if (!hasCritical) {
    recordSurgery(memoRoot);
    return 'surgery-skip';
  }

  const missionText = deps.missionText ?? readMissionText(env);
  const healthBlock = formatHealthBlock(signals, issues);
  const generate =
    deps.generate ??
    ((prompt: string) =>
      generateAgentText(env, prompt, Number(env.AGENT_DIALOGUE_TIMEOUT_MS) || 90_000));

  let text = '';
  try { text = await generate(buildSurgerySeedPrompt(top, healthBlock, missionText)); }
  catch { return 'surgery-error'; }

  const decision = parseSurgeryDecision(text);
  recordSurgery(memoRoot);
  const notify = deps.notify ?? defaultNotify(env);

  if (decision.action === 'seed' && decision.taskTitle) {
    const writeTask = deps.writeTask ?? ((e, payload) => materializeTaskProposal(e, payload));
    const filePath = writeTask(env, {
      title: decision.taskTitle,
      body: [
        '## 자기수술 진단', '', decision.taskBody || decision.taskTitle, '',
        '## 헬스 신호', '', '```', healthBlock, '```', '',
        '> ⚕ 기둥4 자율 진단 (agent-cadence surgery loop). status=seed = 워커가 픽업해 실행.',
      ].join('\n'),
      domain: 'KAR',
    });
    // KAR-018-PUSH-CLOSURE Phase 1 — seed 파일을 memo origin 으로 push.
    // 실패 = tick 비차단, outcome 만 trace/notify 라벨에 노출.
    let pushResult: MemoPushResult | null = null;
    if (filePath) {
      try {
        const pushArtifact =
          deps.pushArtifact ??
          ((e, abs, msg) => commitAndPushMemoFile(e, abs, msg));
        pushResult = await pushArtifact(
          env,
          filePath,
          `chore(KAR-018-surgery): seed ${decision.taskTitle.slice(0, 60)}`,
        );
      } catch {
        /* push 실패 = tick 비차단. trace 가 빈 label 로 신호 */
      }
    }
    const pushLabel = pushResult
      ? ` [${pushResult.outcome}${pushResult.pushedSha ? `@${pushResult.pushedSha.slice(0, 7)}` : ''}]`
      : '';
    const label = filePath ? `→ ${path.basename(filePath)}${pushLabel}` : '(파일 생성 실패)';
    notify(
      `⚕ **자기수술** — 이슈 진단 완료. 과제 시드 작성 ${label}\n` +
        `이슈: ${critical.map((i) => i.code).join(', ')}\n` +
        `진단: ${decision.reason.slice(0, 120)}`,
    );
    appendTrace(env, {
      ts: new Date().toISOString(), type: 'budget', core: 'surgery',
      reason: `surgery seed: ${decision.taskTitle.slice(0, 80)} (${critical.map((i) => i.code).join(',')})${pushLabel}`,
    });
    return `surgery:seed:${decision.taskTitle.slice(0, 40)}`;
  }

  if (decision.action === 'escalate') {
    notify(
      `⚕ **자기수술 escalate** — 사람 판단 필요.\n` +
        `이슈: ${critical.map((i) => i.code).join(', ')}\n` +
        `사유: ${decision.reason.slice(0, 200)}`,
    );
    appendTrace(env, {
      ts: new Date().toISOString(), type: 'drift', core: 'surgery',
      reason: `surgery escalate: ${decision.reason.slice(0, 80)}`,
    });
    return 'surgery:escalate';
  }

  appendTrace(env, {
    ts: new Date().toISOString(), type: 'drift', core: 'surgery',
    reason: `surgery keep: ${decision.reason.slice(0, 80)}`,
  });
  return 'surgery:keep';
}

// ── Digest (LT-DIGEST) ───────────────────────────────────────
export interface DigestDeps {
  notify?: NotifyFn;
  portfolio?: Portfolio;
  events?: EvolutionEvent[];
  healthSignals?: HealthSignals;
  healthIssues?: HealthIssue[];
  nowMs?: number;
}

/**
 * #team-bus 주기 다이제스트 (1회·gated·best-effort, 기본 12h).
 * ticker(evolution-observatory)와 ⊥: ticker=push event-driven, digest=pull time-driven.
 * 진화 0 일 때도 "12h 진화 0 — stalled: X" 명시 → "cron 껍데기" 인지 직격.
 * LLM 호출 없음(LT-QC 동형). 모든 source = 기존 substrate read-only.
 */
export async function runDigestOnce(
  env: NodeJS.ProcessEnv,
  deps: DigestDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';

  const nowMs = deps.nowMs ?? Date.now();
  const intervalMs = Number(env.AGENT_DIGEST_INTERVAL_MS) || 12 * 3600_000;
  const portfolio = deps.portfolio ?? loadPortfolio(memoRoot);
  if (!shouldRunDigest(portfolio, nowMs, intervalMs)) return 'digest:skip';

  const signals = deps.healthSignals ?? gatherHealthSignals(env, nowMs);
  const issues = deps.healthIssues ?? diagnoseHealth(signals);
  const allEvents = deps.events ?? readEvolutionEvents(env, 500);
  const windowEvents = filterEventsByWindow(allEvents, nowMs - intervalMs);

  const text = buildDigestText({
    events: windowEvents,
    portfolio,
    signals,
    issues,
    windowMs: intervalMs,
    nowMs,
  });

  const notify = deps.notify ?? defaultNotify(env);
  notify(text);
  recordDigest(memoRoot, new Date(nowMs).toISOString());
  appendTrace(env, {
    ts: new Date(nowMs).toISOString(),
    type: 'drift',
    core: 'digest',
    reason: `digest ${Math.round(intervalMs / 3600_000)}h | events:${windowEvents.length} issues:${issues.length}`,
  });
  return 'digest:sent';
}

// ── Idle Chatter ─────────────────────────────────────────────
const lastChatterTs = new Map<string, number>();
/** 테스트 전용 — chatter 쿨다운 리셋. */
export function resetChatterCooldown(): void { lastChatterTs.clear(); }

/**
 * KAR-018-SO-2: 직전 N시간 *실 진척* 카운트 (자가차단 게이트용).
 *
 * 진척 = `agent-trace.jsonl` 에서 `worker <TASK> done agentic` 패턴 (push 됨).
 * done-no-artifact / escalated / error / idle / chatter 는 진척 X. 즉 사용자
 * 시점 "뭐 진짜 됐냐" = pushed worker 산출. promotion ledger(`evolution-events`)
 * 의 core-promoted 도 자가발전 신호로 포함.
 *
 * 부재·IO 실패 = 0 (안전: 잡담 일단 허용. 진척 측정 못 함 = 막을 근거 없음).
 */
export function recentRealProgressCount(
  memoRoot: string,
  windowHours = 6,
  nowMs = Date.now(),
): number {
  if (!memoRoot) return 0;
  const cutoffIso = new Date(nowMs - windowHours * 3_600_000).toISOString();
  let count = 0;
  const tracePath = path.join(memoRoot, '.claude', 'discoveries', 'agent-trace.jsonl');
  if (fs.existsSync(tracePath)) {
    try {
      for (const line of fs.readFileSync(tracePath, 'utf-8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const e = JSON.parse(t) as { ts?: string; reason?: string };
          if (!e.ts || e.ts < cutoffIso) continue;
          // worker pushed done: "worker TASK-XXX done agentic <branch>"
          if (/\bworker\s+TASK-[A-Z0-9-]+\s+done\s+agentic\b/.test(e.reason || '')) {
            count += 1;
          }
        } catch { /* skip 손상 */ }
      }
    } catch { /* IO 실패 = 0 */ }
  }
  const evoPath = path.join(memoRoot, '.claude', 'evolution-events.jsonl');
  if (fs.existsSync(evoPath)) {
    try {
      for (const line of fs.readFileSync(evoPath, 'utf-8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const e = JSON.parse(t) as { ts?: string; code?: string };
          if (!e.ts || e.ts < cutoffIso) continue;
          if (e.code === 'core-promoted' || e.code === 'core-reverted') count += 1;
        } catch { /* skip */ }
      }
    } catch { /* IO 실패 = 0 */ }
  }
  return count;
}

/**
 * chatter 설정 — `<memoRoot>/.claude/agent-chatter-config.json`.
 * 없으면 기본값(prob=0.15, cooldownMinutes=120). 공개 설정이라 env 불필요.
 * 예시:
 * ```json
 * { "prob": 0.20, "cooldownMinutes": 90 }
 * ```
 */
interface ChatterConfig { prob: number; cooldownMinutes: number; }
function loadChatterConfig(memoRoot: string): ChatterConfig {
  const defaults: ChatterConfig = { prob: 0.15, cooldownMinutes: 120 };
  if (!memoRoot) return defaults;
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(memoRoot, '.claude', 'agent-chatter-config.json'),
        'utf-8',
      ),
    );
    return {
      prob:
        typeof raw.prob === 'number' && raw.prob >= 0 && raw.prob <= 1
          ? raw.prob
          : defaults.prob,
      cooldownMinutes:
        typeof raw.cooldownMinutes === 'number' && raw.cooldownMinutes > 0
          ? raw.cooldownMinutes
          : defaults.cooldownMinutes,
    };
  } catch {
    return defaults;
  }
}

export interface IdleChatterDeps {
  speak?: CoreSpeakFn;
  generate?: (prompt: string) => Promise<string>;
  /** 코어당 발화 확률 0~1 (기본 0.15). */
  chatterProb?: number;
  /** 코어당 최소 발화 간격 ms (기본 2h). */
  chatterCooldownMs?: number;
  /**
   * KAR-018-SO-2: 진척 측정창 (시간). 이 창 내 *실 진척* 0 이면 chatter 전체
   * skip. 0 또는 미지정 = 가드 무효 (legacy 동작). 기본 6h (사용자 raw dump
   * 「실작업 0 잡담」 진단 정합).
   */
  progressWindowHours?: number;
  /** SO-2 진척 카운터 주입 (test). 미주입 = recentRealProgressCount. */
  progressCounter?: (memoRoot: string, windowHours: number) => number;
}

/**
 * 활성 코어 중 일부가 페르소나 기반 아무말을 #team-bus 에 툭 뱉는다.
 * 업무 보고 X — 캐릭터 일상 발화. 팀이 살아있는 느낌 생성.
 * 쿨다운(2h)·확률(15%) 이중 게이트 → 스팸 X.
 */
export async function runIdleChatterOnce(
  env: NodeJS.ProcessEnv,
  deps: IdleChatterDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';

  const speak = deps.speak ?? getCoreSpeak();
  if (!speak) return 'chatter-no-speak';

  // KAR-018-SO-2: 진척 0 자가차단. 사용자 진단 「KlWorker 점심 메뉴 등 잡담 박음,
  // 실작업 0」 — chatter 자체가 「뭐 되는게 없어」 인상의 주범. 가드 = pushed
  // worker outcome + core promotion 직전 6h 0 이면 chatter 전체 skip + trace.
  // 가드 무효 (windowHours<=0 or 미지정) 시 legacy 동작 — 기본 6h 활성.
  const progressWindow = deps.progressWindowHours ?? 6;
  if (progressWindow > 0) {
    const counter = deps.progressCounter ?? ((r, w) => recentRealProgressCount(r, w));
    const progress = counter(memoRoot, progressWindow);
    if (progress === 0) {
      // [no-news is bad-news] 룰 정합 — 차단 사실을 trace 로 남겨 silent X.
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'drift',
        core: 'chatter',
        reason: `SO-2 chatter skip: no real progress in ${progressWindow}h (pushed-done + core-promoted = 0)`,
      });
      return `chatter-skip:no-progress-${progressWindow}h`;
    }
  }

  const cfg = loadChatterConfig(memoRoot);
  const prob = deps.chatterProb ?? cfg.prob;
  const cooldownMs = deps.chatterCooldownMs ?? cfg.cooldownMinutes * 60_000;
  const generate =
    deps.generate ??
    ((p: string) => generateAgentText(env, p, 30_000).catch(() => ''));
  // KAR-018-SO-2-A: chatter 도 #team-bus 직전 발언 read → 사용자가 채팅에
  // 박은 분위기·관심사 반영 (그냥 "아무말" 이 아니라 *대화 흐름에 맞는*).
  let chatterChannelCtx = '';
  try { chatterChannelCtx = (await fetchTeamBusContext(8)) || ''; }
  catch { /* silent — chatter 비차단 */ }

  const coreIds = listCoreIds(memoRoot);
  const cores = coreIds
    .map((id) => loadCoreDef(memoRoot, id))
    .filter((d): d is CoreDef => d !== null && d.status === 'active');

  const fired: string[] = [];
  for (const core of cores) {
    if (Math.random() >= prob) continue;
    const last = lastChatterTs.get(core.id) ?? 0;
    if (Date.now() - last < cooldownMs) continue;
    const body = loadSkinCardBody(memoRoot, core.id);
    if (!body) continue;
    try {
      const channelHint = chatterChannelCtx.trim()
        ? [
            ``,
            `[팀 채널 직전 발언 — 분위기·맥락]`,
            chatterChannelCtx.trim().slice(0, 1000),
            `※ 사용자/동료가 박은 내용에 *반응* 하거나 그 분위기 이어가는`,
            `   한마디면 더 좋음 (반드시 X — 무관한 잡담도 OK).`,
          ].join('\n')
        : '';
      const prompt = [
        `너는 아래 [캐릭터] 설명에 해당하는 캐릭터야.`,
        `지금 팀 채널(#team-bus)에 갑자기 아무말이나 툭 뱉어봐.`,
        `업무 보고 아님. 그냥 네 캐릭터답게 자연스럽게 1~2문장.`,
        `너무 길거나 격식 있게 X. 사람이 SNS에 아무 생각 올리듯이.`,
        `이모지 적당히 OK. 한국어.`,
        channelHint,
        ``,
        `[캐릭터]`,
        body.slice(0, 800),
      ].filter(Boolean).join('\n');
      const text = (await generate(prompt)).trim().slice(0, 250);
      if (!text) continue;
      lastChatterTs.set(core.id, Date.now());
      await speak(core.id, text);
      fired.push(core.id);
    } catch {
      /* best-effort — 실패가 tick 비차단 */
    }
  }
  return fired.length ? `chatter:${fired.join(',')}` : 'chatter-none';
}
