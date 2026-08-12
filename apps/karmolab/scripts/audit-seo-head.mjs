/**
 * 검색엔진이 페이지 머리에서 읽는 것들이 성한지 (TASK-KL-089)
 *
 * 여기 있는 것들은 **틀리면 사이트가 통째로 검색에서 사라지는데, 화면은 멀쩡해 보인다.**
 * 사람이 눈으로 볼 수 있는 자리가 아니라 한 번 어긋나면 몇 달을 모른 채 지낸다.
 *
 * 보는 것 (도구 페이지 전부 + 목록):
 *  - 대표 주소(canonical)가 있고 자기 자신을 가리키는가 — 다른 곳을 가리키면 그 페이지들은 색인에서 빠진다
 *  - 「색인하지 마라」 표시가 실수로 붙지 않았는가
 *  - 공유 주소(og:url)와 대표 주소가 같은가
 *  - 구조화 데이터가 깨지지 않았고 필요한 종류가 다 있는가 (깨지면 조용히 무시된다)
 *  - 제목·설명이 페이지끼리 겹치지 않는가 (겹치면 한 장만 남고 나머지가 묻힌다)
 *
 * 그림 없이 글자만 받아 보므로 빠르다.
 *
 * 사용: node scripts/audit-seo-head.mjs
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/audit-seo-head.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const HUB = `${BASE}/karmolab/t/`;

const aliasPath = path.join(root, 'data/tool-aliases.json');
const ALIASES = fs.existsSync(aliasPath) ? JSON.parse(fs.readFileSync(aliasPath, 'utf8')).aliases || {} : {};

const problems = [];
const pick = (html, re) => (html.match(re) || [])[1] || '';

const hubRes = await fetch(HUB);
if (!hubRes.ok) {
  console.error(`[audit-seo-head] 목록을 못 받는다 (http ${hubRes.status})`);
  process.exit(1);
}
const hubHtml = await hubRes.text();
const ids = [...new Set([...hubHtml.matchAll(/\/karmolab\/t\/([a-z0-9-]+)\//g)].map((m) => m[1]))];
if (ids.length < 20) {
  console.error(`[audit-seo-head] 목록에서 도구를 ${ids.length}개밖에 못 찾았다 — 목록이 깨졌다`);
  process.exit(1);
}

const titles = new Map();
// 설명 글의 여덟 글자 조각 — 페이지끼리 얼마나 닮았는지 재는 데 쓴다.
const bodies = new Map();
const descs = new Map();

/** 한 페이지의 머리를 훑는다. `expectUrl` 은 대표 주소가 가리켜야 할 곳. */
function inspect(label, html, expectUrl) {
  const canonical = pick(html, /<link rel="canonical" href="([^"]*)"/);
  if (!canonical) problems.push(`${label}: 대표 주소가 없다`);
  else if (canonical !== expectUrl) problems.push(`${label}: 대표 주소가 남을 가리킨다 (${canonical})`);

  if (/<meta[^>]+name="robots"[^>]*noindex/i.test(html)) problems.push(`${label}: 「색인하지 마라」 표시가 붙어 있다`);
  /* 검색 결과에서 그림·문구를 제 크기로 쓰게 허용했는가 (TASK-KL-089).
   * 이 한 줄이 없으면 도구마다 따로 찍어 둔 공유 카드가 작은 썸네일로 나가거나 아예 안 나가고,
   * 두 줄에 맞춰 다듬은 설명도 짧게 잘린다 — 공들인 두 가지가 결과에서 제값을 못 한다. */
  if (!/max-image-preview:large/.test(html)) {
    problems.push(`${label}: 검색 결과에서 큰 그림을 허용하는 표시가 없다 — 공유 카드가 작게 나간다`);
  }

  const ogUrl = pick(html, /property="og:url" content="([^"]*)"/);
  if (ogUrl && canonical && ogUrl !== canonical) problems.push(`${label}: 공유 주소와 대표 주소가 다르다 (${ogUrl})`);

  const title = pick(html, /<title>([^<]*)<\/title>/);
  const desc = pick(html, /<meta name="description" content="([^"]*)"/);
  if (!title) problems.push(`${label}: 제목이 없다`);
  if (!desc) problems.push(`${label}: 설명이 없다`);
  else {
    // 검색 결과에 실리는 설명은 대략 155자까지 보인다. 너무 짧으면 그 자리를 그냥 비워 두는 셈이다.
    // (글자 수는 `&amp;` 같은 표기를 되돌려 센다 — 안 그러면 특수문자 표가 억울하게 걸린다.)
    const plain = desc.replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/g, ' ');
    if (plain.length < 70) problems.push(`${label}: 설명이 ${plain.length}자뿐 — 검색 결과 자리를 비워 둔다`);
    if (plain.length > 170) problems.push(`${label}: 설명이 ${plain.length}자 — 검색 결과에서 잘린다`);
  }
  /* 제목이 검색 결과에서 잘리지 않는가 (TASK-KL-089).
   * 자르는 기준은 글자수가 아니라 **가로 폭**이다. 한글은 영문·숫자보다 두 배 가까이 넓어서
   * 글자수로 재면 한글 많은 제목이 통과하고도 잘린다 — 실제로 9장이 그랬다.
   * 아래 두 값은 브라우저로 실제 폭을 재서 맞춘 어림값(제목 125개 최대 오차 4.3%),
   * 620px 는 흔히 잘리는 600px 에 그 오차만큼 여유를 준 값이다. */
  if (title) {
    const px = [...title].reduce((n, ch) => n + (/[ᄀ-ᇿ　-〿가-힣一-鿿＀-￯]/.test(ch) ? 18 : 10.25), 0);
    if (px > 620) problems.push(`${label}: 제목이 너무 넓다 (약 ${Math.round(px)}px) — 검색 결과에서 잘린다`);
  }
  /* 설명도 폭으로 본다 (TASK-KL-089 — 제목과 같은 부류).
   * 생성기는 뒤에 붙이는 조각을 이미 폭에 맞춰 자른다. 그래도 넘는 것은 **원문 첫 문장 자체가
   * 넓은** 경우다 — 그건 도구 데이터(다른 세션 소유)라 여기서 못 고친다.
   * 그 셋을 그냥 빨간불로 두면 게이트가 늘 빨개서 아무도 안 보게 된다. 그래서 목록으로 빼고
   * **새로 생기는 것만** 잡는다. 목록에 있는데 이제 안 넘치면 그것도 알린다(목록이 썩지 않게). */
  const WIDE_KNOWN = new Set(['crypto', 'imageedit']);
  if (desc) {
    const px = [...desc].reduce((n, ch) => n + (/[ᄀ-ᇿ　-〿가-힣一-鿿＀-￯]/.test(ch) ? 12 : 7.5), 0);
    const id = label.replace(/^도구 /, '');
    const wide = px > 1250;
    if (wide && !WIDE_KNOWN.has(id)) {
      problems.push(`${label}: 설명이 너무 넓다 (약 ${Math.round(px)}px) — 검색 결과 두 줄 밖으로 밀린다`);
    }
    if (!wide && WIDE_KNOWN.has(id)) {
      problems.push(`${label}: 이제 안 넘친다 — 아는 예외 목록(WIDE_KNOWN)에서 빼라`);
    }
  }
  if (title) titles.set(title, [...(titles.get(title) || []), label]);
  if (desc) descs.set(desc, [...(descs.get(desc) || []), label]);

  // 도구가 들어갈 자리를 미리 비워 뒀는가. 없으면 도구가 뜨는 순간 아래 글이 통째로 밀린다
  // (실측 0.86 → 0.02 로 고친 자리다). 새 도구가 기록 없이 들어오면 그 장만 조용히 되돌아간다.
  if (expectUrl.endsWith('/t/') === false && !/#tool-pages\{min-height:\d+px\}/.test(html)) {
    problems.push(`${label}: 도구 자리를 안 비워 뒀다 — 뜰 때 아래 글이 밀린다 (높이를 재야 한다)`);
  }

  // 달리 부르는 이름이 페이지 어디에도 없으면 그 말로 찾는 사람은 영영 못 온다.
  // 적어 둔 이름은 페이지에 드러나 있어야 한다(실측: 처음엔 49% 가 없었다).
  const alias = ALIASES[label];
  if (!alias && !expectUrl.endsWith('/t/')) {
    // 새 도구가 들어오면 아무도 다른 이름을 안 적어 준다 — 그 도구만 조용히 안 걸리게 된다.
    problems.push(`${label}: 달리 부르는 이름이 안 적혀 있다 (data/tool-aliases.json)`);
  }
  if (alias) {
    const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').toLowerCase();
    /* 한 줄 글월로도, 낱말 배열로도 적힌다 — 「도구 사슬」처럼 **띄어쓰기가 든 이름**은
       글월 한 줄로는 못 적으므로 배열이 옳은 쪽이다. 생성기(`gen-tool-pages`)·낱말 뽑기
       (`gen-word-pool`)는 이미 둘 다 받는데 여기만 안 받아 `alias.split is not a function`
       으로 이 검사가 통째로 죽었다(2026-08-12). 모양 하나가 다르다고 검사가 멈추면 안 된다. */
    const list = Array.isArray(alias) ? alias : String(alias).split(/\s+/);
    const missing = list.filter((w) => w && !text.includes(String(w).toLowerCase()));
    if (missing.length) problems.push(`${label}: 달리 부르는 이름이 페이지에 없다 — ${missing.join(', ')}`);
  }

  if (!expectUrl.endsWith('/t/')) {
    const seoStart = html.indexOf('tool-seo');
    const seoEnd = html.indexOf('</main>', seoStart);
    const text = html
      .slice(seoStart, seoEnd > 0 ? seoEnd : seoStart + 9000)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const g = new Set();
    for (let i = 0; i + 8 <= text.length; i += 2) g.add(text.slice(i, i + 8));
    if (g.size) bodies.set(label, g);
  }

  /* 방문 기록기가 실려 있는가 (TASK-KL-089).
   * 블로그 글에는 있는데 도구 쪽에는 없어서, 124장과 첫 화면의 방문이 **하나도 안 세어지고**
   * 있었다. 어느 도구로 사람이 들어오는지 모르면 무엇을 더 만들지도 알 수 없다.
   * 화면에 안 보이는 자리라 빠져도 티가 안 난다 — 그래서 여기서 지킨다. */
  if (!/gc\.zgo\.at\/count\.js/.test(html)) {
    problems.push(`${label}: 방문 기록기가 없다 — 이 페이지로 온 사람이 안 세어진다`);
  }

  const found = new Set();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) problems.push(`${label}: 구조화 데이터가 없다`);
  for (const [, raw] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      problems.push(`${label}: 구조화 데이터가 깨졌다 — ${String(e.message).slice(0, 40)}`);
      continue;
    }
    // 한 덩어리에 여럿을 담는 방식(@graph)과 따로 쓰는 방식을 둘 다 받는다.
    const nodes = [];
    for (const n of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!n['@context']) problems.push(`${label}: 구조화 데이터에 어느 규격인지가 없다`);
      nodes.push(...(n['@graph'] || [n]));
    }
    nodes.forEach((n) => found.add(n['@type']));
  }
  return found;
}

