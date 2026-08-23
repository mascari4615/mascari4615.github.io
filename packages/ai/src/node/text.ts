import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  type GoogleGenerativeSurface,
  type GeminiTextTier,
  type GenerationUsage,
  type UsageRecorder,
  buildVertexPublisherModelUrl,
  buildGeminiSafetySettings,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_TEXT_MODEL_ID,
  getGeminiModelIdForTier,
  parseGeminiUsageMetadata,
  recordUsage,
} from '../index';

export type ChatContent = { role: 'user' | 'model'; parts: [{ text: string }] };

/** generate 호출 결과 — text + usage 한 묶음. (TASK-KAR-145) */
export interface GeminiGenerateResult {
  text: string;
  usage: GenerationUsage;
  modelId: string;
  surface: GoogleGenerativeSurface;
}

export function resolveAiStudioTextModelId(modelFromEnv?: string | null): string {
  const t = modelFromEnv?.trim();
  return t || DEFAULT_TEXT_MODEL_ID;
}

/**
 * model id 해소 — tier(있으면) → env override(GEMINI_MODEL_*) → modelId param → GEMINI_MODEL env → default.
 * 우선순위 정렬: explicit modelId param 이 tier 보다 위. tier 는 caller 의 "용도 라벨", modelId 는 강제 지정.
 */
export function resolveGeminiModelId(opts: {
  modelId?: string | null;
  tier?: GeminiTextTier | null;
  env?: NodeJS.ProcessEnv;
}): string {
  const explicit = opts.modelId?.trim();
  if (explicit) return explicit;
  if (opts.tier) return getGeminiModelIdForTier(opts.tier, opts.env);
  const envOverride = opts.env?.GEMINI_MODEL?.trim();
  if (envOverride) return envOverride;
  return DEFAULT_TEXT_MODEL_ID;
}

/** AI Studio API 키 + 선택적 모델 오버라이드로 텍스트용 GenerativeModel */
export function createAiStudioTextModel(apiKey: string, modelId?: string | null) {
  const genAI = new GoogleGenerativeAI(apiKey.trim());
  return genAI.getGenerativeModel({ model: resolveAiStudioTextModelId(modelId) });
}

interface AiStudioResponseShape {
  usageMetadata?: Parameters<typeof parseGeminiUsageMetadata>[0];
  text: () => string;
}

