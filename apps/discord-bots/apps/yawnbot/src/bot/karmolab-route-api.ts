/**
 * 말로 부리기 라우트 (TASK-KL-196 E).
 *
 * 화면이 **0건일 때만** 여기로 온다. 이름으로 찾아지는 물음까지 모델에 보내면 노트북 한 대가
 * 매 글자마다 두들겨 맞고, 돈도 든다.
 *
 * 못 하면 못 한다고 말한다 — 자격이 없거나(`ready:false`) 못 고르면(`none`) 화면은 지금까지처럼
 * 「전체 목록에서 찾아보기」를 내민다. 억지로 아무 도구나 보내지 않는다.
 *
 * 자기 파일에 사는 이유는 우물·오늘의 판과 같다(`karmolab-api.ts` 통짜 덮어쓰기 사고).
 */
import type { Application, Request, Response } from 'express';
import type { GenerativeTextClient } from 'karmolab-ai/node';
import { tryCreateGenerativeTextFromEnv } from 'karmolab-ai/node';
import {
  MAX_QUERY,
  RouteMemory,
  buildPrompt,
  loadCatalog,
  parsePick,
} from '../services/karmolab-route';
import { classifyVisitor } from '../services/karmolab-visitor-kind';

export function registerRouteRoutes(
  app: Application,
  memory: RouteMemory = new RouteMemory(),
  makeClient: () => GenerativeTextClient | null = () => tryCreateGenerativeTextFromEnv(undefined, { tag: 'kl-route' }),
): void {
  /* 클라이언트는 한 번만 만든다. 매번 만들면 환경을 매번 읽고, 없는 자격을 매번 확인한다. */
  let client: GenerativeTextClient | null | undefined;
  const ai = (): GenerativeTextClient | null => {
    if (client === undefined) client = makeClient();
    return client;
  };

  /** 누구인지 모르게 세는 열쇠 — 주소는 저장하지 않는다(상한을 세는 동안만 메모리에 있다). */
  const whoOf = (req: Request): string =>
    String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

  app.post('/kl/route', async (req: Request, res: Response) => {
    const question = typeof req.body?.q === 'string' ? req.body.q.trim() : '';
    if (!question || question.length > MAX_QUERY) {
      res.status(400).json({ error: 'bad_query', max: MAX_QUERY });
      return;
    }
    // 로봇은 도구를 찾지 않는다. 여기서 안 거르면 크롤러 한 마리가 하루 한도를 먹는다.
    if (classifyVisitor(req.headers['user-agent']) !== 'human') {
      res.json({ ready: false, reason: 'not_human' });
      return;
    }

    // 같은 물음은 한 번만 묻는다 — 「없다」도 기억한다(답 없는 물음이 매번 모델을 부르지 않게).
    const cached = memory.get(question);
    if (cached.hit) {
      res.json({ ready: true, cached: true, pick: cached.pick });
      return;
    }

    const engine = ai();
    if (!engine) {
      // 자격이 없으면 **없다고 말한다**. 조용히 빈 답을 주면 화면은 「못 찾았다」로 읽는다.
      res.json({ ready: false, reason: 'no_ai' });
      return;
    }
    if (!memory.allow(whoOf(req))) {
      res.status(429).json({ ready: false, reason: 'too_often' });
      return;
    }

    const items = await loadCatalog();
    if (!items.length) {
      res.json({ ready: false, reason: 'no_catalog' });
      return;
    }

    try {
      const raw = await engine.generateFromPrompt(buildPrompt(question, items));
      const pick = parsePick(raw, items);
      memory.put(question, pick);
      res.json({ ready: true, cached: false, pick });
    } catch (error) {
      console.error('[kl-route] 도구 고르기 실패:', error);
      res.status(503).json({ ready: false, reason: 'ai_failed' });
    }
  });
}
