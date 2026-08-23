import type { OpenAiMessage } from './openai-compat';
export interface OllamaConfig {
    /** Ollama 서버 base URL. default = http://localhost:11434 */
    baseUrl: string;
    /** Default model id (override 가능). 예: llama3.2 / qwen2.5 / phi3 */
    defaultModel: string;
}
export declare function generateOllamaText(opts: {
    config: OllamaConfig;
    modelId?: string | null;
    messages: OpenAiMessage[];
    signal?: AbortSignal;
    /** Ollama options (temperature / num_predict 등) — 그대로 전달 */
    options?: Record<string, unknown>;
}): Promise<{
    text: string;
    modelId: string;
}>;
export declare function ollamaConfigFromEnv(env: NodeJS.ProcessEnv): OllamaConfig | null;
