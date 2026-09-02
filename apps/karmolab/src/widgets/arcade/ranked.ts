/**
 * 등급전. 줄서기, 점수, 패보 (change.arcade-online)
 *
 * - 같이 찾기는 열린 방 목록에서 사람이 고름. 등급전은 서버(욘봇)가 붙여 줌
 * - 점수 구간으로 방을 나누고 같은 방의 둘을 짝지음. 판은 그대로 브라우저끼리
 * - 서버가 죽으면 등급전만 멈춤. 친선전은 그대로 (사용자 결정)
 *
 * 신원:
 * - **로그인한 KarmoLab 계정 하나** (사용자 결정 2026-08-31). 점수가 붙는 자리라 신원이 하나여야 함
 * - 세션 쿠키로 감. 그래서 모든 요청에 `credentials: 'include'`
 * - 기기 열쇠는 폐기. 기기마다 다른 사람이 되어 점수를 옮길 길이 따로 필요했음
 */
import { intervalWhileVisible } from '../../lib/tick';
import {
  outcomeFromScores,
  rankedCapability,
  supportsRanked as supportsRankedContract,
  type RankedOutcome
} from '@karmo/arcade';

export { rankedCapability } from '@karmo/arcade';

const HOST = 'https://yawnbot.mascari4615.com';
/** 알림 주기. 서버 제외 한계 15초보다 넉넉히 자주 */
const BEAT_MS = 5 * 1000;

/** 쿠키를 실어 보낸다. 이게 빠지면 서버는 늘 로그인 안 했다고 답한다 */
const WITH_COOKIE: RequestInit = { credentials: 'include' };

export type RankRoom = 'beginner' | 'upper';

export interface Matched {
  code: string;
  /** 내 공개 id (계정 id) */
  you: string;
  /** 상대 공개 id */
  rival: string;
  host: boolean;
  room: RankRoom;
  opponent: string;
  /** 서버가 정한 전원 순서. 0번은 방 주인 */
  ids: string[];
  /** 이 계정이 앉을 자리 */
  seat: number;
}

export interface RankedHooks {
  /** 줄에 서 있음. 같은 방의 나 말고 몇 */
  onWaiting(room: RankRoom, others: number): void;
  onMatched(m: Matched): void;
  /** 서버 무응답. 등급전만 종료, 친선전은 그대로 */
  onDown(): void;
  /** 로그인이 안 돼 있음. 등급전은 로그인 필수 */
  onNeedSignIn(): void;
}

export interface Ranked {
  cancel(): void;
}

/**
 * 현재 서버가 결과 합의를 받을 수 있는 등급전 게임인가.
 *
 * 화면이 게임별 예외를 직접 알지 않도록 등급전 정책을 이 모듈이 소유한다. 고정 2인전은
 * 기존 계약. 야추는 서버의 2~4인 모집, 순위 합의 계약을 구현한 첫 가변 인원전
 */
export function supportsRanked(game: string, seats: readonly [number, number]): boolean {
  return supportsRankedContract(game, seats);
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
  ids?: string[];
  seat?: number;
};

/**
 * 줄서기. 5초마다 알리고 짝이 나면 `onMatched`. 돌려주는 것으로 나감
 * - 알림 하나가 곧 물어보기. `POST` 답에 짝 여부가 실려 옴
 */
export function enterQueue(game: string, name: string, hooks: RankedHooks): Ranked {
  let alive = true;
  let misses = 0;
  let timer: () => void = () => {};
  const stop = (): void => {
    alive = false;
    timer();
  };
  const beat = async (): Promise<void> => {
    if (!alive) return;
    let a: Answer;
    try {
      const res = await fetch(`${HOST}/kl/arcade/queue`, {
        ...WITH_COOKIE,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, name })
      });
      /* 로그인이 아니면 다시 던져도 같은 답. 그 자리에서 그만두고 사람에게 말함 */
      if (res.status === 401) {
        stop();
        hooks.onNeedSignIn();
        return;
      }
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
        opponent: String(a.opponent ?? ''),
        ids: Array.isArray(a.ids) ? a.ids.map(String) : [String(a.you ?? ''), String(a.rival ?? '')],
        seat: Math.max(0, Number(a.seat ?? 0))
      });
      return;
    }
    hooks.onWaiting(a.room === 'upper' ? 'upper' : 'beginner', Math.max(0, Number(a.others ?? 0)));
  };
  /* 숨은 탭에서는 안 알림. 배터리도 배터리고, 안 보는 사람을 줄에 세워 두면
     상대가 빈 자리와 짝이 남. 서버는 15초 뒤 줄에서 빼고, 돌아오면 다시 섬 */
  timer = intervalWhileVisible(() => void beat(), BEAT_MS);
  void beat();
  return {
    cancel: () => {
      if (!alive) return;
      stop();
      /* 창 닫는 길에도 가야 하므로 `keepalive`. 안 빼면 15초간 유령과 짝 */
      void fetch(`${HOST}/kl/arcade/queue/me`, { ...WITH_COOKIE, method: 'DELETE', keepalive: true }).catch(() => {});
    }
  };
}

