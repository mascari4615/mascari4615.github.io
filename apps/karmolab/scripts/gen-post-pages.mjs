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
import { postBody, postHead, blogIndexPages, aboutPage, worksPage, notFoundPage, feedXml, applyCdn } from './lib/post-page.mjs';
import { parseWorksYml, buildWorks } from './lib/works-list.mjs';
import { loadShell, shellCommon, replaceMeta, asStaticPage, esc as shellEsc } from './lib/shell-page.mjs';

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

// 목록 = `/`(canonical 본체) + `/posts/`(옛 링크 호환, sitemap 제외).
// Search Console 에서 Google 이 홈을 대표 주소로 골랐는데 선언은 `/posts/`를 가리켜 신호가
// 갈라졌다. 둘 다 같은 목록을 내므로 홈 하나로 모은다. 피드 · 소개 · 404도 함께 굽는다.
const blogIndexes = blogIndexPages(index);
fs.writeFileSync(path.join(OUT, 'posts', 'index.html'), blogIndexes.legacyPosts);
fs.writeFileSync(path.join(OUT, 'index.html'), blogIndexes.home);
fs.writeFileSync(path.join(OUT, 'feed.xml'), feedXml(index));
fs.writeFileSync(path.join(OUT, '404.html'), notFoundPage());

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

// 작업물 — 전시 목록 정본 = apps/blog/_data/works.yml (큐레이션 순서 그대로, change.blog-finish ③).
// 읽는 규칙·흘린 이력 = scripts/lib/works-list.mjs. hidden 글도 목록에 있으면 의도된 전시다.
{
    const worksSrc = path.join(APP_ROOT, '..', 'blog', '_data', 'works.yml');
    if (fs.existsSync(worksSrc)) {
        const bySlug = new Map(posts.map((p) => [p.slug, p]));
        const entries = parseWorksYml(fs.readFileSync(worksSrc, 'utf8'));
        const { works, skipped } = buildWorks(entries, bySlug);
        const worksLastmod = works.length ? posts.filter((p) => works.some((w) => w.slug === p.slug)).map((p) => p.lastmod ?? p.date).sort().at(-1) : null;
        fs.mkdirSync(path.join(OUT, 'works'), { recursive: true });
        fs.writeFileSync(path.join(OUT, 'works', 'index.html'), worksPage(works, worksLastmod));
        console.log(`[gen-post-pages] 작업물 ${works.length}건 / 정본 ${entries.length}건${skipped.length ? ` (카드 못 만든 것 ${skipped.length}: ${skipped.join(' ')})` : ''}`);
    }
}

// 소개 — 원문 = content/about.md (Chirpy _tabs/about.md 승계본, git 추적).
const aboutSrc = path.join(APP_ROOT, 'content', 'about.md');
if (fs.existsSync(aboutSrc)) {
    const raw = fs.readFileSync(aboutSrc, 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
    const lastmod = m ? (/last_modified_at:\s*(\S+)/.exec(m[1])?.[1] ?? null) : null;
    const body = applyCdn(renderMarkdown(m ? raw.slice(m[0].length) : raw, { trust: 'self', marked }));
    fs.mkdirSync(path.join(OUT, 'about'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'about', 'index.html'), aboutPage(body, lastmod));
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
