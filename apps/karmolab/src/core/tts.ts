/**
 * 글을 읽어 주기 전에 — 문장으로 자르고, 얼마나 걸리는지 (TASK-KL-316 / 32)
 *
 * 브라우저는 글을 읽어 줄 수 있다(`speechSynthesis`). 그런데 **긴 글을 통째로 넘기면 중간에 멎는다**
 * (크롬의 오래된 버릇). 그래서 문장으로 잘라 하나씩 넘겨야 한다 — 자르는 규칙이 이 알맹이의 일이다.
 *
 * 자를 때 조심할 것: 「3.14」의 점, 「Mr.」 뒤, 따옴표 안의 물음표. 그냥 `.` 로 자르면
 * 숫자 한가운데서 끊겨 「삼 점」 「일사」로 읽힌다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'tts',
  ops: {
    split: {
      desc: 'Split text into sentences that are safe to speak one at a time.',
      in: { text: 'string' },
      out: 'string'
    },
    estimate: {
      desc: 'Estimate how long the text takes to read out loud, at a given rate.',
      in: { text: 'string', rate: 'number?' },
      out: 'string'
    }
  }
};

/** 자르면 안 되는 자리들 — 숫자 소수점·줄임말·자릿수 쉼표. */
const KEEP = /(\d\.\d)|(\b(Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|No)\.)/gi;

/**
 * 문장으로 자른다. 너무 긴 문장은 **쉼표에서 한 번 더** 자른다 —
 * 한 번에 넘기는 길이가 길수록 중간에 멎을 확률이 올라간다.
 */
export function split(text: string, maxChars = 180): string[] {
  /*
   * 자르면 안 되는 점은 **잠깐 다른 글자로 바꿔 두고** 자른 뒤 되돌린다.
   * 지웠다가 되살리면 「3.14」가 「314」로 남는다. 자리표는 소스에 그대로 박지 않고 코드값으로 적는다
   * (보이지 않는 글자를 소스에 두면 편집기·검사가 조용히 지운다 — unicodex 때의 교훈).
   */
  const DOT = String.fromCharCode(1);
  const guarded = text.replace(KEEP, (m) => m.split('.').join(DOT));
  const rough = guarded
    .replace(/\r\n?/g, '\n')
    .split(/(?<=[.!?。？！]|다\.|요\.)\s+|\n{2,}/)
    .map((s) => s.split(DOT).join('.').trim())
    .filter((s) => s !== '');

  const out: string[] = [];
  for (const piece of rough) {
    if (piece.length <= maxChars) {
      out.push(piece);
      continue;
    }
    let rest = piece;
    while (rest.length > maxChars) {
      /* 쉼표·이음말 뒤에서 끊는다. 없으면 어쩔 수 없이 길이로 자른다(멎는 것보다 낫다). */
      /* 이름을 window 로 두면 알맹이 금지어 검사에 걸린다 (브라우저 것을 쓰는 줄로 읽힌다). */
      const chunk = rest.slice(0, maxChars);
      const at = Math.max(chunk.lastIndexOf(', '), chunk.lastIndexOf('、'), chunk.lastIndexOf('; '), chunk.lastIndexOf(' '));
      const cut = at > maxChars * 0.4 ? at + 1 : maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest !== '') out.push(rest);
  }
  return out;
}

/** 어느 말로 읽어야 하나 — 글자 종류로 짐작한다. 반반이면 많은 쪽. */
export function guessLanguage(text: string): 'ko' | 'ja' | 'en' {
  let ko = 0;
  let ja = 0;
  let en = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) ko++;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)) ja++;
    else if (/[A-Za-z]/.test(ch)) en++;
  }
  if (ko >= ja && ko >= en) return ko === 0 ? 'en' : 'ko';
  return ja >= en ? 'ja' : 'en';
}

/**
 * 얼마나 걸리나. 말은 **글자 수가 아니라 소리 수**로 걸린다 —
 * 한국어·일본어는 한 글자가 대체로 한 소리, 영어는 낱말당 서너 소리다. 그래서 갈래별로 센다.
 */
export function seconds(text: string, rate = 1): number {
  const language = guessLanguage(text);
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '') return 0;
  const perSecond = language === 'en' ? 15 : 6.5; // 영어는 글자, 한·일은 음절 기준
  const units = language === 'en' ? clean.length : [...clean].filter((c) => !/\s/.test(c)).length;
  return Math.round((units / (perSecond * Math.max(0.3, rate))) * 10) / 10;
}

/** 「3분 12초」처럼 — 말은 화면이 만들되, 나누는 셈은 여기서. */
export function asClock(totalSeconds: number): { minutes: number; seconds: number } {
  const whole = Math.round(totalSeconds);
  return { minutes: Math.floor(whole / 60), seconds: whole % 60 };
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (op === 'split') return split(text).join('\n');
  if (op === 'estimate') {
    const s = seconds(text, args.rate === undefined ? 1 : Number(args.rate));
    const clock = asClock(s);
    return clock.minutes + 'm ' + clock.seconds + 's';
  }
  throw new Error('tts: 모르는 연산 ' + op);
};
