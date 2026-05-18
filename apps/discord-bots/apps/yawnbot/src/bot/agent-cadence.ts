/**
 * agent-cadence — ⑦ 자율 구동 cadence 어댑터 (KAR-018-B slice-3, B-3).
 *
 * substrate⊥어댑터(parent ⓪'): 본 파일 = *어댑터* 층 — substrate(순수
 * dispatcher) 에 spawn primitive(generateAssistantText)·예산훅(team-room)·
 * 머신(KAR_MACHINE)을 주입(DI). dispatcher.ts 는 Discord/karmolab-ai 무관 유지.
 *
 * ⚠ 자율 cadence = **default OFF** (`AGENT_CADENCE_ENABLED=1` 일 때만).
 * sub-D 예산엔진 미구현 → reserve=default allow → 자율 spawn 폭주는 parent
 * ④/Freysa 위반. 이벤트 경로(사람이 디스코드로 말 검 → 응답)는 sub-A
 * assistant-handler 로 *항상 live* (본 cadence 와 무관). sub-D 후 ON.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { generateAssistantText, generateClaudeCliText } from 'karmolab-ai/node';
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
import { reserveBudget, checkAndStampCooldown } from './team-room';
import {
  SessionRegistry,
  spawnTier3,
  type Tier3Deps,
  type Tier3Request,
  type Tier3Result,
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
  type DiscoverFn,
} from './proposal-adapter';
import {
  listCoreIds,
  loadCoreDef,
  coreLabel,
  resolveProposalCore,
  appendCoreMemory,
  type CoreDef,
} from '../services/agent-core';
import {
  decideDialogueTurn,
  buildDialoguePrompt,
  isDialoguePass,
  type PeerUtterance,
} from './agent-dialogue';

// ── kill switch (③ 사람·!kill 최우선 인터럽, B-3) — 순수(테스트가능) ──
let killed = false;
export function armKill(): void {
  killed = true;
}
export function disarmKill(): void {
  killed = false;
}
export function isKilled(): boolean {
  return killed;
}

// 프로세스 1개 = 단일 레지스트리 (per-agent 동시1, B-2).
const registry = new SessionRegistry();

/**
 * 에이전트 대화·발굴 Gemini 호출 — **Vertex 우선, 실패 시 AI Studio 폴백**
 * (사용자 결정 KAR-018-Y, 2026-05-17). prod Vertex creds 미설정/실패 시
 * GEMINI_API_KEY(AI Studio, prod set)로 자동 폴백 → 즉시 unblock + Vertex
 * 의도 유지. 둘 다 실패면 throw(caller graceful — 발굴 실패 trace).
 * ASSISTANT_AI_PROVIDER=gemini 고정(claude-cli 아님 — 코드/문서 tier3 만
 * Claude). 코어↔코어 대화·⑦' 발굴 공통(중복 정의 0).
 */
async function generateAgentText(
  env: NodeJS.ProcessEnv,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  // surface 는 generateAssistantText 옵션 아님 — env(KARMOLAB_AI_SURFACE)
  // 로만 제어(parseGenerativeSurfaceFromEnv). Vertex 강제 → 실패 시
  // aiStudio 강제 env 로 폴백.
  const base = { ...env, ASSISTANT_AI_PROVIDER: 'gemini' };
  try {
    const r = await generateAssistantText(
      { ...base, KARMOLAB_AI_SURFACE: 'vertex' },
      prompt,
      { timeoutMs },
    );
    return r.text;
  } catch {
    const r = await generateAssistantText(
      { ...base, KARMOLAB_AI_SURFACE: 'aiStudio' },
      prompt,
      { timeoutMs },
    );
    return r.text;
  }
}

