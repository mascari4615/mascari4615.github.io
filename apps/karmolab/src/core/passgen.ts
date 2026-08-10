/**
 * 비밀번호 세기 — 알맹이 (TASK-KL-205 / S1)
 *
 * **만드는 쪽은 이미 있다** (`uuidgen_generate` kind=password). 여기 없는 것은 **재는 쪽**이다.
 *
 * MCP 로 내놓는 이유(A등급): 「이 비밀번호 안전해?」는 LLM 이 **인상으로 답한다.** `P@ssw0rd123!`
 * 에 「대문자·숫자·기호가 다 있으니 강함」이라고 답하는 식이다. 실제로는 흔한 단어 하나에
 * 뻔한 치환 몇 개라 몇 초면 뚫린다. 사람은 그 답을 믿고 그 비밀번호를 쓴다.
 *
 * ★ 이 파일의 요점은 **글자 종류를 세지 않는 것**이다.
 *
 * 흔히 쓰는 「대·소·숫자·기호 다 있으면 강함」 규칙은 `Password1!` 을 통과시키고
 * `correcthorsebatterystaple` 을 탈락시킨다 — **정확히 거꾸로다.** 공격자는 글자 종류를
 * 무작위로 대입하지 않는다. 흔한 단어 · 붙은 숫자 · 연도 · 자판 줄 · 반복부터 본다.
 *
 * 그래서 두 가지를 다 낸다:
 *   ① **순진한 값** — 글자 풀 크기^길이. 「무작위로 만들었다면」의 상한.
 *   ② **패턴을 아는 값** — 흔한 단어·연속·반복·연도·자판줄을 *한 덩어리*로 보고 그 덩어리의
 *      실제 가짓수만 센다. 공격자가 아는 만큼 깎는다.
 * 그리고 **둘 중 작은 값**으로 판정한다. 안전 쪽으로 틀리는 게 이 도구의 유일한 올바른 방향이다.
 *
 * 한계는 답에 적는다 — 유출 목록 대조가 아니다(그건 네트워크가 필요하다). 여기 든 단어표에
 * 없는 흔한 단어는 못 잡는다. 못 잡으면 **점수가 후해진다** → 그래서 「이 값보다 약할 수는
 * 있어도 강할 수는 없다」고 말한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'passgen',
  ops: {
    strength: {
      desc:
        'Rate a password by guessing cost, not by character classes. The usual "has upper, lower, digit,' +
        ' symbol" rule passes Password1! and fails correcthorsebatterystaple — exactly backwards.' +
        ' This scores common words, leet substitutions, sequences, repeats, years and keyboard runs as' +
        ' single cheap chunks, and reports the LOWER of that and the naive pool entropy, plus crack time' +
        ' at offline (1e10/s) and online (100/s) rates.' +
        ' / 비밀번호 세기를 「뚫는 비용」으로 잰다. 글자 종류 규칙 X.',
      in: { password: 'string' },
      out: 'string'
    }
  }
};

/**
 * 자주 쓰이는 밑말. **완전한 목록이 아니다** — 완전할 수도 없다.
 * 여기 없는 단어는 못 잡고, 못 잡으면 점수가 *후해진다*. 그래서 답에 「이보다 약할 수는 있다」를
 * 항상 적는다. 이 표는 판정의 바닥이지 천장이 아니다.
 */
export const COMMON_WORDS = [
  'password', 'passwd', 'letmein', 'welcome', 'admin', 'administrator', 'root', 'guest', 'user',
  'login', 'master', 'secret', 'access', 'default', 'changeme', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball', 'iloveyou',
  'trustno', 'shadow', 'michael', 'jennifer', 'jordan', 'superman', 'batman', 'starwars', 'pokemon',
  'computer', 'internet', 'samsung', 'google', 'facebook', 'naver', 'kakao', 'daum', 'apple',
  'korea', 'seoul', 'hello', 'test', 'temp', 'abcd', 'love', 'money', 'summer', 'winter', 'spring',
  'flower', 'angel', 'happy', 'freedom', 'whatever', 'ninja', 'mustang', 'harley', 'ranger'
];

