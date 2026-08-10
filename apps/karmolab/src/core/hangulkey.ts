/**
 * 한/영 타자 변환 — 알맹이 (TASK-KL-088 / S1) — 「dkssud」 ↔ 「안녕」.
 *
 * 두벌식 자판 기준. 영→한은 **조합 오토마타**(초/중/종 + 겹자모)로 실제 타이핑을 재현한다.
 * 단순 글자 치환이 아니다 — 받침을 넣었다가 다음 글자가 모음이면 그 받침이 **다음 글자의
 * 초성으로 넘어가야** 한다(「ㄱㅏㄴㅏ」 → 가나). 겹받침이면 뒷자음만 넘어간다(앉+ㅏ → 안자).
 *
 * MCP 로 내놓는 이유(B등급): 한국 사람이 매일 겪는 실수인데 LLM 은 자판 배열을 외워 답하다
 * 겹모음(ㅘ·ㅢ)과 받침 넘김에서 어긋난다. 게다가 이건 **자판 배열이라 지역 지식**이라,
 * 우리 말고 이걸 정확히 내놓는 MCP 서버가 없다.
 */
import { CHO, JONG, JUNG } from './jamo';
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'hangulkey',
  ops: {
    toKorean: {
      desc:
        'Recover Hangul typed without switching the IME (2-beolsik layout). dkssudgktpdy → 안녕하세요.' +
        ' Not a substitution table — it replays the composition automata (final consonants move to the' +
        ' next syllable when a vowel follows).' +
        ' / 한영키를 안 누르고 친 영문을 한글로 되돌린다.',
      in: { text: 'string' },
      out: 'string'
    },
    toEnglish: {
      desc:
        'Turn Hangul into the 2-beolsik key sequence. 안녕하세요 → dkssudgktpdy.' +
        ' / 한글을 두벌식 자판의 영문 키 나열로.',
      in: { text: 'string' },
      out: 'string'
    },
    auto: {
      desc:
        'Detect the direction and convert. Any Hangul present means Hangul → keys.' +
        ' / 어느 쪽인지 알아서 판단해 반대로 바꾼다.',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

/* 자모 표는 `core/jamo.ts` 하나뿐이다 — 여기 한 벌 더 적으면 언젠가 한쪽만 고쳐진다. */

/** 두벌식: 영문 키 → 자모 */
const KEY_TO_JAMO: Record<string, string> = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
  A: 'ㅁ', S: 'ㄴ', D: 'ㅇ', F: 'ㄹ', G: 'ㅎ', H: 'ㅗ', J: 'ㅓ', K: 'ㅏ', L: 'ㅣ',
  Z: 'ㅋ', X: 'ㅌ', C: 'ㅊ', V: 'ㅍ', B: 'ㅠ', N: 'ㅜ', M: 'ㅡ',
  Y: 'ㅛ', U: 'ㅕ', I: 'ㅑ'
};

const JAMO_TO_KEY: Record<string, string> = (function () {
  const m: Record<string, string> = {};
  // 소문자 우선. 대문자 전용 자모(ㅃㅉㄸㄲㅆㅒㅖ)만 뒤에 채운다.
  'qwertyuiopasdfghjklzxcvbnm'.split('').forEach((k) => {
    m[KEY_TO_JAMO[k]] = k;
  });
  'QWERTOP'.split('').forEach((k) => {
    const j = KEY_TO_JAMO[k];
    if (!(j in m)) m[j] = k;
  });
  return m;
})();

const VOWEL_COMBO: Record<string, string> = {
  'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
  'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
  'ㅡㅣ': 'ㅢ'
};
const VOWEL_SPLIT: Record<string, string> = {};
Object.keys(VOWEL_COMBO).forEach((k) => {
  VOWEL_SPLIT[VOWEL_COMBO[k]] = k;
});

const JONG_COMBO: Record<string, string> = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
  'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ',
  'ㅂㅅ': 'ㅄ'
};
const JONG_SPLIT: Record<string, string> = {};
Object.keys(JONG_COMBO).forEach((k) => {
  JONG_SPLIT[JONG_COMBO[k]] = k;
});