/** 단일 문자열 프롬프트 → 응답 텍스트 + usage (AI Studio) */
export async function generateAiStudioText(opts: {
  apiKey: string;
  modelId?: string | null;
  prompt: string;
  systemInstruction?: string;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: GenerationUsage; modelId: string }> {
  const modelId = resolveAiStudioTextModelId(opts.modelId);
  const genAI = new GoogleGenerativeAI(opts.apiKey.trim());
  const model = genAI.getGenerativeModel({
    model: modelId,
    ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
  });
  const ro = opts.signal ? { signal: opts.signal } : undefined;
  const res = await model.generateContent(opts.prompt, ro);
  const response = res.response as unknown as AiStudioResponseShape;
  const text = response.text();
  const usage = parseGeminiUsageMetadata(response.usageMetadata);
  return { text, usage, modelId };
}

/** 멀티턴 대화 히스토리 + 현재 메시지 → 응답 텍스트 + usage (AI Studio Chat) */
export async function generateAiStudioChatText(opts: {
  apiKey: string;
  modelId?: string | null;
  systemInstruction?: string;
  history: ChatContent[];
  message: string;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: GenerationUsage; modelId: string }> {
  const modelId = resolveAiStudioTextModelId(opts.modelId);
  const model = createAiStudioTextModel(opts.apiKey, modelId);
  const chat = model.startChat({
    history: opts.history,
    ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
  });
  const ro = opts.signal ? { signal: opts.signal } : undefined;
  const res = await chat.sendMessage(opts.message, ro);
  const response = res.response as unknown as AiStudioResponseShape;
  const text = response.text();
  const usage = parseGeminiUsageMetadata(response.usageMetadata);
  return { text, usage, modelId };
}

type VertexJson = {
  error?: { message?: string; status?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: Parameters<typeof parseGeminiUsageMetadata>[0];
};

/** Vertex Publisher `generateContent` (API 키 인증, 브라우저 `gemini.ts`와 동일 REST 형태) */
export async function generateVertexText(opts: {
  apiKey: string;
  projectId: string;
  location?: string | null;
  modelId?: string | null;
  userText: string;
  history?: ChatContent[];
  systemInstruction?: string | null;
  safetyThreshold?: string | null;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: GenerationUsage; modelId: string }> {
  const modelId = resolveAiStudioTextModelId(opts.modelId);
  const loc = (opts.location?.trim() || DEFAULT_VERTEX_LOCATION).trim() || DEFAULT_VERTEX_LOCATION;
  const url = buildVertexPublisherModelUrl({
    projectId: opts.projectId.trim(),
    location: loc,
    modelId,
    method: 'generateContent',
    apiKey: opts.apiKey.trim(),
  });
  const historyContents = (opts.history ?? []).map((h) => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: h.parts,
  }));
  const body: Record<string, unknown> = {
    contents: [...historyContents, { role: 'user', parts: [{ text: opts.userText }] }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  const sys = opts.systemInstruction?.trim();
  if (sys) {
    body.systemInstruction = { parts: [{ text: sys }] };
  }
  const safetySettings = buildGeminiSafetySettings(opts.safetyThreshold);
  if (safetySettings.length > 0) body.safetySettings = safetySettings;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const raw = await res.text();
  let data: VertexJson;
  try {
    data = JSON.parse(raw) as VertexJson;
  } catch {
    throw new Error(`Vertex 응답 파싱 실패 HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || data.error?.status || `Vertex HTTP ${res.status}: ${raw.slice(0, 400)}`,
    );
  }
  if (data.error) {
    throw new Error(data.error.message || data.error.status || 'Vertex API 오류');
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text == null || text === '') {
    throw new Error('응답에 텍스트가 없습니다: ' + JSON.stringify(data).slice(0, 500));
  }
  const usage = parseGeminiUsageMetadata(data.usageMetadata);
  return { text, usage, modelId };
}

function readSurfaceRaw(env: NodeJS.ProcessEnv): string {
  return (
    env.KARMOLAB_AI_SURFACE?.trim() ||
    env.GEMINI_SURFACE?.trim() ||
    env.GOOGLE_GEN_SURFACE?.trim() ||
    ''
  );
}

/**
 * `vertex` | `vertex_ai` | `gcp_vertex` → Vertex, 그 외·비어 있음 → AI Studio.
 */
export function parseGenerativeSurfaceFromEnv(env: NodeJS.ProcessEnv = process.env): GoogleGenerativeSurface {
  const s = readSurfaceRaw(env).toLowerCase().replace(/-/g, '_');
  if (s === 'vertex' || s === 'vertex_ai' || s === 'gcp_vertex') return 'vertex';
  return 'aiStudio';
}

export type GenerativeTextClient = {
  surface: GoogleGenerativeSurface;
  /** 단일 사용자 프롬프트(또는 시스템+사용자를 한 덩어리로 넣은 문자열) */
  generateFromPrompt: (prompt: string, signal?: AbortSignal) => Promise<string>;
};

/** `/yawn` 슬래시: `.env` 기본 vs `aiStudio` / `vertex` 강제 */
export type GenerativeSurfaceOverride = 'inherit' | 'aiStudio' | 'vertex';

/**
 * 시스템+맥락+질문을 한 문자열로 묶어 보낼 때(AI Studio `generateContent` / Vertex `generateContent` REST).
 * `surface: inherit` 이면 `KARMOLAB_AI_SURFACE` 등과 동일 규칙.
 *
 * **TASK-KAR-145 확장**: `tier`/`tag`/`onUsage`/`systemInstruction` 추가.
 * - `tier`: lite/standard/pro 라벨 — `getGeminiModelIdForTier` 로 해소.
 *   `modelId` 명시 시 tier 무시 (explicit > tier).
 * - `tag`: telemetry 분류 라벨 (`yawnbot/voiced-worker` 등). usage 로그에 포함.
 * - `onUsage`: per-call 콜백. 전역 recorder(`KARMOLAB_AI_USAGE_LOG=1`) 와 둘 다 호출.
 * - `systemInstruction`: 안정 prefix → Vertex implicit cache 정렬 (cache hit 시 청구 25%).
 */
export async function generateBlobTextFromEnvWithOptions(
  env: NodeJS.ProcessEnv,
  blobPrompt: string,
  options: {
    surface?: GenerativeSurfaceOverride;
    modelId?: string | null;
    tier?: GeminiTextTier | null;
    systemInstruction?: string;
    tag?: string;
    onUsage?: UsageRecorder | null;
    signal?: AbortSignal;
  } = {},
): Promise<{ text: string; surface: GoogleGenerativeSurface; modelId: string; usage: GenerationUsage }> {
  const surfaceChoice: GenerativeSurfaceOverride = options.surface ?? 'inherit';
  const surface: GoogleGenerativeSurface =
    surfaceChoice === 'inherit' ? parseGenerativeSurfaceFromEnv(env) : surfaceChoice;

  const effectiveModelId = resolveGeminiModelId({
    modelId: options.modelId,
    tier: options.tier,
    env,
  });

  const t0 = Date.now();
  const callMeta = {
    provider: 'gemini',
    surface,
    tier: options.tier ?? undefined,
    tag: options.tag,
  };

  if (surface === 'vertex') {
    const apiKey = env.VERTEX_API_KEY?.trim();
    const projectId = env.VERTEX_PROJECT_ID?.trim();
    if (!apiKey || !projectId) {
      throw new Error('Vertex API: .env에 VERTEX_API_KEY와 VERTEX_PROJECT_ID가 필요합니다.');
    }
    const location = env.VERTEX_LOCATION?.trim() || undefined;
    const { text, usage, modelId } = await generateVertexText({
      apiKey,
      projectId,
      location,
      modelId: effectiveModelId,
      userText: blobPrompt,
      systemInstruction: options.systemInstruction,
      safetyThreshold: env.VERTEX_SAFETY_THRESHOLD?.trim() || null,
      signal: options.signal,
    });
    recordUsage(usage, { ...callMeta, modelId, durationMs: Date.now() - t0, ts: new Date().toISOString() }, options.onUsage);
    return { text, surface: 'vertex', modelId, usage };
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('AI Studio API: .env에 GEMINI_API_KEY가 필요합니다.');
  }
  const { text, usage, modelId } = await generateAiStudioText({
    apiKey,
    modelId: effectiveModelId,
    prompt: blobPrompt,
    systemInstruction: options.systemInstruction,
    signal: options.signal,
  });
  recordUsage(usage, { ...callMeta, modelId, durationMs: Date.now() - t0, ts: new Date().toISOString() }, options.onUsage);
  return { text, surface: 'aiStudio', modelId, usage };
}

/**
 * `.env` 기준으로 호출 가능한 텍스트 클라이언트를 만듦. 자격이 없으면 `null`.
 *
 * - **AI Studio (기본):** `GEMINI_API_KEY` 필수, `GEMINI_MODEL` 선택
 * - **Vertex:** `KARMOLAB_AI_SURFACE=vertex`(또는 `GEMINI_SURFACE`) + `VERTEX_API_KEY`, `VERTEX_PROJECT_ID` 필수, `VERTEX_LOCATION`·`GEMINI_MODEL` 선택
 *
 * TASK-KAR-145: tier 옵션 추가. 클라이언트 생성 시점에 tier 고정 — 호출별 가변 케이스는
 * `generateBlobTextFromEnvWithOptions` 직접 사용.
 */
export function tryCreateGenerativeTextFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: { tier?: GeminiTextTier | null; tag?: string } = {},
): GenerativeTextClient | null {
  const surface = parseGenerativeSurfaceFromEnv(env);
  if (surface === 'vertex') {
    const apiKey = env.VERTEX_API_KEY?.trim();
    const projectId = env.VERTEX_PROJECT_ID?.trim();
    if (!apiKey || !projectId) return null;
    const location = env.VERTEX_LOCATION?.trim() || undefined;
    const modelId = resolveGeminiModelId({ tier: opts.tier, env });
    return {
      surface: 'vertex',
      async generateFromPrompt(prompt: string, signal?: AbortSignal) {
        const t0 = Date.now();
        const r = await generateVertexText({
          apiKey, projectId, location, modelId, userText: prompt, signal,
        });
        recordUsage(r.usage, {
          provider: 'gemini', surface: 'vertex', modelId: r.modelId,
          tier: opts.tier ?? undefined, tag: opts.tag,
          durationMs: Date.now() - t0, ts: new Date().toISOString(),
        });
        return r.text;
      },
    };
  }
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const modelId = resolveGeminiModelId({ tier: opts.tier, env });
  return {
    surface: 'aiStudio',
    async generateFromPrompt(prompt: string, signal?: AbortSignal) {
      const t0 = Date.now();
      const r = await generateAiStudioText({ apiKey, modelId, prompt, signal });
      recordUsage(r.usage, {
        provider: 'gemini', surface: 'aiStudio', modelId: r.modelId,
        tier: opts.tier ?? undefined, tag: opts.tag,
        durationMs: Date.now() - t0, ts: new Date().toISOString(),
      });
      return r.text;
    },
  };
}

/** `tryCreateGenerativeTextFromEnv`가 `null`일 때 안내용 */
export function generativeEnvHint(env: NodeJS.ProcessEnv = process.env): string {
  if (parseGenerativeSurfaceFromEnv(env) === 'vertex') {
    return 'Vertex 모드: .env에 VERTEX_API_KEY, VERTEX_PROJECT_ID 가 필요합니다. (선택: VERTEX_LOCATION, GEMINI_MODEL)';
  }
  return 'AI Studio 모드: .env에 GEMINI_API_KEY 가 필요합니다. (선택: GEMINI_MODEL, 또는 KARMOLAB_AI_SURFACE=vertex 로 전환)';
}
