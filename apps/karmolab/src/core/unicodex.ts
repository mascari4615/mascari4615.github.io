/**
 * 안 보이는 글자·닮은 글자 잡기 (TASK-KL-316 / 5)
 *
 * 눈으로 같은데 기계가 다르다고 하는 일이 있다 — 붙여넣은 곳에 **폭 없는 공백**이 섞였거나,
 * 라틴 `a` 자리에 키릴 `а` 가 앉았거나(도메인·아이디 사칭에 쓰이는 그것), 공백이 `nbsp` 라서다.
 * 「글 정리」의 체크상자는 그런 것을 **말없이 지운다**. 여기서는 반대로 **무엇이 몇 번째에
 * 있는지 이름을 대고**, 지울지는 사람이 고른다. 안 보이는 것을 지울 때는 보여 주고 지워야 한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'unicodex',
  ops: {
    scan: {
      desc: 'Find invisible characters, look-alike (confusable) letters, and odd spaces in a text.',
      in: { text: 'string' },
      out: 'string'
    },
    clean: {
      desc:
        'Remove invisible characters and normalize look-alikes / odd spaces.' +
        ' keepConfusables=true leaves look-alike letters alone.',
      in: { text: 'string', keepConfusables: 'boolean?' },
      out: 'string'
    }
  }
};

export type FindingKind = 'invisible' | 'space' | 'control' | 'bidi' | 'confusable' | 'combining';

export interface Finding {
  kind: FindingKind;
  /** 몇 번째 글자인가 (0부터) */
  at: number;
  char: string;
  /** `U+200B` */
  code: string;
  name: string;
  /** 무엇으로 바꾸면 되나. 빈 문자열 = 지우면 된다. */
  fix: string;
}

const hex = (ch: string): string => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');

/** 안 보이는데 자리를 차지하는 것들 — 지우는 게 답이다. **글자를 그대로 안 적고 코드값으로 적는다** (보이지 않는 글자를 소스에 박으면 편집기·검사가 조용히 지운다). */
const INVISIBLE: Record<string, string> = {
  [String.fromCodePoint(0x200b)]: "폭 없는 공백 (zero-width space)" /* U+200B */,
  [String.fromCodePoint(0x200c)]: "폭 없는 비접합 (ZWNJ)" /* U+200C */,
  [String.fromCodePoint(0x200d)]: "폭 없는 접합 (ZWJ)" /* U+200D */,
  [String.fromCodePoint(0xfeff)]: "바이트 순서 표시 (BOM)" /* U+FEFF */,
  [String.fromCodePoint(0x2060)]: "낱말 붙임 (word joiner)" /* U+2060 */,
  [String.fromCodePoint(0xad)]: "보이지 않는 하이픈 (soft hyphen)" /* U+00AD */,
  [String.fromCodePoint(0x180e)]: "몽골 모음 구분자" /* U+180E */
};

/** 방향을 바꾸는 것들 — 보이는 순서와 실제 순서가 달라진다(속임수에 쓰인다). */
const BIDI: Record<string, string> = {
  [String.fromCodePoint(0x202a)]: "왼→오 넣기" /* U+202A */,
  [String.fromCodePoint(0x202b)]: "오→왼 넣기" /* U+202B */,
  [String.fromCodePoint(0x202c)]: "방향 되돌리기" /* U+202C */,
  [String.fromCodePoint(0x202d)]: "왼→오 덮어쓰기" /* U+202D */,
  [String.fromCodePoint(0x202e)]: "오→왼 덮어쓰기 (거꾸로 보이게 하는 그것)" /* U+202E */,
  [String.fromCodePoint(0x2066)]: "왼→오 가두기" /* U+2066 */,
  [String.fromCodePoint(0x2067)]: "오→왼 가두기" /* U+2067 */,
  [String.fromCodePoint(0x2068)]: "첫 방향 가두기" /* U+2068 */,
  [String.fromCodePoint(0x2069)]: "가두기 끝" /* U+2069 */
};

/** 보이지만 보통 공백이 아닌 것들 — 보통 공백으로 바꾸면 된다. */
const ODD_SPACE: Record<string, string> = {
  [String.fromCodePoint(0xa0)]: "줄바꿈 없는 공백 (nbsp)" /* U+00A0 */,
  [String.fromCodePoint(0x1680)]: "오검 공백" /* U+1680 */,
  [String.fromCodePoint(0x2000)]: "엔 쿼드" /* U+2000 */,
  [String.fromCodePoint(0x2001)]: "엠 쿼드" /* U+2001 */,
  [String.fromCodePoint(0x2002)]: "엔 공백" /* U+2002 */,
  [String.fromCodePoint(0x2003)]: "엠 공백" /* U+2003 */,
  [String.fromCodePoint(0x2004)]: "1/3 공백" /* U+2004 */,
  [String.fromCodePoint(0x2005)]: "1/4 공백" /* U+2005 */,
  [String.fromCodePoint(0x2006)]: "1/6 공백" /* U+2006 */,
  [String.fromCodePoint(0x2007)]: "숫자 공백" /* U+2007 */,
  [String.fromCodePoint(0x2008)]: "구두점 공백" /* U+2008 */,
  [String.fromCodePoint(0x2009)]: "가는 공백" /* U+2009 */,
  [String.fromCodePoint(0x200a)]: "머리카락 공백" /* U+200A */,
  [String.fromCodePoint(0x202f)]: "좁은 nbsp" /* U+202F */,
  [String.fromCodePoint(0x205f)]: "중간 수학 공백" /* U+205F */,
  [String.fromCodePoint(0x3000)]: "전각 공백" /* U+3000 */
};

