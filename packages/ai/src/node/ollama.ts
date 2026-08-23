// TASK-KAR-115-A — Ollama (local self-host) 어댑터.
//
// Ollama HTTP API: POST {base}/api/chat. messages = [{role,content}] OpenAI-호환.
// 별도 SDK 의존 X. API key 불요 (로컬). vLLM/SGLang 은 OpenAI-호환이라
// openai-compat.ts 사용 — Ollama 만 응답 shape 가 다르므로 분리.
//
// 정본 cross-cut: assistant-provider.ts § P1-A.

import type { OpenAiMessage } from './openai-compat';

export interface OllamaConfig {
  /** Ollama 서버 base URL. default = http://localhost:11434 */
  baseUrl: string;
  /** Default model id (override 가능). 예: llama3.2 / qwen2.5 / phi3 */
  defaultModel: string;
}

interface OllamaChatResponse {
  error?: string;
  message?: { role?: string; content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export async function generateOllamaText(opts: {
  config: OllamaConfig;
  modelId?: string | null;
  messages: OpenAiMessage[];
  signal?: AbortSignal;
  /** Ollama options (temperature / num_predict 등) — 그대로 전달 */
  options?: Record<string, unknown>;
}): Promise<{ text: string; modelId: string }> {
  const base = opts.config.baseUrl.replace(/\/+$/, '');
  const url = `${base}/api/chat`;
  const modelId = (opts.modelId?.trim() || opts.config.defaultModel).trim();
  if (!modelId) {
    throw new Error('ollama: model id 가 필요합니다 (modelId / config.defaultModel).');
  }

  const body: Record<string, unknown> = {
    model: modelId,
    messages: opts.messages,
    stream: false,
  };
  if (opts.options && Object.keys(opts.options).length > 0) body.options = opts.options;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const raw = await res.text();
  let data: OllamaChatResponse;
  try {
    data = JSON.parse(raw) as OllamaChatResponse;
  } catch {
    throw new Error(`ollama 응답 파싱 실패 HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(data.error || `ollama HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  if (data.error) {
    throw new Error(`ollama error: ${data.error}`);
  }
  const text = data.message?.content;
  if (text == null || text === '') {
    throw new Error('ollama 응답에 텍스트 없음: ' + JSON.stringify(data).slice(0, 500));
  }
  return { text, modelId };
}

export function ollamaConfigFromEnv(env: NodeJS.ProcessEnv): OllamaConfig | null {
  const explicitUrl = env.OLLAMA_BASE_URL?.trim();
  const explicitModel = env.OLLAMA_MODEL?.trim();
  // explicit URL 또는 model 둘 중 하나라도 있으면 활성. 둘 다 없으면 비활성
  // (로컬 Ollama 미사용 환경 — silent skip).
  if (!explicitUrl && !explicitModel) return null;
  return {
    baseUrl: explicitUrl || 'http://localhost:11434',
    defaultModel: explicitModel || 'llama3.2',
  };
}
