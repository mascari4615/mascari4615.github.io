/**
 * 글 한 편을 읽을 수 있는 판으로. 목차, 도해, 실행판 (change.docs-into-community).
 *
 * 예전 자리 = docs 위젯 안. 위젯을 접으며 여기 한 벌로 모음
 * 맡는 것 = 서식 뒤에 붙는 것 (오른쪽 목차, ```mermaid 도해, ```demo 실행판, 코드 복사)
 * 서식 자체 = `render.ts`
 *
 * 신뢰 경계 정본은 `systems/content-rendering.md`.
 *   - trust `self` (git 정본 글) 는 전 기능
 *   - trust `user` (사람이 쓴 글) 는 서식, 도해, 복사까지. 실행판(`demo`) 제외
 *     까닭: 남의 글에서 임의 코드가 도는 문
 */
import { collectHeadings, watchReading, bindTocClicks, highlightCode, addCopyButtons, mountDemos } from '../doc-view';
import { specFromMermaid } from '../karmograph/from-mermaid';
import { renderGraphSvg } from '../karmograph/render';
import { renderMarkdown as renderMarkdownShared } from './render';
import { splitFrontMatter } from './frontmatter';

export interface RichViewLabels {
    toc: string;
    tocTitle: string;
    copy: string;
    copied: string;
    noMarked: string;
    diagramFailed: string;
    demo: { run: string; reset: string; code: string; result: string };
}

export interface RichViewOptions {
    /** 정본 글인가. `self` 만 실행판(```demo)을 연다. */
    trust: 'self' | 'user';
    labels: RichViewLabels;
    /** 제목이 이만큼 이상이면 오른쪽 목차를 세운다. 0 이면 목차 없음. */
    tocMin?: number;
    /** 본문 상자의 class. 부르는 쪽 겉모습을 그대로 쓰고 싶을 때 (커뮤니티 글 상세 등) */
    bodyClass?: string;
    /** `demoted` 면 글 안 제목을 h3~h5 로 내린다. 화면 큰제목과 안 부딪히게 (커뮤니티 글 규칙) */
    headings?: 'as-is' | 'demoted';
}

