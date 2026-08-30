/**
 * 패보. 끝난 판을 서버가 들고, 링크로 다시 편다 (change.arcade-online 3번)
 *
 * - 판 전체를 안 적음. 씨앗과 누른 것 몇 줄이면 되살아남(`replay.ts` 의 `Tape`)
 * - 오목 서른 수가 1KB 남짓. 그래서 파일 하나로 충분
 * - 옵션(`opts`)과 자리(`seats`)까지 같이 적음. 빠지면 딴 판이 펴짐 (2026-08-30 사고)
 *
 * 규율:
 *  ① 그 판의 사람만 올림. 열쇠로 자기를 증명
 *  ② 한 판에 하나. 창이 여럿이라 여럿이 보냄. 먼저 온 것만 적고 같은 id 를 돌려줌
 *  ③ 보는 것은 아무나. 링크를 아는 사람이 복기를 봄. 감출 것은 안 실림(자리 이름뿐)
 *  ④ 무한정 안 쌓음. 최근 500판만
 */
import express from 'express';
import type { Application, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PKG_ROOT } from '../paths';
import { idOf, rosterOf } from './arcade-queue';

/** 자리는 부를 때 정함. 검사가 임시 파일로 돌릴 수 있어야 함 */
const file = (): string => process.env.ARCADE_TAPE_FILE?.trim() || path.join(PKG_ROOT, 'data', 'arcade-tapes.json');

/** 이만큼만 들고 있음. 넘으면 오래된 것부터 버림 */
const MAX = 500;
/** 한 판의 크기 한계. 오목 서른 수가 1KB 남짓이라 넉넉함 */
const BODY_LIMIT = '64kb';
const MOVES_MAX = 2000;
const SEATS_MAX = 8;
const NAME_MAX = 16;

export interface StoredTape {
  game: string;
  seed: number;
  seats: Array<{ name: string; bot: boolean }>;
  opts: Record<string, number | boolean>;
  moves: Array<{ at: number; seat: number; action: unknown }>;
  end: number;
}

interface Entry {
  id: string;
  code: string;
  at: number;
  tape: StoredTape;
}

type Store = Record<string, Entry>;
let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(file(), 'utf8')) as Store;
  } catch {
    /* 첫 실행이거나 깨진 파일. 빈 서랍으로 시작 */
    store = {};
  }
  return store;
}

let saveTimer: NodeJS.Timeout | null = null;
function save(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const f = file();
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store ?? {}), 'utf8');
      fs.renameSync(tmp, f);
    } catch {
      /* 못 적어도 판은 이미 끝났음. 다음 판에 다시 시도 */
    }
  }, 1000);
  saveTimer.unref?.();
}

export function resetTapes(): void {
  store = {};
}

/** 판 코드에서 패보 id. 같은 판이면 같은 id 라 두 번 안 적음 */
function idFor(code: string): string {
  return createHash('sha256').update('tape:' + code).digest('base64url').slice(0, 10);
}

/** 남이 준 값이라 못 믿음. 숫자와 참거짓만 남김 */
function safeOpts(v: unknown): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(k)) continue;
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'boolean') out[k] = val;
  }
  return out;
}

/**
 * 패보 하나로 다듬음. 모양이 아니면 없음
 * - `action` 은 놀이마다 달라 속을 안 봄. 대신 크기를 자름(글자로 재서)
 */
export function cleanTape(v: unknown, game: string): StoredTape | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  if (t.game !== game) return null;
  const seed = Number(t.seed);
  if (!Number.isFinite(seed)) return null;
  const seats = (Array.isArray(t.seats) ? t.seats : []).slice(0, SEATS_MAX).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      name: String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || '누군가',
      bot: o.bot === true
    };
  });
  if (!seats.length) return null;
  const moves = (Array.isArray(t.moves) ? t.moves : []).slice(0, MOVES_MAX).map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    return { at: Number(o.at) || 0, seat: Math.max(0, Math.min(SEATS_MAX - 1, Number(o.seat) || 0)), action: o.action ?? null };
  });
  return { game, seed, seats, opts: safeOpts(t.opts), moves, end: Number(t.end) || 0 };
}

/** 오래된 것부터 버림. 최근 것만 남김 */
function prune(): void {
  const s = load();
  const all = Object.values(s).sort((a, b) => b.at - a.at);
  if (all.length <= MAX) return;
  for (const e of all.slice(MAX)) delete s[e.id];
}

export function registerArcadeTape(app: Application): void {
  /** 끝난 판을 올림. 그 판의 사람만. 한 판에 하나 */
  app.post('/kl/arcade/tape', express.json({ limit: BODY_LIMIT }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = String(body.key ?? '').trim();
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(key) || !/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(400).json({ error: 'key, code 모양이 아니다' });
      return;
    }
    const roster = rosterOf(code);
    if (!roster) {
      res.status(404).json({ error: '그런 판이 없다' });
      return;
    }
    if (!roster.ids.includes(idOf(key))) {
      res.status(403).json({ error: '그 판의 사람이 아니다' });
      return;
    }
    const id = idFor(code);
    const s = load();
    /* ② 한 판에 하나. 창이 여럿이라 여럿이 보냄 */
    if (s[id]) {
      res.json({ ok: true, id, again: true });
      return;
    }
    const tape = cleanTape(body.tape, roster.game);
    if (!tape) {
      res.status(400).json({ error: 'tape 모양이 아니다' });
      return;
    }
    s[id] = { id, code, at: Date.now(), tape };
    prune();
    save();
    res.json({ ok: true, id });
  });

  /**
   * 이 판의 패보 id. 손님 창이 묻는 자리
   * - 패보는 판을 돌린 주인만 만듦(손님에게는 되살릴 것이 없음)
   * - 그래서 손님은 판 코드로 물어 링크를 얻음
   */
  app.get('/kl/arcade/tape/of/:code', (req: Request, res: Response) => {
    const code = String(req.params.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(400).json({ error: 'code 모양이 아니다' });
      return;
    }
    const id = idFor(code);
    if (!load()[id]) {
      res.status(404).json({ error: '아직 안 올라왔다' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ id });
  });

  /** 패보 하나. 링크를 아는 사람이 복기를 봄 */
  app.get('/kl/arcade/tape/:id', (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) {
      res.status(400).json({ error: 'id 모양이 아니다' });
      return;
    }
    const e = load()[id];
    if (!e) {
      res.status(404).json({ error: '그런 패보가 없다' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ id: e.id, at: e.at, tape: e.tape });
  });
}
