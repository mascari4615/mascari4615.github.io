/**
 * 작업물 전시 목록이 **한 장도 안 흘리는지** 본다.
 *
 * 회귀 근거: 컷오버 뒤 라이브 `/works/` 가 46장 중 43장만 냈다 (2026-08-27 실측).
 * 흘린 모양 둘 — 따옴표 붙은 url · 글이 아닌 바깥 링크. 둘 다 아래에 박아 둔다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorksYml, slugOf, buildWorks } from './lib/works-list.mjs';

const YML = `- url: /posts/plain/
  tags: [Programming]
  date: '2411~'

- url: "/posts/quoted/"
  tags: [GameDev, Art]
  date: "2025/02/26"

- url: /posts/missing/
  tags: []
  date:

- url: https://youtu.be/abc
  title: 바깥 링크 제목
  image: https://img.youtube.com/vi/abc/mqdefault.jpg
  description: 설명 한 줄
  tags: [Art, Programming]
  date:

- url: https://example.com/no-title
  tags: []
  date:
`;

const entries = parseWorksYml(YML);
assert.equal(entries.length, 5, '항목 수');

// 따옴표 — 붙어도 안 붙어도 같은 slug 로 읽힌다.
assert.equal(slugOf(entries[0].url), 'plain');
assert.equal(slugOf(entries[1].url), 'quoted');
assert.equal(slugOf(entries[3].url), null, '바깥 링크는 slug 없음');

assert.deepEqual(entries[1].tags, ['GameDev', 'Art'], 'tags 파싱');
assert.equal(entries[1].date, '2025/02/26', 'date 따옴표 벗김');
assert.equal(entries[3].title, '바깥 링크 제목');
assert.equal(entries[3].description, '설명 한 줄');

const bySlug = new Map([
    ['plain', { title: '민무늬', image: '/a.png' }],
    ['quoted', { title: '따옴표', image: '/b.png' }],
]);
const { works, skipped } = buildWorks(entries, bySlug);

assert.deepEqual(
    works.map((w) => w.url),
    ['/posts/plain/', '/posts/quoted/', 'https://youtu.be/abc'],
    '카드 3장 — 순서는 정본 그대로',
);
assert.equal(works[1].title, '따옴표', '제목은 글에서 가져온다');
assert.equal(works[2].slug, null, '바깥 링크는 slug 없이 나간다');
assert.deepEqual(skipped, ['missing', 'https://example.com/no-title'], '글 없음 · 제목 없음만 뺀다');

// 진짜 정본도 통째로 읽어 본다 — 흘리는 게 있으면 여기서 걸린다.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const real = path.join(HERE, '..', '..', 'blog', '_data', 'works.yml');
if (fs.existsSync(real)) {
    const list = parseWorksYml(fs.readFileSync(real, 'utf8'));
    /* 문턱은 45 — 「다른 프로젝트도 보고 싶다면」 카드(`/posts/works/`)를 뺐다.
       그 글의 소품 목록은 이제 작업물 장이 직접 읽어 편다(`lib/works-minor.mjs`). */
    assert.ok(list.length >= 45, `정본 항목 ${list.length}건 — 45건 밑으로 줄면 파서가 흘린 것`);
    assert.ok(
        list.every((e) => e.url && !/^["']/.test(e.url)),
        'url 에 따옴표가 남으면 안 된다',
    );
}

console.log(`[test-works-list] ok — 항목 ${entries.length} · 카드 ${works.length} · 뺀 것 ${skipped.length}`);
