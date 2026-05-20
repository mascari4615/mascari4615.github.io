/**
 * agent-cadence — ⑦ 자율 구동 cadence 어댑터 (KAR-018-B slice-3, B-3).
 *
 * substrate⊥어댑터(parent ⓪'): 본 파일 = *어댑터* 층 — substrate(순수
 * dispatcher) 에 spawn primitive(generateAssistantText)·예산훅(team-room)·
 * 머신(KAR_MACHINE)을 주입(DI). dispatcher.ts 는 Discord/karmolab-ai 무관 유지.
 *
 * ⚠ 자율 cadence = **default ON** (`AGENT_CADENCE_ENABLED=0` 으로 명시 시만 OFF).
 * 예산 reserve=default allow(budgetReserve → () => true) 이므로 폭주 위험 없음(parent ④ gating).
 * 이벤트 경로(사람이 디스코드로 말 검 → 응답)는 sub-A assistant-handler 로 *항상 live* (본 cadence 와 무관).
 *
 * ## 모듈 구조 (TASK-KAR-019-MOD)
 * ```text
 * agent-cadence-state.ts   — kill·registry·LLM·coreSpeak 공유 상태
 * agent-cadence-skin.ts    — 스킨 페르소나 헬퍼 (loadSkinPersona 등)
 * agent-cadence-worker.ts  — 도메인 워커 소비자 (runWorkerConsumerOnce)
 * agent-cadence-ops.ts     — Retro·QC·Surgery·IdleChatter
 * agent-cadence.ts         — 오케스트레이터·거버넌스·대화·타이머 (이 파일)
 * ```
 * 의존 방향: state → skin/worker/ops → cadence (단방향, circular dep 0).
 * 외부 코드는 agent-cadence.ts 에서 re-export 되는 심볼만 참조하면 됨.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { reserveBudget, checkAndStampCooldown } from './team-room';
import { updateDashboard, parseWorkerStates } from './team-dashboard';
import {
  loadPortfolio,
  formatPortfolioBlock,
  appendProgress,
  topProject,
} from './team-portfolio';
import {
  spawnTier3,
  type Tier3Deps,
  type Tier3Request,
} from './dispatcher';
import {
  screenCadenceWork,
  ceilingsFromEnv,
  type BudgetCeilings,
} from './governance';
import {
  appendApproval,
  isObjectiveApproved,
  hasPending,
  isGloballyKilled,
  appendTrace,
  defaultNotify,
  type NotifyFn,
} from './governance-adapter';
import {
  runProducerOnce,
  inboxDispatch,
  runInboxConsumerOnce,
  summarizeRejectedForDiscovery,
  publishEnvelope,
  readInboxProposals,
  appendTeamVerdict,
  type DiscoverFn,
} from './proposal-adapter';
import { buildModifiedEnvelope } from './proposal';
import {
  runCorePromotionOnce,
  runCorePromotionRevertOnce,
} from './self-augment';
import {
  runEvolutionObservatoryOnce,
  summarizeRecentEvolutionEvents,
} from './evolution-observatory';
import {
  listCoreIds,
  loadCoreDef,
  coreLabel,
  resolveProposalCore,
  appendCoreMemory,
  type CoreDef,
} from '../services/agent-core';
import { getActiveMemoSyncHandle } from '../services/memo-sync';
import {
  decideDialogueTurn,
  nextDeliberationStep,
  buildDeliberationPrompt,
  classifyDeliberationReply,
  type DeliberationState,
  type DeliberationTurnRec,
  type DeliberationVerdict,
  type PeerUtterance,
} from './agent-dialogue';
// ── 분리 모듈 import ─────────────────────────────────────────
import {
  armKill, disarmKill, isKilled,
  setCoreSpeak, getCoreSpeak,
  generateAgentText, buildTier3Deps,
  runMemoScript,
  type CoreSpeakFn,
} from './agent-cadence-state';
import { loadSkinPersona } from './agent-cadence-skin';
import {
  runWorkerConsumerOnce, getLastWorkerCsv,
  type WorkerCore, type WorkerConsumerDeps, type WorktreeSetup,
  selectWorkerCores, buildWorkerPrompt, detectDecisionNeeded,
  ESCALATE_MARKER, workerRawLedgerPath, appendWorkerRaw,
  voicedWorkerSpeak, resetWorkerStatus,
} from './agent-cadence-worker';
import {
  summarizeTick,
  runRetroOnce, type RetroDeps,
  runQualityCheckOnce, type QualityCheckDeps,
  runSelfSurgeryOnce, type SelfSurgeryDeps,
  runIdleChatterOnce, type IdleChatterDeps,
  resetChatterCooldown,
} from './agent-cadence-ops';
// ── 분리 모듈 re-export (외부 import 경로 불변) ──────────────
export {
  armKill, disarmKill, isKilled,
  setCoreSpeak, buildTier3Deps,
  type CoreSpeakFn,
} from './agent-cadence-state';
export { loadSkinPersona } from './agent-cadence-skin';
export {
  type WorkerCore, type WorkerConsumerDeps, type WorktreeSetup,
  selectWorkerCores, buildWorkerPrompt, detectDecisionNeeded,
  ESCALATE_MARKER, workerRawLedgerPath, appendWorkerRaw,
  voicedWorkerSpeak, resetWorkerStatus,
  runWorkerConsumerOnce,
} from './agent-cadence-worker';
export {
  summarizeTick,
  runRetroOnce, type RetroDeps,
  runQualityCheckOnce, type QualityCheckDeps,
  runSelfSurgeryOnce, type SelfSurgeryDeps,
  runIdleChatterOnce, type IdleChatterDeps,
  resetChatterCooldown,
} from './agent-cadence-ops';

// ── kill / registry / generateAgentText / buildTier3Deps → agent-cadence-state.ts ──



/** cadence 작업 선정 (주입 가능 — 테스트). null = 할 일 없음. */
export type PickWork = () => Tier3Request | null;

/** objectives.md `active` 행 1건 파싱 결과 (드리프트·risk 입력 raw). */
export interface ParsedObjective {
  objId: string;
  summary: string;
  derivation: string;
  alignment: string;
}

/**
 * objectives.md 본문 파서 (순수 — tracer-bullet). 첫 `active` 행 →
 * ParsedObjective. *정렬 공백도 반환* (skip 판정은 governance 가 — D-4).
 * 행 형식: `| OBJ-N | 목표 | 도출근거 | 정렬 | active | 승인 | TASK |`.
 */
export function parseCadenceObjective(md: string): ParsedObjective | null {
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(
      /^\|\s*(OBJ-\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*active\s*\|/,
    );
    if (!m) continue;
    return {
      objId: m[1].trim(),
      summary: m[2].trim(),
      derivation: m[3].trim(),
      alignment: m[4].trim(),
    };
  }
  return null;
}

function objectiveToRequest(o: ParsedObjective): Tier3Request {
  return {
    core: 'cadence', // 코어별 라우팅 = slice-4 (현 placeholder)
    machine: 'any',
    prompt: `[자율 cadence] objective ${o.objId} (${o.summary}) 정렬=${o.alignment}. 미션 정렬 재확인 후 파생 TASK 진행.`,
  };
}

