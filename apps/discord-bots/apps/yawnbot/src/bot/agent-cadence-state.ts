/**
 * agent-cadence-state — cadence 모듈 간 공유 상태 최소 집합.
 * 모든 split 파일이 여기서만 import → circular dep 0.
 * killSwitch / SessionRegistry / generateAgentText / buildTier3Deps /
 * CoreSpeakFn·coreSpeak·setCoreSpeak / runMemoScript(공용 헬퍼).
 */
import { execSync } from 'child_process';
import path from 'path';
import { generateAssistantText, generateClaudeCliText } from 'karmolab-ai/node';
import type { GeminiTextTier } from 'karmolab-ai';
import {
  SessionRegistry,
  spawnTier3,
  type Tier3Deps,
  type Tier3Request,
} from './dispatcher';
import { reserveBudget } from './team-room';
import { ceilingsFromEnv, type BudgetCeilings } from './governance';

// ── kill switch (③ 사람·!kill 최우선 인터럽) ─────────────────
let killed = false;
export function armKill(): void { killed = true; }
export function disarmKill(): void { killed = false; }
export function isKilled(): boolean { return killed; }

// 프로세스 1개 = 단일 레지스트리 (per-agent 동시1).
export const registry = new SessionRegistry();

/**
 * 에이전트 대화·발굴 Gemini 호출 — Vertex 우선, 실패 시 AI Studio 폴백.
 * (사용자 결정 KAR-018-Y, 2026-05-17).
 *
 * **TASK-KAR-145**: tier/systemInstruction/tag 옵션 추가.
 * - `tier` 미지정 = 기존 동작(env GEMINI_MODEL / 패키지 default = 2.5-flash standard).
 *   `'lite'` 명시 = 짧은 voicing/말투 보정용(가격 ~1/3). `'pro'` = 복잡 추론.
 *   callers 가 *명시적*으로 박는다 — silent 다운그레이드 X (retro/surgery 추론 정합).
 * - `systemInstruction` = 안정 prefix (persona·mission·portfolio·skin) →
 *   Gemini implicit cache hit 정렬 (청구 25%).
 * - `tag` = telemetry 분류 라벨 (`yawnbot/voiced-worker` 등). `KARMOLAB_AI_USAGE_LOG=1`
 *   환경에서 어디서 비싼지 식별 가능.
 */
export async function generateAgentText(
  env: NodeJS.ProcessEnv,
  prompt: string,
  timeoutMs: number,
  opts: {
    tier?: GeminiTextTier;
    systemInstruction?: string;
    tag?: string;
  } = {},
): Promise<string> {
  const base = { ...env, ASSISTANT_AI_PROVIDER: 'gemini' };
  const passthrough = {
    timeoutMs,
    tier: opts.tier,
    systemInstruction: opts.systemInstruction,
    tag: opts.tag,
  };
  try {
    const r = await generateAssistantText(
      { ...base, KARMOLAB_AI_SURFACE: 'vertex' },
      prompt,
      passthrough,
    );
    return r.text;
  } catch {
    const r = await generateAssistantText(
      { ...base, KARMOLAB_AI_SURFACE: 'aiStudio' },
      prompt,
      passthrough,
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
      if (req.repoCwd) {
        return await generateClaudeCliText({
          prompt: req.prompt,
          timeoutMs,
          cwd: req.repoCwd,
          oneShot: true,
          env: req.childEnv,
        });
      }
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

// ── CoreSpeakFn / coreSpeak DI ───────────────────────────────
/** 코어가 #team-bus 에 자기 정체로 발화 (main.ts 가 sendAsSkin 주입). */
export type CoreSpeakFn = (coreId: string, text: string) => Promise<boolean>;
let coreSpeak: CoreSpeakFn | null = null;
export function setCoreSpeak(fn: CoreSpeakFn): void { coreSpeak = fn; }
export function getCoreSpeak(): CoreSpeakFn | null { return coreSpeak; }

// ── runMemoScript 공용 헬퍼 ──────────────────────────────────
/** memo/scripts/<script>.mjs shell 1회 (단일 정본 호출, best-effort). */
export function runMemoScript(
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
