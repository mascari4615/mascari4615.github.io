"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAssistantProvider = resolveAssistantProvider;
exports.generateAssistantText = generateAssistantText;
const cli_claude_1 = require("./cli-claude");
const cli_codex_1 = require("./cli-codex");
const text_1 = require("./text");
function resolveAssistantProvider(env = process.env) {
    const raw = (env.ASSISTANT_AI_PROVIDER ?? '').trim().toLowerCase();
    if (raw === 'claude-cli' || raw === 'claude')
        return 'claude-cli';
    if (raw === 'codex-cli' || raw === 'codex')
        return 'codex-cli';
    return 'gemini';
}
/**
 * ASSISTANT_AI_PROVIDER 에 따라 Gemini, Claude CLI, Codex CLI로 텍스트 생성.
 * assistant-handler, memory-service 등에서 공통으로 사용.
 *
 * CLI 프로바이더일 때 env.ASSISTANT_AGENT_REPO_PATH 가 설정돼 있으면
 * 해당 경로를 cwd로 설정해 에이전트 모드(파일 읽기/편집/명령 실행)로 실행.
 */
async function generateAssistantText(env, prompt, opts = {}) {
    const provider = resolveAssistantProvider(env);
    if (provider === 'claude-cli') {
        const cwd = env.ASSISTANT_AGENT_REPO_PATH?.trim() || undefined;
        const text = await (0, cli_claude_1.generateClaudeCliText)({ prompt, timeoutMs: opts.timeoutMs, cwd });
        return { text, provider: 'claude-cli' };
    }
    if (provider === 'codex-cli') {
        const cwd = env.ASSISTANT_AGENT_REPO_PATH?.trim() || undefined;
        const text = await (0, cli_codex_1.generateCodexCliText)({ prompt, timeoutMs: opts.timeoutMs, cwd });
        return { text, provider: 'codex-cli' };
    }
    if (opts.systemInstruction || (opts.history && opts.history.length > 0)) {
        const surface = (0, text_1.parseGenerativeSurfaceFromEnv)(env);
        if (surface === 'vertex') {
            const apiKey = env.VERTEX_API_KEY?.trim();
            const projectId = env.VERTEX_PROJECT_ID?.trim();
            if (!apiKey || !projectId) {
                throw new Error('Vertex API: .env에 VERTEX_API_KEY와 VERTEX_PROJECT_ID가 필요합니다.');
            }
            const text = await (0, text_1.generateVertexText)({
                apiKey,
                projectId,
                location: env.VERTEX_LOCATION?.trim() || null,
                modelId: (0, text_1.resolveAiStudioTextModelId)(env.GEMINI_MODEL),
                userText: prompt,
                systemInstruction: opts.systemInstruction,
                history: opts.history,
                safetyThreshold: env.VERTEX_SAFETY_THRESHOLD?.trim() || null,
            });
            return { text, provider: 'gemini' };
        }
        const apiKey = env.GEMINI_API_KEY?.trim();
        if (!apiKey)
            throw new Error('AI Studio API: .env에 GEMINI_API_KEY가 필요합니다.');
        const modelId = (0, text_1.resolveAiStudioTextModelId)(env.GEMINI_MODEL);
        const text = await (0, text_1.generateAiStudioChatText)({
            apiKey,
            modelId,
            systemInstruction: opts.systemInstruction,
            history: opts.history ?? [],
            message: prompt,
        });
        return { text, provider: 'gemini' };
    }
    const { text } = await (0, text_1.generateBlobTextFromEnvWithOptions)(env, prompt, { surface: 'inherit' });
    return { text, provider: 'gemini' };
}
