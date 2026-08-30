/**
 * 글 모델 한 벌이 세 갈래를 같은 모양으로 담는가 (change.post-model).
 *
 * 갈래마다 주소 규칙이나 신뢰 등급이 슬며시 갈라지는 것을 막는 검사
 * 사용자 글이 trust self 로 새면 남의 HTML 이 그대로 화면에 노출
 *
 * 사용: node scripts/test-post-model.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = new URL('..', import.meta.url);

async function load(entry) {
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL(entry, root))],
    bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}

const model = await load('src/lib/post-model.ts');
const search = await load('src/search/index.ts');

// 블로그 글은 정적 장으로, 주소가 바뀌면 옛 링크 전멸
const blogRow = {
  slug: 'unity-optimization',
  title: '유니티 최적화',
  date: '2026-01-02T00:00:00+09:00',
  categories: ['게임', '유니티'],
  excerpt: '요약',
};
const blog = model.fromBlogRow(blogRow);
assert.equal(blog.origin, 'blog');
assert.equal(blog.href, '/posts/unity-optimization/');
assert.equal(blog.trust, 'self');
assert.equal(blog.label, '게임 > 유니티');
assert.equal(model.postDate(blog), '2026-01-02');

// 문서는 정적 장 없이 앱 안 주소
const docEntry = { id: 'docs-intro', label: '소개', desc: '문서 페이지', group: 'KarmoLab' };
const doc = model.fromDocEntry(docEntry);
assert.equal(doc.href, '?board=docs&d=docs-intro#community');
assert.equal(doc.trust, 'self');
assert.equal(model.postDate(doc), '');

// 사람이 쓴 글은 언제나 user, 무너지면 남의 HTML 이 화면으로
const communityRow = {
  id: 'abc',
  board: 'free',
  title: null,
  text: '제목 없는 글',
  authorHandle: 'someone',
  createdAt: '2026-03-04T05:06:07Z',
};
const post = model.fromCommunityPost(communityRow, '자유');
assert.equal(post.trust, 'user');
assert.equal(post.origin, 'community');
assert.equal(post.label, '자유');
assert.equal(post.title, '제목 없는 글');
assert.equal(post.href, '?p=abc#community');

// 세 갈래가 같은 열쇠를
for (const p of [blog, doc, post]) {
  for (const key of ['id', 'origin', 'title', 'excerpt', 'label', 'at', 'author', 'trust', 'href']) {
    assert.ok(key in p, `글 모델에 ${key} 가 없다: ${p.origin}`);
  }
}

// 찾기 문서로 옮겨도 주소와 제목이 사는가
const rows = [{
  slug: 'goatcounter',
  title: 'GoatCounter 통계',
  date: '2026-02-01',
  categories: ['블로그'],
  excerpt: '쿠키 없는 방문자 통계',
}];
const system = search.createSearchSystem();
system.register(search.createPostProvider(rows));
const hits = system.search('GoatCounter', 3);
assert.equal(hits.length, 1, '색인에 있는 글이 안 찾힌다');
assert.equal(hits[0].providerId, 'posts');
assert.equal(hits[0].value.href, '/posts/goatcounter/');

// 실제 색인이 있으면 그것으로도 한 번 (빌드 산출이라 없을 수 있음)
const indexPath = fileURLToPath(new URL('data/posts-index.json', root));
if (existsSync(indexPath)) {
  const real = JSON.parse(await readFile(indexPath, 'utf8'));
  const live = search.createSearchSystem();
  live.register(search.createPostProvider(real));
  const first = real[0];
  const found = live.search(first.title, 5);
  assert.ok(found.some((h) => h.value.id === first.slug), `실제 색인의 첫 글이 제 제목으로 안 찾힌다: ${first.title}`);
  console.log(`[post-model] 실제 색인 ${real.length}건으로도 확인`);
} else {
  console.log('[post-model] posts-index.json 없음. 빌드 산출이라 건너뜀 (CANNOT-RUN 아님, 위 검사는 다 돌았다)');
}

// 실행판(```demo)은 trust self 안에서만. 울타리가 풀리면 남의 글이 코드 실행
const richSource = await readFile(fileURLToPath(new URL('src/lib/markdown/rich-view.ts', root)), 'utf8');
const guardAt = richSource.indexOf("trust === 'self'");
const mountAt = richSource.indexOf('mountDemos(');
assert.ok(guardAt > 0, 'rich-view 에 trust self 울타리가 없다');
assert.ok(mountAt > guardAt, '실행판이 trust self 울타리 밖에서 열린다');
const guardBlockEnd = richSource.indexOf(String.fromCharCode(10) + '    }', guardAt);
assert.ok(mountAt < guardBlockEnd, '실행판 호출이 울타리 블록 밖으로 나갔다');

console.log('[post-model] 세 갈래가 한 모양으로 담긴다. 주소, 신뢰 등급, 찾기, 실행판 울타리까지');
