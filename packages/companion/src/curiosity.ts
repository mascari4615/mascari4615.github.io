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
      return open[0] ?? null;
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
export function noticeCuriosity(
  said: string,
  known: string | null,
  store: Curiosity,
  options: { minLength?: number; skip?: ReadonlySet<string> } = {},
): string | null {
  const minLength = options.minLength ?? 2;
  const knownText = (known ?? '').toLowerCase();
  const sentence = said.trim();
  if (sentence.length < 6) return null; // 「응」 「그래」 같은 건 궁금할 게 없다

  const words = sentence
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= minLength && (options.skip ?? 흔한말).has(w) === false)
    .sort((a, b) => b.length - a.length);

  for (const word of words) {
    if (knownText.includes(word.toLowerCase())) continue; // 이미 아는 얘기
    const about = `조수님이 「${sentence.slice(0, 60)}」 라고 했던 것 — ${word} 에 대해 더`;
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
]);
