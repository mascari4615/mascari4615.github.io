/**
 * 블로그 글 정적 장 찍기 (TASK-KL-354 — 이관 Phase 1).
 *
 * `content/posts/**`(표준 md — `convert:posts` 산출)를 읽어 `/posts/<slug>/` 한 장씩 찍는다.
 * 렌더러 = `src/lib/markdown/render.ts` **한 벌** (위젯과 같은 문). 셸 = `lib/post-page.mjs`
 * 경량 장 — 바깥 리소스 2개(GoatCounter·giscus lazy), 앱 셸 13개와 비교하면 크롤 예산 방어다.
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
import { postPage, applyCdn } from './lib/post-page.mjs';

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

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let maxExternal = 0;
for (const post of posts) {
    const rendered = applyCdn(renderMarkdown(post.body, { trust: 'self', marked }));
    const { html, toc } = addHeadingIds(rendered);
    const { prev, next } = neighborOf(post);
    const page = postPage(post, html, {
        toc,
        prev: prev && { slug: prev.slug, title: prev.title },
        next: next && { slug: next.slug, title: next.title },
    });

    // 무게 게이트 — 이 장이 바깥에서 받는 것(스크립트·스타일 링크) 수. 앱 셸로 회귀하면 여기가 선다.
    const external = (page.match(/<script[^>]+src=|<link[^>]+rel="stylesheet"/g) ?? []).length;
    maxExternal = Math.max(maxExternal, external);

    const dest = path.join(OUT, 'posts', post.slug, 'index.html');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, page);
}

// 색인 — 목록·검색·피드·커뮤니티 위젯 블로그 탭(Phase 2)의 원료.
const index = posts
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
        hidden: p.hidden,
        excerpt: p.body
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[#>*`|-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160),
    }));
fs.writeFileSync(path.join(APP_ROOT, 'content', 'posts-index.json'), JSON.stringify(index, null, 1));

if (maxExternal > 2) {
    console.error(`[gen-post-pages] ✗ 장당 바깥 리소스 ${maxExternal}개 — 경량 셸 계약(≤2)을 깼다`);
    process.exit(1);
}
console.log(
    `[gen-post-pages] ${posts.length}장 (숨김 ${posts.length - visible.length}) → ${path.relative(APP_ROOT, OUT)} · ` +
        `색인 content/posts-index.json · 장당 바깥 리소스 최대 ${maxExternal}`
);