/**
 * 지금 등급전 줄에 몇이 서 있나. 로비가 문 옆에 적는 값
 * - 로그인 없이 봄. 사람 수는 감출 것이 아님
 */
export async function queueCount(game: string): Promise<{ beginner: number; upper: number } | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/queue/count/${encodeURIComponent(game)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { beginner: number; upper: number };
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

export interface MyRating {
  /** 로그인 안 했으면 거짓. 그때 나머지 값은 없음 */
  signedIn: boolean;
  rating: number;
  games: number;
  wins: number;
}

/** 내 점수. 로비에 보여 줄 때. 못 물어보면 없음 */
export async function myRating(game: string): Promise<MyRating | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/rating/me?game=${encodeURIComponent(game)}`, {
      ...WITH_COOKIE,
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<MyRating>;
    if (!body.signedIn) return { signedIn: false, rating: 0, games: 0, wins: 0 };
    return { signedIn: true, rating: Number(body.rating ?? 0), games: Number(body.games ?? 0), wins: Number(body.wins ?? 0) };
  } catch {
    return null;
  }
}

/** 등급전 판 하나. 결과 보고가 이걸로 누구의 판인지 적음 */
export interface RankedMatch {
  code: string;
  /** 내 공개 id */
  you: string;
  /** 서버가 정한 참가자 순서. 야추는 2~4명 */
  ids: string[];
  /** 내 자리. 각 참가자는 이 값으로 주인에게 자기 자리를 알린다 */
  seat: number;
}

/**
 * 등급전 참가자와 브라우저 방 자리를 잇는 작은 세션.
 *
 * 대기열의 계정 id와 WebRTC peer id는 다른 값이다. 이 경계 밖에서 둘을 섞으면 게임 공통
 * 네트워크 코드가 특정 놀이의 인원 규칙을 알게 된다. 참가자는 서버가 준 자기 자리만 알리고,
 * 주인 확정 명단 동기화. 2인과 2~4인 순위전 공통 계약.
 */
const ROSTER_META = 'ranked-roster:';

export class RankedRoster {
  private idsBySeat: string[];
  private readonly peers = new Map<string, number>();

  constructor(readonly match: RankedMatch, readonly host: boolean) {
    this.idsBySeat = host ? [match.you] : [];
  }

  get seats(): number { return this.match.ids.length; }
  get ready(): boolean {
    return this.idsBySeat.length === this.seats && this.idsBySeat.filter(Boolean).length === this.seats;
  }

  joinMeta(): string { return ROSTER_META + String(this.match.seat); }

  /** 주인만 부른다. 같은 peer가 두 자리를 차지하거나 남의 자리를 주장할 수 없다. */
  acceptPeerMeta(peerId: string, meta: string | undefined): boolean {
    if (!this.host || !meta?.startsWith(ROSTER_META)) return false;
    const seat = Number(meta.slice(ROSTER_META.length));
    if (!Number.isInteger(seat) || seat <= 0 || seat >= this.seats || this.idsBySeat[seat] || this.peers.has(peerId)) return true;
    this.peers.set(peerId, seat);
    this.idsBySeat[seat] = this.match.ids[seat];
    return true;
  }

  /** 주인이 상태 동기화에 실을 값. 준비 전에는 빈 명단을 보낸다. */
  sync(): string[] { return this.ready ? [...this.idsBySeat] : []; }

  /** 손님은 주인이 준, 서버 대기열과 정확히 같은 순서의 명단만 받는다. */
  applySync(ids: unknown): void {
    if (!Array.isArray(ids) || ids.length !== this.seats) return;
    const next = ids.map(String);
    if (next.every((id, i) => id === this.match.ids[i])) this.idsBySeat = next;
  }

  /** WebRTC 연결 순서는 참가자가 방에 들어온 순서일 뿐, 서버가 준 자리 순서가 아니다. */
  orderPeers<T extends { id: string }>(peers: readonly T[]): T[] {
    return [...peers].sort((a, b) => (this.peers.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (this.peers.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }

  /** 점수가 같으면 같은 자리. 서버 자리 순서는 동률 그룹 안에서만 유지 */
  outcomeFor(scores: readonly number[]): RankedOutcome | null {
    if (!this.ready || scores.length !== this.seats) return null;
    return outcomeFromScores(this.idsBySeat, scores);
  }
}

export interface Reported {
  applied: boolean;
  /** 아직 상대 말을 기다리는 중 */
  waiting: number;
  /** 양쪽 말이 어긋남 */
  disagreed: boolean;
  /** 서버가 패보로 다시 셈한 것과 어긋남. 점수가 안 움직임 */
  forged: boolean;
  /** 서버가 실제로 다시 세어 봤나. 거짓이면 셀 것이 없었다는 뜻 */
  verified: boolean;
  /** 같은 짝끼리 반복이라 폭이 깎였나 */
  damped: boolean;
  /** 반영됐으면 내 점수 변화 */
  delta: number | null;
  rating: number | null;
}

/**
 * 판이 끝났다고 알림. 같은 자리는 한 그룹
 * - 양쪽이 각자 보냄. 서버는 둘이 같은 말을 할 때만 점수를 움직임
 * - 못 보내도 판은 이미 끝났음. 조용히 없음을 돌려줌
 */
export async function reportResult(m: RankedMatch, outcome: RankedOutcome): Promise<Reported | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/report`, {
      ...WITH_COOKIE,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: m.code, placements: outcome.placements })
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      applied?: boolean;
      waiting?: number;
      disagreed?: boolean;
      forged?: boolean;
      verified?: boolean;
      damped?: boolean;
      result?: Array<{ id: string; after: number; delta: number }>;
    };
    const mine = body.result?.find((r) => r.id === m.you) ?? null;
    return {
      applied: Boolean(body.applied),
      waiting: Number(body.waiting ?? 0),
      disagreed: Boolean(body.disagreed),
      forged: Boolean(body.forged),
      verified: Boolean(body.verified),
      damped: Boolean(body.damped),
      delta: mine ? mine.delta : null,
      rating: mine ? mine.after : null
    };
  } catch {
    return null;
  }
}

