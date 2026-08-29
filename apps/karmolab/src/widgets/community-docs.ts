/**
 * 커뮤니티의 문서 판 (change.docs-into-community).
 *
 * 옛 docs 위젯의 글을 옮겨 온 자리. 블로그 판과 같은 골격
 * 겉모습은 다른 판과 같은 목록, 데이터만 git, 글쓰기 단추 없음
 * 이 판의 글쓰기 = 커밋
 *
 * 데이터 두 갈래.
 *   - KarmoLab 문서: `data/docs/*.md` 와 저장소 README(GitHub raw)
 *   - 세계관: `world/wiki/manifest.json` 동적 walk (`sync-wiki.mjs` 산출)
 *
 * 본문은 앱 안에서 그림 (블로그와 달리 문서에는 정적 장 없음)
 * 목차, 도해, 실행판 = `lib/markdown/rich-view` 한 벌
 */
import { t, loadNamespace } from '../lib/i18n';
import { renderRichMarkdown, type RichViewLabels } from '../lib/markdown/rich-view';
import { fromDocEntry, type KarmoPost } from '../lib/post-model';

export const DOCS_BOARD_ID = 'docs';

type DocSource = { kind: 'local'; path: string } | { kind: 'github'; path: string } | { kind: 'wiki'; dir: string; slug: string };

export interface DocEntry {
    id: string;
    label: string;
    desc: string;
    group: string;
    source: DocSource;
}

export interface DocsBoardSummary {
    count: number;
}

const LOCAL_BASE = '/apps/karmolab/data/docs/';
const WIKI_BASE = '/apps/karmolab/world/wiki/';

/** 포크나 다른 가지를 보려면 `window.KARMOLAB_DOCS_RAW_BASE` 에 끝이 `/` 인 주소를 넣는다. */
function repoRawBase(): string {
    const custom = ((window as unknown as { KARMOLAB_DOCS_RAW_BASE?: string }).KARMOLAB_DOCS_RAW_BASE ?? '').trim();
    if (custom) return custom.replace(/\/?$/, '/');
    return 'https://raw.githubusercontent.com/mascari4615/mascari4615.github.io/main/';
}

/** KarmoLab 문서. 말은 옛 docs 묶음을 그대로 쓴다(세 나라 말이 이미 들어 있다). */
function karmolabDocs(): DocEntry[] {
    const group = t('community.docs.group-karmolab', undefined, 'KarmoLab');
    const entry = (id: string, label: string, desc: string, source: DocSource): DocEntry => ({ id, label, desc, group, source });
    return [
        entry('docs-intro', t('community.docs.t16'), t('community.docs.t17'), { kind: 'local', path: 'intro.md' }),
        entry('docs-roadmap', t('community.docs.t18'), t('community.docs.t19'), { kind: 'local', path: 'roadmap.md' }),
        entry('docs-guide', t('community.docs.t20'), t('community.docs.t21'), { kind: 'local', path: 'guide.md' }),
        entry('docs-karmo-ai', 'KarmoLabAI', t('community.docs.t22'), { kind: 'local', path: 'karmo-ai.md' }),
        entry('docs-discord-yawnbot', t('community.docs.t23'), t('community.docs.t24'), { kind: 'local', path: 'discord-yawnbot.md' }),
        entry('docs-discord-bots-readme', 'discord-bots README', t('community.docs.t25'), { kind: 'github', path: 'apps/discord-bots/README.md' }),
        entry('docs-tauri-readme', 'Tauri README', t('community.docs.t26'), { kind: 'github', path: 'apps/karmolab-tauri/README.md' }),
        entry('docs-project-commands', t('community.docs.t27'), t('community.docs.t28'), { kind: 'local', path: 'project-commands-guide.md' }),
        entry('docs-laptop', t('community.docs.t29'), t('community.docs.t30'), { kind: 'local', path: 'laptop.md' }),
        entry('docs-local-dev', t('community.docs.t31'), t('community.docs.t32'), { kind: 'local', path: 'local-dev-runner.md' }),
        entry('docs-servermonitor-deploy-log-design', t('community.docs.t33'), t('community.docs.t34'), {
            kind: 'local',
            path: 'servermonitor-deploy-log-stream.md',
        }),
    ];
}

