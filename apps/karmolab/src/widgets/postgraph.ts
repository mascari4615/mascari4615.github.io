import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  let lastDestroy: (() => void) | null = null;

  function karmoPalette(): Record<string, string> {
    const theme = document.documentElement.getAttribute('data-theme');
    const dark = theme !== 'light';
    return {
      link: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.16)',
      linkDim: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      linkHi: dark ? 'rgba(147,197,253,0.95)' : 'rgba(37,99,235,0.85)',
      text: dark ? '#e5e7eb' : '#1f2937',
      nodeStroke: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)',
      nodeFillDefault: dark ? '#6366f1' : '#4f46e5'
    };
  }

  type GraphNode = { href?: string };

  const PostGraph = {
    build(container: HTMLElement): void {
      void loadNamespace('postgraph').then(function () {

      if (typeof lastDestroy === 'function') {
        try {
          lastDestroy();
        } catch {
          /* ignore teardown errors */
        }
        lastDestroy = null;
      }

      container.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'postgraph-wrap';
      wrap.style.cssText =
        'width:100%;min-height:min(70vh,640px);height:70vh;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-tertiary);overflow:hidden;';
      container.appendChild(wrap);

      const origin = location.origin || '';
      const dataUrl = new URL('/assets/js/data/post-graph.json', origin || 'http://localhost').href;
      const moduleUrl = new URL('/assets/js/graph-view/graph-view.js', origin || 'http://localhost').href;

      void (async () => {
        try {
          const mod = (await import(moduleUrl)) as {
            createGraphView: (opts: {
              container: HTMLElement;
              dataUrl: string;
              getPalette: () => Record<string, string>;
              onNodeOpen: (node: GraphNode) => void;
            }) => Promise<{ destroy?: () => void }>;
          };
          const { createGraphView } = mod;
          const api = await createGraphView({
            container: wrap,
            dataUrl,
            getPalette: karmoPalette,
            onNodeOpen(node: GraphNode) {
              if (node.href) {
                window.open(new URL(node.href, origin || 'http://localhost').href, '_blank', 'noopener,noreferrer');
              }
            }
          });
          lastDestroy = typeof api.destroy === 'function' ? api.destroy.bind(api) : null;
        } catch (e) {
          console.error(e);
          wrap.textContent =
            t('postgraph.t01');
        }
      })();

      if (typeof Mdd !== 'undefined') {
        Mdd.linePreset('tool_run', { mood: 'idle', msg: t('postgraph.t02') });
      }
          });
    }
  };

  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('postgraph') ?? {}),
    /* ★ **등록 때 읽는 말은 되받을 글을 반드시 준다** (2026-08-14). 이 자리는 파일이 읽히는
       순간이라 아직 묶음이 없다 — 되받을 글 없는 `t()` 는 던지고, 그러면 이 위젯만이 아니라
       **같은 묶음에 실린 화면들이 통째로** 안 올라간다(서버 모니터가 그렇게 죽어 있었다). */
    tabs: [{ id: 'graph', label: t('postgraph.t03', undefined, '그래프'), build: PostGraph.build }]
  });
})();
