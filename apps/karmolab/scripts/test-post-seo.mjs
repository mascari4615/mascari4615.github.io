/**
 * 글 장, 목록 장, 피드의 검색 신호
 *
 * 2026-09-03 뜻 뒤집힘. 전: **목록 장 없음** (같은 목록이 두 군데면 신호가 갈린다,
 * change.karmolab-at-root ②). 실측은 반대:
 *   - `/posts/` 404, 글 329편으로 가는 `<a>` 사이트 전체에 0. 사이트맵에만 있었음
 *   - GSC 판정 발견됨, 크롤 안 감. 링크 있는 `/t/` 55장에는 크롤 옴
 * 지금 지키는 것은 **목록 장 존재와 공개 글 전수 링크**
 * 사람 화면의 목록은 그대로 커뮤니티 게시판. 이 장은 크롤러가 걸어 들어오는 길
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedXml } from './lib/post-page.mjs';

const posts = [
    {
        slug: 'example',
        title: '예시 글',
        date: '2026-08-26T00:00:00+09:00',
        lastmod: '2026-08-26T00:00:00+09:00',
        categories: ['기록'],
        excerpt: '검색 대표 주소를 검증하는 예시 글입니다.',
    },
];

const feed = feedXml(posts);
assert.match(feed, /<item>[\s\S]*?<link>https:\/\/blog\.mascari4615\.com\/posts\/example\/<\/link>/, '글 주소 = /posts/<slug>/');

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* 뿌리 index.html 은 앱 셸 자리다. 블로그가 거기 쓰면 앱을 통째로 덮는다. */
const gen = fs.readFileSync(path.join(HERE, 'gen-post-pages.mjs'), 'utf8');
assert.ok(!/path\.join\(OUT, 'index\.html'\)/.test(gen), '뿌리 index.html 은 앱 셸 자리다');

/* 목록 장을 굽는 자리와, 굽는 순간 링크 수를 세는 자리. 둘 다 없으면 이 장의 존재 이유가 없다. */
assert.ok(/path\.join\(OUT, 'posts', 'index\.html'\)/.test(gen), '`/posts/` 목록 장을 안 굽는다');
assert.ok(/목록 링크 \$\{linked\} 이 공개 글/.test(gen), '목록 장이 링크 수를 안 센다');

/* 산출물이 있으면 그것으로 잰다 (`npm run gen:post-pages` 뒤). 없으면 위 소스 검사까지가 이 시험의 몫. */
const hub = path.join(path.dirname(HERE), 'content', 'pages', 'posts', 'index.html');
if (fs.existsSync(hub)) {
    const html = fs.readFileSync(hub, 'utf8');
    const index = JSON.parse(fs.readFileSync(path.join(path.dirname(HERE), 'data', 'posts-index.json'), 'utf8'));
    const linked = new Set([...html.matchAll(/<a href="\/posts\/([^"/]+)\/">/g)].map((m) => m[1]));
    assert.equal(linked.size, index.length, `목록 장 링크 ${linked.size} 이 공개 글 ${index.length} 과 다르다`);
    for (const post of index) assert.ok(linked.has(post.slug), `목록 장에 안 실린 글: ${post.slug}`);
    assert.match(html, /<link rel="canonical" href="https:\/\/blog\.mascari4615\.com\/posts\/">/, '목록 장 대표 주소가 제 주소가 아니다');
    assert.ok(!/<meta name="robots"[^>]*noindex/.test(html), '목록 장이 noindex 다');
    console.log(`[test-post-seo] 글 주소, 피드, 목록 장 링크 ${linked.size}건 통과`);
} else {
    console.log('[test-post-seo] 글 주소, 피드, 목록 장 생성기 통과 (산출물 없음. gen:post-pages 뒤 전수)');
}
