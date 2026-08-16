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

if (blocks.length > 1 && 날짜들.size === 1) {
  console.error(`[audit-sitemap-lastmod] 주소 ${blocks.length}개인데 날짜가 한 종류뿐이다 — ${[...날짜들][0]}`);
  console.error('  → 빌드 시각을 찍고 있다는 뜻이다. 못 믿을 lastmod 는 무시당하므로 안 하느니만 못하다.');
  process.exit(1);
}

console.log(`[audit-sitemap-lastmod] 주소 ${blocks.length}개 전부 날짜 있음 · 서로 다른 날짜 ${날짜들.size}종`);
