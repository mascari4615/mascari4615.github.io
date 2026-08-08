/**
 * 오늘의 판 라우트 (TASK-KL-194) — **자기 파일에 산다**.
 *
 * `karmolab-api.ts`(2700줄)에 넣지 않는 이유는 우물 라우트와 같다: 여섯 세션이 동시에 고치는
 * 자리라 낡은 사본을 통째로 덮어쓰는 커밋이 남의 라우트를 함께 지운다(2026-08-08 두 번).
 * 타입도 배포도 초록이고 사람 화면만 404 였다.
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` **다음에** 부른다 — `/kl` CORS·쿠키
 * 미들웨어가 거기서 달리고 Express 는 먼저 달린 것부터 태운다.
 */
import type { Application, Request, Response } from 'express';
import {
  COURSE_GAMES,
  KarmolabTodayStore,
  getKarmolabTodayStore,
  kstDay,
  runOf,
} from '../services/karmolab-today';
import { getKarmolabAccountStore, type KarmolabAccountStore } from '../services/karmolab-accounts';
import { classifyVisitor } from '../services/karmolab-visitor-kind';

export function registerTodayRoutes(
  app: Application,
  today: KarmolabTodayStore = getKarmolabTodayStore(),
  accounts: KarmolabAccountStore = getKarmolabAccountStore(),
): void {
  /* 우물 라우트와 같은 이유로 쿠키 읽기를 여기 다시 적는다 — `karmolab-api.ts` 를 import 하면
     이 파일이 그 파일의 덮어쓰기 운명에 다시 묶인다. */
  const whoOf = (req: Request): string | null => {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'kl_session') return accounts.accountForSession(decodeURIComponent(rest.join('=')))?.handle ?? null;
    }
    return null;
  };

  const view = (handle: string | null, at = new Date()) => {
    const day = kstDay(at);
    if (!handle) return { signedIn: false, day, slots: [], run: 0, best: 0 };
    const row = today.of(handle, at);
    return { signedIn: true, day, slots: row.slots, run: runOf(row.days, day), best: row.best };
  };

  /**
   * 오늘의 판 한 통 — 화면이 첫 화면에서 **한 번만** 물어보면 되게.
   *
   * 로그인 안 했어도 200 이다. 오늘의 판은 로그인 없이도 놀 수 있고(코스 판정은 브라우저가
   * 한다), 이 통은 「계정에 붙은 것」만 채워 준다. 로그인 문을 놀이 앞에 세우지 않는다.
   *
   * 오늘 아무도 완주 안 했으면 `finished` 가 0 이다 — 화면은 0 이면 그 줄을 안 그린다.
   * 여기서 1 을 꾸며 내면 옆의 진짜 수까지 못 믿을 것이 된다.
   */
  app.get('/kl/today', (req: Request, res: Response) => {
    const at = new Date();
    const day = kstDay(at);
    res.json({
      day,
      games: COURSE_GAMES,
      me: view(whoOf(req), at),
      crowd: { finished: today.finishedOn(day) },
      ranking: today.ranking(10, at),
    });
  });

  /**
   * 칸 하나를 끝냈다고 알린다. **판정은 브라우저가 한다** — 각 놀이가 이 브라우저에 남긴 것을
   * 읽는 쪽(`play-course.ts`)이 정본이고, 여기는 그 날짜를 계정에 옮겨 적는 자리다.
   *
   * 로그인 안 했으면 401 이 아니라 `signedIn:false` — 놀이는 이미 끝났고, 여기서 빨간 글씨를
   * 띄우면 논 사람만 벌 받는 꼴이다(우물 지문과 같은 규약).
   */
  app.post('/kl/today/done', (req: Request, res: Response) => {
    const handle = whoOf(req);
    if (!handle) {
      res.json({ signedIn: false });
      return;
    }
    const slot = typeof req.body?.slot === 'string' ? req.body.slot : '';
    if (COURSE_GAMES.indexOf(slot) < 0) {
      res.status(400).json({ error: 'unknown_slot', games: COURSE_GAMES });
      return;
    }
    // 사람이 논 판인지부터. 안 거르면 연속일 순위 1등이 로봇이 된다(놀이 원장과 같은 문지기).
    if (classifyVisitor(req.headers['user-agent']) !== 'human') {
      res.json({ signedIn: true, counted: false, ...view(handle) });
      return;
    }
    const at = new Date();
    const before = today.of(handle, at).slots.length;
    today.record(handle, slot, at);
    const me = view(handle, at);
    res.json({
      signedIn: true,
      counted: true,
      // 방금 완주했나 — 화면이 도장을 찍고 자랑 카드를 내미는 순간이다. 이미 완주한 뒤에
      // 또 보낸 경우와 구분해야 같은 축하가 하루에 두 번 뜨지 않는다.
      finishedNow: before < COURSE_GAMES.length && me.slots.length >= COURSE_GAMES.length,
      ...me,
    });
  });
}
