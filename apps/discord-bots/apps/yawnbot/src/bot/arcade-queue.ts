/**
 * 등급전 대기열. 같은 점수 방의 둘을 붙여 방 코드 하나 (change.arcade-online 1번)
 *
 * - 열린 방 목록(`arcade-rooms.ts`)은 사람이 고르는 길, 여기는 서버가 짝을 지어 주는 길
 * - 판은 여전히 브라우저끼리(nostr 중계). 서버 몫은 셋뿐 - 누가 기다리나, 방 코드 하나, 누가 주인
 *
 * 규율:
 *  ① 신원은 **로그인한 계정 하나** (사용자 결정 2026-08-31)
 *     - 세션 쿠키(`kl_session`)로 옴. 디스코드와 패스키가 이미 있는 그 계정
 *     - 점수가 붙는 자리라 신원이 하나여야 함. 기기가 바뀌어도 같은 사람
 *  ② 방은 점수가 정함. 사람이 방을 안 고름. 지금은 방 둘(초심, 그 위)
 *     - 사람 적을 때 방이 많으면 아무도 못 만남 (사용자 결정)
 *  ③ 금방 사라짐. 15초 무소식이면 대기열에서 제외
 *     - 창 닫고 간 사람과 짝을 지으면 눌렀는데 아무도 없네
 *  ④ 저장은 메모리뿐. 대기열은 배포를 넘겨 살 이유 없음. 점수(2번)는 다름
 */
import express from 'express';
import type { Application, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { whoOf, type WhoOf } from './arcade-who';
import { ratingOf, roomOf, type RoomName } from './arcade-rating';
export type { RoomName } from './arcade-rating';

/** 무소식 한계. 브라우저 알림 주기는 5초 */
const TTL_MS = 15 * 1000;
/** 짝이 난 뒤 두 사람이 코드를 가져갈 시간 */
const MATCH_KEEP_MS = 2 * 60 * 1000;
/** 등급전 방. 이름은 자리표 (사용자 결정: 이름은 나중) */
export const ROOMS = ['beginner', 'upper'] as const;

/** 방 코드 글자. 브라우저 `lib/room.ts` 의 `makeCode` 와 동일. `0, O, 1, I` 제외 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(len = 5): string {
  const buf = randomBytes(len);
  return [...buf].map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}




interface Waiting {
  id: string;
  game: string;
  room: RoomName;
  name: string;
  /** 처음 선 때. 줄 순서의 근거 */
  since: number;
  /** 마지막 알림. 제외 판정의 근거 */
  at: number;
}

interface Matched {
  code: string;
  game: string;
  room: RoomName;
  /** 주인 id. 먼저 선 쪽 */
  host: string;
  guest: string;
  names: Record<string, string>;
  at: number;
}

const waiting = new Map<string, Waiting>();
/** id -> 짝. 두 사람이 같은 것을 가리킴 */
const matched = new Map<string, Matched>();

function sweep(now = Date.now()): void {
  for (const [id, w] of waiting) if (now - w.at > TTL_MS) waiting.delete(id);
  for (const [id, m] of matched) if (now - m.at > MATCH_KEEP_MS) matched.delete(id);
}

const clean = (v: unknown, re: RegExp, max: number): string | null => {
  const s = String(v ?? '').trim().slice(0, max);
  return re.test(s) ? s : null;
};
const NAME_MAX = 16;

/** 검사용 뒷문 */
export function resetQueue(): void {
  waiting.clear();
  matched.clear();
  rosters.clear();
}

/**
 * 짝이 난 판의 사람들. 결과 보고가 이걸로 누가 그 판에 있었나를 봄
 * - 짝 기록(2분)보다 오래 살아야 함. 판이 그보다 김
 */
interface Roster {
  game: string;
  ids: string[];
  at: number;
}
const rosters = new Map<string, Roster>();
/** 한 판의 최대 길이. 이보다 늦게 온 보고는 안 받음 */
const ROSTER_KEEP_MS = 3 * 60 * 60 * 1000;

export function rosterOf(code: string): Roster | null {
  const r = rosters.get(code);
  if (!r || Date.now() - r.at > ROSTER_KEEP_MS) return null;
  return r;
}

