/**
 * KarmoLab 놀이 기록 원장 (TASK-KL-148).
 *
 * 왜 있나: 놀이터에 놀이가 여섯인데 **한 판이 끝나면 아무 데도 안 남았다**. 반응속도·속도측정은
 * 저장이 아예 0줄이라 새로고침 한 번이면 없던 일이 되고, 나머지도 이 브라우저 안에만 있었다.
 * 기록이 안 남으면 놀이는 한 번 하고 끝이다 — 다시 올 이유도, 남과 겨룰 것도 없다.
 *
 * 왜 흔적 원장(`karmolab-traces`)에 안 넣나: 그쪽은 **누구인지 모르는 흔적**(방문·도구 열림·글)이고
 * 여기는 **계정에 붙는 기록**이다. 저장 주기도 반대다 — 흔적은 잦고 값이 없어 모아서 쓰지만,
 * 기록은 드물고 한 판이 곧 결과라 그 자리에서 쓴다. 한 파일에 두면 둘 중 하나가 늘 손해를 본다.
 *
 * 순위 방향은 **여기 한 벌만** 있다 (`PLAY_GAMES`). 반응속도는 작을수록 좋고 연승은 클수록 좋은데,
 * 이걸 화면에도 적으면 그날부터 갈라진다. 화면은 자기 숫자를 그리기만 하고, 「누가 위인가」는
 * 서버가 정한다.
 *
 * 판을 전부 쌓지 않는다 — 사람마다 종목마다 **최고 한 줄** + 날짜별 최고 30일 + 최근 판 200개.
 * 그래서 원장이 무한히 늘지 않는다.
 *
 * 저장 = `data/karmolab-plays-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';
import { kstDay } from './karmolab-traces';

const STATE_FILE = 'karmolab-plays-state.json';

/** 날짜별 최고를 며칠치 들고 있나. 「어제의 나」와 최근 흐름에 쓴다. */
const DAY_HISTORY = 30;

/** 최근 판 몇 개를 들고 있나 (광장 피드가 나중에 그대로 쓴다). */
const RECENT_MAX = 200;

export interface PlayGameSpec {
  id: string;
  label: string;
  /** `high` = 큰 값이 좋다(연승) · `low` = 작은 값이 좋다(반응속도 ms). */
  better: 'high' | 'low';
  unit: string;
  /**
   * 사람이 낼 수 있는 범위. 밖은 받지 않는다 — 손으로 아무 값이나 보낼 수 있는 자리다.
   * 순위판에 「0ms」가 한 줄 박히면 그 순위판은 그날로 죽는다.
   */
  min: number;
  max: number;
  /** 화면에 몇 자리까지 보이나 (같은 값을 두 곳에서 반올림해 서로 다르게 보이는 것을 막는다). */
  decimals: number;
  /**
   * 순위판이 **표마다 갈리는가**.
   *
   * 「높은 쪽 고르기」는 포켓몬 표와 롤 표가 완전히 다른 놀이다 — 한 순위판에 섞으면 쉬운 표를
   * 고른 사람이 1등이 된다. 반응속도는 그런 게 없어서 순위판이 하나다.
   *
   * 사람이 만든 표(UGC)도 여기로 들어온다 — 표가 늘 때마다 서버를 고치지 않아도 된다.
   */
  variants: boolean;
}

/** 표 이름으로 받아들일 모양. 아무 문자열이나 받으면 원장이 쓰레기로 찬다. */
export function isValidVariant(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9][a-z0-9_:-]{0,48}$/.test(raw);
}

/** 놀이 + 표를 하나의 순위판 이름으로. 표가 없는 놀이는 놀이 이름 그대로. */
export function boardKey(gameId: string, variant?: string | null): string {
  return variant ? `${gameId}::${variant}` : gameId;
}

/**
 * 겨룰 수 있는 놀이.
 *
 * 여기 없는 id 는 받지 않는다. 새 놀이는 이 표에 한 줄 넣는 것이 합류 절차 전부다.
 */