/** 자판에서 손가락이 그냥 미끄러지는 줄. 여기 담긴 것은 「기억하기 쉬운」 = 「추측하기 쉬운」이다. */
export const KEYBOARD_RUNS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'qazwsxedc', '1qaz2wsx', '!@#$%^&*()'
];

/** 흔한 치환을 되돌린다. `P@ssw0rd` 를 `password` 로 보이게 하는 것이 목적이다. */
export function unleet(s: string): string {
  return s
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
}

/**
 * `1` 은 `i` 로도 `l` 로도 쓰인다 — 하나로 정할 수 없다. 정하는 순간 반대쪽을 통째로 놓치고,
 * 놓치면 **점수가 후해진다**. 그래서 둘 다 만들어 놓고 둘 다 대 본다.
 */
export function unleetVariants(s: string): string[] {
  const primary = unleet(s);
  const alt = primary.replace(/i/g, 'l');
  return alt === primary ? [primary] : [primary, alt];
}

/** 그 글자가 어느 풀에서 나왔는지로 풀 크기를 잡는다. 한글·그 밖의 글자는 넉넉히 잡는다. */
export function poolSize(pw: string): number {
  let n = 0;
  if (/[a-z]/.test(pw)) n += 26;
  if (/[A-Z]/.test(pw)) n += 26;
  if (/[0-9]/.test(pw)) n += 10;
  if (/[ -/:-@[-`{-~]/.test(pw)) n += 33;
  if (/[가-힣]/.test(pw)) n += 11172;
  if (/[^\x20-\x7e가-힣]/.test(pw)) n += 100;
  return Math.max(n, 1);
}

/**
 * 왜 싸게 매겨졌는지 — **말이 아니라 열쇠로** 낸다.
 * 화면은 이 열쇠로 자기 말(3개 국어)을 고르고, MCP 는 아래 `why` 한국어를 그대로 쓴다.
 * 열쇠 없이 한국어 문장을 넘기면 화면 쪽이 그 문장을 비교하게 되고, 문장을 고치는 순간 조용히 깨진다.
 */
export type ChunkKind = 'common' | 'keyboard' | 'sequence' | 'repeat' | 'year' | 'random';
export type ChunkWhyKey = 'common' | 'common.unleet' | 'keyboard' | 'sequence' | 'repeat' | 'year' | 'random';
export type StrengthLabelKey = 'veryWeak' | 'weak' | 'fair' | 'strong' | 'veryStrong';

export interface Chunk {
  text: string;
  /** 이 덩어리를 맞히는 데 드는 가짓수 (log2). */
  bits: number;
  /** 무엇으로 잡혔나. 화면이 자기 말을 고를 때 쓰는 열쇠. */
  kind: ChunkKind;
  /** 사람에게 보여 줄 이유 열쇠. 호출부가 자기 말로 고른다. */
  whyKey: ChunkWhyKey;
}

const log2 = (n: number): number => Math.log2(Math.max(n, 1));

/** 앞에서부터 가장 긴 「싸구려 덩어리」를 찾는다. 없으면 null. */
function cheapChunkAt(pw: string, i: number): Chunk | null {
  const rest = pw.slice(i);
  const restLower = rest.toLowerCase();
  const restLeetForms = unleetVariants(rest);

  // ① 흔한 단어 (치환 되돌린 뒤에도 본다)
  let best: Chunk | null = null;
  for (const w of COMMON_WORDS) {
    if (restLower.startsWith(w) || restLeetForms.some((f) => f.startsWith(w))) {
      const leeted = restLower.startsWith(w) === false;
      // 목록 안에서 고르는 비용 + 치환·대소문자 변형 비용. 변형은 싸다 — 공격자도 다 해 본다.
      const bits = log2(COMMON_WORDS.length) + (leeted ? 2 : 0) + 1;
      if (best === null || w.length > best.text.length) {
        best = {
          text: rest.slice(0, w.length),
          bits,
          kind: 'common',
          whyKey: leeted ? 'common.unleet' : 'common'
        };
      }
    }
  }
  if (best !== null) return best;

  // ② 자판 줄 (거꾸로도 본다)
  for (const run of KEYBOARD_RUNS) {
    for (const seq of [run, [...run].reverse().join('')]) {
      let len = 0;
      while (len < rest.length && seq.slice(0, len + 1) === restLower.slice(0, len + 1)) len++;
      if (len >= 4) {
        return { text: rest.slice(0, len), bits: log2(KEYBOARD_RUNS.length * 2 * len), kind: 'keyboard', whyKey: 'keyboard' };
      }
    }
  }

  // ③ 연속 (abcd · 4321). 시작 글자와 방향만 정하면 나머지는 공짜다.
  let runLen = 1;
  while (i + runLen < pw.length) {
    const d = pw.charCodeAt(i + runLen) - pw.charCodeAt(i + runLen - 1);
    if (d !== 1 && d !== -1) break;
    if (runLen > 1) {
      const prev = pw.charCodeAt(i + runLen - 1) - pw.charCodeAt(i + runLen - 2);
      if (d !== prev) break;
    }
    runLen++;
  }
  if (runLen >= 4) {
    return { text: pw.slice(i, i + runLen), bits: log2(94 * 2 * runLen), kind: 'sequence', whyKey: 'sequence' };
  }

  // ④ 반복 (aaaa · abab)
  for (let unit = 1; unit <= 4; unit++) {
    if (i + unit * 2 > pw.length) break;
    const u = pw.slice(i, i + unit);
    let reps = 1;
    while (pw.slice(i + reps * unit, i + (reps + 1) * unit) === u) reps++;
    if (reps >= 2 && unit * reps >= 4) {
      // 한 번치 값 + 몇 번 반복했는지. 100번 반복해도 거의 안 는다.
      return {
        text: pw.slice(i, i + unit * reps),
        bits: unit * log2(poolSize(u)) + log2(reps),
        kind: 'repeat',
        whyKey: 'repeat'
      };
    }
  }

  // ⑤ 연도 (1900~2099). 사람들이 붙이는 숫자 넷 중 대부분이 이것이다.
  if (/^(19|20)\d{2}/.test(rest)) return { text: rest.slice(0, 4), bits: log2(200), kind: 'year', whyKey: 'year' };

  return null;
}

export interface Strength {
  /** 「무작위로 만들었다면」의 값 (bits). */
  naiveBits: number;
  /** 패턴을 아는 공격자 기준 값 (bits). */
  patternBits: number;
  /** 판정에 쓰는 값 = 둘 중 작은 쪽. */
  bits: number;
  chunks: Chunk[];
  /** 0~4. zxcvbn 과 같은 눈금을 쓴다 — 이미 익숙한 눈금이다. */
  score: number;
  labelKey: StrengthLabelKey;
}

export function labelKey(score: number): StrengthLabelKey {
  return ['veryWeak', 'weak', 'fair', 'strong', 'veryStrong'][score] as StrengthLabelKey;
}

export function labelKo(key: StrengthLabelKey): string {
  return {
    veryWeak: '매우 약함',
    weak: '약함',
    fair: '보통',
    strong: '강함',
    veryStrong: '매우 강함'
  }[key];
}

export function whyKo(chunk: Chunk): string {
  return {
    common: '흔한 단어',
    'common.unleet': '흔한 단어(치환 되돌림)',
    keyboard: '자판 줄',
    sequence: '연속된 글자',
    repeat: '반복',
    year: '연도',
    random: '무작위'
  }[chunk.whyKey];
}

export function analyze(pw: string): Strength {
  if (pw === '') throw new Error('비밀번호가 비어 있습니다');

  const naiveBits = pw.length * log2(poolSize(pw));

  const chunks: Chunk[] = [];
  let i = 0;
  while (i < pw.length) {
    const cheap = cheapChunkAt(pw, i);
    if (cheap !== null) {
      chunks.push(cheap);
      i += cheap.text.length;
      continue;
    }
    // 싸구려가 아닌 글자는 한 글자씩 모아 「그냥 무작위」 덩어리로 만든다.
    let j = i;
    while (j < pw.length && cheapChunkAt(pw, j) === null) j++;
    const text = pw.slice(i, j);
    chunks.push({ text, bits: text.length * log2(poolSize(text)), kind: 'random', whyKey: 'random' });
    i = j;
  }

  // 덩어리들의 합 + 「어떤 덩어리를 어떤 순서로 놓았나」 비용. 덩어리가 많을수록 배치가 는다.
  const sum = chunks.reduce((a, c) => a + c.bits, 0);
  const patternBits = sum + (chunks.length > 1 ? log2(factorialish(chunks.length)) : 0);

  const bits = Math.min(naiveBits, patternBits);
  const score = bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { naiveBits, patternBits, bits, chunks, score, labelKey: labelKey(score) };
}

/** 덩어리 배치 가짓수의 어림 — n! 은 너무 커서 실제보다 후해진다. 작게 잡는다. */
function factorialish(n: number): number {
  return Math.min(n * n, 64);
}

/** 초 → 사람 말. 「4.3e12초」는 아무 것도 알려 주지 않는다. */
export function humanTime(seconds: number): string {
  if (seconds < 1) return '즉시';
  const units: Array<[number, string]> = [
    [60, '초'], [60, '분'], [24, '시간'], [365, '일'], [100, '년'], [1e6, '세기']
  ];
  let v = seconds;
  for (const [step, name] of units) {
    if (v < step) return `${v < 10 ? v.toFixed(1) : Math.round(v)}${name}`;
    v /= step;
  }
  // 백만 세기를 넘으면 숫자를 적어 봐야 아무 것도 안 알려 준다.
  return '사실상 불가능';
}

/** 공격 속도. 오프라인 = 유출된 해시를 GPU 로 미는 경우, 온라인 = 서버가 막아 주는 경우. */
export const OFFLINE_GUESSES_PER_SEC = 1e10;
export const ONLINE_GUESSES_PER_SEC = 100;

export function crackSeconds(bits: number, perSec: number): number {
  // 평균은 전체의 절반에서 걸린다.
  return Math.pow(2, bits) / 2 / perSec;
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'strength') throw new Error(`passgen 에 「${op}」 는 없습니다`);
  const pw = String(args.password ?? '');
  const r = analyze(pw);

  const lines = [
    `${labelKo(r.labelKey)} (${r.score}/4) — 실질 ${r.bits.toFixed(1)}비트`,
    '',
    `무작위로 만들었다면: ${r.naiveBits.toFixed(1)}비트`,
    `패턴을 아는 공격자 기준: ${r.patternBits.toFixed(1)}비트`,
    '',
    `털어 보는 데 걸리는 시간 — 유출된 해시를 GPU 로(초당 100억): ${humanTime(crackSeconds(r.bits, OFFLINE_GUESSES_PER_SEC))}`,
    `                          로그인 창에 직접(초당 100): ${humanTime(crackSeconds(r.bits, ONLINE_GUESSES_PER_SEC))}`,
    '',
    '뜯어보면:',
    ...r.chunks.map((c) => `- "${c.text}" — ${whyKo(c)} · ${c.bits.toFixed(1)}비트`),
    '',
    '※ 유출 목록 대조가 아닙니다. 여기 담긴 단어표에 없는 흔한 말은 못 잡습니다 —',
    '   그러면 점수가 후해집니다. 이 값보다 **약할 수는 있어도 강할 수는 없습니다.**'
  ];
  return lines.join('\n');
};
