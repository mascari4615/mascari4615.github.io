/**
 * 표 우물 라우트 — **자기 파일에 산다** (TASK-KL-153 / KL-190 ②).
 *
 * 왜 따로 나왔나: 처음엔 `karmolab-api.ts`(2700줄) 안에 있었다. 그런데 그 파일은 여섯 세션이
 * 동시에 고치는 자리라, **낡은 사본을 통째로 덮어쓰는 커밋**이 두 번 내 라우트를 함께 지웠다
 * (2026-08-08: `d4ed12f1` · `72fe2f17`). 타입도 배포도 초록이었고 사람 화면만 404 였다.
 * 파일을 나누면 그 사고가 **구조적으로** 안 난다 — 남이 덮어쓸 파일에 내 줄이 없다.
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` **다음에** 부른다.
 * 순서가 중요하다 — `/kl` CORS·쿠키 미들웨어가 거기서 달리고, Express 는 **먼저 달린 것부터**
 * 태운다. 앞에 끼면 브라우저가 우리 답을 못 읽는다.
 */
import type { Application, Request, Response } from 'express';
import { WELLS, WellStore, wellById, wellOfTheDay, kstDay } from '../services/karmolab-wells';
import { SteamLibrary, LibraryError } from '../services/karmolab-steam-library';
import { WellSnapshotStore, getWellSnapshotStore } from '../services/karmolab-well-snapshots';

export function registerWellRoutes(
  app: Application,
  wells: WellStore = new WellStore(),
  library: SteamLibrary = new SteamLibrary(),
  snapshots: WellSnapshotStore = getWellSnapshotStore(),
): void {
  /**
   * 어떤 우물이 있나.
   *
   * 목록과 표를 나눈 이유: 화면이 「고를 것」을 보여 주는 데 100개짜리 표 다섯 벌이 필요하지
   * 않다. 고른 다음에만 길어 온다.
   *
   * 오늘의 표도 여기서 말한다 — 화면이 날짜 계산을 따로 하면 서버와 하루가 어긋난다.
   */
  app.get('/kl/wells', (_req: Request, res: Response) => {
    const today = wellOfTheDay(kstDay());
    res.json({
      day: kstDay(),
      today: today.id,
      wells: WELLS.map((well) => ({
        id: well.id,
        title: well.title,
        emoji: well.emoji,
        desc: well.desc,
        // 이미 길어 둔 표면 몇 개짜리인지 바로 말해 준다 — 안 길어 왔으면 굳이 지금 가지 않는다.
        items: wells.peek(well.id)?.items.length ?? null,
        // 며칠치 쌓였나 — 「시간여행」을 아직 못 하는 우물은 화면이 그 칸을 안 그린다.
        days: snapshots.days(well.id).length,
      })),
    });
  });

  /**
   * 표 한 벌. **로그인이 필요 없다** — 남의 공개 숫자를 옮겨 주는 일이고, 놀이는 로그인 없이도 된다.
   *
   * 바깥이 죽으면 지난 표를 `stale: true` 와 함께 준다. 화면은 그걸 보고 「몇 시 기준」만 다르게
   * 적으면 된다 — 놀이는 그대로 굴러간다.
   */
  app.get('/kl/wells/pack', async (req: Request, res: Response) => {
    // `today` 로 부르면 오늘의 표 — 화면이 날짜를 따로 세지 않게.
    const asked = req.query.well === 'today' ? wellOfTheDay(kstDay()).id : req.query.well;
    const well = wellById(asked);
    if (!well) {
      res.status(400).json({ error: 'unknown_well', wells: WELLS.map((w) => w.id) });
      return;
    }
    try {
      const pack = await wells.get(well);
      /* 오늘 것이 없으면 한 장 찍어 둔다 (KL-190 ②) — 「지난주보다 뭐가 올라왔나」는 아무 API 도
       * 안 준다. 우리가 쌓아야만 생기고, 오늘 시작 안 하면 한 달 뒤에도 0 이다. 시각을 따로
       * 잡지 않는 이유: 노트북이 자거나 배포로 재시작하면 그날이 통째로 빈다. */
      snapshots.record(pack);
      // 브라우저·터널이 한 번 더 안 나가게. 서버 캐시(6h)와 어긋나도 손해가 없는 숫자다.
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json({ pack });
    } catch {
      // 한 번도 못 길어 왔다 — 없는 표를 지어내지 않는다.
      res.status(503).json({ error: 'well_unavailable' });
    }
  });

  /**
   * 며칠 전보다 많이 움직인 것 (KL-190 ②).
   *
   * 「지금 1등」은 아무나 만든다. **「지난주보다 뭐가 올라왔나」**는 쌓아 둔 사람만 말할 수 있다.
   * 쌓인 날이 이틀도 안 되면 **아무 말도 안 한다**(`ready: false`) — 지어내는 것보다 낫다.
   */
  app.get('/kl/wells/movers', (req: Request, res: Response) => {
    const well = wellById(req.query.well === 'today' ? wellOfTheDay(kstDay()).id : req.query.well);
    if (!well) {
      res.status(400).json({ error: 'unknown_well', wells: WELLS.map((w) => w.id) });
      return;
    }
    const asked = typeof req.query.field === 'string' ? req.query.field : '';
    // 안 준 칸으로 물으면 이 우물의 **첫 숫자 칸**으로 답한다 — 화면이 칸 이름을 몰라도 되게.
    const numeric = wells.peek(well.id)?.fields.filter((f) => f.kind === 'number') ?? [];
    const field = numeric.some((f) => f.key === asked) ? asked : (numeric[0]?.key ?? '');
    const back = Math.min(90, Math.max(1, Number(req.query.back) || 1));

    const got = field ? snapshots.movers(well.id, field, back, 5) : null;
    if (!got) {
      res.json({ well: well.id, field, ready: false, days: snapshots.days(well.id).length });
      return;
    }
    res.json({ well: well.id, field, ready: true, since: got.since, rows: got.rows });
  });

  /**
   * 내 스팀 서재 → 표 (KL-153 C).
   *
   * 우물과 자리를 나눈 이유: 우물은 모두에게 같은 표라 캐시가 하나면 되지만, 서재는 사람마다
   * 다르다. 같은 자리에 끼우면 한 사람의 서재가 캐시에 눌러앉아 남에게 나간다.
   *
   * 열쇠가 없으면 **이 길만** 닫힌다(501) — 우물 다섯은 그대로 돈다. 「고장」이 아니라
   * 「아직 안 켰다」로 말한다.
   */
  app.get('/kl/steam/library', async (req: Request, res: Response) => {
    const who = typeof req.query.who === 'string' ? req.query.who : '';
    try {
      const pack = await library.pack(who);
      res.json({ pack });
    } catch (err) {
      const code = err instanceof LibraryError ? err.code : 'failed';
      // 열쇠 없음만 501(아직 안 켠 기능), 나머지는 사람이 고칠 수 있는 400 이다.
      res.status(code === 'no_key' ? 501 : 400).json({ error: code });
    }
  });
}
