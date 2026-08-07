import type { Brain, MemoryEntry, ThinkInput } from '../types';

/**
 * 이 두뇌는 **옆 패키지에 기대어 있다.** 그래서 맨 위에서 통째로 불러오면 안 된다.
 *
 * 85회차에 그 값을 치렀다. 다른 세션이 잠금 파일을 손보면서 그 패키지 연결이 빠졌는데,
 * **아무도 안 쓰는 두뇌 하나 때문에 동반자가 통째로 안 떴다.** 기본 두뇌는 이게 아닌데도
 * 그랬다 — 목록에 이름을 올려 두는 것만으로 딸려 들어오기 때문이다.
 *
 * 곁에 있는 존재는 **한 군데가 없다고 통째로 죽으면 안 된다.** 쓸 때 불러온다. 없으면
 * 그 두뇌만 못 쓰고, **왜 못 쓰는지 말한다** — 조용히 다른 걸로 넘어가면 「왜 딴 목소리지」가 된다.
 */
async function 불러오기(): Promise<(env: NodeJS.ProcessEnv, prompt: string, opts: { timeoutMs: number; tag: string }) => Promise<{ text: string }>> {
  /* 이름을 **변수로 돌려서** 불러온다. 그냥 적으면 타입 검사기가 「이 패키지가 반드시
     있어야 한다」고 못 박아, 없을 때 빌드부터 막힌다 — 없어도 되는 두뇌인데 그러면
     이 자리를 만든 뜻이 없다. */
  const 어디 = 'karmolab-ai/node';
  const mod = (await import(어디)) as unknown;
  return (mod as { generateAssistantText: (env: NodeJS.ProcessEnv, prompt: string, opts: { timeoutMs: number; tag: string }) => Promise<{ text: string }> }).generateAssistantText;
}

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
      let generateAssistantText;
      try {
        generateAssistantText = await 불러오기();
      } catch (e) {
        throw new Error(`이 두뇌는 옆 패키지(karmolab-ai)가 있어야 쓴다 — 지금은 없다: ${(e as Error)?.message ?? e}`);
      }
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
