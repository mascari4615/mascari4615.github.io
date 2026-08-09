/**
 * 데일리 프레임 — 알맹이 (해자③ / 흡수계획 11)
 *
 * Wordle 류의 본질은 게임이 아니라 **부품 셋**이다: ①하루 경계 ②전원 같은 문제 ③무손실 공유.
 * 이 셋을 한 번 만들어 두면 게임은 **껍데기만으로** 늘어난다. 낱개로 만들면 N번 다시 만든다.
 *
 * 여기 있는 것은 그 셋 중 **계산으로 되는 전부**다. 화면·저장·공유 버튼은 껍데기 몫이고,
 * 이 파일은 순수함수만 담는다 — 그래야 시험이 되고, 지난 날짜 아카이브가 공짜로 열리고,
 * 필요하면 MCP 로도 낼 수 있다.
 *
 * ★ 이 substrate 의 **유일한 함정은 시간대**다 (11 § 3-4).
 * 「오늘」을 사용자 기기 시계로 잡으면 하와이와 서울이 서로 다른 문제를 풀게 되고, 그 순간
 * 「전원이 같은 문제」라는 전제가 조용히 깨진다 — 공유 격자를 서로 견줄 수 없어진다.
 * 그래서 **날짜 경계는 KST 로 고정**한다. 기기 설정이 무엇이든 상관없다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'daily',
  ops: {
    today: {
      desc:
        "Today's puzzle date and seed for a daily game, fixed to KST — so everyone gets the same puzzle" +
        ' regardless of device timezone (using local time silently breaks "same puzzle for everyone").' +
        ' Also returns the day number and time left until the next puzzle.' +
        ' / 오늘의 데일리 날짜·시드(KST 고정) · 며칠째 · 다음 문제까지 남은 시간.',
      in: { game: 'string', at: 'string?' },
      out: 'string'
    }
  }
};

/**
 * ★ 이 알맹이는 **화면이 없다** — 게임이 올라타는 바닥이지 도구가 아니다.
 *
 * 다른 알맹이는 전부 짝이 되는 화면과 `/karmolab/t/<id>/` 주소를 갖는다. 그걸 강제하는
 * 검사가 있는데(`audit-tool-data`), 여기는 일부러 예외다. **예외라는 사실을 여기 적어 둔다** —
 * 검사 쪽에 목록으로 두면 그 목록이 낡고, 왜 예외인지가 사라진다.
 */
export const SCREENLESS = true;

/** 한국 표준시 = UTC+9. 서머타임이 없어서 고정 오프셋으로 충분하다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 그 순간이 **KST 기준으로 며칠인가** — `YYYY-MM-DD`.
 *
 * `toLocaleDateString('ko-KR', { timeZone })` 를 안 쓴다: 판마다 표기가 달라 문자열을 다시
 * 뜯어야 하고(2026-08-09 에 `hour12` 로 같은 부류를 겪었다), 그 뜯기가 조용히 틀리면
 * 하루가 통째로 어긋난다. UTC 밀리초에 9시간을 더해 **UTC 로 읽는** 쪽이 뜯을 것이 없다.
 */
export function dateKST(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 그 KST 날짜가 시작된 순간(=전날 15:00 UTC). 카운트다운·아카이브가 이걸 쓴다. */
export function startOfDayKST(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) throw new Error('날짜를 YYYY-MM-DD 로 주세요');
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(utcMidnight - KST_OFFSET_MS);
}

/** 다음 문제까지 남은 밀리초. 자정을 넘긴 순간 0 이 아니라 하루로 돌아간다. */
export function msUntilNextKST(now: Date = new Date()): number {
  const tomorrow = new Date(startOfDayKST(dateKST(now)).getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.getTime() - now.getTime();
}

/** 「3시간 12분」처럼. 초는 안 보여 준다 — 매초 다시 그릴 이유가 없다. */
export function humanLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

/**
 * 날짜+게임 → 시드. 같은 날 같은 게임이면 **누가 열어도 같은 수**여야 한다.
 *
 * FNV-1a 32비트. 암호용이 아니라 **퍼뜨리기** 용이다 — 하루 차이·게임 이름 한 글자 차이가
 * 전혀 다른 수로 가면 그걸로 충분하다.
 */
export function seedFor(gameId: string, date: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${gameId}:${date}`) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 시드 하나로 도는 난수. `Math.random` 은 못 쓴다 — 새로고침마다 문제가 바뀌면
 * 「전원 같은 문제」가 아니라 「매번 다른 문제」가 된다.
 */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시드 하나로 고른 하나. 목록이 비면 던진다 — 조용히 undefined 를 흘리면 화면에서 터진다. */
export function pickWith<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('고를 것이 없습니다');
  return items[Math.floor(rng() * items.length)];
}

/** 시드 하나로 섞기 (Fisher–Yates). 원본은 안 건드린다. */
export function shuffleWith<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 며칠째인가 (#1 부터). 공유 글에 붙는 번호 — 사람들이 이걸로 같은 판인지 안다. */
export const DAILY_EPOCH = '2026-08-10';

export function dayNumber(date: string, epoch: string = DAILY_EPOCH): number {
  const diff = startOfDayKST(date).getTime() - startOfDayKST(epoch).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

export type Mark = 'hit' | 'near' | 'miss';

/** 공유 격자에 쓰는 칸. 색만 남기고 **글자는 안 남긴다** — 그게 이 방식이 퍼진 이유다. */
export const MARK_CHAR: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' };

export interface ShareInput {
  title: string;
  date: string;
  rows: Mark[][];
  /** 못 맞혔으면 null. 맞힌 판수를 적는다. */
  tries: number | null;
  maxTries: number;
  url?: string;
}

/**
 * 공유 글. **정답이 새지 않는지가 이 함수의 전부**다.
 *
 * 그래서 여기서는 애초에 정답을 **받지 않는다.** 「받아 놓고 안 쓴다」로 두면 언젠가 누가
 * 편의로 끼워 넣는다 — 그날 이 놀이는 끝난다. 인자에 없으면 실수할 수가 없다.
 */
export function shareText(input: ShareInput): string {
  const head = `${input.title} #${dayNumber(input.date)} ${input.tries ?? 'X'}/${input.maxTries}`;
  const grid = input.rows.map((row) => row.map((m) => MARK_CHAR[m]).join('')).join('\n');
  return [head, grid, input.url ?? ''].filter((l) => l !== '').join('\n');
}

/** 오늘 이미 했나 — 저장 열쇠. 게임·날짜가 섞이지 않게 둘 다 넣는다. */
export function playKey(gameId: string, date: string): string {
  return `karmolab:daily:${gameId}:${date}`;
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'today') throw new Error(`daily 에 「${op}」 는 없습니다`);
  const game = String(args.game ?? '').trim();
  if (game === '') throw new Error('게임 id 를 주세요');

  const at = args.at === undefined || args.at === '' ? new Date() : new Date(String(args.at));
  if (Number.isNaN(at.getTime())) throw new Error('시각을 읽을 수 없습니다 (ISO 8601 로 주세요)');

  const date = dateKST(at);
  return [
    `게임: ${game}`,
    `오늘(KST): ${date} — ${dayNumber(date)}일째`,
    `시드: ${seedFor(game, date)}`,
    `다음 문제까지: ${humanLeft(msUntilNextKST(at))}`,
    '',
    '※ 날짜 경계는 KST 고정입니다. 기기 시간대와 무관하게 전원이 같은 문제를 받습니다.'
  ].join('\n');
};
