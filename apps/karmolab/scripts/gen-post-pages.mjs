/**
 * 블로그 글 정적 장 찍기 (TASK-KL-354 — 이관 Phase 1).
 *
 * `content/posts/**`(표준 md — `convert:posts` 산출)를 읽어 `/posts/<slug>/` 한 장씩 찍는다.
 * 렌더러 = `src/lib/markdown/render.ts` **한 벌** (위젯과 같은 문). 셸 = `lib/shell-page.mjs`,
 * 글 조각 = `lib/post-page.mjs`, 답글 = `src/blog-comments.ts`(본문을 막지 않는 지연 조각).
 *
 * URL 은 Chirpy 와 **글자 그대로 같다**: `/posts/<파일명 slug>/`. 색인된 글이 전부 이 형식이라
 * (TASK-KL-349 — 색인 3장 전부 옛 글) 한 글자도 못 바꾼다. slug 충돌은 여기서 배포 전에 세운다.
 *
 * Phase 1 동안은 Jekyll 이 아직 /posts/ 를 굽는다 — 그래서 기본 출력은 `content/pages/`
 * (검증용 산출물, gitignore). Jekyll 철거(Phase 3) 때 `--out ../blog/posts` 로 갈아 끼운다.
 *
 * 사용: npm run gen:post-pages        (먼저 npm run convert:posts)
 *       node scripts/gen-post-pages.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMarked, loadMarkdownLib } from './lib/markdown-node.mjs';
import { postBody, postHead, notFoundBody, feedXml, applyCdn } from './lib/post-page.mjs';
import { parseWorksYml, buildWorks } from './lib/works-list.mjs';
import { parseMinorWorks } from './lib/works-minor.mjs';
import { loadShell, shellCommon, replaceMeta, asStaticPage, scriptFile, esc as shellEsc } from './lib/shell-page.mjs';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTENT = path.join(APP_ROOT, 'content', 'posts');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(APP_ROOT, 'content', 'pages');

if (!fs.existsSync(CONTENT)) {
    console.error('[gen-post-pages] ✗ content/posts 가 없다 — 먼저 npm run convert:posts');
    process.exit(1);
}

// ---------------------------------------------------------------- 읽기

/** 우리 표준 frontmatter (converter 가 쓴 그 모양) — 여기 없는 문법은 지원하지 않는다. */
function parsePost(file) {
    const text = fs.readFileSync(file, 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (!m) return null;
    const head = {};
    for (const line of m[1].split('\n')) {
        const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (kv) head[kv[1]] = kv[2].trim();
    }
    const list = (raw) =>
        raw
            ? (/^\[(.*)\]$/.exec(raw)?.[1] ?? '')
                  .split(',')
                  .map((s) => s.replace(/^["']|["']$/g, '').trim())
                  .filter(Boolean)
            : [];
    const unquote = (raw) => (raw ?? '').replace(/^"(.*)"$/s, (_w, inner) => JSON.parse(`"${inner}"`)).trim();
    /* `work:` 한 단 아래는 **작업물 메타**다 (change.blog-surfaces-as-widgets ②).
       예전에는 이 값들이 `_data/works.yml` 에만 있어, 글을 고칠 때 따로 있는 그 파일을 같이
       고쳐야 했다 — 그래서 제목·날짜가 두 곳에서 어긋났다. 이제 글이 제 메타를 든다. */
    const work = (() => {
        const block = /^work:\n((?:[ ]{2}.*\n?)+)/m.exec(m[1] + '\n');
        if (!block) return null;
        const out = {};
        for (const line of block[1].split('\n')) {
            const kv = /^\s{2}([a-z]+):\s*(.*)$/.exec(line);
            if (kv) out[kv[1]] = kv[2].trim();
        }
        return out;
    })();
    const slugMatch = /^\d{4}-\d{2}-\d{2}-(.+)\.md$/.exec(path.basename(file));
    if (!slugMatch) return null; // 규약 밖 파일명은 converter 리포트가 이미 안다
    return {
        slug: slugMatch[1],
        file: path.relative(CONTENT, file),
        title: unquote(head.title) || slugMatch[1],
        description: unquote(head.description),
        date: unquote(head.date),
        lastmod: unquote(head.last_modified_at) || null,
        categories: list(head.categories),
        tags: list(head.tags),
        image: unquote(head.image),
        hidden: head.hidden === 'true',
        work: work && {
            field: unquote(work.field) || null,
            org: unquote(work.org) || null,
            roles: list(work.role),
            platform: unquote(work.platform) || null,
            period: unquote(work.period) || null,
        },
        body: text.slice(m[0].length),
    };
}

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
}

// ---------------------------------------------------------------- 본문 손질

/** 제목에 id 를 박고 목차를 얻는다 — 규칙은 `lib/doc-view.ts` 의 slug 와 같은 계보 (한글 유지). */
function addHeadingIds(html) {
    const toc = [];
    let at = 0;
    const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_whole, level, inner) => {
        const text = inner.replace(/<[^>]+>/g, '').trim();
        const base = text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s+/g, '-')
            .slice(0, 48);
        const id = `${base || 'h'}-${at}`;
        at += 1;
        toc.push(`<a class="h${level}" href="#${id}">${text}</a>`);
        return `<h${level} id="${id}">${inner}</h${level}>`;
    });
    return { html: out, toc: toc.length >= 3 ? toc.join('') : '' }; // 제목 두 개짜리 글에 목차는 소음이다
}