/**
 * (sub-B 호환) `active` + 정렬 있는 첫 행 → Tier3Request. 정렬 공백=null.
 * D-4 부터 게이트는 runGovernedCadenceOnce 가 — 본 함수는 레거시 thin.
 */
export function parseCadenceWork(md: string): Tier3Request | null {
  const o = parseCadenceObjective(md);
  if (!o || !o.alignment) return null;
  return objectiveToRequest(o);
}

/**
 * ⑦' 발굴 프롬프트 빌더 (KAR-018-W, 2026-05-17 근본 fix).
 *
 * 황금의 정신 — 실 dev 봇 관측 + 로컬 재현으로 확정한 근본:
 *  옛 프롬프트는 "agent-mission.md §1/§3 *자가검사*" 를 시켰다 → 발굴
 *  claude 는 비-agentic(도구 거부 = 파일 못 읽음)이라 읽을 수 없는 파일을
 *  읽으려다 무한 deliberation → **120s/180s 풀 타임아웃 hang** (실측).
 *  fix = *어댑터가 fs 로 미션 텍스트를 읽어 프롬프트에 인라인*. spawn 된
 *  claude 는 파일 접근 불요(자족). 재현: 자족 프롬프트 = EXIT0 50s +
 *  고품질 미션정렬 발굴 (vs 파일읽기 프롬프트 = 풀 타임아웃).
 *
 * 순수 — missionText 인자만 받음(테스트 가능, fs 격리). "도구·파일 접근
 * 없음, 아래 텍스트만으로 단일턴 추론, 파일 읽기 시도 X" 를 *명시* 해야
 * 모델이 도구 거부 루프에 빠지지 않는다 (재현 확인).
 */
export function buildDiscoveryPrompt(
  missionText: string,
  contextText = '',
  portfolioBlock = '',
  producerPerspective = '',
): string {
  const ctx = contextText.trim();
  const pf = portfolioBlock.trim();
  const perspLine = producerPerspective.trim();
  const identity = perspLine
    ? `너는 karmoddrine 에이전트 팀의 **${perspLine}** 로서 발굴한다. 이 역할의 관점에서 가장 의미 있는 제안을 골라라. 도구·파일`
    : '너는 karmoddrine 에이전트 팀의 자율 cadence 생산자다. 도구·파일';
  return [
    `${identity}`,
    '접근 없이 *아래 제공된 텍스트만으로* 단일턴 추론한다.',
    '파일을 읽으려 시도하지 마라 (불가 — 빈 출력만 낭비).',
    '',
    '[미션 헌장 — 정렬 anchor (§1 공통목표 / §3 비목표 자가검사용)]',
    missionText.trim(),
    ...(pf ? ['', pf] : []),
    ...(ctx
      ? [
          '',
          '[현황 컨텍스트 — 중복 발굴 회피·정렬 근거 (읽기전용 스냅샷)]',
          ctx,
          '',
          '※ 위 현황은 *부분 스냅샷*이다 — 전량 아님(절단·생략 정상,',
          '  그게 기본이다). **목록이 불완전하다는 이유로 기권하지 마라.**',
          '  미션 정렬되면 제안하라. 회피 대상 = 위에 *명시적으로 보이는*',
          '  최근 항목과 *똑같은* 발굴뿐 (불확실하면 다른 각도로 제안).',
        ]
      : []),
    '',
    '[작업] 위 미션에 정렬되고 현황과 *중복되지 않는* 지금 가치 있는',
    '발굴물 1건을 아래 판별 union JSON 으로만 출력하라 (코드펜스 OK).',
    '서론·설명·질문 금지:',
    '{"kind":"env|skill|agent|task|objective","payload":{...}}',
    '- env: {id,summary,targetFiles[],source}  - skill: {id,name,summary,source,coreId}',
    '- agent: {id,coreId,role,name,source}  - task: {title,body,domain}',
    '- objective: {summary,derivation,alignment}',
    ...(pf
      ? [
          '★ 필수: 엔벨로프 최상위에 "projectId":"<위 포트폴리오 id 하나>"',
          '  포함 + payload 내용이 그 프로젝트의 북극성/현 목표를 *어떻게*',
          '  전진시키는지 본문 불릿에 1줄. 어느 projectId 에도 안 붙는',
          '  발굴 = 폐기(영구기관 금지). 자가정비는 도구적 프로젝트 cite.',
        ]
      : []),
    '',
    '★★ 글쓰기 규칙 (필수 — 어기면 폐기 가치). 읽는 사람=비개발자 사장:',
    '· 절대 금지: §숫자/조항, 내부 코드명(drift·anchor·seam·cadence·',
    '  governance·DGM·producer·hook 등), 영어 약어, 파일경로, 코드.',
    '· **만연체 금지.** 뉴스 헤드라인처럼 *짧은 불릿*. 한 항목=한 줄(≤60자),',
    '  길면 쪼개라. 줄글 문단 X.',
    '· **제목**(task.title / objective.summary) = 딱 떨어지는 한 줄',
    '  명사구 (≤45자, 문장·마침표 X). 본문 내용 반복 X.',
    '· 본문 = 아래를 각각 "- " 불릿 1~2줄로 (총 3~6불릿):',
    '   - 문제/현황: 지금 뭐가 비어있나/불편한가',
    '   - 제안: 뭘 하자는 건가',
    '   - 효과: 하면 뭐가 좋아지나',
    '   - 승인 시: 실제로 뭐가 만들어지나',
    '· task → title(제목) + body(위 불릿). objective → summary(제목 한',
    '  줄) + derivation(문제/제안/효과 불릿) + alignment(목표 정합 1~2',
    '  불릿). 셋 다 짧게·불릿·평이.',
    '판단 기준 = *미션 정렬 확신*뿐(컨텍스트 완전성 X). 미션 정렬 아이디어가',
    '하나도 없을 때만 기권하고, 그때는 **완전히 빈 출력**(설명·괄호문·사유',
    '문장 금지 — 그것도 폐기 사유다). 정렬되면 추측·날조 없이 1건 내라.',
  ].join('\n');
}

/** 미션 헌장 최소 fallback (정본 파일 부재·읽기실패 시 — 자족 보장). */
const MISSION_FALLBACK =
  '§1 공통목표: karmoddrine 세계(3 레포+메타 인프라+앞으로 만들 것)를 ' +
  '황금의 정신(근본·최고 코드·미래 안전망·환경 재현성·AI Native)으로 ' +
  '주도적으로 키운다(개선뿐 X — 새 기능/프로젝트/아이디어). ' +
  '§3 비목표(드리프트): 검증 우회 자가개선/날조 · 승인없는 정본 변경 · ' +
  'objective 무한증식/미션무관 발굴 · 면적/리소스 핑계 · 외부 프레임워크 이중화.';

/**
 * agent-mission.md 본문을 어댑터가 fs 로 읽어 반환 (best-effort).
 * spawn claude 가 아니라 *어댑터* 가 읽음 = 비-agentic 안전 불변.
 * 부재·실패 → MISSION_FALLBACK (발굴 hang 대신 degraded 진행).
 */
