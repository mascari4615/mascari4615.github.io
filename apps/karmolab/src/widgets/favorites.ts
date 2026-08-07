/**
 * 즐겨찾기 모음 — 사이트 파비콘/아이콘으로 빠른 접속
 * - icon 미지정: 공개 URL은 Google s2/favicons / 로컬·사설은 지구본만(요청 없음)
 * - icon에 지구본 data URL(FAVICON_FALLBACK): Google이 404만 내는 항목만 수동 지정
 * - 그 외 명시 icon(Simple Icons 등): 그대로 사용
 * - 사용자 추가/삭제 (localStorage)
 * - 기본 목록: favorites-defaults.ts
 */
import { DEFAULT_ITEMS, FAVICON_FALLBACK, type FavoriteGroup, type FavoriteItem } from './favorites-defaults';

(function (): void {
    const STORAGE_KEY = 'toolbox_favorites';
    const VIEW_KEY = 'toolbox_fav_view';
    const FAVICON_IMG_ONERROR = 'this.onerror=null;this.src=' + JSON.stringify(FAVICON_FALLBACK);
    const FAVICON_API = 'https://www.google.com/s2/favicons?domain=';
    const KARMOLAB_FAVICON = '/apps/karmolab/img/favicon.ico';
    const FAVICON_SZ = '64';

    function isPrivateOrLocalHostname(host: string | null | undefined): boolean {
        if (!host) return true;
        const h = host.toLowerCase();
        if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
        if (h === '127.0.0.1' || h.startsWith('127.')) return true;
        if (h.startsWith('10.')) return true;
        if (h.startsWith('192.168.')) return true;
        const m = /^172\.(\d+)\./.exec(h);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n >= 16 && n <= 31) return true;
        }
        return false;
    }

    /**
     * 도구를 **주제별로** 나눈다 (TASK-KL-096).
     *
     * 예전에는 백 개가 넘는 도구를 「Toolbox」 한 덩어리에 통째로 쏟아 놨다. 이름을 이미 아는
     * 사람만 쓸 수 있는 화면이다 — 도구 전체 목록(/karmolab/t/)은 같은 도구를 열다섯 주제로
     * 나눠 보여 주는데 즐겨찾기만 안 나뉘어 있었다.
     *
     * **분류를 여기서 새로 적지 않는다.** 목록 페이지가 쓰는 것과 같은 두 곳에서 읽는다:
     *   ① 묶음 위젯 소속 (지연 메타의 `bundle`) — 「PDF 도구」·「소리 도구」 같은 주제
     *   ② 묶음이 없으면 도구가 등록할 때 밝힌 갈래 (`category` → Toolbox.getCategories 의 이름)
     * 손으로 한 벌 더 적어 두면 그날부터 목록과 즐겨찾기가 서로 다른 분류를 말하게 된다.
     *
     * 묶음 자신(예: `pdf`)은 항목에서 뺀다 — 소제목이 그 자리이고, 부분을 누르면 어차피
     * 묶음이 그 탭으로 열린다. 남겨 두면 같은 것이 제목과 항목에 두 번 나온다.
     */
    function getToolboxToolGroups(): FavoriteGroup[] {
        const tools = typeof Toolbox !== 'undefined' && Toolbox.getTools ? Toolbox.getTools() : [];
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        /* 묶음 소속은 **지연 메타**에서 직접 읽는다. Toolbox.findBundleFor 는 그 묶음이 이미
         * 로드됐을 때만 답하는데, 즐겨찾기는 첫 화면이라 대부분 아직 안 로드돼 있다 —
         * 그걸 쓰면 거의 다 「그 밖에」로 떨어져 나뉜 척만 하는 화면이 된다. */
        const bundleOf = (id: string): string | null => meta[id]?.bundle || null;
        const isBundleParent = new Set(
            Object.keys(meta)
                .map((id) => bundleOf(id))
                .filter((b): b is string => !!b)
        );

        const cats = Toolbox.getCategories?.() || [];
        const catLabel = new Map<string, string>(cats.map((c) => [c.id, c.label] as [string, string]));
        const catOrder = cats.map((c) => c.id);
        const ETC = '그 밖에';

        type Bucket = { title: string; fromBundle: boolean; catRank: number; items: FavoriteItem[] };
        const buckets = new Map<string, Bucket>();

        tools
            .filter((t) => {
                // 묶음의 탭으로 들어간 도구는 사이드바에선 숨겼지만 검색에서는 찾을 수 있어야 한다
                // (부르면 묶음의 그 탭이 열린다).
                if (t.hidden && !bundleOf(t.id)) return false;
                // 데스크톱 전용 (desktopOnly 또는 legacy category=desktop) = 브라우저 hide
                if ((t.desktopOnly === true || t.category === 'desktop') && !Toolbox.isDesktopApp?.()) return false;
                if (isBundleParent.has(t.id)) return false;
                return true;
            })
            .forEach((t) => {
                const b = bundleOf(t.id);
                const key = b ? `b:${b}` : `c:${t.category || ''}`;
                let bucket = buckets.get(key);
                if (!bucket) {
                    const title = b
                        ? meta[b]?.title || tools.find((x) => x.id === b)?.title || b
                        : catLabel.get(t.category || '') || ETC;
                    bucket = {
                        title,
                        fromBundle: !!b,
                        catRank: b ? -1 : catOrder.indexOf(t.category || ''),
                        items: []
                    };
                    buckets.set(key, bucket);
                }
                bucket.items.push({ type: 'tool' as const, toolId: t.id, label: t.title || t.id, icon: t.icon || '' });
            });

        // 순서: 주제 묶음이 먼저(큰 것부터 — 목록 페이지와 같은 규칙), 그다음 갈래, 「그 밖에」는 맨 끝.
        return [...buckets.values()]
            .sort((a, b) => {
                if (a.fromBundle !== b.fromBundle) return a.fromBundle ? -1 : 1;
                if (a.fromBundle) return b.items.length - a.items.length;
                const ra = a.catRank < 0 ? 99 : a.catRank;
                const rb = b.catRank < 0 ? 99 : b.catRank;
                return ra - rb;
            })
            .map((b) => ({ group: b.title, items: b.items }));
    }

    function getFaviconUrl(item: FavoriteItem): string {
        if (item.icon) return item.icon;
        const base = typeof location !== 'undefined' ? location.href : 'https://example.org/';
        let u: URL;
        try {
            u = new URL(item.url ?? '', base);
        } catch (_) {
            return FAVICON_FALLBACK;
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return FAVICON_FALLBACK;
        const host = u.hostname;
        const currentHost = typeof location !== 'undefined' ? location.hostname : '';
        if (currentHost && host === currentHost) return KARMOLAB_FAVICON;
        if (host === 'mascari4615.github.io') return KARMOLAB_FAVICON;
        if (isPrivateOrLocalHostname(host)) return FAVICON_FALLBACK;
        return FAVICON_API + encodeURIComponent(host) + '&sz=' + FAVICON_SZ;
    }

    function loadFavorites(): FavoriteGroup[] | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw) as FavoriteGroup[];
        } catch (_) {}
        return null;
    }

    function saveFavorites(data: FavoriteGroup[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_) {}
    }

    function getViewMode(): 'icon' | 'card' {
        try { return (localStorage.getItem(VIEW_KEY) as 'icon' | 'card') || 'icon'; } catch (_) { return 'icon'; }
    }
    function setViewMode(mode: 'icon' | 'card'): void {
        try { localStorage.setItem(VIEW_KEY, mode); } catch (_) {}
    }

    function buildGroups(defaultGroups: FavoriteGroup[], customGroups: FavoriteGroup[] | null): FavoriteGroup[] {
        const merged: FavoriteGroup[] = [];
        merged.push(...getToolboxToolGroups());
        /* 같은 이름이면 한 칸에 합친다. 도구 갈래 이름(「도구」)과 즐겨찾기 기본 그룹 이름이
         * 겹치는데, 그냥 밀어 넣으면 같은 제목의 칸이 화면에 두 번 뜬다 (TASK-KL-096). */
        const into = (name: string, items: FavoriteItem[]): void => {
            const existing = merged.find((m) => m.group === name);
            if (existing) existing.items.push(...items);
            else merged.push({ group: name, items });
        };
        defaultGroups.forEach((g) => into(g.group, g.items.map((it) => ({ ...it, isCustom: false }))));
        if (customGroups && Array.isArray(customGroups)) {
            customGroups.forEach((cg) => into(cg.group, (cg.items || []).map((it) => ({ ...it, isCustom: true }))));
        }
        return merged;
    }


    Mdd.injectCSS('favorites', `
        .fav-layout { display:flex; flex-direction:column; gap:24px; }
        .fav-group { display:flex; flex-direction:column; gap:12px; }
        .fav-group-title { font-size:var(--font-size-xs); font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; }
        .fav-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr)); gap:12px; }
        .fav-item { display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 8px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition); text-decoration:none; color:inherit; }
        .fav-item:hover { background:var(--bg-hover); border-color:var(--border-hover); transform:translateY(-12px); box-shadow:var(--shadow-float); }
        .fav-item:active { transform:translateY(0); }
        .fav-icon { width:52px; height:52px; border-radius:10px; object-fit:contain; background:var(--bg-secondary); }
        .fav-icon-svg { display:flex; align-items:center; justify-content:center; padding:6px; }
        .fav-icon-svg svg { width:32px; height:32px; stroke:var(--text-secondary); }
        .fav-label { font-size:var(--font-size-2xs); color:var(--text-secondary); text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fav-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
        .fav-add-form { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; padding:16px; background:var(--bg-tertiary); border:1px dashed var(--border); border-radius:var(--radius-md); }
        .fav-add-form input, .fav-add-form select { flex:1; min-width:180px; padding:8px 12px; font-size:var(--font-size-xs); background:var(--bg-primary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-add-form .form-group { display:flex; flex-direction:column; gap:4px; }
        .fav-add-form label { font-size:var(--font-size-2xs); color:var(--text-tertiary); }
        .fav-item-wrap { position:relative; }
        .fav-item-wrap .fav-remove { position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; background:var(--error); color:#fff; border:none; cursor:pointer; font-size:12px; line-height:1; opacity:0; transition:opacity var(--transition); display:flex; align-items:center; justify-content:center; z-index:1; }
        .fav-item-wrap:hover .fav-remove { opacity:1; }
        .fav-remove:hover { background:#dc2626; }
        .fav-view-toggle-btn { padding:8px; background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; transition:var(--transition); border-radius:4px; display:flex; align-items:center; justify-content:center; }
        .fav-view-toggle-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
        .fav-view-toggle-btn.active { background:var(--accent-subtle); border-color:var(--accent); color:var(--accent); }
        .fav-view-toggle-btn svg { width:18px; height:18px; }
        .fav-view-toggle-btn .fav-view-icon-card { display:none; }
        .fav-view-toggle-btn .fav-view-icon-grid { display:block; }
        .fav-view-toggle-btn[data-view="card"] .fav-view-icon-card { display:block; }
        .fav-view-toggle-btn[data-view="card"] .fav-view-icon-grid { display:none; }
        .fav-top-row { position:relative; display:flex; justify-content:center; align-items:center; margin-bottom:var(--space-md); }
        .fav-top-row .landing-search-wrap { flex:none; width:220px; margin:0; position:relative; }
        .fav-top-row .fav-view-toggle-wrap { position:absolute; right:0; top:50%; transform:translateY(-50%); display:flex; gap:6px; align-items:center; }
        .fav-add-btn { padding:8px; background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; transition:var(--transition); border-radius:4px; display:flex; align-items:center; justify-content:center; }
        .fav-add-btn:hover { background:var(--bg-hover); color:var(--accent); }
        .fav-add-btn svg { width:18px; height:18px; }
        .fav-add-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9998; display:flex; align-items:center; justify-content:center; padding:20px; opacity:0; pointer-events:none; transition:opacity var(--transition); }
        .fav-add-modal-backdrop.open { opacity:1; pointer-events:auto; }
        .fav-add-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:var(--space-lg); max-width:360px; width:100%; box-shadow:var(--shadow-float); }
        .fav-add-modal h3 { font-size:var(--font-size-sm); margin-bottom:var(--space-md); color:var(--text-primary); }
        .fav-add-modal .fav-add-form { display:flex; flex-direction:column; gap:12px; padding:0; border:none; background:none; align-items:stretch; }
        .fav-add-modal .fav-add-form .form-group { display:flex; flex-direction:column; gap:4px; width:100%; }
        .fav-add-modal .fav-add-form label { font-size:var(--font-size-2xs); color:var(--text-tertiary); }
        .fav-add-modal .fav-add-form input, .fav-add-modal .fav-add-form select { width:100%; min-width:0; box-sizing:border-box; padding:8px 12px; font-size:var(--font-size-xs); background:var(--bg-primary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-add-modal .fav-add-form .btn { width:100%; margin-top:4px; }
        .fav-top-row .landing-search-wrap .landing-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-tertiary); pointer-events:none; flex-shrink:0; }
        .fav-top-row .landing-search-wrap .landing-search { width:100%; padding:9px 12px 9px 36px; font-size:var(--font-size-xs); background:var(--bg-tertiary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-top-row .landing-search-wrap .landing-search:focus { outline:none; border-color:var(--accent); }
        .fav-top-row .landing-search-wrap .landing-search::placeholder { color:var(--text-tertiary); }
        .fav-grid.fav-grid-card { grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:16px; }
        .fav-grid.fav-grid-card .fav-item { padding:16px 12px; }
        .fav-grid.fav-grid-card .fav-icon { width:60px; height:60px; border-radius:12px; }
        .fav-grid.fav-grid-card .fav-icon-svg svg { width:40px; height:40px; }
        .fav-grid.fav-grid-card .fav-label { font-size:var(--font-size-xs); }
    `);

    function buildFavorites(container: HTMLElement): void {
        Mdd.linePreset('home_hub', { msg: '자주 가는 곳을 모아뒀어요~ 클릭해서 가봐요!' });

        function render(): void {
            const customNow = loadFavorites();
            const groupsNow = buildGroups(DEFAULT_ITEMS, customNow);
            const esc = Toolbox.escapeHtml ?? ((s: string) => s);
            const viewMode = getViewMode();
            const isCard = viewMode === 'card';

            container.innerHTML = `
                <div class="fav-layout">
                    <div class="fav-top-row">
                        <div class="landing-search-wrap">
                            <svg class="landing-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            <input type="text" class="landing-search" placeholder="도구·사이트 검색..." id="favSearch" autocomplete="off">
                        </div>
                        <div class="fav-view-toggle-wrap">
                            <button type="button" class="fav-add-btn" id="fav-add-open" title="추가하기">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button type="button" class="fav-view-toggle-btn ${isCard ? 'active' : ''}" data-view="${isCard ? 'card' : 'icon'}" title="${isCard ? '작게 보기' : '크게 보기'}">
                                <svg class="fav-view-icon fav-view-icon-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                                <svg class="fav-view-icon fav-view-icon-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/></svg>
                            </button>
                        </div>
                    </div>
                    ${groupsNow.map((g) => `
                        <div class="fav-group" data-fav-group="${esc(g.group)}">
                            <div class="fav-group-title">${esc(g.group)}</div>
                            <div class="fav-grid ${isCard ? 'fav-grid-card' : ''}">
                                ${g.items.map((it) => {
                                    const isTool = it.type === 'tool';
                                    const metaDesc = (it.toolId && Toolbox.getToolMeta?.(it.toolId)?.desc) || '';
                                    const searchable = [it.label, g.group, it.url || '', it.toolId || '', metaDesc].join(' ').toLowerCase();
                                    const removeBtn = it.isCustom && it.url
                                        ? `<button type="button" class="fav-remove" data-group="${esc(g.group)}" data-url="${esc(it.url)}" title="삭제">×</button>`
                                        : '';
                                    const iconHtml = isTool
                                        ? `<div class="fav-icon fav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.icon || ''}</svg></div>`
                                        // 늦은 로딩(lazy)을 쓰지 않는다. 아이콘은 52px 짜리 70장 —
                                        // 미뤄서 아낄 게 없는데, 브라우저가 「미뤘다」며 자리표시자로
                                        // 바꿔 놓으면 아이콘이 통째로 빈칸으로 보인다 (2026-08-08 제보).
                                        : `<img class="fav-icon" src="${esc(getFaviconUrl(it))}" alt="" decoding="async" onerror="${FAVICON_IMG_ONERROR.replace(/"/g, '&quot;')}">`;
                                    const linkAttrs = isTool
                                        ? `href="#" class="fav-item" title="${esc(it.label)}" data-tool-id="${esc(it.toolId || '')}"`
                                        : `href="${esc(it.url || '')}" class="fav-item" target="_blank" rel="noopener noreferrer" title="${esc(it.label)}"`;
                                    return `
                                    <div class="fav-item-wrap" data-searchable="${esc(searchable)}">
                                        ${removeBtn}
                                        <a ${linkAttrs}>
                                            ${iconHtml}
                                            <span class="fav-label">${esc(it.label)}</span>
                                        </a>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="fav-add-modal-backdrop" id="fav-add-modal">
                    <div class="fav-add-modal" onclick="event.stopPropagation()">
                        <h3>즐겨찾기 추가</h3>
                        <div class="fav-add-form">
                            <div class="form-group">
                                <label for="fav-url">URL</label>
                                <input type="url" id="fav-url" placeholder="https://example.com" class="input">
                            </div>
                            <div class="form-group">
                                <label for="fav-label">이름 (선택)</label>
                                <input type="text" id="fav-label" placeholder="사이트 이름" class="input">
                            </div>
                            <div class="form-group">
                                <label for="fav-icon">아이콘 URL (선택)</label>
                                <input type="url" id="fav-icon" placeholder="https://example.com/favicon.ico" class="input">
                            </div>
                            <div class="form-group">
                                <label for="fav-group">그룹</label>
                                <select id="fav-group" class="input">
                                    <option value="개발">개발</option>
                                    <option value="채용·커리어">채용·커리어</option>
                                    <option value="메이플">메이플</option>
                                    <option value="검색·AI">검색·AI</option>
                                    <option value="AI 아트">AI 아트</option>
                                    <option value="소셜·미디어">소셜·미디어</option>
                                    <option value="서로이웃">서로이웃</option>
                                    <option value="짝이웃">짝이웃</option>
                                    <option value="도구">도구</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            <button type="button" class="btn btn-primary" id="fav-add-btn">추가</button>
                        </div>
                    </div>
                </div>`;

            const modal = container.querySelector<HTMLElement>('#fav-add-modal');
            const openAddBtn = container.querySelector<HTMLButtonElement>('#fav-add-open');
            if (openAddBtn) {
                openAddBtn.onclick = () => modal?.classList.add('open');
            }
            if (modal) {
                modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };
            }

            container.querySelector<HTMLButtonElement>('#fav-add-btn')!.onclick = () => {
                const urlInput = container.querySelector<HTMLInputElement>('#fav-url');
                const labelInput = container.querySelector<HTMLInputElement>('#fav-label');
                const iconInput = container.querySelector<HTMLInputElement>('#fav-icon');
                const groupSelect = container.querySelector<HTMLSelectElement>('#fav-group');
                if (!urlInput || !labelInput || !groupSelect) return;
                const url = (urlInput.value || '').trim();
                if (!url) {
                    Toolbox.showToast?.('URL을 입력해주세요', 'error');
                    return;
                }
                let label = (labelInput.value || '').trim();
                if (!label) {
                    try {
                        label = new URL(url).hostname.replace(/^www\./, '');
                    } catch (_) {
                        label = url;
                    }
                }
                const iconUrl = (iconInput?.value || '').trim() || null;
                const group = groupSelect.value || '기타';
                const data = loadFavorites() || [];
                let g = data.find((d) => d.group === group);
                if (!g) {
                    g = { group, items: [] };
                    data.push(g);
                }
                g.items.push({ url, label, icon: iconUrl });
                saveFavorites(data);
                urlInput.value = '';
                labelInput.value = '';
                if (iconInput) iconInput.value = '';
                modal?.classList.remove('open');
                Toolbox.showToast?.('추가되었습니다');
                render();
            };

            container.querySelectorAll<HTMLButtonElement>('.fav-remove').forEach((btn) => {
                btn.onclick = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const group = btn.dataset.group;
                    const url = btn.dataset.url;
                    const data = loadFavorites() || [];
                    const g = data.find((d) => d.group === group);
                    if (g) {
                        g.items = g.items.filter((it) => it.url !== url);
                        if (!g.items.length) data.splice(data.indexOf(g), 1);
                        saveFavorites(data);
                        Toolbox.showToast?.('삭제되었습니다');
                        render();
                    }
                };
            });

            container.querySelectorAll<HTMLAnchorElement>('.fav-item[data-tool-id]').forEach((a) => {
                a.onclick = (e: MouseEvent) => {
                    e.preventDefault();
                    const id = a.dataset.toolId;
                    if (id && typeof Toolbox !== 'undefined' && Toolbox.switchPage) Toolbox.switchPage(id);
                };
            });

            const searchInput = container.querySelector<HTMLInputElement>('#favSearch');
            if (searchInput) {
                searchInput.oninput = () => {
                    const q = searchInput.value.toLowerCase().trim();
                    container.querySelectorAll<HTMLElement>('.fav-item-wrap').forEach((wrap) => {
                        const searchable = wrap.dataset.searchable ?? '';
                        const match = !q || searchable.includes(q);
                        wrap.style.display = match ? '' : 'none';
                    });
                    container.querySelectorAll<HTMLElement>('.fav-group').forEach((grp) => {
                        const visible = grp.querySelectorAll('.fav-item-wrap:not([style*="display: none"])');
                        grp.style.display = visible.length ? '' : 'none';
                    });
                };
            }

            const viewToggleBtn = container.querySelector<HTMLButtonElement>('.fav-view-toggle-btn');
            if (viewToggleBtn) {
                viewToggleBtn.onclick = () => {
                    const current = (viewToggleBtn.dataset.view as 'icon' | 'card' | undefined) ?? 'icon';
                    const next: 'icon' | 'card' = current === 'card' ? 'icon' : 'card';
                    setViewMode(next);
                    viewToggleBtn.dataset.view = next;
                    viewToggleBtn.title = next === 'card' ? '작게 보기' : '크게 보기';
                    viewToggleBtn.classList.toggle('active', next === 'card');
                    container.querySelectorAll<HTMLElement>('.fav-grid').forEach((grid) => {
                        grid.classList.toggle('fav-grid-card', next === 'card');
                    });
                };
            }
        }

        render();
    }

    Toolbox.register({
        id: 'favorites',
        title: '즐겨찾기',
        category: undefined,  // 기타
        desc: '자주 가는 사이트와 도구를 모아 빠르게 접속합니다',
        layout: 'wide',
        icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
        tabs: [{ id: 'fav-main', label: '즐겨찾기', build: buildFavorites }]
    });
})();
