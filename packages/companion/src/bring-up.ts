import type { Ingredient } from './budget';

/**
 * 먼저 꺼내기 — **참기만 하다 끝나면 그건 생각이 아니다.**
 *
 * 72회차에 「밀린 생각은 사라지지 않고 쌓인다」를 만들었다. 못 실린 재료가 다음 turn 에 더
 * 세게 겨룬다. 그런데 거기서 멈춰 있었다 — 쌓인 것이 **말이 되는 자리**가 없었다. 아무리
 * 세게 눌려도 결국 여섯 줄 안에 드느냐 마느냐일 뿐이고, 들어가도 그건 여전히 **조수님이
 * 꺼낸 얘기에 붙는 곁가지**다.
 *
 * 얘는 대화 중에 100% 반응만 한다. 먼저 말 거는 자리는 있지만 **십 분 조용해야** 돈다.
 * 곁에 있는 존재는 얘기하다 말고 「아 맞다, 그거」 한다.
 *
 * 레퍼런스가 두 가지를 짚는다. 하나는 **가만두면 대화가 말라 죽는다**는 것(StalemateBreaker:
 * 멈춘 자리에 새 얘깃거리를 넣는다). 다른 하나는 **아무 때나 바꾸면 안 된다**는 것 —
 * 화제 전환은 서로 동의가 있어야 하고, 지금 하던 얘기와의 관련을 재야 한다.
 *
 * 그래서 좁게 연다.
 * - **식어 갈 때만.** 오가는 말이 짧아지는 중이면 꺼낼 자리다. 한창일 때 끼어들면 방해다.
 * - **물어본 turn 에는 안 한다.** 물음을 두고 딴 얘기를 꺼내는 건 회피다.
 * - **오래 참은 것만.** 한두 번 밀린 걸 꺼내면 그냥 아무 말이나 하는 것이다.
 * - **할 말이 실제로 있는 것만.** 빈 재료를 꺼내라고 하면 얘는 지어낸다.
 */

export interface 꺼낼까입력 {
  /** 재료들 — 이 중에서 고른다. */
  재료: readonly Ingredient[];
  /** 그 재료가 몇 번이나 밀렸나. */
  얼마나참았나: (이름: string) => number;
  /** 대화가 식어 가는 중인가. */
  식는중: boolean;
  /** 방금 조수님이 물어봤나. */
  물어본turn: boolean;
  /** 이 횟수 넘게 참은 것만 꺼낸다. */
  문턱?: number;
}

export interface 꺼낼것 {
  이름: string;
  참은수: number;
  /** 두뇌에 얹을 한 줄. */
  말: string;
}

/** 지금 먼저 꺼낼 것이 있나. 없으면 null. */
export function 먼저꺼낼것(input: 꺼낼까입력): 꺼낼것 | null {
  return 안꺼내는이유(input) === null ? 고르기(input) : null;
}

/**
 * 왜 안 꺼내나. 꺼낼 자리면 null.
 *
 * **「안 꺼냈다」만 남기면 못 고친다.** 오늘까지 같은 벽에 네 번 부딪혔다(71·81·82회차).
 * 처음부터 이유를 말하게 만든다.
 */
export function 안꺼내는이유(input: 꺼낼까입력): string | null {
  if (input.물어본turn) return '조수님이 물어본 turn 이다';
  if (input.식는중 === false) return '아직 대화가 안 식었다';
  const 고른것 = 고르기(input);
  if (고른것 === null) {
    const 문턱 = input.문턱 ?? 3;
    const 가장 = Math.max(0, ...input.재료.map((x) => input.얼마나참았나(x.name)));
    return `${문턱}번 넘게 참은 게 없다 (가장 오래 참은 게 ${가장}번)`;
  }
  return null;
}

function 고르기(input: 꺼낼까입력): 꺼낼것 | null {
  const 문턱 = input.문턱 ?? 3;
  const 후보 = input.재료
    // 할 말이 실제로 있는 것만 — 빈 재료를 꺼내라고 하면 얘는 지어낸다.
    .filter((x) => x.when !== false && x.text.trim() !== '')
    .map((x) => ({ x, 참은수: input.얼마나참았나(x.name) }))
    .filter((r) => r.참은수 >= 문턱)
    .sort((a, b) => b.참은수 - a.참은수 || b.x.weight - a.x.weight)[0];
  if (후보 === undefined) return null;
  return {
    이름: 후보.x.name,
    참은수: 후보.참은수,
    말:
      '대화가 식어 간다. **네가 먼저 꺼내라** — 아래 것을 지금 화제로 삼아라. ' +
      '조수님이 꺼낸 얘기에 곁가지로 붙이지 말고, 네가 하고 싶어서 꺼내는 것처럼. 짧아도 된다.\n' +
      후보.x.text.trim(),
  };
}

/**
 * 먼저 꺼내라고 시켰는데 실제로 꺼냈나 — **재는 자리.**
 *
 * 「시켰다」는 만든 사람 말이고 **꺼냈나**가 결과다. 오늘까지 시켜 놓고 안 센 자리를
 * 다섯 찾았다.
 */
export function 안꺼냈나(said: string, 꺼낼자리인가: boolean, 실마리: readonly string[]): string | null {
  if (꺼낼자리인가 === false) return null;
  const 말 = said.trim();
  if (말 === '') return '먼저 꺼낼 자리인데 아무 말도 안 했다';
  const 낱말 = 실마리.flatMap((s) => (s.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? []).map((w) => w.slice(0, 2)));
  if (낱말.length === 0) return null; // 견줄 실마리가 없으면 막지 않는다
  const 말낱말 = new Set((말.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? []).map((w) => w.slice(0, 2)));
  return 낱말.some((w) => 말낱말.has(w)) ? null : '먼저 꺼내라고 했는데 그 얘기가 안 나왔다';
}
