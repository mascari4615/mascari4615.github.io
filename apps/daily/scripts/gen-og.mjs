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
  { name: 'hub', emoji: '🎯', title: '오늘의 하나 맞히기', sub: '매일 자정, 새 문제 하나', tail: `${topics.map((t) => t.title).join(' · ')}` },
  ...topics.flatMap((t) => [
    { name: t.id, emoji: t.emoji ?? '🎯', title: `오늘의 ${t.title}`, sub: '속성 힌트로 좁혀 맞히기', tail: `${t.items.length.toLocaleString('ko-KR')}개 중 하나 · 8번 안에` },
    { name: `${t.id}-silhouette`, emoji: t.emoji ?? '🎯', title: `${t.title} 실루엣`, sub: '까만 그림, 틀릴수록 밝아진다', tail: '6번 안에' },
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
  .site { position: absolute; right: 96px; bottom: 68px; font-size: 25px; color: #ffc86b; font-weight: 700; }
</style>
<div class="em">${c.emoji}</div>
<h1>${c.title}</h1>
<div class="sub">${c.sub}</div>
<div class="tail">${c.tail}</div>
<div class="grid"><i class="g x"></i><i class="g y"></i><i class="g x"></i><i class="g o"></i><i class="g o"></i><i class="g x"></i></div>
<div class="site">blog.mascari4615.com/daily</div>`;

mkdirSync(outDir, { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const c of cards) {
  await page.setContent(card(c), { waitUntil: 'load' });
  await page.screenshot({ path: join(outDir, `${c.name}.png`) });
  console.log(`  img/og/${c.name}.png`);
}
await browser.close();
console.log(`공유 카드 ${cards.length}장`);