// ---------------------------------------------------------------- 찍기

const marked = loadMarked();
const { renderMarkdown } = await loadMarkdownLib();

// 수식 — `$$…$$` 는 빌드 때 KaTeX 로 굳힌다 (change.blog-finish ④). 클라이언트 JS 0,
// 수식 있는 장만 katex.min.css 한 장 (self-host `/assets/katex/`). 실측 사용 4파일.
const katex = (await import('katex')).default;
function renderMath(md) {
    if (md.includes('$$') === false) return { md, hasMath: false };
    let hasMath = false;
    const out = md.replace(/\$\$([\s\S]+?)\$\$/g, (whole, tex) => {
        hasMath = true;
        try {
            return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: true });
        } catch (error) {
            console.warn(`[gen-post-pages] 수식 못 굳힘 (${error.message.split('\n')[0]}) — 원문 유지`);
            return whole;
        }
    });
    return { md: out, hasMath };
}

const posts = walk(CONTENT)
    .map(parsePost)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

// slug = URL — 충돌은 조용히 서로를 덮어쓴다. 배포 전에 여기서 세운다.
{
    const seen = new Map();
    const clashes = [];
    for (const post of posts) {
        if (seen.has(post.slug)) clashes.push(`${post.slug}: ${seen.get(post.slug)} ↔ ${post.file}`);
        seen.set(post.slug, post.file);
    }
    if (clashes.length) {
        console.error(`[gen-post-pages] ✗ slug 충돌 ${clashes.length}건 — URL 이 서로를 덮는다:\n  ${clashes.join('\n  ')}`);
        process.exit(1);
    }
}

// 이전/다음 — 시간순, 숨긴 글은 이웃 후보에서 뺀다 (목록에 없는 글로 이끌지 않는다).
const visible = posts.filter((p) => !p.hidden);
const neighborOf = (post) => {
    const timeline = visible.filter((p) => p.slug !== post.slug).concat(post).sort((a, b) => (a.date < b.date ? -1 : 1));
    const at = timeline.indexOf(post);
    return { prev: timeline[at - 1] ?? null, next: timeline[at + 1] ?? null };
};

/* 앱 셸 한 벌 — 글 장 전부가 이 셸을 지난다 (도구 상세 장과 같은 길). */
const SHELL = loadShell(APP_ROOT);
const SITE = 'https://blog.mascari4615.com';
/** 글 사진 서빙본 (post-page.mjs `applyCdn` 과 같은 자리 — 여기서는 주소 문자열에 직접 입힌다). */
const CDN = 'https://img.mascari4615.com';

/**
 * 위젯이 그리는 곁장 한 장 (`/works/` · `/about/`, change.blog-surfaces-as-widgets).
 *
 * 도구 상세 127장과 **같은 길**이다: 셸을 그대로 쓰고, `bootPaths` 로 그 위젯 하나를 미리 받고,
 * `KARMOLAB_ENTRY_TOOL` 로 앱에게 「첫 화면 말고 이 도구를 열어라」라고 말한다.
 * 다른 점 하나 = 이 장들은 `/t/<id>/` 가 아니라 제 주소를 가진다 (위젯 메타의 `noPage: true`).
 *
 * 스크립트가 그리는 화면이므로 **첫 HTML 에 읽을 말이 없다**. 그래서 셸의 SEO 자리에
 * 서버 렌더 텍스트를 남긴다 — 안 남기면 검색엔진에는 빈 장이다.
 */
