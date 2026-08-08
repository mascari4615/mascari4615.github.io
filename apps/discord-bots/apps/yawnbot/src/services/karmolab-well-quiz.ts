/**
 * 우물에서 오늘의 문제를 뽑는다 (TASK-KL-190 ③).
 *
 * 왜 있나: 「오늘의 문제」(quest)는 사람이 손으로 16개를 적어 둔 것이다 — 다 풀면 끝이다.
 * 그런데 우물(KL-153)에는 매일 새로 길어 오는 **숫자 붙은 표**가 다섯 벌 있다.
 * 거기서 문제를 뽑으면 콘텐츠가 **사람 손 없이** 는다.
 *
 * 날짜로 정한다: 같은 날이면 누구에게나 같은 문제여야 「오늘 거 풀었어?」가 성립한다.
 * 무작위로 뽑으면 새로고침할 때마다 문제가 바뀌어서 **틀리면 다시 뽑으면 그만**이 된다.
 *
 * 정답을 어떻게 숨기나: 기존 「오늘의 문제」와 **같은 규약**을 쓴다 — 정답 글자는 안 보내고
 * `sha256` 앞 16자만 보낸다(`data/quest-puzzles.json` 의 주석이 정본). 새 규약을 만들면
 * 채점하는 코드가 두 벌이 된다.
 */
import crypto from 'crypto';
import type { WellPack, WellItem, WellField } from './karmolab-wells';

export interface WellQuiz {
  /** 어느 우물에서 나온 문제인가. */
  well: string;
  day: string;
  question: string;
  /** 고를 것 4개 (정답 하나 포함, 섞여 있다). */
  choices: string[];
  /** 정답 지문 — 원문은 안 보낸다. */
  answerHash: string;
  /** 왜 그게 답인지 (푼 뒤에 보여 준다). */
  because: string;
}

/** 기존 「오늘의 문제」와 같은 대조 규칙 — 소문자·공백·쉼표를 지우고 잰다. */
export function normalize(text: string): string {
  return String(text).toLowerCase().replace(/[\s,]/g, '');
}

export function hashAnswer(text: string): string {
  return crypto.createHash('sha256').update(normalize(text)).digest('hex').slice(0, 16);
}

/** 날짜 → 안정된 숫자. 같은 날이면 누구에게나 같은 문제가 나오게. */
function seedOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** 씨앗에서 뽑는 난수 — 같은 씨앗이면 같은 차례가 나온다. */
function picker(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function numberFields(pack: WellPack): WellField[] {
  return pack.fields.filter(
    (f) => f.kind === 'number' && pack.items.filter((i) => typeof i[f.key] === 'number').length >= 8,
  );
}

/**
 * 「재료 가짓수**가**」 · 「접속자**가**」 — 받침에 따라 조사를 고른다.
 *
 * 왜 이걸 신경 쓰나: 「가짓수이(가)」처럼 괄호로 도망친 문장은 **기계가 쓴 티**가 난다.
 * 문제는 매일 자동으로 나오는데, 그게 매일 어색하면 그 놀이는 대충 만든 것으로 읽힌다.
 */
export function withParticle(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  // 한글이 아니면(영어·숫자) 판단할 수 없다 — 그때는 받침 없는 쪽이 덜 어색하다.
  if (!last || code < 0xac00 || code > 0xd7a3) return `${word}${withoutFinal}`;
  return `${word}${(code - 0xac00) % 28 ? withFinal : withoutFinal}`;
}

/** 사람이 읽는 숫자 — 백만은 「1,000,000」으로. */
function pretty(value: number, unit?: string): string {
  const text = Number.isInteger(value) ? value.toLocaleString('ko-KR') : String(value);
  return unit ? `${text}${unit}` : text;
}

/**
 * 오늘의 문제 한 개.
 *
 * 못 만드는 표가 있다(숫자 칸이 없거나 항목이 적을 때) — 그때는 **null** 이다.
 * 억지로 만들면 「넷 중 셋이 빈칸」인 문제가 나온다.
 */
export function quizFor(pack: WellPack, day: string): WellQuiz | null {
  const fields = numberFields(pack);
  if (!fields.length) return null;

  const rand = picker(seedOf(`${day}:${pack.well}`));
  const field = fields[Math.floor(rand() * fields.length)];
  const rows = pack.items.filter((i) => typeof i[field.key] === 'number') as Array<WellItem & Record<string, number>>;
  if (rows.length < 8) return null;

  const sorted = rows.slice().sort((a, b) => (b[field.key] as number) - (a[field.key] as number));
  const askTop = rand() < 0.5;
  const answer = askTop ? sorted[0] : sorted[sorted.length - 1];

  /* 헷갈릴 것을 고른다 — **정답 바로 옆**이 아니라 한참 떨어진 데서 뽑는다.
   * 옆에서 뽑으면 1등과 2등의 차이가 0.1 인 문제가 나오고, 그건 실력이 아니라 운이다. */
  const pool = askTop ? sorted.slice(Math.floor(sorted.length / 3)) : sorted.slice(0, Math.floor((sorted.length * 2) / 3));
  const wrongs: string[] = [];
  const seen = new Set([answer.name]);
  let guard = 0;
  while (wrongs.length < 3 && guard < 200) {
    guard += 1;
    const pick = pool[Math.floor(rand() * pool.length)];
    if (!pick || seen.has(pick.name)) continue;
    seen.add(pick.name);
    wrongs.push(pick.name);
  }
  if (wrongs.length < 3) return null;

  const choices = [answer.name, ...wrongs];
  // 정답이 늘 첫 칸이면 아무도 안 읽고 첫 칸을 누른다. 날짜로 섞는다(같은 날 = 같은 차례).
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  const label = field.label;
  return {
    well: pack.well,
    day,
    question: `「${pack.title}」에서 ${withParticle(label, '이', '가')} 가장 ${askTop ? '많은' : '적은'} 것은?`,
    choices,
    answerHash: hashAnswer(answer.name),
    because: `${answer.name} — ${label} ${pretty(answer[field.key] as number, field.unit)}`,
  };
}
