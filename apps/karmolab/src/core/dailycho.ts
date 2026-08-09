/**
 * 초성 맞히기 데일리 — 알맹이 (해자③ 둘째 게임)
 *
 * 「ㅊㅅㄱㅎ」만 보고 낱말을 맞히는 놀이. 한국에서만 되는 놀이다 — 자모가 갈라지는 글자라야
 * 성립한다. 그래서 경쟁자가 없다(09 실측: 놀이·세계관 결합 = 전원 미보유).
 *
 * 낱말은 손으로 안 적는다. `word-pool.generated.ts` 가 **우리 도구 별칭에서** 뽑아 온다 —
 * 답마다 그 낱말이 가리키는 도구가 붙어 있어, 맞히면 그 도구를 알게 된다.
 * 놀이가 사이트를 가르치는 자리가 되는 것이 이 게임을 우리 것으로 만드는 부분이다.
 *
 * 프레임(`core/daily.ts`)이 하루 경계·시드·정답 안 새는 공유를 이미 준다. 여기는 문제와 채점만.
 */
import { dateKST, dayNumber, type Mark, rngFrom, seedFor, shareText, shuffleWith } from './daily';
import { initials } from './jamo';
import type { ToolRunner, ToolSpec } from './types';
import { WORD_POOL, type PoolWord } from './word-pool.generated';

export const spec: ToolSpec = {
  id: 'dailycho',
  ops: {
    today: {
      desc:
        "Today's Korean initial-consonant puzzle (초성 퀴즈) — guess words from their leading jamo," +
        ' e.g. ㅊㅅ → 초성. Same puzzle for everyone, fixed to KST. Answers are drawn from this site\'s' +
        ' own tool names, so each solved word points at a tool.' +
        ' / 오늘의 초성 맞히기. 전원 같은 문제(KST 고정) · 답은 이 사이트 도구 이름에서.',
      in: { at: 'string?', answers: 'string?' },
      out: 'string'
    }
  }
};

export const GAME_ID = 'cho-quiz';

/** 한 판 다섯 낱말. 1~2분 — 「내일 또」가 되는 길이. */
export const WORDS_PER_DAY = 5;

export interface ChoQuestion {
  /** 보여 주는 것 — 초성만. */
  hint: string;
  /** 몇 글자인지. 이게 없으면 초성만으로는 너무 넓다. */
  length: number;
  /** 이 낱말이 가리키는 도구. 맞힌 뒤에 보여 준다(먼저 보여 주면 답이 샌다). */
  tool: string;
  /** 정답. **공유 글에는 절대 안 담긴다.** */
  answer: string;
}

export interface ChoPuzzle {
  date: string;
  day: number;
  questions: ChoQuestion[];
}

export function puzzleFor(date: string, pool: readonly PoolWord[] = WORD_POOL): ChoPuzzle {
  if (pool.length < WORDS_PER_DAY) throw new Error('낱말 뭉치가 너무 작습니다');
  const picked = shuffleWith(rngFrom(seedFor(GAME_ID, date)), pool).slice(0, WORDS_PER_DAY);
  return {
    date,
    day: dayNumber(date),
    questions: picked.map((p) => ({
      hint: initials(p.word),
      length: [...p.word].length,
      tool: p.tool,
      answer: p.word
    }))
  };
}

export interface ChoReport {
  marks: Mark[];
  right: number;
  share: string;
}

/**
 * 채점.
 *
 * 「거의」를 둔다 — 글자 수가 맞고 **한 글자만 다르면** 노랑이다. 초성 퀴즈는 아깝게 빗나가는
 * 일이 잦아서(같은 초성의 다른 낱말), 그걸 전부 검정으로 칠하면 사람이 실력이 는 걸 못 느낀다.
 */
export function grade(puzzle: ChoPuzzle, answers: readonly string[]): ChoReport {
  const marks: Mark[] = puzzle.questions.map((q, i) => {
    const got = (answers[i] ?? '').trim();
    if (got === q.answer) return 'hit';
    if ([...got].length !== q.length) return 'miss';
    let wrong = 0;
    for (let j = 0; j < q.length; j++) if ([...got][j] !== [...q.answer][j]) wrong++;
    return wrong === 1 ? 'near' : 'miss';
  });

  const right = marks.filter((m) => m === 'hit').length;
  const share = shareText({
    title: '초성',
    date: puzzle.date,
    rows: [marks], // 한 줄에 다섯 칸 — 격자 자체가 성적표다
    tries: right,
    maxTries: puzzle.questions.length
  });
  return { marks, right, share };
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'today') throw new Error(`dailycho 에 「${op}」 는 없습니다`);

  const at = args.at === undefined || args.at === '' ? new Date() : new Date(String(args.at));
  if (Number.isNaN(at.getTime())) throw new Error('시각을 읽을 수 없습니다 (ISO 8601 로 주세요)');
  const puzzle = puzzleFor(dateKST(at));

  const lines = [
    `초성 #${puzzle.day} (${puzzle.date}, KST 기준 — 전원 같은 문제)`,
    '',
    ...puzzle.questions.map((q, i) => `${i + 1}. ${q.hint}  (${q.length}글자)`)
  ];

  const raw = String(args.answers ?? '').trim();
  if (raw === '') {
    lines.push('', '※ 답은 이 사이트의 도구 이름입니다. answers 에 쉼표로 구분해 넣으면 채점합니다.');
    return lines.join('\n');
  }

  const answers = raw.split(',').map((s) => s.trim());
  const r = grade(puzzle, answers);
  lines.push(
    '',
    `${r.right}/${puzzle.questions.length} 맞힘`,
    ...puzzle.questions.map((q, i) => `${i + 1}. ${r.marks[i] === 'hit' ? '맞음' : `${q.answer} (${q.tool})`}`),
    '',
    r.share
  );
  return lines.join('\n');
};
