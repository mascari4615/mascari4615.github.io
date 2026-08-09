/**
 * 로컬 AI 엔진 데려오기 — 적재 이음새 (해자④ / 흡수계획 12 § 2·5)
 *
 * ★ 왜 저장소에 안 넣는가 (2026-08-10 실측으로 정함)
 *
 * `js/vendor/` 에는 남의 라이브러리를 통째로 넣어 두는 선례가 있다(mermaid 2.5MB 까지).
 * 그런데 transformers.js 는 **푼 크기 9.5MB** 이고, 그것만으로 끝도 아니다 — ONNX 런타임과
 * WASM 조각을 더 받아야 돌아간다. 저장소에 넣으면 **AI 를 한 번도 안 켠 사람까지** 그 무게를
 * 체크아웃·배포마다 나른다.
 *
 * 그래서 **켠 사람만 그때 받는다.** 주소는 판을 못 박아 둔다(`@4.2.0`) — 판이 흐르면
 * 어느 날 조용히 다른 코드가 실려 오고, 그게 로컬 AI 에서는 「모델이 안 올라간다」로 나타난다.
 *
 * 이 파일에는 **모델도 추론도 없다.** 「데려오기」만 담는다. 그래야 이 자리에서 틀릴 수 있는
 * 것(중복 로딩·실패 분류·초기 번들 오염) 셋만 보면 되고, 나머지는 각 도구가 가진다.
 */
import { explainFailure, type AiFailure } from './ai-route';

/**
 * 판을 박은 주소. 올릴 때는 **여기 한 줄만** 고친다.
 * `/+esm` 는 jsDelivr 가 ESM 으로 내주는 길이라 `import()` 로 바로 받을 수 있다.
 */
export const ENGINE_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm';

/** 대략 얼마나 받나 — 「AI 켜기」 화면이 사람에게 먼저 보여 줄 숫자 (12 § 2). */
export const ENGINE_SIZE_MB = 3;

export interface EngineModule {
  pipeline: (task: string, model?: string, options?: Record<string, unknown>) => Promise<unknown>;
  env?: Record<string, unknown>;
}

/** 이 브라우저가 로컬 AI 를 돌릴 수 있나. 없으면 **기능만 감춘다** — 도구는 그대로 연다. */
export function webgpuAvailable(nav: unknown = globalThis.navigator): boolean {
  return typeof (nav as { gpu?: unknown } | undefined)?.gpu === 'object';
}

/**
 * 한 번만 받는다.
 *
 * 두 군데서 동시에 부르면(자막 도구와 음성 도구를 나란히 열면) 9MB 를 두 번 받게 된다.
 * 그래서 **진행 중인 약속을 붙들어** 둘 다 같은 것을 기다리게 한다. 실패하면 붙든 것을 버려
 * 다음에 다시 시도할 수 있게 한다 — 실패를 캐시하면 새로고침 전까지 영영 못 켠다.
 */
let inflight: Promise<EngineModule> | null = null;

export function resetEngine(): void {
  inflight = null;
}

export function engineLoaded(): boolean {
  return inflight !== null;
}

/**
 * 실제로 데려온다. 실패는 **단계로** 돌려준다(`ai-route.explainFailure`) — 부르는 쪽이
 * 「무엇을 권할지」를 스스로 판단하지 않게 하려는 것이다. 판단은 한 곳에만 있어야 한다.
 *
 * `load`·`nav` 를 인자로 받는 이유는 시험 때문만이 아니다 — Node 에서 `globalThis.navigator`
 * 는 **바꿀 수 없는 값**이라(getter 전용), 밖에서 못 넣으면 「GPU 없는 자리」를 아예 못 재 본다.
 * 즉 인자로 빼지 않으면 이 판정은 **영원히 시험 밖**에 남는다.
 */
export async function loadEngine(
  load: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url),
  nav: unknown = globalThis.navigator
): Promise<EngineModule> {
  if (webgpuAvailable(nav) === false) throw failure('support');
  if (inflight !== null) return inflight;

  inflight = (async () => {
    let mod: unknown;
    try {
      mod = await load(ENGINE_URL);
    } catch (e) {
      throw failure('download', short(e));
    }
    const pipeline = (mod as EngineModule | undefined)?.pipeline;
    if (typeof pipeline !== 'function') {
      /* 받아지긴 했는데 우리가 아는 모양이 아니다 — 판이 바뀌었거나 다른 것이 왔다. */
      throw failure('load', '엔진 모양이 예상과 다릅니다');
    }
    return mod as EngineModule;
  })();

  try {
    return await inflight;
  } catch (e) {
    inflight = null; // 실패는 기억하지 않는다 — 다시 눌러 볼 수 있어야 한다
    throw e;
  }
}

export class AiEngineError extends Error {
  readonly info: AiFailure;
  constructor(info: AiFailure) {
    super(info.say);
    this.name = 'AiEngineError';
    this.info = info;
  }
}

const failure = (stage: Parameters<typeof explainFailure>[0], detail = ''): AiEngineError =>
  new AiEngineError(explainFailure(stage, detail));

const short = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 60);
