/**
 * 깨진 글자 되살리기 — 뭐가 잘못 읽혔나 (TASK-KL-316 / 4)
 *
 * 「뷁」·「í•œêµ­ì–´」·「?????」는 **글자가 상한 게 아니라 잘못 읽힌 것**이다.
 * 바이트는 그대로인데 읽는 표를 틀린 것이라, 틀린 순서를 되짚으면 원문이 돌아온다.
 *
 * 그래서 여기서는 고치는 게 아니라 **되짚는다**: 나올 수 있는 되짚기를 다 해 보고
 * (`candidates`) 「한국어·일본어·한자로 보이는 정도」로 점수를 매겨 가장 그럴듯한 것을 앞에 둔다.
 * 사람에게 「무슨 일이 있었나」를 같이 말해 주는 게 이 도구의 값어치다 — 다음엔 안 겪게.
 *
 * 못 되살리는 경우도 **분명히 말한다**: 물음표(`?`)나 대체 문자(U+FFFD)로 이미 바뀐 글자는
 * 바이트가 사라진 것이라 되돌릴 수 없다. 「해 봤지만 안 된다」와 「원래 안 된다」는 다르다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'encdetective',
  ops: {
    fix: {
      desc:
        'Repair mojibake (garbled text) by undoing the wrong decoding.' +
        ' Returns the most plausible original text.',
      in: { text: 'string' },
      out: 'string'
    },
    explain: {
      desc: 'Explain what went wrong with a garbled text and list the repair candidates with scores.',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

export interface Candidate {
  /** 무슨 되짚기를 했나 — 사람이 읽을 이름 */
  how: string;
  /** 되짚어 나온 글 */
  text: string;
  /** 0~100. 한글·가나·한자로 보이는 정도 */
  score: number;
}

/** 되살릴 수 없게 이미 사라진 자리 */
export interface Loss {
  replacement: number;
  question: number;
}

const enc = new TextEncoder();

function decode(bytes: Uint8Array, label: string): string | undefined {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** 글자를 그 코드값 그대로 바이트로 본다 (0~255 밖은 못 담는다 → 이 길은 아니다). */
function toBytesLatin1(text: string): Uint8Array | undefined {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) return undefined;
    out[i] = code;
  }
  return out;
}

/** cp1252 는 latin1 과 0x80~0x9F 구간이 다르다 — 그 구간을 되돌린다. */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
};

function toBytesCp1252(text: string): Uint8Array | undefined {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0xff) {
      out[i] = code;
      continue;
    }
    const mapped = CP1252_HIGH[code];
    if (mapped === undefined) return undefined;
    out[i] = mapped;
  }
  return out;
}

/** 한글·가나·한자로 보이는 정도. 글자가 아닌 것(사용 안 하는 구간)은 깎는다. */
export function score(text: string): number {
  if (text === '') return 0;
  let good = 0;
  let bad = 0;
  let plain = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0xfffd || c === 0xfffe) {
      bad += 3;
      continue;
    }
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f)) {
      good += 3; // 한글
      continue;
    }
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff)) {
      good += 3; // 가나·한자
      continue;
    }
    if (c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0x7e)) {
      plain += 1; // 아스키 — 나쁘지도 좋지도 않다
      continue;
    }
    if ((c >= 0x80 && c <= 0x2bff) || (c >= 0xe000 && c <= 0xf8ff)) {
      bad += 2; // 라틴 악센트·기호 무더기 = 깨짐의 냄새
      continue;
    }
    plain += 1;
  }
  const total = good + bad + plain;
  if (total === 0) return 0;
  return Math.max(0, Math.round(((good - bad) / total) * 100));
}

export function losses(text: string): Loss {
  let replacement = 0;
  let question = 0;
  for (const ch of text) {
    if (ch === '�') replacement++;
    if (ch === '?') question++;
  }
  return { replacement, question };
}

/**
 * 나올 수 있는 되짚기를 다 해 본다. **고르지 않는다** — 고르는 건 부르는 쪽이다.
 * 점수 높은 순, 같으면 먼저 넣은 순.
 */
