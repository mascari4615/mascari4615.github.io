/**
 * 사이트 조립기. Jekyll 의 마지막 세 가지 일을 Node 로 (change.blog-finish ①).
 *
 * 컷오버(change.blog-cutover) 뒤 Jekyll 이 하던 일은 셋뿐이었다:
 *  ① 머리말(front matter) 처리. `permalink` 자리로 옮기고 머리말을 뗀다
 *  ② sitemap.xml 생성. jekyll-sitemap + `_plugins/sitemap-*.rb` 4종의 좁히기 규율
 *  ③ 나머지 정적 파일을 _site 로 복사
 * 그 셋을 여기로 옮긴다. 이 파일이 살면 Ruby, Gemfile, _config.yml, _plugins 전부가 죽는다.
 *
 * ## 이식한 사이트맵 규율 (원본 = 삭제된 _plugins/*.rb. git 이력 0919e7f8f 이전)
 *  - focus (TASK-KL-349/350): `/en/**`, `/ja/**` 제외, `tools-seo.json` 항목 700자 미만 도구 장
 *    제외. 단 **모이는 자리 면제**. noindex 넘김 장이 canonical 로 가리키는 도구는 얇아도 싣는다
 *    (열일곱 글 도구의 목적지가 유배됐던 사고의 재발 방지).
 *  - drop-thin: `/tags/*`, `/categories/*`, `assets/doc/**` (컷오버로 소멸. 방어선으로 유지)
 *  - drop-paginated: `/page<N>/` (동)
 *  - drop-noindex: 본문에 `<meta name="robots" ... noindex>` 가 있는 장
 *  - lastmod: 머리말 `last_modified_at` → 없으면 원본 파일의 git 마지막 커밋 시각 →
 *    그것도 없으면(생성 산출물) 조립 시각. 비면 배포가 선다 (audit-sitemap-lastmod).
 *
 * 사용: node scripts/assemble-site.mjs [--site ../blog] [--out ../blog/_site]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argOf = (name, fallback) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? path.resolve(process.argv[at + 1]) : fallback;
};
const SITE_SRC = argOf('--site', path.join(APP_ROOT, '..', 'blog'));
const OUT = argOf('--out', path.join(SITE_SRC, '_site'));
const BASE_URL = 'https://blog.mascari4615.com';
const FOCUS_MIN_SEO_CHARS = 700;

/** 조립에 안 실리는 것. 소스 관리 파일. (Jekyll exclude 의 후계. _data = works.yml 등 원료) */
const SKIP = /^(_site|\.git|\.jekyll-cache|node_modules|_data|_plugins|_config\.yml|Gemfile|README|LICENSE)|\.gemspec$/;

// ---------------------------------------------------------------- ① + ③ 걷고 놓기

function walk(dir, rel = '') {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (SKIP.test(relPath)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, relPath));
        else out.push(relPath);
    }
    return out;
}

/** 머리말 한 장 읽기. 이 사이트의 머리말은 permalink, last_modified_at, sitemap 세 키뿐이다. */
function readFrontMatter(text) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return null;
    const get = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(m[1])?.[1]?.trim() ?? null;
    return {
        body: text.slice(m[0].length),
        permalink: get('permalink'),
        lastmod: get('last_modified_at'),
        sitemapOff: get('sitemap') === 'false',
        // permalink 없는 머리말 = 옮길 곳을 모른다. 조용히 제자리에 두면 두 벌이 되므로 세운다.
    };
}

/** permalink → _site 안 실제 파일 경로. `/x/` = 폴더 index, 확장자 있으면 그 파일 그대로. */
function destOf(permalink) {
    if (permalink.endsWith('/')) return path.join(OUT, permalink, 'index.html');
    return path.join(OUT, permalink);
}