export function readMissionText(env: NodeJS.ProcessEnv): string {
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

/**
 * ⑦' 발굴 현황 컨텍스트 — *어댑터가 읽기전용 수집* (slice-5).
 * 비-agentic 불변: spawn claude 는 여전히 tool-less, 어댑터(이 함수)가
 * fs/git 으로 모아 프롬프트에 인라인 (readMissionText 와 동형 안전 모델).
 * 목적 = 발굴이 mission 정렬이되 *현황 무지(중복·재발굴)* 인 문제 해소
 * (mission §3 무한증식 차단의 구체 수단). best-effort·바운드(섹션별 cap),
 * 실패 섹션은 생략 (hang/오염 0). git 은 5s 타임아웃.
 */
export function gatherDiscoveryContext(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  if (!root) return '';
  const parts: string[] = [];
  const safe = (label: string, fn: () => string): void => {
    try {
      const v = fn().trim();
      if (v) parts.push(`### ${label}\n${v}`);
    } catch {
      /* 섹션 실패 = 생략 (degraded, 절대 hang/throw X) */
    }
  };

  safe('최근 memo 커밋 (중복 작업 회피)', () =>
    execSync('git log --oneline -12', {
      cwd: root,
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .slice(0, 12)
      .join('\n')
      .slice(0, 1400),
  );

  safe('현 objectives (active/proposed — 재발굴 금지)', () => {
    const p = path.join(root, '.claude', 'objectives.md');
    return fs
      .readFileSync(p, 'utf-8')
      .split(/\r?\n/)
      .filter((l) => /^\|\s*OBJ-\d+\s*\|/.test(l))
      .slice(0, 14)
      .join('\n')
      .slice(0, 1600);
  });

  safe('최근 인박스 발굴 (중복 제안 금지)', () => {
    const p = path.join(root, '.claude', 'proposals.jsonl');
    const lines = fs.readFileSync(p, 'utf-8').trim().split(/\r?\n/);
    return lines
      .slice(-10)
      .map((l) => {
        try {
          const e = JSON.parse(l);
          const pl = e.envelope?.payload ?? {};
          const t = pl.title || pl.summary || pl.name || pl.id || '?';
          return `- ${e.kind}: ${String(t).slice(0, 90)}`;
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n')
      .slice(0, 1200);
  });

  // KAR-018-Y-2 거절 학습: '최근 인박스'(단순 최근)와 달리 *사장이
  // 명시적으로 거절* 한 방향 — 더 강한 반복금지 신호. summarize 는
  // substrate-pure(proposal-adapter), 거절 0 = 빈문자 → 섹션 생략.
  safe('사장이 거절한 제안 (절대 반복 X)', () =>
    summarizeRejectedForDiscovery(env),
  );

  safe('최근 cadence trace (루프 상태)', () => {
    const p = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
    return fs
      .readFileSync(p, 'utf-8')
      .trim()
      .split(/\r?\n/)
      .slice(-6)
      .map((l) => {
        try {
          const e = JSON.parse(l);
          return `- ${e.core}: ${String(e.reason || '').slice(0, 80)}`;
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n')
      .slice(0, 800);
  });

  // WM 도메인 컨텍스트 — 팀 으뜸 프로젝트. 이 정보 없이 LLM 은 WM 구체
  // 제안 불가 → 모든 발굴이 인프라 쪽으로만 쏠리는 편향의 구조적 근본.
  safe('WM 준비 작업 목록 (발굴 대상 — 가장 높은 weight 프로젝트)', () => {
    const taskDir = path.join(root, 'wm', 'tasks');
    const files = fs.readdirSync(taskDir).filter((f) => f.endsWith('.md'));
    const lines: string[] = [];
    for (const f of files.slice(0, 50)) {
      try {
        const content = fs.readFileSync(path.join(taskDir, f), 'utf-8');
        if (!/status:\s*(ready|seed)/i.test(content)) continue;
        const m = content.match(/^title:\s*(.+)/m);
        const title = m ? m[1].trim() : f.replace(/\.md$/, '').replace(/-/g, ' ');
        const pri = (content.match(/^priority:\s*(\w+)/m) || [])[1] || 'normal';
        lines.push(`- [${pri}] ${title}`);
      } catch {
        /* skip */
      }
    }
    return lines.slice(0, 12).join('\n').slice(0, 1000);
  });

  safe('WM 현재 개발 상태 (씬·시스템 현황)', () =>
    fs
      .readFileSync(path.join(root, 'wm', 'dev', 'context.md'), 'utf-8')
      .slice(0, 1000),
  );

  return parts.join('\n\n').slice(0, 5000);
}

// ── governed cadence (D-3 slice-3) ──────────────────────────
// risk 분류 = *보수* (NLP 날조 X, 황금의 정신): 명시 `[risk]` 마커 또는
// agent-mission §2.2/§2.3(자가개선 환경변경·비전 게이트) 참조만 risk-tag.
const RISK_MARKER = /\[risk\]|§\s*2\.(?:2|3)\b/;
export function classifyRisk(o: ParsedObjective): string | undefined {
  const hay = `${o.summary} ${o.derivation} ${o.alignment}`;
  return RISK_MARKER.test(hay) ? '자가개선/비전 게이트(§2.2-3 or [risk])' : undefined;
}

export interface GovernCadenceDeps {
  env: NodeJS.ProcessEnv;
  ceilings: BudgetCeilings;
  notify: NotifyFn;
  /** §3 비목표 자가검사 (semantic upstream — default false, 후속 에이전트 배선). */
  flagNonGoal?: (o: ParsedObjective) => boolean;
  /** §4 상위 활성 (default = 전역 !kill). */
  higherPriorityActive?: () => boolean;
}

export function buildGovernCadenceDeps(
  env: NodeJS.ProcessEnv,
): GovernCadenceDeps {
  return {
    env,
    ceilings: ceilingsFromEnv(env),
    notify: defaultNotify(env),
    higherPriorityActive: () => isGloballyKilled(env),
  };
}

/**
 * 한 governed tick (D-3): kill → pick objective → screenCadenceWork →
 *  skip(drift) / stop(budget) / escalate(pending+#team-bus, 중복 억제) /
 *  proceed(spawnTier3). 매 단계 trace. *블록 X* — escalate 도 즉시 return,
 *  사용자 승인 후 다음 tick 재pull resume (process.md 백그라운드 자율종료 정합).
 */
export async function runGovernedCadenceOnce(
  deps: Tier3Deps,
  gov: GovernCadenceDeps,
  pickObjective: () => ParsedObjective | null,
): Promise<string> {
  if (isKilled()) return 'killed';
  const o = pickObjective();
  if (!o) return 'idle';

  const gate = screenCadenceWork({
    drift: {
      alignment: o.alignment,
      flaggedNonGoal: gov.flagNonGoal?.(o) ?? false,
      higherPriorityActive: gov.higherPriorityActive?.() ?? false,
    },
    budget: { core: 'cadence', riskTag: classifyRisk(o) },
    ceilings: gov.ceilings,
    approved: isObjectiveApproved(gov.env, o.objId),
  });

  appendTrace(gov.env, {
    ts: new Date().toISOString(),
    type: gate.action === 'skip' ? 'drift' : 'budget',
    core: 'cadence',
    reason: `${o.objId} ${gate.action}: ${gate.reason}`,
  });

  if (gate.action === 'skip' || gate.action === 'stop') {
    gov.notify(`${o.objId} ${gate.action} — ${gate.reason}`);
    return gate.action === 'skip' ? 'drift-skip' : 'budget-stop';
  }
  if (gate.action === 'escalate') {
    if (!hasPending(gov.env, o.objId)) {
      appendApproval(gov.env, {
        ts: new Date().toISOString(),
        objId: o.objId,
        core: 'cadence',
        status: 'pending',
        reason: gate.reason,
      });
      gov.notify(`⚠ ${o.objId} 승인 대기 (risk-tag) — ${gate.reason}`);
    }
    return 'escalated';
  }
  const res = await spawnTier3(objectiveToRequest(o), deps);
  return res.status;
}

/**
 * ⑦' 발굴 1 tick — *governed*: kill 최우선 → 예산 reserve 게이트 → 비-agentic
 * 발굴 → 인박스. objective 경로(runGovernedCadenceOnce)와 동형 — idle 발굴
 * 도 parent ④/Freysa 하 예산 통제. reserve = governance-adapter 가
 * setBudgetReserve 로 주입한 buildGovernanceReserve(!kill+ceilings+trace).
 *
 *  · killed                  → 'killed' (발굴 호출 X)
 *  · reserve deny(!kill·상한) → 'producer-gated' (발굴 호출 X + trace)
 *  · 통과                     → runProducerOnce 결과(target / parse-fail / ...)
 *
 * discover 디폴트 = `generateDiscoveryText`(cwd 부재 = 구조적 비-agentic).
 * reserve/discover 주입 가능 = 단위테스트 (실 claude·실 예산 없이).
 */
export async function runGovernedProducerOnce(
  env: NodeJS.ProcessEnv,
  opts: {
    discover?: DiscoverFn;
    reserve?: (core: string, channelId: string) => boolean;
  } = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const reserve = opts.reserve ?? reserveBudget;
  if (!reserve('producer', 'cadence:producer')) {
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core: 'producer',
      reason: 'producer reserve deny (!kill·예산 상한) — 발굴 skip',
    });
    return 'producer-gated';
  }
  // 발굴 코어 선택: 활성 비-워커 코어 중 하나를 뽑아 그 관점으로 발굴한다.
  // 각 코어가 자기 도메인 렌즈로 다른 제안을 생산 → 피어 다양성 실현.
  // 부재·오류 = 익명 폴백(회귀 0).
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  let producerPerspective = '';
  if (memoRoot) {
    try {
      const ids = listCoreIds(memoRoot);
      const defs = ids
        .map((id) => loadCoreDef(memoRoot, id))
        .filter((d): d is CoreDef => d !== null);
      const producers = defs.filter(
        (d) =>
          d.frontmatter.status === 'active' &&
          (d.frontmatter.kind || '').trim() !== 'worker',
      );
      if (producers.length > 0) {
        const picked = producers[Math.floor(Math.random() * producers.length)];
        const role = (picked.frontmatter.role as string) || '';
        if (role) producerPerspective = `${picked.id} (${role.slice(0, 120)})`;
      }
    } catch {
      /* 폴백 — 기존 익명 발굴 */
    }
  }

  const discover: DiscoverFn =
    opts.discover ??
    (() =>
      // discovery·대화 = Gemini(Vertex 우선→AI Studio 폴백, 사용자 결정
      // KAR-018-Y) / 코드·문서(tier3)만 Claude. Gemini = 페르소나 거부 X·
      // 빠름·JSON 안정·본질적 비-agentic.
      generateAgentText(
        env,
        buildDiscoveryPrompt(
          readMissionText(env),
          gatherDiscoveryContext(env),
          formatPortfolioBlock(
            loadPortfolio(env.MEMO_REPO_PATH?.trim() || ''),
          ),
          producerPerspective,
        ),
        Number(env.AGENT_DISCOVERY_TIMEOUT_MS) || 90_000,
      ));
  return runProducerOnce({ env, discover, dispatch: inboxDispatch(env) });
}

// ── 코어↔코어 대화 producer (KAR-018-Y-1, i3b 복원) ──────────
// 발단 명시 요구("자기들끼리도 대화"). dispatcher 내부 구동(team-room.ts:33
// 의도) — Discord 재인입 X(self-loop 안전 불변). 한 tick 당 *최대 1턴*
// (가장 보수적 anti-noise — i3b "노이즈" 우려의 근본 대응=바운드,제거X).
// 최신 proposal 1건 → 관련 피어 코어가 #team-bus 에서 동료로 1턴 코멘트
// → 사용자가 승인 결정 시 *동료 관점*도 같이 봄(실시간 팔로업 강화).

// ── CoreSpeakFn / setCoreSpeak / loadSkinPersona → agent-cadence-state/skin.ts ──

// 같은 proposal 에 매 tick 재코멘트 방지 (bounded set, ownWebhook 패턴 동형).
const dialogueCommented = new Set<string>();
const DIALOGUE_DEDUPE_CAP = 400;
/** 테스트 전용 — dedupe 상태 리셋 (disarmKill 동형 컨벤션). */
export function resetDialogueDedupe(): void {
  dialogueCommented.clear();
}
function markCommented(id: string): void {
  dialogueCommented.add(id);
  if (dialogueCommented.size > DIALOGUE_DEDUPE_CAP) {
    const first = dialogueCommented.values().next().value;
    if (first !== undefined) dialogueCommented.delete(first);
  }
}

/** proposals.jsonl 마지막 1줄 → {id, kind, domain, text} (best-effort). */
function readLatestProposal(
  memoRoot: string,
): { id: string; domain?: string; text: string; projectId?: string } | null {
  try {
    const p = path.join(memoRoot, '.claude', 'proposals.jsonl');
    const lines = fs.readFileSync(p, 'utf-8').trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (!t) continue;
      const e = JSON.parse(t);
      const pl = e.envelope?.payload ?? {};
      const text = String(pl.title || pl.summary || pl.name || '').trim();
      if (!e.id || !text) continue;
      return {
        id: String(e.id),
        domain:
          typeof pl.domain === 'string' ? pl.domain : undefined,
        // LT-2 projectId = 엔벨로프 최상위 (payload 아님). LT-5 진전
        // 기록(appendProgress)의 대상 프로젝트.
        projectId:
          typeof e.envelope?.projectId === 'string'
            ? e.envelope.projectId
            : undefined,
        text:
          `${text}\n${String(pl.body || pl.derivation || '').slice(0, 400)}`.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export interface CoreDialogueDeps {
  reserve?: (core: string) => boolean;
  cooldown?: (core: string) => boolean;
  generate?: (prompt: string) => Promise<string>;
  speak?: CoreSpeakFn;
  notify?: NotifyFn;
  missionText?: string;
}

/**
 * 코어↔코어 1턴 (governed·bounded). kill·예산·쿨다운·체인깊이·dedupe·
 * PASS 6중 차단 — 명확한 동료 사유 있을 때만 1턴, 아니면 무발화.
 *  · killed/예산              → 'killed' / 'dialogue-gated'
 *  · proposal 없음/중복/무응답 → 'dialogue-idle' / '-dup' / '-none'
 *  · PASS(억지발화 거부)       → 'dialogue-pass'
 *  · 통과                      → 'dialogue:<responder>' (+trace+코어기억)
 */
export async function runCoreDialogueOnce(
  env: NodeJS.ProcessEnv,
  deps: CoreDialogueDeps = {},
): Promise<string> {
  if (isKilled()) return 'killed';
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'no-memo-root';

  const latest = readLatestProposal(memoRoot);
  if (!latest) return 'dialogue-idle';
  if (dialogueCommented.has(latest.id)) return 'dialogue-dup';
  // LT-8 바운드(구조적·restart-safe): 팀이 *이미 수정안으로 만든* 카드는
  // 사람 ✅/❌ 대기 상태지 재숙의 대상 X. 마커 부재였으면 readLatest 가
  // 새 수정 카드를 latest 로 집어 팀이 자기 산출물을 무한 재수정(영구
  // 기관). mission §3 "무한증식 = 바운드가 정답" 정합 — 한 번 수정 →
  // 사람 결정. 상태 무관(파일 마커 기반) = 프로세스 재시작에도 견고.
  if (latest.text.includes('[팀 수정안]')) {
    markCommented(latest.id);
    return 'dialogue-modified-pending';
  }

  const coreIds = listCoreIds(memoRoot);
  const cores = coreIds
    .map((id) => loadCoreDef(memoRoot, id))
    .filter((d): d is CoreDef => d !== null);
  if (cores.length < 2) return 'dialogue-none';

  const speakerCoreId = resolveProposalCore(coreIds, {
    domain: latest.domain,
    text: latest.text,
  });
  const u: PeerUtterance = {
    speakerCoreId,
    kind: 'proposal',
    domain: latest.domain,
    text: latest.text,
  };
  // LT-3: 단일턴 라우터 → 다중턴 숙의. decideDialogueTurn 으로 *피어
  // (도전자)* 1명 결정(기존 라우팅 재사용). 숙의 턴 상한 = chainCap
  // 안에서 ≤4 (envelope 바운드 — 입막음 X·결과로 바운드, ADR).
  const chainCap = Number(env.TEAM_ROOM_CHAIN_CAP) || 6;
  const cap = Math.min(4, Math.max(1, chainCap));
  const turn = decideDialogueTurn(u, cores, { depth: 0, cap });
  if (!turn) {
    markCommented(latest.id); // 응답자 없음 = 매 tick 재평가 X (noise 0)
    return 'dialogue-none';
  }
  const speaker = cores.find((c) => c.id === speakerCoreId);
  if (!cores.find((c) => c.id === turn.responderCoreId)) return 'dialogue-none';
  const speakerLabel = speaker ? coreLabel(speaker) : speakerCoreId;
  const missionText = deps.missionText ?? readMissionText(env);
  const portfolioBlock = formatPortfolioBlock(loadPortfolio(memoRoot));

  const reserve =
    deps.reserve ?? ((c: string) => reserveBudget(c, `dialogue:${c}`));
  const cooldown =
    deps.cooldown ?? ((c: string) => checkAndStampCooldown(c, 'dialogue'));
  const generate =
    deps.generate ??
    ((prompt: string) =>
      // 코어↔코어 대화 = Gemini(Vertex 우선→AI Studio 폴백, KAR-018-Y).
      generateAgentText(
        env,
        prompt,
        Number(env.AGENT_DIALOGUE_TIMEOUT_MS) || 90_000,
      ));
  const speak =
    deps.speak ??
    getCoreSpeak() ??
    (async (cid: string, t: string) => {
      const c = cores.find((x) => x.id === cid);
      (deps.notify ?? defaultNotify(env))(
        `${c ? coreLabel(c) : cid}: ${t}`,
      );
      return true;
    });
  const coreOf = (id: string): CoreDef | undefined =>
    cores.find((c) => c.id === id);

  const state: DeliberationState = {
    speakerCoreId,
    peerCoreId: turn.responderCoreId,
    turns: [] as DeliberationTurnRec[],
    cap,
  };
  let verdict: DeliberationVerdict = 'escalate';
  let verdictReason = '';
  let spokeTurns = 0;

  for (;;) {
    const step = nextDeliberationStep(state);
    if (step.kind === 'done') {
      verdict = step.verdict;
      verdictReason = step.reason;
      break;
    }
    if (isKilled()) {
      verdict = 'escalate';
      verdictReason = 'kill 중단 — 사용자 판단';
      break;
    }
    const sp = step.speakerCoreId;
    const first = state.turns.length === 0;
    // 예산·쿨다운: *첫 턴* deny = 기존 가드 계약 보존(회귀). 이후
    // 턴 deny = 루프 정상 종료(바운드·graceful, 입막음 X).
    if (!reserve(sp)) {
      if (first) {
        appendTrace(env, {
          ts: new Date().toISOString(),
          type: 'budget',
          core: sp,
          reason: `dialogue reserve deny (!kill·예산) — ${latest.id} skip`,
        });
        return 'dialogue-gated';
      }
      verdict = 'escalate';
      verdictReason = `예산 소진(${sp}) — 토론 중단·사용자 판단`;
      break;
    }
    if (!cooldown(sp)) {
      if (first) return 'dialogue-cooldown';
      verdict = 'escalate';
      verdictReason = `쿨다운(${sp}) — 토론 중단`;
      break;
    }
    const spCore = coreOf(sp);
    if (!spCore) break;

    let text = '';
    try {
      text = await generate(
        buildDeliberationPrompt(
          step.phase,
          spCore,
          step.phase === 'refine' ? coreLabel(coreOf(state.peerCoreId)!) : speakerLabel,
          u,
          state,
          missionText,
          portfolioBlock,
          loadSkinPersona(memoRoot, sp),
        ),
      );
    } catch (e) {
      if (first) {
        appendTrace(env, {
          ts: new Date().toISOString(),
          type: 'budget',
          core: sp,
          reason: `dialogue 생성 실패 — ${e instanceof Error ? e.message : e}`,
        });
        return 'dialogue-error';
      }
      verdict = 'escalate';
      verdictReason = '생성 실패 — 토론 중단';
      break;
    }

    const cls = classifyDeliberationReply(text);
    // 첫 challenge 가 빈/PASS = 기존 PASS 계약 보존 (speak X·dedupe).
    if (first && step.phase === 'challenge' && cls === 'empty') {
      markCommented(latest.id);
      return 'dialogue-pass';
    }
    const reply = text.trim().slice(0, 1500);
    state.turns.push({ coreId: sp, phase: step.phase, text: reply });
    await speak(sp, reply);
    spokeTurns += 1;
    appendCoreMemory(memoRoot, sp, {
      session: 'cadence',
      type: step.phase === 'converge' ? 'decision' : 'insight',
      topic: `team-deliberation:${latest.id}`,
      summary: `[${step.phase}] ${speakerLabel} 제안 토론: ${reply.slice(0, 180)}`,
    });
  }

  // 수렴 턴이 결정을 이미 말한 경우 외(bare-agree/escalate/cap) =
  // #team-bus 에 1줄 결정 명시(사람 팔로업 — escalate=사용자 호출).
  const lastPhase = state.turns[state.turns.length - 1]?.phase;
  if (lastPhase !== 'converge') {
    const vk =
      verdict === 'adopt'
        ? '채택 (실질 이의 없음)'
        : verdict === 'adopt-mods'
          ? '수정 채택'
          : verdict === 'reject'
            ? '반려'
            : '⚠ 사용자 판단 필요';
    await speak(
      state.peerCoreId,
      `결정: ${vk} — ${verdictReason} (제안 ${latest.id})`,
    );
  }

  // LT-5 진전 기록: 숙의가 *채택* 으로 수렴 = 그 proposal 의 프로젝트가
  // 실제로 전진. "전진" = progressLog delta(PR 수 X, D3 근본). best-effort.
  //
  // 발굴 LLM 이 엔벨로프 projectId 를 자주 누락(prod 실증 2026-05-18:
  // adopt 났는데 progressLog=[] — diag trace «Witch-Mendokusai» 3턴
  // 채택). deliberation 은 topProject(LT-5 앵커)로 호스팅되므로 그 토론
  // 채택의 전진은 topProject 귀속이 앵커와 정합 — appendProgress 가
  // 엔벨로프 projectId 만 보던 게 앵커와 어긋난 버그였다. 명시 projectId
  // 우선, 누락 시 topProject fallback (날조 0: evidence 에 귀속 출처).
  if (verdict === 'adopt' || verdict === 'adopt-mods') {
    const pid =
      latest.projectId || topProject(loadPortfolio(memoRoot))?.id || '';
    if (pid) {
      appendProgress(memoRoot, {
        projectId: pid,
        delta: `숙의 ${verdict === 'adopt-mods' ? '수정 ' : ''}채택: ${latest.text
          .split('\n')[0]
          .slice(0, 120)}`,
        evidence: `deliberation ${state.turns.length}턴 [${latest.id}]${
          latest.projectId ? '' : ' · topProject 귀속(projectId 누락)'
        }`,
      });
    }
  }

  // LT-8: 숙의가 *수정 채택*(adopt-mods)으로 수렴 = 합의 수정안을 *새*
  // 제안 카드로 실체화. 거버넌스 결정(2026-05-18, AskUserQuestion): 팀
  // verdict 는 사람 ✅/❌ 를 *대체 X* — 수정안을 새 카드로 올려 사장님이
  // 결정. 이전엔 verdict 가 #team-bus 1줄+trace 만 → 원 카드 영속 "승인
  // 대기"(D3 미세 재발: "수정 채택했는데 카드 변화 0"). substrate 재사용
  // (publishEnvelope, 평행 파이프 0). best-effort — 실패가 숙의 비차단.
  if (verdict === 'adopt-mods') {
    const orig = readInboxProposals(env).find((e) => e.id === latest.id);
    const convergeText =
      [...state.turns].reverse().find((t) => t.phase === 'converge')?.text ||
      verdictReason;
    // modNote = CONVERGE 의 *실제* 출력에서 결정 라벨만 제거(날조 0,
    // 새 내용 발명 X). "결정: 수정 채택 — <무엇>" → "<무엇>".
    const modNote = convergeText
      .split(/\r?\n/)[0]
      .replace(/^\s*결정\s*[:：]?\s*/i, '')
      .replace(
        /^\s*(수정\s*채택|보완\s*채택|adopt-?mods)\s*[—\-:：]?\s*/i,
        '',
      )
      .trim();
    const modified = orig
      ? buildModifiedEnvelope(orig.envelope, modNote)
      : null;
    if (modified) {
      const r = await publishEnvelope(
        {
          env,
          discover: async () => '',
          dispatch: inboxDispatch(env),
          notify: deps.notify,
        },
        modified,
      );
      await speak(
        state.peerCoreId,
        r === 'duplicate'
          ? `(수정안이 이미 인박스 — 재게시 안 함. 원 제안 ${latest.id} 는 오너 ✅/❌)`
          : `↳ 팀 수정안을 새 카드로 올렸어요 — 오너 확인 부탁 (원 제안 ${latest.id} 대체)`,
      );
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'budget',
        core: state.peerCoreId,
        reason: `adopt-mods → 수정안 새 카드 publish=${r} (원 ${latest.id})`,
      });
    }
  }

  // LT-10 핵심: 숙의 verdict 를 내구 원장에 기록 (순수·client 0).
  // client 쥔 reconcileProposalCards(main.ts)가 이걸 소비해 *원본
  // 제안 카드* 에 반영 — 그동안 빠졌던 substrate↔Discord 합성 rung.
  // adopt-mods 도 기록(원 카드는 🟠 supersede 로, 새 카드는 LT-8).
  appendTeamVerdict(env, latest.id, verdict, verdictReason);

  appendTrace(env, {
    ts: new Date().toISOString(),
    type: 'drift',
    core: state.peerCoreId,
    reason: `#team-bus 숙의 ${state.turns.length}턴(${verdict}) — ${verdictReason} [${latest.id}]`,
  });
  markCommented(latest.id);
  if (spokeTurns === 0) return 'dialogue-none';
  return `deliberation:${state.turns.length}:${verdict}`;
}

// -- worker --> agent-cadence-worker.ts (re-export 위 참조) --


/**
 * 대시보드 갱신 헬퍼 (KAR-077) — cadence tick·workerTick 양쪽서 호출
 * (≤5분 신선도). 큐 = code-worker repo 라우팅(KAR-075) claimable.
 * 전부 비-fatal(틱 비차단, process.md 백그라운드 정합).
 */
async function refreshDashboard(
  env: NodeJS.ProcessEnv,
  memoRoot: string,
  tickSummary: string,
): Promise<void> {
  try {
    const nowKst = (ms: number): string =>
      new Date(ms + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
    const qspec: [string, string, string][] = [
      ['KL', 'Mascari4615.github.io', 'KL→io'],
      ['WM', 'WitchMendokusai', 'WM'],
      ['KAR', 'Mascari4615.github.io', 'KAR→io'],
    ];
    const queue = memoRoot
      ? qspec.map(([dom, repo, label]) => {
          try {
            const out = runMemoScript(memoRoot, 'task-queue.mjs', [
              '--json',
              '--domain',
              dom,
              '--repo',
              repo,
            ]).out;
            return { repo: label, count: JSON.parse(out).count ?? 0 };
          } catch {
            return { repo: label, count: 0 };
          }
        })
      : [];
    await updateDashboard(env, {
      atKST: nowKst(Date.now()),
      lastTickKST: nowKst(Date.now()),
      tickSummary,
      workers: parseWorkerStates(getLastWorkerCsv()),
      queue,
      evolution: summarizeRecentEvolutionEvents(env),
      alive: true,
    });
  } catch {
    /* 대시보드 실패 = 비차단 */
  }
}

/** objectives.md 읽어 parseCadenceWork (thin I/O wrapper). */
export function pickWorkFromObjectives(memoRoot: string): Tier3Request | null {
  try {
    const p = path.join(memoRoot, '.claude', 'objectives.md');
    if (!fs.existsSync(p)) return null;
    return parseCadenceWork(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** 한 tick (순수 가깝게 — deps·pick 주입): kill → pick → spawnTier3. */
export async function runCadenceOnce(
  deps: Tier3Deps,
  pick: PickWork,
): Promise<string> {
  if (isKilled()) return 'killed';
  const work = pick();
  if (!work) return 'idle';
  const res = await spawnTier3(work, deps);
  return res.status;
}

// -- summarizeTick --> agent-cadence-ops.ts (re-export 위 참조) --

let cadenceTimer: ReturnType<typeof setTimeout> | null = null;
let workerTimer: ReturnType<typeof setTimeout> | null = null;
// KAR-077: 대시보드 = 팀 작업주기와 분리된 경량 독립 타이머(스캔3+edit2,
// LLM·워커 X). 현황 "바로바로" = 짧은 주기로 자체 갱신(에이전트틱 불요).
let dashboardTimer: ReturnType<typeof setTimeout> | null = null;
/** 직전 cadence tick 요약 — 대시보드 독립 타이머가 마지막 활동 표기용. */
let lastTickSummary = '';

/**
 * 자율 cadence 시작 — **default ON**. `AGENT_CADENCE_ENABLED=0` 으로 명시 시만 OFF.
 * kill 파일(`<memo>/.claude/agent-kill`) 존재 시 tick skip (크로스-프로세스 !kill).
 */
/**
 * 한 cadence tick 1회 — 타이머·수동 슬래시 공용 (KAR-018-Y, 사용자
 * "수동 호출 방법"). deps/gov 내부 구성 = standalone 호출 가능. *라이브
 * 봇 프로세스*에서 호출 시 setTeamBusNotify/setCoreSpeak 가 전역 wired
 * 라 #team-bus 실제 게시(테스트 위해 interval 줄이는 churn 제거 — ops
 * 인터페이스 비-GUI). governed→producer→inbox→worker→dialogue→heartbeat
 * = startAgentCadence 타이머와 동일 시퀀스(평행 정의 0).

// -- Retro / QC / Surgery / Idle Chatter --> agent-cadence-ops.ts (re-export 위 참조) --


/**
 * 이벤트 전 memo freshness 가드 (TASK-KAR-MEMOSYNC part4).
 * 워커가 작업을 *픽하기 직전* "마지막 memo-sync 후 N초 경과면 1회 sync" —
 * 워커가 항상 fresh 정본(TASK 큐·core·rules)으로 픽하도록. 최소 침습 seam:
 * memo-sync 서비스가 미설정/비활성이면 핸들 null → graceful no-op.
 * **기존 tick 비차단·best-effort** — sync 실패해도 워커 tick 은 계속(픽이
 * 약간 stale 할 뿐, 동결은 part1 ops alert 가 별도로 시끄럽게 알림).
 * 임계 = AGENT_MEMOSYNC_FRESH_MS (기본 5분 — 워커 타이머 기본 주기와 동일,
 * "픽 직전 메모는 한 사이클 이내 신선" 보장하면서 매 픽 fetch 노이즈 회피).
 */
async function ensureMemoFreshBeforeWork(env: NodeJS.ProcessEnv): Promise<void> {
  const handle = getActiveMemoSyncHandle();
  if (!handle) return; // 미설정/비활성 = graceful no-op
  const maxAgeMs = Number(env.AGENT_MEMOSYNC_FRESH_MS) || 5 * 60_000;
  try {
    await handle.ensureFresh(maxAgeMs);
  } catch {
    /* best-effort — sync 실패는 워커 tick 비차단 (part1 ops alert 가 별도 표면화) */
  }
}

export async function runCadenceTickOnce(
  env: NodeJS.ProcessEnv,
  opts: {
    includeWorker?: boolean;
    /**
     * 합성 검증 seam (TASK-KAR-018-LT). 서브런들은 각자 deps 주입을
     * *노출* 하나(runGovernedProducerOnce/runCoreDialogueOnce) tick
     * orchestrator 가 안 thread 해 합성이 헤드리스 검증 불가 →
     * behavior-verify 가 HITL prod-관측으로 강제(영영 안 닫힘). 옵셔널
     * 주입(default undefined = prod 무변경)로 producer→dialogue
     * 핸드오프를 LLM 경계만 stub 하고 결정적 E2E 가능케 한다.
     */
    producerOpts?: Parameters<typeof runGovernedProducerOnce>[1];
    dialogueDeps?: Parameters<typeof runCoreDialogueOnce>[1];
    qualityCheckDeps?: QualityCheckDeps;
    selfSurgeryDeps?: SelfSurgeryDeps;
  } = {},
): Promise<string> {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  const killFile = memoRoot
    ? path.join(memoRoot, '.claude', 'agent-kill')
    : '';
  const deps = buildTier3Deps(env);
  const gov = buildGovernCadenceDeps(env);
  if (killFile && fs.existsSync(killFile)) armKill();
  let r = await runGovernedCadenceOnce(deps, gov, () => {
    const p = path.join(memoRoot, '.claude', 'objectives.md');
    if (!memoRoot || !fs.existsSync(p)) return null;
    try {
      return parseCadenceObjective(fs.readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  });
  if (r === 'idle' && memoRoot && !isKilled()) {
    r = `idle→producer:${await runGovernedProducerOnce(env, opts.producerOpts)}`;
  }
  if (memoRoot && !isKilled()) {
    // autoReady: task kind 발굴 → status:ready 직행 (미션 §2.3 일반 코드 자율).
    // objective/agent kind 는 runInboxConsumerOnce 내부에서 기존 사람 승인 게이트 유지.
    const mat = await runInboxConsumerOnce(env, { autoReady: true });
    if (mat > 0) r = `${r}+consumed:${mat}`;
  }
  // LT-11 자가증강 *닫는* 루프: 팀 채택→materialize 된 draft 코어를
  // 구조검증+비충돌 PASS 시 자율 active 승격, 가동 후 적합도 퇴행 시
  // 자동 draft 원복. 사람=!kill·비전만(2026-05-19 "완전 자율+측정
  // 게이트"). best-effort·비차단(자가증강 실패가 tick 비차단).
  if (memoRoot && !isKilled()) {
    try {
      const pro = runCorePromotionOnce(env, { notify: gov.notify });
      if (pro.length) r = `${r}+promoted:${pro.length}`;
      const rev = runCorePromotionRevertOnce(env, { notify: gov.notify });
      if (rev.length) r = `${r}+core-reverted:${rev.length}`;
    } catch {
      /* 자가증강 실패 = tick 비차단 (가용성 우선) */
    }
  }
  // 워커 소화 = *별 cadence*(KAR-018-Y, 사용자: 제안 30분 OK, 소화는
  // 더 빨라야 — 작업 없으면 5분 트리거). 자동 main 틱은 includeWorker
  // false(워커 전용 타이머가 5분 주기). 수동 /관리자 에이전트틱 = 기본
  // true(전체 1틱). 작업 중이면 await-after-setTimeout 라 안 쌓임.
  if (opts.includeWorker !== false && memoRoot && !isKilled()) {
    // KAR-MEMOSYNC part4: 워커 픽 *직전* memo freshness 가드 (pre-tick
    // staleness — 워커가 항상 fresh 정본으로 픽). reset 이 worker spawn 과
    // 시간 분리(픽 *전* 직렬 await) → 봇 프로세스 내 read-during-reset race
    // 최소화. best-effort, 비차단.
    await ensureMemoFreshBeforeWork(env);
    const w = await runWorkerConsumerOnce(env);
    if (w && w !== 'no-workers' && w !== 'no-memo-root') {
      r = `${r}+worker:${w}`;
    }
  }
  if (memoRoot && !isKilled()) {
    const d = await runCoreDialogueOnce(env, opts.dialogueDeps);
    if (
      d &&
      !['dialogue-idle', 'dialogue-dup', 'dialogue-none', 'no-memo-root'].includes(
        d,
      )
    ) {
      r = `${r}+${d}`;
    }
  }
  if (memoRoot && !isKilled()) {
    try {
      const ch = await runIdleChatterOnce(env);
      if (ch.startsWith('chatter:')) r = `${r}+${ch}`;
    } catch {
      /* chatter 실패 = tick 비차단 */
    }
  }
  // LT-7 retro 밸브 — gated(6h, 영속) best-effort. 게이트 미충족=무음.
  if (memoRoot && !isKilled()) {
    try {
      const rt = await runRetroOnce(env);
      if (rt.startsWith('retro:')) r = `${r}+${rt}`;
    } catch {
      /* retro 실패 = tick 비차단 */
    }
  }
  // LT-QC 품질 체크 — gated(24h, 영속) best-effort. 사용자 관측 강제.
  if (memoRoot && !isKilled()) {
    try {
      const qc = await runQualityCheckOnce(env, opts.qualityCheckDeps);
      if (qc === 'qc:sent') r = `${r}+${qc}`;
    } catch {
      /* 품질 체크 실패 = tick 비차단 */
    }
  }
  // 기둥4 자기수술 — gated(12h) + critical 이슈 한정. LLM 자율 진단 → task seed / escalate.
  if (memoRoot && !isKilled()) {
    try {
      const sr = await runSelfSurgeryOnce(env, opts.selfSurgeryDeps);
      if (sr.startsWith('surgery:seed:') || sr === 'surgery:escalate') r = `${r}+${sr}`;
    } catch {
      /* surgery 실패 = tick 비차단 */
    }
  }
  if (memoRoot && !isKilled()) {
    try {
      const evo = runEvolutionObservatoryOnce(env, { notify: gov.notify });
      if (evo.appended > 0) r = `${r}+evolution:${evo.appended}`;
    } catch {
      /* evolution observatory 실패 = tick 비차단 */
    }
  }
  console.log(`[AgentCadence] tick -> ${r}`);
  lastTickSummary = r; // KAR-077: 독립 대시보드 타이머가 최신 활동 표기
  try {
    // LT-5: 포트폴리오 앵커 = 최대 weight 프로젝트·현 목표. 하트비트가
    // "한 바퀴"(무상태) → "프로젝트 X 목표 Y 전진"(D2 가시 완결).
    let anchor = '';
    try {
      const tp = topProject(loadPortfolio(memoRoot));
      if (tp) {
        anchor = tp.currentObjective?.text
          ? `📌 «${tp.title}» 목표: ${tp.currentObjective.text}`
          : `📌 «${tp.title}»`;
      }
    } catch {
      /* 앵커 실패 = 기존 prefix 폴백 */
    }
    const hb = summarizeTick(r, anchor);
    if (hb) gov.notify(hb);
  } catch {
    /* 하트비트 실패 = tick 비차단 */
  }
  // TASK-KAR-077: 현황 대시보드 갱신 (refreshDashboard = workerTick 과 공용).
  await refreshDashboard(env, memoRoot, r);
  return r;
}

/** 기본값 ± fraction 무작위 오프셋 — 인간적 불규칙성 부여.
 * fraction=0.4 → ±20% (예: 15분 → 12~18분), 워커는 0.2 권장. */
function jitter(base: number, fraction = 0.4): number {
  return Math.round(base + (Math.random() - 0.5) * base * fraction);
}

export function startAgentCadence(env: NodeJS.ProcessEnv): void {
  const enabled = (env.AGENT_CADENCE_ENABLED?.trim() !== '0');
  if (!enabled) {
    console.log(
      '[AgentCadence] OFF (AGENT_CADENCE_ENABLED=0) — 이벤트 경로만 live.',
    );
    return;
  }
  // 제안 발굴(producer)·대화 = 30분 OK / 워커 소화(consumer) = 더 빨라야
  // (사용자 KAR-018-Y). 분리 타이머: main(발굴·inbox·대화·하트비트,
  // AGENT_CADENCE_INTERVAL_MS) + worker(runWorkerConsumerOnce 전용,
  // AGENT_WORKER_INTERVAL_MS 기본 5분). 둘 다 await-후-setTimeout =
  // 자기 작업 중이면 다음 틱 안 쌓임(겹침 0).
  const intervalMs = Number(env.AGENT_CADENCE_INTERVAL_MS) || 15 * 60_000;
  const workerMs = Number(env.AGENT_WORKER_INTERVAL_MS) || 5 * 60_000;
  const tick = async () => {
    try {
      await runCadenceTickOnce(env, { includeWorker: false });
    } catch (e) {
      console.error(
        '[AgentCadence] tick 오류:',
        e instanceof Error ? e.message : e,
      );
    }
    cadenceTimer = setTimeout(tick, jitter(intervalMs));
  };
  const workerTick = async () => {
    try {
      // KAR-MEMOSYNC part4: 워커 픽 직전 memo freshness 가드 (pre-tick
      // staleness — 전용 워커 타이머 경로. runCadenceTickOnce 와 동일 seam).
      await ensureMemoFreshBeforeWork(env);
      const w = await runWorkerConsumerOnce(env);
      if (w && w !== 'no-workers' && w !== 'no-memo-root') {
        console.log(`[AgentCadence] worker -> ${w}`);
      }
      // KAR-077: 워커 timer(≤5분)서도 대시보드 갱신 → 워커 상태 변화가
      // 15분 cadence 안 기다리고 곧 반영(신선도).
      await refreshDashboard(
        env,
        env.MEMO_REPO_PATH?.trim() || '',
        `worker:${w}`,
      );
    } catch (e) {
      console.error(
        '[AgentCadence] worker 오류:',
        e instanceof Error ? e.message : e,
      );
    }
    workerTimer = setTimeout(workerTick, jitter(workerMs, 0.2));
  };
  // KAR-077: 대시보드 독립 타이머 — 팀 작업주기 무관, 짧은 주기 자체 갱신.
  // 부팅 직후 1회 즉시(재기동→수초 내 현황, 5~15분 대기 X) + 이후 주기.
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  const dashMs = Number(env.AGENT_DASHBOARD_INTERVAL_MS) || 120_000;
  const dashTick = async (): Promise<void> => {
    if (!isKilled()) {
      await refreshDashboard(env, memoRoot, lastTickSummary || '(대기)');
    }
    dashboardTimer = setTimeout(dashTick, dashMs);
  };
  cadenceTimer = setTimeout(tick, intervalMs);
  workerTimer = setTimeout(workerTick, workerMs);
  void refreshDashboard(env, memoRoot, lastTickSummary || '(부팅)'); // 즉시
  dashboardTimer = setTimeout(dashTick, dashMs);
  console.warn(
    `[AgentCadence] ON (발굴 ${intervalMs}ms · 워커 ${workerMs}ms · 대시보드 ${dashMs}ms 분리, 부팅 즉시 1회) — sub-D 게이트 활성.`,
  );
}

export function stopAgentCadence(): void {
  if (cadenceTimer) {
    clearTimeout(cadenceTimer);
    cadenceTimer = null;
  }
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  if (dashboardTimer) {
    clearTimeout(dashboardTimer);
    dashboardTimer = null;
  }
}
