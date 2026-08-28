/**
 * **작업물 전시 목록 읽기** — 정본 = `apps/blog/_data/works.yml`.
 *
 * 왜 손수 읽나: 이 저장소에 YAML 라이브러리가 없다. 항목마다 키 순서·빈 값 모양이 조금씩
 * 달라 한 방 정규식은 흘린다.
 *
 * ⚠ 컷오버(change.blog-cutover) 때 이 자리에서 카드 3장이 **조용히** 빠졌다 (2026-08-27 실측):
 *   - `url: "/posts/wakgreed/"` — 값에 따옴표가 붙은 모양을 못 읽었다 (2장)
 *   - 유튜브 링크 — 글이 아닌 **바깥 링크** 항목 자체를 안 받았다 (1장)
 * Chirpy 시절 Jekyll 은 yml 을 그대로 읽어 전부 그렸으므로 아무도 못 알아챘다.
 * 그래서 두 모양 다 시험으로 박아 둔다 (`test-works-list.mjs`).
 */

const unquote = (s) => s.trim().replace(/^["']|["']$/g, '').trim();

/**
 * yml 원문 → 항목 배열 (파일 순서 = 큐레이션 순서, 그대로 보존).
 * @param {string} text works.yml 원문
 * @returns {Array<{url:string,title:string,image:string,description:string,date:string,tags:string[]}>}
 */
export function parseWorksYml(text) {
    const entries = [];
    for (const line of text.split(/\r?\n/)) {
        const head = /^-\s*url:\s*(.*)$/.exec(line);
        if (head) {
            entries.push({ url: unquote(head[1]), title: '', image: '', description: '', date: '', tags: [], field: '', org: '', platform: '', period: '', role: [] });
            continue;
        }
        const last = entries[entries.length - 1];
        if (!last) continue;
        const listKey = /^\s+(tags|role):\s*\[([^\]]*)\]/.exec(line);
        if (listKey) {
            last[listKey[1]] = listKey[2].split(',').map((s) => unquote(s)).filter(Boolean);
            continue;
        }
        /* 바깥 링크(유튜브 등)는 글이 없으니 **여기가 그 항목의 유일한 집**이다 —
           소속·역할·플랫폼·기간도 여기서 읽는다 (글이 있는 항목은 글 frontmatter 가 정본). */
        const kv = /^\s+(date|title|image|description|field|org|platform|period):\s*(.*)$/.exec(line);
        if (kv) last[kv[1]] = unquote(kv[2]);
    }
    return entries;
}

/** `/posts/<slug>/` 면 slug, 바깥 링크면 null. */
export function slugOf(url) {
    return /^\/posts\/([^/\s]+)\//.exec(url)?.[1] ?? null;
}

/**
 * 항목에 글을 붙여 카드감으로 바꾼다. 카드를 못 만드는 것만 `skipped` 로 뺀다.
 * @param {ReturnType<typeof parseWorksYml>} entries
 * @param {Map<string, {title:string,image:string}>} bySlug 글 slug → 글
 */
export function buildWorks(entries, bySlug) {
    const skipped = [];
    const works = [];
    for (const e of entries) {
        const slug = slugOf(e.url);
        if (slug) {
            const post = bySlug.get(slug);
            // 글이 아직 없다(초안 등) — 카드를 못 만든다.
            if (!post) {
                skipped.push(slug);
                continue;
            }
            works.push({ ...e, slug, title: e.title || post.title, image: e.image || post.image });
            continue;
        }
        // 바깥 링크 — 글이 없으므로 제목이 정본에 적혀 있어야 카드가 된다.
        if (!e.title) {
            skipped.push(e.url);
            continue;
        }
        works.push({ ...e, slug: null });
    }
    return { works, skipped };
}