function gitLastmod(relPath) {
    try {
        const iso = execFileSync('git', ['log', '-1', '--pretty=%aI', '--', relPath], {
            cwd: SITE_SRC,
            encoding: 'utf8',
        }).trim();
        return iso || null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------- ② 사이트맵 규율

const NOINDEX = /<meta[^>]+name\s*=\s*["']robots["'][^>]*noindex/i;
const CANONICAL_TOOL = /<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/t\/([^/"']+)\//i;
const TOOL_URL = /^\/t\/([^/]+)\/$/;

/** 얇은 도구 명단. tools-seo.json 항목 700자 미만. 못 읽으면 아무것도 안 뺀다 (넓은 쪽이 안전). */
function thinToolIds() {
    try {
        const tools = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data', 'tools-seo.json'), 'utf8')).tools ?? {};
        const thin = Object.keys(tools).filter((id) => JSON.stringify(tools[id]).length < FOCUS_MIN_SEO_CHARS);
        console.log(`[assemble] 도구 ${Object.keys(tools).length}개 중 ${Object.keys(tools).length - thin.length}개가 ${FOCUS_MIN_SEO_CHARS}자 문턱을 넘었다`);
        return new Set(thin);
    } catch (error) {
        console.warn(`[assemble] tools-seo.json 을 못 읽었다 (${error.message}). 도구 장은 하나도 안 뺀다`);
        return null;
    }
}

/** 사이트맵에 실을 것인가. 이식한 좁히기 전부. pages = {url, html, sitemapOff}. */
function sitemapEligible(page, thin, hubs) {
    if (page.sitemapOff) return false;
    const url = page.url;
    if (/^\/(en|ja)\//.test(url)) return false; // focus. 언어 판
    if (/^\/(tags|categories)\/[^/]+\/?$/.test(url)) return false; // drop-thin
    if (/^\/page\d+\/?$/.test(url)) return false; // drop-paginated
    if (/^\/assets\/doc\//.test(url)) return false; // drop-thin (파일)
    if (NOINDEX.test(page.html)) return false; // drop-noindex
    const tool = url.match(TOOL_URL);
    if (tool && thin && thin.has(tool[1]) && hubs.has(tool[1]) === false) return false; // focus. 얇은 도구 (모이는 자리 면제)
    return true;
}

// ---------------------------------------------------------------- 조립

const started = new Date().toISOString();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const pages = []; // 사이트맵 후보 (html 만)
let processed = 0;
let copied = 0;

for (const rel of walk(SITE_SRC)) {
    const full = path.join(SITE_SRC, rel);
    const head = fs.readFileSync(full);
    const isText = /\.(html|xml|txt|json|js|css|webmanifest|md)$/i.test(rel);
    const text = isText ? head.toString('utf8') : null;
    const fm = text !== null && text.startsWith('---') ? readFrontMatter(text) : null;

    if (fm) {
        if (!fm.permalink) {
            console.error(`[assemble] ✗ ${rel}: 머리말에 permalink 가 없다. 어디 놓을지 모른다`);
            process.exit(1);
        }
        const dest = destOf(fm.permalink);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, fm.body);
        processed += 1;
        if (dest.endsWith('.html')) {
            const url = fm.permalink.endsWith('/') ? fm.permalink : fm.permalink;
            pages.push({
                url,
                html: fm.body,
                sitemapOff: fm.sitemapOff,
                lastmod: fm.lastmod ?? gitLastmod(rel) ?? started,
            });
        }
    } else {
        const dest = path.join(OUT, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(full, dest);
        copied += 1;
        // 머리말 없는 .html (daily 산출물, 검증 파일 등)도 사이트맵 후보다. jekyll-sitemap 이 그랬다.
        if (rel.endsWith('.html')) {
            const url = '/' + rel.replace(/index\.html$/, '').replace(/\\/g, '/');
            pages.push({ url, html: text ?? '', sitemapOff: false, lastmod: gitLastmod(rel) ?? started });
        }
    }
}

// 모이는 자리. noindex 넘김 장이 canonical 로 가리키는 도구 id (focus 면제).
const hubs = new Set();
for (const page of pages) {
    if (NOINDEX.test(page.html) === false) continue;
    const target = page.html.match(CANONICAL_TOOL);
    if (!target) continue;
    const self = page.url.match(TOOL_URL);
    if (self && self[1] === target[1]) continue; // 자기 자신은 넘김이 아니다
    hubs.add(target[1]);
}
if (hubs.size) console.log(`[assemble] 모이는 자리라 문턱 면제. ${[...hubs].sort().join(' ')}`);

const thin = thinToolIds();
const listed = pages.filter((p) => sitemapEligible(p, thin, hubs));
const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    listed
        .map((p) => `<url>\n<loc>${BASE_URL}${p.url}</loc>\n<lastmod>${p.lastmod}</lastmod>\n</url>`)
        .join('\n') +
    `\n</urlset>\n`;
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), xml);

console.log(
    `[assemble] 머리말 장 ${processed}, 정적 복사 ${copied}, 사이트맵 ${listed.length}장 (후보 ${pages.length}) → ${path.relative(process.cwd(), OUT)}`
);
