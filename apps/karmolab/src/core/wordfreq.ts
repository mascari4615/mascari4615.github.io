/**
 * 단어 빈도 — 알맹이 (TASK-KL-088 / S1)
 *
 * 글을 고칠 때 「내가 무슨 말을 반복하고 있나」는 읽어서는 잘 안 보인다. 세어 보면 바로 드러난다.
 *
 * MCP 로 내놓는 이유(B등급): 한국어는 **조사가 붙어** 「도구를 / 도구가 / 도구는」이 다 다른 낱말로
 * 세진다. 그대로 세면 상위 목록이 조사 붙은 같은 말로 채워져 쓸모가 없다. LLM 에게 세라고 하면
 * 개수를 대충 어림하거나(세는 게 아니라 인상으로 답한다) 조사를 제멋대로 떼어 「도구」와 「도」를 섞는다.
 * 여기선 **긴 조사부터** 떼서 「에서는」이 「에서」+「는」으로 갈리지 않게 한다.
 *
 * 형태소 분석은 아니다 — 그건 사전이 필요하다. 이건 「체감이 크게 달라지는」 수준의 어림이고,
 * 그 한계를 답에 적어 둔다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'wordfreq',
  ops: {
    count: {
      desc:
        '글에서 자주 쓴 낱말을 센다. 한국어 조사(을/를/에서는…)를 떼어 같은 말로 묶는다 —' +
        ' 안 떼면 「도구를·도구가·도구는」이 다 다른 낱말로 세진다. 자주 나오는 두 낱말 짝도 함께.',
      in: { text: 'string', top: 'number?', particles: 'boolean?', stopwords: 'boolean?' },
      out: 'string'
    }
  }
};

/** 자주 붙는 조사·어미. **긴 것부터** 떼야 「에서는」이 「에서」+「는」으로 안 갈린다. */
export const PARTICLES = [
  '으로부터', '에게서', '이라고', '라고는', '에서는', '에게는', '으로는', '까지는',
  '부터는', '이라는', '에서도', '으로도', '이나마', '조차도',
  '에서', '에게', '으로', '까지', '부터', '이나', '라도', '마저', '조차', '처럼', '보다', '만큼',
  '이란', '이든', '든지', '한테', '더러', '와의', '과의',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '나', '야', '여'
];

/** 세어도 뜻이 없는 말. 이걸 안 빼면 상위가 「것·수·그리고」로 채워진다. */
export const STOP = new Set([
  '그리고', '그러나', '하지만', '그래서', '또한', '즉', '및', '등', '수', '것', '때', '이것', '저것', '그것',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on', 'that', 'this', 'with'
]);

/**
 * 조사를 뗀다. 너무 짧은 말은 건드리지 않는다 — 「나의」에서 「의」를 떼면 「나」만 남아
 * 원래 뜻과 멀어진다. 뗀 뒤에도 두 글자는 남아야 한다.
 */
export function stripParticle(word: string): string {
  if (word.length < 3) return word;
  for (const p of PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

export interface FreqRow {
  word: string;
  count: number;
}

export interface FreqResult {
  rows: FreqRow[];
  /** 센 낱말의 총 개수 (거른 것 포함 전). */
  total: number;
  /** 서로 다른 낱말 수. */
  unique: number;
  /** 두 낱말이 붙어 두 번 이상 나온 것. */
  phrases: FreqRow[];
}

export function analyze(
  text: string,
  opts: { particles?: boolean; stopwords?: boolean; caseSensitive?: boolean } = {}
): FreqResult {
  const useParticles = opts.particles !== false;
  const useStop = opts.stopwords !== false;
  const raw = text.match(/[가-힣]+|[A-Za-z][A-Za-z']*|\d+/g) ?? [];

  const count: Record<string, number> = {};
  const kept: string[] = [];
  for (const w of raw) {
    let word = opts.caseSensitive === true ? w : w.toLowerCase();
    if (useParticles && /^[가-힣]+$/.test(word)) word = stripParticle(word);
    if (word.length < 2) continue;
    if (useStop && STOP.has(word)) continue;
    count[word] = (count[word] ?? 0) + 1;
    kept.push(word);
  }

  // 붙어 나오는 두 낱말 — 「무슨 표현을 반복하나」는 낱말 하나보다 이쪽에서 더 잘 보인다.
  const pairs: Record<string, number> = {};
  for (let i = 0; i + 1 < kept.length; i++) {
    const key = `${kept[i]} ${kept[i + 1]}`;
    pairs[key] = (pairs[key] ?? 0) + 1;
  }

  const sortRows = (obj: Record<string, number>): FreqRow[] =>
    Object.entries(obj)
      .map(([word, c]) => ({ word, count: c }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ko'));

  const rows = sortRows(count);
  return {
    rows,
    total: raw.length,
    unique: rows.length,
    phrases: sortRows(pairs).filter((p) => p.count >= 2)
  };
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'count') throw new Error(`wordfreq 에 「${op}」 는 없습니다`);
  const text = String(args.text ?? '');
  if (text.trim() === '') throw new Error('셀 글이 없습니다');

  const top = Math.min(100, Math.max(1, Math.round(Number(args.top ?? 15))));
  const r = analyze(text, { particles: args.particles !== false, stopwords: args.stopwords !== false });
  if (r.rows.length === 0) throw new Error('셀 만한 낱말이 없습니다 (두 글자 미만은 안 셉니다)');

  const lines = [
    `낱말 ${r.total}개 · 서로 다른 낱말 ${r.unique}개`,
    '',
    '자주 쓴 낱말:',
    ...r.rows.slice(0, top).map((x, i) => `${i + 1}. ${x.word} — ${x.count}회`)
  ];
  if (r.phrases.length > 0) {
    lines.push('', '자주 붙어 나온 두 낱말:', ...r.phrases.slice(0, 10).map((x) => `- ${x.word} — ${x.count}회`));
  }
  lines.push('', '※ 조사만 떼는 어림입니다(형태소 분석 아님) — 「했다/하는」 같은 활용형은 따로 셉니다.');
  return lines.join('\n');
};
