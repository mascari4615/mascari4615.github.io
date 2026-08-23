"use strict";
/**
 * KarmoLabAI — usage telemetry (per-call 토큰 회계).
 *
 * **왜 필요한가**: 매 Gemini 호출의 input/output/cached 토큰을 구조화해 emit 하면
 * (1) 어디서 비싸는지 측정 가능 (cache hit ratio, tier 별 토큰 분포)
 * (2) 외부 dashboard / SIEM 로 라우팅 가능 (custom recorder 주입)
 * (3) 회귀 (예: systemInstruction 분리가 implicit cache hit 늘었나) 측정 게이트
 *
 * 정본: TASK-KAR-145 (@karmo/ai cost optimization, 2026-05-23).
 *
 * **확장**: 다른 provider (OpenAI, Anthropic, Ollama 등) 추가 시 동일 `GenerationUsage`
 * 스키마로 normalize 해서 recordUsage 호출 → 단일 telemetry pipe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUsageRecorder = setUsageRecorder;
exports.recordUsage = recordUsage;
exports.parseGeminiUsageMetadata = parseGeminiUsageMetadata;
const NOOP = () => { };
/**
 * 기본 recorder — `KARMOLAB_AI_USAGE_LOG=1` 일 때만 `[@karmo/ai/usage] {...}`
 * JSON 한 줄을 `console.log` 로 emit. 그 외 noop.
 *
 * yawnbot · KarmoLab · 다른 consumer 가 자기 telemetry 파이프로 흘릴 거면
 * `setUsageRecorder(fn)` 으로 교체.
 */
function defaultRecorder(usage, meta) {
    const enabled = typeof process !== 'undefined' &&
        process.env &&
        process.env.KARMOLAB_AI_USAGE_LOG === '1';
    if (!enabled)
        return;
    try {
        const line = JSON.stringify({ ...meta, usage });
        console.log(`[@karmo/ai/usage] ${line}`);
    }
    catch {
        /* JSON 직렬화 실패 = silent (telemetry 가 핵심 경로 막지 X) */
    }
}
let currentRecorder = defaultRecorder;
/** 전역 recorder 교체. consumer 가 자기 telemetry 채널로 라우팅하고 싶을 때. */
function setUsageRecorder(fn) {
    currentRecorder = fn ?? NOOP;
}
/** 호출별로 임시 recorder 주입 (per-call onUsage) → 전역 recorder 와 둘 다 호출. */
function recordUsage(usage, meta, perCall) {
    try {
        currentRecorder(usage, meta);
    }
    catch {
        /* 전역 recorder 예외도 silent (telemetry 가 본 경로 막지 X) */
    }
    if (perCall) {
        try {
            perCall(usage, meta);
        }
        catch {
            /* per-call recorder 예외도 silent */
        }
    }
}
/**
 * Vertex / AI Studio generateContent 응답의 `usageMetadata` 필드를
 * `GenerationUsage` 로 정규화. 필드 누락 = 0 fallback (절대 throw X).
 */
function parseGeminiUsageMetadata(meta) {
    const m = meta ?? {};
    const prompt = m.promptTokenCount ?? 0;
    const completion = m.candidatesTokenCount ?? 0;
    const total = m.totalTokenCount ?? prompt + completion;
    const cached = m.cachedContentTokenCount;
    const thoughts = m.thoughtsTokenCount;
    const out = {
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
    };
    if (cached !== undefined && cached > 0)
        out.cachedPromptTokens = cached;
    if (thoughts !== undefined && thoughts > 0)
        out.thoughtsTokens = thoughts;
    return out;
}