export const PLAY_GAMES: PlayGameSpec[] = [
  // 사람의 단순 반응은 100ms 아래로 잘 안 내려간다. 그보다 빠른 값은 미리 누른 것이거나 조작이다.
  { id: 'reaction', label: '반응속도', better: 'low', unit: 'ms', min: 80, max: 5000, decimals: 0, variants: false },
  // 1MB 블럭을 끌어 옮긴 속도(1000/걸린ms). 사람 손목은 대략 0.5~20 MB/s 사이에서 논다.
  { id: 'speed', label: '속도측정', better: 'high', unit: 'MB/s', min: 0.01, max: 1000, decimals: 2, variants: false },
  // 표마다 순위판이 갈린다 (포켓몬 10연승과 롤 10연승은 같은 기록이 아니다).
  { id: 'higher', label: '높은 쪽 고르기', better: 'high', unit: '연승', min: 1, max: 10000, decimals: 0, variants: true },
];

export function playGame(id: unknown): PlayGameSpec | null {
  if (typeof id !== 'string') return null;
  return PLAY_GAMES.find((g) => g.id === id) ?? null;
}

/** 받아들일 점수인가. NaN·무한대·범위 밖은 전부 버린다. */
export function isValidScore(spec: PlayGameSpec, raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= spec.min && raw <= spec.max;
}

/** 이쪽이 더 좋은 기록인가. 순위·최고 판정이 전부 이 한 줄을 지난다. */
export function isBetter(spec: PlayGameSpec, next: number, prev: number): boolean {
  return spec.better === 'low' ? next < prev : next > prev;
}

interface PlayerRecord {
  /** 역대 최고. */
  score: number;
  at: string;
  /** 몇 판 했나 (기록은 안 깨도 한 판은 한 판이다). */
  plays: number;
  /** `YYYY-MM-DD`(KST) → 그날의 최고. 최근 DAY_HISTORY 일만 남긴다. */
  days: Record<string, number>;
}

interface PlaysState {
  version: 1;
  /** 순위판 이름(`놀이` 또는 `놀이::표`) → 핸들 → 기록. */
  games: Record<string, Record<string, PlayerRecord>>;
  recent: RecentPlay[];
}

export interface RecentPlay {
  game: string;
  /** 표 이름. 표가 없는 놀이면 null. */
  variant: string | null;
  handle: string;
  score: number;
  at: string;
  /** 이 판으로 역대 최고를 깼나. */
  best: boolean;
}

export interface BoardEntry {
  rank: number;
  handle: string;
  score: number;
  at: string;
}

export interface PlayOutcome {
  game: string;
  variant: string | null;
  /** 방금 낸 점수 (서버가 다듬은 값). */
  score: number;
  /** 역대 최고 (이 판 포함). */
  best: number;
  /** 이 판 **직전**의 역대 최고. 처음이면 null. */
  previousBest: number | null;
  /** 역대 최고를 깼나. */
  improved: boolean;
  /** 오늘의 최고 (이 판 포함). */
  todayBest: number;
  /** 어제의 최고. 없으면 null — 「어제의 나」가 여기서 나온다. */
  yesterdayBest: number | null;
  /** 역대 순위 / 겨루는 사람 수. */
  rank: number;
  total: number;
  /** 오늘 순위 / 오늘 논 사람 수. */
  todayRank: number;
  todayTotal: number;
  plays: number;
}

function emptyState(): PlaysState {
  return { version: 1, games: {}, recent: [] };
}