/**
 * 패보. 끝난 판을 서버에 두고 링크로 다시 편다 (3번)
 *
 * - 판 전체를 안 보냄. 씨앗과 누른 것 몇 줄(`Tape`)
 * - 양쪽이 각자 보내도 서버가 한 판에 하나만 적고 같은 id 를 돌려줌
 * - 못 보내도 판은 이미 끝났음. 조용히 없음
 */
export async function saveTape(code: string, tape: unknown): Promise<string | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/tape`, {
      ...WITH_COOKIE,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, tape })
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}

/**
 * 이 판의 패보 id. 손님 창이 묻는 자리
 * - 패보는 판을 돌린 주인만 만듦. 손님에게는 되살릴 것이 없음
 * - 주인이 올릴 때까지 잠깐 걸림. 3초 간격 세 번까지 물음
 */
export async function findTape(code: string): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(`${HOST}/kl/arcade/tape/of/${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (res.ok) return ((await res.json()) as { id?: string }).id ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** 링크에 실린 패보 하나. 없으면 없음 */
export async function loadTape(id: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/tape/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { tape?: unknown };
    return body.tape ?? null;
  } catch {
    return null;
  }
}

/** 주소에서 패보 id. 방 코드(`?r=`), 편지(`?m=`)와 다른 자리 */
export function tapeFromUrl(): string | null {
  const q = new URLSearchParams(location.search).get('g');
  return q && /^[A-Za-z0-9_-]{6,16}$/.test(q) ? q : null;
}

/** 복기 링크. 방 이름과 같은 규칙으로 물음표 뒤에 (셸이 `#` 뒤를 덮어씀) */
export function tapeLink(id: string): string {
  return `${location.origin}${location.pathname}?g=${encodeURIComponent(id)}`;
}

export interface PastGame {
  id: string;
  game: string;
  /** 끝난 때 (epoch ms) */
  at: number;
  /** 그 판의 자리 이름, 자리 순서대로 */
  who: string[];
}

/**
 * 내가 낀 지난 판들. 최근 것부터 (change.arcade-online, 레퍼런스 replay-archives)
 * - 판 끝의 링크를 놓치면 다시 못 찾는 것이 제일 큰 구멍이었음
 * - 로그인 안 했으면 빈 목록. 로비가 그것 때문에 멈추면 안 됨
 */
export async function myTapes(game: string, limit = 3): Promise<PastGame[]> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/tapes/me?game=${encodeURIComponent(game)}&limit=${limit}`, {
      ...WITH_COOKIE,
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { tapes?: PastGame[] };
    return Array.isArray(body.tapes) ? body.tapes : [];
  } catch {
    return [];
  }
}