/** 방마다 기다리는 사람 수. 로비의 같은 방에 n명 표시용 */
export function queueCounts(game: string): Record<RoomName, number> {
  sweep();
  const out: Record<RoomName, number> = { beginner: 0, upper: 0 };
  for (const w of waiting.values()) if (w.game === game) out[w.room]++;
  return out;
}

function answer(id: string): Record<string, unknown> {
  const m = matched.get(id);
  if (m) {
    const other = m.host === id ? m.guest : m.host;
    /* 내 id 와 상대 id 를 같이 줌. 결과 보고가 순서를 id 로 적음 */
    return { status: 'matched', code: m.code, host: m.host === id, room: m.room, you: id, rival: other, opponent: m.names[other] ?? '누군가' };
  }
  const w = waiting.get(id);
  if (w) return { status: 'waiting', room: w.room, others: queueCounts(w.game)[w.room] - 1 };
  return { status: 'none' };
}

export function registerArcadeQueue(app: Application, who: WhoOf = whoOf): void {
  /**
   * 줄서기 겸 알림. 같은 열쇠면 덮어씀
   * - 같은 놀이, 같은 방에 다른 사람이 있으면 그 자리에서 짝
   */
  app.post('/kl/arcade/queue', express.json({ limit: '2kb' }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const game = clean(body.game, /^[a-z0-9]{2,24}$/, 24);
    if (!game) {
      res.status(400).json({ error: 'game 모양이 아니다' });
      return;
    }
    /* 등급전은 로그인 필수. 점수가 붙는 자리라 신원이 하나여야 함 */
    const me = who(req);
    if (!me) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = me.id;
    /* 이름은 사람이 로비에 적은 것. 없으면 계정 이름 */
    const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || me.handle || '누군가';
    sweep();
    /* 이미 짝이 났으면 그 답 그대로. 줄에 다시 세우면 한 사람이 두 판에 걸림 */
    if (matched.has(id)) {
      res.json(answer(id));
      return;
    }
    const room = roomOf(ratingOf(game, id));
    const now = Date.now();
    const other = [...waiting.values()]
      .filter((w) => w.id !== id && w.game === game && w.room === room)
      .sort((a, b) => a.since - b.since)[0];
    if (other) {
      waiting.delete(other.id);
      waiting.delete(id);
      const m: Matched = {
        code: makeCode(),
        game,
        room,
        host: other.id,
        guest: id,
        names: { [other.id]: other.name, [id]: name },
        at: now
      };
      matched.set(other.id, m);
      matched.set(id, m);
      rosters.set(m.code, { game, ids: [other.id, id], at: now });
      for (const [code, r] of rosters) if (now - r.at > ROSTER_KEEP_MS) rosters.delete(code);
    } else {
      /* 처음 선 때 보존. 알림마다 줄 맨 뒤면 오래 기다린 사람이 계속 밀림 */
      const since = waiting.get(id)?.since ?? now;
      waiting.set(id, { id, game, room, name, since, at: now });
    }
    res.json({ ...answer(id), until: TTL_MS });
  });

  /**
   * 지금 방마다 몇이 기다리나. 로비가 등급전 문 옆에 적는 값
   * - 열쇠 없이 봄. 사람 수는 감출 것이 아니고, 아무도 없는 문을 누르게 두면 안 됨
   */
  app.get('/kl/arcade/queue/count/:game', (req: Request, res: Response) => {
    const game = clean(req.params.game, /^[a-z0-9]{2,24}$/, 24);
    if (!game) {
      res.status(400).json({ error: 'game 모양이 아니다' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(queueCounts(game));
  });

  /** 짝이 났나. 먼저 선 사람이 아는 길 */
  app.get('/kl/arcade/queue/me', (req: Request, res: Response) => {
    const me = who(req);
    if (!me) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    sweep();
    const id = me.id;
    const w = waiting.get(id);
    if (w) w.at = Date.now();
    res.setHeader('Cache-Control', 'no-store');
    res.json(answer(id));
  });

  /** 줄에서 나감. 짝이 난 뒤면 짝도 해제, 상대는 다음 알림에 `none` */
  app.delete('/kl/arcade/queue/me', (req: Request, res: Response) => {
    const me = who(req);
    if (!me) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = me.id;
    waiting.delete(id);
    const m = matched.get(id);
    if (m) {
      matched.delete(m.host);
      matched.delete(m.guest);
    }
    res.json({ ok: true });
  });
}
