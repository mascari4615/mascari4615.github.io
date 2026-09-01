/**
 * 등급전 결과 보고. 양쪽 말이 맞아야 반영 (change.arcade-online 2번)
 *
 * - 주인이 판을 돌리므로 주인 말만 믿으면 점수를 마음대로 적을 수 있음
 * - 그래서 그 판의 **모든 사람**이 같은 순서를 보고해야 점수가 움직임 (사용자 결정)
 * - 어긋나면 아무 점수도 안 움직이고 그대로 남음. 한쪽이 안 보내도 마찬가지
 *
 * 규율:
 *  ① 보고하는 사람은 로그인으로 자기를 증명. 남의 판에 못 끼어듦
 *  ② 순서에 적힌 id 는 그 판의 사람 그대로여야 함. 하나라도 다르면 400
 *  ③ 같은 판은 한 번만 반영. 다시 보내면 이미 반영된 결과를 그대로 돌려줌
 */
import express from 'express';
import type { Application, Request, Response } from 'express';
import { rosterOf } from './arcade-queue';
import { whoOf, type WhoOf } from './arcade-who';
import { applyResult, pairFactor, recordOf, type Applied } from './arcade-rating';

interface Pending {
  game: string;
  /** 사람마다 보낸 순서. 열쇠 주인 id -> 순서 문자열 */
  said: Map<string, string>;
  ids: string[];
  at: number;
}

const pending = new Map<string, Pending>();
const done = new Map<string, Applied[]>();
const KEEP_MS = 3 * 60 * 60 * 1000;

export function resetReports(): void {
  pending.clear();
  done.clear();
}

function sweep(now = Date.now()): void {
  for (const [code, p] of pending) if (now - p.at > KEEP_MS) pending.delete(code);
}

const CODE_RE = /^[A-Z0-9]{4,12}$/;

export function registerArcadeReport(app: Application, who: WhoOf = whoOf): void {
  /**
   * 판이 끝났다고 알림. `ranks` 는 잘한 순서, 첫째가 1위
   * - 답의 `applied` 는 점수가 실제로 움직였을 때만 참
   */
  app.post('/kl/arcade/report', express.json({ limit: '4kb' }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      res.status(400).json({ error: 'code 모양이 아니다' });
      return;
    }
    const signed = who(req);
    if (!signed) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const roster = rosterOf(code);
    if (!roster) {
      res.status(404).json({ error: '그런 판이 없다' });
      return;
    }
    const me = signed.id;
    /* ① 그 판의 사람만 */
    if (!roster.ids.includes(me)) {
      res.status(403).json({ error: '그 판의 사람이 아니다' });
      return;
    }
    /* ③ 이미 반영됐으면 그 결과 그대로 */
    const already = done.get(code);
    if (already) {
      res.json({ ok: true, applied: true, again: true, result: already });
      return;
    }
    const ranks = (Array.isArray(body.ranks) ? body.ranks : []).map((v) => String(v));
    const draw = body.draw === true;
    /* ② 순서에 적힌 사람이 그 판의 사람 그대로여야 함 */
    const same =
      ranks.length === roster.ids.length && [...ranks].sort().join() === [...roster.ids].sort().join();
    if (!same) {
      res.status(400).json({ error: 'ranks 가 그 판의 사람과 다르다' });
      return;
    }
    sweep();
    const p = pending.get(code) ?? { game: roster.game, said: new Map<string, string>(), ids: roster.ids, at: Date.now() };
    p.said.set(me, (draw ? 'D:' : 'W:') + ranks.join(','));
    pending.set(code, p);

    /* 전원이 말했고 전부 같은 말이어야 반영 */
    if (p.said.size < roster.ids.length) {
      res.json({ ok: true, applied: false, waiting: roster.ids.length - p.said.size });
      return;
    }
    const words = new Set(p.said.values());
    if (words.size > 1) {
      /* 어긋남. 점수는 안 움직이고 사람이 볼 수 있게 남김 */
      res.json({ ok: true, applied: false, disagreed: true });
      return;
    }
    /* 계수는 반영 전에 봄. applyResult 가 이 판을 장부에 더함 */
    const damped = pairFactor(roster.game, ranks) < 1;
    const result = applyResult(roster.game, ranks, draw);
    done.set(code, result);
    pending.delete(code);
    res.json({ ok: true, applied: true, result, damped });
  });

  /** 내 점수. 로그인한 사람만 자기 것을 봄. 안 했으면 없다고 답함(401 아님) */
  app.get('/kl/arcade/rating/me', (req: Request, res: Response) => {
    const game = String(req.query.game ?? '').trim();
    if (!/^[a-z0-9]{2,24}$/.test(game)) {
      res.status(400).json({ error: 'game 모양이 아니다' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const me = who(req);
    /* 로비가 로그인 여부를 이 한 번으로 안다. 여기서 401 을 내면 로비가 콘솔만 더럽힘 */
    if (!me) {
      res.json({ signedIn: false });
      return;
    }
    res.json({ signedIn: true, ...recordOf(game, me.id) });
  });
}
