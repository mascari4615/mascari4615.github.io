/**
 * 잡동사니 (Stash) 위젯 — TASK-KL-034.
 *
 * 21 개 dead 위젯 (boot/lazy 미등록 → 사이드바 노출 X) 을 한 페이지에 통합.
 * 각 위젯은 .ts 분리 유지, 잡동사니 안에서 lazy 로드 + inline render + 자동 작동.
 * Pinterest masonry layout (CSS columns). 티메토 「조수님, 여기 정리 안 된 실험들이에요!」.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  Mdd.injectCSS(
    'stash',
    `
      /* layout-full tab-panel(flex column) 안에서 단일 스크롤 컨테이너로 동작.
       * intro/grid 가 직접 자식이면 부모가 overflow:hidden 이라 잘림 — root 가 책임. */
      .stash-root {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 24px 28px 48px;
      }
      .stash-intro {
        margin-bottom: 18px;
        padding: 16px 18px;
        border-radius: var(--radius-lg);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: 13px;
        line-height: 1.5;
      }
      .stash-grid {
        columns: 320px 4;
        column-gap: 18px;
      }
      .stash-item {
        break-inside: avoid;
        margin: 0 0 18px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
        box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.04) inset;
        transition: box-shadow 0.15s ease, transform 0.15s ease;
      }
      .stash-item:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.06) inset;
        transform: translateY(-2px);
      }
      .stash-item-label {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin: -4px 0 12px;
        padding-bottom: 10px;
        border-bottom: 1px dashed var(--border);
      }
      .stash-item-title {
        font-weight: 600;
        font-size: 14px;
        color: var(--text-primary);
      }
      .stash-item-desc {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .stash-item-slot {
        min-height: 60px;
      }
      .stash-error {
        padding: 16px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 12px;
      }
    `
  );

  const STASH_IDS: string[] = [
    'bounce', 'bubble', 'conch', 'countdown', 'darkroom', 'eyes', 'folder', 'fontgacha',
    'hacker', 'hourglass', 'moon', 'news', 'particle', 'password', 'pet',
    'reaction', 'shylink', 'speed', 'stone', 'toast', 'ytdownloader'
  ];

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('stash'),
    tabs: [
      {
        id: 'main',
        label: t('stash.t01', undefined, "잡동사니"),
        build(container: HTMLElement): void {
          void loadNamespace('stash').then(function () {

          const root = document.createElement('div');
          root.className = 'stash-root';
          container.appendChild(root);

          const intro = document.createElement('div');
          intro.className = 'stash-intro';
          intro.textContent = t('stash.t02');
          root.appendChild(intro);

          const grid = document.createElement('div');
          grid.className = 'stash-grid';
          root.appendChild(grid);

          for (const id of STASH_IDS) {
            const item = document.createElement('div');
            item.className = 'stash-item';
            item.dataset.stashId = id;

            const meta = (Toolbox.getLazyWidgetPublicMeta(id) || {}) as { id?: string; title?: string; desc?: string };
            const label = document.createElement('div');
            label.className = 'stash-item-label';
            const titleEl = document.createElement('span');
            titleEl.className = 'stash-item-title';
            titleEl.textContent = meta.title || id;
            label.appendChild(titleEl);
            if (meta.desc) {
              const descEl = document.createElement('span');
              descEl.className = 'stash-item-desc';
              descEl.textContent = meta.desc;
              label.appendChild(descEl);
            }
            item.appendChild(label);

            const slot = document.createElement('div');
            slot.className = 'stash-item-slot';
            item.appendChild(slot);

            grid.appendChild(item);

            Toolbox.kickLazyLoad(id)
              .then(() => {
                const ok = Toolbox.renderInline(id, slot);
                if (!ok) slot.innerHTML = t('stash.t03');
              })
              .catch((err: unknown) => {
                console.warn('[stash] load fail —', id, err);
                slot.innerHTML = t('stash.t04');
              });
          }

          try {
            const m = (window as unknown as { Mdd?: { linePreset?: (id: string, opts?: { msg?: string; mood?: string; duration?: number }) => boolean } }).Mdd;
            if (m && typeof m.linePreset === 'function') {
              m.linePreset('home_hub', { msg: t('stash.t05'), duration: 4500 });
            }
          } catch (_) {}
                  });
        }
      }
    ]
  });
})();
