/**
 * KarmoLabAI — usage telemetry (per-call 토큰 회계).
 *
 * **왜 필요한가**: 매 Gemini 호출의 input/output/cached 토큰을 구조화해 emit 하면
 * (1) 어디서 비싸는지 측정 가능 (cache hit ratio, tier 별 토큰 분포)
 * (2) 외부 dashboard / SIEM 로 라우팅 가능 (custom recorder 주입)
 * (3) 회귀 (예: systemInstruction 분리가 implicit cache hit 늘었나) 측정 게이트
 *
 * 정본: TASK-KAR-145 (@karmo/ai cost optimization, 2026-05-23).
 *
 * **확장**: 다른 provider (OpenAI, Anthropic, Ollama 등) 추가 시 동일 `GenerationUsage`
 * 스키마로 normalize 해서 recordUsage 호출 → 단일 telemetry pipe.
 */
/**
 * 한 번의 텍스트 생성 호출 토큰 사용량 (provider-agnostic).
 * Gemini usageMetadata 와 OpenAI usage 양쪽 다 매핑되는 공통 분모.
 *
 * - `promptTokens`: 입력 (system + history + user 합산, billable)
 * - `completionTokens`: 출력 candidates
 * - `totalTokens`: prompt + completion (provider 제공 시)
 * - `cachedPromptTokens`: prompt 중 캐시 hit 으로 25% 청구된 부분 (Gemini implicit/explicit cache, OpenAI prompt_cache_hit_tokens)
 * - `thoughtsTokens`: thinking 모드 산출 토큰 (Gemini 2.5+, billable 별도). 평소 0.
 */
export interface GenerationUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedPromptTokens?: number;
    thoughtsTokens?: number;
}
/** UsageRecorder 호출 시 함께 전달되는 메타 — 어디서 / 무엇으로 호출했는지. */
export interface UsageMeta {
    /** `gemini` / `openai` / `claude-cli` 등 provider 카테고리. */
    provider: string;
    /** 실제 호출된 model id (예: `gemini-2.5-flash-lite`). */
    modelId: string;
    /** Gemini 한정: `aiStudio` / `vertex`. */
    surface?: 'aiStudio' | 'vertex';
    /** tier 라벨 (`lite`/`standard`/`pro`) — 미지정 호출은 미설정. */
    tier?: string;
    /** caller-side 분류 태그 (예: `yawnbot/voiced-worker`, `yawnbot/dialogue`, `yawn-slash`). */
    tag?: string;
    /** wall-clock 호출 시간 (ms). */
    durationMs: number;
    /** ISO timestamp (생성 시각). */
    ts: string;
}
/** 사용량 기록 콜백. 동기 — recorder 안에서 비동기 작업은 caller 가 보장. */
export type UsageRecorder = (usage: GenerationUsage, meta: UsageMeta) => void;
/** 전역 recorder 교체. consumer 가 자기 telemetry 채널로 라우팅하고 싶을 때. */
export declare function setUsageRecorder(fn: UsageRecorder | null): void;
/** 호출별로 임시 recorder 주입 (per-call onUsage) → 전역 recorder 와 둘 다 호출. */
export declare function recordUsage(usage: GenerationUsage, meta: UsageMeta, perCall?: UsageRecorder | null): void;
interface GeminiUsageMetadataJson {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
}
/**
 * Vertex / AI Studio generateContent 응답의 `usageMetadata` 필드를
 * `GenerationUsage` 로 정규화. 필드 누락 = 0 fallback (절대 throw X).
 */
export declare function parseGeminiUsageMetadata(meta: GeminiUsageMetadataJson | null | undefined): GenerationUsage;
export {};
