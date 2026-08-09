/**
 * 글자수 세기 — 알맹이 (TASK-KL-088 / S1)
 *
 * MCP 로 내놓는 이유(B등급): 「몇 글자야?」의 답이 **기준마다 다르다.**
 *  ① 공백 포함 / 제외 — 자소서는 대개 공백 포함, 어떤 곳은 제외
 *  ② 글자 / 바이트 — 옛 시스템은 바이트로 자른다. 한글은 UTF-8 에서 3바이트, EUC-KR 에서 2바이트
 *  ③ 이모지 — 코드 단위로 세면 2로 세진다. 사람이 보기엔 한 글자다
 * LLM 은 이 중 하나로 뭉뚱그려 답하고, 한도가 걸린 칸(자소서·메타 설명)에서 그게 사고가 된다.
 * 그래서 **여러 기준을 한 번에** 낸다 — 어느 기준인지도 함께.
 *
 * 원고지·EUC-KR 은 한국(과 일본)에서만 뜻이 있는 칸이다. 화면은 지역을 보고 감추지만,
 * 알맹이는 값을 다 낸다 — 부르는 쪽이 고르면 된다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'charcount',
  ops: {
    count: {
      desc:
        '글자수를 여러 기준으로 한 번에 센다 — 공백 포함/제외 · 단어 · 문장 · 줄 · 문단 ·' +
        ' UTF-8/EUC-KR 바이트 · 원고지 매수 · 종류별(한글·영문·숫자). 이모지는 사람이 보는 대로 한 글자.',
      in: { text: 'string' },
      out: 'string'
    },
    fits: {
      desc: '정해진 한도에 들어가는지 본다. 기준(공백 포함/제외/바이트)을 골라서.',
      in: { text: 'string', limit: 'number', basis: 'string?' },
      out: 'string'
    }
  }
};

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const LATIN = /[A-Za-z]/;
const DIGIT = /[0-9]/;

/**
 * 이모지를 **사람이 보는 대로** 센다. `text.length` 는 코드 단위라 🦴 를 2로 센다.
 * `[...text]` 는 코드포인트 단위라 1로 센다 (조합 이모지는 여전히 여러 개지만, 그건 규격이 그렇다).
 */
export const chars = (text: string): string[] => [...text];

export function byteLength(s: string, encoding: 'utf8' | 'euckr' = 'utf8'): number {
  if (encoding === 'utf8') return new TextEncoder().encode(s).length;
  /* EUC-KR 근사: 한글·한자·전각 = 2바이트, ASCII = 1바이트.
     이모지처럼 **애초에 못 담는 글자**는 여기서 2로 세지 말고 따로 알린다(`euckrUnsafe`). */
  let n = 0;
  for (const ch of chars(s)) n += (ch.codePointAt(0) ?? 0) > 127 ? 2 : 1;
  return n;
}

/** 옛 인코딩(EUC-KR)에 못 담기는 글자 — 이모지 등. 붙여넣는 곳에서 깨진다. */
export function euckrUnsafe(s: string): string[] {
  const out: string[] = [];
  for (const ch of chars(s)) {
    if ((ch.codePointAt(0) ?? 0) > 0xffff && out.includes(ch) === false) out.push(ch);
  }
  return out;
}

/** 원고지는 **칸**이다 — 줄이 바뀌면 남은 칸은 버린다. 한 줄 20칸 · 한 장 200칸. */
export function manuscriptSheets(text: string): number {
  if (text.trim() === '') return 0;
  const cells = text.split('\n').reduce((sum, line) => sum + Math.ceil(chars(line).length / 20 || 0), 0);
  return Math.ceil((cells * 20) / 200);
}

/** 마지막 문장에 마침표가 없어도 문장이다 — 자소서 마지막 줄이 늘 그렇다. */
export function sentenceCount(text: string): number {
  const closed = (text.match(/[^.!?。？！\n]+[.!?。？！]+/g) ?? []).length;
  const tail = text.replace(/[\s\S]*[.!?。？！]/, '').trim();
  return closed + (tail === '' ? 0 : 1);
}

