/**
 * 잠깐 쓰는 메일 라우트 (TASK-KL-339). **자기 파일에 산다**.
 *
 * 편지는 Cloudflare Email Worker 가 여기로 밀어 넣는다(`cloudflare/email-worker.js`).
 * 그 문은 **토큰이 있어야** 열린다. 없으면 누구나 남의 편지함에 아무 편지나 넣을 수 있다.
 *
 * 읽는 쪽은 **주소가 아니라 열쇠**로 연다(`services/temp-mail-store`). 주소는 남에게 줘야
 * 쓸모가 있는 물건이라, 주소를 아는 것과 읽을 수 있는 것을 갈라 둔다.
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` **다음에** 부른다. `/kl` CORS
 * 미들웨어가 거기서 달리고 Express 는 먼저 달린 것부터 태운다.
 */
import express from 'express';
import type { Application, Request, Response } from 'express';
import {
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  TempMailStore,
  getTempMailStore,
  plainOf,
} from '../services/temp-mail-store';

/**
 * 편지가 오는 주소의 뒷부분. 사용자가 Cloudflare 에서 붙이는 것과 **같아야 한다** . 
 * 다르면 화면이 알려 준 주소로 보낸 편지가 영영 안 온다.
 */
export const MAIL_DOMAIN = process.env.KL_MAIL_DOMAIN || 'mail.mascari4615.com';

/** 수신 문을 여는 토큰. **없으면 문을 아예 안 연다**. 열쇠 없는 문은 문이 아니다. */
const HOOK_TOKEN = process.env.KL_MAIL_HOOK_TOKEN || '';

export function registerMailRoutes(app: Application, store: TempMailStore = getTempMailStore()): void {
  /** 이 뒷단이 메일을 받을 준비가 됐나. 화면이 아직 안 켜졌다를 정직하게 말하려고 본다. */
  app.get('/kl/mail/ready', (_req: Request, res: Response) => {
    res.json({ ready: HOOK_TOKEN !== '', domain: MAIL_DOMAIN, defaultTtlMs: DEFAULT_TTL_MS, maxTtlMs: MAX_TTL_MS });
  });

  /** 새 주소. 열쇠는 **이 답에서 한 번만** 준다. 다시 물어볼 수 있으면 열쇠가 아니다. */
  app.post('/kl/mail/new', express.json({ limit: '4kb' }), (req: Request, res: Response) => {
    const ttl = Number((req.body as { ttlMs?: unknown } | undefined)?.ttlMs ?? DEFAULT_TTL_MS);
    const box = store.open(Number.isFinite(ttl) ? ttl : DEFAULT_TTL_MS);
    res.json({
      address: `${box.name}@${MAIL_DOMAIN}`,
      name: box.name,
      token: box.token,
      expiresAt: box.expiresAt,
      ready: HOOK_TOKEN !== '',
    });
  });

  /**
   * 편지 보기. 열쇠가 틀리면 **404**. 401 로 답하면 그 주소는 있다가 새어 나간다.
   * 열쇠는 헤더로 받는다: 주소줄에 실으면 로그, 기록에 남는다.
   */
  app.get('/kl/mail/box/:name', (req: Request, res: Response) => {
    const token = String(req.header('X-KL-Mail-Token') || req.query.token || '');
    const view = store.read(String(req.params.name || ''), token);
    if (!view) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(view);
  });

  /** 미리 버리기. */
  app.delete('/kl/mail/box/:name', (req: Request, res: Response) => {
    const token = String(req.header('X-KL-Mail-Token') || req.query.token || '');
    res.json({ dropped: store.drop(String(req.params.name || ''), token) });
  });

  /**
   * 편지 받기. **Cloudflare Email Worker 만 부른다.**
   *
   * 모르는 주소로 온 편지는 `delivered: false` 로 **조용히** 답한다(200). Worker 가 그걸
   * 오류로 보면 Cloudflare 가 되돌려 보내기를 시도하고, 그건 이미 사라진 함에 대고
   * 몇 번씩 반복된다. 우리 쪽에서 받았고, 넣을 데가 없었다로 끝내는 편이 맞다.
   */
  app.post('/kl/mail/in', express.json({ limit: '1mb' }), (req: Request, res: Response) => {
    if (HOOK_TOKEN === '' || req.header('X-KL-Mail-Hook') !== HOOK_TOKEN) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const body = (req.body ?? {}) as { to?: unknown; from?: unknown; subject?: unknown; text?: unknown; html?: unknown };
    const to = String(body.to ?? '');
    const name = to.split('@')[0]?.trim().toLowerCase() ?? '';
    if (name === '') {
      res.status(400).json({ error: 'bad_to' });
      return;
    }
    /* 글자 본문이 있으면 그걸 쓰고, 없으면 HTML 을 **받는 자리에서** 글자로 누른다.
       곳간에 HTML 이 들어오지조차 않게 한다. 화면 쪽 실수 하나로 뚫리는 일이 없다. */
    const text = typeof body.text === 'string' && body.text.trim() !== '' ? body.text : plainOf(String(body.html ?? ''));
    const ok = store.deliver(name, { from: String(body.from ?? ''), subject: String(body.subject ?? ''), text });
    res.json({ delivered: ok });
  });
}