/** 소수 자리를 맞춘다 — 저장과 화면이 다른 값을 말하지 않게 여기서 한 번만 자른다. */
function round(spec: PlayGameSpec, value: number): number {
  const factor = Math.pow(10, spec.decimals);
  return Math.round(value * factor) / factor;
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export class KarmolabPlayStore {
  private state: PlaysState;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): PlaysState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<PlaysState>;
        return {
          version: 1,
          games: parsed.games ?? {},
          recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, RECENT_MAX) : [],
        };
      }
    } catch (error) {
      console.error('[karmolab-plays] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return emptyState();
  }

  /**
   * 저장.
   *
   * 흔적 원장과 달리 **한 판마다 바로 쓴다**. 한 판은 사람이 몇 초를 들여 만든 결과라, 모아 쓰다
   * 봇이 죽으면 「방금 깬 기록」이 통째로 사라진다 — 그게 제일 나쁘다. 놀이는 초당 수백 번
   * 일어나는 일이 아니라서 그래도 된다.
   */
  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (error) {
      console.error('[karmolab-plays] 상태 저장 실패:', error);
    }
  }

  private table(key: string): Record<string, PlayerRecord> {
    if (!this.state.games[key]) this.state.games[key] = {};
    return this.state.games[key];
  }

  /**
   * 표를 다듬는다 — 표가 갈리는 놀이는 표 이름이 있어야 하고, 안 갈리는 놀이는 표를 무시한다.
   * `false` 면 받아들일 수 없는 표다.
   */
  private variantOf(spec: PlayGameSpec, raw: unknown): string | null | false {
    if (!spec.variants) return null; // 표가 없는 놀이 — 뭘 보내오든 순위판은 하나다
    if (!isValidVariant(raw)) return false;
    return raw;
  }

  /** 한 판을 적는다. 점수·표가 이상하면 null (부르는 쪽이 400 을 돌려준다). */
  record(
    gameId: string,
    handle: string,
    rawScore: number,
    now: Date = new Date(),
    rawVariant: string | null = null,
  ): PlayOutcome | null {
    const spec = playGame(gameId);
    if (!spec || !isValidScore(spec, rawScore)) return null;
    const variant = this.variantOf(spec, rawVariant);
    if (variant === false) return null;

    const score = round(spec, rawScore);
    const at = now.toISOString();
    const day = kstDay(now);
    const table = this.table(boardKey(spec.id, variant));
    const before = table[handle];
    const previousBest = before ? before.score : null;
    const improved = previousBest === null || isBetter(spec, score, previousBest);

    const days = { ...(before?.days ?? {}) };
    const dayBest = days[day];
    if (dayBest === undefined || isBetter(spec, score, dayBest)) days[day] = score;
    // 오래된 날은 버린다 — 안 버리면 오래 논 사람의 줄만 끝없이 길어진다.
    const keep = Object.keys(days)
      .sort()
      .slice(-DAY_HISTORY);
    const trimmed: Record<string, number> = {};
    for (const key of keep) trimmed[key] = days[key];

    table[handle] = {
      score: improved ? score : (previousBest as number),
      at: improved ? at : (before as PlayerRecord).at,
      plays: (before?.plays ?? 0) + 1,
      days: trimmed,
    };

    this.state.recent.unshift({ game: spec.id, variant, handle, score, at, best: improved });
    if (this.state.recent.length > RECENT_MAX) this.state.recent.length = RECENT_MAX;
    this.save();

    const allTime = this.board(spec.id, 'all', Number.MAX_SAFE_INTEGER, now, variant);
    const today = this.board(spec.id, 'day', Number.MAX_SAFE_INTEGER, now, variant);

    return {
      game: spec.id,
      variant,
      score,
      best: table[handle].score,
      previousBest,
      improved,
      todayBest: trimmed[day],
      yesterdayBest: trimmed[dayBefore(day)] ?? null,
      rank: allTime.find((e) => e.handle === handle)?.rank ?? 0,
      total: allTime.length,
      todayRank: today.find((e) => e.handle === handle)?.rank ?? 0,
      todayTotal: today.length,
      plays: table[handle].plays,
    };
  }

  /**
   * 순위판. `day` 는 오늘 것만.
   *
   * 같은 점수는 **먼저 낸 사람이 위**다 — 나중에 온 사람이 앞사람을 밀어내면 「깼다」는 말이
   * 거짓이 된다.
   */
  board(
    gameId: string,
    period: 'day' | 'all' = 'all',
    limit = 20,
    now: Date = new Date(),
    rawVariant: string | null = null,
  ): BoardEntry[] {
    const spec = playGame(gameId);
    if (!spec) return [];
    const variant = this.variantOf(spec, rawVariant);
    if (variant === false) return [];
    const table = this.state.games[boardKey(spec.id, variant)] ?? {};
    const today = kstDay(now);

    const rows: Array<{ handle: string; score: number; at: string }> = [];
    for (const [handle, record] of Object.entries(table)) {
      if (period === 'all') {
        rows.push({ handle, score: record.score, at: record.at });
        continue;
      }
      const score = record.days?.[today];
      if (score === undefined) continue;
      rows.push({ handle, score, at: record.at });
    }

    rows.sort((a, b) => {
      if (a.score !== b.score) return spec.better === 'low' ? a.score - b.score : b.score - a.score;
      return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
    });

    return rows.slice(0, Math.max(0, limit)).map((row, index) => ({ rank: index + 1, ...row }));
  }

  /**
   * 한 사람의 최고 — **논 순위판마다 한 줄**. 표가 갈리는 놀이는 표마다 한 줄이 된다
   * (포켓몬 12연승과 롤 3연승은 다른 기록이다).
   */
  me(handle: string, now: Date = new Date()): Array<{
    game: string;
    variant: string | null;
    label: string;
    unit: string;
    better: 'high' | 'low';
    best: number;
    at: string;
    plays: number;
    todayBest: number | null;
    yesterdayBest: number | null;
    rank: number;
    total: number;
  }> {
    const today = kstDay(now);
    const out = [];
    for (const key of Object.keys(this.state.games)) {
      const record = this.state.games[key][handle];
      if (!record) continue;
      const split = key.indexOf('::');
      const gameId = split < 0 ? key : key.slice(0, split);
      const variant = split < 0 ? null : key.slice(split + 2);
      const spec = playGame(gameId);
      if (!spec) continue; // 표에서 내려간 옛 놀이 — 기록은 두되 내보내지 않는다
      const all = this.board(spec.id, 'all', Number.MAX_SAFE_INTEGER, now, variant);
      out.push({
        game: spec.id,
        variant,
        label: spec.label,
        unit: spec.unit,
        better: spec.better,
        best: record.score,
        at: record.at,
        plays: record.plays,
        todayBest: record.days?.[today] ?? null,
        yesterdayBest: record.days?.[dayBefore(today)] ?? null,
        rank: all.find((e) => e.handle === handle)?.rank ?? 0,
        total: all.length,
      });
    }
    return out;
  }

  /** 최근 판 — 「방금 누가 뭘 했다」. 아직 아무 판도 없으면 빈 배열(0 을 꾸며 내지 않는다). */
  recent(limit = 20): RecentPlay[] {
    return this.state.recent.slice(0, Math.max(0, limit));
  }

  /**
   * 겨루는 사람 수 요약 — 순위판이 설 만한지 화면이 먼저 물어본다.
   * 표가 갈리는 놀이는 **표 전체를 합쳐** 센다(「이 놀이를 몇 명이 하나」이지 순위가 아니다).
   */
  stats(): Array<{
    game: string;
    label: string;
    unit: string;
    better: 'high' | 'low';
    variants: boolean;
    players: number;
    plays: number;
  }> {
    return PLAY_GAMES.map((spec) => {
      const players = new Set<string>();
      let plays = 0;
      for (const [key, table] of Object.entries(this.state.games)) {
        if (key !== spec.id && key.indexOf(`${spec.id}::`) !== 0) continue;
        for (const [handle, record] of Object.entries(table)) {
          players.add(handle);
          plays += record.plays ?? 0;
        }
      }
      return {
        game: spec.id,
        label: spec.label,
        unit: spec.unit,
        better: spec.better,
        variants: spec.variants,
        players: players.size,
        plays,
      };
    });
  }
}

let singleton: KarmolabPlayStore | null = null;

export function getKarmolabPlayStore(): KarmolabPlayStore {
  if (!singleton) singleton = new KarmolabPlayStore();
  return singleton;
}
