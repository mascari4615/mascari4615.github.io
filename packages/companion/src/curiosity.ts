import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Hand } from './hands';

/**
 * 궁금한 것 — 얘가 아직 못 물어본 것들.
 *
 * 뉴로사마는 모르는 게 나오면 그 자리에서 묻는다. 우리 얘는 답만 했다 — 궁금해하지
 * 않는 상대는 관심이 없는 것처럼 느껴진다.
 *
 * 다만 나올 때마다 캐물으면 취조가 된다. 그래서 **적어 뒀다가** 조용할 때 하나씩 꺼낸다.
 * 사람도 그렇게 한다 — 지금 바쁜 것 같으면 담아 뒀다가 나중에 묻는다.
 */
export interface Curiosity {
  /** 궁금한 걸 적어 둔다. 이미 있는 건 또 안 적는다. */
  wonder(about: string): void;
  /** 아직 못 물어본 것 하나. 없으면 null. */
  next(): string | null;
  /** 물어봤다고 표시한다 — 같은 걸 두 번 묻지 않게. */
  asked(about: string): void;
  /** 남은 개수 (진단용). */
  size(): number;
}

/**
 * 파일에 남기는 궁금증. 껐다 켜도 이어진다 — 어제 궁금했던 걸 오늘 묻는 게 자연스럽다.
 *
 * 형식은 한 줄에 하나, 물어본 것은 앞에 `-` 를 붙여 지운 표시. 사람이 열어 봐도 읽힌다.
 */
