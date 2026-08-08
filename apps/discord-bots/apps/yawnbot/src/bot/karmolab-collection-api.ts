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
import { KarmolabSecretStore, getKarmolabSecretStore, isValidSecretId } from '../services/karmolab-secrets';

export function registerCollectionRoutes(
  app: Application,
  accounts: KarmolabAccountStore = getKarmolabAccountStore(),
  secrets: KarmolabSecretStore = getKarmolabSecretStore(),
): void {
  /** 쿠키에서 계정 id. 우물·오늘의 판과 같은 이유로 여기 다시 적는다(공유 파일에 안 묶인다). */
  const whoOf = (req: Request): string | null => {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'kl_session') {
        return accounts.accountForSession(decodeURIComponent(rest.join('=')))?.id ?? null;
      }
    }
    return null;
  };

  /**
   * 내 도감. 로그인 안 했으면 **401 이 아니라 빈 목록** — 도감은 로그인 없이도 보이고
   * (그때는 이 브라우저 것만), 여기서 문을 잠그면 「로그인해야 도감이 생긴다」가 된다.
   */
  app.get('/kl/me/collection', (req: Request, res: Response) => {
    const account = whoOf(req);
    if (!account) {
      res.json({ signedIn: false, tools: [] });
      return;
    }
    const footprint = accounts.footprintFor(account);
    res.json({ signedIn: true, tools: Object.keys(footprint.tools ?? {}) });
  });

  /**
   * 내가 찾은 숨긴 것. 로그인 안 했으면 빈 목록 — 숨긴 것 찾기는 로그인 없이도 된다
   * (그때는 이 브라우저에만 남는다).
   */
  app.get('/kl/me/secrets', (req: Request, res: Response) => {
    const id = whoOf(req);
    res.json({ signedIn: !!id, found: id ? secrets.of(id) : [] });
  });

  /**
   * 하나 찾았다. **무엇이 있는지는 서버가 안 정한다** — 목록의 정본은 브라우저다.
   * 여기서 이름표를 또 들고 있으면 새 비밀을 심을 때마다 배포를 두 번 해야 한다.
   */
  app.post('/kl/me/secrets', (req: Request, res: Response) => {
    const account = whoOf(req);
    if (!account) {
      res.json({ signedIn: false });
      return;
    }
    const id = req.body?.id;
    if (!isValidSecretId(id)) {
      res.status(400).json({ error: 'bad_id' });
      return;
    }
    res.json({ signedIn: true, found: secrets.found(account, id) });
  });

  /** 몇 명이 찾았나 — 아무도 못 찾은 것은 줄이 없다. 로그인 없이 볼 수 있다. */
  app.get('/kl/secrets/tally', (_req: Request, res: Response) => {
    res.json({ tally: secrets.tally() });
  });
}
