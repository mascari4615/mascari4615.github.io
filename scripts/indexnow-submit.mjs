/**
 * 새로 바뀐 주소를 검색엔진에 **알린다** (IndexNow)
 *
 * 왜: 도구 페이지 127장을 만들어 뒀는데 30일 검색 유입이 2건이었다(2026-08-08 실측).
 * 페이지 자체는 성하다 — 제목·설명·구조화 데이터·사이트맵 다 있다. 모자란 건 **알림**이다.
 * 검색엔진이 스스로 다시 올 때까지 기다리면 새 도구 한 장이 몇 주씩 묻힌다.
 *
 * IndexNow = 빙·얀덱스가 함께 쓰는 표준. 한 번 알리면 참여 엔진이 나눠 갖는다.
 * (구글·네이버는 참여 안 한다 — 그쪽은 각자 콘솔에서 사이트맵을 제출해 둬야 한다.)
 *
 * 어떻게: 사이트맵을 읽어 **최근에 바뀐 것만** 골라 보낸다. 안 바뀐 걸 매번 다 보내면
 * 그냥 소음이고, 받는 쪽도 무시한다.
 *
 * 사용:
 *   node scripts/indexnow-submit.mjs              최근 2일 안에 바뀐 주소
 *   DAYS=7 node scripts/indexnow-submit.mjs       기간 바꾸기
 *   ALL=1 node scripts/indexnow-submit.mjs        전부 (첫 등록 때 한 번)
 *   DRY=1 node scripts/indexnow-submit.mjs        보내지 않고 목록만
 */
const HOST = process.env.HOST || 'blog.mascari4615.com';
const KEY = process.env.INDEXNOW_KEY || 'c5e898af83d2834954623defca543f69';
const SITEMAP = `https://${HOST}/sitemap.xml`;
const DAYS = Number(process.env.DAYS || 2);
const ALL = process.env.ALL === '1';
const DRY = process.env.DRY === '1';
const MAX = 10000; // IndexNow 한 번에 허용하는 최대치

const res = await fetch(SITEMAP);
if (!res.ok) {
  console.error(`[indexnow] 사이트맵을 못 읽었다 (http ${res.status}) — ${SITEMAP}`);
  process.exitCode = 1;
} else {
  const xml = await res.text();
  const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map((m) => ({ loc: m[1].trim(), lastmod: m[2] ? Date.parse(m[2]) : NaN }));

  const cutoff = Date.now() - DAYS * 86400000;
  const picked = (ALL ? entries : entries.filter((e) => Number.isFinite(e.lastmod) && e.lastmod >= cutoff))
    .map((e) => e.loc)
    .slice(0, MAX);

  if (!picked.length) {
    console.log(`[indexnow] 최근 ${DAYS}일 안에 바뀐 주소가 없다 — 보낼 것 없음 (전체 ${entries.length}개)`);
  } else if (DRY) {
    console.log(`[indexnow] (보내지 않음) ${picked.length}개\n  ` + picked.slice(0, 20).join('\n  '));
  } else {
    const post = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: picked }),
    });
    // 200·202 = 받았다. 403 = 열쇠 파일을 못 찾았다는 뜻이라 그건 진짜 고장이다.
    if (post.status === 200 || post.status === 202) {
      console.log(`[indexnow] ${picked.length}개 알렸다 (http ${post.status}) — 전체 ${entries.length}개 중 최근 ${DAYS}일`);
    } else {
      console.error(`[indexnow] 거절당했다 (http ${post.status}) — ${(await post.text()).slice(0, 200)}`);
      console.error(`  열쇠 파일이 https://${HOST}/${KEY}.txt 에서 열리는지 먼저 봐라`);
      process.exitCode = 1;
    }
  }
}
