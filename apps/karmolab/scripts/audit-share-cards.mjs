/**
 * 도구마다 자기 공유 카드를 갖고 있는지 확인 (TASK-KL-089)
 *
 * 카드는 글꼴이 있는 개발 머신에서 찍어 저장소에 넣는다(배포 러너에는 한글 글꼴이 없다).
 * 그래서 도구를 추가하고 `npm run gen:og` 를 안 돌리면 그 도구만 조용히 브랜드 공용 카드로
 * 나간다 — 링크를 공유해도 어떤 도구인지 안 보인다. 빌드가 경고를 내지만 흘려보내기 쉽다.
 *
 * 배포된 페이지를 직접 열어 `og:image` 가 공용 카드를 가리키는 도구를 센다.
 * 배포를 막지는 않는다. 카드를 못 만드는 곳에서 실패시키면 손쓸 방법이 없기 때문이다 —
 * 대신 어떤 도구가 빠졌는지 이름으로 알려 준다.
 *
 * 사용: node scripts/audit-share-cards.mjs
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/audit-share-cards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(seo);

const fallback = [];
const unreachable = [];

for (const id of ids) {
  try {
    const res = await fetch(`${BASE}/karmolab/t/${id}/`, { redirect: 'follow' });
    if (!res.ok) {
      // 아직 배포되지 않은 새 도구는 실패가 아니다 — 다음 배포에 실린다.
      unreachable.push(`${id}(${res.status})`);
      continue;
    }
    const html = await res.text();
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!m) fallback.push(`${id}(카드 지정 없음)`);
    else if (/\/og\/default\.jpg$/.test(m[1])) fallback.push(id);
  } catch (e) {
    unreachable.push(`${id}(${String(e.message).slice(0, 30)})`);
  }
}

if (unreachable.length) {
  console.log(`[audit-share-cards] 아직 못 여는 페이지 ${unreachable.length}개 — 다음 배포 대기로 봅니다: ${unreachable.slice(0, 10).join(', ')}`);
}

if (fallback.length) {
  console.error(`[audit-share-cards] 자기 카드가 없어 공용 카드로 나가는 도구 ${fallback.length}개: ${fallback.join(', ')}`);
  console.error('  → 개발 머신에서 `npm run gen:og` 후 img/og/ 를 커밋하세요.');
  process.exit(1);
}

console.log(`[audit-share-cards] ${ids.length - unreachable.length}개 도구가 저마다 공유 카드를 갖고 있다`);
