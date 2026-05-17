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
import { generateAssistantText } from 'karmolab-ai/node';
import { reserveBudget, checkAndStampCooldown } from './team-room';
import {
  SessionRegistry,
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
      const { text } = await generateAssistantText(
        { ...env, ASSISTANT_AI_PROVIDER: 'claude-cli' },
        req.prompt,
        { timeoutMs: Number(env.AGENT_TIER3_TIMEOUT_MS) || 30 * 60_000 },
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
): string {
  return [
    `너는 karmoddrine 에이전트 팀의 도메인 소비자 워커다. 아래 TASK 1건을`,
    `autopilot 안전 룰셋으로 *끝까지* 수행한다 (bounded — 이 1건 후 종료).`,
    '',
    `[대상 TASK] ${task.id}`,
    `[스펙 파일] ${task.file}`,
    '',
    '[절차]',
    `1. 위 TASK 스펙(${task.file})·관련 정본 정독. 진단 우선(가설 박기 X).`,
    '2. 자기 worktree 에서만 작업 — main worktree(memo/WitchMendokusai/',
    '   Mascari4615.github.io) HEAD swap 절대 X. 없으면 new-worktree.ps1.',
    '3. 코드 변경 + 가능한 검증(build/test/typecheck). 검증 불가 영역은',
    '   PR Test plan 에 명시.',
    '4. feature 브랜치 commit + push + **Draft PR 까지만**. merge /',
    '   master·main 직접 push / force-push **절대 금지**.',
    '5. 다른 세션 영역 침범 금지 — active-sessions 보드의 다른 행 타겟',
    '   파일 미접촉. TASK 문서 backlog/status 갱신.',
    '6. 끝나면 무엇을 했는지 *한 문단* 으로 요약(= #team-bus 보고용).',
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

export interface WorkerConsumerDeps {
  listWorkers?: (memoRoot: string) => WorkerCore[];
  scan?: (domain: string, machine: string) => { id: string; file: string }[];
  claim?: (id: string, by: string) => boolean;
  release?: (id: string, by: string) => void;
  spawn?: (req: Tier3Request) => Promise<{ status: string }>;
  notify?: NotifyFn;
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
function noteWorkerStatus(
  coreId: string,
  status: string,
  notify: NotifyFn,
): void {
  if (lastWorkerStatus.get(coreId) === status) return;
  lastWorkerStatus.set(coreId, status);
  notify(status);
}
/** 테스트 전용 — 워커 상태 dedupe 리셋 (disarmKill 동형). */
export function resetWorkerStatus(): void {
  lastWorkerStatus.clear();
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

  const results: string[] = [];
  for (const w of workers) {
    if (isKilled()) break;
    const cands = scan(w.domain, w.machine === 'any' ? thisMachine : w.machine);
    if (cands.length === 0) {
      noteWorkerStatus(
        w.coreId,
        `${w.label} 🟦 대기 — ${w.domain} 도메인에 지금 맡을 일(claimable TASK) 0 (큐 비었거나 전부 진행중/PR/검토중). 새 일 생기면 자동 착수.`,
        notify,
      );
      results.push(`${w.coreId}:idle`);
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
      noteWorkerStatus(
        w.coreId,
        `${w.label} ⚠ ${w.domain} 후보 ${cands.length}건 다른 워커가 선점 — 재대기.`,
        notify,
      );
      results.push(`${w.coreId}:claim-lost`);
      continue;
    }
    const req: Tier3Request = {
      core: w.coreId,
      machine: w.machine,
      prompt: buildWorkerPrompt(chosen, missionText),
    };
    const res = await spawn(req);
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core: w.coreId,
      reason: `worker ${chosen.id} ${res.status}`,
    });
    if (res.status === 'done') {
      noteWorkerStatus(
        w.coreId,
        `${w.label} ▶ ${chosen.id} 자율 착수 — 자기 worktree·Draft PR (검토 대기). 도메인=${w.domain}`,
        notify,
      );
      results.push(`${w.coreId}:done:${chosen.id}`);
    } else {
      release(chosen.id, w.coreId);
      noteWorkerStatus(
        w.coreId,
        `${w.label} ⚠ ${chosen.id} ${res.status} — 점유 해제·재대기 (도메인=${w.domain})`,
        notify,
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

/**
 * 자율 cadence 시작 — **default OFF**. `AGENT_CADENCE_ENABLED=1` 만 ON.
 * kill 파일(`<memo>/.claude/agent-kill`) 존재 시 tick skip (크로스-프로세스 !kill).
 */
export function startAgentCadence(env: NodeJS.ProcessEnv): void {
  if ((env.AGENT_CADENCE_ENABLED?.trim() || '') !== '1') {
    console.log(
      '[AgentCadence] OFF (AGENT_CADENCE_ENABLED!=1) — 이벤트 경로만 live. sub-D 예산엔진 후 활성.',
    );
    return;
  }
  const intervalMs = Number(env.AGENT_CADENCE_INTERVAL_MS) || 15 * 60_000;
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  const killFile = memoRoot
    ? path.join(memoRoot, '.claude', 'agent-kill')
    : '';
  const deps = buildTier3Deps(env);
  const gov = buildGovernCadenceDeps(env);
  const tick = async () => {
    try {
      if (killFile && fs.existsSync(killFile)) armKill(); // 크로스-프로세스 !kill
      let r = await runGovernedCadenceOnce(deps, gov, () => {
        const p = path.join(memoRoot, '.claude', 'objectives.md');
        if (!memoRoot || !fs.existsSync(p)) return null;
        try {
          return parseCadenceObjective(fs.readFileSync(p, 'utf-8'));
        } catch {
          return null;
        }
      });
      // ⑦'(2): active objective 없음(idle) → 발굴 (KAR-018-W).
      // governed: 예산 reserve 게이트 + 비-agentic generateDiscoveryText.
      // 발굴물은 proposals 인박스까지만 (no-auto-exec, canon 무변경).
      if (r === 'idle' && memoRoot && !isKilled()) {
        r = `idle→producer:${await runGovernedProducerOnce(env)}`;
      }
      // 승인 게이트 인박스 소비 (W slice-3): 사람이 approvals.jsonl 에
      // approved 박은 task 발굴만 seed TASK 머터리얼라이즈. 멱등·inert.
      if (memoRoot && !isKilled()) {
        const mat = await runInboxConsumerOnce(env);
        if (mat > 0) r = `${r}+consumed:${mat}`;
      }
      // ⑦(2) 소비자 워커: 활성 도메인 워커가 자기 prefix ready TASK
      // pull→claim→tier3→#team-bus 보고 (KAR-018-X — 생산자의 짝).
      if (memoRoot && !isKilled()) {
        const w = await runWorkerConsumerOnce(env);
        if (w && w !== 'no-workers' && w !== 'no-memo-root') {
          r = `${r}+worker:${w}`;
        }
      }
      // 코어↔코어 1턴 (KAR-018-Y-1, i3b 복원): 최신 제안에 관련 피어
      // 코어가 #team-bus 에서 동료로 코멘트 → 팀이 실제로 *대화*하고
      // 사용자가 그 관점까지 보고 실시간 팔로업. tick 당 최대 1턴(bounded).
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
      // KAR-018-Y-2: 팀이 살아있음을 사용자(yawnbot Discord)가 보게 —
      // 의미 있는 활동만 #team-bus 한 줄 (idle 스팸 X). 기존 notify
      // pipe 재사용(평행정의0). 실패해도 tick 비차단.
      try {
        const hb = summarizeTick(r);
        if (hb) gov.notify(hb);
      } catch {
        /* 하트비트 실패 = tick 비차단 */
      }
    } catch (e) {
      console.error(
        '[AgentCadence] tick 오류:',
        e instanceof Error ? e.message : e,
      );
    }
    cadenceTimer = setTimeout(tick, intervalMs);
  };
  cadenceTimer = setTimeout(tick, intervalMs);
  console.warn(
    `[AgentCadence] ON (interval=${intervalMs}ms) — sub-D 거버넌스 게이트 활성 (drift 3-판정 + 예산 verdict + risk escalate).`,
  );
}

export function stopAgentCadence(): void {
  if (cadenceTimer) {
    clearTimeout(cadenceTimer);
    cadenceTimer = null;
  }
}
