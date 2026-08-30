/**
 * 등급전. 게스트 열쇠와 대기열 (change.arcade-online 1번)
 *
 * - 같이 찾기는 열린 방 목록에서 사람이 고름. 등급전은 서버(욘봇)가 붙여 줌
 * - 점수 구간으로 방을 나누고 같은 방의 둘을 짝지음. 판은 그대로 브라우저끼리
 * - 서버가 죽으면 등급전만 멈춤. 친선전은 그대로 (사용자 결정)
 *
 * 게스트 열쇠:
 * - 기기마다 비밀 글자 하나. 서버는 그 해시를 이 사람으로 씀
 * - 열쇠를 내보내 다른 기기에 붙이면 같은 사람
 * - 계정(4번)이 붙으면 열쇠가 계정에 매달림. 모바일 게임의 게스트 계정과 같은 꼴
 */

const HOST = 'https://yawnbot.mascari4615.com';
const KEY = 'karmolab.arcade.key';
/** 알림 주기. 서버 제외 한계 15초보다 넉넉히 자주 */
const BEAT_MS = 5 * 1000;

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 이 기기의 열쇠. 없으면 생성 */
export function guestKey(): string {
  const have = (localStorage.getItem(KEY) || '').trim();
  if (/^[A-Za-z0-9_-]{16,64}$/.test(have)) return have;
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const key = [...buf].map((n) => KEY_ALPHABET[n % KEY_ALPHABET.length]).join('');
  localStorage.setItem(KEY, key);
  return key;
}

/** 다른 기기에서 가져온 열쇠 붙이기. 모양이 아니면 거절 */
export function importKey(raw: string): boolean {
  const key = raw.trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return false;
  localStorage.setItem(KEY, key);
  return true;
}

export type RankRoom = 'beginner' | 'upper';

export interface Matched {
  code: string;
  you: string;
  rival: string;
  host: boolean;
  room: RankRoom;
  opponent: string;
}

export interface RankedHooks {
  /** 줄에 서 있음. 같은 방의 나 말고 몇 */
  onWaiting(room: RankRoom, others: number): void;
  onMatched(m: Matched): void;
  /** 서버 무응답. 등급전만 종료, 친선전은 그대로 */
  onDown(): void;
}

export interface Ranked {
  cancel(): void;
}

type Answer = {
  status?: 'waiting' | 'matched' | 'none';
  code?: string;
  host?: boolean;
  room?: RankRoom;
  opponent?: string;
  others?: number;
  you?: string;
  rival?: string;
};

/**
 * 줄서기. 5초마다 알리고 짝이 나면 `onMatched`. 돌려주는 것으로 나감
 * - 알림 하나가 곧 물어보기. `POST` 답에 짝 여부가 실려 옴
 */
