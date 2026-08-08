/**
 * 실황 (TASK-KL-196 G) — 지금 몇 명이 있고, 방금 무엇이 열렸나.
 *
 * 왜 있나: 「사람이 있다」를 말해 주는 것이 첫 화면의 Today/Total 두 칸뿐이다. 그건 누적
 * 숫자라 **지금 살아 있는 곳**으로 안 읽힌다. 접속자 수도 커서(copresence)도 이미 재고
 * 있는데 아무 화면도 그걸 안 보여 준다.
 *
 * **새로 적는 것이 없다.** 접속자 수는 이미 재고 있고, 「방금 열린 도구」는 도구마다 적어
 * 둔 마지막 시각에서 나온다. 실황을 위해 사건을 따로 쌓으면 같은 사실이 두 벌이 된다.
 *
 * 누구인지는 **안 준다.** 「누가 무엇을 열었다」가 아니라 「무엇이 열렸다」다 —
 * 도구 사이트에서 남이 뭘 여는지 이름과 함께 보이는 것은 재미가 아니라 감시다.
 */
import type { Application, Request, Response } from 'express';
import { getKarmolabTraceStore, type KarmolabTraceStore } from '../services/karmolab-traces';

export function registerLiveRoutes(app: Application, traces: KarmolabTraceStore = getKarmolabTraceStore()): void {
  app.get('/kl/live', (_req: Request, res: Response) => {
    const now = new Date();
    /* 짧게만 캐시한다. 실황이라 낡으면 뜻이 없고, 그렇다고 매 요청마다 훑을 만큼
       비싼 것도 아니다(도구 백여 개를 한 번 정렬한다). */
    res.setHeader('Cache-Control', 'public, max-age=10');
    res.json({
      online: traces.presenceCount(now),
      recent: traces.recentlyOpened(8, now),
    });
  });
}
