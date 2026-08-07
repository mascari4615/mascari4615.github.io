/**
 * 공유 미리보기 그림 만들기 (TASK-KAR-202).
 *
 * 링크를 디스코드·트위터·카톡에 붙였을 때 펼쳐지는 카드다. 글자만 있는 카드와
 * 그림 있는 카드는 눌리는 비율이 다르다 — 이 게임은 링크로 퍼지는 물건이라 값이 크다.
 *
 *   node scripts/gen-og.mjs        # img/og/*.png 를 다시 만든다
 *
 * 배포(CI)에서는 안 돈다. playwright 브라우저가 없기 때문이다 — 그래서 결과 그림을 커밋한다.
 * 주제나 문구를 바꿨으면 이걸 한 번 돌리고 같이 커밋할 것.
 */
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(app, 'img/og');
const mod = await import(pathToFileURL(join(app, '../karmolab/node_modules/playwright/index.js')).href);
const pw = mod.chromium ? mod : mod.default;

const topics = readdirSync(join(app, 'data'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(app, 'data', f), 'utf8')));

const cards = [
  { name: 'hub', emoji: '🎯', title: '오늘의 하나 맞히기', sub: '한 판 1분 · 매일 자정 새 문제', tail: `${topics.map((t) => t.title).join(' · ')}` },
  ...topics.flatMap((t) => [
    { name: t.id, emoji: t.emoji ?? '🎯', title: `오늘의 ${t.title}`, sub: '속성 힌트로 좁혀 맞히기', tail: `${t.items.length.toLocaleString('ko-KR')}개 중 하나 · 보통 서너 번` },
    {
      name: `${t.id}-silhouette`,
      emoji: t.emoji ?? '🎯',
      title: `${t.title} 실루엣`,
      sub: '까만 그림, 틀릴수록 밝아진다',
      tail: '6번 안에 · 한 판 1분',
      // 초록·노랑 격자는 **속성 판** 그림이다 — 실루엣 카드에 붙이면 다른 놀이를 광고하는 셈이다.
      // 대신 그 판이 실제로 하는 일을 보여 준다: 까만 그림이 조금씩 밝아지는 세 컷.
      // 맨 끝도 다 안 밝힌다(0.7) — 카드가 답을 보여 주는 것처럼 읽히면 안 된다.
      // 같은 그림 세 번이어야 「하나가 밝아진다」로 읽힌다 — 다른 셋을 늘어놓으면 진화 단계처럼 보인다.
      shots: [t.items[0].img, t.items[0].img, t.items[0].img],
    },
  ]),
];

const card = (c) => `<!doctype html><meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    justify-content: center; padding: 84px 96px; gap: 10px;
    background: radial-gradient(1100px 620px at 78% -12%, #1d2938 0%, #0e1117 62%);
    color: #e8ecf3;
    font-family: 'Pretendard', 'Malgun Gothic', 'Segoe UI', sans-serif;
  }
  .em { font-size: 92px; line-height: 1; }
  h1 { font-size: 92px; letter-spacing: -0.035em; line-height: 1.06; }
  .sub { font-size: 38px; color: #a6b0c0; margin-top: 6px; }
  .tail { font-size: 27px; color: #6f7b8d; margin-top: 4px; }
  .grid { display: flex; gap: 11px; margin-top: 40px; }
  .g { width: 62px; height: 62px; border-radius: 11px; }
  .x { background: #333b49; } .y { background: #8a6d1f; } .o { background: #2f7d4f; }
  /* 실루엣 판이 하는 일 그대로 — 왼쪽은 까맣고 오른쪽으로 갈수록 밝아진다. */
  .shots { display: flex; align-items: center; gap: 26px; margin-top: 34px; }
  .shots img { width: 132px; height: 132px; object-fit: contain; }
  .shots img:nth-child(1) { filter: brightness(0); }
  .shots img:nth-child(2) { filter: brightness(0.35) blur(2px); }
  .shots img:nth-child(3) { filter: brightness(0.7) blur(1px); }
  .site { position: absolute; right: 96px; bottom: 68px; font-size: 25px; color: #ffc86b; font-weight: 700; }
</style>
<div class="em">${c.emoji}</div>
<h1>${c.title}</h1>
<div class="sub">${c.sub}</div>
<div class="tail">${c.tail}</div>
${
  c.shots
    ? `<div class="shots">${c.shots.map((src) => `<img src="${src}" alt="">`).join('')}</div>`
    : '<div class="grid"><i class="g x"></i><i class="g y"></i><i class="g x"></i><i class="g o"></i><i class="g o"></i><i class="g x"></i></div>'
}
<div class="site">blog.mascari4615.com/daily</div>`;

mkdirSync(outDir, { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const c of cards) {
  await page.setContent(card(c), { waitUntil: 'networkidle' });
  // 그림이 안 왔는데 그대로 찍으면 **빈 카드**가 조용히 배포된다 — 여기서 세운다.
  const missing = await page.$$eval('img', (els) => els.filter((e) => !e.naturalWidth).map((e) => e.src));
  if (missing.length) throw new Error(`${c.name} 카드의 그림 ${missing.length}장이 안 왔다: ${missing[0]}`);
  await page.screenshot({ path: join(outDir, `${c.name}.png`) });
  console.log(`  img/og/${c.name}.png`);
}
await browser.close();
console.log(`공유 카드 ${cards.length}장`);