/** 겉모습은 한 곳에서. 문서 판도 글 상세도 같은 글꼴과 같은 여백을 쓴다. */
export function injectRichViewStyles(): void {
    Mdd.injectCSS(
        'doc-rich',
        `
        .docs-md-layout { display:grid; grid-template-columns:minmax(0,1fr) 220px; grid-template-areas:'main toc'; gap:16px; align-items:start; }
        .docs-md-layout--no-toc { grid-template-columns:1fr; grid-template-areas:'main'; }
        .docs-md-layout--no-toc .docs-md-toc { display:none; }
        .docs-md-main { grid-area:main; min-width:0; }
        .docs-md-toc { grid-area:toc; position:sticky; top:12px; align-self:start; max-height:min(72vh, 640px); overflow:auto;
          padding:12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); }
        .docs-toc-title { font-size:var(--font-size-xs); font-weight:900; color:var(--text-secondary); margin:2px 0 10px; }
        .docs-toc-listnav { display:flex; flex-direction:column; gap:6px; }
        .docs-toc-a { font-size:var(--font-size-2xs); color:var(--text-tertiary); text-decoration:none; line-height:1.45; padding:6px 8px; border-radius:var(--radius-xl); border:1px solid transparent; }
        .docs-toc-a:hover { color:var(--text-secondary); border-color:var(--border); background:var(--bg-tertiary); }
        .docs-toc-a.active { color:var(--text-primary); border-color:var(--accent-ink); box-shadow:0 0 0 2px var(--accent-subtle); }
        .docs-toc-l2 { padding-left:18px; }
        .docs-toc-l3 { padding-left:28px; }
        .docs-heading { position:relative; scroll-margin-top:16px; }
        .docs-heading:hover .docs-anchor { opacity:1; }
        .docs-anchor { opacity:0; position:absolute; left:-22px; top:50%; transform:translateY(-50%); font-size:var(--font-size-xs);
          color:var(--text-tertiary); cursor:pointer; user-select:none; }
        .docs-anchor:focus { opacity:1; outline:2px solid var(--accent-subtle); outline-offset:2px; border-radius:var(--radius-md); }
        @media (max-width:920px) {
          .docs-md-layout:not(.docs-md-layout--no-toc) { grid-template-columns:1fr; grid-template-areas:'toc' 'main'; }
          .docs-md-toc { max-height:min(38vh, 280px); top:0; z-index:3; }
        }
        .docs-body { font-size:var(--font-size-xs); line-height:1.8; color:var(--text-primary); max-width:800px; }
        .docs-body h1 { font-size:24px; font-weight:800; letter-spacing:-0.03em; margin:0 0 16px; padding-bottom:12px; border-bottom:2px solid var(--border); }
        .docs-body h2 { font-size:var(--font-size-md); font-weight:700; letter-spacing:-0.02em; margin:32px 0 12px; color:var(--accent-ink); }
        .docs-body h3 { font-size:var(--font-size-xs); font-weight:600; margin:24px 0 8px; }
        .docs-body p { margin:0 0 12px; color:var(--text-secondary); }
        .docs-body ul, .docs-body ol { margin:0 0 12px; padding-left:24px; color:var(--text-secondary); }
        .docs-body li { margin-bottom:4px; }
        .docs-body code { font-family:var(--font-mono); font-size:var(--font-size-xs); background:var(--bg-tertiary); padding:2px 6px; border-radius:var(--radius-sm); color:var(--accent-ink); }
        .docs-body pre { margin:0 0 16px; border-radius:var(--radius-md); overflow-x:auto; border:1px solid var(--border); }
        .docs-body pre code { display:block; padding:16px; background:var(--bg-tertiary); color:var(--text-primary); border-radius:var(--radius-md); font-size:var(--font-size-xs); line-height:1.6; }
        .docs-body table { width:100%; border-collapse:collapse; margin:0 0 16px; font-size:var(--font-size-sm); }
        .docs-body th { text-align:left; padding:8px 12px; background:var(--bg-tertiary); border:1px solid var(--border); font-weight:600; color:var(--text-primary); font-size:var(--font-size-xs); text-transform:uppercase; letter-spacing:0.06em; }
        .docs-body td { padding:8px 12px; border:1px solid var(--border); color:var(--text-secondary); }
        .docs-body blockquote { margin:0 0 16px; padding:12px 16px; border-left:3px solid var(--accent); background:var(--accent-subtle); border-radius:0 var(--radius-sm) var(--radius-sm) 0; color:var(--text-secondary); }
        .docs-body blockquote p { margin:0; }
        .docs-body hr { border:none; border-top:1px solid var(--border); margin:24px 0; }
        .docs-body a { color:var(--accent-ink); text-decoration:none; }
        .docs-body a:hover { text-decoration:underline; }
        .docs-body strong { color:var(--text-primary); }
        .docs-body .mermaid { margin:0 0 16px; padding:12px; border-radius:var(--radius-md); border:1px solid var(--border); background:var(--bg-tertiary); overflow-x:auto; text-align:center; }
        .docs-body .mermaid svg { max-width:100%; height:auto; }
    `,
    );
}

function esc(s: string): string {
    return typeof Toolbox !== 'undefined' && Toolbox.escapeHtml ? Toolbox.escapeHtml(s) : s;
}

function slugify(s: string): string {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/[\s]+/g, '-')
        .replace(/[^\w\-가-힣]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, used: Set<string>): string {
    const id = base || 'section';
    if (!used.has(id)) {
        used.add(id);
        return id;
    }
    let i = 2;
    while (used.has(`${id}-${i}`)) i++;
    const out = `${id}-${i}`;
    used.add(out);
    return out;
}

function findScrollRoot(from: HTMLElement): Element | null {
    let el: HTMLElement | null = from.parentElement;
    for (let i = 0; i < 16 && el; i++) {
        const overflowY = window.getComputedStyle(el).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) return el;
        el = el.parentElement;
    }
    return null;
}

