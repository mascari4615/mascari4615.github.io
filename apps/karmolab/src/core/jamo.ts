/**
 * 한글 자모 분해·조합 — 알맹이 (TASK-KL-088 / S1)
 *
 * 검색·정렬을 만들다 보면 「강」을 ㄱ/ㅏ/ㅇ 으로 쪼개야 하는 순간이 온다(초성 검색).
 * 반대로 자모만 남은 문자열을 글자로 되돌려야 할 때도 있다 — 맥에서 만든 파일 이름이
 * 윈도우에서 「ㄱ ㅏ ㅁ」처럼 풀려 보이는 게 대표적이다(자모가 따로 저장된 표기, NFD).
 *
 * MCP 로 내놓는 이유(B등급): 유니코드 한글은 **계산으로** 쪼갠다
 * (코드 − 0xAC00 → 초성 ÷588, 중성 ÷28, 종성 나머지). LLM 은 이걸 외워서 답하다 자주 어긋나고,
 * 특히 겹받침(ㄳ·ㄺ·ㅄ)과 「다음 자모가 종성이냐 다음 글자의 초성이냐」에서 틀린다.
 * 그 판단이 이 파일의 핵심이고, 그래서 시험 대상이다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'jamo',
  ops: {
    split: {
      desc: '한글을 초성·중성·종성으로 쪼갠다. 초성만 뽑기(초성 검색용)도 함께 낸다.',
      in: { text: 'string' },
      out: 'string'
    },
    join: {
      desc: '자모 나열(ㄱㅏㅇ)을 다시 글자(강)로 되돌린다. NFD 로 풀린 파일 이름을 되돌릴 때 쓴다.',
      in: { text: 'string' },
      out: 'string'
    },
    initials: {
      desc: '초성만 뽑는다 (ㅎㄱ ← 한글). 초성 검색 색인을 만들 때.',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

export const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
export const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
export const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const BASE = 0xac00;

export const isSyllable = (ch: string): boolean => ch >= '가' && ch <= '힣';

/** 완성형 한 글자를 [초성, 중성, 종성] 으로. 한글이 아니면 null. 종성이 없으면 빈 문자열. */
export function split(ch: string): [string, string, string] | null {
  if (isSyllable(ch) === false) return null;
  const code = ch.charCodeAt(0) - BASE;
  return [CHO[Math.floor(code / 588)], JUNG[Math.floor((code % 588) / 28)], JONG[code % 28]];
}

/** 초성만. 한글이 아닌 글자는 그대로 둔다 (띄어쓰기·영문이 사라지면 검색이 안 맞는다). */
export function initials(text: string): string {
  return [...text].map((ch) => split(ch)?.[0] ?? ch).join('');
}

/** 자모를 늘어놓는다. 한글이 아닌 글자는 그대로. */
export function decompose(text: string): string {
  return [...text]
    .map((ch) => {
      const p = split(ch);
      return p === null ? ch : p[0] + p[1] + p[2];
    })
    .join('');
}

/**
 * 자모 나열을 다시 글자로.
 *
 * 어려운 자리 하나: 「ㄱㅏㅁㅏ」에서 ㅁ 은 **종성이 아니라 다음 글자의 초성**이다(가마).
 * 「ㄱㅏㅁ」이면 종성이다(감). 그래서 뒤를 한 칸 더 본다 — 다음이 모음이면 종성으로 안 붙인다.
 */
export function compose(text: string): string {
  const src = [...text];
  const out: string[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = CHO.indexOf(src[i]);
    const v = JUNG.indexOf(src[i + 1]);
    if (c >= 0 && v >= 0) {
      const jong = JONG.indexOf(src[i + 2] ?? '');
      const nextIsVowel = JUNG.indexOf(src[i + 3] ?? '') >= 0;
      const useJong = jong > 0 && nextIsVowel === false;
      out.push(String.fromCharCode(BASE + c * 588 + v * 28 + (useJong ? jong : 0)));
      i += useJong ? 2 : 1;
    } else {
      out.push(src[i]);
    }
  }
  return out.join('');
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (op === 'initials') return initials(text);
  if (op === 'join') return compose(text);
  if (op === 'split') {
    const lines = [`초성: ${initials(text)}`, `자모: ${decompose(text)}`];
    for (const ch of text) {
      const p = split(ch);
      if (p !== null) lines.push(`${ch} = 초성 ${p[0]} · 중성 ${p[1]} · 종성 ${p[2] === '' ? '없음' : p[2]}`);
    }
    return lines.join('\n');
  }
  throw new Error(`jamo 에 「${op}」 는 없습니다`);
};
