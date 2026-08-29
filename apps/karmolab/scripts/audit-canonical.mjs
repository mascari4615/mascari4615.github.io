/**
 * 사이트맵에 실린 장이 저마다 제 대표 주소를 다는가 (2026-08-29)
 *
 * 왜 있나. `/play/worldcup/` 이 뿌리를 대표 주소로 달고 있었음
 *   - 제 장이 아니라 뿌리의 사본 취급. 색인에서 통째로 빠짐
 *   - 그 검색어 수요는 3개월 93.1K 로 우리 최대. 가장 큰 자리가 스스로 닫혀 있었음
 *   - 놀이 상세 열한 장이 전부 같음. 2026-08-27 뿌리 이관 이전부터
 *
 * 왜 안 걸렸나. `audit-seo-head` 는 `/t/` 허브에서 도구 id 를 긁어 도구 장만 봄
 *   - 놀이, 글, `/works/` `/about/` 은 검사 밖. 도구가 멀쩡한 동안 계속 초록
 *
 * 무엇을 재나. 사이트맵의 모든 주소
 *   - 대표 주소가 있는가
 *   - 그것이 제 주소인가
 *   - 두 개 이상 달려 있지 않은가. 둘이면 어느 쪽이 믿길지 우리가 못 정함
 *
 * 사용: `BASE=https://blog.mascari4615.com node scripts/audit-canonical.mjs`
 *   - `LIMIT=30` 으로 앞쪽 몇 장만 (손으로 빨리 볼 때)
 */
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const LIMIT = Number(process.env.LIMIT || 0);
const CONCURRENCY = 8;

const done = (code, line) => {
  if (code === 0) console.log(line);
  else console.error(line);
  process.exitCode = code;
};

if (!BASE.startsWith('https://')) {
  console.log(`[audit-canonical] CANNOT-RUN. 실제 사이트가 아니다 (BASE=${BASE}).`);
  process.exit(2);
}

const smRes = await fetch(`${BASE}/sitemap.xml`);
if (!smRes.ok) {
  done(1, `[audit-canonical] X 사이트맵을 못 읽었다 (http ${smRes.status})`);
} else {
  const xml = await smRes.text();
  let urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (LIMIT > 0) urls = urls.slice(0, LIMIT);
  if (urls.length < 10) {
    done(1, `[audit-canonical] X 사이트맵에서 주소를 ${urls.length}개밖에 못 찾았다. 사이트맵이 깨졌다`);
  } else {
    await sweep(urls);
  }
}

async function sweep(urls) {
  const problems = [];
  let checked = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      let html;
      try {
        const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
        if (!r.ok) {
          problems.push(`${path(url)}: 장을 못 받았다 (http ${r.status})`);
          continue;
        }
        html = await r.text();
      } catch (e) {
        problems.push(`${path(url)}: 장을 못 받았다 (${String(e.message).slice(0, 40)})`);
        continue;
      }
      checked += 1;
      const found = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
      if (found.length === 0) {
        problems.push(`${path(url)}: 대표 주소가 없다`);
      } else if (found.length > 1) {
        problems.push(`${path(url)}: 대표 주소가 ${found.length}개다 (${found.join(' , ')})`);
      } else if (found[0] !== url) {
        problems.push(`${path(url)}: 대표 주소가 남을 가리킨다 (${found[0]})`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (problems.length) {
    problems.sort();
    done(
      1,
      `[audit-canonical] X ${checked}장 중 ${problems.length}건.\n  ` +
        problems.slice(0, 25).join('\n  ') +
        (problems.length > 25 ? `\n  ... 그리고 ${problems.length - 25}건 더` : '')
    );
  } else {
    done(0, `[audit-canonical] ${checked}장 모두 제 대표 주소를 단다`);
  }
}

function path(url) {
  return url.replace(BASE, '') || '/';
}
