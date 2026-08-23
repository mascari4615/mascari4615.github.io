"use strict";
/**
 * KarmoLabAI — Google Generative AI 공통 계약 (AI Studio + Vertex AI).
 * 브라우저/Node 공통: 모델 카탈로그, REST URL 조립, 문서·기본 리전 등. fetch·키 저장 없음.
 * Node에서 `@google/generative-ai` 호출까지 맞출 때는 서브패스 `@karmo/ai/node` 참고.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEMINI_SAFETY_CATEGORIES = exports.GEMINI_SAFETY_LEVELS = exports.DEFAULT_GEMINI_SAFETY_THRESHOLD = exports.parseGeminiUsageMetadata = exports.recordUsage = exports.setUsageRecorder = exports.DEFAULT_TEXT_MODEL_ID = exports.MODEL_CATALOG = exports.ENV_GOOGLE_AI = exports.DOC_URL_VERTEX_API_KEYS = exports.DOC_URL_AI_STUDIO_API_KEY = exports.DEFAULT_VERTEX_LOCATION = exports.AI_STUDIO_GENERATIVE_BASE = exports.AI_STUDIO_GENERATIVE_HOST = void 0;
exports.buildAiStudioGenerateContentUrl = buildAiStudioGenerateContentUrl;
exports.buildAiStudioStreamGenerateContentUrl = buildAiStudioStreamGenerateContentUrl;
exports.buildAiStudioPredictUrl = buildAiStudioPredictUrl;
exports.buildVertexPublisherModelUrl = buildVertexPublisherModelUrl;
exports.getDefaultModelId = getDefaultModelId;
exports.getGeminiModelIdForTier = getGeminiModelIdForTier;
exports.isGeminiSafetyThreshold = isGeminiSafetyThreshold;
exports.buildGeminiSafetySettings = buildGeminiSafetySettings;
// ─── AI Studio (Generative Language API, API 키 = AI Studio / Google AI) ─
exports.AI_STUDIO_GENERATIVE_HOST = 'generativelanguage.googleapis.com';
exports.AI_STUDIO_GENERATIVE_BASE = `https://${exports.AI_STUDIO_GENERATIVE_HOST}/v1beta`;
function buildAiStudioGenerateContentUrl(modelId, apiKey) {
    return `${exports.AI_STUDIO_GENERATIVE_BASE}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}
function buildAiStudioStreamGenerateContentUrl(modelId, apiKey) {
    return `${exports.AI_STUDIO_GENERATIVE_BASE}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
}
/** Imagen 등 `:predict` RPC (AI Studio) */
function buildAiStudioPredictUrl(modelId, apiKey) {
    return `${exports.AI_STUDIO_GENERATIVE_BASE}/models/${encodeURIComponent(modelId)}:predict?key=${encodeURIComponent(apiKey)}`;
}
// ─── Vertex AI (regional aiplatform, GCP 프로젝트 + 리전 + API 키) ───────
exports.DEFAULT_VERTEX_LOCATION = 'us-central1';
/**
 * Vertex: `projects/.../locations/.../publishers/google/models/{modelId}:{method}`
 * `streamGenerateContent` → `?alt=sse` (AI Studio와 동일 패턴)
 * @see https://cloud.google.com/vertex-ai/docs/reference/rest
 */
