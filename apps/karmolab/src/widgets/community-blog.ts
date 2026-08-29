/**
 * 커뮤니티의 글 판. 블로그 목록 (change.board-unify ①).
 *
 * 블로그는 게시판들 사이의 **읽기전용 판**이다 (사용자 확정 2026-08-23):
 * 겉보기엔 다른 판과 같은 목록인데, 데이터만 git 글 색인
 * (`/apps/karmolab/data/posts-index.json`, 빌드 산출, 공개 글만)에서 오고
 * 글쓰기 단추가 없다. 이 판의 글쓰기는 git 커밋이다.
 *
 * 글을 누르면 **정적 장(`/posts/<slug>/`)으로 간다.** 앱 안 본문 렌더(구 글 탭의
 * openInTab)는 걷어냈다. 같은 본문을 두 군데서 그리면 댓글, 수식, 이음새가 갈라진다.
 * 정적 장이 게시판 테마를 입는 것은 ② 단계 (gen-post-pages 껍데기).
 */
import { t } from '../lib/i18n';
import { fromBlogRow, postDate, type KarmoPost } from '../lib/post-model';

export interface BlogPostRow {
    slug: string;
    title: string;
    date: string;
    categories: string[];
    tags: string[];
    excerpt: string;
}

export interface BlogBoardSummary {
    count: number;
    lastTitle: string | null;
    lastAt: string | null;
}

let cache: BlogPostRow[] | null = null;

/** 색인은 한 판 안에서 한 번만 받는다. 홈, 판을 오갈 때마다 다시 받으면 목록이 깜빡인다. */
export async function loadPostsIndex(): Promise<BlogPostRow[] | null> {
    if (cache) return cache;
    try {
        const response = await fetch('/apps/karmolab/data/posts-index.json');
        if (response.ok === false) return null;
        cache = (await response.json()) as BlogPostRow[];
        return cache;
    } catch {
        return null;
    }
}

export function blogBoardSummary(posts: BlogPostRow[]): BlogBoardSummary {
    const first = posts[0] ?? null;
    return { count: posts.length, lastTitle: first?.title ?? null, lastAt: first?.date ?? null };
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
    /* 목록 골격은 커뮤니티의 c-table, c-num, c-td-title 을 **그대로** 입는다 . 
       판마다 줄 모양이 다르면 게시판이 아니다. 여기서 새로 정하는 것은 분류 꼬리표 하나뿐.
       (제목 칸이 자기 규격을 안 쓰면 표가 글자 수만큼 좌우로 흔들린다. 2026-08-23 실측) */
    .cb-cat { flex:0 0 auto; color:var(--text-tertiary); font-size:11px; }
`
);

const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 판 본문. 찾기, 분류 칩 + 게시판 골격 목록. 줄을 누르면 정적 장으로 간다(주소만 다른 같은 게시판). */
export function buildBlogBoardBody(container: HTMLElement, posts: BlogPostRow[]): void {
    const categories = [...new Set(posts.map((p) => p.categories[0]).filter(Boolean))];

    const filter = document.createElement('div');
    filter.className = 'cb-blog-filter';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('community.blog.search', undefined, '제목, 카테고리 찾기');
    search.setAttribute('aria-label', search.placeholder);
    filter.appendChild(search);

    const table = document.createElement('table');
    table.className = 'c-table';
    table.innerHTML = `<thead><tr>
            <th class="c-num">${esc(t('community.blog.th-num', undefined, '번호'))}</th>
            <th class="c-th-title">${esc(t('community.blog.th-title', undefined, '제목'))}</th>
            <th class="c-when">${esc(t('community.blog.th-date', undefined, '날짜'))}</th>
        </tr></thead>`;
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    let activeCategory = '';
    let query = '';
    const rows: { el: HTMLTableRowElement; category: string; text: string }[] = [];

    /* 줄 하나는 글 모델 한 벌로 그린다 (change.post-model). 판마다 줄 모양이 갈리지 않게 */
    posts.forEach((row, i) => {
        const post: KarmoPost = fromBlogRow(row);
        const tr = document.createElement('tr');
        tr.innerHTML =
            `<td class="c-num">${posts.length - i}</td>` +
            `<td class="c-td-title"><a class="c-title-btn" href="${esc(post.href)}">` +
            `<span class="t"></span><span class="cb-cat">${esc(post.label)}</span></a></td>` +
            `<td class="c-when"><time datetime="${esc(post.at ?? '')}">${esc(postDate(post))}</time></td>`;
        // 제목은 textContent 로 (넣는 길 하나로 굳히기)
        (tr.querySelector('.c-title-btn .t') as HTMLElement).textContent = post.title;
        if (post.excerpt) tr.querySelector('a')?.setAttribute('title', post.excerpt);
        tbody.appendChild(tr);
        rows.push({ el: tr, category: row.categories[0] ?? '', text: `${post.title} ${post.label}`.toLowerCase() });
    });

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
    container.appendChild(table);
}
