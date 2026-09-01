import { type GoogleGenerativeSurface, type GeminiTextTier, type GenerationUsage, type UsageRecorder } from '../index';
export type ChatContent = {
    role: 'user' | 'model';
    parts: [{
        text: string;
    }];
};
/** generate 호출 결과. text + usage 한 묶음. (TASK-KAR-145) */
export interface GeminiGenerateResult {
    text: string;
    usage: GenerationUsage;
    modelId: string;
    surface: GoogleGenerativeSurface;
}
export declare function resolveAiStudioTextModelId(modelFromEnv?: string | null): string;
/**
 * model id 해소. tier(있으면) → env override(GEMINI_MODEL_*) → modelId param → GEMINI_MODEL env → default.
 * 우선순위 정렬: explicit modelId param 이 tier 보다 위. tier 는 caller 의 "용도 라벨", modelId 는 강제 지정.
 */
export declare function resolveGeminiModelId(opts: {
    modelId?: string | null;
    tier?: GeminiTextTier | null;
    env?: NodeJS.ProcessEnv;
}): string;
/** AI Studio API 키 + 선택적 모델 오버라이드로 텍스트용 GenerativeModel */
export declare function createAiStudioTextModel(apiKey: string, modelId?: string | null): import("@google/generative-ai").GenerativeModel;
/** 단일 문자열 프롬프트 → 응답 텍스트 + usage (AI Studio) */
export declare function generateAiStudioText(opts: {
    apiKey: string;
    modelId?: string | null;
    prompt: string;
    systemInstruction?: string;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    usage: GenerationUsage;
    modelId: string;
}>;
/** 멀티턴 대화 히스토리 + 현재 메시지 → 응답 텍스트 + usage (AI Studio Chat) */
export declare function generateAiStudioChatText(opts: {
    apiKey: string;
    modelId?: string | null;
    systemInstruction?: string;
    history: ChatContent[];
    message: string;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    usage: GenerationUsage;
    modelId: string;
}>;
/** Vertex Publisher `generateContent` (API 키 인증, 브라우저 `gemini.ts`와 동일 REST 형태) */
export declare function generateVertexText(opts: {
    apiKey: string;
    projectId: string;
    location?: string | null;
    modelId?: string | null;
    userText: string;
    history?: ChatContent[];
    systemInstruction?: string | null;
    safetyThreshold?: string | null;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    usage: GenerationUsage;
    modelId: string;
}>;
/**
 * `vertex` | `vertex_ai` | `gcp_vertex` → Vertex, 그 외, 비어 있음 → AI Studio.
 */
export declare function parseGenerativeSurfaceFromEnv(env?: NodeJS.ProcessEnv): GoogleGenerativeSurface;
export type GenerativeTextClient = {
    surface: GoogleGenerativeSurface;
    /** 단일 사용자 프롬프트(또는 시스템+사용자를 한 덩어리로 넣은 문자열) */
    generateFromPrompt: (prompt: string, signal?: AbortSignal) => Promise<string>;
};
/** `/yawn` 슬래시: `.env` 기본 vs `aiStudio` / `vertex` 강제 */
export type GenerativeSurfaceOverride = 'inherit' | 'aiStudio' | 'vertex';
/**
 * 시스템+맥락+질문을 한 문자열로 묶어 보낼 때(AI Studio `generateContent` / Vertex `generateContent` REST).
 * `surface: inherit` 이면 `KARMO_AI_SURFACE` 등과 동일 규칙.
 *
 * **TASK-KAR-145 확장**: `tier`/`tag`/`onUsage`/`systemInstruction` 추가.
 * - `tier`: lite/standard/pro 라벨. `getGeminiModelIdForTier` 로 해소.
 *   `modelId` 명시 시 tier 무시 (explicit > tier).
 * - `tag`: telemetry 분류 라벨 (`yawnbot/voiced-worker` 등). usage 로그에 포함.
 * - `onUsage`: per-call 콜백. 전역 recorder(`KARMOLAB_AI_USAGE_LOG=1`) 와 둘 다 호출.
 * - `systemInstruction`: 안정 prefix → Vertex implicit cache 정렬 (cache hit 시 청구 25%).
 */
export declare function generateBlobTextFromEnvWithOptions(env: NodeJS.ProcessEnv, blobPrompt: string, options?: {
    surface?: GenerativeSurfaceOverride;
    modelId?: string | null;
    tier?: GeminiTextTier | null;
    systemInstruction?: string;
    tag?: string;
    onUsage?: UsageRecorder | null;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    surface: GoogleGenerativeSurface;
    modelId: string;
    usage: GenerationUsage;
}>;
/**
 * `.env` 기준으로 호출 가능한 텍스트 클라이언트를 만듦. 자격이 없으면 `null`.
 *
 * - **AI Studio (기본):** `GEMINI_API_KEY` 필수, `GEMINI_MODEL` 선택
 * - **Vertex:** `KARMO_AI_SURFACE=vertex`(또는 `GEMINI_SURFACE`) + `VERTEX_API_KEY`, `VERTEX_PROJECT_ID` 필수, `VERTEX_LOCATION`, `GEMINI_MODEL` 선택
 *
 * TASK-KAR-145: tier 옵션 추가. 클라이언트 생성 시점에 tier 고정. 호출별 가변 케이스는
 * `generateBlobTextFromEnvWithOptions` 직접 사용.
 */
export declare function tryCreateGenerativeTextFromEnv(env?: NodeJS.ProcessEnv, opts?: {
    tier?: GeminiTextTier | null;
    tag?: string;
}): GenerativeTextClient | null;
/** `tryCreateGenerativeTextFromEnv`가 `null`일 때 안내용 */
export declare function generativeEnvHint(env?: NodeJS.ProcessEnv): string;
