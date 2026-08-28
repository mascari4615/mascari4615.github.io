/**
 * 작업물 — 전시 격자 (change.blog-surfaces-as-widgets).
 *
 * 전에는 `/works/` 한 장이 제 CSS·제 머리띠를 들고 앱 밖에 혼자 서 있었다. 그래서 앱
 * 첫 화면에서 작업물로 가는 길이 아예 없었다. 이제 그리는 쪽은 **이 위젯 하나**고,
 * `/works/` 장은 셸이 이 위젯을 부팅한 자리다 (도구 상세 127장과 같은 길).
 *
 * 원료 = `data/works.json` (배포 산출, `gen-post-pages.mjs`). 정본은 `apps/blog/_data/works.yml`.
 * 카드 순서 = 큐레이션 순서 그대로 — 여기서 다시 정렬하지 않는다.
 */
import { t, loadNamespace } from '../lib/i18n';

export interface WorkRow {
    url: string;
    slug: string | null;
    title: string;
    image: string;
    description: string;
    date: string;
    tags: string[];
}

(function (): void {
    const esc = (v: unknown): string =>
        String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    Mdd.injectCSS(
        'works',
        `
        .wk-wrap { display:flex; flex-direction:column; gap:16px; }
        .wk-filter { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .wk-filter input { flex:1; min-width:160px; background:var(--bg-secondary);
            border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-primary); padding:8px 12px; }
        .wk-chip { background:none; border:1px solid var(--border); border-radius:999px;
            color:var(--text-secondary); padding:4px 12px; cursor:pointer; font-size:13px; }
        .wk-chip.on { border-color:var(--accent); color:var(--accent); }
        .wk-count { color:var(--text-tertiary); font-size:13px; }
        .wk-grid { list-style:none; margin:0; padding:0; display:grid;
            grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
        .wk-grid a { display:block; color:inherit; text-decoration:none; background:var(--bg-secondary);
            border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden; }
        .wk-grid a:hover .wk-t { color:var(--accent); }
        .wk-grid img, .wk-ph { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; background:var(--bg-tertiary); }
        .wk-t { display:block; font-weight:600; padding:10px 12px 2px; }
        .wk-d { display:block; font-size:13px; color:var(--text-secondary); padding:2px 12px 0; }
        .wk-m { display:block; font-size:13px; color:var(--text-tertiary); padding:0 12px 12px; }
        .wk-empty { color:var(--text-tertiary); padding:40px; text-align:center; }
    `
    );

    let cache: WorkRow[] | null = null;

    /** 목록은 한 번만 받는다 — 탭을 오갈 때마다 다시 받으면 격자가 깜빡인다. */
    async function loadWorks(): Promise<WorkRow[] | null> {
        if (cache) return cache;
        try {
            const response = await fetch('/apps/karmolab/data/works.json');
            if (response.ok === false) return null;
            cache = (await response.json()) as WorkRow[];
            return cache;
        } catch {
            return null;
        }
    }

    function card(work: WorkRow): string {
        const external = !work.slug;
        const meta = `${work.date ?? ''}${work.tags.length ? ` · ${work.tags.join(', ')}` : ''}`;
        return (
            `<li><a href="${esc(work.url)}"${external ? ' target="_blank" rel="noopener"' : ''}>` +
            (work.image ? `<img src="${esc(work.image)}" alt="" loading="lazy">` : '<span class="wk-ph"></span>') +
            `<span class="wk-t">${esc(work.title)}${external ? ' ↗' : ''}</span>` +
            (work.description ? `<span class="wk-d">${esc(work.description)}</span>` : '') +
            `<span class="wk-m">${esc(meta)}</span>` +
            `</a></li>`
        );
    }

    function render(container: HTMLElement, works: WorkRow[]): void {
        const tags = [...new Set(works.flatMap((w) => w.tags))];

        const wrap = document.createElement('div');
        wrap.className = 'wk-wrap';

        const filter = document.createElement('div');
        filter.className = 'wk-filter';
        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = t('works.search', undefined, '제목·설명 찾기');
        search.setAttribute('aria-label', search.placeholder);
        const count = document.createElement('span');
        count.className = 'wk-count';
        filter.appendChild(search);

        const grid = document.createElement('ul');
        grid.className = 'wk-grid';
        grid.innerHTML = works.map(card).join('');

        const rows = [...grid.children].map((el, i) => ({
            el: el as HTMLElement,
            tags: works[i].tags,
            text: `${works[i].title} ${works[i].description}`.toLowerCase()
        }));

        let activeTag = '';
        let query = '';
        const apply = (): void => {
            let shown = 0;
            for (const row of rows) {
                const byTag = activeTag === '' || row.tags.indexOf(activeTag) >= 0;
                const byQuery = query === '' || row.text.includes(query);
                const ok = byTag && byQuery;
                row.el.style.display = ok ? '' : 'none';
                if (ok) shown += 1;
            }
            count.textContent = t('works.count', { n: String(shown) }, '{n}건');
        };

        for (const tag of tags) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'wk-chip';
            chip.textContent = tag;
            chip.addEventListener('click', () => {
                const wasOn = chip.classList.contains('on');
                filter.querySelectorAll('.wk-chip.on').forEach((el) => el.classList.remove('on'));
                activeTag = wasOn ? '' : tag;
                if (wasOn === false) chip.classList.add('on');
                apply();
            });
            filter.appendChild(chip);
        }
        filter.appendChild(count);
        search.addEventListener('input', () => {
            query = search.value.trim().toLowerCase();
            apply();
        });

        wrap.appendChild(filter);
        wrap.appendChild(grid);
        container.innerHTML = '';
        container.appendChild(wrap);
        apply();
    }

    Toolbox.register({
        ...(Toolbox.getLazyWidgetPublicMeta?.('works') ?? {}),
        id: 'works',
        tabs: [
            {
                id: 'app',
                label: t('widgets.works.title', undefined, '작업물'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('works').then(async () => {
                        const works = await loadWorks();
                        if (!works) {
                            container.innerHTML = `<div class="wk-empty">${esc(
                                t('works.failed', undefined, '작업물 목록을 못 받았습니다')
                            )}</div>`;
                            return;
                        }
                        render(container, works);
                    });
                }
            }
        ]
    });
})();
