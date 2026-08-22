/**
 * 커뮤니티 위젯의 「글」 탭 — 블로그 목록 (TASK-KL-355, 이관 Phase 2).
 *
 * 블로그와 커뮤니티는 **읽는 면을 공유**하고 저장소는 갈라져 있다 (KL-351 확정):
 * 커뮤니티 글 = yawnbot API(런타임), 블로그 글 = git .md → 빌드가 찍은 색인
 * (`/apps/karmolab/data/posts-index.json`, 공개 글만). 여기는 그 색인을 그려 주는 목록이고,
 * 글 읽기는 정적 장(`/posts/<slug>/`)으로 간다 — Chirpy 병행 중 앱 안에서 본문을 긁으면
 * Chirpy DOM 에 얽힌 임시 패치가 되므로, 본문 앱 내 렌더는 컷오버 뒤에 승격한다.
 */
import { t } from '../lib/i18n';
import { activateYoutubeCards } from '../lib/markdown/render';

interface PostRow {
    slug: string;
    title: string;
    date: string;
    categories: string[];
    tags: string[];
    excerpt: string;
}

Mdd.injectCSS(
    'community-blog',
    `
    .cb-blog-filter { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 12px; }
    .cb-blog-filter input { flex:1; min-width:160px; background:var(--bg-secondary);
        border:1px solid var(--bg-tertiary); border-radius:8px; color:var(--text-primary); padding:8px 12px; }
    .cb-blog-chip { background:none; border:1px solid var(--bg-tertiary); border-radius:999px;
        color:var(--text-secondary); padding:4px 12px; cursor:pointer; font-size:13px; }
    .cb-blog-chip.on { border-color:var(--accent); color:var(--accent); }
    .cb-blog-list { list-style:none; margin:0; padding:0; }
    .cb-blog-list li { border-bottom:1px solid var(--bg-tertiary); }
    .cb-blog-list a { display:block; padding:12px 2px; color:inherit; text-decoration:none; }
    .cb-blog-list a:hover .cb-blog-title { color:var(--accent); }
    .cb-blog-title { display:block; font-weight:600; }
    .cb-blog-meta { display:block; font-size:13px; color:var(--text-tertiary); margin-top:2px; }
    .cb-blog-excerpt { display:block; font-size:14px; color:var(--text-secondary); margin-top:4px; }
    .cb-blog-note { color:var(--text-tertiary); font-size:14px; padding:16px 2px; }
    .cb-blog-back { background:none; border:1px solid var(--bg-tertiary); border-radius:8px;
        color:var(--text-secondary); padding:4px 12px; cursor:pointer; margin:0 0 12px; }
    .cb-blog-article { max-width:760px; line-height:1.75; }
    .cb-blog-article h1 { font-size:26px; }
    .cb-blog-article img { max-width:100%; height:auto; border-radius:8px; }
    .cb-blog-article pre { background:var(--bg-secondary); border:1px solid var(--bg-tertiary);
        border-radius:8px; padding:14px; overflow-x:auto; font-size:14px; }
    .cb-blog-article blockquote { margin:16px 0; padding:2px 16px; border-left:3px solid var(--bg-tertiary); color:var(--text-secondary); }
    .cb-blog-article table { border-collapse:collapse; display:block; overflow-x:auto; }
    .cb-blog-article th, .cb-blog-article td { border:1px solid var(--bg-tertiary); padding:6px 12px; }
    .cb-blog-article .md-callout { border-left-color:var(--accent); background:var(--bg-secondary); border-radius:0 8px 8px 0; }
    .cb-blog-article .md-callout-tag { font-weight:600; color:var(--accent); margin:10px 0 2px; }
    .cb-blog-article .md-yt { position:relative; display:block; max-width:560px; margin:16px 0; }
    .cb-blog-article .md-yt img { width:100%; border-radius:12px; display:block; }
    .cb-blog-article .md-yt-play { position:absolute; inset:0; display:flex; align-items:center;
        justify-content:center; font-size:44px; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.7); }
    .cb-blog-article .md-yt-frame { width:100%; max-width:560px; aspect-ratio:16/9; border:0; border-radius:12px; margin:16px 0; }
`
);

export function buildBlogTab(container: HTMLElement): void {
    container.innerHTML = `<p class="cb-blog-note">${t('community.blog.loading', undefined, '글 목록을 불러오는 중…')}</p>`;

    void fetch('/apps/karmolab/data/posts-index.json')
        .then((response) => {
            if (response.ok === false) throw new Error(`http ${response.status}`);
            return response.json() as Promise<PostRow[]>;
        })
        .then((posts) => render(container, posts))
        .catch(() => {
            container.innerHTML = `<p class="cb-blog-note">${t(
                'community.blog.offline',
                undefined,
                '글 색인을 못 받았다 — 잠시 뒤 다시 열어 보라.'
            )}</p>`;
        });
}

