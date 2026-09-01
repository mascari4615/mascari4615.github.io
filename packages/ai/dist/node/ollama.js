"use strict";
// TASK-KAR-115-A. Ollama (local self-host) 어댑터.
//
// Ollama HTTP API: POST {base}/api/chat. messages = [{role,content}] OpenAI-호환.
// 별도 SDK 의존 X. API key 불요 (로컬). vLLM/SGLang 은 OpenAI-호환이라
// openai-compat.ts 사용. Ollama 만 응답 shape 가 다르므로 분리.
//
// 정본 cross-cut: assistant-provider.ts § P1-A.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOllamaText = generateOllamaText;
exports.ollamaConfigFromEnv = ollamaConfigFromEnv;
async function generateOllamaText(opts) {
    const base = opts.config.baseUrl.replace(/\/+$/, '');
    const url = `${base}/api/chat`;
    const modelId = (opts.modelId?.trim() || opts.config.defaultModel).trim();
    if (!modelId) {
        throw new Error('ollama: model id 가 필요합니다 (modelId / config.defaultModel).');
    }
    const body = {
        model: modelId,
        messages: opts.messages,
        stream: false,
    };
    if (opts.options && Object.keys(opts.options).length > 0)
        body.options = opts.options;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
    });
    const raw = await res.text();
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
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
function ollamaConfigFromEnv(env) {
    const explicitUrl = env.OLLAMA_BASE_URL?.trim();
    const explicitModel = env.OLLAMA_MODEL?.trim();
    // explicit URL 또는 model 둘 중 하나라도 있으면 활성. 둘 다 없으면 비활성
    // (로컬 Ollama 미사용 환경. silent skip).
    if (!explicitUrl && !explicitModel)
        return null;
    return {
        baseUrl: explicitUrl || 'http://localhost:11434',
        defaultModel: explicitModel || 'llama3.2',
    };
}
