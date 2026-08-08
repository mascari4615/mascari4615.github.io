/**
 * 도감 라우트 (TASK-KL-196 A) — **읽기만 한다**.
 *
 * 서버는 이미 어느 도구를 열었는지 갖고 있다(계정 발자국 `footprint.tools`, TASK-KL-152).
 * 도감을 위해 새 원장을 만들면 같은 사실이 두 벌이 되고, 둘은 반드시 갈라진다.
 * 그래서 여기는 그 표의 열쇠만 꺼내 준다 — 저장하는 것이 없다.
 *
 * 횟수는 안 내보낸다. 도감은 수집이지 성적표가 아니다 — 「3번 썼음」이 칸에 적히는 순간
 * 적게 쓴 칸이 부끄러운 칸이 된다. 서버가 안 주면 화면이 못 그린다.
 *
 * 자기 파일에 사는 이유는 우물·오늘의 판과 같다: `karmolab-api.ts`(2700줄)는 여러 세션이
 * 동시에 고치는 자리라, 낡은 사본을 덮어쓴 커밋이 남의 라우트를 함께 지운다.
 */
import type { Application, Request, Response } from 'express';
import { getKarmolabAccountStore, type KarmolabAccountStore } from '../services/karmolab-accounts';

export function registerCollectionRoutes(
  app: Application,
  accounts: KarmolabAccountStore = getKarmolabAccountStore(),
): void {
  /**
   * 내 도감. 로그인 안 했으면 **401 이 아니라 빈 목록** — 도감은 로그인 없이도 보이고
   * (그때는 이 브라우저 것만), 여기서 문을 잠그면 「로그인해야 도감이 생긴다」가 된다.
   */
  app.get('/kl/me/collection', (req: Request, res: Response) => {
    const raw = req.headers.cookie;
    let handleId: string | null = null;
    if (raw) {
      for (const part of raw.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === 'kl_session') {
          handleId = accounts.accountForSession(decodeURIComponent(rest.join('=')))?.id ?? null;
        }
      }
    }
    if (!handleId) {
      res.json({ signedIn: false, tools: [] });
      return;
    }
    const footprint = accounts.footprintFor(handleId);
    res.json({ signedIn: true, tools: Object.keys(footprint.tools ?? {}) });
  });
}
