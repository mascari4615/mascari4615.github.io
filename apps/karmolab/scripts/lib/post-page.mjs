/**
 * 블로그 글 한 장의 **경량 셸** (TASK-KL-354 — 이관 Phase 1).
 *
 * 앱 셸(`shell-page.mjs`, 장당 리소스 13개)을 안 쓴다 — 글 장은 색인과 독자가 본진이라
 * 무게가 곧 크롤 예산이다 (TASK-KL-349: 크롤의 59% 가 JS 로 샜다). 이 장이 싣는 바깥 리소스는
 * 딱 둘: GoatCounter(계수)와 giscus(댓글, 스크롤이 닿을 때만). 스타일은 Observatory 토큰
 * 부분집합을 머리에 인라인 — CSS 파일 요청도 없다.
 *
 * 값의 출처:
 *  - 색 토큰 = `css/toolbox.css` :root / [data-theme="light"] (정본에서 베낀 부분집합 —
 *    바꿀 땐 toolbox.css 먼저, 여기는 따라 적는다)
 *  - 테마 저장 키 = `toolbox_theme` (앱과 같은 키 — 앱에서 고른 테마가 글 장에도 이어진다)
 *  - giscus = `apps/blog/_config.yml` comments.giscus (Chirpy 에서 승계, 댓글 이력 보존)
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
export function listPage(posts) {
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
permalink: /posts/
${lastmod ? `last_modified_at: ${lastmod}\n` : ''}---
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>글 | KarmoDDrine</title>
    <meta name="description" content="KarmoDDrine 블로그 — 컴퓨터·작업물·수필 ${posts.length}편">
    <link rel="canonical" href="${SITE}/posts/">
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
    })();
    </script>
    <script data-goatcounter="https://mascari4615.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
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
        `  <title>KarmoDDrine</title>\n  <link>${SITE}/posts/</link>\n` +
        `  <description>삶을 섞고 술을 바꿀 시간</description>\n  <language>ko</language>\n${items}\n</channel></rss>\n`
    );
}

/**
 * 글 한 장을 통짜 HTML 로.
 * @param {{slug:string,title:string,description:string,date:string,lastmod:string|null,
 *          categories:string[],tags:string[],image:string,hidden:boolean}} meta
 * @param {string} bodyHtml  렌더된 본문 (heading id 포함)
 * @param {{toc:string, prev:{slug:string,title:string}|null, next:{slug:string,title:string}|null}} nav
 */
export function postPage(meta, bodyHtml, nav) {
    const url = `${SITE}/posts/${meta.slug}/`;
    const image = meta.image ? (meta.image.startsWith('/') ? `${CDN}${meta.image}` : meta.image) : '';
    const description = (meta.description || '').slice(0, 160);
    const dateHuman = meta.date.slice(0, 10);

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

    return `---
layout: none
permalink: /posts/${meta.slug}/
${meta.lastmod ? `last_modified_at: ${meta.lastmod}\n` : ''}---
<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(meta.title)} | KarmoDDrine</title>
    ${description ? `<meta name="description" content="${esc(description)}">` : ''}
    <link rel="canonical" href="${esc(url)}">
    ${CSP_META}
    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(meta.title)}">
    ${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
    <meta property="og:url" content="${esc(url)}">
    ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
    <meta property="og:locale" content="ko_KR">
    <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
    <link rel="icon" href="/assets/img/favicons/favicon.ico" sizes="any">
    <script type="application/ld+json">${jsonLd(ld)}</script>
    <script>try{var t=localStorage.getItem('toolbox_theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <style>${CSS}</style>
</head>
<body class="post-page">
    <header class="post-top">
        <a href="/karmolab/">◂ KarmoLab</a>
        <a href="/posts/">글</a>
        <span class="spacer"></span>
        <button id="themeToggle" aria-label="테마 전환">◐</button>
    </header>
    <main>
        <article>
            <p class="post-meta">${meta.categories.map(esc).join(' › ')} · <time datetime="${esc(meta.date)}">${dateHuman}</time>${
        meta.lastmod ? ` <span title="마지막 수정">(수정 ${meta.lastmod.slice(0, 10)})</span>` : ''
    }</p>
            <h1>${esc(meta.title)}</h1>
            <div class="post-body">
${bodyHtml}
            </div>
            <nav class="post-adjacent">
                <span>${nav.prev ? `◂ <a href="/posts/${esc(nav.prev.slug)}/">${esc(nav.prev.title)}</a>` : ''}</span>
                <span>${nav.next ? `<a href="/posts/${esc(nav.next.slug)}/">${esc(nav.next.title)}</a> ▸` : ''}</span>
            </nav>
            <div id="comments"></div>
        </article>
        ${nav.toc ? `<aside class="post-toc" aria-label="목차">${nav.toc}</aside>` : ''}
    </main>
    <script>
    (function(){
        /* 테마 전환 — 앱과 같은 키를 쓴다. */
        document.getElementById('themeToggle').addEventListener('click',function(){
            var light=document.documentElement.dataset.theme==='light';
            if(light)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='light';
            try{localStorage.setItem('toolbox_theme',light?'dark':'light')}catch(e){}
        });
        /* 유튜브 카드 — 누르면 그 자리에서 재생 (lib/markdown activateYoutubeCards 와 같은 규칙). */
        document.querySelectorAll('a.md-yt[data-yt]').forEach(function(card){
            card.addEventListener('click',function(e){
                e.preventDefault();
                var id=card.getAttribute('data-yt');
                if(!/^[A-Za-z0-9_-]{6,}$/.test(id))return;
                var f=document.createElement('iframe');
                f.className='md-yt-frame';
                f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1';
                f.allow='autoplay; encrypted-media; picture-in-picture';
                f.allowFullscreen=true;f.title='YouTube 영상';
                card.replaceWith(f);
            });
        });
        /* giscus — 댓글 자리가 화면에 닿을 때만 싣는다 (Chirpy 설정 승계 — 댓글 이력 보존). */
        var slot=document.getElementById('comments');
        var seen=false;
        function mount(){
            if(seen)return;seen=true;
            var s=document.createElement('script');
            s.src='https://giscus.app/client.js';s.async=true;s.crossOrigin='anonymous';
            var cfg={'data-repo':'mascari4615/blog-comments','data-repo-id':'MDEwOlJlcG9zaXRvcnk0MDA0Mzg3MjE=',
                'data-category':'Announcements','data-category-id':'DIC_kwDOF941wc4CbVSv','data-mapping':'pathname',
                'data-strict':'0','data-reactions-enabled':'1','data-input-position':'bottom',
                'data-theme':'preferred_color_scheme','data-lang':'ko'};
            for(var k in cfg)s.setAttribute(k,cfg[k]);
            slot.appendChild(s);
        }
        if('IntersectionObserver' in window){
            new IntersectionObserver(function(es,ob){es.forEach(function(x){if(x.isIntersecting){ob.disconnect();mount()}})},{rootMargin:'600px'}).observe(slot);
        }else mount();
    })();
    </script>
    <script data-goatcounter="https://mascari4615.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
}
