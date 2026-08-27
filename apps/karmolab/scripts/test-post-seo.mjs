/**
 * 글 장·피드의 검색 신호를 본다.
 *
 * 목록 장은 없다 — 목록의 집은 앱 안 커뮤니티 「글」 판이다
 * (change.karmolab-at-root ②). 그래서 여기서 보는 것은 **글 한 장**의 대표 주소와
 * 피드가 가리키는 자리다. 목록 장이 되살아나면 같은 목록이 두 군데가 되고 신호가 갈라진다.
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

/* 목록 장 생성기가 되살아나면 여기서 선다 — 되살릴 때는 이 시험부터 고쳐야 한다. */
const lib = fs.readFileSync(path.join(HERE, 'lib', 'post-page.mjs'), 'utf8');
assert.ok(!/export function (listPage|blogIndexPages)\b/.test(lib), '목록 장 생성기가 되살아났다');

/* 뿌리 index.html 은 앱 셸 자리다 — 블로그가 거기 쓰면 앱을 통째로 덮는다. */
const gen = fs.readFileSync(path.join(HERE, 'gen-post-pages.mjs'), 'utf8');
assert.ok(!/path\.join\(OUT, 'index\.html'\)/.test(gen), '뿌리 index.html 은 앱 셸 자리다');

console.log('[test-post-seo] 글 주소 · 피드 · 목록 장 없음 통과');
