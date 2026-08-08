/**
 * 자랑 주소 (TASK-KL-195) — 올린 카드 그림을 **얼굴로 쓰는 한 장**.
 *
 * 왜 그림 주소를 바로 안 주나: 디스코드·카카오·트위터에 그림 주소를 붙이면 그림만 뜬다.
 * 거기서 사이트로 들어올 길이 없다 — 자랑이 유입이 되지 못하고 그림 감상으로 끝난다.
 * 그래서 그림을 `og:image` 로 걸고 **들어올 문**이 있는 한 장을 대신 준다.
 *
 * 저장은 새로 안 만든다. 그림은 이미 있는 올리기 자리(`/kl/uploads` → `/kl/img/<id>`)에
 * 들어가 있고, 여기는 그 id 를 받아 감쌀 뿐이다 — 자랑용 저장소를 따로 두면 같은 그림이
 * 두 군데 쌓인다.
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` 다음에 부른다(`/kl` 미들웨어 뒤).
 */
import type { Application, Request, Response } from 'express';
import { readImage } from '../services/karmolab-uploads';
import { KarmolabBragStore, getKarmolabBragStore } from '../services/karmolab-brag';
import { classifyVisitor } from '../services/karmolab-visitor-kind';

const SITE = 'https://blog.mascari4615.com/karmolab/';

const esc = (value: unknown): string =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 숫자만 받는다. 주소에 적힌 것이 그대로 카드 문구가 되므로, 아무 글자나 받으면 남의 말을 우리가 하게 된다. */
const num = (raw: unknown, max: number): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= max ? Math.floor(value) : 0;
};

export function registerBragRoutes(app: Application, brag: KarmolabBragStore = getKarmolabBragStore()): void {
  /**
   * 카드에서 사이트로 넘어오는 문. **여기를 지나야 넘어온 수가 세어진다** —
   * 자랑 페이지에서 사이트 주소를 바로 걸면 그 방문은 다른 방문과 구분되지 않는다.
   *
   * 사람만 센다. 카드 미리보기를 만드느라 링크를 훑는 메신저 로봇이 「넘어온 사람」이 되면
   * 그 수는 첫날부터 거짓말이 된다.
   */
  app.get('/kl/b/:id/go', (req: Request, res: Response) => {
    if (classifyVisitor(req.headers['user-agent']) === 'human') brag.click();
    res.redirect(302, `${SITE}play/?s=card`);
  });

  /** 카드가 얼마나 데려왔나. 로그인 없이 볼 수 있다 — 우리 수는 우리가 공개한다. */
  app.get('/kl/brag/stats', (_req: Request, res: Response) => {
    res.json({ total: brag.total(), recent: brag.recent(14) });
  });

  app.get('/kl/b/:id', (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    // 없는 그림이면 자랑 한 장을 지어내지 않는다 — 얼굴 없는 카드가 뜨느니 없는 편이 낫다.
    if (!readImage(id)) {
      res.status(404).type('html').end('<!doctype html><meta charset="utf-8"><title>없는 자랑</title>' +
        `<p>이 자랑은 사라졌습니다. <a href="${SITE}">KarmoLab 으로</a></p>`);
      return;
    }
    const done = num(req.query.done, 20);
    const run = num(req.query.run, 3650);
    const title = done ? `오늘의 판 ${done}판 완주${run >= 2 ? ` · ${run}일 연속` : ''}` : '오늘의 판';
    const image = `https://yawnbot.mascari4615.com/kl/img/${encodeURIComponent(id)}`;
    /* 「나도 해보기」는 우리 문(`/go`)을 지나 사이트로 간다 — 카드가 사람을 데려왔는지는
       그 자리에서만 셀 수 있다. 사이트 주소를 바로 걸면 그 방문은 다른 방문과 안 갈린다. */
    const go = `/kl/b/${encodeURIComponent(id)}/go`;

    /* 사람이 펼쳐 본 것만 센다 — 미리보기를 만드는 메신저 로봇은 카드를 「본」 것이 아니다.
       (그래도 카드는 그대로 내준다. 미리보기가 안 뜨면 자랑 자체가 성립하지 않는다.) */
    if (classifyVisitor(req.headers['user-agent']) === 'human') brag.view();

    /* 캐시를 안 건다. 이 한 장은 **세는 자리**이기도 해서, 중간에 누가 대신 내주면 그 방문은
       우리 수에 안 들어온다 — 가볍고(2KB) 드문 페이지라 캐시로 아낄 것이 없다. */
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').end(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | KarmoLab</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="KarmoLab">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="KarmoLab 오늘의 판 — 매일 자정에 새로 열리는 다섯 판.">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style>
  body { margin:0; padding:40px 20px; background:#16151f; color:#f2f2ee;
         font-family:'Noto Sans KR','Malgun Gothic',system-ui,sans-serif; text-align:center; }
  img { width:100%; max-width:720px; height:auto; border-radius:12px; display:block; margin:0 auto 28px; }
  h1 { font-size:22px; font-weight:700; margin:0 0 20px; }
  a { display:inline-block; padding:12px 22px; border-radius:8px; background:#a99bf5; color:#16151f;
      font-weight:700; text-decoration:none; }
</style></head>
<body>
  <img src="${esc(image)}" alt="${esc(title)}">
  <h1>${esc(title)}</h1>
  <a href="${esc(go)}">나도 해보기 →</a>
</body></html>`);
  });
}