const want = ['SoftwareApplication', 'FAQPage', 'BreadcrumbList'];

for (let i = 0; i < ids.length; i += 8) {
  await Promise.all(
    ids.slice(i, i + 8).map(async (id) => {
      const r = await fetch(`${BASE}/karmolab/t/${id}/`);
      if (!r.ok) {
        problems.push(`${id}: http ${r.status}`);
        return;
      }
      const found = inspect(id, await r.text(), `https://blog.mascari4615.com/karmolab/t/${id}/`);
      const missing = want.filter((t) => !found.has(t));
      if (missing.length) problems.push(`${id}: 구조화 데이터에 ${missing.join('·')} 가 없다`);
    })
  );
}

/* 사이트맵에 도구 페이지가 실려 있고, 언제 바뀌었는지도 적혀 있는가 (TASK-KL-089).
 * 실제로 119장이 **변경일 없이** 실려 있었다 — 검색엔진은 그 값으로 다시 올지를 정하므로
 * 없으면 매번 전부를 훑거나 아예 안 온다. 로컬 사본에는 사이트맵이 없으니 실제 사이트일 때만 본다. */
if (BASE.startsWith('https://')) {
  const sm = await fetch(`${BASE}/sitemap.xml`);
  if (!sm.ok) problems.push(`사이트맵을 못 받는다 (http ${sm.status})`);
  else {
    const xml = await sm.text();
    const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]).filter((b) => /\/karmolab\/t\//.test(b));
    if (blocks.length < ids.length) {
      problems.push(`사이트맵에 도구 페이지가 ${blocks.length}장뿐이다 (지금 ${ids.length}장)`);
    }
    const noDate = blocks.filter((b) => !/<lastmod>/.test(b)).length;
    if (noDate) problems.push(`사이트맵의 도구 페이지 ${noDate}장에 변경일이 없다`);
  }
}

