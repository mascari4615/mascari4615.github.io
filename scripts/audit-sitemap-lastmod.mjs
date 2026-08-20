#!/usr/bin/env node
/**
 * 사이트맵의 모든 주소에 **정직한 「마지막으로 바뀐 날」** 이 있는지 본다 (2026-08-16)
 *
 * 왜 여기서 보나: 날짜가 없으면 두 가지가 조용히 죽는다.
 *   ① 크롤러가 「다시 와 볼지」를 정할 근거가 없다 (구글은 lastmod 를 본다 — 정직했던 이력까지)
 *   ② `scripts/indexnow-submit.mjs` 가 lastmod 로 「최근에 바뀐 것」을 고른다 →
 *      날짜 없는 주소는 **한 번도 알림에 안 실린다**
 * 2026-08-16 실측 — 905개 중 70개(태그 47 · 분류 23)가 그렇게 빠져 있었다. 화면도 게이트도
 * 전부 초록이었다. 장을 새로 만드는 길이 늘 때마다(아카이브·다국어·앱) 다시 뚫린다 — 그래서 잰다.
 *
 * 빌드 결과물을 읽는다 — 사이트맵은 지어져야만 존재하므로 **배포에서 지은 직후**가 유일한 자리다.
 *
 * 씀: node scripts/audit-sitemap-lastmod.mjs <_site 폴더>
 * 나감값: 0 = 전부 날짜 있음 · 1 = 빠진 게 있다 · 2 = 못 쟀다(CANNOT-RUN)
 */
import fs from 'node:fs';
import path from 'node:path';

const siteDir = process.argv[2];
if (siteDir === undefined || siteDir === '') {
  console.error('[audit-sitemap-lastmod] CANNOT-RUN: 볼 폴더를 안 줬다 — 씀: node scripts/audit-sitemap-lastmod.mjs <_site>');
  process.exit(2);
}

const file = path.join(siteDir, 'sitemap.xml');
if (!fs.existsSync(file)) {
  console.error(`[audit-sitemap-lastmod] CANNOT-RUN: 사이트맵이 없다 — ${file}`);
  console.error('  → 지은 결과물 폴더를 줘야 한다 (jekyll build 뒤).');
  process.exit(2);
}

const xml = fs.readFileSync(file, 'utf8');
const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);

/* 주소가 하나도 안 잡히면 「전부 통과」가 아니라 「못 쟀다」다 — 형식이 바뀌었거나 빈 파일이다. */
if (blocks.length === 0) {
  console.error(`[audit-sitemap-lastmod] CANNOT-RUN: <url> 을 하나도 못 찾았다 — ${file} (${xml.length}바이트)`);
  process.exit(2);
}

const loc = (block) => (block.match(/<loc>(.*?)<\/loc>/) ?? [])[1] ?? '(주소 없음)';

/* ★ **「오지 마라」와 「여기 있다」를 같이 말하지 않는다** (2026-08-16).
   robots.txt 가 막아 둔 자리가 사이트맵에 실려 있으면 크롤러는 그걸 「막혔는데 색인됨」으로
   적는다. 실측: `Disallow: /page*` 인데 /page2/ ~ /page10/ 아홉 장이 실려 있었다.
   사이트맵에는 색인시키고 싶은 주소만 넣는다. */
const robotsPath = path.join(siteDir, 'robots.txt');
const 막은자리 = fs.existsSync(robotsPath)
  ? fs
      .readFileSync(robotsPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^Disallow:/i.test(l))
      .map((l) => l.replace(/^Disallow:\s*/i, '').trim())
      .filter((v) => v !== '')
  : [];
const 막혔나 = (url) => {
  let p;
  try {
    p = new URL(url).pathname;
  } catch {
    return false;
  }
  return 막은자리.some((rule) => (rule.endsWith('*') ? p.startsWith(rule.slice(0, -1)) : p.startsWith(rule)));
};

const 날짜없음 = blocks.filter((b) => b.includes('<lastmod>') === false).map(loc);

/* 빌드 시각을 그대로 찍으면 안 하느니만 못하다 — 전부 같은 값이면 그건 신호가 아니다.
   (구글은 못 믿을 lastmod 를 무시한다.) 주소가 여럿인데 날짜가 한 종류뿐이면 의심한다. */
const 날짜들 = new Set(
  blocks.map((b) => (b.match(/<lastmod>(.*?)<\/lastmod>/) ?? [])[1]).filter((d) => d !== undefined)
);

