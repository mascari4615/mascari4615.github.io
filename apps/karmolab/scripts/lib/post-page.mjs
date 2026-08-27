/**
 * 블로그 글 한 장의 내용 조각 (TASK-KL-354, change.board-unify ②③).
 *
 * 바깥 셸은 `shell-page.mjs`, 게시판 모양은 `css/community.css` 한 곳이 맡는다. 답글은
 * `blog-comments.ts`가 yawnbot 커뮤니티 원장에 붙이며, 실패해도 이 정적 본문은 그대로 산다.
 */
import { CSP_META } from './head-security.mjs';

const SITE = 'https://blog.mascari4615.com';
const CDN = 'https://img.mascari4615.com';

const esc = (s) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON-LD 는 `</script>` 로 태그가 끊기지 않게 여섯 글자 표기로 (gen-community-pages 규율 승계). */
const jsonLd = (value) =>
    JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** 이미지 주소에 CDN 을 입힌다 — Chirpy `_config.yml cdn:` 이 하던 일 (글 사진은 R2 가 서빙). */
export function applyCdn(html) {
    return html.replace(/(src|href)="(\/assets\/img\/[^"]+)"/g, (_m, attr, p) => `${attr}="${CDN}${p}"`);
}

/**
 * 옛 Chirpy Service Worker 회수 (컷오버 — change.blog-cutover).
 * Chirpy PWA SW 가 scope '/' 로 `/`·`/posts/*` HTML 을 cache-first 로 붙들고 있었다 —
 * 파일(/sw.min.js)이 사라져도 기존 방문자에겐 옛 SW 가 남아 새 장 대신 옛 껍데기를 내민다.
 * scope 가 '/' 인 등록만 해제한다 — KarmoLab SW(/karmolab/·/apps/karmolab/)는 안 건드린다
 * (선례 = `src/pwa-update.ts` 의 scope 선별 해제).
 */
const SW_KILL = `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){try{if(new URL(r.scope).pathname==='/')r.unregister()}catch(e){}})}).catch(function(){})}`;