/** 글 한 편을 탭 안에서 — 정적 장(`/posts/<slug>/`)을 받아 본문만 뽑아 그린다. */
async function openInTab(container: HTMLElement, posts: PostRow[], slug: string): Promise<void> {
    const staticUrl = `/posts/${encodeURIComponent(slug)}/`;
    let article: { title: string; meta: string; body: string };
    try {
        const response = await fetch(staticUrl);
        if (response.ok === false) throw new Error(`http ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const body = doc.querySelector('.post-body');
        const title = doc.querySelector('h1');
        if (!body || !title) throw new Error('post-body 없음');
        article = {
            title: title.textContent ?? slug,
            meta: doc.querySelector('.post-meta')?.textContent ?? '',
            body: body.innerHTML,
        };
    } catch {
        location.href = staticUrl; // 못 받으면(개발 서버·회선) 정적 장으로 — 막다른 길은 없다
        return;
    }

    container.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'cb-blog-back';
    back.textContent = t('community.blog.back', undefined, '◂ 글 목록');
    back.addEventListener('click', () => render(container, posts));

    const wrap = document.createElement('article');
    wrap.className = 'cb-blog-article';
    const heading = document.createElement('h1');
    heading.textContent = article.title;
    const meta = document.createElement('p');
    meta.className = 'cb-blog-meta';
    meta.textContent = article.meta;
    const body = document.createElement('div');
    // 내 정적 장에서 온 내 마크업이다 (trust self 렌더 산출) — 그대로 꽂는다.
    body.innerHTML = article.body;
    activateYoutubeCards(body);

    const permalink = document.createElement('p');
    permalink.innerHTML = `<a href="${staticUrl}" target="_blank" rel="noopener">↗ ${t(
        'community.blog.open-static',
        undefined,
        '글 페이지에서 보기 (댓글)'
    )}</a>`;

    wrap.append(heading, meta, body, permalink);
    container.append(back, wrap);
    container.scrollIntoView({ block: 'start' });
}

function render(container: HTMLElement, posts: PostRow[]): void {
    const categories = [...new Set(posts.map((p) => p.categories[0]).filter(Boolean))];

    const filter = document.createElement('div');
    filter.className = 'cb-blog-filter';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('community.blog.search', undefined, '제목·카테고리 찾기');
    search.setAttribute('aria-label', search.placeholder);
    filter.appendChild(search);

    const list = document.createElement('ul');
    list.className = 'cb-blog-list';

    let activeCategory = '';
    let query = '';
    const rows: { el: HTMLLIElement; category: string; text: string }[] = [];

    for (const post of posts) {
        const li = document.createElement('li');
        const categoryPath = post.categories.join(' › ');
        li.innerHTML =
            `<a href="/posts/${encodeURIComponent(post.slug)}/">` +
            `<span class="cb-blog-title"></span>` +
            `<span class="cb-blog-meta">${categoryPath
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')} · <time datetime="${post.date}">${post.date.slice(0, 10)}</time></span>` +
            (post.excerpt ? `<span class="cb-blog-excerpt"></span>` : '') +
            `</a>`;
        // 제목·발췌는 textContent 로 — 색인은 내 글이지만, 넣는 길을 하나로 굳혀 두면 실수가 없다.
        (li.querySelector('.cb-blog-title') as HTMLElement).textContent = post.title;
        const excerptEl = li.querySelector('.cb-blog-excerpt');
        if (excerptEl) excerptEl.textContent = post.excerpt;
        // 탭 안에서 바로 읽는다 (change.blog-finish ⑤) — 컷오버 뒤라 정적 장도 우리 마크업이다.
        // 못 받으면(개발 서버 등) 막지 않고 정적 장으로 보낸다.
        li.querySelector('a')?.addEventListener('click', (event) => {
            event.preventDefault();
            void openInTab(container, posts, post.slug);
        });
        list.appendChild(li);
        rows.push({
            el: li,
            category: post.categories[0] ?? '',
            text: `${post.title} ${categoryPath}`.toLowerCase(),
        });
    }

    const apply = (): void => {
        for (const row of rows) {
            const byCategory = activeCategory === '' || row.category === activeCategory;
            const byQuery = query === '' || row.text.includes(query);
            row.el.style.display = byCategory && byQuery ? '' : 'none';
        }
    };

    for (const category of categories) {
        const chip = document.createElement('button');
        chip.className = 'cb-blog-chip';
        chip.textContent = category;
        chip.addEventListener('click', () => {
            const wasOn = chip.classList.contains('on');
            filter.querySelectorAll('.cb-blog-chip.on').forEach((el) => el.classList.remove('on'));
            activeCategory = wasOn ? '' : category;
            if (wasOn === false) chip.classList.add('on');
            apply();
        });
        filter.appendChild(chip);
    }
    search.addEventListener('input', () => {
        query = search.value.trim().toLowerCase();
        apply();
    });

    container.innerHTML = '';
    container.appendChild(filter);
    container.appendChild(list);
}