function buildVertexPublisherModelUrl(opts) {
    const loc = (opts.location || exports.DEFAULT_VERTEX_LOCATION).trim() || exports.DEFAULT_VERTEX_LOCATION;
    const pid = encodeURIComponent(opts.projectId.trim());
    const locEnc = encodeURIComponent(loc);
    const mid = encodeURIComponent(opts.modelId);
    const key = encodeURIComponent(opts.apiKey);
    const q = opts.method === 'streamGenerateContent' ? `?alt=sse&key=${key}` : `?key=${key}`;
    return (`https://${locEnc}-aiplatform.googleapis.com/v1/projects/${pid}` +
        `/locations/${locEnc}/publishers/google/models/${mid}:${opts.method}${q}`);
}
// ─── 문서 / 온보딩 URL ───────────────────────────────────────────────────
exports.DOC_URL_AI_STUDIO_API_KEY = 'https://aistudio.google.com/app/apikey';
exports.DOC_URL_VERTEX_API_KEYS = 'https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys';
/** 스크립트·봇 env 이름 (참고용, 런타임 읽기 없음) */
exports.ENV_GOOGLE_AI = {
    /** AI Studio 스타일 API 키 (욘봇·카카오 스크립트 등) */
    apiKey: 'GEMINI_API_KEY',
    modelOverride: 'GEMINI_MODEL',
    /** `aiStudio`(기본) 또는 `vertex` — `KARMOLAB_AI_SURFACE` 우선, 없으면 `GEMINI_SURFACE` */
    surfacePrimary: 'KARMOLAB_AI_SURFACE',
    surfaceAlt: 'GEMINI_SURFACE',
    vertexApiKey: 'VERTEX_API_KEY',
    vertexProjectId: 'VERTEX_PROJECT_ID',
    vertexLocation: 'VERTEX_LOCATION',
};
exports.MODEL_CATALOG = {
    gemini: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', isDefault: true, tier: 'standard' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tier: 'pro' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2 Flash' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2 Flash Lite' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', tier: 'lite' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
        { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
    ],
    geminiImage: [
        { id: 'gemini-2.5-flash-image', name: 'Nano Banana (Gemini 2.5 Flash Image)', isDefault: true },
        { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro (Gemini 3 Pro Image)' },
        { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2 (Gemini 3.1 Flash Image)' },
    ],
    imagen: [
        { id: 'imagen-4.0-generate-001', name: 'Imagen 4 Generate', isDefault: true },
        { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra Generate' },
        { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast Generate' },
    ],
    /**
     * 임베딩 모델.
     * - AI Studio 기본: gemini-embedding-001 (3072d)
     * - Vertex 기본:    text-embedding-004 (768d, task-type 지원)
     * `EMBEDDING_MODEL_ID` 환경변수로 오버라이드 가능.
     */
    embedding: [
        { id: 'gemini-embedding-001', name: 'Gemini Embedding 001 (AI Studio)', isDefault: true },
        { id: 'gemini-embedding-2-preview', name: 'Gemini Embedding 2 Preview (AI Studio)' },
        { id: 'text-embedding-004', name: 'Text Embedding 004 (Vertex)' },
        { id: 'text-embedding-005', name: 'Text Embedding 005 (Vertex)' },
    ],
};
function getDefaultModelId(provider) {
    const models = exports.MODEL_CATALOG[provider];
    if (!models?.length)
        return '';
    const def = models.find((m) => m.isDefault);
    return def ? def.id : models[0].id;
}
/** 텍스트 generateContent 기본 모델 (AI Studio·Vertex 동일 모델 ID 문자열) */
exports.DEFAULT_TEXT_MODEL_ID = getDefaultModelId('gemini');
/**
 * tier 라벨 → Gemini 모델 id 해소. 우선순위:
 *  1. env override (`GEMINI_MODEL_LITE` / `GEMINI_MODEL_STANDARD` / `GEMINI_MODEL_PRO`)
 *  2. `MODEL_CATALOG.gemini` 에서 `tier === <tier>` 첫 entry
 *  3. tier=standard 면 `DEFAULT_TEXT_MODEL_ID`, 그 외엔 default 폴백
 *
 * tier 별 보장: lite ≥ 1/3 가격, pro ≥ 표준 품질. 새 모델 추가 시 `tier` 만 박으면
 * 자동 채택 — caller 코드 변경 불요 (확장성 핵심).
 */
function getGeminiModelIdForTier(tier, env) {
    if (env) {
        const overrideKey = tier === 'lite' ? 'GEMINI_MODEL_LITE' :
            tier === 'pro' ? 'GEMINI_MODEL_PRO' :
                'GEMINI_MODEL_STANDARD';
        const ov = env[overrideKey]?.trim();
        if (ov)
            return ov;
    }
    const match = exports.MODEL_CATALOG.gemini.find((m) => m.tier === tier);
    if (match)
        return match.id;
    return exports.DEFAULT_TEXT_MODEL_ID;
}
var usage_1 = require("./usage");
Object.defineProperty(exports, "setUsageRecorder", { enumerable: true, get: function () { return usage_1.setUsageRecorder; } });
Object.defineProperty(exports, "recordUsage", { enumerable: true, get: function () { return usage_1.recordUsage; } });
Object.defineProperty(exports, "parseGeminiUsageMetadata", { enumerable: true, get: function () { return usage_1.parseGeminiUsageMetadata; } });
exports.DEFAULT_GEMINI_SAFETY_THRESHOLD = 'BLOCK_ONLY_HIGH';
exports.GEMINI_SAFETY_LEVELS = [
    { value: 'OFF', label: '끄기 (OFF)' },
    { value: 'BLOCK_NONE', label: '차단 없음 (BLOCK_NONE)' },
    { value: 'BLOCK_ONLY_HIGH', label: '높음만 차단 (BLOCK_ONLY_HIGH)' },
    { value: 'BLOCK_MEDIUM_AND_ABOVE', label: '중간 이상 차단 (BLOCK_MEDIUM_AND_ABOVE)' },
    { value: 'BLOCK_LOW_AND_ABOVE', label: '낮음 이상 차단 (BLOCK_LOW_AND_ABOVE)' },
];
exports.GEMINI_SAFETY_CATEGORIES = [
    'HARM_CATEGORY_HARASSMENT',
    'HARM_CATEGORY_HATE_SPEECH',
    'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    'HARM_CATEGORY_DANGEROUS_CONTENT',
    'HARM_CATEGORY_CIVIC_INTEGRITY',
];
function isGeminiSafetyThreshold(value) {
    return exports.GEMINI_SAFETY_LEVELS.some((level) => level.value === value);
}
function buildGeminiSafetySettings(threshold) {
    const raw = threshold?.trim();
    if (!raw || !isGeminiSafetyThreshold(raw))
        return [];
    return exports.GEMINI_SAFETY_CATEGORIES.map((category) => ({ category, threshold: raw }));
}
