/**
 * 판이 끝나면 채널에 한 줄 (arcade-next 결과를 채널로)
 *
 * 욘봇이 `/오락실` 로 방을 열어 줬는데 **그다음이 없었다.** 사람들이 흩어지고 나면 그 자리에는
 * 아무것도 안 남는다. 누가 이겼는지, 판이 있었는지조차. 한 줄이 남으면 그게 다음 판을 부른다.
 *
 * **새 송신 경로를 안 판다.** 이미 `sendLocalEvent` 하나로 모든 알림이 나간다(채널 해석, 색, 
 * embed 가 거기 있다). 여기서 하는 일은 끝났다를 받아 그 길에 얹는 것뿐이다.
 *
 * 규율:
 *  ① **공개로 연 방만.** 링크 아는 사람끼리 둔 판을 채널에 옮기면 그건 중계가 아니라 감시다.
 *     그래서 방 목록(`arcade-rooms`)에 올라 있던 코드만 받는다.
 *  ② **아무 글자나 안 받는다**. 이름, 놀이, 점수가 그대로 남에게 보인다.
 *  ③ **같은 판을 두 번 안 적는다.** 창이 여럿이면 여럿이 보낸다(주인, 손님, 구경꾼) . 
 *     방 코드로 한 번만.
 */
import express from 'express';
import type { Application, Request, Response } from 'express';
import type { Client } from 'discord.js';
import { sendLocalEvent } from './local-webhook';
import { moveCard } from './arcade-invite';

/** 이 방의 결과를 이미 적었나. 창 여럿이 같은 판을 보낸다. */
const told = new Map<string, number>();
/** 오래된 것은 잊는다(같은 코드가 다시 쓰일 수 있다). */
const FORGET_MS = 30 * 60 * 1000;

const clean = (v: unknown, re: RegExp, max: number): string | null => {
  const s = String(v ?? '').trim().slice(0, max);
  return re.test(s) ? s : null;
};

export function resetResults(): void {
  told.clear();
}

export function registerArcadeResult(app: Application, client: Client, isOpenRoom: (code: string) => boolean): void {
  app.post('/kl/arcade/result', express.json({ limit: '4kb' }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = clean(body.code, /^[A-Z0-9]{4,12}$/, 12);
    const game = clean(body.game, /^[a-z0-9]{2,24}$/, 24);
    if (!code || !game) {
      res.status(400).json({ error: 'code, game 모양이 아니다' });
      return;
    }
    /* ① 공개로 연 방만. 비공개 판을 채널에 옮기면 중계가 아니라 감시다. */
    if (!isOpenRoom(code)) {
      res.status(403).json({ error: '공개로 연 방이 아니다' });
      return;
    }
    const now = Date.now();
    for (const [k, at] of told) if (now - at > FORGET_MS) told.delete(k);
    /* ③ 같은 판은 한 번만. 창 여럿이 저마다 보낸다. */
    if (told.has(code)) {
      res.json({ ok: true, again: true });
      return;
    }

    /* 자리는 최대 여덟, 이름은 짧게. 그대로 남에게 보이는 값이다. */
    const seats = (Array.isArray(body.seats) ? body.seats : [])
      .slice(0, 8)
      .map((one) => {
        const s = (one ?? {}) as Record<string, unknown>;
        const name = String(s.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16) || '누군가';
        const score = Number.isFinite(Number(s.score)) ? Math.trunc(Number(s.score)) : 0;
        return { name, score };
      });
    if (!seats.length) {
      res.status(400).json({ error: '자리가 없다' });
      return;
    }

    told.set(code, now);
    const top = Math.max(...seats.map((s) => s.score));
    const win = seats.filter((s) => s.score === top);
    const title = win.length === seats.length ? '비겼다' : `${win.map((w) => w.name).join(', ')} 이겼다`;

    /* /오락실 이 뿌린 카드가 있으면 거기에도 결과를 적음 */
    void moveCard(client, code, 'done', title);

    void sendLocalEvent(client, {
      kind: 'arcade-result',
      source: 'karmolab/arcade',
      title,
      /* 놀이 이름은 사이트가 보낸 id 그대로. 여기서 한국어로 옮기면 말 묶음이 두 벌이 된다. */
      summary: `${game}, 방 ${code}`,
      fields: seats
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((s) => ({ name: s.name, value: String(s.score), inline: true }))
    });
    res.json({ ok: true });
  });
}