const hubFound = inspect('목록', hubHtml, 'https://blog.mascari4615.com/karmolab/t/');
if (!hubFound.has('CollectionPage')) problems.push('목록: 모음 페이지라는 표시가 없다');

/* 설명 글이 서로 너무 닮으면 검색엔진이 둘 중 하나만 남기고 묻는다. 도구가 늘수록
 * 「PDF → 이미지」와 「이미지 → PDF」처럼 비슷한 짝이 생기기 쉬워, 문구를 베끼면 둘 다 손해다.
 * 여덟 글자 조각이 얼마나 겹치는지로 잰다 — 지금은 가장 닮은 짝도 절반이 안 된다. */
const SIMILAR_MAX = 0.6;
const keys = [...bodies.keys()];
for (let a = 0; a < keys.length; a++) {
  for (let b = a + 1; b < keys.length; b++) {
    const A = bodies.get(keys[a]);
    const B = bodies.get(keys[b]);
    let both = 0;
    for (const g of A) if (B.has(g)) both++;
    const overlap = both / (A.size + B.size - both);
    if (overlap > SIMILAR_MAX) {
      problems.push(`${keys[a]} 와 ${keys[b]} 의 설명이 너무 닮았다 (${Math.round(overlap * 100)}% 겹침)`);
    }
  }
}

for (const [t, who] of titles) if (who.length > 1) problems.push(`제목이 겹친다 (${who.join(', ')}) — ${t.slice(0, 40)}`);
for (const [, who] of descs) if (who.length > 1) problems.push(`설명이 겹친다 (${who.join(', ')})`);

if (problems.length) {
  console.error(`[audit-seo-head] 검색에서 사라질 수 있는 문제 ${problems.length}건 / ${ids.length + 1}장`);
  problems.slice(0, 20).forEach((p) => console.error('  - ' + p));
  if (problems.length > 20) console.error(`  … 외 ${problems.length - 20}건`);
  process.exit(1);
}
console.log(
  `[audit-seo-head] ${ids.length + 1}장 성함 — 대표 주소·구조화 데이터 제자리, 「색인하지 마라」 0장, 제목·설명 겹침 0`
);