const isVowel = (j: string): boolean => JUNG.indexOf(j) >= 0;

/** 영문(두벌식 키) → 한글 */
export function engToKor(src: string): string {
  let out = '';
  let cho = -1;
  let jung = -1;
  let jong = 0;

  const flush = (): void => {
    if (cho >= 0 && jung >= 0) {
      out += String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong);
    } else if (cho >= 0) {
      out += CHO[cho];
    } else if (jung >= 0) {
      out += JUNG[jung];
    }
    cho = -1;
    jung = -1;
    jong = 0;
  };

  for (const ch of src) {
    const jamo = KEY_TO_JAMO[ch];
    if (!jamo) {
      flush();
      out += ch;
      continue;
    }

    if (isVowel(jamo)) {
      const vi = JUNG.indexOf(jamo);
      if (jong > 0) {
        // 받침이 다음 글자 초성으로 넘어간다 (겹받침이면 뒷자음만)
        const jongChar = JONG[jong];
        const split = JONG_SPLIT[jongChar];
        const moved = split ? split[1] : jongChar;
        jong = split ? JONG.indexOf(split[0]) : 0;
        flush();
        cho = CHO.indexOf(moved);
        jung = vi;
      } else if (cho >= 0 && jung < 0) {
        jung = vi;
      } else if (jung >= 0) {
        const combo = VOWEL_COMBO[JUNG[jung] + jamo];
        if (combo) {
          jung = JUNG.indexOf(combo);
        } else {
          flush();
          jung = vi;
        }
      } else {
        jung = vi;
      }
      continue;
    }

    // 자음
    if (cho < 0 && jung < 0) {
      cho = CHO.indexOf(jamo);
      if (cho < 0) out += jamo;
    } else if (jung < 0 || cho < 0) {
      flush();
      cho = CHO.indexOf(jamo);
      if (cho < 0) {
        out += jamo;
      }
    } else if (jong === 0) {
      const ji = JONG.indexOf(jamo);
      if (ji > 0) {
        jong = ji;
      } else {
        flush();
        cho = CHO.indexOf(jamo);
      }
    } else {
      const combo = JONG_COMBO[JONG[jong] + jamo];
      if (combo) {
        jong = JONG.indexOf(combo);
      } else {
        flush();
        cho = CHO.indexOf(jamo);
      }
    }
  }
  flush();
  return out;
}

/** 한글 → 영문(두벌식 키) */
export function korToEng(src: string): string {
  let out = '';
  for (const ch of src) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      const jamos = [CHO[Math.floor(idx / 588)], JUNG[Math.floor((idx % 588) / 28)], JONG[idx % 28]];
      for (const j of jamos) {
        if (!j) continue;
        const parts = VOWEL_SPLIT[j] || JONG_SPLIT[j] || j;
        for (const p of parts) out += JAMO_TO_KEY[p] ?? p;
      }
    } else if (JAMO_TO_KEY[ch] || VOWEL_SPLIT[ch] || JONG_SPLIT[ch]) {
      const parts = VOWEL_SPLIT[ch] || JONG_SPLIT[ch] || ch;
      for (const p of parts) out += JAMO_TO_KEY[p] ?? p;
    } else {
      out += ch;
    }
  }
  return out;
}

/** 한글이 하나라도 섞여 있으면 한글로 친 것으로 본다. */
export const hasHangul = (text: string): boolean => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text);

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (op === 'toKorean') return engToKor(text);
  if (op === 'toEnglish') return korToEng(text);
  if (op === 'auto') return hasHangul(text) ? korToEng(text) : engToKor(text);
  throw new Error(`hangulkey 에 「${op}」 는 없습니다`);
};