export interface Counts {
  withSpace: number;
  withoutSpace: number;
  words: number;
  sentences: number;
  lines: number;
  paragraphs: number;
  utf8: number;
  euckr: number;
  manuscript: number;
  hangul: number;
  latin: number;
  digit: number;
  space: number;
  other: number;
  unsafe: string[];
}

export function count(text: string): Counts {
  const cs = chars(text);
  let hangul = 0;
  let latin = 0;
  let digit = 0;
  let space = 0;
  let other = 0;
  for (const ch of cs) {
    if (/\s/.test(ch)) space++;
    else if (HANGUL.test(ch)) hangul++;
    else if (LATIN.test(ch)) latin++;
    else if (DIGIT.test(ch)) digit++;
    else other++;
  }
  return {
    withSpace: cs.length,
    withoutSpace: chars(text.replace(/\s/g, '')).length,
    words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
    sentences: sentenceCount(text),
    lines: text === '' ? 0 : text.split('\n').length,
    paragraphs: text.trim() === '' ? 0 : text.trim().split(/\n\s*\n/).length,
    utf8: byteLength(text, 'utf8'),
    euckr: byteLength(text, 'euckr'),
    manuscript: manuscriptSheets(text),
    hangul,
    latin,
    digit,
    space,
    other,
    unsafe: euckrUnsafe(text)
  };
}

export type Basis = 'withSpace' | 'withoutSpace' | 'utf8' | 'euckr';

const BASIS_KO: Record<Basis, string> = {
  withSpace: '공백 포함 글자수',
  withoutSpace: '공백 제외 글자수',
  utf8: 'UTF-8 바이트',
  euckr: 'EUC-KR 바이트'
};

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');

  if (op === 'count') {
    const c = count(text);
    const lines = [
      `공백 포함 ${c.withSpace}자  ·  공백 제외 ${c.withoutSpace}자  ← 어느 기준인지 확인하세요`,
      `단어 ${c.words}  ·  문장 ${c.sentences}  ·  줄 ${c.lines}  ·  문단 ${c.paragraphs}`,
      `UTF-8 ${c.utf8}바이트  ·  EUC-KR ${c.euckr}바이트 (옛 시스템은 바이트로 자릅니다)`,
      `원고지 ${c.manuscript}장  ·  한글 ${c.hangul} · 영문 ${c.latin} · 숫자 ${c.digit} · 공백 ${c.space} · 기타 ${c.other}`
    ];
    if (c.unsafe.length > 0) {
      lines.push(`⚠ EUC-KR 로는 못 담는 글자가 있습니다: ${c.unsafe.join(' ')} — 옛 시스템에 붙여넣으면 깨집니다.`);
    }
    return lines.join('\n');
  }

  if (op === 'fits') {
    const limit = Number(args.limit);
    if (Number.isFinite(limit) === false || limit <= 0) throw new Error('한도를 0보다 큰 숫자로 주세요');
    const basis = String(args.basis ?? 'withSpace') as Basis;
    if (basis in BASIS_KO === false) {
      throw new Error(`모르는 기준입니다: ${basis} (withSpace · withoutSpace · utf8 · euckr)`);
    }
    const c = count(text);
    const now = c[basis];
    const left = limit - now;
    return [
      `${BASIS_KO[basis]} ${now} / 한도 ${limit}`,
      left >= 0 ? `${left} 남음 (통과)` : `${-left} 초과 — 줄여야 합니다`,
      `참고: 공백 포함 ${c.withSpace} · 공백 제외 ${c.withoutSpace} · UTF-8 ${c.utf8}바이트`
    ].join('\n');
  }

  throw new Error(`charcount 에 「${op}」 는 없습니다`);
};
