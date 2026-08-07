/**
 * 커뮤니티 글의 정적 페이지 찍기 (TASK-KL-098).
 *
 * 왜 있나: 커뮤니티 글은 화면이 스크립트로 그린다. 검색엔진은 그 화면을 못 읽으므로 **글이
 * 하나도 색인되지 않는다** — 도구는 검색으로 사람이 오는데 커뮤니티는 올 길이 없었다.
 *
 * 어떻게: 배포할 때 서버에서 글을 받아 `/karmolab/c/<글id>/` 에 **읽을 수 있는 HTML**로 찍는다.
 * 도구 상세(`/karmolab/t/<도구id>/`)와 같은 규약이라 새 개념이 아니다.
 * 사람이 그 주소로 들어오면 커뮤니티 화면으로 이어 주고, 크롤러는 본문을 그대로 읽는다.
 *
 * 성질 둘:
 *  - **서버에 못 닿으면 그냥 건너뛴다.** 노트북이 꺼져 있다고 사이트 배포가 통째로 막히면 안 된다.
 *    대신 조용히 넘어가지 않고 몇 장을 못 찍었는지 남긴다.
 *  - 여기서 찍은 것은 **그 순간의 사본**이다. 새 답글은 다음 배포 때 반영된다 (화면은 늘 최신).
 *
 * 사용: node scripts/gen-community-pages.mjs [--out ../blog/karmolab/c]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const API = process.env.KARMOLAB_API_BASE || 'https://yawnbot.mascari4615.com';
const SITE = 'https://blog.mascari4615.com';

const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(root, '..', 'blog', 'karmolab', 'c');

/** 몇 장까지 찍을지. 글이 많아져도 배포가 안 길어지게. */
const MAX_PAGES = 300;

/**
 * 구조 설명(JSON-LD) 을 안전하게 찍는다.
 *
 * `JSON.stringify` 는 `<` 를 안 바꾼다. 글 제목에 `</script>` 가 들어 있으면 그 자리에서
 * 스크립트 태그가 끊기고, 뒤에 오는 것이 진짜 스크립트로 실행된다.
 * 시험이 이걸 잡았다 — 눈으로는 절대 안 보인다.
 */
function jsonLd(value) {
  // 태그를 끊는 글자를 여섯 글자 표기로 바꾼다. 여기에 진짜 꺾쇠를 쓰면 같은 글자라
  // 아무것도 안 바뀌고 태그가 그대로 끊긴다 — 실제로 한 번 그렇게 새어 나갔다.
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`http ${response.status}`);
  return response.json();
}

