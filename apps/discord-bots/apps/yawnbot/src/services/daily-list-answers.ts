/**
 * 전부대기 — 군중의 답 집계 (TASK-KL-197).
 *
 * 왜 서버에 있나: 이 놀이의 점수는 「몇 개 댔나」가 아니라 **「남들이 덜 댄 것을 댔나」**다.
 * 그 값은 한 브라우저 안에서는 절대 못 만든다 — 남의 답이 있어야 생긴다.
 *
 * 무엇을 안 적나: **누가 냈는지 안 적는다.** 계정도 아이피도 안 남긴다. 한 문제에 대해
 * 「몇 명이 풀었고 각 이름이 몇 번 나왔나」 두 숫자뿐이다. 희귀도를 만드는 데 그 이상은
 * 필요 없고, 필요 없는 것을 적어 두면 언젠가 새어 나간다.
 *
 * 표본이 적으면 아예 안 내보낸다 — 세 명이 푼 문제에서 「8%만 댄 답」은 거짓말이다.
 *
 * 저장 = `data/daily-list-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

const STATE_FILE = 'daily-list-state.json';

/** 이 수보다 적게 푼 문제는 희귀도를 안 준다. 적은 표본의 비율은 숫자가 아니라 소음이다. */
export const MIN_SAMPLE = 5;
/** 한 문제가 기억할 서로 다른 이름 수. 정답표가 45개니 오답까지 세도 이 정도면 넉넉하다. */
export const MAX_NAMES_PER_QUESTION = 400;
/** 한 사람이 한 판에 낼 수 있는 답 수 — 90초에 이보다 많이 치는 사람은 없다. */
export const MAX_NAMES_PER_REPORT = 120;

export interface QuestionTally {
  /** 이 문제를 끝낸 사람 수. 비율의 분모다. */
  people: number;
  /** 이름 → 그 이름을 낸 판 수. */
  counts: Record<string, number>;
}

interface State {
  version: 1;
  questions: Record<string, QuestionTally>;
}

export const isValidTopic = (raw: unknown): raw is string =>
  typeof raw === 'string' && /^[a-z][a-z0-9_-]{0,23}$/.test(raw);

/** 질문 id 는 엔진이 만든다(`color=초록` · `gen=1&types=불꽃`). 모양만 본다. */
export const isValidQuestionId = (raw: unknown): raw is string =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= 120 && !raw.includes('\n');

export class DailyListStore {
  private state: State;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): State {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<State>;
        return { version: 1, questions: parsed.questions ?? {} };
      }
    } catch (error) {
      console.error('[daily-list] 저장본을 못 읽었다 — 빈 표로 시작한다:', error);
    }
    return { version: 1, questions: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state));
    } catch (error) {
      console.error('[daily-list] 저장 실패:', error);
    }
  }

  private keyOf(topic: string, question: string): string {
    return `${topic}:${question}`;
  }

  /**
   * 한 판의 답을 넣는다. **같은 이름은 한 판에 한 번만 센다** — 같은 답을 두 번 쳐도
   * 비율이 흔들리면 안 된다(엔진이 막지만 서버가 그걸 믿고 있으면 안 된다).
   */
  report(topic: string, question: string, names: readonly string[]): void {
    const key = this.keyOf(topic, question);
    const tally: QuestionTally = this.state.questions[key] ?? { people: 0, counts: {} };
    tally.people += 1;
    const seen = new Set<string>();
    for (const raw of names.slice(0, MAX_NAMES_PER_REPORT)) {
      const name = typeof raw === 'string' ? raw.trim().slice(0, 60) : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      // 새 이름은 자리가 남을 때만 받는다. 이미 아는 이름은 언제나 센다 —
      // 자리가 찼다고 진짜 답의 셈이 멈추면 비율이 조용히 틀어진다.
      if (tally.counts[name] === undefined && Object.keys(tally.counts).length >= MAX_NAMES_PER_QUESTION) continue;
      tally.counts[name] = (tally.counts[name] ?? 0) + 1;
    }
    this.state.questions[key] = tally;
    this.save();
  }

  /** 이름 → 비율(0~1). 표본이 적으면 **null** — 없는 것과 적은 것은 다르게 말한다. */
  shares(topic: string, question: string): { people: number; shares: Record<string, number> | null } {
    const tally = this.state.questions[this.keyOf(topic, question)];
    if (!tally || tally.people < MIN_SAMPLE) return { people: tally?.people ?? 0, shares: null };
    const shares: Record<string, number> = {};
    for (const [name, count] of Object.entries(tally.counts)) shares[name] = count / tally.people;
    return { people: tally.people, shares };
  }
}

let singleton: DailyListStore | null = null;
export function getDailyListStore(): DailyListStore {
  if (!singleton) singleton = new DailyListStore();
  return singleton;
}
