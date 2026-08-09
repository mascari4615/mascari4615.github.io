/**
 * 한글 타자 데일리 — 알맹이 (해자③ 첫 게임)
 *
 * 데일리 프레임(`core/daily.ts`)이 이미 셋을 준다: 하루 경계(KST) · 전원 같은 시드 ·
 * 정답 안 새는 공유. 여기서는 그 위에 **문제 하나**를 얹는다 — 오늘의 문장.
 *
 * 문장은 손으로 안 적는다. `type-pool.generated.ts` 가 **우리 도구 설명에서** 뽑아 온다
 * (`scripts/gen-type-pool.mjs`). 치다 보면 우리 도구가 뭘 하는지 알게 되는 부수 효과가 있고,
 * 무엇보다 **남이 못 베끼는 자리**다 — Monkeytype 은 영어 무작위 낱말이다.
 *
 * 셈은 `core/hangultype.ts` 것을 그대로 쓴다. 연습(ghosttype)과 데일리가 다른 수를 내면
 * 둘 중 무엇도 못 믿는다.
 */
import { dateKST, dayNumber, type Mark, rngFrom, seedFor, shareText, shuffleWith } from './daily';
import { score, 타건수 } from './hangultype';
import type { ToolRunner, ToolSpec } from './types';
import { TYPE_POOL } from './type-pool.generated';

export const spec: ToolSpec = {
  id: 'dailytype',
  ops: {
    today: {
      desc:
        "Today's Korean typing challenge — the same sentence for everyone, fixed to KST." +
        ' Sentences come from this site\'s own tool descriptions, so practising also teaches what the' +
        ' tools do. Give seconds and what you typed to get 타/분 and accuracy scored the Korean way.' +
        ' / 오늘의 한글 타자 문제. 전원 같은 문장(KST 고정) · 타수·정확도 채점.',
      in: { at: 'string?', seconds: 'number?', typed: 'string?' },
      out: 'string'
    }
  }
};

export const GAME_ID = 'hangul-type';

/** 한 판에 치는 문장 수. 셋이면 30~60초 — 너무 길면 「내일 또」가 안 된다. */
export const LINES_PER_DAY = 3;

export interface Puzzle {
  date: string;
  day: number;
  lines: string[];
  /** 이 판을 다 치려면 몇 번 눌러야 하는가. 목표 속도를 가늠하게 해 준다. */
  strokes: number;
}

/**
 * 오늘의 문제. **같은 날이면 누가 열어도 같다** — 그게 데일리의 전부다.
 *
 * 뭉치에서 섞어 앞의 셋을 집는다. 그냥 세 번 뽑으면 **같은 문장이 두 번 나올 수 있다**.
 */
export function puzzleFor(date: string, pool: readonly string[] = TYPE_POOL): Puzzle {
  if (pool.length < LINES_PER_DAY) throw new Error('문장 뭉치가 너무 작습니다');
  const lines = shuffleWith(rngFrom(seedFor(GAME_ID, date)), pool).slice(0, LINES_PER_DAY);
  return { date, day: dayNumber(date), lines, strokes: lines.reduce((n, s) => n + 타건수(s), 0) };
}

export interface Play {
  seconds: number;
  /** 줄마다 실제로 친 글. 안 친 줄은 빈 글자로 둔다. */
  typed: string[];
}

export interface Report {
  perMinute: number;
  accuracy: number;
  /** 줄마다 다 맞았나 — 공유 격자가 이걸로 그려진다. */
  marks: Mark[];
  share: string;
}

/**
 * 채점.
 *
 * 줄 표시는 셋으로 나눈다: 다 맞으면 🟩, 틀린 글자가 10% 이하면 🟨, 그 위는 ⬛.
 * 「거의 맞았다」를 실패와 같은 칸에 넣으면 공유 격자가 아무 것도 안 알려 준다 —
 * 색이 셋이어야 「어제보다 나아졌다」가 보인다.
 */
export function grade(puzzle: Puzzle, play: Play): Report {
  const full = puzzle.lines.join('\n');
  const typedFull = puzzle.lines.map((_, i) => play.typed[i] ?? '').join('\n');
  const s = score(full, play.seconds, typedFull);

  const marks: Mark[] = puzzle.lines.map((line, i) => {
    const got = play.typed[i] ?? '';
    if (got === line) return 'hit';
    const len = Math.max(line.length, got.length);
    let wrong = 0;
    for (let j = 0; j < len; j++) if (line[j] !== got[j]) wrong++;
    return wrong / len <= 0.1 ? 'near' : 'miss';
  });

  const share = shareText({
    title: '한글타자',
    date: puzzle.date,
    /* 한 줄에 한 칸 — 격자 자체가 「몇 줄을 맞혔나」다. 문장은 절대 안 담긴다. */
    rows: marks.map((m) => [m]),
    tries: marks.filter((m) => m === 'hit').length,
    maxTries: puzzle.lines.length
  });

  return { perMinute: s.perMinute, accuracy: s.accuracy, marks, share: `${share}\n${s.perMinute}타/분` };
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'today') throw new Error(`dailytype 에 「${op}」 는 없습니다`);

  const at = args.at === undefined || args.at === '' ? new Date() : new Date(String(args.at));
  if (Number.isNaN(at.getTime())) throw new Error('시각을 읽을 수 없습니다 (ISO 8601 로 주세요)');
  const puzzle = puzzleFor(dateKST(at));

  const lines = [
    `한글타자 #${puzzle.day} (${puzzle.date}, KST 기준 — 전원 같은 문장)`,
    '',
    ...puzzle.lines.map((s, i) => `${i + 1}. ${s}`),
    '',
    `총 타수: ${puzzle.strokes}`
  ];

  const seconds = Number(args.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    const typed = String(args.typed ?? '').split('\n');
    const r = grade(puzzle, { seconds, typed });
    lines.push('', `속도: ${r.perMinute}타/분 · 정확도: ${r.accuracy}%`, '', r.share);
  }

  return lines.join('\n');
};