/** 크롤러가 읽을 한 장. 화면 흉내를 내지 않는다 — 글이 읽히는 것이 전부다. */
function page(post, galleryLabel) {
  const title = post.title || post.text.slice(0, 40);
  const appUrl = `/karmolab/?p=${encodeURIComponent(post.id)}#community`;
  const canonical = `${SITE}/karmolab/c/${post.id}/`;
  const desc = post.text.replace(/\s+/g, ' ').trim().slice(0, 150);

  const replies = (post.replies ?? [])
    .map(
      (r) =>
        `<li><b>@${escapeHtml(r.authorHandle)}</b> <time datetime="${escapeHtml(r.createdAt)}">${escapeHtml(
          r.createdAt.slice(0, 10),
        )}</time><p>${escapeHtml(r.text)}</p></li>`,
    )
    .join('\n');

  return `---
layout: none
permalink: /karmolab/c/${post.id}/
---
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)} — KarmoLab 커뮤니티</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="ko_KR">
<link rel="icon" href="/apps/karmolab/img/favicon.ico">
<script type="application/ld+json">
${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'DiscussionForumPosting',
  headline: title,
  articleBody: post.text,
  datePublished: post.createdAt,
  dateModified: post.bumpedAt,
  author: { '@type': 'Person', name: post.authorHandle, url: `${SITE}/karmolab/u/?h=${encodeURIComponent(post.authorHandle)}` },
  url: canonical,
  commentCount: post.replyCount ?? 0,
  interactionStatistic: {
    '@type': 'InteractionCounter',
    interactionType: 'https://schema.org/LikeAction',
    userInteractionCount: post.likes ?? 0,
  },
})}
</script>
<style>
  body { margin:0; padding:40px 20px; background:#0f0f12; color:#e8e8ef; line-height:1.7;
    font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
  main { max-width:720px; margin:0 auto; }
  a { color:#b9a2ff; }
  h1 { font-size:24px; line-height:1.4; margin:0 0 8px; }
  .meta { font-size:13px; color:#a0a4b4; margin-bottom:22px; }
  .body { white-space:pre-wrap; word-break:break-word; }
  ul { list-style:none; padding:0; margin:26px 0 0; }
  li { border-top:1px solid rgba(255,255,255,.09); padding:12px 0; }
  li p { margin:4px 0 0; white-space:pre-wrap; }
  time { color:#767b8c; font-size:12px; margin-left:6px; }
  .go { display:inline-block; margin-top:26px; padding:9px 16px; border:1px solid #b9a2ff;
    border-radius:8px; color:#b9a2ff; text-decoration:none; }
</style>
</head>
<body>
  <main>
    <p class="meta"><a href="/karmolab/">KarmoLab</a> · ${escapeHtml(galleryLabel)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">@${escapeHtml(post.authorHandle)} ·
      <time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(post.createdAt.slice(0, 10))}</time>
      · 조회 ${post.views ?? 0} · 좋아요 ${post.likes ?? 0}</p>
    <div class="body">${escapeHtml(post.text)}</div>
    ${replies ? `<h2 style="font-size:15px;margin-top:28px">답글 ${post.replyCount ?? 0}</h2><ul>${replies}</ul>` : ''}
    <a class="go" href="${appUrl}">커뮤니티에서 이어서 보기 →</a>
  </main>
  <!-- 사람이 오면 실제 화면으로 보낸다. 크롤러는 위 본문을 이미 읽었다.
       바로 보내지 않고 잠깐 두는 이유: 뒤로 가기가 무한 반복되지 않게. -->
  <script>
    if (!location.hash && document.referrer.indexOf(location.host) === -1) {
      setTimeout(function () { location.replace(${JSON.stringify(appUrl)}); }, 1200);
    }
  </script>
</body>
</html>
`;
}

async function main() {
  let galleries = [];
  try {
    galleries = (await getJson(`${API}/kl/boards`)).boards ?? [];
  } catch (error) {
    // 노트북이 꺼져 있다고 사이트 배포를 막지 않는다. 대신 조용히 넘어가지도 않는다.
    console.log(`[gen-community-pages] 건너뜀 — 커뮤니티 서버에 못 닿았다 (${String(error.message).slice(0, 40)})`);
    return;
  }

  const posts = [];
  for (const gallery of galleries) {
    if (!gallery.count) continue;
    try {
      const listed = await getJson(`${API}/kl/posts?board=${encodeURIComponent(gallery.id)}`);
      for (const post of listed.posts ?? []) posts.push({ post, galleryLabel: gallery.label });
    } catch {
      console.log(`[gen-community-pages] ${gallery.id} 목록을 못 받았다 — 그 갤러리만 건너뛴다`);
    }
  }

  if (posts.length === 0) {
    console.log('[gen-community-pages] 찍을 글이 없다 (아직 글이 없거나 서버가 비어 있다)');
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const { post, galleryLabel } of posts.slice(0, MAX_PAGES)) {
    // 글 하나를 통째로 받아야 답글이 들어 있다 (목록에도 들어 있지만 최신을 쓴다).
    let full = post;
    try {
      full = (await getJson(`${API}/kl/posts/${encodeURIComponent(post.id)}`)).post ?? post;
    } catch {
      /* 목록에 있던 것으로 찍는다 */
    }
    const dir = path.join(OUT, full.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page(full, galleryLabel), 'utf8');
    made += 1;
  }

  console.log(`[gen-community-pages] 글 ${made}장을 찍었다 (${posts.length}개 중)`);
}

await main();
