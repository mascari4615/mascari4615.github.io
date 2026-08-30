/**
 * 사이트맵에 실린 장이 구조화 데이터를 다는가 (2026-08-29)
 *
 * 왜 있나. 놀이 장 열한 개에 구조화 데이터가 하나도 없었음
 *   - 검색 결과에서 그냥 파란 줄 하나. 도구 장에는 SoftwareApplication, FAQPage 가 다 있었음
 *   - `audit-seo-head` 가 `/t/` 도구 장만 보는 탓. canonical 사각과 같은 뿌리
 *
 * 무엇을 재나. 사이트맵의 모든 주소에 `application/ld+json` 이 하나라도 있는가
 *   - 깨진 JSON 도 없는 것으로 셈. 검색엔진이 못 읽으면 없는 것과 같음
 *
 * 어떻게 판정하나. **새로 빠지는 것만** 빨강
 *   - 지금 빠진 자리는 `KNOWN` 에 적어 둠. 전부 빨갛게 두면 아무도 안 보는 빨간불이 됨
 *   - `KNOWN` 에 있는데 이제 붙었으면 그것도 알림. 목록이 썩지 않게
 *
 * 사용: `BASE=https://blog.mascari4615.com node scripts/audit-structured-data.mjs`
 */
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const CONCURRENCY = 8;

/* 2026-08-29 실측으로 빠져 있던 자리. 채우면 여기서 뺄 것
   `/play/` 허브는 `apps/play/scripts/build.mjs` 가 굽는다. 놀이 상세와 생성기가 다름.
   `/c/docs/*` 는 사이트맵에서 뺐다 (사용자 결정 2026-08-29). 그래서 이 목록에도 없다 */
const KNOWN = new Set([
  '/about/',
  '/play/',
  '/bot/',
  '/wm/',
  '/works/',
]);

const done = (code, line) => {
  if (code === 0) console.log(line);
  else console.error(line);
  process.exitCode = code;
};

if (!BASE.startsWith('https://')) {
  console.log(`[audit-structured-data] CANNOT-RUN. 실제 사이트가 아니다 (BASE=${BASE}).`);
  process.exit(2);
}

const smRes = await fetch(`${BASE}/sitemap.xml`);
if (!smRes.ok) {
  done(1, `[audit-structured-data] X 사이트맵을 못 읽었다 (http ${smRes.status})`);
} else {
  const urls = [...(await smRes.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length < 10) done(1, `[audit-structured-data] X 사이트맵에서 주소를 ${urls.length}개밖에 못 찾았다`);
  else await sweep(urls);
}

async function sweep(urls) {
  const missing = new Set();
  let checked = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const at = url.replace(BASE, '') || '/';
      let html;
      try {
        const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
        if (!r.ok) continue;
        html = await r.text();
      } catch {
        continue;
      }
      checked += 1;
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      const usable = blocks.some(([, raw]) => {
        try {
          JSON.parse(raw);
          return true;
        } catch {
          return false;
        }
      });
      if (!usable) missing.add(at);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const fresh = [...missing].filter((u) => !KNOWN.has(u)).sort();
  const fixed = [...KNOWN].filter((u) => !missing.has(u)).sort();
  const problems = [
    ...fresh.map((u) => `${u}: 구조화 데이터가 없다. 검색 결과에서 파란 줄 하나가 된다`),
    ...fixed.map((u) => `${u}: 이제 붙었다. 아는 목록(KNOWN)에서 빼라`),
  ];

  if (problems.length) {
    done(1, `[audit-structured-data] X ${checked}장 중 ${problems.length}건.\n  ` + problems.join('\n  '));
  } else {
    done(0, `[audit-structured-data] ${checked}장. 아는 ${KNOWN.size}장 말고는 다 붙어 있다`);
  }
}
