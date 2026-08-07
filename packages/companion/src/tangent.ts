import { brainSaid } from './rut';
import type { MemoryEntry } from './types';

/**
 * 화제 틀기 — 답만 하지 않고 제 얘기를 꺼내는 것.
 *
 * 레퍼런스에서 저쪽이 살아 있어 보이는 큰 이유 하나는 **가만히 답만 하지 않는다**는 것이다.
 * 묻지도 않은 얘기를 꺼내고, 하던 얘기에서 옆으로 새고, 그러다 제가 뭘 말하던 중이었는지
 * 잊는다. 만든 사람이 농담 삼아 「AI판 주의력 결핍」이라고 부를 만큼 자주 샌다. 그런데
 * **그게 사람처럼 보이는 자리**다.
 *
 * 우리 얘는 **끝까지 반응만 한다.** 실측(30회차): 두뇌가 지은 말 평균 8.5자, 되물은 비율
 * 13%. 조수님이 말을 걸면 답하고, 안 걸면 조용하다. 대화가 한 방향으로만 흐르니 금방 마른다.
 *
 * 먼저 말 걸기(9회차)와 다른 자리다. 그건 **침묵을 깨는 것**이고 이건 **말하는 도중에 방향을
 * 트는 것**이다.
 *
 * 함부로 하면 그냥 딴소리하는 애가 된다. 그래서:
 * - **마를 때만.** 대화가 잘 굴러가면 끼어들 이유가 없다.
 * - **답한 다음에.** 물음을 무시하고 딴 얘기부터 하면 그건 화제 틀기가 아니라 무례다.
 * - **한 조각만.** 길게 늘어놓으면 혼자 떠드는 것이다.
 */
export interface DryOptions {
  /** 최근 몇 마디를 볼지. */
  window?: number;
  /** 이 길이 이하가 이어지면 마른 것으로 본다. */
  shortAt?: number;
  /** 최소 이만큼은 말이 쌓여야 판단한다. */
  atLeast?: number;
}

/**
 * 대화가 말라 가나.
 *
 * 짧은 답이 이어지고 **되묻지도 않으면** 마른 것이다. 짧아도 되묻고 있으면 대화는 살아 있다 —
 * 길이만 보면 이 얘의 인격(원래 짧게 말한다)을 병으로 오진한다.
 */
export function isDrying(entries: readonly MemoryEntry[], options: DryOptions = {}): boolean {
  const window = options.window ?? 4;
  const shortAt = options.shortAt ?? 12;
  const atLeast = options.atLeast ?? 3;

  const 말들 = brainSaid(entries).slice(-window);
  if (말들.length < atLeast) return false;

  const 되물음 = 말들.some((e) => /[?？]/.test(e.text));
  if (되물음) return false;

  return 말들.every((e) => e.text.trim().length <= shortAt);
}

export interface TangentSeed {
  /** 어디서 나온 얘깃거리인가 (진단용). */
  from: '궁금한 것' | '아까 본 것' | '곁의 사람' | '오늘 바람';
  /** 꺼낼 거리. */
  what: string;
}

export interface TangentSources {
  /** 아직 못 물어본 것. */
  wondering?: string | null;
  /** 아까 화면에서 본 창. */
  sawWindow?: string | null;
  /** 한동안 얘기 안 나온 사람. */
  quietPerson?: string | null;
  /** 오늘 아직 안 이뤄진 바람. */
  wish?: string | null;
}

/**
 * 꺼낼 거리 하나를 고른다. 없으면 null.
 *
 * 순서가 곧 우선순위다. **궁금한 것이 먼저** — 조수님한테서 나온 얘기라 가장 자연스럽다.
 * 화면에서 본 것은 그 다음, 사람과 바람은 마지막이다(자칫 뜬금없다).
 */
export function tangentSeed(sources: TangentSources, pickNth = 0): TangentSeed | null {
  const 후보: TangentSeed[] = [];
  if (sources.wondering) 후보.push({ from: '궁금한 것', what: sources.wondering });
  if (sources.sawWindow) 후보.push({ from: '아까 본 것', what: `아까 조수님 화면에 「${sources.sawWindow}」 가 떠 있었다` });
  if (sources.quietPerson) 후보.push({ from: '곁의 사람', what: `${sources.quietPerson} 얘기가 요즘 안 나온다` });
  if (sources.wish) 후보.push({ from: '오늘 바람', what: sources.wish });
  if (후보.length === 0) return null;
  return 후보[Math.abs(pickNth) % 후보.length];
}

/**
 * 두뇌에 넘길 한 줄.
 *
 * **답을 하지 말라는 게 아니다.** 먼저 답하고, 그 다음에 한 조각 얹으라고 한다. 그리고
 * 억지로 이어 붙이지 말라고 못 박는다 — 「그건 그렇고」로 시작하는 말은 대화가 아니라
 * 화제 전환 장치다.
 */
export function tangentNote(seed: TangentSeed | null): string {
  if (seed === null) return '';
  return (
    `대화가 말라 간다. 물어본 것엔 답하고, 그 다음에 네 얘기를 **한 조각만** 꺼내라: ` +
    `「${seed.what}」. 억지로 이어 붙이지 말고, 안 어울리면 그냥 넘겨라.`
  );
}

/** 마를 때만 한 줄을 낸다. 안 마르면 빈 문자열. */
export function tangentFor(
  entries: readonly MemoryEntry[],
  sources: TangentSources,
  options: DryOptions & { pickNth?: number } = {},
): string {
  if (isDrying(entries, options) === false) return '';
  return tangentNote(tangentSeed(sources, options.pickNth ?? 0));
}
