interface TlIndexPublishedItem {
    id?: string;
    title?: string;
    url?: string;
    [key: string]: unknown;
}

interface TlIndexNamespace {
    injectStyles?: () => void;
    state: {
        loadState: () => void;
        getState: () => {
            currentInstanceId?: string | null;
            instances?: Record<string, unknown>;
            [key: string]: unknown;
        };
        isPublishedMode: () => boolean;
    };
    publish?: {
        getPublishedIndex?: () => Promise<TlIndexPublishedItem[]>;
        openPublishedDirect?: (
            url: string,
            meta: { id?: string; title?: string; url: string; tierlistGroup?: string }
        ) => Promise<void>;
    };
    render: {
        publishedIndexGroup?: (item: TlIndexPublishedItem) => string;
        setContainers: (containers: {
            editor?: HTMLElement;
            list?: HTMLElement;
            stats?: HTMLElement;
        }) => void;
        renderEditor: () => void;
        renderListTab: () => void;
        renderStats: () => void;
    };
}

(function () {
    const T = (window.Tierlist = window.Tierlist || {}) as unknown as TlIndexNamespace;

    T.injectStyles?.();
    T.state.loadState();

    /** publish.js 캐시 구버전이어도 동작하도록 index에서 직접 부트스트랩 */
    (async function bootstrapDefaultEmbedded() {
        const pub = T.publish;
        if (!pub || typeof pub.getPublishedIndex !== 'function' || typeof pub.openPublishedDirect !== 'function') return;
        const st = T.state.getState();
        if (T.state.isPublishedMode()) return;
        if (st.currentInstanceId && st.instances?.[st.currentInstanceId]) return;
        let items: TlIndexPublishedItem[];
        try { items = await pub.getPublishedIndex(); } catch { return; }
        if (!items.length) return;
        const first = items[0];
        if (!first?.url) return;
        try {
            const grp = T.render?.publishedIndexGroup?.(first) === 'karmo' ? 'karmo' : 'catalog';
            await pub.openPublishedDirect(first.url, {
                id: first.id,
                title: first.title,
                url: first.url,
                tierlistGroup: grp,
            });
        } catch { /* 네트워크/JSON 오류 시 무시 */ }
    })();

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta?.('tierlist'),
        tabs: [
            {
                id: 'tl-edit',
                label: '편집',
                build(container: HTMLElement) {
                    T.render.setContainers({ editor: container });
                    T.render.renderEditor();
                }
            },
            {
                id: 'tl-list',
                label: '목록',
                build(container: HTMLElement) {
                    T.render.setContainers({ list: container });
                    T.render.renderListTab();
                }
            },
            {
                id: 'tl-stats',
                label: '통계',
                build(container: HTMLElement) {
                    T.render.setContainers({ stats: container });
                    T.render.renderStats();
                }
            },
        ]
    });
})();