type RelTarget = string | { target: string; label?: string };

interface EntityManifestItem {
    slug: string;
    title: string;
    oneLine: string;
    tags: string[];
    icon?: string;
    subLabel?: string;
    aliases?: string[];
    relationships?: RelTarget[];
    owner?: string;
    depends?: string[];
}

type DocsManifest = Record<string, EntityManifestItem[] | undefined>;

/** manifest 의 갈래와 그것이 사는 폴더. 빈 갈래는 저절로 안 보인다. */
const ENTITY_GROUPS: Array<{ key: string; dirName: string; label: () => string }> = [
    { key: 'characters', dirName: 'characters', label: () => t('community.docs.t35') },
    { key: 'systems', dirName: 'systems', label: () => t('community.docs.t36') },
    { key: 'concepts', dirName: 'concepts', label: () => t('community.docs.t37') },
    { key: 'lore', dirName: 'lore', label: () => t('community.docs.t38') },
    { key: 'adventures', dirName: 'adventures', label: () => t('community.docs.group-adventures', undefined, '모험') },
];

let manifestCache: DocsManifest | null = null;
let entriesCache: DocEntry[] | null = null;

async function loadManifest(): Promise<DocsManifest> {
    if (manifestCache) return manifestCache;
    try {
        const response = await fetch(WIKI_BASE + 'manifest.json');
        manifestCache = response.ok ? ((await response.json()) as DocsManifest) : {};
    } catch {
        // 세계관 못 받아도 KarmoLab 문서는 열림
        manifestCache = {};
    }
    return manifestCache;
}

/** 판에 실릴 글 목록. 못 받은 갈래는 빠지고 나머지는 그대로 선다. */
export async function loadDocEntries(): Promise<DocEntry[]> {
    if (entriesCache) return entriesCache;
    /* 말 묶음을 먼저 받는다. 되받을 글 없는 t() 는 묶음이 없으면 던지고,
       그러면 화면이 통째로 안 지어진다 (audit:i18n-load 가 이 자리를 지킨다). */
    await loadNamespace('community');
    const manifest = await loadManifest();
    const world: DocEntry[] = [];
    for (const group of ENTITY_GROUPS) {
        const items = manifest[group.key];
        if (!items || items.length === 0) continue;
        for (const item of items) {
            world.push({
                id: `wiki-${group.dirName}-${item.slug}`,
                label: item.title || item.slug,
                desc: item.oneLine || group.label(),
                group: group.label(),
                source: { kind: 'wiki', dir: group.dirName, slug: item.slug },
            });
        }
    }
    entriesCache = [...karmolabDocs(), ...world];
    return entriesCache;
}

export function docsBoardSummary(entries: DocEntry[]): DocsBoardSummary {
    return { count: entries.length };
}

export function docsBoardDesc(): string {
    return t('community.docs.board-desc', undefined, '앱 문서와 세계관. 목록은 여기, 고치는 것은 커밋으로');
}

export function docsBoardLabel(): string {
    return t('community.docs.board-label', undefined, '문서');
}

async function fetchDoc(source: DocSource): Promise<string> {
    if (source.kind === 'local') {
        const response = await fetch(LOCAL_BASE + source.path);
        if (!response.ok) throw new Error(t('community.docs.err.02') + source.path);
        return response.text();
    }
    if (source.kind === 'github') {
        const path = source.path.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
        const response = await fetch(repoRawBase() + path);
        if (!response.ok) throw new Error(t('community.docs.err.03') + source.path + ' (' + response.status + ')');
        const body = await response.text();
        const banner = t('community.docs.t10') + source.path + '` (GitHub raw)\n\n---\n\n';
        return banner + body;
    }
    const response = await fetch(`${WIKI_BASE}entities/${source.dir}/${source.slug}.md`);
    if (!response.ok) throw new Error(t('community.docs.err.40') + source.slug);
    return response.text();
}

