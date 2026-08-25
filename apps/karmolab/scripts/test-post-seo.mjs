/**
 * 블로그 목록 주소의 검색 신호가 한곳으로 모이는지 본다.
 *
 * `/`와 `/posts/`가 같은 목록을 내더라도 검색 대표 주소는 홈(`/`) 하나여야 한다.
 * 레거시 `/posts/`를 사이트맵에 함께 싣으면 크롤러에게 중복 URL을 다시 제출하게 된다.
 */
import assert from 'node:assert/strict';
import { blogIndexPages, feedXml } from './lib/post-page.mjs';

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

const { home, legacyPosts } = blogIndexPages(posts);

assert.match(home, /permalink: \/\n/);
assert.match(home, /<link rel="canonical" href="https:\/\/blog\.mascari4615\.com\/">/);
assert.doesNotMatch(home, /sitemap: false/);

assert.match(legacyPosts, /permalink: \/posts\/\n/);
assert.match(legacyPosts, /<link rel="canonical" href="https:\/\/blog\.mascari4615\.com\/">/);
assert.match(legacyPosts, /sitemap: false/);

assert.match(feedXml(posts), /<channel>[\s\S]*?<link>https:\/\/blog\.mascari4615\.com\/<\/link>/);

console.log('[test-post-seo] 홈 canonical · 레거시 목록 제외 · 피드 주소 통과');