export function fileCuriosity(path: string, cap = 40): Curiosity {
  function load(): { open: string[]; done: Set<string> } {
    if (existsSync(path) === false) return { open: [], done: new Set() };
    const open: string[] = [];
    const done = new Set<string>();
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line === '') continue;
      if (line.startsWith('-')) done.add(line.slice(1).trim());
      else open.push(line);
    }
    return { open, done };
  }

  function save(state: { open: string[]; done: Set<string> }): void {
    mkdirSync(dirname(path), { recursive: true });
    const body = [
      ...state.open.slice(-cap),
      ...[...state.done].slice(-cap).map((d) => `- ${d}`),
    ].join('\n');
    writeFileSync(path, `${body}\n`, 'utf8');
  }

  return {
    wonder(about: string): void {
      const text = about.trim();
      if (text === '') return;
      const state = load();
      if (state.open.includes(text) || state.done.has(text)) return;
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${text}\n`, 'utf8');
    },

    next(): string | null {
      const { open } = load();
      // 가장 오래 담아 둔 것부터. 새 궁금증이 옛것을 영영 덮지 않게.
      //
      // 다만 **못 쓸 것은 건너뛴다.** 규칙을 고쳐도 어제까지 쌓인 건 그대로 남아서,
      // 여기서 안 거르면 얘는 계속 옛 쓰레기를 꺼내려 한다(실측 31회차: 30개 중 0개 쓸모).
      return open.find((x) => unusableCuriosity(x) === false) ?? null;
    },

    asked(about: string): void {
      const text = about.trim();
      const state = load();
      const at = state.open.indexOf(text);
      if (at < 0) return;
      state.open.splice(at, 1);
      state.done.add(text);
      save(state);
    },

    size(): number {
      return load().open.length;
    },
  };
}

/** 궁금한 걸 적어 두는 손. 물어보는 건 나중이다. */
export function wonderHand(store: Curiosity): Hand {
  return {
    name: '궁금해하기',
    what: '지금 묻기엔 눈치 없지만 나중에 물어보고 싶은 것을 적어 둔다',
    needs: '궁금한 것',
    async run(argument: string): Promise<string> {
      store.wonder(argument);
      return `담아뒀다: ${argument}`;
    },
  };
}

/**
 * 지금 하나 꺼내 물어봐도 될까.
 *
 * 아무 때나 꺼내면 대화를 가로챈다. 사람이 먼저 말을 건 자리에서, 그리고 가끔만.
 * 「가끔」을 정하는 값도 밖에서 넣게 뒀다 — 시험할 수 없는 무작위는 두지 않는다.
 */
export function maybeAsk(
  store: Curiosity,
  options: { chance?: number; roll?: () => number } = {},
): string {
  const chance = options.chance ?? 0.25;
  const roll = options.roll ?? Math.random;
  if (roll() >= chance) return '';
  const question = store.next();
  if (question === null) return '';
  return `전부터 궁금했던 게 있다: ${question}. 대화 흐름이 어색하지 않으면 슬쩍 물어봐라. 어색하면 그냥 넘겨라.`;
}

/**
 * 사람이 한 말에서 **자동으로** 궁금한 것을 뽑는다.
 *
 * 두뇌더러 「궁금하면 적어 둬라」 하는 방식은 안 먹혔다 — 옛 기억 찾기 때와 똑같이,
 * 작은 머리는 표시를 안 남긴다(실측). 그래서 판단에 맡기지 않는다.
 *
 * 규칙은 얕게: 이 사람이 꺼낸 낱말 중 **아직 아는 것에 없고 전에 궁금해한 적도 없는**
 * 것을 하나 고른다. 그 낱말이 나온 문장을 통째로 담아 둔다 — 낱말만 담으면 나중에
 * 무슨 얘기였는지 알 수 없다.
 */
/**
 * 조사를 뗀다 — 「회의가」 → 「회의」.
 *
 * 안 떼면 같은 말이 「회의가」 「회의를」 「회의는」으로 흩어져 매번 새로 궁금해한다.
 */
export function stripParticle(word: string): string {
  const 조사 = ['에서는', '에서도', '으로는', '이라고', '라고', '에서', '으로', '한테', '에게', '까지', '부터',
    '이랑', '들이', '들을', '들은', '은', '는', '이', '가', '을', '를', '에', '와', '과', '랑', '도', '만', '의'];
  for (const j of 조사) {
    if (word.length > j.length + 1 && word.endsWith(j)) return word.slice(0, -j.length);
  }
  return word;
}

/**
 * 이 낱말이 **물어볼 만한 것**인가.
 *
 * 레퍼런스가 짚는 척도는 「몇 개를 뽑았나」가 아니라 **「그중 실제로 쓸 만한 게 몇 개인가」**다.
 * 실측(30·31회차): 쌓인 궁금증 30개 중 쓸 만한 게 **0개**였다 — 「어때 에 대해 더」
 * 「알려주세요 에 대해 더」처럼 사람이 읽어도 무슨 말인지 모르는 것들이었다.
 *
 * 원인은 단순했다. **가장 긴 낱말**을 골랐던 것이다. 한국어에서 긴 낱말은 대개 **활용된
 * 서술어**(「힘들었어」 「알려주세요」)라, 길이로 고르면 동사만 골라진다. 궁금할 만한 것은
 * 거의 언제나 **이름 붙은 것** — 사물·일·사람이다.
 *
 * 그래서 서술어 꼴을 걸러낸다. 완벽한 품사 가르기는 못 하지만, **못 쓸 것을 안 담는 쪽이
 * 많이 담는 것보다 낫다.**
 *
 * 못 거르는 것도 있다 — 「만드는」 같은 관형형은 「는」을 떼면 서술어 표시가 사라지는데,
 * 「회의는」도 똑같이 떼야 하므로 규칙으로 가를 수 없다. 흔한 것만 손으로 막아 뒀다.
 */
export function worthWondering(word: string, skip: ReadonlySet<string> = 흔한말): boolean {
  const w = stripParticle(word);
  if (w.length < 2 || w.length > 8) return false;
  if (skip.has(w) || skip.has(word)) return false;
  // 활용된 서술어 — 이렇게 끝나면 동사·형용사거나 말끝이다.
  if (/(다|요|까|죠|네|지|어|아|여|게|고|서|며|면|나|자|래|봐|줘)$/.test(w)) return false;
  // 「좋아해」 「고마워」 처럼 **두 글자 이상 어간 + 해/워/해요** 꼴도 서술어다.
  //
  // 31회차 규칙은 마지막 한 글자만 봐서 이것들을 통째로 놓쳤다 — 실제로 「좋아해」가
  // 「우리끼리 자주 나오는 얘기」 1등으로 올라왔다(실측 48회차).
  if (/[가-힣]{2,}(해|워|해요|워요|한다|하다)$/.test(w)) return false;
  // 한글이 아닌 것(숫자·기호)은 물어볼 거리가 아니다.
  if (/^[가-힣]+$/.test(w) === false) return false;
  return true;
}

/**
 * 오간 말에서 궁금할 것을 하나 줍는다. 없으면 null.
 *
 * 씨앗은 **짧게** 적는다. 문장을 통째로 넣으면 나중에 꺼낼 때 그 문장을 읊게 된다.
 */
export function noticeCuriosity(
  said: string,
  known: string | null,
  store: Curiosity,
  options: { minLength?: number; skip?: ReadonlySet<string> } = {},
): string | null {
  const knownText = (known ?? '').toLowerCase();
  const sentence = said.trim();
  if (sentence.length < 6) return null; // 「응」 「그래」 같은 건 궁금할 게 없다

  const skip = options.skip ?? 흔한말;
  const words = sentence
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => stripParticle(w.trim()))
    .filter((w) => worthWondering(w, skip))
    // 긴 것부터가 아니라 **앞에 나온 것부터**. 사람은 하고 싶은 말을 앞에 둔다.
    ;

  for (const word of words) {
    if (knownText.includes(word.toLowerCase())) continue; // 이미 아는 얘기
    const about = `${word} — 조수님이 꺼낸 얘기`;
    if (store.next() === about) return null;
    store.wonder(about);
    return about;
  }
  return null;
}

/** 뜻이 옅어 궁금할 거리가 안 되는 말들. */
const 흔한말 = new Set([
  '그거', '저거', '이거', '뭐야', '뭐지', '그게', '나는', '내가', '너는', '우리', '지금',
  '오늘', '어제', '내일', '진짜', '정말', '그냥', '조금', '해줘', '있어', '없어', '같아',
  '무슨', '어떤', '거야', '거지', '이제', '아직', '많이', '너무', '그리고', '그래서',
  // 뜻이 실린 듯 보이지만 그 자체로는 물어볼 게 없는 말들. 이게 얕으면 「얘기 에 대해
  // 더」 같은 걸 궁금해한다(실측).
  '얘기', '그래', '그럼', '그치', '생각', '사람', '시간', '문제', '정도', '부분', '느낌',
  '요즘', '이런', '저런', '그런', '하는', '한테', '에서', '까지', '보다', '정말로',
  // 묻는 말 자체 — 「무엇 에 대해 더」 「어때 에 대해 더」가 실제로 쌓였다(실측).
  '무엇', '어때', '어떻', '언제', '어디', '누구', '얼마', '어느', '몇개', '뭔가', '뭐가',
  '하자', '하나', '가지', '자기', '소개', '기능', '목록', '방법', '대해', '경우',
  // 「만드는」 같은 관형형은 기계로 못 가린다 — 「는」을 떼면 「만드」가 되어 서술어 표시가
  // 사라지고, 「회의는」도 똑같이 「회의」가 되기 때문이다. 흔한 것만 손으로 막는다.
  '만드는', '하는', '되는', '있는', '없는', '같은', '다른', '보는', '가는', '오는', '먹는',
]);

/**
 * 이미 쌓인 것 중 못 쓸 것을 골라낸다.
 *
 * 규칙을 고쳐도 **어제까지 쌓인 쓰레기는 그대로 남는다.** 실측(31회차): 30개가 쌓여 있는데
 * 쓸 만한 게 0개였다. 새 규칙만 넣고 옛것을 안 치우면 얘는 계속 그 쓰레기를 꺼내려 한다.
 */
export function unusableCuriosity(about: string, skip: ReadonlySet<string> = 흔한말): boolean {
  // 옛 형식(「조수님이 「…」 라고 했던 것 — X 에 대해 더」)은 통째로 못 쓴다 —
  // 문장을 그대로 물고 있어서 꺼내면 그 문장을 읊는다.
  // 옛 형식은 문장을 통째로 물고 있어 줄바꿈이 섞이면 조각으로 남는다 —
  // 「조수님이 「1. 하나」 만 한 줄로 남아 「라고 했던 것」 검사를 빠져나갔다(실측).
  if (about.includes('라고 했던 것') || about.startsWith('조수님이 ')) return true;
  // 우리가 뽑은 형식(「낱말 — 조수님이 꺼낸 얘기」)만 알맹이를 본다.
  // **사람이 손으로 적은 것은 건드리지 않는다** — 규칙에 안 맞는다고 남의 메모를 버리면 안 된다.
  if (about.includes('— 조수님이 꺼낸 얘기') === false) return false;
  return worthWondering(about.split('—')[0].trim(), skip) === false;
}