/** 관측실 톤 최소 스타일 — 글이 읽히는 데 필요한 만큼만. */
const CSS = `
:root{color-scheme:dark;--bg-void:#0f1016;--bg-primary:#171821;--bg-secondary:#1d1e28;--bg-tertiary:#292a36;
--text-primary:#f2f2ee;--text-secondary:#9a9a94;--text-tertiary:#94948f;--accent:#a79bef;--accent-hover:#bdb4f4;--secondary:#7ba7d4}
[data-theme=light]{color-scheme:light;--bg-void:#fff;--bg-primary:#fff;--bg-secondary:#fff;--bg-tertiary:#e9e7f2;
--text-primary:#1a1a1f;--text-secondary:#64626f;--text-tertiary:#656374;--accent:#5f4dc2;--accent-hover:#4f3eb0;--secondary:#3f6285}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg-void);color:var(--text-primary);font:16px/1.75 -apple-system,'Pretendard','Noto Sans KR',system-ui,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{color:var(--accent-hover);text-decoration:underline}
.post-top{display:flex;gap:16px;align-items:center;max-width:760px;margin:0 auto;padding:14px 20px;font-size:14px}
.post-top .spacer{flex:1}.post-top button{background:none;border:1px solid var(--bg-tertiary);border-radius:8px;color:var(--text-secondary);padding:4px 10px;cursor:pointer}
main{max-width:760px;margin:0 auto;padding:8px 20px 64px}
.post-meta{color:var(--text-tertiary);font-size:14px;margin:24px 0 8px}
h1{font-size:30px;line-height:1.3;margin:0 0 24px}
.post-body h2{font-size:22px;margin:40px 0 12px;padding-top:8px;border-top:1px solid var(--bg-tertiary)}
.post-body h3{font-size:18px;margin:28px 0 10px}
.post-body img{max-width:100%;height:auto;border-radius:8px}
.post-body pre{background:var(--bg-secondary);border:1px solid var(--bg-tertiary);border-radius:8px;padding:14px;overflow-x:auto;font-size:14px;line-height:1.6}
.post-body code{font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:.92em}
.post-body :not(pre)>code{background:var(--bg-secondary);border:1px solid var(--bg-tertiary);border-radius:4px;padding:1px 5px}
.post-body blockquote{margin:16px 0;padding:2px 16px;border-left:3px solid var(--bg-tertiary);color:var(--text-secondary)}
.post-body table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%}
.post-body th,.post-body td{border:1px solid var(--bg-tertiary);padding:6px 12px}
.md-callout{border-left-color:var(--accent);background:var(--bg-secondary);border-radius:0 8px 8px 0;color:var(--text-primary)}
.md-callout-tag{font-weight:600;color:var(--accent);margin:10px 0 2px}
.md-callout-warning,.md-callout-caution{border-left-color:#d4a04f}.md-callout-warning .md-callout-tag,.md-callout-caution .md-callout-tag{color:#d4a04f}
.md-yt{position:relative;display:block;max-width:560px;margin:16px 0}
.md-yt img{width:100%;border-radius:12px;display:block}
.md-yt-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.7)}
.md-yt-frame{width:100%;max-width:560px;aspect-ratio:16/9;border:0;border-radius:12px;margin:16px 0}
.post-adjacent{display:flex;justify-content:space-between;gap:16px;margin:48px 0 8px;padding-top:16px;border-top:1px solid var(--bg-tertiary);font-size:14px}
/* ★ 글 장도 **게시판 안**처럼 보인다 (change.board-unify ②, 사용자 확정: 「기존 게시판 글
   그대로 들어가는 것처럼 보이되 주소만 다르게」). 커뮤니티 위젯의 c-wrap·c-gal-head 를
   같은 규격으로 옮겨 왔다 — 목록에서 글로 들어와도 판을 떠난 느낌이 없어야 한다. */
.board-wrap{width:100%;max-width:940px;margin:0 auto;padding:20px 22px 26px;
  background:color-mix(in srgb,var(--bg-primary) 62%,transparent);
  backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15);
  border:1px solid var(--bg-tertiary);border-radius:14px}
@supports not (backdrop-filter:blur(1px)){.board-wrap{background:var(--bg-primary)}}
@media(max-width:620px){.board-wrap{padding:14px 12px 20px;border-radius:0;border-left:0;border-right:0}}
.board-head{display:flex;align-items:baseline;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid var(--text-tertiary)}
.board-head .back{font-size:13px;color:var(--text-secondary)}
.board-head strong{font-size:15px;color:var(--text-primary)}
.board-post{border-bottom:1px solid var(--bg-tertiary);padding-bottom:8px;margin-bottom:20px}
/* 본문은 읽기 폭을 지킨다 — 판은 940 이어도 글줄이 940 이면 눈이 줄을 잃는다. */
.board-wrap .post-body,.board-wrap .post-adjacent,.board-wrap #comments{max-width:760px}
body.post-page main{max-width:none;padding:8px 20px 64px}
.post-toc{position:fixed;top:80px;left:calc(50% + 420px);width:220px;font-size:13px;line-height:1.6}
.post-toc a{display:block;color:var(--text-tertiary);padding:2px 0}.post-toc a.h3{padding-left:14px}
@media(max-width:1260px){.post-toc{display:none}}
`;

/**
 * `/posts/` 목록 한 장 (TASK-KL-355 — Phase 2). 같은 경량 셸 톤.
 * 공개 글이 78장이라 페이지네이션이 필요 없다 (카테고리/태그 아카이브 대신 목록+거르기 — 확정 결정).
 * 거르기(칩·검색)는 인라인 몇 줄 — 바깥 리소스는 여전히 GoatCounter 하나다.
 * @param {Array<{slug:string,title:string,date:string,categories:string[],excerpt:string}>} posts 공개 글, 최신순
 */
