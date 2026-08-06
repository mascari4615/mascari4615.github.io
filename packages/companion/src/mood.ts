import type { MemoryEntry } from './types';

/**
 * 기분 — 얘가 스스로 변하는 부분.
 *
 * 동반자 앱 이용자의 73%가 2주 안에 떠나고, 1위 이유가 「대화가 매번 똑같아서」다(조사).
 * 기억을 아무리 잘 해도 매번 같은 상태로 같은 말을 하면 살아 있다고 느껴지지 않는다.
 *
 * 그래서 시간·최근 대화량·혼자 있던 시간으로 기분이 흐른다. 이 값은 코어가 해석하지 않고
 * 두뇌에 한 줄로 넘어간다 — 기분이 코드에 박히면 인격을 바꿔도 결이 안 바뀐다.
 */
export interface Mood {
  /** 0(축 처짐) ~ 1(생생함). */
  energy: number;
  /** 0(심드렁) ~ 1(반가움). */
  warmth: number;
  /** 0(할 게 있음) ~ 1(심심해 죽겠음). */
  boredom: number;
  /** 사람이 읽는 한 줄. 두뇌에 이대로 넘어간다. */
  note: string;
}

export interface MoodInput {
  /** 지금 몇 시인지 (0~23). */
  hour: number;
  /** 마지막으로 사람과 말을 나눈 뒤 흐른 시간(ms). 한 번도 없으면 null. */
  sinceTalkedMs: number | null;
  /** 최근 한 시간 안에 사람이 건넨 말 수. */
  recentTurns: number;
}

/**
 * 지금 기분을 잰다.
 *
 * 규칙은 단순하게 뒀다 — 복잡한 감정 모형보다, 「밤엔 처지고 오래 혼자 있으면 심심하다」는
 * 알아볼 수 있는 결이 낫다. 알아볼 수 없는 변화는 없는 것과 같다.
 */
export function readMood(input: MoodInput): Mood {
  const { hour, sinceTalkedMs, recentTurns } = input;

  // 밤이 깊을수록, 새벽일수록 처진다. 낮이 가장 생생하다.
  const night = hour >= 23 || hour < 6;
  const morning = hour >= 6 && hour < 10;
  let energy = night ? 0.22 : morning ? 0.55 : hour < 18 ? 0.8 : 0.5;

  // 방금까지 이야기하고 있었으면 조금 더 깨어 있다.
  const alone = sinceTalkedMs ?? Number.POSITIVE_INFINITY;
  if (alone < 5 * 60_000) energy = Math.min(1, energy + 0.15);

  // 오래 혼자 있었으면 반가움이 는다. 방금까지 떠들었으면 덤덤하다.
  const warmth = alone > 6 * 60 * 60_000 ? 0.9
    : alone > 60 * 60_000 ? 0.7
    : alone > 10 * 60_000 ? 0.5
    : 0.35;

  // 말수가 적고 혼자 있는 시간이 길수록 심심하다.
  const boredom = Math.max(0, Math.min(1,
    (alone > 60 * 60_000 ? 0.6 : alone > 20 * 60_000 ? 0.35 : 0.1)
    + (recentTurns === 0 ? 0.25 : recentTurns < 3 ? 0.1 : 0),
  ));

  return { energy, warmth, boredom, note: describe({ energy, warmth, boredom, hour, alone }) };
}

function describe(v: {
  energy: number; warmth: number; boredom: number; hour: number; alone: number;
}): string {
  const bits: string[] = [];

  if (v.energy < 0.3) bits.push('많이 처져 있고 졸리다');
  else if (v.energy < 0.55) bits.push('나른하다');
  else if (v.energy > 0.85) bits.push('제법 깨어 있다');

  if (v.warmth > 0.8) bits.push('오랜만이라 속으로는 반갑다 (티는 안 낸다)');
  else if (v.warmth < 0.4) bits.push('방금까지 얘기하던 참이라 덤덤하다');

  if (v.boredom > 0.7) bits.push('심심하다');

  if (v.hour >= 1 && v.hour < 5) bits.push('이 시간까지 안 자는 조수님이 좀 걸린다');

  if (bits.length === 0) bits.push('평소와 비슷하다');
  return `지금 네 상태: ${bits.join(', ')}. 이 상태가 말투에 자연스럽게 배어 나오게 하되, 상태를 말로 설명하지는 마라.`;
}

