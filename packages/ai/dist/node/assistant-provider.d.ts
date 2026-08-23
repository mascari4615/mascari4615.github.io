import { type ChatContent } from './text';
import { type GeminiTextTier, type UsageRecorder } from '../index';
export type AssistantAiProvider = 'gemini' | 'claude-cli' | 'codex-cli' | 'openai' | 'ollama' | 'openrouter';
export declare function resolveAssistantProvider(env?: NodeJS.ProcessEnv): AssistantAiProvider;
/**
 * `ASSISTANT_AI_FALLBACK_CHAIN=claude-cli,gemini,openrouter` 형식 파싱.
 * 미설정 시 primary provider 만 시도(체인 X). 첫 성공 = 반환. 모두 실패 = 마지막 에러 throw.
 *
 * primary 가 chain 에 없으면 맨 앞에 자동 prepend (1순위 보장).
 */
export declare function resolveProviderChain(env: NodeJS.ProcessEnv, primary: AssistantAiProvider): AssistantAiProvider[];
/**
 * ASSISTANT_AI_PROVIDER 에 따라 라우팅. ASSISTANT_AI_FALLBACK_CHAIN 설정 시
 * 체인 순서대로 시도, 첫 성공 반환. assistant-handler, memory-service 등에서 공통 사용.
 *
 * CLI 프로바이더(claude-cli/codex-cli)일 때 env.ASSISTANT_AGENT_REPO_PATH 가
 * 설정돼 있으면 해당 경로를 cwd로 설정해 에이전트 모드로 실행.
 */
export declare function generateAssistantText(env: NodeJS.ProcessEnv, prompt: string, opts?: {
    timeoutMs?: number;
    history?: ChatContent[];
    systemInstruction?: string;
    tier?: GeminiTextTier | null;
    tag?: string;
    onUsage?: UsageRecorder | null;
}): Promise<{
    text: string;
    provider: AssistantAiProvider;
}>;
