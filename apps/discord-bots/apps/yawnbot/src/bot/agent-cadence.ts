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
import { generateAssistantText } from 'karmolab-ai/node';
import { reserveBudget } from './team-room';
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
import { runProducerOnce, inboxDispatch } from './proposal-adapter';

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
 * ⑦' 발굴 프롬프트 (KAR-018-W). 미션·objectives 정렬 자가검사 후 *판별
 * union 엔벨로프 JSON 1건*만 출력 (없으면 빈 출력 → 파서가 폐기, 날조 0).
 */
const DISCOVERY_PROMPT = [
  '너는 karmoddrine 에이전트 팀의 자율 cadence 생산자다.',
  'agent-mission.md §1 공통목표·§3 비목표를 자가검사해, *지금 가치 있는*',
  '발굴물 1건을 아래 판별 union JSON 으로만 출력하라 (코드펜스 OK):',
  '{"kind":"env|skill|agent|task|objective","payload":{...}}',
  '- env: {id,summary,targetFiles[],source}  - skill: {id,name,summary,source,coreId}',
  '- agent: {id,coreId,role,name,source}  - task: {title,body,domain}',
  '- objective: {summary,derivation,alignment}',
  '확신 없으면 아무것도 출력하지 마라 (빈 출력 = 폐기, 날조 금지).',
].join('\n');

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
      // ⑦'(2): active objective 없음(idle) → 발굴 (KAR-018-W slice-2).
      // 발굴물은 proposals 인박스까지만 (no-auto-exec, canon 무변경).
      if (r === 'idle' && memoRoot && !isKilled()) {
        const pr = await runProducerOnce({
          env,
          discover: async () => {
            const { text } = await generateAssistantText(
              { ...env, ASSISTANT_AI_PROVIDER: 'claude-cli' },
              DISCOVERY_PROMPT,
              { timeoutMs: Number(env.AGENT_TIER3_TIMEOUT_MS) || 30 * 60_000 },
            );
            return text;
          },
          dispatch: inboxDispatch(env),
        });
        r = `idle→producer:${pr}`;
      }
      console.log(`[AgentCadence] tick -> ${r}`);
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
