// TASK-KAR-115-A — OpenAI Chat Completions 호환 어댑터.
//
// OpenAI / OpenRouter / vLLM / SGLang 등 OpenAI-API 호환 백엔드 공용.
// 별도 SDK 의존 X (fetch 만). yawnbot 의 generateAssistantText 호출 경로에서
// 사용. 기존 gemini/claude-cli/codex-cli 경로와 평행 (회귀 0).
//
// 정본 cross-cut: assistant-provider.ts (provider 라우팅),
// memo/tasks/TASK-KAR-115 § P1-A.

import type { ChatContent } from './text';

export interface OpenAiCompatOptions {
  /** API base URL. OpenAI = https://api.openai.com/v1 / OpenRouter = https://openrouter.ai/api/v1 / vLLM = http://host:8000/v1 */
  baseUrl: string;
  /** Bearer token (OpenAI = sk-... / OpenRouter = sk-or-v1-... / self-host = 임의/없음) */
  apiKey?: string;
  /** Optional default model id (override 가능) */
  defaultModel?: string;
  /** OpenRouter 추천 헤더 (app 식별·랭킹) */
  httpReferer?: string;
  appTitle?: string;
}

export type OpenAiRole = 'system' | 'user' | 'assistant';

export interface OpenAiMessage {
  role: OpenAiRole;
  content: string;
}

interface OpenAiResponse {
  error?: { message?: string; type?: string; code?: string | number };
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Gemini-shape `ChatContent[]` (role: 'user'|'model') → OpenAI messages */
export function geminiHistoryToOpenAiMessages(
  history: ChatContent[] | undefined,
  systemInstruction: string | undefined,
  userMessage: string,
): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  const sys = systemInstruction?.trim();
  if (sys) out.push({ role: 'system', content: sys });
  for (const h of history ?? []) {
    const role: OpenAiRole = h.role === 'model' ? 'assistant' : 'user';
    const content = (h.parts?.[0]?.text ?? '').toString();
    if (content) out.push({ role, content });
  }
  out.push({ role: 'user', content: userMessage });
  return out;
}

export async function generateOpenAiCompatText(opts: {
  config: OpenAiCompatOptions;
  modelId?: string | null;
  messages: OpenAiMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{ text: string; modelId: string; usage?: OpenAiResponse['usage'] }> {
  const base = opts.config.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const modelId = (opts.modelId?.trim() || opts.config.defaultModel || '').trim();
  if (!modelId) {
    throw new Error('openai-compat: model id 가 필요합니다 (modelId / config.defaultModel).');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.config.apiKey) headers['Authorization'] = `Bearer ${opts.config.apiKey}`;
  // OpenRouter 권장 헤더 — 다른 백엔드는 무시.
  if (opts.config.httpReferer) headers['HTTP-Referer'] = opts.config.httpReferer;
  if (opts.config.appTitle) headers['X-Title'] = opts.config.appTitle;

  const body: Record<string, unknown> = {
    model: modelId,
    messages: opts.messages,
  };
  if (typeof opts.maxOutputTokens === 'number') body.max_tokens = opts.maxOutputTokens;
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const raw = await res.text();
  let data: OpenAiResponse;
  try {
    data = JSON.parse(raw) as OpenAiResponse;
  } catch {
    throw new Error(`openai-compat 응답 파싱 실패 HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || `openai-compat HTTP ${res.status}: ${raw.slice(0, 400)}`,
    );
  }
  if (data.error) {
    throw new Error(data.error.message || `openai-compat error ${data.error.code ?? '?'}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (text == null || text === '') {
    throw new Error('openai-compat 응답에 텍스트 없음: ' + JSON.stringify(data).slice(0, 500));
  }
  return { text, modelId, usage: data.usage };
}

// ─── 백엔드별 env 해석 헬퍼 ─────────────────────────────────────────────

export function openAiConfigFromEnv(env: NodeJS.ProcessEnv): OpenAiCompatOptions | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    baseUrl: env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    apiKey,
    defaultModel: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
  };
}

export function openRouterConfigFromEnv(env: NodeJS.ProcessEnv): OpenAiCompatOptions | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    apiKey,
    defaultModel:
      env.OPENROUTER_MODEL?.trim() || 'anthropic/claude-3.5-sonnet',
    httpReferer: env.OPENROUTER_HTTP_REFERER?.trim() || 'https://github.com/Mascari4615',
    appTitle: env.OPENROUTER_APP_TITLE?.trim() || 'karmolab-ai',
  };
}
