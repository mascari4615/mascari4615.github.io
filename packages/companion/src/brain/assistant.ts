import { generateAssistantText } from 'karmolab-ai/node';

import type { Brain, MemoryEntry, ThinkInput } from '../types';

export interface AssistantBrainOptions {
  /**
   * 어느 LLM 을 쓸지는 **여기서 정하지 않는다** — env 가 정한다.
   * `ASSISTANT_AI_PROVIDER` = gemini | claude-cli | codex-cli | openai | ollama | openrouter
   * `ASSISTANT_AI_FALLBACK_CHAIN` = 실패 시 순서대로 재시도.
   */
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/**
 * 진짜 두뇌 — 이미 있는 `karmolab-ai` 의 provider 라우터에 위임한다.
 *
 * 여기엔 인격이 없다. 넘기는 것은 「최근에 오간 말 + 방금 느낀 것」 뿐이다.
 * 캐릭터·말투를 넣는 자리는 아직 만들지 않았다 (다음 회차 결정 사항).
 */
export function assistantBrain(options: AssistantBrainOptions = {}): Brain {
  const env = options.env ?? process.env;
  return {
    name: 'assistant',
    async think(input: ThinkInput): Promise<string | null> {
      const prompt = buildPrompt(input);
      const { text } = await generateAssistantText(env, prompt, {
        timeoutMs: options.timeoutMs ?? 60_000,
        tag: 'companion',
      });
      const trimmed = text.trim();
      return trimmed === '' ? null : trimmed;
    },
  };
}

/** 기억을 그대로 대화록으로 펴서 넘긴다 — 가공·요약 없음(프로토타입 단계). */
function buildPrompt(input: ThinkInput): string {
  const history = input.recent
    .slice(0, -1) // 마지막 = 방금 느낀 것 자신 — 아래에 따로 붙는다.
    .map(renderEntry)
    .join('\n');
  const head = history === '' ? '' : `지금까지 오간 말:\n${history}\n\n`;
  return `${head}방금 [${input.sensation.channel}] 에서 들어온 것:\n${input.sensation.text}\n\n여기에 이어서 한 마디만 해라.`;
}

function renderEntry(entry: MemoryEntry): string {
  const who = entry.role === 'said' ? '나' : `[${entry.channel}]`;
  return `${who}: ${entry.text}`;
}
