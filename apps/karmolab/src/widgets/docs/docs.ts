/**
 * Docs — 소개, 로드맵·기획, 가이드, 프로젝트 통합 명령
 *
 * marked.js로 마크다운 렌더링, Prism.js로 코드 하이라이팅, ```mermaid 는 Mermaid 렌더.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { collectHeadings, watchReading, bindTocClicks, highlightCode, addCopyButtons } from '../../lib/doc-view';

(function (): void {
  /** 동일 출처(Tracking Prevention 회피). CDN 금지.
   *  KarmoLab 자체 vendor (`apps/karmolab/js/vendor/mermaid.min.js`) 사용 — production /
   *  dev:static (Mascari4615.github.io root 서빙) 양쪽에서 404 X. */
  function getMermaidScriptUrl(): string {
    const w = window as unknown as { KARMOLAB_WIDGET_SCRIPT_BASE?: string };
    if (w.KARMOLAB_WIDGET_SCRIPT_BASE) {
      try {
        // base = apps/karmolab/js/widgets/docs/ → ../../vendor/ = apps/karmolab/js/vendor/
        return new URL('../../vendor/mermaid.min.js', w.KARMOLAB_WIDGET_SCRIPT_BASE).href;
      } catch {
        /* noop */
      }
    }
    const cur = document.currentScript as HTMLScriptElement | null;
    if (cur?.src) {
      try {
        return new URL('../../vendor/mermaid.min.js', cur.src).href;
      } catch {
        /* noop */
      }
    }
    return (typeof location !== 'undefined' ? location.origin : '') + '/apps/karmolab/js/vendor/mermaid.min.js';
  }

  type MermaidApi = {
    initialize: (config: Record<string, unknown>) => void;
    run: (opts?: { nodes?: Iterable<Element> | null; suppressErrors?: boolean }) => Promise<unknown>;
    render?: (
      id: string,
      text: string
    ) => Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
  };

  let mermaidScriptPromise: Promise<void> | null = null;
  let markedMermaidRegistered = false;
  /** 마지막으로 적용한 Mermaid 설정(불필요한 재초기화 방지) */
  let mermaidInitKey: string | null = null;

  /** UMD/ESM 번들 모두: default 또는 루트에 API 가 올 수 있음 */
  function getMermaidApi(): MermaidApi | null {
    const w = window as unknown as { mermaid?: MermaidApi & { default?: MermaidApi } };
    const root = w.mermaid;
    if (!root) return null;
    if (typeof root.initialize === 'function' && typeof root.run === 'function') return root;
    const d = root.default;
    if (d && typeof d.initialize === 'function' && typeof d.run === 'function') return d;
    return null;
  }

  /** `run()`이 조용히 실패하는 환경 대비: `render`로 SVG를 대상 요소에 직접 넣음 */
  async function paintMermaidElements(mm: MermaidApi, elements: Element[]): Promise<void> {
    const render = mm.render;
    if (typeof render === 'function') {
      let n = 0;
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        const text = (el.textContent || '').replace(/\uFEFF/g, '').trim();
        if (!text) continue;
        const id = 'kl-mmd-' + Date.now() + '-' + ++n;
        const { svg, bindFunctions } = await render.call(mm, id, text);
        el.innerHTML = svg;
        bindFunctions?.(el);
      }
      return;
    }
    await mm.run({ nodes: elements, suppressErrors: false });
  }

  function loadMermaidScript(): Promise<void> {
    if (getMermaidApi()) return Promise.resolve();
    if (mermaidScriptPromise) return mermaidScriptPromise;
    mermaidScriptPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = getMermaidScriptUrl();
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        mermaidScriptPromise = null;
        reject(new Error(t('docs.err.01')));
      };
      document.head.appendChild(s);
    });
    return mermaidScriptPromise;
  }

  /** marked 기본 코드 블록(HTML 이스케이프)을 거치지 않고 ```mermaid 원문을 div 에 넣음 */
  function registerMarkedMermaid(): void {
    if (markedMermaidRegistered) return;
    markedMermaidRegistered = true;
    const mk = typeof marked !== 'undefined' ? (marked as { use?: (opts: unknown) => void }) : null;
    if (!mk || typeof mk.use !== 'function') return;
    mk.use({
      extensions: [
        {
          name: 'mermaid',
          level: 'block',
          start(src: string) {
            const m = /^```mermaid[ \t]*(?:\r?\n|$)/m.exec(src);
            return m ? m.index : undefined;
          },
          tokenizer(src: string) {
            const r = /^```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/;
            const m = r.exec(src);
            if (!m) return undefined;
            return {
              type: 'mermaid',
              raw: m[0],
              text: m[1].replace(/\r\n/g, '\n').trim(),
            };
          },
          renderer(token: { text: string }) {
            const safe = token.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            return '<div class="mermaid">' + safe + '</div>\n';
          },
        },
      ],
    });
  }

  /** 펜스가 marked 확장을 타지 않았을 때(구버전 등) 대비 */
  function replaceMermaidCodeBlocksFallback(body: HTMLElement): number {
    let n = 0;
    body.querySelectorAll('pre > code.language-mermaid, pre > code[class*="language-mermaid"]').forEach(function (code) {
      const pre = code.parentElement;
      if (!pre) return;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = (code.textContent || '').replace(/\r\n/g, '\n').trim();
      pre.replaceWith(div);
      n++;
    });
    return n;
  }
  Mdd.injectCSS(
    'docs',
    `
        /* 본문 + 목차 (세계관 위키 위젯과 같은 패턴: 슬러그 앵커, 측면 nav, IntersectionObserver) */
        .docs-md-layout {
          display:grid;
          grid-template-columns:minmax(0,1fr) 220px;
          grid-template-areas:'main toc';
          gap:16px;
          align-items:start;
        }
        .docs-md-layout--no-toc { grid-template-columns:1fr; grid-template-areas:'main'; }
        .docs-md-layout--no-toc .docs-md-toc { display:none; }
        .docs-md-main { grid-area:main; min-width:0; }
        .docs-md-toc {
          grid-area:toc;
          position:sticky;
          top:12px;
          align-self:start;
          max-height:min(72vh, 640px);
          overflow:auto;
          padding:12px;
          background:var(--bg-secondary);
          border:1px solid var(--border);
          border-radius:var(--radius-lg);
        }
        .docs-toc-title { font-size:var(--font-size-xs); font-weight:900; color:var(--text-secondary); margin:2px 0 10px; }
        .docs-toc-listnav { display:flex; flex-direction:column; gap:6px; }
        .docs-toc-a {
          font-size:12px;
          color:var(--text-tertiary);
          text-decoration:none;
          line-height:1.45;
          padding:6px 8px;
          border-radius:10px;
          border:1px solid transparent;
        }
        .docs-toc-a:hover { color:var(--text-secondary); border-color:var(--border); background:var(--bg-tertiary); }
        .docs-toc-a.active { color:var(--text-primary); border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-subtle); }
        .docs-toc-l2 { padding-left:18px; }
        .docs-toc-l3 { padding-left:28px; }
        .docs-heading { position:relative; scroll-margin-top:16px; }
        .docs-heading:hover .docs-anchor { opacity:1; }
        .docs-anchor {
          opacity:0;
          position:absolute;
          left:-22px;
          top:50%;
          transform:translateY(-50%);
          font-size:14px;
          color:var(--text-tertiary);
          cursor:pointer;
          user-select:none;
        }
        .docs-anchor:focus { opacity:1; outline:2px solid var(--accent-subtle); outline-offset:2px; border-radius:6px; }
        @media (max-width:920px) {
          .docs-md-layout:not(.docs-md-layout--no-toc) {
            grid-template-columns:1fr;
            grid-template-areas:'toc' 'main';
          }
          .docs-md-toc { max-height:min(38vh, 280px); top:0; z-index:3; }
        }
        .docs-body { font-size:14px; line-height:1.8; color:var(--text-primary); max-width:800px; }
        .docs-body h1 { font-size:24px; font-weight:800; letter-spacing:-0.03em; margin:0 0 16px; padding-bottom:12px; border-bottom:2px solid var(--border); }
        .docs-body h2 { font-size:18px; font-weight:700; letter-spacing:-0.02em; margin:32px 0 12px; color:var(--accent); }
        .docs-body h3 { font-size:15px; font-weight:600; margin:24px 0 8px; }
        .docs-body p { margin:0 0 12px; color:var(--text-secondary); }
        .docs-body ul, .docs-body ol { margin:0 0 12px; padding-left:24px; color:var(--text-secondary); }
        .docs-body li { margin-bottom:4px; }
        .docs-body code { font-family:var(--font-mono); font-size:var(--font-size-xs); background:var(--bg-tertiary); padding:2px 6px; border-radius:4px; color:var(--accent); }
        .docs-body pre { margin:0 0 16px; border-radius:var(--radius-md); overflow-x:auto; border:1px solid var(--border); }
        .docs-body pre code { display:block; padding:16px; background:var(--bg-tertiary); color:var(--text-primary); border-radius:var(--radius-md); font-size:var(--font-size-xs); line-height:1.6; }
        .docs-body table { width:100%; border-collapse:collapse; margin:0 0 16px; font-size:var(--font-size-sm); }
        .docs-body th { text-align:left; padding:8px 12px; background:var(--bg-tertiary); border:1px solid var(--border); font-weight:600; color:var(--text-primary); font-size:var(--font-size-xs); text-transform:uppercase; letter-spacing:0.06em; }
        .docs-body td { padding:8px 12px; border:1px solid var(--border); color:var(--text-secondary); }
        .docs-body blockquote { margin:0 0 16px; padding:12px 16px; border-left:3px solid var(--accent); background:var(--accent-subtle); border-radius:0 var(--radius-sm) var(--radius-sm) 0; color:var(--text-secondary); }
        .docs-body blockquote p { margin:0; }
        .docs-body hr { border:none; border-top:1px solid var(--border); margin:24px 0; }
        .docs-body a { color:var(--accent); text-decoration:none; }
        .docs-body a:hover { text-decoration:underline; }
        .docs-body strong { color:var(--text-primary); }
        .docs-body .mermaid { margin:0 0 16px; padding:12px; border-radius:var(--radius-md); border:1px solid var(--border); background:var(--bg-tertiary); overflow-x:auto; text-align:center; }
        .docs-body .mermaid svg { max-width:100%; height:auto; }
    `
  );

  const DOCS_BASE = (function (): string {
    const w = window as unknown as { KARMOLAB_WIDGET_SCRIPT_BASE?: string };
    if (w.KARMOLAB_WIDGET_SCRIPT_BASE) {
      return w.KARMOLAB_WIDGET_SCRIPT_BASE + 'docs/';
    }
    const script = document.currentScript;
    if (script && 'src' in script && script.src) {
      const url = new URL(script.src);
      return url.origin + url.pathname.replace(/\/[^/]+$/, '/');
    }
    return (typeof location !== 'undefined' ? location.origin : '') + '/apps/karmolab/js/widgets/docs/';
  })();

  function getDocUrl(filename: string): string {
    return DOCS_BASE + filename;
  }

  function loadDoc(filename: string): Promise<string> {
    return fetch(getDocUrl(filename)).then(function (r: Response) {
      if (!r.ok) throw new Error(t('docs.err.02') + filename);
      return r.text();
    });
  }

  /**
   * GitHub `raw.githubusercontent.com` 등 — 레포 루트 기준 상대 경로 Markdown.
   * 기본: 이 사이트 레포 `master`. 포크·다른 브랜치는 `window.KARMOLAB_DOCS_RAW_BASE`로 덮어쓰기
   * (끝에 `/` 포함한 전체 prefix, 예: https://raw.githubusercontent.com/you/repo/main/)
   */
  function getDocsRepoRawBase(): string {
    const w = window as unknown as { KARMOLAB_DOCS_RAW_BASE?: string };
    const custom = (w.KARMOLAB_DOCS_RAW_BASE ?? '').trim();
    if (custom) {
      return custom.replace(/\/?$/, '/');
    }
    return 'https://raw.githubusercontent.com/mascari4615/mascari4615.github.io/master/';
  }

  function normalizeRepoDocPath(path: string): string {
    return path
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');
  }

  function loadDocFromRepo(repoRelativePath: string): Promise<string> {
    const url = getDocsRepoRawBase() + normalizeRepoDocPath(repoRelativePath);
    return fetch(url).then(function (r: Response) {
      if (!r.ok) throw new Error(t('docs.err.03') + repoRelativePath + ' (' + r.status + ')');
      return r.text();
    });
  }

  /** worldwiki 위젯과 동일한 슬러그·앵커·목차 패턴 */
  function docsEsc(s: string): string {
    return typeof Toolbox !== 'undefined' && Toolbox.escapeHtml ? Toolbox.escapeHtml(s) : s;
  }

  function docsSlugify(s: string): string {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[^\w\-가-힣]+/g, '')
      .replace(/\-+/g, '-')
      .replace(/^\-+|\-+$/g, '');
  }

  function docsEnsureUniqueId(base: string, used: Set<string>): string {
    let id = base || 'section';
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

  function findDocsScrollRoot(from: HTMLElement): Element | null {
    let el: HTMLElement | null = from.parentElement;
    for (let i = 0; i < 16 && el; i++) {
      const st = window.getComputedStyle(el);
      const oy = st.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  let docsStopWatching: (() => void) | null = null;

  function applyDocsAnchors(
    root: HTMLElement,
    tocEl: HTMLElement | null
  ): Array<{ id: string; text: string; level: number }> {
    const used = new Set<string>();
    /* 제목 찾기·id 박기는 공용 모듈이 한다(SSOT) — id 규칙만 예전 그대로 넘겨 기존 앵커 링크를 살린다. */
    const toc = collectHeadings(root, {
      selector: 'h1, h2, h3',
      min: 1,
      idFrom: (text) => docsEnsureUniqueId(docsSlugify(text), used),
    });

    toc.forEach(function (item) {
      const el = root.querySelector('#' + CSS.escape(item.id)) as HTMLElement | null;
      if (!el) return;
      el.classList.add('docs-heading');

      const a = document.createElement('span');
      a.className = 'docs-anchor';
      a.tabIndex = 0;
      a.setAttribute('role', 'button');
      a.setAttribute('aria-label', t('docs.t04'));
      a.textContent = '#';
      const copy = async function () {
        const url = location.origin + location.pathname + location.search + '#' + el.id;
        try {
          await navigator.clipboard.writeText(url);
          Toolbox.showToast?.(t('docs.t05'), undefined, undefined);
        } catch {
          location.hash = el.id;
          Toolbox.showToast?.(t('docs.t06'), 'error', undefined);
        }
      };
      a.addEventListener('click', function (e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        location.hash = el.id;
        void copy();
      });
      a.addEventListener('keydown', function (e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          location.hash = el.id;
          void copy();
        }
      });
      el.prepend(a);

    });

    if (tocEl && toc.length >= 2) {
      tocEl.innerHTML =
        t('docs.t07') +
        t('docs.t08') +
        toc
          .map(function (x) {
            return (
              '<a class="docs-toc-a docs-toc-l' +
              x.level +
              '" href="#' +
              docsEsc(x.id) +
              '">' +
              docsEsc(x.text) +
              '</a>'
            );
          })
          .join('') +
        '</nav>';
    } else if (tocEl) {
      tocEl.innerHTML = '';
    }

    return toc;
  }

  /**
   * 목차의 「지금 읽는 곳」 표시와 클릭 이동 — 공용 모듈(`lib/doc-view`)에 맡긴다.
   * 예전에는 IntersectionObserver 로 판단해 제목이 여럿 보일 때 표시가 흔들렸다.
   * 지금은 스터디 맵 강의와 같은 규칙(위에서 지나온 마지막 제목)을 쓴다.
   */
  function wireDocsTocActive(
    tocWrap: HTMLElement,
    docWrap: HTMLElement,
    scrollRoot: Element | null,
    headings: Array<{ id: string; text: string; level: number }>
  ): () => void {
    const opts = {
      scrollRoot: scrollRoot instanceof HTMLElement ? scrollRoot : null,
      activeClass: 'active',
      linkSelector: '.docs-toc-a',
      idOf: (a: HTMLElement) => (a.getAttribute('href') || '').replace(/^#/, ''),
    };
    bindTocClicks(tocWrap, docWrap, opts);
    return watchReading(docWrap, tocWrap, headings, opts);
  }

  /** 레포 루트 기준 Markdown 경로를 GitHub raw로 불러와 본문 위에 출처 블록을 붙여 렌더 */
  function renderRepoMarkdownInContainer(container: HTMLElement, repoRelativePath: string): void {
    container.innerHTML =
      t('docs.t09');
    loadDocFromRepo(repoRelativePath)
      .then(function (md: string) {
        const banner =
          t('docs.t10') +
          repoRelativePath +
          '` — GitHub **raw** (`master` 기본). `window.KARMOLAB_DOCS_RAW_BASE` 에 끝이 `/`인 URL을 넣으면 다른 브랜치·포크를 볼 수 있어요.\n\n---\n\n';
        renderMarkdown(container, banner + md);
      })
      .catch(function () {
        renderMarkdown(
          container,
          t('docs.t11'),
        );
      });
  }

  async function renderMarkdown(container: HTMLElement, md: string): Promise<void> {
    const body = document.createElement('div');
    body.className = 'docs-body';
    md = md.replace(/^\uFEFF/, '');

    // KL-054: marked/Prism = eager 제거 → docs(boot 위젯) 가 첫 문서 렌더 시 로드.
    try {
      await Toolbox.ensureScript?.('vendor/marked.min');
      await Toolbox.ensureScript?.('vendor/prism.min');
      await Toolbox.ensureScript?.('vendor/prism-autoloader.min');
    } catch (_) {
      /* 아래 defensive guard 가 처리 */
    }

    if (typeof marked === 'undefined') {
      container.innerHTML = t('docs.t12');
      return;
    }

    registerMarkedMermaid();
    marked.setOptions({ breaks: true, gfm: true });
    body.innerHTML = marked.parse(md);

    const layout = document.createElement('div');
    layout.className = 'docs-md-layout';

    const main = document.createElement('div');
    main.className = 'docs-md-main';
    main.appendChild(body);

    const aside = document.createElement('aside');
    aside.className = 'docs-md-toc';
    aside.setAttribute('aria-label', t('docs.t13'));
    const tocNav = document.createElement('div');
    tocNav.className = 'docs-toc-nav-host';
    aside.appendChild(tocNav);

    layout.appendChild(main);
    layout.appendChild(aside);

    container.innerHTML = '';
    container.appendChild(layout);

    replaceMermaidCodeBlocksFallback(body);

    /* 언어 표기가 없으면 예전엔 javascript 로 칠했다 — 셸·설정 파일이 엉뚱하게 물들어서 그대로 둔다. */
    body.querySelectorAll('pre code').forEach((block: Element) => {
      const lang = block.className.match(/language-([\w-]+)/)?.[1];
      if (lang) block.className = 'language-' + lang;
    });
    void highlightCode(body);
    addCopyButtons(body, t('docs.copy'), t('docs.copied'));

    const tocMeta = applyDocsAnchors(body, tocNav);
    if (tocMeta.length < 2) {
      layout.classList.add('docs-md-layout--no-toc');
    } else {
      /* 문서를 갈아 끼울 때마다 예전 감시를 푼다 — 안 그러면 사라진 화면을 계속 재려 든다. */
      docsStopWatching?.();
      docsStopWatching = wireDocsTocActive(tocNav, body, findDocsScrollRoot(layout), tocMeta);
      Toolbox.onDispose?.(function () {
        docsStopWatching?.();
        docsStopWatching = null;
      });
    }

    const mermaidEls = body.querySelectorAll('.mermaid');
    if (mermaidEls.length > 0) {
      void (async function () {
        try {
          await loadMermaidScript();
          const mm = getMermaidApi();
          if (!mm) {
            console.error(t('docs.t14'));
            return;
          }
          const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
          const theme = isDark ? 'dark' : 'default';
          const initKey = theme + '|loose';
          if (mermaidInitKey !== initKey) {
            mermaidInitKey = initKey;
            mm.initialize({
              startOnLoad: false,
              theme,
              securityLevel: 'loose',
            });
          }
          await paintMermaidElements(mm, Array.from(mermaidEls));
        } catch (e) {
          console.error('[docs mermaid]', e);
          body.insertAdjacentHTML(
            'beforeend',
            t('docs.t15'),
          );
        }
      })();
    }
  }

  // ── TASK-KL-015-B: 통합 문서 위젯 ─────────────────────────────────────────────────────────
  // docs.ts 가 자체 사이드바 (그룹 헤더 + 동적 항목) + 본문 + TOC 그림. Toolbox tabs 단일.
  // 「프로젝트 문서」 그룹 = 외부 md/GitHub raw (현 hardcode).
  // 「캐릭터/시스템/개념/lore」 그룹 = `world/wiki/manifest.json` 동적 walk (sub-A 의 sync 결과).
  type ExternalSource =
    | { kind: 'local'; path: string }
    | { kind: 'github'; path: string };

  interface ExternalDoc {
    id: string;
    label: string;
    source: ExternalSource;
    mddPreset?: string;
    mddMsg?: string;
  }

  const EXTERNAL_DOCS: ExternalDoc[] = [
    { id: 'docs-intro', label: t('docs.t16'), source: { kind: 'local', path: 'intro.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t17') },
    { id: 'docs-roadmap', label: t('docs.t18'), source: { kind: 'local', path: 'roadmap.md' }, mddPreset: 'daily_start', mddMsg: t('docs.t19') },
    { id: 'docs-guide', label: t('docs.t20'), source: { kind: 'local', path: 'guide.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t21') },
    { id: 'docs-karmolab-ai', label: 'KarmoLabAI', source: { kind: 'local', path: 'karmolab-ai.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t22') },
    { id: 'docs-discord-yawnbot', label: t('docs.t23'), source: { kind: 'local', path: 'discord-yawnbot.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t24') },
    { id: 'docs-discord-bots-readme', label: 'discord-bots · README', source: { kind: 'github', path: 'apps/discord-bots/README.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t25') },
    { id: 'docs-tauri-readme', label: 'Tauri · README', source: { kind: 'github', path: 'apps/karmolab-tauri/README.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t26') },
    { id: 'docs-project-commands', label: t('docs.t27'), source: { kind: 'local', path: 'project-commands-guide.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t28') },
    { id: 'docs-laptop', label: t('docs.t29'), source: { kind: 'local', path: 'laptop.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t30') },
    { id: 'docs-local-dev', label: t('docs.t31'), source: { kind: 'local', path: 'local-dev-runner.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t32') },
    { id: 'docs-servermonitor-deploy-log-design', label: t('docs.t33'), source: { kind: 'local', path: 'servermonitor-deploy-log-stream.md' }, mddPreset: 'tool_run', mddMsg: t('docs.t34') },
  ];

  type RelTarget = string | { target: string; label?: string };

  interface EntityManifestItem {
    slug: string;
    title: string;
    oneLine: string;
    tags: string[];
    // character 전용 (sub-C 카드/그래프 view)
    icon?: string;
    subLabel?: string;
    aliases?: string[];
    relationships?: RelTarget[];
    // system 전용
    owner?: string;
    depends?: string[];
  }
  interface DocsManifest {
    characters: EntityManifestItem[];
    systems: EntityManifestItem[];
    concepts: EntityManifestItem[];
    lore: EntityManifestItem[];
  }

  const ENTITY_GROUPS: Array<{ key: keyof DocsManifest; label: string; dirName: string }> = [
    { key: 'characters', label: t('docs.t35'), dirName: 'characters' },
    { key: 'systems', label: t('docs.t36'), dirName: 'systems' },
    { key: 'concepts', label: t('docs.t37'), dirName: 'concepts' },
    { key: 'lore', label: t('docs.t38'), dirName: 'lore' },
  ];

  /** DOCS_BASE = .../js/widgets/docs/. wiki 산출물은 .../world/wiki/. */
  function wikiBaseUrl(): string {
    return DOCS_BASE.replace(/\/js\/widgets\/docs\/?$/, '/world/wiki/');
  }

  function loadManifest(): Promise<DocsManifest> {
    return fetch(wikiBaseUrl() + 'manifest.json').then(function (r: Response) {
      if (!r.ok) throw new Error(t('docs.err.39') + r.status);
      return r.json();
    });
  }

  function loadEntityMd(dirName: string, slug: string): Promise<string> {
    const url = wikiBaseUrl() + 'entities/' + dirName + '/' + slug + '.md';
    return fetch(url).then(function (r: Response) {
      if (!r.ok) throw new Error(t('docs.err.40') + slug);
      return r.text();
    });
  }

  /** sub-C: 타입별 default view header (카드 + 관계 그래프 mermaid). 본문 위에 prepend.
   *  blockquote 사용 X — fence(mermaid) 와 충돌하면 평문 렌더되는 케이스 있음. 일반 단락 + 수평선. */
  function buildEntityHeader(dirName: string, item: EntityManifestItem, manifest: DocsManifest): string {
    const parts: string[] = [];
    // 공통 카드 — title + oneLine (h3 + emphasis)
    const iconPrefix = item.icon ? item.icon + ' ' : '';
    parts.push('### ' + iconPrefix + docsEsc(item.title));
    parts.push('');
    if (item.oneLine) {
      parts.push('*' + docsEsc(item.oneLine) + '*');
      parts.push('');
    }
    // 메타 라인 (subLabel / aliases / tags / owner / depends 등 있으면)
    const meta: string[] = [];
    if (item.subLabel) meta.push('_' + docsEsc(item.subLabel) + '_');
    if (item.aliases && item.aliases.length > 0) meta.push('aliases: ' + item.aliases.map(docsEsc).join(', '));
    if (item.owner) meta.push('owner: `' + docsEsc(item.owner) + '`');
    if (item.depends && item.depends.length > 0) meta.push('depends: ' + item.depends.map(function (d) { return '`' + docsEsc(d) + '`'; }).join(', '));
    if (item.tags && item.tags.length > 0) meta.push(item.tags.map(function (t) { return '`#' + docsEsc(t) + '`'; }).join(' '));
    if (meta.length > 0) {
      parts.push(meta.join(' · '));
      parts.push('');
    }
    // character 의 관계 그래프 — relationships 가 있으면 mermaid 자동 생성.
    // marked fence 인식 우회: 직접 <div class="mermaid"> 인라인 HTML — mermaid lib 가 .mermaid 셀렉터 자동 잡음.
    if (dirName === 'characters' && item.relationships && item.relationships.length > 0) {
      const mmdLines: string[] = ['graph LR'];
      const selfId = sanitizeMermaidId(item.slug);
      const selfLabel = mermaidLabel(item.title);
      mmdLines.push('  ' + selfId + '["' + selfLabel + '"]:::self');
      const seen = new Set<string>([item.slug]);
      for (const rel of item.relationships) {
        const target = typeof rel === 'string' ? rel : rel.target;
        const label = typeof rel === 'string' ? '' : (rel.label || '');
        if (!target || seen.has(target)) continue;
        seen.add(target);
        const targetId = sanitizeMermaidId(target);
        const targetItem = manifest.characters.find(function (e) { return e.slug === target; });
        const targetLabel = mermaidLabel(targetItem ? targetItem.title : target);
        mmdLines.push('  ' + targetId + '["' + targetLabel + '"]');
        const edge = label ? ' -.->|' + label.replace(/[|]/g, '/') + '| ' : ' -.-> ';
        mmdLines.push('  ' + selfId + edge + targetId);
      }
      mmdLines.push('  classDef self fill:#a99bf5,stroke:#7b69dc,color:#000;');
      const safe = mmdLines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      parts.push('<div class="mermaid">' + safe + '</div>');
      parts.push('');
    }
    parts.push('---');
    parts.push('');
    return parts.join('\n');
  }

  function sanitizeMermaidId(s: string): string {
    return String(s || '').replace(/[^a-zA-Z0-9_]/g, '_');
  }
  function mermaidLabel(s: string): string {
    return String(s || '').replace(/["`]/g, '').replace(/\n/g, ' ');
  }

  function injectShellStyles(): void {
    if (document.getElementById('docs-shell-styles')) return;
    const style = document.createElement('style');
    style.id = 'docs-shell-styles';
    style.textContent = `
      .docs-shell { display: grid; grid-template-columns: 220px 1fr; gap: 16px; min-height: 400px; }
      .docs-shell-side { border-right: 1px solid var(--border); padding-right: 12px; max-height: 80vh; overflow-y: auto; }
      .docs-shell-group { margin-bottom: 14px; }
      .docs-shell-group-label { font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px; padding: 0 4px; font-weight: 600; }
      .docs-shell-list { list-style: none; padding: 0; margin: 0; }
      .docs-shell-list li { margin: 0; }
      .docs-shell-btn { width: 100%; text-align: left; background: transparent; border: 0; padding: 5px 8px; cursor: pointer; font-size: 12.5px; color: var(--text-secondary); border-radius: var(--radius-sm); font-family: inherit; }
      .docs-shell-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
      .docs-shell-btn--active { background: var(--accent-subtle); color: var(--accent); font-weight: 600; }
      .docs-shell-content { min-width: 0; }
    `;
    document.head.appendChild(style);
  }

  function buildDocsShell(panel: HTMLElement): void {
    injectShellStyles();
    panel.innerHTML =
      '<div class="docs-shell">'
      + '<aside class="docs-shell-side" data-docs-side></aside>'
      + '<section class="docs-shell-content" data-docs-content></section>'
      + '</div>';
    const sideEl = panel.querySelector<HTMLElement>('[data-docs-side]')!;
    const contentEl = panel.querySelector<HTMLElement>('[data-docs-content]')!;

    let manifest: DocsManifest = { characters: [], systems: [], concepts: [], lore: [] };
    let activeKey: string | null = null;

    function escAttr(s: string): string {
      return docsEsc(s).replace(/"/g, '&quot;');
    }

    function renderSide(): void {
      const html: string[] = [];
      // 외부 문서 그룹 (현재 10 항목 hardcode — 외부 README/가이드 등)
      html.push('<div class="docs-shell-group">');
      html.push(t('docs.t41'));
      html.push('<ul class="docs-shell-list">');
      for (const item of EXTERNAL_DOCS) {
        html.push('<li><button type="button" class="docs-shell-btn" data-key="external:' + escAttr(item.id) + '">' + docsEsc(item.label) + '</button></li>');
      }
      html.push('</ul></div>');
      // entity 그룹 (manifest 의 동적 walk — 비면 그룹 자체 숨김)
      for (const group of ENTITY_GROUPS) {
        const items = manifest[group.key];
        if (!items || items.length === 0) continue;
        html.push('<div class="docs-shell-group">');
        html.push('<h3 class="docs-shell-group-label">' + docsEsc(group.label) + '</h3>');
        html.push('<ul class="docs-shell-list">');
        for (const item of items) {
          const titleAttr = escAttr(item.oneLine || '');
          html.push('<li><button type="button" class="docs-shell-btn" data-key="entity:' + escAttr(group.dirName) + ':' + escAttr(item.slug) + '" title="' + titleAttr + '">' + docsEsc(item.title) + '</button></li>');
        }
        html.push('</ul></div>');
      }
      sideEl.innerHTML = html.join('');
      sideEl.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach(function (btn) {
        btn.onclick = function () {
          const key = btn.getAttribute('data-key') || '';
          selectKey(key, btn);
        };
      });
      // 첫 항목 자동 선택 (initial)
      if (activeKey == null) {
        const first = sideEl.querySelector<HTMLButtonElement>('button[data-key]');
        if (first) first.click();
      }
    }

    function selectKey(key: string, btn: HTMLButtonElement): void {
      activeKey = key;
      sideEl.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach(function (b) {
        b.classList.toggle('docs-shell-btn--active', b === btn);
      });
      contentEl.innerHTML = t('docs.t42');
      void loadAndRender(key, contentEl);
    }

    async function loadAndRender(key: string, target: HTMLElement): Promise<void> {
      const sep = key.indexOf(':');
      const kind = sep < 0 ? key : key.slice(0, sep);
      const rest = sep < 0 ? '' : key.slice(sep + 1);
      if (kind === 'external') {
        const ext = EXTERNAL_DOCS.find(function (e) { return e.id === rest; });
        if (!ext) {
          renderMarkdown(target, t('docs.t43'));
          return;
        }
        if (ext.mddPreset && ext.mddMsg && typeof Mdd !== 'undefined' && Mdd.linePreset) {
          Mdd.linePreset(ext.mddPreset, { msg: ext.mddMsg });
        }
        if (ext.source.kind === 'local') {
          try {
            const md = await loadDoc(ext.source.path);
            renderMarkdown(target, md);
          } catch (_) {
            renderMarkdown(target, t('docs.t44'));
          }
        } else {
          renderRepoMarkdownInContainer(target, ext.source.path);
        }
        return;
      }
      if (kind === 'entity') {
        const colon = rest.indexOf(':');
        const dirName = colon < 0 ? rest : rest.slice(0, colon);
        const slug = colon < 0 ? '' : rest.slice(colon + 1);
        const group = ENTITY_GROUPS.find(function (g) { return g.dirName === dirName; });
        const item = group ? manifest[group.key].find(function (e) { return e.slug === slug; }) : undefined;
        try {
          const md = await loadEntityMd(dirName, slug);
          const header = item ? buildEntityHeader(dirName, item, manifest) : '> **' + docsEsc(slug) + '**\n\n---\n\n';
          renderMarkdown(target, header + md);
        } catch (err) {
          renderMarkdown(target, t('docs.t45') + docsEsc(String((err as Error)?.message || err)) + '*');
        }
        return;
      }
      renderMarkdown(target, t('docs.t46') + docsEsc(key) + '*');
    }

    // 진입 — manifest fetch (실패해도 외부 문서 그룹은 표시)
    loadManifest()
      .then(function (m) { manifest = m; renderSide(); })
      .catch(function (err) {
        console.warn(t('docs.t47'), err);
        renderSide();
      });
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta!('docs'),
    tabs: [
      {
        id: 'docs',
        label: t('docs.t48', undefined, "문서"),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('docs').then(function () {
            buildDocsShell(container);
          });
        },
      },
    ],
  });

})();
