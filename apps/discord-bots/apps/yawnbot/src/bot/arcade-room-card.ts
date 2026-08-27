/**
 * 오락실 방 링크의 얼굴 (TASK-KL-264 D1)
 *
 * 방 링크를 카카오톡·디스코드에 붙이면 「7CCMN」만 떴다. 그런 링크는 아무도 안 누른다 —
 * 무슨 놀이인지, 눌러도 되는 것인지 알 길이 없기 때문이다.
 *
 * 그림은 **이미 다 있다.** 사이트가 놀이 51종의 공유 카드를 구워 두었다
 * (`apps/karmolab/img/og/arcade-<id>.jpg`, 1200×630). 방 코드는 판마다 달라 미리 못 굽지만,
 * 놀이는 51개로 정해져 있으므로 **그림은 놀이별로, 코드는 글자로** 얹으면 끝난다.
 *
 * 왜 그림 주소를 바로 안 주나: 그림만 뜨고 들어올 문이 없다(자랑 카드에서 같은 것을 겪었다).
 * 그래서 그림을 `og:image` 로 걸고 **들어가는 단추**가 있는 한 장을 대신 준다.
 *
 * 왜 여기(봇)인가: 사이트는 정적이라 방마다 다른 카드를 못 만든다. 이 서버는 살아 있다.
 * 대신 **판 자체는 여전히 사이트에서** 돈다 — 이 한 장은 문패일 뿐이라 봇이 죽어도 방 링크
 * (`?r=`)는 그대로 산다.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Application, Request, Response } from 'express';
import { PKG_ROOT } from '../paths';

const SITE = 'https://blog.mascari4615.com';
/**
 * **화면 주소와 그림 주소가 다르다.** 화면은 `/…`(젠킬이 찍어 내는 쪽), 그림은
 * `/apps/karmolab/…`(앱 폴더가 그대로 실리는 쪽)이다. 둘을 같은 뿌리로 적었다가 카드 그림이
 * 전부 404 였다 — 실주소를 찔러 보고서야 알았다(문패는 200 이라 화면상 아무 표도 안 났다).
 */
const ARCADE = `${SITE}/t/arcade/`;
const ASSETS = `${SITE}/apps/karmolab`;

const esc = (value: unknown): string =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * 놀이 이름표. 같은 저장소의 말 묶음에서 읽는다 — 이름을 여기 또 적으면 두 벌이 되고,
 * 놀이 이름을 고치는 날 한쪽만 낡는다. 파일이 없으면 조용히 빈 표(문패는 코드만으로도 선다).
 */
function loadNames(): Record<string, string> {
  try {
    const file = path.join(PKG_ROOT, '..', '..', '..', 'karmolab', 'i18n', 'ko', 'arcade.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const m = /^arcade\.game\.([a-z0-9]+)\.name$/.exec(k);
      if (m) out[m[1]] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function registerArcadeRoomCard(app: Application): void {
  const names = loadNames();

  app.get('/kl/r/:code', (req: Request, res: Response) => {
    /* 주소에 적힌 것이 그대로 카드 문구가 된다 — 아무 글자나 받으면 **남의 말을 우리가 한다.**
       방 코드는 사이트가 만드는 모양(대문자·숫자 4~12)만, 놀이 id 는 우리가 아는 것만 받는다. */
    const code = String(req.params.code ?? '').toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(404).type('html').end('<!doctype html><meta charset="utf-8"><title>없는 방</title>' +
        `<p>그런 방은 없습니다. <a href="${ARCADE}">오락실로</a></p>`);
      return;
    }
    const id = String(req.query.g ?? '');
    const known = Object.prototype.hasOwnProperty.call(names, id);
    const name = known ? names[id] : '';

    const title = name ? `${name} · 방 ${code}` : `오락실 · 방 ${code}`;
    /* 그림이 없는 놀이(또는 id 를 안 준 링크)는 오락실 카드로 — 얼굴 없는 카드보다 낫다. */
    const image = `${ASSETS}/img/og/${known ? `arcade-${id}` : 'arcade'}.jpg`;
    const go = `${ARCADE}?r=${encodeURIComponent(code)}`;

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('html').end(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | KarmoLab</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="KarmoLab 오락실">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="같이 한 판. 자리가 비면 봇이 앉는다.">
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
  <a href="${esc(go)}">들어가기 →</a>
</body></html>`);
  });
}
