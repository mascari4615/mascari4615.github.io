/**
 * 사라지는 쪽지 라우트 (TASK-KL-251) — **자기 파일에 산다**.
 *
 * 서버가 보는 것은 알아볼 수 없는 덩어리뿐이다. 여는 열쇠는 주소의 `#` 뒤라 여기까지 오지
 * 않는다 — 브라우저가 `#` 뒤를 보내지 않기 때문이다(HTTP 규격).
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` **다음에** 부른다 — `/kl` CORS
 * 미들웨어가 거기서 달리고 Express 는 먼저 달린 것부터 태운다.
 */
import type { Application, Request, Response } from 'express';
import { BurnNoteStore, MAX_BODY, getBurnNoteStore } from '../services/burn-note-store';

export function registerNoteRoutes(app: Application, store: BurnNoteStore = getBurnNoteStore()): void {
  /** 맡기기. 몸통은 잠긴 덩어리 하나. */
  app.post('/kl/note', (req: Request, res: Response) => {
    const body = (req.body as { body?: unknown } | undefined)?.body;
    if (typeof body !== 'string') {
      res.status(400).json({ error: 'body must be a string' });
      return;
    }
    const got = store.put(body);
    if ('error' in got) {
      res.status(got.error === 'too-large' ? 413 : 400).json({ error: got.error, max: MAX_BODY });
      return;
    }
    res.json({ id: got.id });
  });

  /**
   * 꺼내기 — **그 순간 사라진다.**
   *
   * 없을 때 404 하나로 답한다: 「이미 읽혔다」와 「그런 쪽지 없다」를 나눠 주면
   * 「이 주소에 쪽지가 있었다」는 사실이 남에게 새어 나간다.
   */
  app.get('/kl/note/:id', (req: Request, res: Response) => {
    const got = store.take(String(req.params.id || ''));
    if (!got) {
      res.status(404).json({ error: 'gone' });
      return;
    }
    /* 중간 어디에도 남기지 않는다 — 한 번만 존재하는 답이다. */
    res.setHeader('Cache-Control', 'no-store');
    res.json({ body: got.body, at: got.at });
  });
}
