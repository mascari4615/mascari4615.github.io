/**
 * KarmoLabAI. Google Generative AI 공통 계약 (AI Studio + Vertex AI).
 * 브라우저/Node 공통: 모델 카탈로그, REST URL 조립, 문서, 기본 리전 등. fetch, 키 저장 없음.
 * Node에서 `@google/generative-ai` 호출까지 맞출 때는 서브패스 `@karmo/ai/node` 참고.
 */
export type GoogleGenerativeSurface = 'aiStudio' | 'vertex';
export declare const AI_STUDIO_GENERATIVE_HOST = "generativelanguage.googleapis.com";
export declare const AI_STUDIO_GENERATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";
export declare function buildAiStudioGenerateContentUrl(modelId: string, apiKey: string): string;
export declare function buildAiStudioStreamGenerateContentUrl(modelId: string, apiKey: string): string;
/** Imagen 등 `:predict` RPC (AI Studio) */
export declare function buildAiStudioPredictUrl(modelId: string, apiKey: string): string;
export declare const DEFAULT_VERTEX_LOCATION = "us-central1";
/**
 * Vertex: `projects/.../locations/.../publishers/google/models/{modelId}:{method}`
 * `streamGenerateContent` → `?alt=sse` (AI Studio와 동일 패턴)
 * @see https://cloud.google.com/vertex-ai/docs/reference/rest
 */
export declare function buildVertexPublisherModelUrl(opts: {
    projectId: string;
    location?: string;
    modelId: string;
    method: 'generateContent' | 'streamGenerateContent' | 'predict';
    apiKey: string;
}): string;
export declare const DOC_URL_AI_STUDIO_API_KEY = "https://aistudio.google.com/app/apikey";
export declare const DOC_URL_VERTEX_API_KEYS = "https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys";
/** 스크립트, 봇 env 이름 (참고용, 런타임 읽기 없음) */
export declare const ENV_GOOGLE_AI: {
    /** AI Studio 스타일 API 키 (욘봇, 카카오 스크립트 등) */
    readonly apiKey: "GEMINI_API_KEY";
    readonly modelOverride: "GEMINI_MODEL";
    /** `aiStudio`(기본) 또는 `vertex`. `KARMO_AI_SURFACE` 우선, 없으면 `GEMINI_SURFACE` */
    readonly surfacePrimary: "KARMO_AI_SURFACE";
    readonly surfaceAlt: "GEMINI_SURFACE";
    readonly vertexApiKey: "VERTEX_API_KEY";
    readonly vertexProjectId: "VERTEX_PROJECT_ID";
    readonly vertexLocation: "VERTEX_LOCATION";
};
export type ModelProvider = 'gemini' | 'geminiImage' | 'imagen' | 'embedding';
/**
 * 텍스트 모델 가격, 품질 tier (provider-agnostic 라벨).
 *
 * - **lite**: 짧은 voicing/말투 보정, 요약, 라벨링. 응답 ≤ 200자. 가격 최저(2.5-flash 대비 ~1/3).
 * - **standard**: 일반 챗봇, QA, 코드 설명. 사용자 가시 응답. (현 default. 2.5-flash)
 * - **pro**: 복잡 추론, 긴 컨텍스트. /yawn 깊게 모드 등.
 *
 * env 오버라이드 `GEMINI_MODEL_LITE` / `GEMINI_MODEL_STANDARD` / `GEMINI_MODEL_PRO`.
 * 다른 provider 추가 시 동일 라벨 매핑 (예: OpenAI lite=gpt-4o-mini / standard=gpt-4o).
 */
export type GeminiTextTier = 'lite' | 'standard' | 'pro';
export interface ModelEntry {
    id: string;
    name: string;
    isDefault?: boolean;
    /** 텍스트 Gemini 한정: 가격, 품질 tier 라벨. 미지정 = standard 폴백 X (resolver 가 isDefault 사용). */
    tier?: GeminiTextTier;
}
export declare const MODEL_CATALOG: Record<ModelProvider, ModelEntry[]>;
export declare function getDefaultModelId(provider: ModelProvider): string;
/** 텍스트 generateContent 기본 모델 (AI Studio, Vertex 동일 모델 ID 문자열) */
export declare const DEFAULT_TEXT_MODEL_ID: string;
/**
 * tier 라벨 → Gemini 모델 id 해소. 우선순위:
 *  1. env override (`GEMINI_MODEL_LITE` / `GEMINI_MODEL_STANDARD` / `GEMINI_MODEL_PRO`)
 *  2. `MODEL_CATALOG.gemini` 에서 `tier === <tier>` 첫 entry
 *  3. tier=standard 면 `DEFAULT_TEXT_MODEL_ID`, 그 외엔 default 폴백
 *
 * tier 별 보장: lite ≥ 1/3 가격, pro ≥ 표준 품질. 새 모델 추가 시 `tier` 만 박으면
 * 자동 채택. caller 코드 변경 불요 (확장성 핵심).
 */
export declare function getGeminiModelIdForTier(tier: GeminiTextTier, env?: {
    GEMINI_MODEL_LITE?: string;
    GEMINI_MODEL_STANDARD?: string;
    GEMINI_MODEL_PRO?: string;
}): string;
export type { GenerationUsage, UsageMeta, UsageRecorder } from './usage';
export { setUsageRecorder, recordUsage, parseGeminiUsageMetadata } from './usage';
export type GeminiSafetyThreshold = 'OFF' | 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
export type GeminiSafetyCategory = 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT' | 'HARM_CATEGORY_DANGEROUS_CONTENT' | 'HARM_CATEGORY_CIVIC_INTEGRITY';
export type GeminiSafetySetting = {
    category: GeminiSafetyCategory;
    threshold: GeminiSafetyThreshold;
};
export type GeminiSafetyLevel = {
    value: GeminiSafetyThreshold;
    label: string;
};
export declare const DEFAULT_GEMINI_SAFETY_THRESHOLD: GeminiSafetyThreshold;
export declare const GEMINI_SAFETY_LEVELS: GeminiSafetyLevel[];
export declare const GEMINI_SAFETY_CATEGORIES: GeminiSafetyCategory[];
export declare function isGeminiSafetyThreshold(value: string): value is GeminiSafetyThreshold;
export declare function buildGeminiSafetySettings(threshold?: string | null): GeminiSafetySetting[];