/** 제목마다 id 와 닻을 박고 목차를 그린다. id 규칙은 옛 문서 위젯 그대로라 앵커 링크가 산다. */
function applyAnchors(
    root: HTMLElement,
    tocEl: HTMLElement | null,
    labels: RichViewLabels,
    selector: string,
): Array<{ id: string; text: string; level: number }> {
    const used = new Set<string>();
    const toc = collectHeadings(root, { selector, min: 1, idFrom: (text) => uniqueId(slugify(text), used) });

    toc.forEach((item) => {
        const el = root.querySelector('#' + CSS.escape(item.id)) as HTMLElement | null;
        if (!el) return;
        el.classList.add('docs-heading');
        const anchor = document.createElement('span');
        anchor.className = 'docs-anchor';
        anchor.tabIndex = 0;
        anchor.setAttribute('role', 'button');
        anchor.setAttribute('aria-label', labels.copy);
        anchor.textContent = '#';
        const copy = async (): Promise<void> => {
            const url = location.origin + location.pathname + location.search + '#' + el.id;
            try {
                await navigator.clipboard.writeText(url);
                Toolbox.showToast?.(labels.copied, undefined, undefined);
            } catch {
                location.hash = el.id;
            }
        };
        anchor.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            location.hash = el.id;
            void copy();
        });
        anchor.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            location.hash = el.id;
            void copy();
        });
        el.prepend(anchor);
    });

    if (tocEl) {
        tocEl.innerHTML =
            toc.length >= 2
                ? `<div class="docs-toc-title">${esc(labels.tocTitle)}</div>` +
                  `<nav class="docs-toc-listnav" aria-label="${esc(labels.toc)}">` +
                  toc.map((x) => `<a class="docs-toc-a docs-toc-l${x.level}" href="#${esc(x.id)}">${esc(x.text)}</a>`).join('') +
                  '</nav>'
                : '';
    }
    return toc;
}

/** 펜스가 marked 확장을 타지 않았을 때(구버전 등) 대비. */
function replaceMermaidFallback(body: HTMLElement): void {
    body.querySelectorAll('pre > code.language-mermaid, pre > code[class*="language-mermaid"]').forEach((code) => {
        const pre = code.parentElement;
        if (!pre) return;
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = (code.textContent || '').replace(/\r\n/g, '\n').trim();
        pre.replaceWith(div);
    });
}

/**
 * 도해 = 우리 엔진 (TASK-KL-326). mermaid 3MB 안 실음
 * 문법은 mermaid 그대로, 그리는 일만 KarmoGraph. 못 읽는 종류는 원문 글자로
 */
function drawDiagrams(body: HTMLElement, labels: RichViewLabels): void {
    const nodes = body.querySelectorAll('.mermaid');
    if (nodes.length === 0) return;
    const css = getComputedStyle(body);
    const theme = {
        nodeFill: css.getPropertyValue('--bg-secondary').trim() || '#131720',
        nodeText: css.getPropertyValue('--text-primary').trim() || '#e2e8f0',
        childText: css.getPropertyValue('--text-secondary').trim() || 'rgba(226,232,240,0.65)',
        edgeDotFill: css.getPropertyValue('--bg-primary').trim() || '#0a0c10',
        edgeDefaultColor: css.getPropertyValue('--text-secondary').trim() || '#64748b',
    };
    nodes.forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        const text = (element.textContent || '').replace(/﻿/g, '').trim();
        if (!text) return;
        try {
            const { spec, diagram } = specFromMermaid(text);
            if (diagram.kind === 'unknown') {
                element.innerHTML = '';
                const pre = document.createElement('pre');
                pre.textContent = text;
                element.appendChild(pre);
                return;
            }
            element.innerHTML = renderGraphSvg(spec, { theme, title: diagram.kind, className: 'docs-diagram' });
        } catch (error) {
            console.error('[rich-view diagram]', error);
            element.textContent = labels.diagramFailed;
        }
    });
}

