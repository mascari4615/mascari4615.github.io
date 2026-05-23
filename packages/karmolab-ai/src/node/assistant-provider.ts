import { generateClaudeCliText } from './cli-claude';
import { generateCodexCliText } from './cli-codex';
import {
  geminiHistoryToOpenAiMessages,
  generateOpenAiCompatText,
  openAiConfigFromEnv,
  openRouterConfigFromEnv,
} from './openai-compat';
import { generateOllamaText, ollamaConfigFromEnv } from './ollama';
import {
  type ChatContent,
  generateAiStudioChatText,
  generateBlobTextFromEnvWithOptions,
  generateVertexText,
  parseGenerativeSurfaceFromEnv,
  resolveAiStudioTextModelId,
} from './text';

// TASK-KAR-115-A — provider union 확장. 기존 3종(gemini/claude-cli/codex-cli)
// 동작 변경 0 (회귀 베이스라인). 신규 = openai/ollama/openrouter.
export type AssistantAiProvider =
  | 'gemini'
  | 'claude-cli'
  | 'codex-cli'
  | 'openai'
  | 'ollama'
  | 'openrouter';

const ALL_PROVIDERS: ReadonlySet<AssistantAiProvider> = new Set<AssistantAiProvider>([
  'gemini',
  'claude-cli',
  'codex-cli',
  'openai',
  'ollama',
  'openrouter',
]);

function normalizeProviderName(raw: string): AssistantAiProvider | null {
  const s = raw.trim().toLowerCase();
  if (s === 'claude-cli' || s === 'claude') return 'claude-cli';
  if (s === 'codex-cli' || s === 'codex') return 'codex-cli';
  if (s === 'openai' || s === 'gpt') return 'openai';
  if (s === 'ollama' || s === 'local') return 'ollama';
  if (s === 'openrouter' || s === 'or') return 'openrouter';
  if (s === 'gemini' || s === 'google' || s === 'vertex' || s === 'aistudio') return 'gemini';
  return null;
}

export function resolveAssistantProvider(env: NodeJS.ProcessEnv = process.env): AssistantAiProvider {
  const raw = (env.ASSISTANT_AI_PROVIDER ?? '').trim();
  const norm = normalizeProviderName(raw);
  return norm ?? 'gemini';
}

/**
 * `ASSISTANT_AI_FALLBACK_CHAIN=claude-cli,gemini,openrouter` 형식 파싱.
 * 미설정 시 primary provider 만 시도(체인 X). 첫 성공 = 반환. 모두 실패 = 마지막 에러 throw.
 *
 * primary 가 chain 에 없으면 맨 앞에 자동 prepend (1순위 보장).
 */
export function resolveProviderChain(
  env: NodeJS.ProcessEnv,
  primary: AssistantAiProvider,
): AssistantAiProvider[] {
  const raw = (env.ASSISTANT_AI_FALLBACK_CHAIN ?? '').trim();
  if (!raw) return [primary];
  const parts = raw
    .split(/[,;\s]+/)
    .map((p) => normalizeProviderName(p))
    .filter((p): p is AssistantAiProvider => p != null && ALL_PROVIDERS.has(p));
  const chain = parts.length > 0 ? parts : [primary];
  if (!chain.includes(primary)) chain.unshift(primary);
  return chain;
}

// ─── per-provider 단일 호출 ───────────────────────────────────────────────