export function candidates(text: string): Candidate[] {
  const out: Candidate[] = [{ how: '그대로 (안 건드림)', text, score: score(text) }];
  const push = (how: string, value: string | undefined): void => {
    if (value === undefined || value === '' || value === text) return;
    if (out.some((c) => c.text === value)) return;
    out.push({ how, text: value, score: score(value) });
  };

  const latin1 = toBytesLatin1(text);
  const cp1252 = toBytesCp1252(text);

  // ① UTF-8 을 서유럽 표로 읽어 버린 경우 — 「í•œêµ­ì–´」
  if (latin1 !== undefined) push('UTF-8 을 latin1(ISO-8859-1)로 읽은 것을 되짚음', decode(latin1, 'utf-8'));
  if (cp1252 !== undefined) push('UTF-8 을 cp1252(윈도 서유럽)로 읽은 것을 되짚음', decode(cp1252, 'utf-8'));

  // ② UTF-8 을 한국어 완성형(cp949)으로 읽어 버린 경우 — 「뷁」류
  if (latin1 !== undefined) push('UTF-8 을 cp949(EUC-KR)로 읽은 것을 되짚음', decode(latin1, 'euc-kr'));
  if (latin1 !== undefined) push('UTF-8 을 shift_jis 로 읽은 것을 되짚음', decode(latin1, 'shift_jis'));

  // ③ cp949 로 저장된 것을 UTF-8 로 읽은 경우 — 원문 바이트가 남아 있으면 되짚어진다
  const asUtf8 = enc.encode(text);
  push('cp949(EUC-KR)로 적힌 것을 UTF-8 로 읽은 것을 되짚음', decode(asUtf8, 'euc-kr'));
  push('shift_jis 로 적힌 것을 UTF-8 로 읽은 것을 되짚음', decode(asUtf8, 'shift_jis'));

  // ④ 두 번 씌운 경우 — 한 겹 벗기고 또 한 겹
  if (latin1 !== undefined) {
    const once = decode(latin1, 'utf-8');
    if (once !== undefined) {
      const twice = toBytesLatin1(once);
      if (twice !== undefined) push('UTF-8 을 두 겹 씌운 것을 되짚음', decode(twice, 'utf-8'));
    }
  }

  // ⑤ 주소·HTML 로 감싸인 경우 — 깨짐은 아니지만 「글자가 이상하다」로 같이 온다
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      push('주소 인코딩(%EC%95%88…)을 푼 것', decodeURIComponent(text));
    } catch {
      /* 반쪽짜리 % 가 섞이면 못 푼다 — 그건 후보로 안 넣는다 */
    }
  }
  if (/&#x?[0-9A-Fa-f]+;/.test(text)) {
    push(
      'HTML 숫자 문자 참조(&#xAC00;)를 푼 것',
      text.replace(/&#x([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    );
  }
  if (/\\u[0-9A-Fa-f]{4}/.test(text)) {
    push(
      '자바스크립트 escape(\\uAC00)를 푼 것',
      text.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    );
  }

  return out.sort((a, b) => b.score - a.score);
}

export function bestFix(text: string): Candidate {
  return candidates(text)[0];
}

export function explain(text: string): string {
  const list = candidates(text);
  const loss = losses(text);
  const rows: string[] = [];
  const best = list[0];
  rows.push('가장 그럴듯한 것: ' + best.how + ' (점수 ' + best.score + ')');
  rows.push(best.text);
  rows.push('');
  if (loss.replacement > 0) {
    rows.push('⚠ 대체 문자(U+FFFD) ' + loss.replacement + '개 — 그 자리는 바이트가 이미 사라져 못 되살린다.');
  }
  /* 물음표가 줄줄이 붙어 있으면 저장할 때 글자를 버린 흔적이다 —
     남은 글자가 멀쩡해 점수가 높아도 **그 자리는 이미 없다**(점수로 가리면 안 된다). */
  if (/\?{2,}/.test(text) || loss.question >= 3) {
    rows.push('⚠ 물음표가 ' + loss.question + '개 — 저장할 때 「이 표에 없는 글자」를 ? 로 바꿔 버린 흔적일 수 있다. 그건 못 되살린다.');
  }
  rows.push('해 본 되짚기 ' + list.length + '가지:');
  for (const c of list) rows.push('  [' + String(c.score).padStart(3, ' ') + '] ' + c.how);
  return rows.join('\n');
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (op === 'fix') return bestFix(text).text;
  if (op === 'explain') return explain(text);
  throw new Error('encdetective: 모르는 연산 ' + op);
};
