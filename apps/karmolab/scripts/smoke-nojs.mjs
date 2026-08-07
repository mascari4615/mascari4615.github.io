/**
 * 자바스크립트 없이도 읽히는지 확인 (TASK-KL-089)
 *
 * 도구 화면 자체는 자바스크립트로 그린다. 그런데 검색 크롤러 중에는 스크립트를 실행하지 않는
 * 것이 있고(국내 검색엔진 일부가 그렇다), 그런 눈에는 스크립트로 그린 것이 통째로 안 보인다.
 * 지금은 설명·쓰는 법·FAQ·다른 도구 링크가 **정적으로** 박혀 있어 스크립트 없이도 읽힌다 —
 * 그 성질이 깨지면 검색 유입이 조용히 사라지므로 여기서 잠가 둔다.
 *
 * 두 겹으로 본다.
 *  ① 표본 여섯 장은 **실제 브라우저에서 스크립트를 끄고** 연다 — 틀이 깨졌는지 보는 눈.
 *  ② 나머지를 포함한 **모든 페이지**는 받은 글자 그대로 훑는다 — 틀은 멀쩡한데 특정 도구만
 *     설명이 비어 나가는 경우를 잡는다. 표본만 보면 한 장이 얇아도 걸릴 확률이 6/101 이다.
 *
 * 사용: node scripts/smoke-nojs.mjs
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/smoke-nojs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;

// 서로 다른 갈래에서 골고루 (없으면 있는 것 중 앞에서 채운다)
const wanted = ['loan', 'charcount', 'qrgen', 'base64', 'imageedit', 'pdftool'];
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...new Set([...wanted.filter((id) => seo[id]), ...Object.keys(seo)])].slice(0, 6);

const MIN_TEXT = 300; // 설명·쓰는 법·FAQ 가 살아 있으면 이보다 훨씬 길다
const MIN_LINKS = 4; // 다른 도구로 건너갈 길

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
const failures = [];

for (const id of ids) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const r = await page.evaluate(() => {
      const seoEl = document.querySelector('.tool-seo');
      return {
        h1: document.querySelector('h1')?.textContent.trim() || '',
        text: seoEl ? seoEl.textContent.replace(/\s+/g, ' ').trim().length : 0,
        headings: document.querySelectorAll('.tool-seo h2').length,
        links: document.querySelectorAll('a[href^="/karmolab/t/"]').length
      };
    });
    const why = [];
    if (res.status() !== 200) why.push(`http ${res.status()}`);
    if (!r.h1) why.push('제목이 없다');
    if (r.text < MIN_TEXT) why.push(`설명이 ${r.text}자뿐 (기준 ${MIN_TEXT})`);
    if (r.headings < 3) why.push(`소제목이 ${r.headings}개뿐`);
    if (r.links < MIN_LINKS) why.push(`다른 도구 링크가 ${r.links}개뿐 (기준 ${MIN_LINKS})`);
    if (why.length) failures.push(`${id}: ${why.join(' · ')}`);
    process.stdout.write(why.length ? 'x' : '.');
  } catch (e) {
    failures.push(`${id}: 여는 중 실패 — ${String(e.message).slice(0, 60)}`);
    process.stdout.write('x');
  }
  await page.close();
}
process.stdout.write('\n');
await browser.close();

/* ── 앱 첫 화면 ─────────────────────────────────────
 * 블로그의 모든 글이 이 페이지를 건다. 그런데 스크립트를 안 돌리는 크롤러 눈에는 87자밖에
 * 안 보였고 도구로 가는 길도 하나뿐이었다 — 거기서 흐름이 멎는다. 지금은 안내를 넣어 두었고,
 * 그 안내는 사람 화면에 안 보이므로 사라져도 아무도 모른다. 그래서 여기서 지킨다.
 * (로컬 사본에는 이 주소가 없을 수 있어, 없으면 건너뛴다.) */
let rootNote = '첫 화면 이 환경엔 사본이 없어 건너뜀';
{
  const r = await fetch(`${BASE}/karmolab/`);
  if (r.ok) {
    const html = await r.text();
    const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
    const text = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
    const toolLinks = (body.match(/href="\/karmolab\/t\//g) || []).length;
    const why = [];
    if (text.length < 300) why.push(`글이 ${text.length}자뿐`);
    if (toolLinks < 4) why.push(`도구로 가는 길이 ${toolLinks}개뿐`);
    if (why.length) failures.push(`첫 화면: ${why.join(' · ')}`);
    else rootNote = `첫 화면도 글 ${text.length}자·도구 링크 ${toolLinks}개`;
  }
}

/* ── 전수 훑기 ──────────────────────────────────────
 * 브라우저 없이 받은 글자만 본다. 목록에 걸린 도구를 전부 훑으므로 한 장만 얇아도 걸린다. */
let sweptCount = 0;
if (!process.argv.slice(2).length) {
  const hub = await fetch(`${BASE}/karmolab/t/`);
  const allIds = [...new Set([...(await hub.text()).matchAll(/\/karmolab\/t\/([a-z0-9-]+)\//g)].map((m) => m[1]))];

  const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const sweep = async (id) => {
    const r = await fetch(`${BASE}/karmolab/t/${id}/`);
    if (!r.ok) return `${id}: http ${r.status}`;
    const html = await r.text();
    // 검색 크롤러가 보는 것 = 이미 박혀 있는 글자다. 스크립트 안에 든 글자는 세면 안 된다.
    const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
    const why = [];
    const text = stripTags(body).length;
    const links = (body.match(/href="\/karmolab\/t\//g) || []).length;
    if (text < MIN_TEXT) why.push(`설명이 ${text}자뿐`);
    if (links < MIN_LINKS) why.push(`다른 도구 링크가 ${links}개뿐`);
    return why.length ? `${id}: ${why.join(' · ')}` : null;
  };

  for (let i = 0; i < allIds.length; i += 8) {
    const found = (await Promise.all(allIds.slice(i, i + 8).map(sweep))).filter(Boolean);
    failures.push(...found);
  }
  sweptCount = allIds.length;
}

if (failures.length) {
  console.error(
    `[smoke-nojs] 스크립트 없이 읽히지 않는 페이지 ${failures.length}건 (표본 ${ids.length}장 + 전수 ${sweptCount}장을 봤다)`
  );
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(
  `[smoke-nojs] 표본 ${ids.length}장을 스크립트 끄고 열어 확인 · 나머지 포함 ${sweptCount}장 전부 설명·내부 링크를 갖는다 · ${rootNote}`
);