export function enterQueue(game: string, name: string, hooks: RankedHooks): Ranked {
  const key = guestKey();
  let alive = true;
  let misses = 0;
  const stop = (): void => {
    alive = false;
    window.clearInterval(timer);
  };
  const beat = async (): Promise<void> => {
    if (!alive) return;
    let a: Answer;
    try {
      const res = await fetch(`${HOST}/kl/arcade/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, game, name })
      });
      if (!res.ok) throw new Error(String(res.status));
      a = (await res.json()) as Answer;
      misses = 0;
    } catch {
      /* 세 번은 봐줌. 회선이 잠깐 끊긴 것과 서버 죽음은 첫 실패로 구분 불가 */
      if (++misses < 3) return;
      stop();
      hooks.onDown();
      return;
    }
    if (!alive) return;
    if (a.status === 'matched' && a.code) {
      stop();
      hooks.onMatched({
        code: a.code,
        you: String(a.you ?? ''),
        rival: String(a.rival ?? ''),
        host: Boolean(a.host),
        room: a.room === 'upper' ? 'upper' : 'beginner',
        opponent: String(a.opponent ?? '')
      });
      return;
    }
    hooks.onWaiting(a.room === 'upper' ? 'upper' : 'beginner', Math.max(0, Number(a.others ?? 0)));
  };
  const timer = window.setInterval(() => void beat(), BEAT_MS);
  void beat();
  return {
    cancel: () => {
      if (!alive) return;
      stop();
      /* 창 닫는 길에도 가야 하므로 `keepalive`. 안 빼면 15초간 유령과 짝 */
      void fetch(`${HOST}/kl/arcade/queue/${encodeURIComponent(key)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
  };
}

/** 등급전 판 하나. 결과 보고가 이걸로 누구의 판인지 적음 */
export interface RankedMatch {
  code: string;
  /** 내 공개 id (서버가 열쇠에서 뽑은 것) */
  you: string;
  /** 상대 공개 id */
  rival: string;
}

export interface Reported {
  applied: boolean;
  /** 아직 상대 말을 기다리는 중 */
  waiting: number;
  /** 양쪽 말이 어긋남 */
  disagreed: boolean;
  /** 반영됐으면 내 점수 변화 */
  delta: number | null;
  rating: number | null;
}

/**
 * 판이 끝났다고 알림. `ranks` 는 잘한 순서 (첫째가 1위)
 * - 양쪽이 각자 보냄. 서버는 둘이 같은 말을 할 때만 점수를 움직임
 * - 못 보내도 판은 이미 끝났음. 조용히 없음을 돌려줌
 */
export async function reportResult(m: RankedMatch, ranks: string[], draw: boolean): Promise<Reported | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: guestKey(), code: m.code, ranks, draw })
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      applied?: boolean;
      waiting?: number;
      disagreed?: boolean;
      result?: Array<{ id: string; after: number; delta: number }>;
    };
    const mine = body.result?.find((r) => r.id === m.you) ?? null;
    return {
      applied: Boolean(body.applied),
      waiting: Number(body.waiting ?? 0),
      disagreed: Boolean(body.disagreed),
      delta: mine ? mine.delta : null,
      rating: mine ? mine.after : null
    };
  } catch {
    return null;
  }
}

/** 내 점수. 로비에 보여 줄 때. 못 물어보면 없음 */
export async function myRating(game: string): Promise<{ rating: number; games: number; wins: number } | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/rating/${encodeURIComponent(guestKey())}?game=${encodeURIComponent(game)}`, {
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return (await res.json()) as { rating: number; games: number; wins: number };
  } catch {
    return null;
  }
}

/**
 * 단위. 점수를 사람이 읽는 계단으로 (change.arcade-online 2번)
 *
 * - 여섯 단위, 각 셋 (작혼 실측: 초심 1~3, 작사 1~3 ... 혼천). 이름은 자리표 (사용자 결정)
 * - 초심은 강등 없음. 그 아래로 안 떨어짐
 * - 마지막 단위는 계단이 없음. 그 위는 점수 그대로
 */
export const TIERS = 6;
/** 초심의 바닥과 한 단위의 폭. 1500 에서 시작하니 처음은 초심 2 */
const TIER_FLOOR = 1400;
const TIER_SPAN = 200;

export interface Grade {
  /** 0부터. i18n 열쇠는 `arcade.rank.tier.<tier>` */
  tier: number;
  /** 1, 2, 3. 마지막 단위는 0 (계단 없음) */
  level: number;
  /** 다음 계단까지 남은 점수. 마지막 단위는 없음 */
  toNext: number | null;
}

export function gradeOf(rating: number): Grade {
  const over = Math.max(0, rating - TIER_FLOOR);
  const tier = Math.min(TIERS - 1, Math.floor(over / TIER_SPAN));
  if (tier === TIERS - 1) return { tier, level: 0, toNext: null };
  const inTier = over - tier * TIER_SPAN;
  const step = TIER_SPAN / 3;
  const level = Math.min(3, Math.floor(inTier / step) + 1);
  return { tier, level, toNext: Math.ceil(TIER_FLOOR + tier * TIER_SPAN + level * step - rating) };
}