/** Tier3Deps 충전 — 어댑터가 substrate dispatcher 에 주입하는 DI. */
export function buildTier3Deps(env: NodeJS.ProcessEnv): Tier3Deps {
  return {
    thisMachine: env.KAR_MACHINE?.trim() || 'any',
    reserve: (core) => reserveBudget(core, `cadence:${core}`),
    run: async (req: Tier3Request) => {
      const timeoutMs = Number(env.AGENT_TIER3_TIMEOUT_MS) || 30 * 60_000;
      // 워커 tier3 = req.repoCwd(격리 worktree) → *agentic* claude
      // (도구 허용 + --dangerously-skip-permissions, generateClaudeCliText
      // cwd 모드). 실제 코드·git·Draft PR 수행. KAR-018-Y 근본:
      // 종전 비-agentic 경로는 텍스트만 생성·폐기 = 산출 0(theater).
      if (req.repoCwd) {
        return await generateClaudeCliText({
          prompt: req.prompt,
          timeoutMs,
          cwd: req.repoCwd,
          oneShot: true, // 워커 = 무상태 단발(공유세션 충돌 0)
        });
      }
      // producer/cadence tier3 = 비-agentic 텍스트(기존 동작 불변).
      const { text } = await generateAssistantText(
        { ...env, ASSISTANT_AI_PROVIDER: 'claude-cli' },
        req.prompt,
        { timeoutMs },
      );
      return text;
    },
    registry,
  };
}

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
): string {
  const ctx = contextText.trim();
  return [
    '너는 karmoddrine 에이전트 팀의 자율 cadence 생산자다. 도구·파일',
    '접근 없이 *아래 제공된 텍스트만으로* 단일턴 추론한다.',
    '파일을 읽으려 시도하지 마라 (불가 — 빈 출력만 낭비).',
    '',
    '[미션 헌장 — 정렬 anchor (§1 공통목표 / §3 비목표 자가검사용)]',
    missionText.trim(),
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

  return parts.join('\n\n').slice(0, 4000);
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
  const discover: DiscoverFn =
    opts.discover ??
    (() =>
      // discovery·대화 = Gemini(Vertex 우선→AI Studio 폴백, 사용자 결정
      // KAR-018-Y) / 코드·문서(tier3)만 Claude. Gemini = 페르소나 거부 X·
      // 빠름·JSON 안정·본질적 비-agentic.
      generateAgentText(
        env,
        buildDiscoveryPrompt(readMissionText(env), gatherDiscoveryContext(env)),
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

/** 응답 코어가 #team-bus 에 자기 정체로 발화 (main.ts 가 sendAsSkin 주입). */
export type CoreSpeakFn = (coreId: string, text: string) => Promise<boolean>;
let coreSpeak: CoreSpeakFn | null = null;
export function setCoreSpeak(fn: CoreSpeakFn): void {
  coreSpeak = fn;
}

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
): { id: string; domain?: string; text: string } | null {
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
  const cap = Number(env.TEAM_ROOM_CHAIN_CAP) || 6;
  const turn = decideDialogueTurn(u, cores, { depth: 0, cap });
  if (!turn) {
    markCommented(latest.id); // 응답자 없음 = 매 tick 재평가 X (noise 0)
    return 'dialogue-none';
  }

  const reserve =
    deps.reserve ?? ((c: string) => reserveBudget(c, `dialogue:${c}`));
  if (!reserve(turn.responderCoreId)) {
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core: turn.responderCoreId,
      reason: `dialogue reserve deny (!kill·예산) — ${latest.id} skip`,
    });
    return 'dialogue-gated';
  }
  const cooldown =
    deps.cooldown ??
    ((c: string) => checkAndStampCooldown(c, 'dialogue'));
  if (!cooldown(turn.responderCoreId)) return 'dialogue-cooldown';

  const responder = cores.find((c) => c.id === turn.responderCoreId);
  const speaker = cores.find((c) => c.id === speakerCoreId);
  if (!responder) return 'dialogue-none';
  const speakerLabel = speaker ? coreLabel(speaker) : speakerCoreId;
  const missionText = deps.missionText ?? readMissionText(env);

  const generate =
    deps.generate ??
    ((prompt: string) =>
      // 코어↔코어 대화 = Gemini(Vertex 우선→AI Studio 폴백, 사용자 결정
      // KAR-018-Y). claude-cli 페르소나 거부 prod 실증 → Gemini.
      generateAgentText(
        env,
        prompt,
        Number(env.AGENT_DIALOGUE_TIMEOUT_MS) || 90_000,
      ));

  let text = '';
  try {
    text = await generate(
      buildDialoguePrompt(responder, speakerLabel, u, missionText),
    );
  } catch (e) {
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core: turn.responderCoreId,
      reason: `dialogue 생성 실패 — ${e instanceof Error ? e.message : e}`,
    });
    return 'dialogue-error';
  }

  if (isDialoguePass(text)) {
    markCommented(latest.id);
    return 'dialogue-pass';
  }

  const reply = text.trim().slice(0, 1500);
  const speak =
    deps.speak ??
    coreSpeak ??
    (async (cid: string, t: string) => {
      (deps.notify ?? defaultNotify(env))(`${coreLabel(responder)}: ${t}`);
      void cid;
      return true;
    });
  await speak(turn.responderCoreId, reply);

  appendTrace(env, {
    ts: new Date().toISOString(),
    type: 'drift',
    core: turn.responderCoreId,
    reason: `#team-bus 코어대화: ${turn.reason} → "${reply.slice(0, 80)}"`,
  });
  appendCoreMemory(memoRoot, turn.responderCoreId, {
    session: 'cadence',
    type: 'insight',
    topic: 'team-dialogue',
    summary: `${speakerLabel} 제안(${latest.id})에 동료로 응답: ${reply.slice(0, 200)}`,
  });
  markCommented(latest.id);
  return `dialogue:${turn.responderCoreId}`;
}

