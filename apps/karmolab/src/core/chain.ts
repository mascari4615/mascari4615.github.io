/**
 * 묶어 쓰기 — 알맹이 (해자① / 흡수계획 06 § 6 「작업대(체이닝)」)
 *
 * 도구가 45개 있어도 **한 번에 하나씩만** 부를 수 있으면, 일을 끝내는 건 여전히 부르는 쪽이다.
 * 「이 글을 Base64 로 바꾸고 그 결과의 SHA-256 을 내라」는 두 번 왕복해야 하고, 그 사이에
 * 중간값이 에이전트의 말(토큰)을 거친다 — **거기서 한 글자만 틀려도 뒤가 통째로 틀린다.**
 * 해시·체크섬처럼 「지어내면 안 되는 값」을 다루는 서버에서 그 왕복은 특히 나쁘다.
 *
 * 그래서 **중간값이 이 안에서만 흐르게** 한다. 부르는 쪽은 단계 목록을 주고 결과만 받는다.
 *
 * ★ 이 알맹이는 **다른 알맹이를 직접 import 하지 않는다.**
 * 그렇게 하면 도구 하나 추가할 때마다 여기도 고쳐야 하고(손으로 적은 목록), 화면 쪽 번들에는
 * 45개가 통째로 딸려 들어간다. 대신 **부르는 손을 밖에서 받는다**(`deps.call`) — `hashgen` 이
 * 계산기를 밖에서 받는 것과 같은 이음새다. MCP 서버는 이미 그 손을 갖고 있다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'chain',
  ops: {
    run: {
      desc:
        'Run several tools in order, feeding each result into the next — so intermediate values never' +
        ' round-trip through the model. steps is a JSON array:' +
        ' [{"tool":"base64","op":"encode","args":{"text":"hi"}},' +
        ' {"tool":"hashgen","op":"text","args":{"text":"$1","algo":"SHA256"}}].' +
        ' "$1" is the whole output of step 1; "{{1}}" embeds it inside a longer string.' +
        ' Every step is reported, not just the last one — a chain that fails should say where.' +
        ' / 도구 여러 개를 이어서 실행. 중간값이 모델을 거치지 않는다.',
      in: { steps: 'string' },
      out: 'string'
    }
  }
};

/** 부르는 손. 도구 id·연산·인자를 주면 글자로 된 결과를 돌려준다. */
export type CallTool = (toolId: string, op: string, args: Record<string, unknown>) => string;

export interface Step {
  tool: string;
  op: string;
  args: Record<string, unknown>;
}

export interface StepResult {
  step: number;
  tool: string;
  op: string;
  output: string;
}

/**
 * 한 판에 8단계까지. 더 길어지면 그건 대개 「무한히 이어 붙이는」 쪽이지 일이 아니다.
 * 상한이 있어야 잘못된 목록이 서버를 오래 붙잡지 않는다.
 */
export const MAX_STEPS = 8;

export function parseSteps(raw: string): Step[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('steps 를 JSON 배열로 주세요 (예: [{"tool":"base64","op":"encode","args":{"text":"hi"}}])');
  }
  if (Array.isArray(parsed) === false) throw new Error('steps 는 배열이어야 합니다');
  if (parsed.length === 0) throw new Error('단계가 하나도 없습니다');
  if (parsed.length > MAX_STEPS) throw new Error(`단계는 ${MAX_STEPS}개까지입니다 (받은 것 ${parsed.length}개)`);

  return parsed.map((raw2, i) => {
    const s = raw2 as Partial<Step>;
    const at = i + 1;
    if (typeof s?.tool !== 'string' || s.tool === '') throw new Error(`${at}번째 단계에 tool 이 없습니다`);
    if (typeof s?.op !== 'string' || s.op === '') throw new Error(`${at}번째 단계에 op 이 없습니다`);
    /* 자기 자신을 부르면 끝없이 들어간다. 상한만으로는 못 막는다 — 아예 못 부르게 한다. */
    if (s.tool === 'chain') throw new Error(`${at}번째 단계: chain 은 chain 을 부를 수 없습니다`);
    if (s.args !== undefined && (typeof s.args !== 'object' || s.args === null || Array.isArray(s.args))) {
      throw new Error(`${at}번째 단계의 args 는 객체여야 합니다`);
    }
    return { tool: s.tool, op: s.op, args: (s.args ?? {}) as Record<string, unknown> };
  });
}

/**
 * 앞 단계 결과를 끼워 넣는다.
 *
 * 두 모양을 받는다. `"$2"` 는 **값 전체**를 그 자리에 놓고(글자가 아니어도 되게 통째로),
 * `"...{{2}}..."` 는 긴 글 **안에** 끼운다. 하나만 두면 둘 중 한쪽이 반드시 아쉬워진다 —
 * 해시를 그대로 넘길 때와, 문장에 섞을 때는 필요한 게 다르다.
 *
 * 아직 안 나온 단계(자기 자신·뒤 단계)를 가리키면 **조용히 두지 않고 던진다.** 안 그러면
 * `$5` 라는 글자가 그대로 다음 도구에 들어가 엉뚱한 값이 나온다.
 */
export function resolve(value: unknown, done: string[], at: number): unknown {
  if (typeof value !== 'string') return value;

  const whole = /^\$(\d+)$/.exec(value);
  if (whole !== null) return pick(Number(whole[1]), done, at);

  if (value.includes('{{') === false) return value;
  return value.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => pick(Number(n), done, at));
}

function pick(n: number, done: string[], at: number): string {
  if (n < 1) throw new Error(`${at}번째 단계: 단계 번호는 1부터입니다 ($${n})`);
  if (n > done.length) {
    throw new Error(
      n >= at
        ? `${at}번째 단계가 아직 안 나온 결과($${n})를 가리킵니다 — 앞 단계만 쓸 수 있습니다`
        : `${at}번째 단계: $${n} 결과가 없습니다`
    );
  }
  return done[n - 1];
}

export function runChain(steps: Step[], call: CallTool): StepResult[] {
  const out: StepResult[] = [];
  const done: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const at = i + 1;
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.args)) args[k] = resolve(v, done, at);

    let value: string;
    try {
      value = call(s.tool, s.op, args);
    } catch (e) {
      /* 어디서 멈췄는지 말해 준다. 「실패했습니다」만 오면 8단계 중 어디인지 알 수 없다. */
      throw new Error(`${at}번째 단계(${s.tool}_${s.op}) 에서 멈췄습니다 — ${(e as Error).message}`);
    }
    done.push(value);
    out.push({ step: at, tool: s.tool, op: s.op, output: value });
  }
  return out;
}

export const run: ToolRunner = (op, args, deps) => {
  if (op !== 'run') throw new Error(`chain 에 「${op}」 는 없습니다`);
  const call = deps?.call as CallTool | undefined;
  if (typeof call !== 'function') throw new Error('도구를 부를 손이 없습니다 (deps.call)');

  const steps = parseSteps(String(args.steps ?? ''));
  const results = runChain(steps, call);

  /*
   * 마지막 값만 주지 않는다. 중간을 감추면 「왜 이 값이 나왔나」를 되짚을 수 없고,
   * 그러면 이 도구를 믿을 근거가 사라진다 — 믿게 하려고 만든 도구인데.
   */
  const lines = results.map((r) => `${r.step}. ${r.tool}_${r.op} → ${r.output}`);
  lines.push('', `결과: ${results[results.length - 1].output}`);
  return lines.join('\n');
};
