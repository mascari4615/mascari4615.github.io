/**
 * 문자 변환 허브 — 알맹이 (흡수 ⓒ / 02 문서 「한·일·중 공통 수요」)
 *
 * 한 화면에서 끝나야 하는 변환들이 지금은 흩어져 있거나 없다. 규칙으로 되는 것(전각·반각,
 * 로마자, 자모)과 **표가 있어야 되는 것(간체↔번체)** 을 함께 담는다. 표는 유니코드 Unihan 에서
 * 찍어 온 것이고(`scripts/gen-han-table.mjs`), 기기 안에 함께 실려 인터넷 없이도 돈다.
 *
 * MCP 로 내놓는 이유: 전각·반각은 눈으로 **거의 구분이 안 된다**. ＡＢ 와 AB 는 다른 글자인데
 * 화면에서는 폭만 다르게 보이고, 그래서 「검색이 안 된다 / 로그인이 안 된다 / 엑셀 조회가
 * 0건이다」로 나타난다. 모델에게 물으면 「같은 글자입니다」라고 답하는 일이 잦다.
 */
import { SIMP_TO_TRAD, SIMP_TO_TRAD_AMBIGUOUS, TRAD_TO_SIMP, TRAD_TO_SIMP_AMBIGUOUS } from './han-table.generated';
import { compose, decompose } from './jamo';
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'charconv',
  ops: {
    width: {
      desc:
        'Convert between full-width (ＡＢ１２) and half-width (AB12) characters — they look almost' +
        ' identical on screen but are different code points, which is why a search, a login, or an' +
        ' Excel lookup silently returns nothing. mode = half (default) or full.' +
        ' / 전각↔반각. 눈으로 거의 구분이 안 돼 검색·로그인·조회가 조용히 실패하는 자리.',
      in: { text: 'string', mode: 'string?' },
      out: 'string'
    },
    roman: {
      desc:
        'Romanize Hangul with the Revised Romanization letter table (국어의 로마자 표기법).' +
        ' Letter-by-letter only: it does NOT apply sound changes (신라 becomes sinra, not Silla),' +
        ' and says so in the output rather than pretending.' +
        ' / 한글 → 로마자(글자 단위). 음운 변화는 적용하지 않는다고 함께 밝힌다.',
      in: { text: 'string' },
      out: 'string'
    },
    han: {
      desc:
        'Convert Chinese characters between Simplified and Traditional using the Unicode Unihan'
        + ' variant tables. Character-by-character: where one Simplified character maps to several'
        + ' Traditional ones (发 → 發 hair-style vs 髮 hair), it picks the first and reports the'
        + ' ambiguity instead of hiding it. mode = simp (default) or trad.'
        + ' / 간체 ⟷ 번체. 갈리는 글자는 숨기지 않고 함께 알려 준다.',
      in: { text: 'string', mode: 'string?' },
      out: 'string'
    },
    jamo: {
      desc:
        'Split Hangul into jamo or join jamo back into syllables. mode = split (default) or join.' +
        ' / 한글 ↔ 자모.',
      in: { text: 'string', mode: 'string?' },
      out: 'string'
    }
  }
};

/* ── 전각 ↔ 반각 ─────────────────────────────────────────────────────────── */

/**
 * 아스키 33~126 은 전각 영역(FF01~FF5E)과 **일대일**로 대응한다. 그래서 표가 필요 없다.
 * 공백만 예외 — 전각 공백은 U+3000 이라 그 자리에 없다.
 */
const FULL_START = 0xff01;
const FULL_END = 0xff5e;
const HALF_START = 0x21;
const IDEO_SPACE = 0x3000;

export function toHalfWidth(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= FULL_START && c <= FULL_END) out += String.fromCodePoint(c - FULL_START + HALF_START);
    else if (c === IDEO_SPACE) out += ' ';
    else out += ch;
  }
  return out;
}

export function toFullWidth(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= HALF_START && c <= 0x7e) out += String.fromCodePoint(c - HALF_START + FULL_START);
    else if (c === 0x20) out += String.fromCodePoint(IDEO_SPACE);
    else out += ch;
  }
  return out;
}

/** 전각이 섞여 있나 — 「왜 검색이 안 되지」의 답이 대개 여기다. */
export function hasFullWidth(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= FULL_START && c <= FULL_END) || c === IDEO_SPACE) return true;
  }
  return false;
}

/* ── 한글 → 로마자 ───────────────────────────────────────────────────────── */

/**
 * 국어의 로마자 표기법(2000 고시)의 **글자 대응표**. 초성·중성·종성 순서는 `jamo` 것과 같다.
 *
 * ★ 한계를 먼저 적는다 — 이 변환은 **음운 변화를 적용하지 않는다.**
 * 「신라」는 규정상 Silla 인데 여기서는 sinra 가 나온다. 자음동화·구개음화·된소리되기를
 * 제대로 하려면 형태소 경계를 알아야 하고, 그건 사전이 필요한 일이다.
 * 그래서 **틀린 값을 맞다고 내놓는 대신, 무엇을 안 했는지 답에 적는다.**
 */
const ROMAN_CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const ROMAN_JUNG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo',
  'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'
];
const ROMAN_JONG = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'p', 't', 't', 'p', 'l',
  'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'
];

const CHO_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG_LIST = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG_LIST = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

export function romanize(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch < '가' || ch > '힣') {
      out += ch;
      continue;
    }
    const i = ch.charCodeAt(0) - 0xac00;
    out += ROMAN_CHO[Math.floor(i / 588)];
    out += ROMAN_JUNG[Math.floor(i / 28) % 21];
    out += ROMAN_JONG[i % 28];
  }
  return out;
}

