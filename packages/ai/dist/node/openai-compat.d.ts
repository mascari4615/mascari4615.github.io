import type { ChatContent } from './text';
export interface OpenAiCompatOptions {
    /** API base URL. OpenAI = https://api.openai.com/v1 / OpenRouter = https://openrouter.ai/api/v1 / vLLM = http://host:8000/v1 */
    baseUrl: string;
    /** Bearer token (OpenAI = sk-... / OpenRouter = sk-or-v1-... / self-host = 임의/없음) */
    apiKey?: string;
    /** Optional default model id (override 가능) */
    defaultModel?: string;
    /** OpenRouter 추천 헤더 (app 식별, 랭킹) */
    httpReferer?: string;
    appTitle?: string;
}
export type OpenAiRole = 'system' | 'user' | 'assistant';
export interface OpenAiMessage {
    role: OpenAiRole;
    content: string;
}
interface OpenAiResponse {
    error?: {
        message?: string;
        type?: string;
        code?: string | number;
    };
    choices?: Array<{
        message?: {
            role?: string;
            content?: string;
        };
        finish_reason?: string;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}
/** Gemini-shape `ChatContent[]` (role: 'user'|'model') → OpenAI messages */
export declare function geminiHistoryToOpenAiMessages(history: ChatContent[] | undefined, systemInstruction: string | undefined, userMessage: string): OpenAiMessage[];
export declare function generateOpenAiCompatText(opts: {
    config: OpenAiCompatOptions;
    modelId?: string | null;
    messages: OpenAiMessage[];
    maxOutputTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    modelId: string;
    usage?: OpenAiResponse['usage'];
}>;
export declare function openAiConfigFromEnv(env: NodeJS.ProcessEnv): OpenAiCompatOptions | null;
export declare function openRouterConfigFromEnv(env: NodeJS.ProcessEnv): OpenAiCompatOptions | null;
export {};