/** 라틴처럼 보이는 남의 글자 — 사칭에 쓰인다. 값 = 진짜 라틴 글자. */
const CONFUSABLE: Record<string, string> = {
  // 키릴
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'ѕ': 's', 'і': 'i', 'ј': 'j',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
  'У': 'Y', 'Х': 'X', 'Ѕ': 'S', 'І': 'I', 'Ј': 'J',
  // 그리스
  'ο': 'o', 'Ο': 'O', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
  'Ν': 'N', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'ν': 'v', 'ρ': 'p',
  // 전각 라틴·숫자·기호
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', '０': '0', '１': '1', '２': '2',
  '．': '.', '／': '/', '：': ':', '－': '-',
  // 눈에 안 띄는 기호 바꿔치기
  '‐': '-', '‑': '-', '–': '-', '—': '-', '−': '-',
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '‚': "'",
  '⁄': '/', '∕': '/', '․': '.', '‥': '..', '…': '...'
};

export function scan(text: string): Finding[] {
  const out: Finding[] = [];
  let at = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (INVISIBLE[ch] !== undefined) out.push({ kind: 'invisible', at, char: ch, code: hex(ch), name: INVISIBLE[ch], fix: '' });
    else if (BIDI[ch] !== undefined) out.push({ kind: 'bidi', at, char: ch, code: hex(ch), name: BIDI[ch], fix: '' });
    else if (ODD_SPACE[ch] !== undefined) out.push({ kind: 'space', at, char: ch, code: hex(ch), name: ODD_SPACE[ch], fix: ' ' });
    else if (CONFUSABLE[ch] !== undefined) {
      out.push({ kind: 'confusable', at, char: ch, code: hex(ch), name: '「' + CONFUSABLE[ch] + '」 처럼 보이는 다른 글자', fix: CONFUSABLE[ch] });
    } else if ((code < 0x20 && code !== 9 && code !== 10 && code !== 13) || code === 0x7f) {
      out.push({ kind: 'control', at, char: ch, code: hex(ch), name: '조작 문자', fix: '' });
    }
    at++;
  }
  // 겹친 결합 부호(자모가 여러 겹 얹힌 「글리치 글자」)
  let run = 0;
  at = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const combining = (code >= 0x0300 && code <= 0x036f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x20d0 && code <= 0x20f0);
    if (combining) {
      run++;
      if (run === 3) out.push({ kind: 'combining', at, char: ch, code: hex(ch), name: '결합 부호가 세 겹 넘게 얹혔다 (글리치 글자)', fix: '' });
    } else run = 0;
    at++;
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface CleanOpts {
  /** 닮은 글자는 그대로 둔다 (원문이 정말 러시아어일 수도 있다) */
  keepConfusables?: boolean;
}

export function clean(text: string, opts: CleanOpts = {}): string {
  let out = '';
  for (const ch of text) {
    if (INVISIBLE[ch] !== undefined || BIDI[ch] !== undefined) continue;
    const code = ch.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 9 && code !== 10 && code !== 13) || code === 0x7f) continue;
    if (ODD_SPACE[ch] !== undefined) {
      out += ' ';
      continue;
    }
    if (opts.keepConfusables !== true && CONFUSABLE[ch] !== undefined) {
      out += CONFUSABLE[ch];
      continue;
    }
    out += ch;
  }
  /* 한글은 자모가 흩어져 있으면 눈으로 같아도 다르다 — 합쳐 둔다(NFC). */
  return out.normalize('NFC');
}

export function report(text: string): string {
  const found = scan(text);
  if (found.length === 0) return '수상한 글자가 없습니다.';
  const rows = found.map((f) => f.at + '번째 · ' + f.code + ' · ' + f.name + (f.fix === '' ? ' → 지우면 됩니다' : ' → 「' + f.fix + '」 로 바꾸면 됩니다'));
  const kinds = new Map<FindingKind, number>();
  for (const f of found) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
  const head = [...kinds.entries()].map(([k, n]) => k + ' ' + n).join(' · ');
  return found.length + '군데 (' + head + ')\n' + rows.join('\n');
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (op === 'scan') return report(text);
  if (op === 'clean') return clean(text, { keepConfusables: args.keepConfusables === true });
  throw new Error('unicodex: 모르는 연산 ' + op);
};