function widgetPage({ widget, permalink, title, heading, description, lastmod, seoHtml }) {
    const bootPaths = [widget, 'chat'].filter((name) => {
        const ok = fs.existsSync(path.join(APP_ROOT, scriptFile(name)));
        if (!ok) console.warn(`[gen-post-pages] 부팅 목록에서 뺌 — 아직 안 구워진 조각: ${name}`);
        return ok;
    });
    if (bootPaths.includes(widget) === false) {
        console.warn(`[gen-post-pages] ${permalink} — 위젯 ${widget} 번들이 없다. 배포에서는 build 가 먼저 돈다`);
    }

    let page = shellCommon(SHELL, { permalink, lastModified: lastmod, bootPaths });
    page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${shellEsc(title)} | KarmoDDrine</title>`);
    page = replaceMeta(page, 'name', 'description', description);
    page = replaceMeta(page, 'property', 'og:description', description);
    page = replaceMeta(page, 'property', 'og:title', title);
    page = replaceMeta(page, 'property', 'og:url', `${SITE}${permalink}`);
    page = page.replace(
        `<link rel="canonical" href="${SITE}/">`,
        `<link rel="canonical" href="${SITE}${permalink}">`
    );

    /* 도구 상세 장과 **같은 몸 클래스**를 쓴다 — `tools.css` 의 화면 규칙(제목 자리·본문 폭)이
       전부 `body.tool-detail` 아래에 있다. 안 붙이면 제목이 옆줄 위로 흘러 겹친다(실측). */
    page = page.replace('<body>', '<body class="tool-detail">');

    const entry =
        `<script>window.KARMOLAB_ENTRY_TOOL=${JSON.stringify(widget)};` +
        'window.KARMOLAB_TOOL_PAGES=[];window.KARMOLAB_BUILD_PRINT="";</script>';
    page = page.replace('</head>', `    ${entry}
</head>`);

    /* 제목은 스크립트를 기다리지 않고 바로 읽히게 미리 박는다 (도구 상세 장과 같은 이유).
       단 본문이 제 큰제목을 들고 오는 장(소개)에서는 안 박는다 — 한 장에 큰제목은 하나다(KL-089). */
    const slot = '<div class="content-body" id="tool-pages">';
    if (!page.includes(slot)) throw new Error('셸에서 본문 자리를 못 찾음 — index.html 확인');
    /* 자리 표시 한 줄(`tool-crumb`)이 **머리띠 자리를 채운다** — 도구 상세 장에는 늘 있다.
       빼 보니 제목이 머리띠 뒤로 흘러 반쯤 잘렸다(2026-08-28 실측). 길 안내이자 자리다. */
    const crumb =
        `<nav class="tool-crumb" aria-label="위치"><a href="/">KarmoLab</a>` +
        `<i aria-hidden="true">›</i><span aria-current="page">${shellEsc(title)}</span></nav>
          `;
    page = page.replace(slot, `${crumb}${slot}`);
    if (heading) page = page.replace(slot, `<header class="tool-head"><h1>${shellEsc(heading)}</h1></header>
                ${slot}`);

    const anchor = page.match(/<!-- KARMOLAB_TOOL_SEO[\s\S]*?-->/);
    if (!anchor) throw new Error('셸에 KARMOLAB_TOOL_SEO 앵커가 없음 — index.html 확인');
    return page.replace(anchor[0], seoHtml);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let maxExternal = 0;
for (const post of posts) {
    const math = renderMath(post.body);
    const rendered = applyCdn(renderMarkdown(math.md, { trust: 'self', marked }));
    const { html, toc } = addHeadingIds(rendered);
    const { prev, next } = neighborOf(post);
    /* ★ 글 장도 **앱 셸**로 찍는다 (change.board-unify ②, 사용자 확정 2026-08-23).
       경량 셸은 「같은 곳인데 다른 집」이었다 — 머리띠도 검색도 내 정보도 없으니 커뮤니티 글과
       한눈에 달라 보였다. 도구 상세 장이 이미 가는 길(shell-page.mjs, KL-129)로 합류한다.
       대가(장당 바깥 리소스 2→13)는 그 결정의 값이다 — 아래 무게 게이트도 같이 옮겼다. */
    const permalink = `/posts/${post.slug}/`;
    let page = shellCommon(SHELL, { permalink, lastModified: post.lastmod ?? post.date, bootPaths: [] });
    page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${shellEsc(post.title)} | KarmoDDrine</title>`);
    if (post.description) {
        page = replaceMeta(page, 'name', 'description', post.description);
        page = replaceMeta(page, 'property', 'og:description', post.description);
    }
    page = replaceMeta(page, 'property', 'og:title', post.title);
    page = replaceMeta(page, 'property', 'og:url', `${SITE}${permalink}`);
    page = asStaticPage(page, {
        kind: 'post',
        bodyHtml: postBody(post, html, {
            toc,
            prev: prev && { slug: prev.slug, title: prev.title },
            next: next && { slug: next.slug, title: next.title },
        }),
        head: postHead(post, { mathCss: math.hasMath }),
    });

    // 글 장 하나라도 댓글 표식을 잃거나 옛 giscus가 돌아오면 배포 전에 세운다.
    const commentMarker = `data-blog-comments data-slug="${shellEsc(post.slug)}"`;
    if (!page.includes(commentMarker) || /giscus/i.test(page)) {
        throw new Error(`[gen-post-pages] ${post.slug}: KarmoLab 답글 배선이 빠졌거나 giscus가 돌아왔다`);
    }

    // 무게 게이트 — 이 장이 바깥에서 받는 것(스크립트·스타일 링크) 수. 앱 셸로 회귀하면 여기가 선다.
    // 수식 장은 katex.min.css 한 장을 더 받는다 — 그 장만 +1 허용.
    const external = (page.match(/<script[^>]+src=|<link[^>]+rel="stylesheet"/g) ?? []).length;
    maxExternal = Math.max(maxExternal, external - (math.hasMath ? 1 : 0));

    const dest = path.join(OUT, 'posts', post.slug, 'index.html');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, page);
}