if (날짜없음.length > 0) {
  console.error(`[audit-sitemap-lastmod] 날짜 없는 주소 ${날짜없음.length}개 / 전체 ${blocks.length}개:`);
  for (const url of 날짜없음.slice(0, 20)) console.error(`  ${url}`);
  if (날짜없음.length > 20) console.error(`  … 그 외 ${날짜없음.length - 20}개`);
  console.error('  → 그 주소는 크롤러가 다시 올지 못 정하고, IndexNow 알림에도 안 실린다.');
  console.error('  → 장을 만드는 자리에서 last_modified_at 을 채워라 (apps/blog/_plugins/pages-lastmod-hook.rb 참고).');
  process.exit(1);
}

const 막힌주소 = blocks.map(loc).filter(막혔나);
if (막힌주소.length > 0) {
  console.error(`[audit-sitemap-lastmod] robots.txt 가 막아 둔 주소가 사이트맵에 ${막힌주소.length}개 있다:`);
  for (const url of 막힌주소.slice(0, 10)) console.error(`  ${url}`);
  console.error('  → 「오지 마라」와 「여기 있다」를 같이 말하는 것이다. 둘 중 하나를 고쳐라.');
  process.exit(1);
}

/* ★ **`noindex` 인 장도 사이트맵에 싣지 않는다** (2026-08-20).
   바로 위 robots.txt 검사와 같은 말인데 막는 자리만 다르다 — 그쪽은 「들어오지 마라」,
   이쪽은 「들어와도 되는데 색인은 하지 마라」다. 둘 다 사이트맵에 실릴 이유가 없다.
   실사이트 전수 측정(2026-08-20): 866개 중 **53개가 noindex** 였다 — 글 작업대로 흡수한
   옛 도구의 넘김 장 17개 × 3언어, 그리고 `/karmolab/u/` · `/daily/mine/`.
   장은 성했다(canonical·noindex 다 제대로 달려 있다). 틀린 건 명단이다. 크롤러는 그 장을
   **받아 본 뒤에야** noindex 를 읽는다 — 같은 날 실측으로 90일 크롤 342건 중 HTML 은 9%뿐인
   새 집에서 그 한 번이 아깝다.
   막는 자리 = `apps/blog/_plugins/sitemap-drop-noindex.rb` (장이 스스로 말하면 명단에서 뺀다). */
const 지은파일 = (url) => {
  let p;
  try {
    p = new URL(url).pathname;
  } catch {
    return null;
  }
  const rel = p.replace(/^\//, '');
  const 후보 = [path.join(siteDir, rel), path.join(siteDir, rel, 'index.html')];
  return 후보.find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) ?? null;
};
const ROBOTS_META = /<meta[^>]+name\s*=\s*["']robots["'][^>]*>/i;
const noindex주소 = blocks.map(loc).filter((url) => {
  const f = 지은파일(url);
  if (f === null) return false; /* 못 찾은 것은 여기서 따지지 않는다 — 이 검사의 일이 아니다 */
  const m = fs.readFileSync(f, 'utf8').match(ROBOTS_META);
  return m !== null && /noindex/i.test(m[0]);
});
if (noindex주소.length > 0) {
  console.error(`[audit-sitemap-lastmod] noindex 인 주소가 사이트맵에 ${noindex주소.length}개 있다:`);
  for (const url of noindex주소.slice(0, 10)) console.error(`  ${url}`);
  if (noindex주소.length > 10) console.error(`  … 그 외 ${noindex주소.length - 10}개`);
  console.error('  → 「색인하지 마라」와 「여기부터 봐 달라」를 같이 말하는 것이다.');
  console.error('  → 장이 맞다면 사이트맵에서 빼고(_plugins/sitemap-drop-noindex.rb), 명단이 맞다면 noindex 를 떼라.');
  process.exit(1);
}

if (blocks.length > 1 && 날짜들.size === 1) {
  console.error(`[audit-sitemap-lastmod] 주소 ${blocks.length}개인데 날짜가 한 종류뿐이다 — ${[...날짜들][0]}`);
  console.error('  → 빌드 시각을 찍고 있다는 뜻이다. 못 믿을 lastmod 는 무시당하므로 안 하느니만 못하다.');
  process.exit(1);
}

console.log(`[audit-sitemap-lastmod] 주소 ${blocks.length}개 전부 날짜 있음 · 서로 다른 날짜 ${날짜들.size}종`);
