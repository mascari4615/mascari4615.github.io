import { t, loadNamespace } from '../lib/i18n';

/** 화면에 그대로 박는 글은 태그로 읽히면 안 된다. */
const esc = (v: unknown): string =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

(function () {
    /* ===== 유틸 ===== */
    function getModelDisplayName(modelId: string): string {
        const models = Gemini?.MODELS;
        if (!models) return modelId;
        const all = [
            ...(models.gemini || []),
            ...(models.geminiImage || []),
            ...(models.imagen || [])
        ];
        const found = all.find(m => m.id === modelId);
        return found ? found.name : modelId;
    }

    const formatTimestamp = Toolbox.formatTimestamp!;
    const escapeHtml = Toolbox.escapeHtml!;
    const showToast = Toolbox.showToast!;

    function showLightbox(imageUrl: string): void {
        let lb = document.getElementById('ilLightbox') as HTMLDivElement | null;
        if (!lb) {
            lb = document.createElement('div');
            lb.id = 'ilLightbox';
            lb.className = 'il-lightbox';
            lb.innerHTML = `
                <img id="ilLightboxImg" src="" alt="Full Size">
                <div class="il-lightbox-actions">
                    <button class="btn btn-accent" id="ilLightboxDl">${esc(t('imagelib.btn.ilLightboxDl'))}</button>
                    <button class="btn btn-ghost" id="ilLightboxClose">${esc(t('imagelib.btn.ilLightboxClose'))}</button>
                </div>`;
            lb.onclick = (e) => { if (e.target === lb) lb!.classList.remove('open'); };
            document.body.appendChild(lb);
        }
        const lbRef = lb;
        const imgEl = document.getElementById('ilLightboxImg') as HTMLImageElement | null;
        if (imgEl) imgEl.src = imageUrl;
        const dlEl = document.getElementById('ilLightboxDl');
        if (dlEl) dlEl.onclick = () => downloadImage(imageUrl);
        const closeEl = document.getElementById('ilLightboxClose');
        if (closeEl) closeEl.onclick = () => lbRef.classList.remove('open');
        lbRef.classList.add('open');
    }

    function downloadImage(url: string): void {
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-image-${Date.now()}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast(t('imagelib.t04'));
    }

    function copyToClipboard(text: string): void {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => showToast(t('imagelib.t05')));
        } else {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            showToast(t('imagelib.t05'));
        }
    }

    /* ===== CSS 주입 ===== */
    Mdd.injectCSS('imagelib', `
        .il-lib-header {
            display:flex; align-items:center; justify-content:space-between;
            margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border);
        }
        .il-lib-count { font-size:var(--font-size-sm); color:var(--text-secondary); font-weight:600; }
        .il-lib-grid {
            display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));
            gap:12px; overflow-y:auto; max-height:calc(100vh - 200px); padding:2px;
        }
        .il-lib-card {
            position:relative; border-radius:var(--radius-md); overflow:hidden;
            border:1px solid var(--border); background:var(--bg-tertiary);
            cursor:pointer; transition:all 0.25s ease; aspect-ratio:1;
        }
        .il-lib-card:hover {
            border-color:var(--accent); transform:translateY(-3px);
            box-shadow:0 8px 28px rgba(0,0,0,0.5);
        }
        .il-lib-card img { width:100%; height:100%; object-fit:cover; display:block; }
        .il-lib-card-overlay {
            position:absolute; inset:0;
            background:linear-gradient(transparent 30%, rgba(0,0,0,0.88) 100%);
            display:flex; flex-direction:column; justify-content:flex-end;
            padding:14px; opacity:0; transition:opacity 0.25s;
        }
        .il-lib-card:hover .il-lib-card-overlay { opacity:1; }
        .il-lib-card-model {
            display:inline-block; font-size:var(--font-size-2xs); padding:2px 8px; border-radius:4px;
            background:var(--accent); color:#fff; font-weight:600;
            margin-bottom:6px; width:fit-content;
        }
        .il-lib-card-prompt {
            font-size:var(--font-size-2xs); color:rgba(255,255,255,0.8); line-height:1.4;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .il-lib-card-date {
            font-size:var(--font-size-2xs); color:rgba(255,255,255,0.5); margin-top:4px;
        }

        .il-lib-empty {
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            padding:80px 20px; color:var(--text-tertiary); text-align:center;
        }
        .il-lib-empty-icon { font-size:56px; opacity:0.2; margin-bottom:20px; }
        .il-lib-empty-text { font-size:15px; font-weight:500; margin-bottom:6px; }
        .il-lib-empty-sub { font-size:var(--font-size-xs); opacity:0.6; }

        .il-detail { display:flex; gap:24px; min-height:480px; }
        .il-detail-image {
            flex:1; display:flex; align-items:center; justify-content:center;
            background:var(--bg-tertiary); border-radius:var(--radius-lg);
            border:1px solid var(--border); overflow:hidden; min-height:400px;
        }
        .il-detail-image img {
            max-width:100%; max-height:540px; border-radius:var(--radius-md);
            cursor:zoom-in; transition:transform 0.2s;
        }
        .il-detail-image img:hover { transform:scale(1.02); }
        .il-detail-info {
            width:320px; flex-shrink:0; display:flex; flex-direction:column; gap:16px;
        }
        .il-detail-model-badge {
            display:inline-flex; align-items:center; gap:6px;
            padding:8px 14px; border-radius:var(--radius-sm);
            background:var(--accent-subtle); color:var(--accent);
            font-size:var(--font-size-xs); font-weight:600; width:fit-content;
        }
        .il-detail-date { font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .il-detail-section-label {
            font-size:var(--font-size-xs); font-weight:600; color:var(--text-secondary); margin-bottom:6px;
        }
        .il-detail-prompt {
            font-size:var(--font-size-xs); line-height:1.6; color:var(--text-primary);
            background:var(--bg-tertiary); border:1px solid var(--border);
            border-radius:var(--radius-sm); padding:12px;
            max-height:220px; overflow-y:auto; word-break:break-word; white-space:pre-wrap;
        }
        .il-detail-stats {
            display:flex; gap:16px; font-size:var(--font-size-xs); color:var(--text-tertiary); font-family:monospace;
        }
        .il-detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:auto; }

        .il-lightbox {
            display:none; position:fixed; inset:0; z-index:9999;
            background:rgba(0,0,0,0.92); backdrop-filter:blur(4px);
            align-items:center; justify-content:center; flex-direction:column;
        }
        .il-lightbox.open { display:flex; }
        .il-lightbox img { max-width:92vw; max-height:85vh; border-radius:var(--radius-md); }
        .il-lightbox-actions { margin-top:16px; display:flex; gap:12px; }

        .il-search-bar {
            display:flex; gap:8px; align-items:center; margin-bottom:12px;
        }
        .il-search-bar input {
            flex:1; font-size:var(--font-size-xs); padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius-sm);
            background:var(--bg-primary); color:var(--text-primary); outline:none; font-family:inherit;
        }
        .il-search-bar input:focus { border-color:var(--accent); }
        .il-search-bar input::placeholder { color:var(--text-tertiary); }

        @media (max-width:768px) {
            .il-lib-grid { grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:8px; }
            .il-detail { flex-direction:column; min-height:auto; }
            .il-detail-info { width:100%; }
            .il-detail-image { min-height:280px; }
        }
    `);

    /* ===== 메인 빌드 ===== */
    function buildMain(container: HTMLElement): void {
        container.innerHTML = `
            <div id="ilGridView">
                <div class="il-lib-header">
                    <span class="il-lib-count" id="ilCount"></span>
                    <button class="btn btn-danger" id="ilClearBtn">${esc(t('imagelib.btn.ilClearBtn'))}</button>
                </div>
                <div class="il-search-bar">
                    <input type="text" id="ilSearchInput" placeholder="${esc(t('imagelib.ph.ilSearchInput'))}">
                </div>
                <div class="il-lib-grid" id="ilGridContent"></div>
                <div class="il-lib-empty" id="ilEmpty" style="display:none">
                    <div class="il-lib-empty-icon">🖼️</div>
                    <div class="il-lib-empty-text">${esc(t('imagelib.t01'))}</div>
                    <div class="il-lib-empty-sub">${esc(t('imagelib.t02'))}</div>
                </div>
            </div>
            <div id="ilDetailView" style="display:none">
                <button class="btn btn-ghost" id="ilBackBtn" style="margin-bottom:16px;">${esc(t('imagelib.btn.ilBackBtn'))}</button>
                <div class="il-detail">
                    <div class="il-detail-image">
                        <img id="ilDetailImg" src="" alt="">
                    </div>
                    <div class="il-detail-info">
                        <div class="il-detail-model-badge" id="ilDetailModel"></div>
                        <div class="il-detail-date" id="ilDetailDate"></div>
                        <div>
                            <div class="il-detail-section-label">${esc(t('imagelib.t03'))}</div>
                            <div class="il-detail-prompt" id="ilDetailPrompt"></div>
                        </div>
                        <div class="il-detail-stats" id="ilDetailStats"></div>
                        <div class="il-detail-actions" id="ilDetailActions"></div>
                    </div>
                </div>
            </div>`;

        requestAnimationFrame(() => {
            const clearBtn = document.getElementById('ilClearBtn');
            if (clearBtn) {
                clearBtn.onclick = async () => {
                    if (!confirm(t('imagelib.t06'))) return;
                    try {
                        await ImageDB!.clear();
                        loadGrid();
                        showToast(t('imagelib.t07'));
                    } catch (e) {
                        showToast(t('imagelib.t08'), 'error');
                    }
                };
            }

            const backBtn = document.getElementById('ilBackBtn');
            if (backBtn) {
                backBtn.onclick = () => {
                    const grid = document.getElementById('ilGridView');
                    const detail = document.getElementById('ilDetailView');
                    if (grid) grid.style.display = '';
                    if (detail) detail.style.display = 'none';
                };
            }

            const searchInput = document.getElementById('ilSearchInput');
            let searchDebounce: ReturnType<typeof setTimeout> | null = null;
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    if (searchDebounce) clearTimeout(searchDebounce);
                    searchDebounce = setTimeout(() => renderGrid(), 200);
                });
            }

            loadGrid();

            window.addEventListener('imagedb-change', () => loadGrid());
        });
    }

    let _allItems: ImageDBItem[] = [];

    async function loadGrid(): Promise<void> {
        try {
            _allItems = ImageDB ? await ImageDB.getAll() : [];
            renderGrid();
        } catch (e) {
            console.error('Library load error:', e);
        }
    }

    function renderGrid(): void {
        const searchInput = document.getElementById('ilSearchInput') as HTMLInputElement | null;
        const query = (searchInput?.value || '').trim().toLowerCase();
        const items = query
            ? _allItems.filter(item => (item.prompt || '').toLowerCase().includes(query) || (item.modelName || item.model || '').toLowerCase().includes(query))
            : _allItems;

        const countEl = document.getElementById('ilCount');
        const gridEl = document.getElementById('ilGridContent');
        const emptyEl = document.getElementById('ilEmpty');
        const clearBtn = document.getElementById('ilClearBtn');

        if (countEl) countEl.textContent = query ? t('imagelib.countOf', { n: items.length, all: _allItems.length }) : t('imagelib.countImages', { n: items.length });
        if (clearBtn) clearBtn.style.display = _allItems.length > 0 ? '' : 'none';

        if (items.length === 0) {
            if (gridEl) gridEl.style.display = 'none';
            if (emptyEl) { emptyEl.style.display = ''; const et = emptyEl.querySelector('.il-lib-empty-text'); if (et) et.textContent = query ? t('imagelib.t09') : t('imagelib.t01'); }
            return;
        }

        if (gridEl) gridEl.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';
        if (!gridEl) return;
        gridEl.innerHTML = '';

        items.forEach((item: ImageDBItem) => {
            const card = document.createElement('div');
            card.className = 'il-lib-card';
            card.innerHTML = `
                <img src="${escapeHtml(item.url)}" alt="" loading="lazy">
                <div class="il-lib-card-overlay">
                    <div class="il-lib-card-model">${escapeHtml(item.modelName || item.model || '')}</div>
                    <div class="il-lib-card-prompt">${escapeHtml(item.prompt || '')}</div>
                    <div class="il-lib-card-date">${formatTimestamp(item.timestamp)}</div>
                </div>`;
            card.onclick = () => showDetail(item);
            gridEl.appendChild(card);
        });
    }

    function showDetail(item: ImageDBItem): void {
        const gridView = document.getElementById('ilGridView');
        const detailView = document.getElementById('ilDetailView');
        if (gridView) gridView.style.display = 'none';
        if (detailView) detailView.style.display = '';

        const detailImg = document.getElementById('ilDetailImg') as HTMLImageElement | null;
        if (detailImg) {
            detailImg.src = item.url;
            detailImg.onclick = () => showLightbox(item.url);
        }
        const modelEl = document.getElementById('ilDetailModel');
        if (modelEl) modelEl.textContent = '🤖 ' + (item.modelName || item.model || 'Unknown');
        const dateEl = document.getElementById('ilDetailDate');
        if (dateEl) dateEl.textContent = formatTimestamp(item.timestamp);
        const promptEl = document.getElementById('ilDetailPrompt');
        if (promptEl) promptEl.textContent = item.prompt || '(프롬프트 없음)';

        const stats: string[] = [];
        if (item.tokens) stats.push(`${Number(item.tokens).toLocaleString()} tokens`);
        if (item.elapsed) stats.push(`${item.elapsed}s`);
        const statsEl = document.getElementById('ilDetailStats');
        if (statsEl) statsEl.textContent = stats.join(' · ') || '';

        const actionsEl = document.getElementById('ilDetailActions');
        if (!actionsEl) return;
        actionsEl.innerHTML = '';

        const actions: Array<{ label: string; cls: string; fn: () => void | Promise<void> }> = [
            {
                label: t('imagelib.t10', undefined, "🔄 프롬프트 재사용"), cls: 'btn-accent',
                fn: () => {
                    const igPromptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | HTMLInputElement | null;
                    if (igPromptEl) igPromptEl.value = item.prompt || '';
                    Toolbox.switchPage?.('imagegen');
                    showToast(t('imagelib.t11'));
                }
            },
            {
                label: t('imagelib.t12', undefined, "📋 프롬프트 복사"), cls: '',
                fn: () => copyToClipboard(item.prompt || '')
            },
            {
                label: t('imagelib.btn.ilLightboxDl', undefined, "⬇️ 다운로드"), cls: '',
                fn: () => downloadImage(item.url)
            },
            {
                label: t('imagelib.t13', undefined, "🗑️ 삭제"), cls: 'btn-danger',
                fn: async () => {
                    if (!confirm(t('imagelib.t14'))) return;
                    try {
                        await ImageDB!.remove(item.id);
                        if (gridView) gridView.style.display = '';
                        if (detailView) detailView.style.display = 'none';
                        loadGrid();
                        showToast(t('imagelib.t15'));
                    } catch (e) {
                        showToast(t('imagelib.t08'), 'error');
                    }
                }
            }
        ];

        actions.forEach(({ label, cls, fn }) => {
            const btn = document.createElement('button');
            btn.className = 'btn ' + (cls || 'btn-ghost');
            btn.textContent = label;
            btn.onclick = fn;
            actionsEl.appendChild(btn);
        });
    }

    /* ===== 위젯 등록 ===== */
    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta('imagelib'),
        tabs: [
            {
                id: 'imagelib-main',
                label: t('imagelib.tab.main', undefined, '라이브러리'),
                /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
                build: function (container: HTMLElement): void {
                    void loadNamespace('imagelib').then(function () {
                        buildMain(container);
                    });
                }
            }
        ]
    });
})();
