import { type ChatContent } from './text';
export type AssistantAiProvider = 'gemini' | 'claude-cli' | 'codex-cli';
export declare function resolveAssistantProvider(env?: NodeJS.ProcessEnv): AssistantAiProvider;
/**
 * ASSISTANT_AI_PROVIDER 에 따라 Gemini, Claude CLI, Codex CLI로 텍스트 생성.
 * assistant-handler, memory-service 등에서 공통으로 사용.
 *
 * CLI 프로바이더일 때 env.ASSISTANT_AGENT_REPO_PATH 가 설정돼 있으면
 * 해당 경로를 cwd로 설정해 에이전트 모드(파일 읽기/편집/명령 실행)로 실행.
 */
export declare function generateAssistantText(env: NodeJS.ProcessEnv, prompt: string, opts?: {
    timeoutMs?: number;
    history?: ChatContent[];
    systemInstruction?: string;
}): Promise<{
    text: string;
    provider: AssistantAiProvider;
}>;
