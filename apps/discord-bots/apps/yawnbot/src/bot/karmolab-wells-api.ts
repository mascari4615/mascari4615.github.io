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
import { quizFor } from '../services/karmolab-well-quiz';
import { TasteStore, getTasteStore, favorites } from '../services/karmolab-taste';
import { getKarmolabAccountStore, type KarmolabAccountStore } from '../services/karmolab-accounts';

export function registerWellRoutes(
  app: Application,
  wells: WellStore = new WellStore(),
  library: SteamLibrary = new SteamLibrary(),
  snapshots: WellSnapshotStore = getWellSnapshotStore(),
  taste: TasteStore = getTasteStore(),
  accounts: KarmolabAccountStore = getKarmolabAccountStore(),
): void {
  /* 로그인한 사람 이름. 쿠키 읽기를 여기서 다시 적는 이유 = `karmolab-api.ts` 안의
   * 같은 함수가 export 가 아니고, 그 파일을 import 하면 이 파일이 다시 그 파일 운명에 묶인다
   * (덮어쓰기 사고가 여기까지 번진다). 여덟 줄이면 독립이 산다. */
  const whoOf = (req: Request): string | null => {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'kl_session') return accounts.accountForSession(decodeURIComponent(rest.join('=')))?.handle ?? null;
    }
    return null;
  };

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
   * 표 섞기 — 두 우물을 한 표로 (KL-190 ⑤, 서브 콘텐츠).
   *
   * 「애니 vs 게임」처럼 원래 견줄 수 없는 것들을 한 판에 올린다. 숫자로는 못 겨루므로
   * **그림이 있는 것만** 담는다 — 이건 월드컵·티어표용 표다(정답이 없는 놀이).
   * 숫자 칸을 섞지 않는 이유: 「접속자 7천」과 「별점 9.2」를 한 칸에 놓으면 거짓이 된다.
   */
  app.get('/kl/wells/mix', async (req: Request, res: Response) => {
    const a = wellById(req.query.a);
    const b = wellById(req.query.b);
    if (!a || !b || a.id === b.id) {
      res.status(400).json({ error: 'need_two_wells', wells: WELLS.map((w) => w.id) });
      return;
    }
    try {
      const [packA, packB] = await Promise.all([wells.get(a), wells.get(b)]);
      // 한쪽이 크면 그쪽 항목만 잔뜩 나온다 — 같은 수로 잘라 **반반**으로 만든다.
      const each = Math.min(64, packA.items.length, packB.items.length);
      const pick = (items: typeof packA.items, from: string) =>
        items
          .filter((i) => typeof i.img === 'string' && i.img)
          .slice(0, each)
          // 어디서 온 항목인지 남긴다 — 「내가 고른 건 결국 게임이었다」가 이 놀이의 재미다.
          .map((i) => ({ name: i.name, img: i.img, from }));
      const items = [...pick(packA.items, packA.title), ...pick(packB.items, packB.title)];
      if (items.length < 8) {
        res.status(409).json({ error: 'too_few_images' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json({
        pack: {
          title: `${packA.title} vs ${packB.title}`,
          emoji: '🥊',
          fields: [{ key: 'from', label: '어디서 왔나', kind: 'category' }],
          items,
          fetchedAt: new Date().toISOString(),
          stale: packA.stale || packB.stale,
          // 섞은 표도 순위판이 갈리게 — 두 우물 이름을 **정렬해서** 붙인다(a·b 순서가 달라도 같은 표).
          well: `mix:${[a.id, b.id].sort().join('+')}`,
        },
      });
    } catch {
      res.status(503).json({ error: 'well_unavailable' });
    }
  });

  /**
   * 오늘의 문제 — 우물에서 자동으로 뽑는다 (KL-190 ③).
   *
   * 손으로 적어 둔 문제는 다 풀면 끝이다. 우물은 매일 새 숫자를 길어 오므로 여기서 뽑으면
   * **사람 손 없이** 는다. 날짜로 정하므로 같은 날이면 누구에게나 같은 문제다 —
   * 무작위로 뽑으면 틀렸을 때 새로고침해서 다시 뽑으면 그만이 된다.
   *
   * 정답 글자는 안 보낸다(지문만). 못 만드는 표면 `ready:false` — 억지로 만들지 않는다.
   */
  app.get('/kl/wells/quiz', async (req: Request, res: Response) => {
    const well = wellById(req.query.well === 'today' || !req.query.well ? wellOfTheDay(kstDay()).id : req.query.well);
    if (!well) {
      res.status(400).json({ error: 'unknown_well', wells: WELLS.map((w) => w.id) });
      return;
    }
    try {
      const pack = await wells.get(well);
      snapshots.record(pack);
      const quiz = quizFor(pack, kstDay());
      if (!quiz) {
        res.json({ ready: false, well: well.id, reason: 'no_number_field' });
        return;
      }
      res.json({ ready: true, quiz });
    } catch {
      res.status(503).json({ error: 'well_unavailable' });
    }
  });

  /**
   * 한 판의 선택을 취향 지문에 더한다 (KL-190 ④).
   *
   * 로그인해야 한다 — 지문은 **누구의 것인지**가 전부다. 안 했으면 조용히 넘긴다(401 이 아니라
   * `signedIn:false`): 놀이는 끝났고, 여기서 빨간 글씨를 띄우면 논 사람만 벌 받는 꼴이다.
   */
  app.post('/kl/taste', (req: Request, res: Response) => {
    const who = whoOf(req);
    if (!who) {
      res.json({ signedIn: false });
      return;
    }
    const variant = typeof req.body?.variant === 'string' ? req.body.variant.slice(0, 120) : '';
    const matches = Array.isArray(req.body?.matches) ? req.body.matches.slice(0, 500) : [];
    if (!variant || !matches.length) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    const row = taste.record(who, variant, matches);
    const neighbours = taste.neighbours(who, variant);
    res.json({ signedIn: true, favorites: favorites(row), ...neighbours });
  });

  /** 내 지문 — 이 표에서 내가 뭘 골랐나, 누구와 닮았나. */
  app.get('/kl/taste/me', (req: Request, res: Response) => {
    const who = whoOf(req);
    if (!who) {
      res.json({ signedIn: false });
      return;
    }
    const variant = typeof req.query.variant === 'string' ? req.query.variant : '';
    if (!variant) {
      res.json({ signedIn: true, variants: taste.variants(who) });
      return;
    }
    res.json({
      signedIn: true,
      variant,
      favorites: favorites(taste.fingerprint(who, variant)),
      ...taste.neighbours(who, variant),
    });
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