/**
 * 최근에 했던 말투를 다시 쓰지 말라고 일러 준다.
 *
 * 같은 말로 시작하는 게 반복의 정체다 — 「응…」 「음…」 이 세 번 이어지면 사람은 바로
 * 기계라고 느낀다. 무엇을 말했는지가 아니라 **어떻게 시작했는지**를 막는다.
 */
export function avoidRepeats(recent: readonly MemoryEntry[], howMany = 4): string {
  const openers = recent
    .filter((e) => e.role === 'said')
    .slice(-howMany)
    .map((e) => e.text.trim().split(/\s+/).slice(0, 3).join(' '))
    .filter((o) => o !== '');
  if (openers.length === 0) return '';
  return `최근에 이렇게 말을 열었다: ${openers.map((o) => `「${o}…」`).join(' ')}. 같은 식으로 또 시작하지 마라.`;
}

/**
 * 지난 대화에서 지금 말과 겹치는 것을 찾아 온다.
 *
 * 두뇌더러 「필요하면 찾아봐라」 하는 방식은 실패했다 — 안내를 조여도, 인격을 빼도
 * 안 썼다(실측 2회). 그래서 판단에 맡기지 않는다. 매번 찾아서 재료로 얹고, 없으면
 * 빈 손으로 돌아올 뿐이다.
 *
 * 뉴로사마도 옛 기억을 「필요하면 부르는 도구」가 아니라 **늘 곁들이는 재료**로 둔다.
 */
export function recallFrom(
  search: (keyword: string, limit: number) => readonly MemoryEntry[],
  options: { minLength?: number; keywords?: number; perKeyword?: number } = {},
): (sensation: { text: string }, recent: readonly MemoryEntry[]) => string[] {
  const minLength = options.minLength ?? 2;
  const maxKeywords = options.keywords ?? 4;
  const perKeyword = options.perKeyword ?? 3;

  return (sensation, recent) => {
    const recentTexts = new Set(recent.map((e) => e.text));
    const words = pickKeywords(sensation.text, minLength).slice(0, maxKeywords);
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const word of words) {
      // 낱말을 뒤에서부터 깎아가며 찾되, **쓸모 있는 게 나올 때까지** 깎는다.
      //
      // 한국어는 말끝이 붙어서 「먹는다고」로는 「먹어」가 안 걸린다. 게다가 방금 내가 한
      // 말에는 그 낱말이 그대로 들어 있어, 「걸렸다」고 판단하고 멈추면 정작 옛 기억은
      // 영영 안 나온다(실측: 이 두 가지가 겹쳐 0건이었다).
      let taken = 0;
      for (let cut = word.length; cut >= 1 && taken === 0; cut -= 1) {
        for (const hit of search(word.slice(0, cut), perKeyword * 8)) {
          if (taken >= perKeyword) break;
          // 방금 나눈 말은 이미 두뇌가 보고 있다 — 또 붙이면 자리만 먹는다.
          if (recentTexts.has(hit.text) || seen.has(hit.text)) continue;
          seen.add(hit.text);
          taken += 1;
          lines.push(
            `- ${new Date(hit.at).toLocaleDateString('ko-KR')} ${hit.role === 'said' ? '내가' : '조수님이'}: ${hit.text.slice(0, 120)}`,
          );
        }
      }
    }

    return lines.slice(0, 8);
  };
}

/** 흔한 말은 빼고 뜻이 실린 낱말만 고른다 — 「그거」로 옛 대화를 뒤지면 전부 걸린다. */
const 흔한말 = new Set([
  '그거', '저거', '이거', '뭐였', '뭐야', '뭐지', '그게', '나는', '내가', '너는', '우리',
  '저번', '예전', '아까', '오늘', '어제', '내일', '지금', '진짜', '정말', '그냥', '조금',
  '해줘', '했었', '있어', '없어', '같아', '한거', '무슨', '어떤', '거야', '거지',
]);

function pickKeywords(text: string, minLength: number): string[] {
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= minLength && 흔한말.has(w) === false);
  // 긴 낱말이 대개 더 뜻이 실려 있다.
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}
