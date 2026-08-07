/**
 * 구독 파일 만들기 — 변경 기록 RSS (TASK-KL-098).
 *
 * 왜 있나: 사이트에 와야만 알 수 있는 소식은, 안 오는 사람에게는 없는 소식이다. 구독 주소가
 * 하나 있으면 사이트를 떠나 있는 동안에도 끈이 이어진다. 블로그는 이미 그렇게 하고 있는데
 * KarmoLab 만 없었다.
 *
 * 무엇을 싣나: `data/changelog.json` 과 **같은 것**을 싣는다 — 화면과 구독이 다른 말을 하면
 * 둘 중 하나는 반드시 거짓이 된다. 그래서 원본은 하나고, 여기는 모양만 바꾼다.
 *
 * 커뮤니티 글은 안 싣는다: 그건 서버(집 노트북)가 들고 있어서 배포 시점에 못 닿으면 통째로
 * 빠진다 — 어제 있던 글이 오늘 사라진 구독 파일은 없느니만 못하다. 커뮤니티는 사이트 안에서
 * 최근 글을 보여 주는 것으로 충분하다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SITE = 'https://blog.mascari4615.com';
const CHANGELOG = path.join(root, 'data/changelog.json');
const OUT = path.join(root, 'changes.xml');

/** 구독기에 몇 개까지 보일지. 오래된 것까지 다 보내면 처음 구독한 사람에게 수십 개가 쏟아진다. */
const LIMIT = 30;

/** XML 안에서 뜻을 갖는 다섯 글자. 안 바꾸면 제목에 `<` 하나로 파일 전체가 깨진다. */
function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 날짜(YYYY-MM-DD) → RSS 가 읽는 모양. 시각은 모르므로 그날 아침(KST)으로 둔다. */
function rfc822(day) {
  const at = new Date(`${day}T09:00:00+09:00`);
  return Number.isNaN(at.getTime()) ? new Date().toUTCString() : at.toUTCString();
}

if (!fs.existsSync(CHANGELOG)) {
  console.warn('[gen-feeds] 변경 기록이 없다 — 구독 파일을 안 만든다');
  process.exit(0);
}

const { entries = [] } = JSON.parse(fs.readFileSync(CHANGELOG, 'utf8'));
if (entries.length === 0) {
  console.warn('[gen-feeds] 실을 변경이 없다 — 있던 파일을 그대로 둔다');
  process.exit(0);
}

const items = entries
  .slice(0, LIMIT)
  .map((entry) => {
    // 글자마다 제 주소가 있어야 구독기가 「이미 본 것」을 가릴 수 있다. 커밋 지문이 그 자리다.
    const link = `${SITE}/karmolab/#status`;
    return `    <item>
      <title>[${xml(entry.label)}] ${xml(entry.text)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="false">karmolab-change-${xml(entry.sha)}</guid>
      <pubDate>${rfc822(entry.date)}</pubDate>
      <description>${xml(entry.text)}</description>
    </item>`;
  })
  .join('\n');

const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KarmoLab — 변경 기록</title>
    <link>${SITE}/karmolab/</link>
    <atom:link href="${SITE}/karmolab/changes.xml" rel="self" type="application/rss+xml"/>
    <description>KarmoLab 에서 새로 생기고 고쳐지고 빨라진 것들</description>
    <language>ko</language>
    <lastBuildDate>${rfc822(entries[0].date)}</lastBuildDate>
${items}
  </channel>
</rss>
`;

// Jekyll 이 이 파일을 건드리지 않게 앞머리를 붙인다 — 안 붙이면 그대로 복사만 되는데,
// 주소를 우리가 정하려면 앞머리가 필요하다.
const withFrontMatter = `---\nlayout: none\npermalink: /karmolab/changes.xml\n---\n${body}`;

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (prev === withFrontMatter) {
  console.log(`[gen-feeds] 변경 없음 (${Math.min(entries.length, LIMIT)}건)`);
  process.exit(0);
}
fs.writeFileSync(OUT, withFrontMatter);
console.log(`[gen-feeds] changes.xml — ${Math.min(entries.length, LIMIT)}건`);
