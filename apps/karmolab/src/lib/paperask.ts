/**
 * 논문에게 묻기. 고르는 규칙 (TASK-KL-238 / 34 elicit, 35 consensus, 38 scispace)
 *
 * elicit, consensus, scispace 는 셋 다 같은 알맹이를 판다: **물음을 던지면 논문이 답하게 한다.**
 * 그 셋의 진짜 재산은 모델이 아니라 *색인*(수억 편)인데, 그건 OpenAlex 가 키 없이 준다.
 * 그러니 우리가 지을 것은 하나뿐이다. **초록에서 물음에 답하는 문장을 고르는 규칙.**
 *
 * ★ 여기서 절대 안 하는 것: **요약을 지어내는 것.** 뽑는 것은 논문이 실제로 쓴 문장 그대로다.
 *   말을 만들어 얹으면 논문이 그렇게 말했다로 읽히는데, 그건 우리가 책임질 수 없는 말이다.
 *   (AI 로 다듬는 자리는 화면 쪽에 따로 둔다. 그때도 원문 문장을 같이 보여 준다.)
 *
 * 고르는 셈법: 물음의 낱말이 몇 개 겹치나 + 그 문장이 결론 자리인가(뒤쪽, we show/결론류) +
 * 너무 짧거나 긴 문장은 깎는다(제목 조각, 표 설명이 딸려 온다).
 */

/** 셈에서 뺄 흔한 말. 이것들이 겹쳤다고 관련이 있는 건 아니다. */
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'is', 'are', 'was', 'were', 'be',
  'this', 'that', 'these', 'those', 'with', 'by', 'from', 'as', 'at', 'it', 'we', 'our', 'their',
  'can', 'may', 'do', 'does', 'not', 'but', 'than', 'then', 'so', 'such', 'have', 'has', 'had',
  '그', '이', '저', '것', '수', '및', '등', '있다', '없다', '한다', '하는', '대한', '위한'
]);

/** 결론에 자주 붙는 말. 이 문장이 그래서 뭔데에 가깝다는 신호다. */
const CONCLUSIVE = [
  'we show', 'we find', 'results show', 'we conclude', 'conclusion', 'in conclusion',
  'suggests that', 'demonstrates', 'significantly', 'improves', 'outperforms', 'reduces',
  '결론', '보여준다', '나타났다', '유의'
];

export function words(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** 초록을 문장으로. 약어의 마침표(`e.g.`, `et al.`)에서 끊기면 반쪽 문장이 나온다. 그것만 피한다. */
export function sentences(text: string): string[] {
  return String(text ?? '')
    .replace(/(e\.g|i\.e|et al|vs|Fig|Eq|approx)\./gi, '$1<dot>')
    .split(/(?<=[.!?])\s+|(?<=[다요])\s+(?=[A-Z가-힣])/)
    .map((s) => s.replace(/<dot>/g, '.').trim())
    .filter((s) => s.length > 0);
}

export interface Pick {
  sentence: string;
  score: number;
}

/**
 * 물음에 답이 될 만한 문장 고르기. 못 고르면 **빈 목록**. 아무 문장이나 내놓으면
 * 사람은 그게 답인 줄 안다.
 */
export function answerSentences(abstract: string, question: string, take = 2): Pick[] {
  const q = new Set(words(question));
  if (q.size === 0) return [];
  const list = sentences(abstract);
  const scored: Pick[] = [];
  list.forEach((sentence, i) => {
    const w = words(sentence);
    if (w.length < 4) return; // 제목 조각, 표 설명
    let hit = 0;
    const seen = new Set<string>();
    for (const word of w) {
      if (q.has(word) && !seen.has(word)) {
        hit += 1;
        seen.add(word);
      }
    }
    if (hit === 0) return;
    const lower = sentence.toLowerCase();
    const conclusive = CONCLUSIVE.some((k) => lower.includes(k)) ? 1.5 : 0;
    const late = (i / Math.max(1, list.length - 1)) * 0.8; // 결론은 대개 뒤에 있다
    const tooLong = w.length > 60 ? -1 : 0;
    scored.push({ sentence, score: hit + conclusive + late + tooLong });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, take);
}

export interface Answered<T> {
  paper: T;
  picks: Pick[];
}

/**
 * 여러 편에 같은 물음을 던진다. **답한 논문만** 남긴다. 답 못 한 논문을 목록에 남기면
 * 관련 논문 8편이라는 숫자가 부풀고, 사람은 그 숫자를 믿는다.
 */
export function askPapers<T extends { abstract?: string }>(papers: T[], question: string, take = 2): Array<Answered<T>> {
  const out: Array<Answered<T>> = [];
  for (const paper of papers) {
    const picks = paper.abstract ? answerSentences(paper.abstract, question, take) : [];
    if (picks.length > 0) out.push({ paper, picks });
  }
  return out;
}

/**
 * 그래서 결론이 뭔데(35 consensus)를 **세어서** 말한다. 지어내지 않는다:
 * 답한 편수, 연도 폭, 가장 많이 인용된 편만 말하고, 나머지는 사람이 읽는다.
 */
export interface Tally {
  answered: number;
  asked: number;
  fromYear: number;
  toYear: number;
  topCited: number;
}

export function tally<T extends { year?: number; cited?: number }>(
  asked: T[],
  answered: Array<{ paper: T }>
): Tally | null {
  if (asked.length === 0) return null;
  const years = answered.map((a) => Number(a.paper.year) || 0).filter((y) => y > 0);
  return {
    answered: answered.length,
    asked: asked.length,
    fromYear: years.length ? Math.min(...years) : 0,
    toYear: years.length ? Math.max(...years) : 0,
    topCited: answered.reduce((m, a) => Math.max(m, Number(a.paper.cited) || 0), 0)
  };
}