async function callOne(
  provider: AssistantAiProvider,
  env: NodeJS.ProcessEnv,
  prompt: string,
  opts: { timeoutMs?: number; history?: ChatContent[]; systemInstruction?: string },
): Promise<string> {
  if (provider === 'claude-cli') {
    const cwd = env.ASSISTANT_AGENT_REPO_PATH?.trim() || undefined;
    return generateClaudeCliText({ prompt, timeoutMs: opts.timeoutMs, cwd });
  }
  if (provider === 'codex-cli') {
    const cwd = env.ASSISTANT_AGENT_REPO_PATH?.trim() || undefined;
    return generateCodexCliText({ prompt, timeoutMs: opts.timeoutMs, cwd });
  }
  if (provider === 'openai') {
    const config = openAiConfigFromEnv(env);
    if (!config) throw new Error('openai: OPENAI_API_KEY 가 .env 에 필요합니다.');
    const messages = geminiHistoryToOpenAiMessages(opts.history, opts.systemInstruction, prompt);
    const { text } = await generateOpenAiCompatText({ config, messages });
    return text;
  }
  if (provider === 'openrouter') {
    const config = openRouterConfigFromEnv(env);
    if (!config) throw new Error('openrouter: OPENROUTER_API_KEY 가 .env 에 필요합니다.');
    const messages = geminiHistoryToOpenAiMessages(opts.history, opts.systemInstruction, prompt);
    const { text } = await generateOpenAiCompatText({ config, messages });
    return text;
  }
  if (provider === 'ollama') {
    const config = ollamaConfigFromEnv(env);
    if (!config) throw new Error('ollama: OLLAMA_BASE_URL 또는 OLLAMA_MODEL 이 .env 에 필요합니다.');
    const messages = geminiHistoryToOpenAiMessages(opts.history, opts.systemInstruction, prompt);
    const { text } = await generateOllamaText({ config, messages });
    return text;
  }
  // provider === 'gemini' (default) — 기존 경로 그대로 (회귀 0).
  if (opts.systemInstruction || (opts.history && opts.history.length > 0)) {
    const surface = parseGenerativeSurfaceFromEnv(env);
    if (surface === 'vertex') {
      const apiKey = env.VERTEX_API_KEY?.trim();
      const projectId = env.VERTEX_PROJECT_ID?.trim();
      if (!apiKey || !projectId) {
        throw new Error('Vertex API: .env에 VERTEX_API_KEY와 VERTEX_PROJECT_ID가 필요합니다.');
      }
      return generateVertexText({
        apiKey,
        projectId,
        location: env.VERTEX_LOCATION?.trim() || null,
        modelId: resolveAiStudioTextModelId(env.GEMINI_MODEL),
        userText: prompt,
        systemInstruction: opts.systemInstruction,
        history: opts.history,
        safetyThreshold: env.VERTEX_SAFETY_THRESHOLD?.trim() || null,
      });
    }
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error('AI Studio API: .env에 GEMINI_API_KEY가 필요합니다.');
    const modelId = resolveAiStudioTextModelId(env.GEMINI_MODEL);
    return generateAiStudioChatText({
      apiKey,
      modelId,
      systemInstruction: opts.systemInstruction,
      history: opts.history ?? [],
      message: prompt,
    });
  }
  const { text } = await generateBlobTextFromEnvWithOptions(env, prompt, { surface: 'inherit' });
  return text;
}

/**
 * ASSISTANT_AI_PROVIDER 에 따라 라우팅. ASSISTANT_AI_FALLBACK_CHAIN 설정 시
 * 체인 순서대로 시도, 첫 성공 반환. assistant-handler, memory-service 등에서 공통 사용.
 *
 * CLI 프로바이더(claude-cli/codex-cli)일 때 env.ASSISTANT_AGENT_REPO_PATH 가
 * 설정돼 있으면 해당 경로를 cwd로 설정해 에이전트 모드로 실행.
 */
export async function generateAssistantText(
  env: NodeJS.ProcessEnv,
  prompt: string,
  opts: { timeoutMs?: number; history?: ChatContent[]; systemInstruction?: string } = {},
): Promise<{ text: string; provider: AssistantAiProvider }> {
  const primary = resolveAssistantProvider(env);
  const chain = resolveProviderChain(env, primary);

  let lastError: Error | null = null;
  for (const provider of chain) {
    try {
      const text = await callOne(provider, env, prompt, opts);
      return { text, provider };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // 다음 fallback 으로 진행 — silent. caller 가 chain 결과만 받음.
      // (debug 시 process.env.ASSISTANT_AI_DEBUG=1 로 stderr.)
      if (env.ASSISTANT_AI_DEBUG === '1') {
        process.stderr.write(`[assistant-provider] ${provider} 실패: ${lastError.message}\n`);
      }
    }
  }
  // 체인 모두 실패 — 마지막 에러 throw (caller 가 진단 가능).
  throw lastError ?? new Error('assistant-provider: 사용 가능한 provider 가 없습니다.');
}