function mdEsc(s: string): string {
    return typeof Toolbox !== 'undefined' && Toolbox.escapeHtml ? Toolbox.escapeHtml(s) : s;
}

function sanitizeMermaidId(s: string): string {
    return String(s || '').replace(/[^a-zA-Z0-9_]/g, '_');
}

function mermaidLabel(s: string): string {
    return String(s || '').replace(/["`]/g, '').replace(/\n/g, ' ');
}

/**
 * 세계관 글 머리 = 공통 카드(제목, 한 줄, 꼬리표) + 캐릭터면 관계 그림
 * blockquote 금지 (mermaid 담장과 부딪히면 평문으로 나온 사례)
 */
function entityHeader(dirName: string, item: EntityManifestItem, characters: EntityManifestItem[]): string {
    const parts: string[] = [];
    parts.push('### ' + (item.icon ? item.icon + ' ' : '') + mdEsc(item.title));
    parts.push('');
    if (item.oneLine) {
        parts.push('*' + mdEsc(item.oneLine) + '*');
        parts.push('');
    }
    const meta: string[] = [];
    if (item.subLabel) meta.push('_' + mdEsc(item.subLabel) + '_');
    if (item.aliases && item.aliases.length > 0) meta.push('aliases: ' + item.aliases.map(mdEsc).join(', '));
    if (item.owner) meta.push('owner: `' + mdEsc(item.owner) + '`');
    if (item.depends && item.depends.length > 0) meta.push('depends: ' + item.depends.map((d) => '`' + mdEsc(d) + '`').join(', '));
    if (item.tags && item.tags.length > 0) meta.push(item.tags.map((tag) => '`#' + mdEsc(tag) + '`').join(' '));
    if (meta.length > 0) {
        parts.push(meta.join(', '));
        parts.push('');
    }
    if (dirName === 'characters' && item.relationships && item.relationships.length > 0) {
        const lines: string[] = ['graph LR'];
        const selfId = sanitizeMermaidId(item.slug);
        lines.push('  ' + selfId + '["' + mermaidLabel(item.title) + '"]:::self');
        const seen = new Set<string>([item.slug]);
        for (const rel of item.relationships) {
            const target = typeof rel === 'string' ? rel : rel.target;
            const label = typeof rel === 'string' ? '' : rel.label || '';
            if (!target || seen.has(target)) continue;
            seen.add(target);
            const targetItem = characters.find((e) => e.slug === target);
            lines.push('  ' + sanitizeMermaidId(target) + '["' + mermaidLabel(targetItem ? targetItem.title : target) + '"]');
            const edge = label ? ' -.->|' + label.replace(/[|]/g, '/') + '| ' : ' -.-> ';
            lines.push('  ' + selfId + edge + sanitizeMermaidId(target));
        }
        lines.push('  classDef self fill:#a99bf5,stroke:#7b69dc,color:#000;');
        parts.push('<div class="mermaid">' + lines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>');
        parts.push('');
    }
    parts.push('---');
    parts.push('');
    return parts.join('\n');
}

function richLabels(): RichViewLabels {
    return {
        toc: t('community.docs.t13'),
        tocTitle: t('community.docs.toc-title', undefined, '이 문서 목차'),
        copy: t('community.docs.copy'),
        copied: t('community.docs.copied'),
        noMarked: t('community.docs.no-marked', undefined, '서식 엔진을 못 받았다. 새로고침해 보라.'),
        diagramFailed: t('community.docs.diagram-failed', undefined, '도해를 그리지 못했다.'),
        demo: { run: t('community.docs.demo.run'), reset: t('community.docs.demo.reset'), code: t('community.docs.demo.code'), result: t('community.docs.demo.result') },
    };
}

let stopWatching: (() => void) | null = null;

/**
 * 글 목록. 줄 누름 = 같은 판 안 본문으로
 * 표와 칩 모양 = `community.css` 와 `community-blog.ts` 것 그대로
 * 까닭: 판마다 줄 모양이 다르면 게시판이 아님
 */
export function buildDocsBoardBody(container: HTMLElement, entries: DocEntry[], open: (id: string) => void): void {
    const groups = [...new Set(entries.map((e) => e.group))];

    const filter = document.createElement('div');
    filter.className = 'cb-blog-filter';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('community.docs.search', undefined, '문서 제목 찾기');
    search.setAttribute('aria-label', search.placeholder);
    filter.appendChild(search);

    const table = document.createElement('table');
    table.className = 'c-table';
    table.innerHTML = `<thead><tr>
            <th class="c-num">${mdEsc(t('community.blog.th-num', undefined, '번호'))}</th>
            <th class="c-th-title">${mdEsc(t('community.blog.th-title', undefined, '제목'))}</th>
        </tr></thead>`;
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    let activeGroup = '';
    let query = '';
    const rows: { el: HTMLTableRowElement; group: string; text: string }[] = [];

    /* 줄 하나는 글 모델 한 벌로 (change.post-model). 블로그 판과 같은 모양이 나온다 */
    entries.forEach((entry, i) => {
        const post: KarmoPost = fromDocEntry(entry);
        const tr = document.createElement('tr');
        tr.innerHTML =
            `<td class="c-num">${i + 1}</td>` +
            '<td class="c-td-title"><button type="button" class="c-title-btn">' +
            `<span class="t"></span><span class="cb-cat">${mdEsc(post.label)}</span></button></td>`;
        (tr.querySelector('.c-title-btn .t') as HTMLElement).textContent = post.title;
        if (post.excerpt) tr.querySelector('button')?.setAttribute('title', post.excerpt);
        tr.querySelector('button')?.addEventListener('click', () => open(post.id));
        tbody.appendChild(tr);
        rows.push({ el: tr, group: post.label, text: `${post.title} ${post.excerpt} ${post.label}`.toLowerCase() });
    });

    const apply = (): void => {
        for (const row of rows) {
            const byGroup = activeGroup === '' || row.group === activeGroup;
            const byQuery = query === '' || row.text.includes(query);
            row.el.style.display = byGroup && byQuery ? '' : 'none';
        }
    };

    for (const group of groups) {
        const chip = document.createElement('button');
        chip.className = 'cb-blog-chip';
        chip.textContent = group;
        chip.addEventListener('click', () => {
            const wasOn = chip.classList.contains('on');
            filter.querySelectorAll('.cb-blog-chip.on').forEach((el) => el.classList.remove('on'));
            activeGroup = wasOn ? '' : group;
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

/** 글 한 편. 정본 글이라 전 기능(목차, 도해, 실행판)으로 그린다. */
export async function buildDocView(container: HTMLElement, entry: DocEntry, heading?: string): Promise<void> {
    await loadNamespace('community');
    stopWatching?.();
    stopWatching = null;
    container.textContent = t('community.docs.loading', undefined, '문서 여는 중');
    let markdown: string;
    try {
        markdown = await fetchDoc(entry.source);
    } catch (error) {
        container.textContent = t('community.docs.failed', undefined, '문서를 못 받았다. ') + String((error as Error)?.message ?? error);
        return;
    }
    if (entry.source.kind === 'wiki') {
        const manifest = await loadManifest();
        const item = (manifest[entry.source.dir] ?? manifest[entry.source.dir + 's'] ?? []).find(
            (e) => e.slug === (entry.source as { slug: string }).slug,
        );
        if (item) markdown = entityHeader(entry.source.dir, item, manifest.characters ?? []) + markdown;
    }
    stopWatching = await renderRichMarkdown(container, markdown, { trust: 'self', labels: richLabels() });
    if (!heading) return;
    const target = [...container.querySelectorAll('h1,h2,h3,h4')].find((el) => el.textContent?.trim() === heading);
    if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
    }
}

/** 화면을 떠날 때 읽는 곳 감시를 푼다. */
export function disposeDocView(): void {
    stopWatching?.();
    stopWatching = null;
}
