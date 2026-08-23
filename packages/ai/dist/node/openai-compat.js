"use strict";
// TASK-KAR-115-A — OpenAI Chat Completions 호환 어댑터.
//
// OpenAI / OpenRouter / vLLM / SGLang 등 OpenAI-API 호환 백엔드 공용.
// 별도 SDK 의존 X (fetch 만). yawnbot 의 generateAssistantText 호출 경로에서
// 사용. 기존 gemini/claude-cli/codex-cli 경로와 평행 (회귀 0).
//
// 정본 cross-cut: assistant-provider.ts (provider 라우팅),
// memo/tasks/TASK-KAR-115 § P1-A.
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiHistoryToOpenAiMessages = geminiHistoryToOpenAiMessages;
exports.generateOpenAiCompatText = generateOpenAiCompatText;
exports.openAiConfigFromEnv = openAiConfigFromEnv;
exports.openRouterConfigFromEnv = openRouterConfigFromEnv;
/** Gemini-shape `ChatContent[]` (role: 'user'|'model') → OpenAI messages */
function geminiHistoryToOpenAiMessages(history, systemInstruction, userMessage) {
    const out = [];
    const sys = systemInstruction?.trim();
    if (sys)
        out.push({ role: 'system', content: sys });
    for (const h of history ?? []) {
        const role = h.role === 'model' ? 'assistant' : 'user';
        const content = (h.parts?.[0]?.text ?? '').toString();
        if (content)
            out.push({ role, content });
    }
    out.push({ role: 'user', content: userMessage });
    return out;
}
async function generateOpenAiCompatText(opts) {
    const base = opts.config.baseUrl.replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const modelId = (opts.modelId?.trim() || opts.config.defaultModel || '').trim();
    if (!modelId) {
        throw new Error('openai-compat: model id 가 필요합니다 (modelId / config.defaultModel).');
    }
    const headers = {
        'Content-Type': 'application/json',
    };
    if (opts.config.apiKey)
        headers['Authorization'] = `Bearer ${opts.config.apiKey}`;
    // OpenRouter 권장 헤더 — 다른 백엔드는 무시.
    if (opts.config.httpReferer)
        headers['HTTP-Referer'] = opts.config.httpReferer;
    if (opts.config.appTitle)
        headers['X-Title'] = opts.config.appTitle;
    const body = {
        model: modelId,
        messages: opts.messages,
    };
    if (typeof opts.maxOutputTokens === 'number')
        body.max_tokens = opts.maxOutputTokens;
    if (typeof opts.temperature === 'number')
        body.temperature = opts.temperature;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
    });
    const raw = await res.text();
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        throw new Error(`openai-compat 응답 파싱 실패 HTTP ${res.status}: ${raw.slice(0, 400)}`);
    }
    if (!res.ok) {
        throw new Error(data.error?.message || `openai-compat HTTP ${res.status}: ${raw.slice(0, 400)}`);
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
function openAiConfigFromEnv(env) {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey)
        return null;
    return {
        baseUrl: env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
        apiKey,
        defaultModel: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    };
}
function openRouterConfigFromEnv(env) {
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey)
        return null;
    return {
        baseUrl: env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
        apiKey,
        defaultModel: env.OPENROUTER_MODEL?.trim() || 'anthropic/claude-3.5-sonnet',
        httpReferer: env.OPENROUTER_HTTP_REFERER?.trim() || 'https://github.com/Mascari4615',
        appTitle: env.OPENROUTER_APP_TITLE?.trim() || '@karmo/ai',
    };
}
