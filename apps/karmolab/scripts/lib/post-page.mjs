/**
 * 블로그 글 한 장의 내용 조각 (TASK-KL-354, change.board-unify ②③).
 *
 * 바깥 셸은 `shell-page.mjs`, 게시판 모양은 `css/community.css` 한 곳이 맡는다. 답글은
 * `blog-comments.ts`가 yawnbot 커뮤니티 원장에 붙이며, 실패해도 이 정적 본문은 그대로 산다.
 */
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
 * 글 **목록 장은 없다** (change.karmolab-at-root ②).
 *
 * 목록의 집은 앱 안 커뮤니티 「글」 판이다 (`/?board=blog#community`,
 * change.board-unify ①). 정적 목록 장을 따로 찍으면 같은 목록이 두 군데가 되고
 * 검색 신호도 갈라진다. 여기서는 **글 한 장씩**(`/posts/<slug>/`)만 찍는다.
 * 목록 데이터 정본 = `data/posts-index.json` (빌드 산출, 공개 글만).
 */

/**
 * `/404.html` 의 **본문 조각** (change.blog-surfaces-as-widgets).
 * 바깥 셸은 다른 장과 같이 `shell-page.mjs` 가 씌운다 — 이 장만 제 CSS 를 들고 다니지 않는다.
 */
export function notFoundBody() {
    return `    <div style="text-align:center;padding-top:80px">
        <h1>여기엔 아무것도 없다</h1>
        <p style="color:var(--text-secondary)">주소가 바뀌었거나, 처음부터 없던 곳이다.</p>
        <p><a href="/?board=blog#community">글 목록</a> · <a href="/">KarmoLab</a></p>
        <!-- 도구 주소로 잘못 들어온 사람 건지기 (TASK-KL-089 승계).
             도구가 이름을 바꾸거나 사라지면 옛 링크와 옛 검색 결과가 전부 그 주소로 온다.
             그냥 두면 여기서 통째로 버려진다 — 이름이 닮은 것을 찾아 그 자리에서 보여 준다.
             도구 주소로 온 게 아니면 아무것도 하지 않는다. -->
        <div id="karmolab-rescue" hidden style="margin-top:32px">
            <p><strong id="karmolab-rescue-head"></strong></p>
            <ul id="karmolab-rescue-list" style="list-style:none;padding:0"></ul>
            <p><a href="/t/">도구 전체 목록 보기</a></p>
        </div>
    </div>
    <script>
    (function(){
        /* ★ 이 조각은 템플릿 문자열 안이다 — 백슬래시 하나는 여기서 먹힌다. 그래서 두 개로 적는다.
           하나로 적혀 있던 동안 찍힌 404 에서는 정규식의 빗금 이스케이프가 통째로 사라져,
           브라우저가 「정규식 깃발이 잘못됐다」로 죽였다. 도구 주소로 잘못 온 사람 건지기가
           그동안 아예 안 돌았다 (2026-08-28 실측). */
        var m = location.pathname.match(/^\\/t\\/([^\\/]+)\\/?$/);
        if (!m) return;
        var want = decodeURIComponent(m[1]).toLowerCase();
        var box = document.getElementById('karmolab-rescue');
        fetch('/t/tools.json')
            .then(function(r){ return r.ok ? r.json() : null; })
            .then(function(rows){
                if (!rows) return;
                /* 얼마나 닮았는지 — 서로의 글자가 겹치는 정도로 센다(짧은 이름이 유리하지 않게 나눈다). */
                function score(a, b){
                    if (!b) return 0;
                    if (b.indexOf(a) !== -1 || a.indexOf(b) !== -1) return 1;
                    var hit = 0;
                    for (var i = 0; i + 2 <= a.length; i++) if (b.indexOf(a.substr(i, 2)) !== -1) hit++;
                    return hit / Math.max(1, a.length - 1);
                }
                var best = rows
                    .map(function(t){ return [Math.max(score(want, t[0]), score(want, String(t[2]).toLowerCase())), t]; })
                    .filter(function(x){ return x[0] > 0.3; })
                    .sort(function(x, y){ return y[0] - x[0]; })
                    .slice(0, 5);
                document.getElementById('karmolab-rescue-head').textContent = best.length
                    ? '혹시 이걸 찾으셨나요'
                    : '찾으시는 도구가 이름을 바꿨을 수 있습니다';
                var ul = document.getElementById('karmolab-rescue-list');
                best.forEach(function(x){
                    var li = document.createElement('li');
                    var a = document.createElement('a');
                    a.href = '/t/' + x[1][0] + '/';
                    a.textContent = x[1][1];
                    li.appendChild(a);
                    ul.appendChild(li);
                });
                box.hidden = false;
            })
            .catch(function(){ /* 목록을 못 받으면 아래의 전체 목록 링크만 남는다 */ });
    })();
    </script>`;
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
    <div class="c-crumb"><a class="c-linkbtn" href="/?board=blog#community">← 글</a></div>
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