/**
 * 글 한 편을 `container` 에 그림. 되돌려주는 함수 = 읽는 곳 감시 풀기
 * 문서를 갈아 끼울 때 반드시 호출 (안 부르면 사라진 화면을 계속 잼)
 */
export async function renderRichMarkdown(
    container: HTMLElement,
    markdown: string,
    options: RichViewOptions,
): Promise<() => void> {
    const { trust, labels } = options;
    const tocMin = options.tocMin ?? 2;
    injectRichViewStyles();

    const body = document.createElement('div');
    body.className = options.bodyClass ?? 'docs-body md';
    /* 앞머리(`---` 덩어리)는 설정이다. 본문으로도 목차로도 안 샌다 */
    const source = splitFrontMatter(markdown.replace(/^﻿/, '')).body;

    // 서식 엔진은 첫 글을 그릴 때 싣는다 (KL-054). 첫 화면 무게 0.
    try {
        await Toolbox.ensureScript?.('vendor/marked.min');
        await Toolbox.ensureScript?.('vendor/prism.min');
        await Toolbox.ensureScript?.('vendor/prism-autoloader.min');
    } catch {
        /* 아래 방어 검사가 처리 */
    }
    if (typeof marked === 'undefined') {
        container.textContent = labels.noMarked;
        return () => {};
    }

    const rendered = renderMarkdownShared(source, { trust, marked, breaks: true });
    body.innerHTML = options.headings === 'demoted'
        ? rendered.replace(/<(\/?)h3>/g, '<$1h5>').replace(/<(\/?)h2>/g, '<$1h4>').replace(/<(\/?)h1>/g, '<$1h3>')
        : rendered;

    const layout = document.createElement('div');
    layout.className = 'docs-md-layout';
    const main = document.createElement('div');
    main.className = 'docs-md-main';
    main.appendChild(body);
    const aside = document.createElement('aside');
    aside.className = 'docs-md-toc';
    aside.setAttribute('aria-label', labels.toc);
    const tocNav = document.createElement('div');
    tocNav.className = 'docs-toc-nav-host';
    aside.appendChild(tocNav);
    layout.appendChild(main);
    layout.appendChild(aside);

    container.innerHTML = '';
    container.appendChild(layout);

    replaceMermaidFallback(body);

    /* 언어 표기가 없으면 예전엔 javascript 로 칠했다. 셸과 설정 파일이 엉뚱하게 물들어서 그대로 둔다. */
    body.querySelectorAll('pre code').forEach((block) => {
        const lang = block.className.match(/language-([\w-]+)/)?.[1];
        if (lang) block.className = 'language-' + lang;
    });

    /* ```demo-html, demo-js, demo-shader 는 정본 글에서만 실행판이 된다. */
    if (trust === 'self') {
        body.querySelectorAll('pre code[class*="language-demo-"]').forEach((block) => {
            const kind = block.className.match(/language-demo-(html|js|shader)/)?.[1];
            if (!kind) return;
            const holder = document.createElement('div');
            holder.setAttribute('data-demo', kind);
            holder.textContent = block.textContent || '';
            block.closest('pre')?.replaceWith(holder);
        });
        mountDemos(body, labels.demo);
    }

    void highlightCode(body);
    addCopyButtons(body, labels.copy, labels.copied);

    const headings = applyAnchors(body, tocNav, labels, options.headings === 'demoted' ? 'h3, h4, h5' : 'h1, h2, h3');
    let stop: (() => void) | null = null;
    if (tocMin <= 0 || headings.length < Math.max(2, tocMin)) {
        layout.classList.add('docs-md-layout--no-toc');
    } else {
        const opts = {
            scrollRoot: findScrollRoot(layout) as HTMLElement | null,
            activeClass: 'active',
            linkSelector: '.docs-toc-a',
            idOf: (a: HTMLElement) => (a.getAttribute('href') || '').replace(/^#/, ''),
        };
        bindTocClicks(tocNav, body, opts);
        stop = watchReading(body, tocNav, headings, opts);
    }

    drawDiagrams(body, labels);

    return () => stop?.();
}