/** 음운 변화가 걸릴 만한 자리가 있나 — 있으면 답에 「그대로 쓰면 안 될 수 있다」를 붙인다. */
export function needsSoundChange(text: string): boolean {
  const chars = [...text].filter((c) => c >= '가' && c <= '힣');
  for (let i = 0; i + 1 < chars.length; i++) {
    const jong = JONG_LIST[(chars[i].charCodeAt(0) - 0xac00) % 28];
    const cho = CHO_LIST[Math.floor((chars[i + 1].charCodeAt(0) - 0xac00) / 588)];
    if (jong === '') continue;
    /*
     * 받침 뒤에 자음이 오면 대개 소리가 바뀐다. 초성 ㅇ 앞은 연음이라 표기가 안 바뀐다.
     * (여기서 `cho` 는 **자모 글자**다 — 처음에 빈 문자열과 견주는 바람에 「강아지」까지
     *  경고가 붙었다. 시험이 잡았다.)
     */
    if (cho !== 'ㅇ') return true;
  }
  return false;
}

/* ── 간체 ⟷ 번체 ─────────────────────────────────────────────────────────── */

/**
 * 찍어 낸 짝 글(`가나다라…`)을 두 글자씩 끊어 표로 편다. 파일을 켤 때 한 번만 한다 —
 * 글자마다 문자열을 뒤지면 긴 글에서 눈에 띄게 느려진다.
 */
const pairMap = (pairs: string): Map<string, string> => {
  const map = new Map<string, string>();
  /* 한자는 대부분 BMP 라 두 글자 = 코드 두 개지만, 서로게이트가 섞여도 안 깨지게 배열로 편다. */
  const chars = [...pairs];
  for (let i = 0; i + 1 < chars.length; i += 2) map.set(chars[i], chars[i + 1]);
  return map;
};

const TO_SIMP = pairMap(TRAD_TO_SIMP);
const TO_TRAD = pairMap(SIMP_TO_TRAD);

/** 갈림 글(`发發髮 …`) — 첫 글자가 원본, 나머지가 후보다. */
const ambMap = (packed: string): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const group of packed.split(' ')) {
    const chars = [...group];
    if (chars.length > 1) map.set(chars[0], chars.slice(1));
  }
  return map;
};

const AMB_TO_TRAD = ambMap(SIMP_TO_TRAD_AMBIGUOUS);
const AMB_TO_SIMP = ambMap(TRAD_TO_SIMP_AMBIGUOUS);

const convert = (text: string, map: Map<string, string>): string =>
  [...text].map((ch) => map.get(ch) ?? ch).join('');

export function toSimplified(text: string): string {
  return convert(text, TO_SIMP);
}

export function toTraditional(text: string): string {
  return convert(text, TO_TRAD);
}

/**
 * **뜻을 봐야 정해지는 글자**들을 골라낸다.
 *
 * 간체 한 글자가 번체 여럿으로 갈리는 일이 있다 — 发 는 「보내다(發)」와 「머리카락(髮)」이
 * 같은 글자로 합쳐진 것이다. 낱말 사전 없이 하나를 고르면 **조용히 틀린 글**이 나온다.
 * 그래서 고르되(첫 후보), 어떤 글자가 갈렸는지 반드시 함께 말한다.
 */
export function ambiguousChars(text: string, toTrad: boolean): { ch: string; candidates: string[] }[] {
  const table = toTrad ? AMB_TO_TRAD : AMB_TO_SIMP;
  const seen = new Set<string>();
  const out: { ch: string; candidates: string[] }[] = [];
  for (const ch of text) {
    if (seen.has(ch)) continue;
    const cand = table.get(ch);
    if (cand === undefined) continue;
    seen.add(ch);
    out.push({ ch, candidates: cand });
  }
  return out;
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (text === '') throw new Error('바꿀 글이 없습니다');
  const mode = String(args.mode ?? '');

  if (op === 'width') {
    const toFull = mode === 'full';
    const result = toFull ? toFullWidth(text) : toHalfWidth(text);
    const lines = [result];
    if (toFull === false && hasFullWidth(text)) {
      lines.push('', '※ 전각 글자가 섞여 있었습니다 — 검색·로그인·조회가 안 되던 이유가 대개 이것입니다.');
    }
    return lines.join('\n');
  }

  if (op === 'roman') {
    const lines = [romanize(text)];
    if (needsSoundChange(text)) {
      lines.push(
        '',
        '※ 글자 단위 표기입니다. 음운 변화(자음동화 등)는 적용하지 않았습니다 —',
        '   예: 신라 → sinra (규정 표기는 Silla). 사람 이름·지명은 확인하고 쓰세요.'
      );
    }
    return lines.join('\n');
  }

  if (op === 'han') {
    const toTrad = mode === 'trad';
    const lines = [toTrad ? toTraditional(text) : toSimplified(text)];
    const amb = ambiguousChars(text, toTrad);
    if (amb.length > 0) {
      lines.push(
        '',
        '※ 뜻을 봐야 정해지는 글자가 있습니다 — 첫 후보로 바꿨습니다:',
        ...amb.map((a) => `   ${a.ch} → ${a.candidates.join(' 또는 ')}`)
      );
    }
    return lines.join('\n');
  }

  if (op === 'jamo') return mode === 'join' ? compose(text) : decompose(text);

  throw new Error(`charconv 에 「${op}」 는 없습니다`);
};