// ── ⑦(2) 소비자 워커 cadence (KAR-018-X, slot A) ────────────
// 생산자(atlas/echo=⑦' 발굴→제안)의 *짝*. 도메인별 전용 워커 코어가
// 자기 prefix 의 ready/seed TASK 를 pull→claim→tier3 실행→#team-bus
// 자기목소리 보고. 큐 스캔·claim = memo/scripts 단일 정본 모듈 shell
// (평행 정의 0, autopilot 과 동일 정의). E R-4-i3 계약: agent-cadence.ts
// = A 소유(E 미접촉 확정) / 워커 = 채널 바인딩 불요(loadCoreDef 정체
// 회수, cadence 직접 구동) / 워커 core.md = 팩토리 머터리얼라이즈(i3a,
// status:draft) → 사람이 status:active 로 가동 승인해야 본 cadence 가 구동.

export interface WorkerCore {
  coreId: string;
  /** 담당 TASK prefix (frontmatter domain, 대문자). */
  domain: string;
  /** 머신 어피니티 (frontmatter machine, 미지정 any). */
  machine: string;
  /** #team-bus 표시 (emoji displayName). */
  label: string;
}

/**
 * 워커 코어 선별 (순수 — 테스트가능). 워커 = frontmatter `kind: worker`
 * + `status: active`(사람 가동 승인) + `domain:` 존재. 생산자(atlas/echo
 * = kind 미설정) / draft(미승인) 워커는 제외 = inert (계약 불변식).
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
    });
  }
  return out;
}

/**
 * 워커 tier3 지시 프롬프트 (순수). autopilot 안전 룰셋 그대로 — 자기
 * worktree·Draft PR only·merge/master/force 금지·다른 세션 영역 미접촉.
 * 한 TASK 단위(bounded). spawn claude(tier3)=agentic 풀세션이라 파일
 * 접근 가능 → 발굴 프롬프트(비-agentic)와 달리 도구 사용 명시.
 */
export function buildWorkerPrompt(
  task: { id: string; file: string },
  missionText: string,
  specText?: string,
  worktreeBranch?: string,
  decisionsText?: string,
): string {
  // KAR-018-Y: agentic 워커 cwd = *도메인 코드 repo* worktree(github.io
  // 등)라 memo 스펙 경로(memo\tasks\..)가 거기 없음 → claude 가 "스펙
  // 못 찾음" 정직 보고하고 막혔음(prod 23:35 KST). 근본 = 봇이 memo
  // 스펙 *내용* 을 프롬프트에 임베드(경로/cross-repo FS 의존 0).
  const specBlock = specText
    ? [
        `[TASK 스펙 — 아래 *내용* 이 정본. memo 는 cwd 밖이라 경로로 못 읽음]`,
        '<<<SPEC',
        specText.trim().slice(0, 12000),
        'SPEC',
        '',
      ]
    : [`[스펙 파일] ${task.file} (내용 임베드 실패 — cwd 내 단서로 진단)`, ''];
  // worktreeBranch 지정 = 봇이 *이미* 격리 worktree(=cwd) 를 그 브랜치로
  // 생성해 줌 → claude 는 worktree 새로 만들지 X, 여기서 작업·push·PR.
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
    '요약에 명시(추측 진행 X).',
  ].join('\n');
}

/** 워커 코어 목록 로드 (default — listCoreIds+loadCoreDef→selectWorkerCores). */
function defaultListWorkers(memoRoot: string): WorkerCore[] {
  return selectWorkerCores(
    listCoreIds(memoRoot).map((id) => loadCoreDef(memoRoot, id)),
  );
}

