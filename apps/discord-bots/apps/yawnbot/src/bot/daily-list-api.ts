/**
 * 전부대기 — 군중의 답 라우트 (TASK-KL-197).
 *
 * `/kl` 아래 산다. 거기 이미 달린 CORS·요청번호 미들웨어를 그대로 타기 때문이다 —
 * 새 경로를 파면 그 세 줄을 또 적게 되고, 두 벌은 반드시 갈라진다.
 *
 * 자기 파일에 사는 이유는 우물·도감과 같다: `karmolab-api.ts`(2700줄)는 여러 세션이 동시에
 * 고치는 자리라, 낡은 사본을 덮어쓴 커밋이 남의 라우트를 함께 지운다(2026-08-08 두 번).
 *
 * **로그인을 안 본다.** 익명으로 노는 놀이의 집계라 계정을 요구하면 표본이 안 모인다.
 */
import type { Application, Request, Response } from 'express';
import {
  getDailyListStore,
  isValidQuestionId,
  isValidTopic,
  MAX_NAMES_PER_REPORT,
  type DailyListStore,
} from '../services/daily-list-answers';

export function registerDailyListRoutes(app: Application, store: DailyListStore = getDailyListStore()): void {
  /**
   * 이 문제에 사람들이 뭘 냈나. 표본이 적으면 `shares: null` — 화면은 그때 희귀도 없이
   * 개수만 센다(놀이는 안 멈춘다).
   */
  app.get('/kl/daily-list/shares', (req: Request, res: Response) => {
    const { topic, q } = req.query;
    if (!isValidTopic(topic) || !isValidQuestionId(q)) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    const { people, shares } = store.shares(topic, q);
    // 하루 안에서도 값이 자라므로 오래 캐시하면 안 된다. 5분이면 서버는 쉬고 값은 산다.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ people, shares });
  });

  /**
   * 한 판이 끝났다. **연습 판은 여기 안 온다**(브라우저가 안 보낸다) — 지난 문제를 몰아 풀어
   * 비율을 흔들 수 있으면 희귀도가 뜻을 잃는다.
   */
  app.post('/kl/daily-list/answers', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { topic?: unknown; q?: unknown; names?: unknown };
    if (!isValidTopic(body.topic) || !isValidQuestionId(body.q) || !Array.isArray(body.names)) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    if (body.names.length > MAX_NAMES_PER_REPORT) {
      res.status(400).json({ error: 'too_many' });
      return;
    }
    store.report(body.topic, body.q, body.names as string[]);
    res.json({ ok: true });
  });
}
