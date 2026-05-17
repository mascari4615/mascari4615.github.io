/**
 * dispatcher — 에이전트 런타임 3-tier 디스패치 코어 (KAR-018-B slice-1).
 *
 * 그릴-락:
 *  B-1 토폴로지 = yawnbot 인-프로세스 spawn (generateClaudeCliText 재사용).
 *  B-2 생명주기 = 작업단위 bounded 세션 + per-agent 동시 1 (SessionRegistry).
 *  B-3 ⑦구동 = 인-프로세스 cadence (proactive.ts 패턴, slice-2+ 배선).
 *
 * 본 모듈 = *순수 정책 로직*만 (Discord/프로세스 의존 0 → tracer-bullet 테스트).
 * 실제 spawn(generateClaudeCliText) · cadence timer = slice-2+ 통합부가 소비.
 */

/** spawn 경제성 3-tier (parent 자율결정1). */
export type Tier = 'tier1' | 'tier2' | 'tier3';

export interface RouteInput {
  /** 상태/보드 조회류 — agent-state 캐시로 LLM 무호출 즉답. */
  isStatusQuery: boolean;
  /** objective/TASK pull · 명시적 무거운 다단계. */
  isHeavyWork: boolean;
}

/**
 * tier 라우팅 정책 (mechanism 아닌 policy — isStatusQuery/isHeavyWork
 * 판정은 caller(handler/cadence)가, 본 함수는 순수 분기).
 *  status → tier1(spawn 0) / heavy → tier3(풀세션) / else → tier2(단발 -p).
 */
export function decideTier(input: RouteInput): Tier {
  if (input.isStatusQuery) return 'tier1';
  if (input.isHeavyWork) return 'tier3';
  return 'tier2';
}

/**
 * per-agent(core) 동시 1 세션 single-flight 레지스트리 (B-2).
 * acquire 실패 = 점유 중(동시1 상한). pid 바인딩 후, 죽은 pid 는
 * reclaim(liveness)으로 회수 (KAR-017 reconciler liveness 재사용 — caller 주입).
 */
export class SessionRegistry {
  private active = new Map<string, number | null>(); // core -> pid (null=예약만)

  /** 점유 시도. 이미 활성이면 false(거부). 성공 시 예약(pid 미정). */
  acquire(core: string): boolean {
    if (this.active.has(core)) return false;
    this.active.set(core, null);
    return true;
  }

  /** spawn 후 실제 pid 바인딩. */
  bindPid(core: string, pid: number): void {
    if (this.active.has(core)) this.active.set(core, pid);
  }

  /** 작업단위 완료/타임아웃 → 해제 (bounded 세션). */
  release(core: string): void {
    this.active.delete(core);
  }

  isBusy(core: string): boolean {
    return this.active.has(core);
  }

  activeCores(): string[] {
    return [...this.active.keys()];
  }

  /**
   * 고아 회수 — pid 있고 isAlive(pid)=false 인 core 해제.
   * pid 미바인딩(null=예약 직후 spawn 전)은 보존 (race 회피).
   */
  reclaimDead(isAlive: (pid: number) => boolean): string[] {
    const reclaimed: string[] = [];
    for (const [core, pid] of [...this.active.entries()]) {
      if (pid !== null && !isAlive(pid)) {
        this.active.delete(core);
        reclaimed.push(core);
      }
    }
    return reclaimed;
  }
}

// ── tier3 spawn 오케스트레이션 (B-1/B-2/B-4, slice-2) ────────
// substrate⊥어댑터(parent ⓪'): 본 모듈은 Discord·karmolab-ai 직접 import X.
// spawn primitive(run)·예산훅(reserve)·머신(thisMachine) 전부 *주입* —
// 어댑터/배선층이 generateAssistantText·team-room.reserveBudget·KAR_MACHINE 제공.

export interface Tier3Request {
  core: string;
  /** 코어 core.md frontmatter machine: 어피니티 (B-4). */
  machine: string;
  /** 작업단위 지시 (bounded — 이 1건 후 세션 종료). */
  prompt: string;
  /**
   * 지정 시 = agentic 실행(이 cwd 안에서 파일·git·gh 도구 사용).
   * 워커 tier3 = 도메인 repo 격리 worktree 경로. 미지정(producer/
   * cadence tier3) = 비-agentic 텍스트 생성(기존 동작 불변). KAR-018-Y.
   */
  repoCwd?: string;
}

export type Tier3Status =
  | 'done'
  | 'busy'          // per-agent 동시1 (B-2)
  | 'wrong-machine' // 머신 어피니티 불일치 (B-4) — 다른 머신 worker 가 드레인
  | 'budget-denied' // ④ 예산 reserve 거부 (sub-D 가 훅 채움)
  | 'error';

export interface Tier3Result {
  status: Tier3Status;
  text?: string;
  error?: string;
}

export interface Tier3Deps {
  /** 이 머신 식별 ($env:KAR_MACHINE 등 — 어댑터가 주입). */
  thisMachine: string;
  /** ④ 예산 reserve 훅 (team-room.reserveBudget — 순수, default allow). */
  reserve: (core: string) => boolean;
  /** spawn primitive (generateAssistantText 래퍼 — 어댑터 주입). */
  run: (req: Tier3Request) => Promise<string>;
  registry: SessionRegistry;
}

/**
 * 머신 어피니티 판정 (B-4, TASK-SCHEMA 어휘). 빈값/any = 어디서나.
 * 정확 일치 or cloud 패밀리(cloud ↔ cloud-*) 매칭.
 */
export function machineEligible(coreMachine: string, thisMachine: string): boolean {
  const c = (coreMachine || 'any').trim();
  if (c === 'any') return true;
  if (c === thisMachine) return true;
  if (c === 'cloud' && thisMachine.startsWith('cloud')) return true;
  if (thisMachine === 'cloud' && c.startsWith('cloud')) return true;
  return false;
}

/**
 * tier3 풀세션 오케스트레이션: 머신자격 → 동시1 acquire → 예산 →
 * run(작업단위) → 완료/에러 무관 release(bounded, 좀비 X).
 */
export async function spawnTier3(
  req: Tier3Request,
  deps: Tier3Deps,
): Promise<Tier3Result> {
  if (!machineEligible(req.machine, deps.thisMachine)) {
    return { status: 'wrong-machine' };
  }
  if (!deps.registry.acquire(req.core)) {
    return { status: 'busy' };
  }
  try {
    if (!deps.reserve(req.core)) {
      return { status: 'budget-denied' };
    }
    const text = await deps.run(req);
    return { status: 'done', text };
  } catch (e: unknown) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  } finally {
    deps.registry.release(req.core);
  }
}