// 색인 — 목록 장·피드·커뮤니티 위젯 「글」 탭의 원료. **공개 글만** 싣는다:
// hidden 은 「URL 을 아는 사람만」이 결정인데(KL-351), 색인에 열거하면 그 결정이 무너진다.
const index = visible
    .slice()
    .reverse()
    .map((p) => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        lastmod: p.lastmod,
        categories: p.categories,
        tags: p.tags,
        image: p.image,
        excerpt: p.body
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[#>*`|-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160),
    }));
// data/ 판 = 서빙본 (rsync 로 /apps/karmolab/data/ 에 실린다). 커밋 X — 배포마다 새로 (gitignore).
fs.writeFileSync(path.join(APP_ROOT, 'data', 'posts-index.json'), JSON.stringify(index, null, 1));

// 목록 장은 안 찍는다 — 목록의 집은 앱 안 커뮤니티 「글」 판이다 (post-page.mjs 머리말).
// 피드 · 소개 · 404 도 함께 굽는다.
fs.writeFileSync(path.join(OUT, 'feed.xml'), feedXml(index));
/* 404 도 다른 장과 **같은 셸**을 쓴다 (change.blog-surfaces-as-widgets) — 여기만 제 CSS 를
   들고 다니면, 길을 잃은 사람이 도착하는 자리가 사이트에서 제일 낯선 곳이 된다.
   본문이 이미 박혀 있으므로 위젯은 안 싣는다(asStaticPage). */
{
    let page = shellCommon(SHELL, { permalink: '/404.html', lastModified: new Date().toISOString(), bootPaths: [] });
    page = page.replace(/<title>[\s\S]*?<\/title>/, '<title>404 | KarmoDDrine</title>');
    page = asStaticPage(page, { kind: 'notfound', bodyHtml: notFoundBody(), head: '<meta name="robots" content="noindex">' });
    // 없는 주소가 사이트맵에 실리면 안 된다 — Jekyll 이 이 앞머리를 읽는다.
    page = page.replace('permalink: /404.html\n', 'permalink: /404.html\nsitemap: false\n');
    fs.writeFileSync(path.join(OUT, '404.html'), page);
}