/** memo/scripts/<script>.mjs shell 1회 (단일 정본 호출, best-effort). */
function runMemoScript(
  memoRoot: string,
  script: string,
  args: string[],
): { code: number; out: string } {
  try {
    const p = path.join(memoRoot, 'scripts', script);
    const out = execSync(
      `node "${p}" ${args.join(' ')} --root "${memoRoot}"`,
      { timeout: 20_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, out: err.stdout ?? '' };
  }
}

/**
 * 워커 격리 worktree 셋업 (KAR-018-Y). 도메인 repo HEAD 에서 feature
 * 브랜치 worktree add → 그 경로 반환(=agentic claude cwd). main worktree
 * HEAD swap 0(별 경로). 실패/미지원 = `{error}` (caller 가 trace+#team-bus
 * 에 surface → silent 폴백 X, 다음 틱이 원인 자가표면화. KAR-018-Y 계측).
 * fetch X(결정적·경량 — 최신 정본은 claude 가 프롬프트 지시대로 git fetch).
 */
type WorktreeSetup =
  | { cwd: string; repoRoot: string; wtDir: string; branch: string }
  | { error: string };

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
  const now = new Date();
  const branch = workerBranchName(taskId, now);
  const wtDir = workerWorktreeDir(umbrella, coreId, taskId, now);
  try {
    // KAR-018-Y: 봇=NT AUTHORITY\SYSTEM, 사용자 클론 repo=Mois2\masca →
    // git "detected dubious ownership" 거부(WM post-clone prod 07:37 KST
    // 실증). deploy 는 memo/github.io 만 safe.directory 등록, 신규 클론
    // 누락. worktree add 전 멱등 등록 = 전 도메인 repo 자가복원(git 가
    // 중복 dedupe, 이미 등록=무해).
    try {
      execSync(
        `git config --global --add safe.directory "${repo.repoRoot}"`,
        { timeout: 15_000, stdio: 'ignore' },
      );
    } catch {
      /* best-effort — 실패해도 worktree add 가 사유 surface */
    }
    execSync(
      `git -C "${repo.repoRoot}" worktree add -b "${branch}" "${wtDir}" HEAD`,
      { timeout: 60_000, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return { cwd: wtDir, repoRoot: repo.repoRoot, wtDir, branch };
  } catch (e: unknown) {
    const x = e as { stderr?: Buffer; message?: string };
    const raw = (x.stderr?.toString() || x.message || String(e)).trim();
    return { error: `worktree-add: ${raw.replace(/\s+/g, ' ').slice(0, 280)}` };
  }
}

/**
 * 브랜치가 origin 에 실제 push 됐나 (KAR-018-Y claim-confirm 근본).
 * agentic claude 가 status=done 이어도 "스펙없음/blocked" 면 산출 0 →
 * 종전엔 claim 영구잔존(6h)→큐 드레인. 이제 *origin 브랜치 실재* 로만
 * claim 확정, 미푸시=release(재시도 가능). 실패/불명=false(보수=release).
 */
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

/** 워커 worktree 정리 (best-effort — 브랜치는 remote 에 push 됨, 보존). */
function cleanupWorkerWorktree(repoRoot: string, wtDir: string): void {
  try {
    execSync(`git -C "${repoRoot}" worktree remove --force "${wtDir}"`, {
      timeout: 30_000,
      stdio: 'ignore',
    });
  } catch {
    /* leak 방지 best-effort */
  }
  try {
    execSync(`git -C "${repoRoot}" worktree prune`, {
      timeout: 15_000,
      stdio: 'ignore',
    });
  } catch {
    /* noop */
  }
}

export interface WorkerConsumerDeps {
  listWorkers?: (memoRoot: string) => WorkerCore[];
  scan?: (domain: string, machine: string) => { id: string; file: string }[];
  claim?: (id: string, by: string) => boolean;
  release?: (id: string, by: string) => void;
  spawn?: (req: Tier3Request) => Promise<Tier3Result>;
  /** claim-confirm seam (KAR-018-Y): origin 브랜치 실재 여부. 기본
   * = branchPushedToOrigin(git ls-remote). 테스트 결정성 위해 주입. */
  branchPushed?: (repoRoot: string, branch: string) => boolean;
  /** 격리 worktree 셋업 seam (KAR-018-Y). 기본 = setupWorkerWorktree
   * (실 git). 테스트는 fake 주입(실 repo 무오염·결정성). */
  setupWorktree?: (
    memoRoot: string,
    coreId: string,
    taskId: string,
  ) => WorktreeSetup;
  notify?: NotifyFn;
  /** 워커도 Atlas/Echo 처럼 스킨 정체로 발화 (KAR-018-Y, 사용자
   * "말 좀 파게 + 스킨"). 기본 = coreSpeak(sendAsSkin: 스킨 아바타
   * + coreLabel). 미주입·미설정 시 notify 평문 폴백. */
  speak?: CoreSpeakFn;
  /** status → 스킨 페르소나 목소리 voicing (기본 = generateAgentText,
   * 생산자 axis 와 동일 substrate). 실패=원문 폴백(날조 0). */
  voice?: (prompt: string) => Promise<string>;
  missionText?: string;
}

/**
 * 한 소비자 tick — 활성 워커마다: 자기 도메인 큐 스캔 → claim(레이스 시
 * 다음 후보) → tier3 실행 → done=#team-bus 보고 / 실패=점유 해제·재대기.
 * 매 단계 trace. *블록 X* — bounded(워커당 1 TASK/tick), registry 가
 * per-core 동시1. governance reserve 는 spawnTier3 내부 deps.reserve 가.
 */
// 워커 가시성 (KAR-018-Y, 사용자 "말도 좀 하고 뭘 작업하는지 알아야").
// idle/claim-lost/done/fail 상태를 #team-bus 에 알리되 *동일 상태 연속
// 반복은 dedupe* (변화 시에만 — 30분 cadence 라 전이당 1줄=스팸 X,
// 과거 WM-084 에러 매틱 도배도 동시 해소). per-core 마지막 상태 비교.
const lastWorkerStatus = new Map<string, string>();
/**
 * 워커 발화 = Atlas/Echo 동형 스킨 정체 + 페르소나 목소리 (KAR-018-Y,
 * 사용자 "말 좀 파게 + 스킨"). dedupe(동일 raw status 연속 억제) →
 * voice(스킨 페르소나 1~2문장, *사실 그대로*·날조0) → speak(coreSpeak
 * = 스킨 아바타+coreLabel sendAsSkin). voice 실패=raw 폴백(여전히 스킨
 * 정체로 발화). speak 폴백(미설정)=notify 평문(가용성 우선).
 */
async function voicedWorkerSpeak(
  coreId: string,
  status: string,
  speak: CoreSpeakFn,
  voice: (prompt: string) => Promise<string>,
): Promise<void> {
  if (lastWorkerStatus.get(coreId) === status) return;
  lastWorkerStatus.set(coreId, status);
  let line = status;
  try {
    const prompt = [
      `너는 karmoddrine 에이전트 팀의 도메인 워커다. 아래 [작업상태]를`,
      `*너의 캐릭터 목소리*로 팀(#team-bus)에 1~2문장 짧게 보고하라.`,
      `절대 규칙: [작업상태]에 *명시된 것만* 말한다. 거기 없는 행동·`,
      `결과·약속을 추가·추정·과장 X (예: "PR 만들었다/완료했다/검토`,
      `해달라" 등은 [작업상태]에 그 단어가 있을 때만). TASK id·상태·`,
      `사유·브랜치 = 사실 그대로. 이모지/말머리 과용 X. 동료 말투.`,
      ``,
      `[작업상태]`,
      status,
    ].join('\n');
    const v = (await voice(prompt)).trim();
    // 날조 가드(KAR-018-Y, prod KL-061 "수동 PR" 실증): voiced 가
    // 사실을 못 지우게 raw status 핵심을 *항상* footer 로 동봉 →
    // voicing drift 해도 ground-truth 가시·감사가능. voice 실패면
    // raw 자체라 footer 불요.
    if (v) line = `${v.slice(0, 1500)}\n· 원문: ${status.replace(/\s+/g, ' ').slice(0, 200)}`;
  } catch {
    /* voice 실패 = raw status 그대로 (스킨 정체로는 여전히 발화) */
  }
  try {
    await speak(coreId, line);
  } catch {
    /* speak 실패가 워커 막지 X */
  }
}
/** 테스트 전용 — 워커 상태 dedupe 리셋 (disarmKill 동형). */
export function resetWorkerStatus(): void {
  lastWorkerStatus.clear();
  noArtifactCooldown.clear();
}

// KAR-018-Y: no-artifact(미푸시/에러) task 즉시 재pick 무한루프 방지
// (prod 데이터 2026-05-18: wm-worker 가 TASK-WM-084 를 ~7분마다 무한
// 재claim — WM 자격 외부blocker 로 영구 push 실패, cadence·agentic
// 전부 1 task 에 낭비·타 WM task 굶음). no-artifact 직후 그 task 를
// 단기 cooldown → 다음 틱 *다른 후보* 회전. 인메모리(프로세스 hygiene,
// 재기동 자가복원 — 크로스프로세스 claim 원장과 별 관심사). 자격 복구
// 시 cooldown 만료 후 자연 재시도.
const NOARTIFACT_COOLDOWN_MS = 30 * 60_000;
const noArtifactCooldown = new Map<string, number>();
function inNoArtifactCooldown(taskId: string, now: number): boolean {
  const t = noArtifactCooldown.get(taskId);
  return t !== undefined && now - t < NOARTIFACT_COOLDOWN_MS;
}
function markNoArtifact(taskId: string, now: number): void {
  noArtifactCooldown.set(taskId, now);
}

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
  // 워커 발화 = 스킨 정체(Atlas/Echo 동형). speak: deps→coreSpeak(전역
  // setCoreSpeak)→notify 평문 폴백. voice: deps→generateAgentText(생산자
  // 동일 substrate)→실패 빈문자(voicedWorkerSpeak 가 raw 폴백).
  const speak: CoreSpeakFn =
    deps.speak ??
    coreSpeak ??
    (async (_cid, t) => {
      notify(t);
      return true;
    });
  const voice =
    deps.voice ??
    ((p: string) => generateAgentText(env, p, 20_000).catch(() => ''));
  const missionText = deps.missionText ?? readMissionText(env);
  const t3deps = buildTier3Deps(env);

  const scan =
    deps.scan ??
    ((domain: string, machine: string) => {
      const r = runMemoScript(memoRoot, 'task-queue.mjs', [
        '--json',
        '--domain',
        domain,
        '--machine',
        machine,
      ]);
      try {
        return JSON.parse(r.out).candidates ?? [];
      } catch {
        return [];
      }
    });
  const claim =
    deps.claim ??
    ((id: string, by: string) =>
      runMemoScript(memoRoot, 'task-claim.mjs', ['--claim', id, '--by', by])
        .code === 0);
  const release =
    deps.release ??
    ((id: string, by: string) => {
      runMemoScript(memoRoot, 'task-claim.mjs', ['--release', id, '--by', by]);
    });
  const spawn =
    deps.spawn ?? ((req: Tier3Request) => spawnTier3(req, t3deps));
  const branchPushed = deps.branchPushed ?? branchPushedToOrigin;

  const results: string[] = [];
  for (const w of workers) {
    if (isKilled()) break;
    const rawCands = scan(
      w.domain,
      w.machine === 'any' ? thisMachine : w.machine,
    );
    const tickNow = Date.now();
    // no-artifact cooldown 인 task 제외 → degenerate 무한 재pick 차단,
    // 다른 후보로 회전. 전부 cooldown 이면 그 사실 명시 idle(무음 X).
    const cands = rawCands.filter((c) => !inNoArtifactCooldown(c.id, tickNow));
    if (rawCands.length === 0) {
      await voicedWorkerSpeak(
        w.coreId,
        `${w.label} 🟦 대기 — ${w.domain} 도메인에 지금 맡을 일(claimable TASK) 0 (큐 비었거나 전부 진행중/PR/검토중). 새 일 생기면 자동 착수.`,
        speak,
        voice,
      );
      results.push(`${w.coreId}:idle`);
      continue;
    }
    if (cands.length === 0) {
      await voicedWorkerSpeak(
        w.coreId,
        `${w.label} 🟦 대기 — ${w.domain} claimable ${rawCands.length} 전부 최근 no-artifact 쿨다운(미푸시/에러 직후 재pick 차단, ~30분). 쿨다운 만료/신규 task 시 자동 재개. (다수=환경/자격 blocker 의심 — 누적보고)`,
        speak,
        voice,
      );
      results.push(`${w.coreId}:cooldown-all`);
      continue;
    }
    let chosen: { id: string; file: string } | null = null;
    for (const c of cands.slice(0, 3)) {
      if (claim(c.id, w.coreId)) {
        chosen = c;
        break;
      }
    }
    if (!chosen) {
      await voicedWorkerSpeak(
        w.coreId,
        `${w.label} ⚠ ${w.domain} 후보 ${cands.length}건 다른 워커가 선점 — 재대기.`,
        speak,
        voice,
      );
      results.push(`${w.coreId}:claim-lost`);
      continue;
    }
    // KAR-018-Y: 도메인 repo 격리 worktree 셋업 → agentic claude cwd.
    // 미지원/실패 = wt null → 비-agentic 폴백(산출 0, 단 trace·메시지에
    // 명시 — 종전 silent theater 와 달리 *관측가능*).
    const wtRes = (deps.setupWorktree ?? setupWorkerWorktree)(
      memoRoot,
      w.coreId,
      chosen.id,
    );
    const wt = 'error' in wtRes ? null : wtRes;
    const wtErr = 'error' in wtRes ? wtRes.error : null;
    // memo 스펙 *내용* 임베드 (agentic cwd=코드 repo, memo 경로 부재 —
    // prod 23:35 KST "스펙 못 찾음" 근본). chosen.file = task-queue 가
    // `--root memoRoot` 로 산출한 *memoRoot-상대* 경로(예 projects\
    // karmolab\tasks\..). 직전 fix 는 dirname(memoRoot)=umbrella 기준
    // 으로 잘못 join → 항상 ENOENT→specText undefined→폴백("임베드 실패",
    // KL-071 등 prod 06:15 KST 차단). 런타임-정확 재현으로 확정: base=
    // memoRoot 여야 exists=true (dirname 은 false). `\` 는 path.join 정규화.
    let specText: string | undefined;
    try {
      specText = fs.readFileSync(
        path.join(memoRoot, chosen.file),
        'utf-8',
      );
    } catch {
      specText = undefined;
    }
    const req: Tier3Request = {
      core: w.coreId,
      machine: w.machine,
      prompt: buildWorkerPrompt(
        chosen,
        missionText,
        specText,
        wt?.branch,
        formatDecisionsBlock(getDecisionsForTask(memoRoot, chosen.id)) ||
          undefined,
      ),
      repoCwd: wt?.cwd,
    };
    // KAR-018-Y: github.io push/PR 자격 = GitHub App installation 토큰
    // (사용자 결정 2026-05-18). App→실패 시 GH_TOKEN 폴백(additive,
    // prod 무중단). worktree origin URL 에 토큰 주입 = *결정적* push
    // (claude/gh-setup-git 불신) + 자식 claude GH_TOKEN(gh pr create).
    // 워커 루프 순차라 process.env 변경 레이스 0. worktree=ephemeral
    // (finally cleanup)이라 URL 내 토큰 잔존 0.
    if (wt) {
      const tok =
        (await getInstallationToken(env)) || env.GH_TOKEN?.trim() || '';
      if (tok) {
        try {
          const url = execSync(
            `git -C "${wt.wtDir}" remote get-url origin`,
            { timeout: 15_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim();
          const authed = url.replace(
            /^https:\/\/(?:x-access-token:[^@]*@)?github\.com\//,
            `https://x-access-token:${tok}@github.com/`,
          );
          execSync(`git -C "${wt.wtDir}" remote set-url origin "${authed}"`, {
            timeout: 15_000,
            stdio: 'ignore',
          });
        } catch {
          /* push 시 claude 가 에러 정직 보고(계측됨) */
        }
        process.env.GH_TOKEN = tok;
      }
    }
    let res: Awaited<ReturnType<typeof spawn>>;
    try {
      res = await spawn(req);
    } finally {
      if (wt) cleanupWorkerWorktree(wt.repoRoot, wt.wtDir);
    }
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core: w.coreId,
      reason: `worker ${chosen.id} ${res.status}${wt ? ` agentic ${wt.branch}` : ` non-agentic(${wtErr})`}${res.error ? ` err=${res.error.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
    });
    if (res.status === 'done') {
      // KAR-018-Y: 트렁케이트(500) 폐기 — 봇-side 스레드 라우터가 전문
      // 청크 분할(정보 손실 X = 사용자 페인 직격). 줄바꿈 보존(가독).
      // 상한은 pathological 방지용만(라우터가 Discord 한도로 재분할).
      const report = (res.text || '').trim().slice(0, 8000);
      // claim-confirm 근본: status=done 이어도 origin 브랜치 실재로만
      // claim 확정. 미푸시(스펙없음/blocked/no-op)=release → 큐 복귀
      // (영구 드레인 차단, 재시도 가능). worktree 실패도 release.
      const pushed = wt ? branchPushed(wt.repoRoot, wt.branch) : false;
      let head: string;
      if (pushed && wt) {
        head = `${w.label} ▶ ${chosen.id} 수행 — 브랜치 \`${wt.branch}\` origin push 확인 (Draft PR 검토 대기). 도메인=${w.domain}`;
        results.push(`${w.coreId}:done:${chosen.id}`);
      } else {
        release(chosen.id, w.coreId);
        markNoArtifact(chosen.id, tickNow); // 즉시 재pick 무한루프 차단
        head = `${w.label} ⚠ ${chosen.id} 실행 완료했으나 origin 브랜치 미푸시 = 실산출 0 → 점유 해제. 30분 쿨다운(다른 task 회전, 무한 재pick X). ${wt ? `(브랜치 ${wt.branch} 로컬뿐)` : `worktree 실패: ${wtErr}`}. 도메인=${w.domain}`;
        results.push(`${w.coreId}:done-no-artifact:${chosen.id}`);
      }
      await voicedWorkerSpeak(
        w.coreId,
        report ? `${head}\n· 보고: ${report}` : head,
        speak,
        voice,
      );
    } else {
      release(chosen.id, w.coreId);
      markNoArtifact(chosen.id, tickNow); // 에러 task 즉시 재pick 차단
      const errDetail = (res.error || '').trim().slice(0, 3000);
      await voicedWorkerSpeak(
        w.coreId,
        `${w.label} ⚠ ${chosen.id} ${res.status}(${wt ? `agentic ${wt.branch}` : `non-agentic:${wtErr}`}) — 점유 해제·재대기. 도메인=${w.domain}${errDetail ? `\n· 사유: ${errDetail}` : ''}`,
        speak,
        voice,
      );
      results.push(`${w.coreId}:${res.status}`);
    }
  }
  return results.join(',') || 'no-workers';
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

/**
 * tick 결과 코드 → #team-bus 하트비트 한 줄 (순수·사장 평이체).
 * KAR-018-Y-2: tick 결과가 노트북 console.log 에만 있어 사용자(=yawnbot
 * Discord 정보 인터페이스)에 *팀이 살아있음이 안 보임*. 의미 있는 활동만
 * 한 줄 요약, 순수 idle 은 null(스팸 X — process.md 백그라운드 자율종료
 * 정신 + 발굴 글쓰기 규칙: 내부 코드명·§조항 X, 짧게).
 * 의미 활동 = 발굴 dispatch / 워커 착수 / 제안 머터리얼 / 코어대화 /
 * 승인대기(escalate) / 예산정지 / 드리프트차단. 그 외(gated·idle) = null.
 */
export function summarizeTick(r: string): string | null {
  const s = (r || '').trim();
  if (!s) return null;
  const bits: string[] = [];
  const dlg = s.match(/dialogue:([a-z0-9_-]+)/i);
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
  if (/\bescalated\b/.test(s)) bits.push('판단 필요한 건 — 사장 승인 대기');
  if (/budget-stop/.test(s)) bits.push('예산 한도 — 이번 바퀴는 멈춤');
  if (/drift-skip/.test(s)) bits.push('미션과 안 맞는 방향 — 건너뜀');
  if (bits.length === 0) return null;
  return `🛰 팀 한 바퀴: ${bits.join(' · ')}`;
}

let cadenceTimer: ReturnType<typeof setTimeout> | null = null;
let workerTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 자율 cadence 시작 — **default OFF**. `AGENT_CADENCE_ENABLED=1` 만 ON.
 * kill 파일(`<memo>/.claude/agent-kill`) 존재 시 tick skip (크로스-프로세스 !kill).
 */
/**
 * 한 cadence tick 1회 — 타이머·수동 슬래시 공용 (KAR-018-Y, 사용자
 * "수동 호출 방법"). deps/gov 내부 구성 = standalone 호출 가능. *라이브
 * 봇 프로세스*에서 호출 시 setTeamBusNotify/setCoreSpeak 가 전역 wired
 * 라 #team-bus 실제 게시(테스트 위해 interval 줄이는 churn 제거 — ops
 * 인터페이스 비-GUI). governed→producer→inbox→worker→dialogue→heartbeat
 * = startAgentCadence 타이머와 동일 시퀀스(평행 정의 0).
 */
export async function runCadenceTickOnce(
  env: NodeJS.ProcessEnv,
  opts: { includeWorker?: boolean } = {},
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
    r = `idle→producer:${await runGovernedProducerOnce(env)}`;
  }
  if (memoRoot && !isKilled()) {
    const mat = await runInboxConsumerOnce(env);
    if (mat > 0) r = `${r}+consumed:${mat}`;
  }
  // 워커 소화 = *별 cadence*(KAR-018-Y, 사용자: 제안 30분 OK, 소화는
  // 더 빨라야 — 작업 없으면 5분 트리거). 자동 main 틱은 includeWorker
  // false(워커 전용 타이머가 5분 주기). 수동 /관리자 에이전트틱 = 기본
  // true(전체 1틱). 작업 중이면 await-after-setTimeout 라 안 쌓임.
  if (opts.includeWorker !== false && memoRoot && !isKilled()) {
    const w = await runWorkerConsumerOnce(env);
    if (w && w !== 'no-workers' && w !== 'no-memo-root') {
      r = `${r}+worker:${w}`;
    }
  }
  if (memoRoot && !isKilled()) {
    const d = await runCoreDialogueOnce(env);
    if (
      d &&
      !['dialogue-idle', 'dialogue-dup', 'dialogue-none', 'no-memo-root'].includes(
        d,
      )
    ) {
      r = `${r}+${d}`;
    }
  }
  console.log(`[AgentCadence] tick -> ${r}`);
  try {
    const hb = summarizeTick(r);
    if (hb) gov.notify(hb);
  } catch {
    /* 하트비트 실패 = tick 비차단 */
  }
  return r;
}

export function startAgentCadence(env: NodeJS.ProcessEnv): void {
  if ((env.AGENT_CADENCE_ENABLED?.trim() || '') !== '1') {
    console.log(
      '[AgentCadence] OFF (AGENT_CADENCE_ENABLED!=1) — 이벤트 경로만 live. sub-D 예산엔진 후 활성.',
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
    cadenceTimer = setTimeout(tick, intervalMs);
  };
  const workerTick = async () => {
    try {
      const w = await runWorkerConsumerOnce(env);
      if (w && w !== 'no-workers' && w !== 'no-memo-root') {
        console.log(`[AgentCadence] worker -> ${w}`);
      }
    } catch (e) {
      console.error(
        '[AgentCadence] worker 오류:',
        e instanceof Error ? e.message : e,
      );
    }
    workerTimer = setTimeout(workerTick, workerMs);
  };
  cadenceTimer = setTimeout(tick, intervalMs);
  workerTimer = setTimeout(workerTick, workerMs);
  console.warn(
    `[AgentCadence] ON (발굴 ${intervalMs}ms · 워커소화 ${workerMs}ms 분리) — sub-D 게이트 활성.`,
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
}