export function listPage(posts, { permalink = '/posts/', canonical = '/', sitemap = true } = {}) {
    const cats = [...new Set(posts.map((p) => p.categories[0]).filter(Boolean))];
    // 사이트맵 lastmod — 비면 배포가 선다 (audit-sitemap-lastmod exit 1). 가장 최근 글의 시각.
    const lastmod = posts.map((p) => p.lastmod ?? p.date).sort().at(-1) ?? '';
    const rows = posts
        .map((p) => {
            const cat = p.categories.join(' › ');
            return (
                `<li data-cat="${esc(p.categories[0] ?? '')}" data-text="${esc(`${p.title} ${cat}`.toLowerCase())}">` +
                `<a href="/posts/${esc(p.slug)}/"><span class="t">${esc(p.title)}</span>` +
                `<span class="m">${esc(cat)} · <time datetime="${esc(p.date)}">${p.date.slice(0, 10)}</time></span>` +
                (p.excerpt ? `<span class="x">${esc(p.excerpt)}</span>` : '') +
                `</a></li>`
            );
        })
        .join('\n');

    return `---
layout: none
permalink: ${permalink}
${sitemap ? '' : 'sitemap: false\n'}
${lastmod ? `last_modified_at: ${lastmod}\n` : ''}---
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>글 | KarmoDDrine</title>
    <meta name="description" content="KarmoDDrine 블로그 — 컴퓨터·작업물·수필 ${posts.length}편">
    <link rel="canonical" href="${SITE}${canonical}">
    ${CSP_META}
    <link rel="icon" href="/assets/img/favicons/favicon.ico" sizes="any">
    <link rel="alternate" type="application/rss+xml" title="KarmoDDrine" href="/feed.xml">
    <script>try{var t=localStorage.getItem('toolbox_theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <style>${CSS}
.list-filter{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.list-filter input{flex:1;min-width:160px;background:var(--bg-secondary);border:1px solid var(--bg-tertiary);border-radius:8px;color:var(--text-primary);padding:8px 12px}
.chip{background:none;border:1px solid var(--bg-tertiary);border-radius:999px;color:var(--text-secondary);padding:4px 12px;cursor:pointer;font-size:13px}
.chip.on{border-color:var(--accent);color:var(--accent)}
.post-list{list-style:none;margin:0;padding:0}
.post-list li{border-bottom:1px solid var(--bg-tertiary)}
.post-list a{display:block;padding:14px 2px;color:inherit;text-decoration:none}
.post-list a:hover .t{color:var(--accent)}
.post-list .t{display:block;font-weight:600}
.post-list .m{display:block;font-size:13px;color:var(--text-tertiary);margin-top:2px}
.post-list .x{display:block;font-size:14px;color:var(--text-secondary);margin-top:4px}
</style>
</head>
<body class="post-page">
    <header class="post-top">
        <a href="/karmolab/">◂ KarmoLab</a>
        <a href="/works/">작업물</a>
        <a href="/about/">소개</a>
        <span class="spacer"></span>
        <button id="themeToggle" aria-label="테마 전환">◐</button>
    </header>
    <main>
        <h1>글 <small style="color:var(--text-tertiary);font-size:16px">${posts.length}편</small></h1>
        <div class="list-filter">
            <input id="q" type="search" placeholder="제목·카테고리 찾기" aria-label="글 찾기">
            ${cats.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <ul class="post-list" id="list">
${rows}
        </ul>
    </main>
    <script>
    (function(){
        document.getElementById('themeToggle').addEventListener('click',function(){
            var light=document.documentElement.dataset.theme==='light';
            if(light)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='light';
            try{localStorage.setItem('toolbox_theme',light?'dark':'light')}catch(e){}
        });
        var cat='',q='';
        var rows=[].slice.call(document.querySelectorAll('#list li'));
        function apply(){
            rows.forEach(function(r){
                var okCat=!cat||r.dataset.cat===cat;
                var okQ=!q||r.dataset.text.indexOf(q)>=0;
                r.style.display=okCat&&okQ?'':'none';
            });
        }
        [].slice.call(document.querySelectorAll('.chip')).forEach(function(ch){
            ch.addEventListener('click',function(){
                var on=ch.classList.contains('on');
                document.querySelectorAll('.chip.on').forEach(function(x){x.classList.remove('on')});
                cat=on?'':ch.dataset.cat;if(!on)ch.classList.add('on');
                apply();
            });
        });
        document.getElementById('q').addEventListener('input',function(e){q=e.target.value.trim().toLowerCase();apply()});
        ${SW_KILL}
    })();
    </script>
    <script data-goatcounter="https://mascari4615.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

/**
 * 같은 목록을 내는 두 주소의 검색 신호를 홈(`/`)으로 모은다.
 * `/posts/`는 기존 링크를 깨지 않기 위한 호환 주소이며 사이트맵에는 제출하지 않는다.
 */
export function blogIndexPages(posts) {
    return {
        home: listPage(posts, { permalink: '/', canonical: '/' }),
        legacyPosts: listPage(posts, { permalink: '/posts/', canonical: '/', sitemap: false }),
    };
}

/**
 * `/works/` — 작업물 전시 (change.blog-finish ③, Chirpy works 레이아웃 승계).
 * 항목 = `_data/works.yml` (전시 목록이 정본 — hidden 글도 여기 있으면 의도된 전시다).
 * 글 카드(`/posts/<slug>/`)와 바깥 링크(유튜브 등)를 함께 싣는다.
 * @param {Array<{url:string,slug:string|null,title:string,image:string,description:string,date:string,tags:string[]}>} works 큐레이션 순서 그대로
 */
export function worksPage(works, lastmod) {
    const cards = works
        .map((w) => {
            const img = w.image ? (w.image.startsWith('/') ? `${CDN}${w.image}` : w.image) : '';
            const external = !w.slug;
            return (
                `<li><a href="${esc(w.url)}"${external ? ' target="_blank" rel="noopener"' : ''}>` +
                (img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>') +
                `<span class="t">${esc(w.title)}${external ? ' ↗' : ''}</span>` +
                (w.description ? `<span class="d">${esc(w.description)}</span>` : '') +
                `<span class="m">${esc(w.date ?? '')}${w.tags.length ? ` · ${w.tags.map(esc).join(', ')}` : ''}</span>` +
                `</a></li>`
            );
        })
        .join('\n');
    return `---
layout: none
permalink: /works/
${lastmod ? `last_modified_at: ${lastmod}\n` : ''}---
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>작업물 | KarmoDDrine</title>
    <meta name="description" content="카모뜨린의 작업물 ${works.length}건 — 게임·VRChat 콘텐츠·도구">
    <link rel="canonical" href="${SITE}/works/">
    ${CSP_META}
    <link rel="icon" href="/assets/img/favicons/favicon.ico" sizes="any">
    <script>try{var t=localStorage.getItem('toolbox_theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <style>${CSS}
.works-grid{list-style:none;margin:16px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.works-grid a{display:block;color:inherit;text-decoration:none;background:var(--bg-secondary);border:1px solid var(--bg-tertiary);border-radius:12px;overflow:hidden}
.works-grid a:hover .t{color:var(--accent)}
.works-grid img,.works-grid .ph{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--bg-tertiary)}
.works-grid .t{display:block;font-weight:600;padding:10px 12px 2px}
.works-grid .d{display:block;font-size:13px;color:var(--text-secondary);padding:2px 12px 0}
.works-grid .m{display:block;font-size:13px;color:var(--text-tertiary);padding:0 12px 12px}
</style>
</head>
<body class="post-page">
    <header class="post-top">
        <a href="/karmolab/">◂ KarmoLab</a>
        <a href="/">글</a>
        <a href="/works/">작업물</a>
        <a href="/about/">소개</a>
        <span class="spacer"></span>
        <button id="themeToggle" aria-label="테마 전환">◐</button>
    </header>
    <main style="max-width:960px">
        <h1>작업물 <small style="color:var(--text-tertiary);font-size:16px">${works.length}건</small></h1>
        <ul class="works-grid">
${cards}
        </ul>
    </main>
    <script>
    (function(){
        document.getElementById('themeToggle').addEventListener('click',function(){
            var light=document.documentElement.dataset.theme==='light';
            if(light)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='light';
            try{localStorage.setItem('toolbox_theme',light?'dark':'light')}catch(e){}
        });
        ${SW_KILL}
    })();
    </script>
    <script data-goatcounter="https://mascari4615.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

/** `/about/` — 소개 한 장 (컷오버: Chirpy _tabs/about.md 승계). 본문은 렌더된 HTML 로 받는다. */
export function aboutPage(bodyHtml, lastmod) {
    return `---
layout: none
permalink: /about/
${lastmod ? `last_modified_at: ${lastmod}\n` : ''}---
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>소개 | KarmoDDrine</title>
    <meta name="description" content="카모뜨린 KarmoDDrine — 유니티 게임 개발·VRChat 콘텐츠 제작">
    <link rel="canonical" href="${SITE}/about/">
    ${CSP_META}
    <link rel="icon" href="/assets/img/favicons/favicon.ico" sizes="any">
    <script>try{var t=localStorage.getItem('toolbox_theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <style>${CSS}</style>
</head>
<body class="post-page">
    <header class="post-top">
        <a href="/karmolab/">◂ KarmoLab</a>
        <a href="/">글</a>
        <span class="spacer"></span>
        <button id="themeToggle" aria-label="테마 전환">◐</button>
    </header>
    <main>
        <article class="post-body">
${bodyHtml}
        </article>
    </main>
    <script>
    (function(){
        document.getElementById('themeToggle').addEventListener('click',function(){
            var light=document.documentElement.dataset.theme==='light';
            if(light)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='light';
            try{localStorage.setItem('toolbox_theme',light?'dark':'light')}catch(e){}
        });
        ${SW_KILL}
    })();
    </script>
    <script data-goatcounter="https://mascari4615.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

/** `/404.html` — Chirpy 404(layout: page 의존) 대체. GitHub Pages 가 이 이름을 그대로 쓴다. */
export function notFoundPage() {
    return `---
layout: none
permalink: /404.html
sitemap: false
---
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>404 | KarmoDDrine</title>
    <meta name="robots" content="noindex">
    ${CSP_META}
    <link rel="icon" href="/assets/img/favicons/favicon.ico" sizes="any">
    <script>try{var t=localStorage.getItem('toolbox_theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <style>${CSS}</style>
</head>
<body class="post-page">
    <main style="text-align:center;padding-top:80px">
        <h1>여기엔 아무것도 없다</h1>
        <p style="color:var(--text-secondary)">주소가 바뀌었거나, 처음부터 없던 곳이다.</p>
        <p><a href="/">글 목록</a> · <a href="/karmolab/">KarmoLab</a></p>
    </main>
    <script>${SW_KILL}</script>
</body>
</html>
`;
}

/** RSS 2.0 — `gen-feeds.mjs`(changes.xml) 손조립 패턴 승계. 컷오버 때 /feed.xml 자리로 간다. */
export function feedXml(posts) {
    const items = posts
        .slice(0, 20)
        .map((p) => {
            const url = `${SITE}/posts/${p.slug}/`;
            return (
                `  <item>\n    <title>${esc(p.title)}</title>\n    <link>${esc(url)}</link>\n` +
                `    <guid isPermaLink="true">${esc(url)}</guid>\n` +
                `    <pubDate>${new Date(p.date).toUTCString()}</pubDate>\n` +
                (p.excerpt ? `    <description>${esc(p.excerpt)}</description>\n` : '') +
                `  </item>`
            );
        })
        .join('\n');
    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n` +
        `  <title>KarmoDDrine</title>\n  <link>${SITE}/</link>\n` +
        `  <description>삶을 섞고 술을 바꿀 시간</description>\n  <language>ko</language>\n${items}\n</channel></rss>\n`
    );
}

/**
 * 글 한 장을 통짜 HTML 로.
 * @param {{slug:string,title:string,description:string,date:string,lastmod:string|null,
 *          categories:string[],tags:string[],image:string,hidden:boolean}} meta
 * @param {string} bodyHtml  렌더된 본문 (heading id 포함)
 * @param {{toc:string, prev:{slug:string,title:string}|null, next:{slug:string,title:string}|null, mathCss?:boolean}} nav
 */
export function postBody(meta, bodyHtml, nav) {
    const dateHuman = meta.date.slice(0, 10);
    /* 커뮤니티 글 상세와 **같은 클래스**를 쓴다 (change.board-unify ②, 사용자 확정 2026-08-23:
       「겉모습이 같으면 된다 — 기능은 달라도」). 규칙은 `css/community.css` 한 곳이 정본이고
       앱과 이 장이 그 파일을 각자 링크한다 — 여기에 스타일을 적으면 두 집이 갈라진다.
       안 그리는 것: 좋아요·조회수·글쓴이 얼굴(눌러도 아무 일 없는 단추는 나쁜 경험). */
    return `<div class="c-wrap">
    <div class="c-crumb"><a class="c-linkbtn" href="/karmolab/?board=blog#community">← 글</a></div>
    <article class="c-post">
        <h2 class="c-post-title">${esc(meta.title)}</h2>
        <div class="c-post-meta"><span>${meta.categories.map(esc).join(' › ')}</span>
            <span class="c-dot"><time datetime="${esc(meta.date)}">${dateHuman}</time></span>${
                meta.lastmod ? `<span class="c-dot">수정 ${meta.lastmod.slice(0, 10)}</span>` : ''
            }</div>
        <div class="c-post-body md">
${bodyHtml}
        </div>
        <nav class="post-adjacent">
            <span>${nav.prev ? `◂ <a href="/posts/${esc(nav.prev.slug)}/">${esc(nav.prev.title)}</a>` : ''}</span>
            <span>${nav.next ? `<a href="/posts/${esc(nav.next.slug)}/">${esc(nav.next.title)}</a> ▸` : ''}</span>
        </nav>
    </article>
    <h3 class="c-section">답글</h3>
    <div id="comments" data-blog-comments data-slug="${esc(meta.slug)}" data-title="${esc(meta.title)}">
        <div class="c-empty">답글을 불러오는 중…</div>
    </div>
</div>${nav.toc ? `<aside class="post-toc" aria-label="목차">${nav.toc}</aside>` : ''}`;
}

/** 글 장에만 필요한 몇 줄 — 목차·앞뒤 글. 커뮤니티에 없는 조각이라 여기 둔다(겹치지 않는다). */
export const POST_EXTRA_CSS = `<style>
.post-adjacent{display:flex;justify-content:space-between;gap:16px;margin:32px 0 8px;padding-top:16px;border-top:1px solid var(--border);font-size:var(--font-size-xs)}
.post-toc{position:fixed;top:110px;left:calc(50% + 500px);width:200px;font-size:13px;line-height:1.6}
.post-toc a{display:block;color:var(--text-tertiary);padding:2px 0}.post-toc a.h3{padding-left:14px}
@media(max-width:1400px){.post-toc{display:none}}
</style>`;

/** 글 장 머리에 들어가는 것 — 구조화 데이터·게시판 시트. 셸이 나머지를 다 준다. */
export function postHead(meta, { mathCss = false } = {}) {
    const url = `${SITE}/posts/${meta.slug}/`;
    const image = meta.image ? (meta.image.startsWith('/') ? `${CDN}${meta.image}` : meta.image) : '';
    const description = (meta.description || '').slice(0, 160);
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: meta.title,
        datePublished: meta.date,
        ...(meta.lastmod ? { dateModified: meta.lastmod } : {}),
        ...(image ? { image } : {}),
        ...(description ? { description } : {}),
        author: { '@type': 'Person', name: 'Mascari4615', url: SITE },
        mainEntityOfPage: url,
        inLanguage: 'ko',
    };
    /* 겉모습 정본 한 곳을 **링크**한다 — 규칙을 여기 베끼지 않는다 (사용자 확정 2026-08-23:
       「한쪽에서 SSOT 되는 구조여야 한다」). 앱은 위젯이 같은 파일을 붙인다. */
    return `<link rel="stylesheet" href="/apps/karmolab/css/community.css">
    <link rel="canonical" href="${esc(url)}">
    ${image ? `<meta property="og:image" content="${esc(image)}">\n    ` : ''}<meta property="og:type" content="article">
    ${mathCss ? '<link rel="stylesheet" href="/assets/katex/katex.min.css">\n    ' : ''}<script type="application/ld+json">${jsonLd(ld)}</script>
    ${POST_EXTRA_CSS}`;
}