// 글 그래프 — 글 사이 링크를 판으로 (change.blog-finish ②, 옛 build-post-graph.cjs 승계).
// 공개 글만 싣는다 (hidden 열거 방지 — 목록·색인과 같은 규율). postgraph 위젯이 읽는다.
{
    const slugSet = new Set(visible.map((p) => p.slug));
    const links = [];
    for (const post of visible) {
        const targets = new Set(
            [...post.body.matchAll(/\]\(\/posts\/([^/)#?]+)\/?[^)]*\)/g)].map((m) => m[1]).filter((s) => slugSet.has(s) && s !== post.slug)
        );
        for (const target of targets) links.push({ source: post.slug, target, kind: 'link' });
    }
    const graph = {
        version: 1,
        nodes: visible.map((p) => ({
            id: p.slug,
            label: p.title,
            href: `/posts/${p.slug}/`,
            ...(p.categories[0] ? { group: p.categories[0] } : {}),
        })),
        links,
    };
    const graphDest = path.join(APP_ROOT, '..', 'blog', 'assets', 'js', 'data', 'post-graph.json');
    fs.mkdirSync(path.dirname(graphDest), { recursive: true });
    fs.writeFileSync(graphDest, JSON.stringify(graph));
    console.log(`[gen-post-pages] 글 그래프 — 마디 ${graph.nodes.length} · 간선 ${links.length}`);
}

/** 소개 장이 쓸 작업물 요약 — 아래 작업물 블록이 채운다 (두 장이 한 자료를 본다). */
let worksRows = [];

// 작업물 — 전시 목록 정본 = apps/blog/_data/works.yml (큐레이션 순서 그대로, change.blog-finish ③).
// 읽는 규칙·흘린 이력 = scripts/lib/works-list.mjs. hidden 글도 목록에 있으면 의도된 전시다.
// 그리는 쪽 = `src/widgets/works.ts` **위젯 하나** (change.blog-surfaces-as-widgets) — 여기서는
// 그 위젯이 읽을 원료(data/works.json)와, 그 위젯을 부팅하는 장(/works/)만 만든다.
{
    const worksSrc = path.join(APP_ROOT, '..', 'blog', '_data', 'works.yml');
    if (fs.existsSync(worksSrc)) {
        const bySlug = new Map(posts.map((p) => [p.slug, p]));
        const entries = parseWorksYml(fs.readFileSync(worksSrc, 'utf8'));
        const { works, skipped } = buildWorks(entries, bySlug);
        const worksLastmod = works.length ? posts.filter((p) => works.some((w) => w.slug === p.slug)).map((p) => p.lastmod ?? p.date).sort().at(-1) : null;

        /* 항목 하나를 **카드감**으로 다듬는다.
         *
         * ① 사진 주소에 CDN 을 입히는 것은 여기까지다 — 위젯은 받은 주소를 그대로 건다.
         * ② 때는 **글의 date** 를 정본으로 쓴다. 옛 `works.yml` 의 `date:` 는 `2411~` ·
         *    `2311, 2411.` · `Last Update : 250511.` 처럼 사람이 적은 대로라 정렬도 묶음도
         *    안 됐다(실측: 46건 중 형식이 다섯 가지). 기간은 글의 `work.period` 가 든다.
         * ③ 제목의 `VRChat - ` 접두는 뗀다 — 플랫폼은 배지가 말한다. 제목 자체(색인)는 안 건드린다.
         * ④ 소속·역할·플랫폼 = 글 frontmatter 의 `work:` (없으면 빈 값으로 두고 검사가 센다).
         */
        const rows = works.map((w) => {
            const post = w.slug ? bySlug.get(w.slug) : null;
            /* 글이 있으면 글의 `work:` 가 정본, 없으면(바깥 링크) `works.yml` 항목 자신이 정본. */
            const meta = post?.work ?? { field: w.field, org: w.org, roles: w.role ?? [], platform: w.platform, period: w.period };
            const period = meta.period || null;
            const at = period ? period.split('~')[0].trim() : (post?.date ?? w.date ?? '').slice(0, 7);
            return {
                ...w,
                title: w.title.replace(/^VRChat\s*-\s*/, ''),
                image: w.image ? (w.image.startsWith('/') ? `${CDN}${w.image}` : w.image) : '',
                at, // YYYY-MM — 정렬·연도 묶음은 이 값 하나로 한다
                period,
                ongoing: period ? period.trim().endsWith('~') : false,
                field: meta.field || '',
                org: meta.org || '',
                roles: meta.roles ?? [],
                platform: meta.platform || ''
            };
        });
        /* 소품 — 따로 글을 안 쓴 참여작. 정본은 그 목록 글 하나이고, 여기서 자료로 읽는다.
           카드 한 장 뒤에 27건이 숨어 있던 것을 작업물 장이 직접 펴게 하는 자리다. */
        const minorPost = posts.find((p) => p.slug === 'works');
        const minor = minorPost ? parseMinorWorks(minorPost.body) : [];
        worksRows = rows;
        fs.writeFileSync(
            path.join(APP_ROOT, 'data', 'works.json'),
            JSON.stringify({ works: rows, minor }, null, 1)
        );

        /* 색인용 텍스트 — 이 장은 스크립트가 그리므로, 카드에 적힌 말이 첫 HTML 에 하나도
           없으면 검색엔진에는 빈 장이 된다. 제목·연도·설명만 셸의 SEO 자리에 남긴다. */
        const seo =
            `<section class="tool-seo"><h2>작업물 ${rows.length}건</h2><ul>` +
            rows
                .map(
                    (w) =>
                        `<li><a href="${shellEsc(w.url)}">${shellEsc(w.title)}</a>` +
                        `${w.at ? ` <span>${shellEsc(w.period ?? w.at)}</span>` : ''}` +
                        `${w.field ? ` · ${shellEsc(w.field)}` : ''}` +
                        `${w.org ? ` (${shellEsc(w.org)})` : ''}` +
                        `${w.roles.length ? ` · ${shellEsc(w.roles.join(', '))}` : ''}` +
                        `${w.description ? ` — ${shellEsc(w.description)}` : ''}</li>`
                )
                .join('') +
            '</ul>' +
            (minor.length
                ? `<h2>그 외 참여 ${minor.length}건</h2><ul>` +
                  minor
                      .map(
                          (m) =>
                              `<li>${shellEsc(m.title)}` +
                              `${m.when ? ` <span>${shellEsc(m.when)}</span>` : ''}` +
                              `${m.client ? ` · ${shellEsc(m.client)}` : ''}` +
                              `${m.role ? ` · ${shellEsc(m.role)}` : ''}</li>`
                      )
                      .join('') +
                  '</ul>'
                : '') +
            '</section>';

        fs.mkdirSync(path.join(OUT, 'works'), { recursive: true });
        fs.writeFileSync(
            path.join(OUT, 'works', 'index.html'),
            widgetPage({
                widget: 'works',
                permalink: '/works/',
                title: '작업물',
                heading: '작업물',
                description: `카모뜨린의 작업물 ${rows.length}건 — 게임·VRChat 콘텐츠·도구`,
                lastmod: worksLastmod ?? new Date().toISOString(),
                seoHtml: seo
            })
        );
        console.log(
            `[gen-post-pages] 작업물 ${works.length}건 / 정본 ${entries.length}건 · 소품 ${minor.length}건` +
                `${skipped.length ? ` (카드 못 만든 것 ${skipped.length}: ${skipped.join(' ')})` : ''}`
        );
    }
}

/**
 * 소속별 한 줄 — 「언제부터 언제까지 · 몇 건」과 그 판으로 가는 길.
 * 여기서 개별 작업을 다시 나열하지 않는다. 그것이 두 곳에 같은 말을 적던 옛 문제다.
 */
function worksSummary() {
    if (!worksRows.length) return '';
    const groups = new Map();
    for (const w of worksRows) {
        if (!w.at) continue;
        /* 소속을 안 적은 것(왁타 밖 의뢰 등)은 한 칸에 모은다 — 갈래 이름을 소속인 척 쓰면
           「버추얼」이 회사 이름 자리에 앉아 읽는 사람이 헷갈린다. */
        const key = w.org || '그 밖';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(w);
    }
    const human = (at) => at.replace('-', '.');
    const order = ['개인', '패러블 엔터테인먼트', '왁타버스', '그 밖'];
    const rank = (name) => {
        const at = order.indexOf(name);
        return at === -1 ? order.length : at; // 표에 없는 이름은 뒤로 — 앞으로 튀어나오지 않게
    };
    const lines = [...groups.entries()]
        .sort((a, b) => {
            const gap = rank(a[0]) - rank(b[0]);
            return gap !== 0 ? gap : b[1].length - a[1].length;
        })
        .map(([org, list]) => {
            const times = list.map((w) => w.at).sort();
            const ongoing = list.some((w) => w.ongoing);
            const span = `${human(times[0])} ~ ${ongoing ? '지금' : human(times[times.length - 1])}`;
            return `- **${org}** — ${span} · ${list.length}건`;
        });
    return ['#### 작업물로 본 자취', '', ...lines, '', '자세한 것은 [작업물](/works/)에.'].join('\n');
}

// 소개 — 원문 = content/about.md (Chirpy _tabs/about.md 승계본, git 추적).
// 그리는 쪽 = `src/widgets/about.ts`. 여기서는 렌더본(data/about.json)과 부팅 장(/about/)만 만든다.
const aboutSrc = path.join(APP_ROOT, 'content', 'about.md');
if (fs.existsSync(aboutSrc)) {
    const raw = fs.readFileSync(aboutSrc, 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
    const lastmod = m ? (/last_modified_at:\s*(\S+)/.exec(m[1])?.[1] ?? null) : null;
    /* `<!-- works:by-org -->` 자리는 **작업물 자료가 채운다** (change.blog-surfaces-as-widgets ③).
       예전에는 소개 글이 개별 작업을 손으로 나열했다 — 작업물 목록과 같은 말을 두 곳에 적으니
       한쪽만 고쳐지고, 실제로 소개는 「총 1년 9개월」인데 목록은 다른 구간을 가리키고 있었다.
       이제 소개는 「어디서·무슨 역할」만 들고, 무엇을 만들었는지는 작업물 장이 답한다. */
    const md = (m ? raw.slice(m[0].length) : raw).replace('<!-- works:by-org -->', worksSummary());
    const body = applyCdn(renderMarkdown(md, { trust: 'self', marked }));
    /* 조각은 **JSON 으로** 싣는다 — `data/*.html` 을 두면 화면 검사(csp-meta 등)가 이것을
       한 장의 화면으로 오해한다. 머리말이 없는 본문 조각이라 그 검사가 맞을 수 없다. */
    fs.writeFileSync(path.join(APP_ROOT, 'data', 'about.json'), JSON.stringify({ html: body }));
    fs.mkdirSync(path.join(OUT, 'about'), { recursive: true });
    fs.writeFileSync(
        path.join(OUT, 'about', 'index.html'),
        widgetPage({
            widget: 'about',
            permalink: '/about/',
            title: '소개',
            heading: null,
            description: '카모뜨린 KarmoDDrine — 유니티 게임 개발·VRChat 콘텐츠 제작',
            lastmod: lastmod ?? new Date().toISOString(),
            // 소개는 본문 자체가 색인감이다 — 렌더본을 그대로 SEO 자리에 남긴다.
            /* 색인용 사본 — 큰제목은 한 장에 하나여야 하므로 낮춰 싣는다 (KL-089). */
            seoHtml: `<section class="tool-seo">${body.replace(/<(\/?)h1(\s|>)/g, '<$1h2$2')}</section>`
        })
    );
}

/* 무게 계약이 바뀌었다 (change.board-unify ②) — 경량 셸(≤2)에서 앱 셸로 옮겼으므로
   여기 문턱도 같이 옮긴다. 그냥 지우지는 않는다: 문턱이 없으면 다음에 누가 무엇을 더 실어도
   아무도 모른다. 도구 상세 장과 같은 자리(≤16)에서 다시 잰다. */
if (maxExternal > 16) {
    console.error(`[gen-post-pages] ✗ 장당 바깥 리소스 ${maxExternal}개 — 앱 셸 계약(≤16)을 깼다`);
    process.exit(1);
}
console.log(
    `[gen-post-pages] ${posts.length}장 (숨김 ${posts.length - visible.length}) → ${path.relative(APP_ROOT, OUT)} · ` +
        `색인 data/posts-index.json ${index.length}건(공개만) · 목록/피드 · 장당 바깥 리소스 최대 ${maxExternal}`
);
