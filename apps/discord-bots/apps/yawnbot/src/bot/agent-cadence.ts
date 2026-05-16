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

/**
 * objectives.md 본문 파서 (순수 — tracer-bullet). `active` objective 중
 * ④ anchor(정렬 필드) 있는 첫 행 → Tier3Request. 정렬 공백 = drift 차단(skip).
 */
export function parseCadenceWork(md: string): Tier3Request | null {
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(
      /^\|\s*(OBJ-\d+)\s*\|([^|]*)\|[^|]*\|([^|]*)\|\s*active\s*\|/,
    );
    if (!m) continue;
    const align = m[3].trim();
    if (!align) continue; // ④ anchor: 정렬 없으면 skip (Freysa drift 차단)
    return {
      core: 'cadence', // 코어별 라우팅 = slice-4 (현 placeholder)
      machine: 'any',
      prompt: `[자율 cadence] objective ${m[1].trim()} (${m[2].trim()}) 정렬=${align}. 미션 정렬 재확인 후 파생 TASK 진행.`,
    };
  }
  return null;
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
  const tick = async () => {
    try {
      if (killFile && fs.existsSync(killFile)) armKill(); // 크로스-프로세스 !kill
      const r = await runCadenceOnce(deps, () => pickWorkFromObjectives(memoRoot));
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
    `[AgentCadence] ON (interval=${intervalMs}ms). 주의: sub-D 예산엔진 미구현 — reserve=default allow.`,
  );
}

export function stopAgentCadence(): void {
  if (cadenceTimer) {
    clearTimeout(cadenceTimer);
    cadenceTimer = null;
  }
}
