import { t, loadNamespace } from '../../lib/i18n';

(function () {
    const T = ((window.Tierlist = window.Tierlist || {}) as unknown) as TierlistNamespace;

    let editorContainer: HTMLElement | null = null;
    let listContainer: HTMLElement | null = null;
    let statsContainer: HTMLElement | null = null;
    /** 편집기: 카드 클릭으로 삭제 */
    let editorDeleteMode = false;
    let editorDeleteModeEscBound = false;
    let lastQuickDeleteBlockedToastAt = 0;
    function setContainers({ editor, list, stats }: { editor?: HTMLElement | null; list?: HTMLElement | null; stats?: HTMLElement | null }) {
        if (editor !== undefined) editorContainer = editor;
        if (list !== undefined) listContainer = list;
        if (stats !== undefined) statsContainer = stats;
    }

    /** index.json 행: 후보 풀(catalog) vs 사이트에 올린 순위판(karmo). 미표기는 카탈로그. */
    function publishedIndexGroup(it: TlPublishedIndexItem): string {
        const g = String(it?.tierlistGroup ?? it?.group ?? '')
            .toLowerCase()
            .trim();
        if (g === 'karmo' || g === 'ranking' || g === 'instance' || g === t('tierlist.t24')) return 'karmo';
        return 'catalog';
    }

    /** 목록에서 항목 선택 후 편집 탭으로 전환 */
    function goToTierlistEditTab() {
        try {
            if (typeof Toolbox !== 'undefined' && Toolbox.switchPage && Toolbox.switchTab) {
                Toolbox.switchPage('tierlist', { pushHistory: false });
                Toolbox.switchTab('tl-edit');
            }
        } catch (_) {}
    }

    function optionsFromPublishedRows(rows: TlPublishedIndexItem[], meta: TlCurrentMetaView): string {
        if (!rows.length) return t('tierlist.t36');
        return [...rows]
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ko-KR'))
            .map((it) => {
                const selected = T.state.isPublishedMode() && meta.url === it.url;
                const esc = Toolbox.escapeHtml ?? ((s: string) => s);
                return `<option value="blog:${esc(it.url || '')}" ${selected ? 'selected' : ''}>${esc(it.title || it.id || 'tierlist')}</option>`;
            })
            .join('');
    }

    async function buildListSelectorHtml(st: TlState, meta: TlCurrentMetaView): Promise<string> {
        const esc = Toolbox.escapeHtml ?? ((s: string) => s);
        const localInst = Object.values(st.instances || {})
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ko-KR'))
            .map((l) => {
                const val = `local:${l.id}`;
                const sel = !T.state.isPublishedMode() && l.id === st.currentInstanceId;
                return `<option value="${esc(val)}" ${sel ? 'selected' : ''}>${esc(l.title || t('tierlist.noTitle'))}</option>`;
            }).join('');
        const localOptgroup = localInst
            ? `<optgroup label="${esc(t('tierlist.localRanks'))}">${localInst}</optgroup>`
            : t('tierlist.t37');

        let catalogOpts = t('tierlist.t36');
        let karmoOpts = t('tierlist.t36');
        try {
            const publishedRows = await T.publish.getPublishedIndex();
            const catalogRows: TlPublishedIndexItem[] = [];
            const karmoRows: TlPublishedIndexItem[] = [];
            publishedRows.forEach((it) => {
                (publishedIndexGroup(it) === 'karmo' ? karmoRows : catalogRows).push(it);
            });
            catalogOpts = optionsFromPublishedRows(catalogRows, meta);
            karmoOpts = optionsFromPublishedRows(karmoRows, meta);
        } catch (_) {
            catalogOpts = t('tierlist.t38');
            karmoOpts = t('tierlist.t38');
        }

        return `<select id="tl-list-select">
            <optgroup label="카탈로그">${catalogOpts}</optgroup>
            <optgroup label="Karmo 순위">${karmoOpts}</optgroup>
            ${localOptgroup}
        </select>`;
    }

    function bindListSelectChange() {
        editorContainer?.querySelector('#tl-list-select')?.addEventListener('change', async (e) => {
            const target = e.target as HTMLSelectElement | null;
            const v = String(target?.value || '');
            if (v.startsWith('local:')) {
                const id = v.slice('local:'.length);
                T.state.switchToInstance(id);
                await renderAll();
                return;
            }
            if (v.startsWith('blog:')) {
                const rel = v.slice('blog:'.length);
                try {
                    const items = await T.publish.getPublishedIndex();
                    const row = items.find((x) => x.url === rel);
                    const g = row ? publishedIndexGroup(row) : 'catalog';
                    await T.publish.openPublishedDirect(rel, {
                        id: row?.id || '',
                        title: row?.title || '',
                        url: rel,
                        tierlistGroup: g === 'karmo' ? 'karmo' : 'catalog',
                    });
                } catch (err) { Toolbox.showToast?.(t('tierlist.t39'), 'error', err); }
            }
        });
    }

    async function renderEditor() {
        if (!editorContainer) return;
        const esc = Toolbox.escapeHtml ?? ((s: string) => s);

        const st = T.state.getState();
        const meta = T.state.currentMeta();

        if (T.state.isPublishedCatalogMode()) {
            const snap = T.state.getPublishedCatalogSnapshot();
            const d = snap?.data || {} as TlPublishedData;
            const items = d.items || {};
            const fileImages = d.images || {};
            const keys = Object.values(items).filter((i) => i.imageKey).map((i) => i.imageKey as string);
            const dbMap = await T.db.getMany(keys);

            function cardHtmlCatalog(itemId: string): string {
                const item = items[itemId];
                if (!item) return '';
                const imgData = item.imageKey ? (fileImages[item.imageKey] || dbMap[item.imageKey]) : null;
                const inner = imgData
                    ? `<img src="${imgData}" alt="${esc(item.name || '')}">`
                    : `<div class="tl-item-text">${esc(item.name || '?')}</div>`;
                const nameTag = item.name ? `<div class="tl-item-name">${esc(item.name)}</div>` : '';
                return `<div class="tl-item tl-item--static" data-item-id="${itemId}">${inner}${nameTag}</div>`;
            }

            const selector = await buildListSelectorHtml(st, meta);
            const ids = Object.keys(items);
            const grid = ids.length
                ? ids.map(cardHtmlCatalog).join('')
                : t('tierlist.t40');

            editorContainer.innerHTML = `<div class="tl-wrap tl-wrap--embedded">
                <div class="tl-ribbon-embed" aria-hidden="true">${esc(t('tierlist.t03'))}</div>
                <div class="tl-toolbar">
                    ${selector}
                    <div class="tl-toolbar-spacer"></div>
                    <button class="tl-btn tl-btn-primary" id="tl-fork-catalog">${esc(t('tierlist.btn.tlforkcatalog'))}</button>
                    <button class="tl-btn" id="tl-btn-export-json">JSON</button>
                </div>
                <p style="font-size:13px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45;">
                    ${esc(t('tierlist.t04'))} <strong>${esc(t('tierlist.t05'))}</strong> ${esc(t('tierlist.t06'))} <strong>${esc(t('tierlist.btn.tlforkcatalog'))}</strong>${esc(t('tierlist.t07'))}
                </p>
                <div class="tl-pool" style="min-height:120px;">${grid}</div>
            </div>`;

            bindListSelectChange();
            editorContainer.querySelector('#tl-fork-catalog')?.addEventListener('click', async () => {
                try {
                    await T.publish.forkPublishedCatalogToLocal();
                    Toolbox.showToast?.(t('tierlist.t41'));
                    await renderAll();
                } catch (err) {
                    Toolbox.showToast?.(t('tierlist.t42'), 'error', err);
                }
            });
            editorContainer.querySelector('#tl-btn-export-json')?.addEventListener('click', () => T.publish.showJsonPreview());
            return;
        }

        const list = T.state.currentList();

        if (!list) {
            editorContainer.innerHTML = `<div class="tl-wrap"><div style="text-align:center; padding:48px 16px; color:var(--text-tertiary);">
                <div style="font-size:32px; margin-bottom:12px;">📋</div>
                <div>${esc(t('tierlist.t08'))}</div>
                <div style="margin-top:12px;"><button class="tl-btn tl-btn-primary" id="tl-empty-create">${esc(t('tierlist.btn.tlemptycreate'))}</button></div>
            </div></div>`;
            editorContainer.querySelector('#tl-empty-create')?.addEventListener('click', () => T.dialogs.showNewListDialog?.());
            return;
        }

        T.state.ensureListUserLabels(list);

        const syncListId = list.id;
        queueMicrotask(async () => {
            try {
                if (T.state.currentList()?.id !== syncListId) return;
                const changed = await T.publish.syncInstanceItemOriginsWithCatalogIfNeeded();
                if (changed && T.state.currentList()?.id === syncListId) await renderAll();
            } catch (_) {}
        });

        const allImageKeys = Object.values(list.items || {}).filter((i) => i.imageKey).map((i) => i.imageKey as string);
        const imgMap = await T.db.getMany(allImageKeys);
        const embeddedImages = T.state.getPublishedEmbeddedImages();

        function itemUserLabelsHtml(item: TlItem): string {
            const defs = list!.userLabels || {};
            const ids = item.userLabelIds || [];
            if (!ids.length) return '';
            const maxShow = 3;
            const shown = ids.slice(0, maxShow);
            const more = ids.length - shown.length;
            const pills: string[] = [];
            shown.forEach((lid) => {
                const d = defs[lid];
                if (!d) return;
                const bg = esc(d.color || '#666');
                const nm = esc(d.name || '');
                pills.push(`<span class="tl-item-userlabel" style="background:${bg}" title="${nm}">${nm}</span>`);
            });
            if (more > 0) {
                const rest = ids.slice(maxShow).map((lid) => defs[lid]?.name || lid).join(', ');
                pills.push(`<span class="tl-item-userlabel tl-item-userlabel--more" title="${esc(rest)}">+${more}</span>`);
            }
            return pills.length ? `<div class="tl-item-userlabels">${pills.join('')}</div>` : '';
        }

        function itemOriginBadge(item: TlItem | undefined): string {
            if (!item || (item.tlOrigin !== 'custom' && !item.tlEdited)) return '';
            const isAdd = item.tlOrigin === 'custom';
            const label = isAdd ? t('tierlist.btn.tlbtnadd') : t('tierlist.t43');
            const tip = isAdd ? t('tierlist.t44') : t('tierlist.t45');
            const cls = isAdd ? 'tl-item-badge tl-item-badge--add' : 'tl-item-badge tl-item-badge--edit';
            return `<span class="${cls}" title="${esc(tip)}">${esc(label)}</span>`;
        }

        function cardHtml(itemId: string): string {
            const item = list!.items[itemId];
            if (!item) return '';
            const imgData = item.imageKey
                ? (embeddedImages[item.imageKey] || imgMap[item.imageKey])
                : null;
            const inner = imgData
                ? `<img src="${imgData}" alt="${esc(item.name || '')}">`
                : `<div class="tl-item-text">${esc(item.name || '?')}</div>`;
            const nameTag = item.name ? `<div class="tl-item-name">${esc(item.name)}</div>` : '';
            return `<div class="tl-item" data-item-id="${itemId}">${itemOriginBadge(item)}${itemUserLabelsHtml(item)}${inner}${nameTag}</div>`;
        }

        const selector = await buildListSelectorHtml(st, meta);

        const isPublished = meta.source === 'published';
        const ribbon = isPublished
            ? `<div class="tl-ribbon-embed" aria-hidden="true">${meta.tierlistGroup === 'karmo' ? t('tierlist.t46') : t('tierlist.t47')}</div>`
            : '';
        const localBadge = !isPublished && list ? t('tierlist.t48') : '';
        const wrapClass = `${isPublished ? 'tl-wrap tl-wrap--embedded' : 'tl-wrap'} tl-wrap--toc-dock`;

        const tocChips = `${(list.tiers || []).map((tier) => {
            const col = esc(tier.color || '#ccc');
            const lab = esc(tier.label || '?');
            const tid = esc(tier.id);
            return `<button type="button" class="tl-dropzone tl-toc-chip" data-tier-id="${tid}" data-toc-drop="1" style="background:${col}" title="${esc(t('tierlist.toTierEnd', { tier: lab }))}">${lab}</button>`;
        }).join('')}
                <button type="button" class="tl-dropzone tl-toc-chip tl-toc-pool" data-tier-id="_pool" data-toc-drop="1" title="${esc(t('tierlist.t01'))}">${esc(t('tierlist.t09'))}</button>`;
        const tocNav = `<nav class="tl-toc tl-toc--dock" aria-label="${esc(t('tierlist.t02'))}">
                <span class="tl-toc-hint">${esc(t('tierlist.t10'))}</span>
                <div class="tl-toc-chip-row">${tocChips}</div>
            </nav>`;

        let html = `<div class="${wrapClass}">
            ${ribbon}
            <div class="tl-toolbar">
                ${selector}
                <div class="tl-toolbar-spacer"></div>
                ${localBadge}
                <button class="tl-btn" id="tl-btn-tiers" title="${esc(t('tierlist.title.tlbtntiers'))}">${esc(t('tierlist.btn.tlbtntiers'))}</button>
                <button class="tl-btn" id="tl-btn-userlabels" title="${esc(t('tierlist.title.tlbtnuserlabels'))}">${esc(t('tierlist.btn.tlbtnuserlabels'))}</button>
                <button class="tl-btn" id="tl-btn-add">${esc(t('tierlist.btn.tlbtnadd'))}</button>
                <button type="button" class="tl-btn${editorDeleteMode ? ' tl-btn-toggle-on' : ''}" id="tl-btn-delete-mode" aria-pressed="${editorDeleteMode ? 'true' : 'false'}" title="${esc(t('tierlist.title.tlbtndeletemode'))}">${esc(t('tierlist.btn.tlbtndeletemode'))}</button>
                <button class="tl-btn" id="tl-btn-export-img">${esc(t('tierlist.btn.tlbtnexportimg'))}</button>
                <button class="tl-btn" id="tl-btn-export-json" title="${esc(t('tierlist.title.tlbtnexportjson'))}">JSON</button>
            </div>
            <div class="tl-board" id="tl-editor-board">`;

        (list.tiers || []).forEach((tier) => {
            const rowItems = (list.rankings?.[tier.id] || []).map(cardHtml).join('');
            html += `<div class="tl-row">
                <div class="tl-label" style="background:${tier.color};color:#000;">${esc(tier.label)}</div>
                <div class="tl-dropzone" data-tier-id="${tier.id}">${rowItems}</div>
            </div>`;
        });

        html += `</div>
            <div class="tl-pool-section">
                <div class="tl-pool-header"><span class="tl-pool-title">${esc(t('tierlist.t09'))}</span></div>
                <div class="tl-pool" data-tier-id="_pool">${(list.rankings?._pool || []).map(cardHtml).join('')}</div>
            </div>
            ${tocNav}
        </div>`;

        editorContainer.innerHTML = html;

        const wrap = editorContainer.querySelector('.tl-wrap') as HTMLElement | null;
        if (!wrap) return;
        if (editorDeleteMode) wrap.classList.add('tl-delete-mode');

        function toastTierlistDrop(itemId: string, tierId: string | undefined, insertIdx: number) {
            const item = list!.items[itemId];
            const raw = String(item?.name || '').trim();
            const disp = raw.length > 30 ? raw.slice(0, 27) + '…' : (raw || '이름 없음');
            const tocAppend = Number(insertIdx) >= 999999;
            let dest: string;
            if (tierId === '_pool') {
                dest = tocAppend ? t('tierlist.t49') : t('tierlist.t09');
            } else {
                const tier = (list!.tiers || []).find((x) => x.id === tierId);
                const lab = String(tier?.label || '').trim() || '티어';
                dest = tocAppend ? t('tierlist.tierEnd', { tier: lab }) : lab;
            }
            Toolbox.showToast?.(t('tierlist.moved', { item: disp, to: dest }));
        }

        T.dnd.initDnD(wrap, {
            onDrop: ({ itemId, tierId, insertIdx }) => {
                if (tierId && T.state.moveItem(itemId, tierId, insertIdx)) toastTierlistDrop(itemId, tierId, insertIdx);
                renderAll();
            },
            shouldBlockDragStart(e) {
                return editorDeleteMode || !!(e.ctrlKey || e.metaKey);
            },
        });

        wrap.querySelector('.tl-toc')?.addEventListener('click', (e) => {
            const me = e as MouseEvent;
            const target = me.target as Element | null;
            const chip = target?.closest('.tl-toc-chip');
            if (!chip || me.button !== 0) return;
            const tid = chip.getAttribute('data-tier-id');
            if (!tid) return;
            if (tid === '_pool') {
                wrap.querySelector('.tl-pool-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
            }
            const board = wrap.querySelector('#tl-editor-board');
            const dz = board && [...board.querySelectorAll('.tl-dropzone[data-tier-id]')].find((z) => z.getAttribute('data-tier-id') === tid && !z.classList.contains('tl-toc-chip'));
            dz?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        wrap.addEventListener(
            'click',
            (e) => {
                const me = e as MouseEvent;
                const target = me.target as Element | null;
                const itemEl = target?.closest('.tl-item') as HTMLElement | null;
                if (!itemEl || itemEl.classList.contains('tl-item--static')) return;
                const itemId = itemEl.dataset.itemId;
                if (!itemId) return;
                const useDelete = editorDeleteMode || me.ctrlKey || me.metaKey;
                if (!useDelete) return;
                const item = list!.items[itemId];
                if (item?.tlOrigin !== 'custom') {
                    const now = Date.now();
                    if (now - lastQuickDeleteBlockedToastAt > 2000) {
                        lastQuickDeleteBlockedToastAt = now;
                        Toolbox.showToast?.(t('tierlist.t50'), 'error');
                    }
                    return;
                }
                me.preventDefault();
                me.stopPropagation();
                if (!T.state.removeItem(itemId)) {
                    Toolbox.showToast?.(t('tierlist.t51'), 'error');
                    return;
                }
                renderAll();
            },
            true,
        );

        bindListSelectChange();

        editorContainer.querySelector('#tl-btn-tiers')?.addEventListener('click', () => T.dialogs.showTierSettingsDialog?.());
        editorContainer.querySelector('#tl-btn-userlabels')?.addEventListener('click', () => T.dialogs.showUserLabelsManagerDialog?.());
        editorContainer.querySelector('#tl-btn-add')?.addEventListener('click', () => T.dialogs.showAddItemDialog?.());
        editorContainer.querySelector('#tl-btn-delete-mode')?.addEventListener('click', () => {
            editorDeleteMode = !editorDeleteMode;
            renderAll();
        });
        editorContainer.querySelector('#tl-btn-export-img')?.addEventListener('click', () => T.publish.exportAsImage());
        editorContainer.querySelector('#tl-btn-export-json')?.addEventListener('click', () => T.publish.showJsonPreview());

        wrap.addEventListener('contextmenu', (e) => {
            const me = e as MouseEvent;
            const target = me.target as Element | null;
            const itemEl = target?.closest('.tl-item') as HTMLElement | null;
            if (!itemEl) return;
            me.preventDefault();
            const itemId = itemEl.dataset.itemId;
            if (!itemId) return;
            const menu: Array<{ label: string; danger?: boolean; action: () => void } | 'sep'> = [
                { label: t('tierlist.t52'), action: () => T.dialogs.showEditItemDialog?.(itemId) },
                { label: t('tierlist.t53'), action: () => T.dialogs.showAssignUserLabelsDialog?.(itemId) },
            ];
            if (T.state.canResetItemFromPool(list!, itemId)) {
                menu.push({
                    label: t('tierlist.t54', undefined, "수정 초기화"),
                    action: () => {
                        T.publish.resetItemToCatalogDefault(itemId).then((ok) => { if (ok) renderAll(); });
                    },
                });
            }
            if (T.state.isItemRemovable(list!, itemId)) {
                menu.push('sep');
                menu.push({
                    label: t('tierlist.t55', undefined, "삭제"),
                    danger: true,
                    action: () => {
                        if (!T.state.removeItem(itemId)) {
                            Toolbox.showToast?.(t('tierlist.t56'), 'error');
                            return;
                        }
                        renderAll();
                    },
                });
            }
            T.ui.showContextMenu(me.clientX, me.clientY, menu);
        });

        if (!editorDeleteModeEscBound) {
            editorDeleteModeEscBound = true;
            document.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Escape' || !editorDeleteMode) return;
                editorDeleteMode = false;
                renderAll();
            });
        }
    }

    function renderListTab() {
        if (!listContainer) return;
        const esc = Toolbox.escapeHtml ?? ((s: string) => s);
        const st = T.state.getState();
        const meta = T.state.currentMeta();

        let html = `<div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
            <button class="tl-btn tl-btn-primary" id="tl-list-new-cat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> ${esc(t('tierlist.t11'))}</button>
            <button class="tl-btn" id="tl-list-new">${esc(t('tierlist.btn.tllistnew'))}</button>
            <button class="tl-btn" id="tl-list-import">${esc(t('tierlist.btn.tllistimport'))}</button>
        </div>
        <div class="tl-list-section">
            <h3 class="tl-list-section-title">${esc(t('tierlist.t12'))}</h3>
            <p class="tl-list-section-desc">
                <strong>${esc(t('tierlist.t13'))}</strong>${esc(t('tierlist.t14'))} <strong>${esc(t('tierlist.t15'))}</strong>${esc(t('tierlist.t16'))} <code>apps/karmolab/data/tierlists/index.json</code>${esc(t('tierlist.t17'))}
                <strong>${esc(t('tierlist.t18'))}</strong> ${esc(t('tierlist.t19'))} <strong>${esc(t('tierlist.t20'))}</strong>${esc(t('tierlist.t21'))}
            </p>
            <div class="tl-embed-grids">
                <h4 class="tl-list-subsection-title">${esc(t('tierlist.t13'))}</h4>
                <div id="tl-grid-embed-catalog" class="tl-list-grid">${esc(t('tierlist.label.tlgridembedcatalog'))}</div>
                <h4 class="tl-list-subsection-title">${esc(t('tierlist.t15'))}</h4>
                <div id="tl-grid-embed-karmo" class="tl-list-grid">${esc(t('tierlist.label.tlgridembedcatalog'))}</div>
                <h4 class="tl-list-subsection-title">${esc(t('tierlist.t18'))}</h4>
                <div id="tl-grid-local-pools" class="tl-list-grid">${esc(t('tierlist.label.tlgridembedcatalog'))}</div>
            </div>
        </div>
        <div class="tl-list-section" style="margin-top:28px;">
            <h3 class="tl-list-section-title">${esc(t('tierlist.t22'))}</h3>
            <p class="tl-list-section-desc">${esc(t('tierlist.t23'))}</p>
            <div id="tl-grid-instances" class="tl-list-grid">${esc(t('tierlist.label.tlgridembedcatalog'))}</div>
        </div>`;

        listContainer.innerHTML = html;

        listContainer.querySelector('#tl-list-new-cat')?.addEventListener('click', () => T.dialogs.showNewCatalogDialog?.());
        listContainer.querySelector('#tl-list-new')?.addEventListener('click', () => T.dialogs.showNewListDialog?.());
        listContainer.querySelector('#tl-list-import')?.addEventListener('click', () => T.publish.importFromJSONFilePicker());

        const gridEmbedCatalog = listContainer.querySelector('#tl-grid-embed-catalog');
        const gridEmbedKarmo = listContainer.querySelector('#tl-grid-embed-karmo');
        const gridLocalPools = listContainer.querySelector('#tl-grid-local-pools');
        const instGrid = listContainer.querySelector('#tl-grid-instances');

        async function embedIndexCardHtml(it: TlPublishedIndexItem): Promise<string> {
            const title = it.title || it.id || 'tierlist';
            const rel = it.url || '';
            const grp = publishedIndexGroup(it);
            const activeEmbed = T.state.isPublishedMode() && meta.url === rel;
            let countLine = '';
            if (rel) {
                try { countLine = await T.publish.getPublishedPreviewCountLine(rel); } catch (_) { /* 무시 */ }
            }
            const metaLine = countLine
                ? `${esc(countLine)} · ${esc(it.updatedAt || '—')}`
                : `index.json · ${esc(it.updatedAt || '—')}`;
            const pillClass = grp === 'karmo' ? 'tl-pill-karmo' : 'tl-pill-catalog';
            const pillLabel = grp === 'karmo' ? t('tierlist.t15') : t('tierlist.t13');
            const karmoCls = grp === 'karmo' ? ' tl-list-card-embed--karmo' : '';
            return `<div class="tl-list-card tl-list-card-embed${karmoCls}${activeEmbed ? ' active' : ''}" data-embed-url="${esc(rel)}" data-embed-title="${esc(title)}" data-embed-id="${esc(it.id || '')}" data-embed-group="${esc(grp)}">
                <div class="tl-list-pill-row"><span class="tl-pill ${pillClass}">${pillLabel}</span></div>
                <div class="tl-list-card-title">${esc(title)}</div>
                <div class="tl-list-card-meta">${metaLine}</div>
            </div>`;
        }

        (async () => {
            let blogErr = false;
            let blogItems: TlPublishedIndexItem[] = [];
            try {
                blogItems = await T.publish.getPublishedIndex();
            } catch (_) {
                blogErr = true;
            }

            const catalogItems: TlPublishedIndexItem[] = [];
            const karmoItems: TlPublishedIndexItem[] = [];
            blogItems.forEach((it) => {
                (publishedIndexGroup(it) === 'karmo' ? karmoItems : catalogItems).push(it);
            });

            let catalogEmbedHtml = '';
            let karmoEmbedHtml = '';
            if (blogErr) {
                const errCell =
                    t('tierlist.t57');
                catalogEmbedHtml = errCell;
                karmoEmbedHtml = errCell;
            } else {
                if (catalogItems.length) {
                    catalogEmbedHtml = (await Promise.all(catalogItems.map(embedIndexCardHtml))).join('');
                }
                if (karmoItems.length) {
                    karmoEmbedHtml = (await Promise.all(karmoItems.map(embedIndexCardHtml))).join('');
                }
            }

            const catalogs = Object.values(st.catalogs || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            let catHtml = '';
            catalogs.forEach((c) => {
                const n = Object.keys(c.items || {}).length;
                const date = new Date(c.updatedAt || Date.now());
                catHtml += `<div class="tl-list-card tl-list-card-catalog" data-catalog-id="${esc(c.id)}">
                    <div class="tl-list-pill-row"><span class="tl-pill tl-pill-cache">${esc(t('tierlist.t18'))}</span></div>
                    <div class="tl-list-card-title">${esc(c.title || '(이름 없음)')}</div>
                    <div class="tl-list-card-meta">총 ${n}개 · ${date.toLocaleDateString()} · 클릭 시 새 순위 생성</div>
                </div>`;
            });

            const emptyCat = t('tierlist.t58');
            const emptyKarmo = t('tierlist.t59');
            const emptyLocal = t('tierlist.t60');

            if (gridEmbedCatalog) {
                gridEmbedCatalog.innerHTML = blogErr ? catalogEmbedHtml : catalogEmbedHtml || emptyCat;
            }
            if (gridEmbedKarmo) {
                gridEmbedKarmo.innerHTML = blogErr ? karmoEmbedHtml : karmoEmbedHtml || emptyKarmo;
            }
            if (gridLocalPools) {
                gridLocalPools.innerHTML = catHtml || emptyLocal;
            }

            const instances = Object.values(st.instances || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            let instHtml = '';
            instances.forEach((inst) => {
                const ic = Object.keys(inst.items || {}).length;
                const rc = Object.entries(inst.rankings || {}).filter(([k]) => k !== '_pool').reduce((s, [, arr]) => s + (Array.isArray(arr) ? arr.length : 0), 0);
                const date = new Date(inst.updatedAt || Date.now());
                const active = !T.state.isPublishedMode() && inst.id === st.currentInstanceId;
                instHtml += `<div class="tl-list-card tl-list-card-instance${active ? ' active' : ''}" data-instance-id="${esc(inst.id)}">
                    <div class="tl-list-pill-row"><span class="tl-pill tl-pill-cache">${esc(t('tierlist.t24'))}</span></div>
                    <div class="tl-list-card-title">${esc(inst.title || '(제목 없음)')}</div>
                    <div class="tl-list-card-meta">아이템 ${ic} · 배치 ${rc} · ${date.toLocaleDateString()}</div>
                </div>`;
            });

            if (instGrid) {
                instHtml = instHtml || '<div class="tl-list-empty" style="grid-column:1/-1;"><div style="font-size:28px;margin-bottom:8px;">📋</div><div>로컬 순위가 없습니다. 후보 풀 카드를 누르거나 「빈 순위 만들기」를 쓰세요.</div></div>';
                instGrid.innerHTML = instHtml;
            }

            listContainer!.querySelectorAll<HTMLElement>('.tl-list-card-embed[data-embed-url]').forEach((card) => {
                card.addEventListener('click', async () => {
                    const rel = card.getAttribute('data-embed-url');
                    if (!rel) return;
                    const tit = card.getAttribute('data-embed-title') || '';
                    const eid = card.getAttribute('data-embed-id') || '';
                    const grp = card.getAttribute('data-embed-group') || 'catalog';
                    try {
                        await T.publish.openPublishedDirect(rel, {
                            id: eid,
                            title: tit,
                            url: rel,
                            tierlistGroup: grp === 'karmo' ? 'karmo' : 'catalog',
                        });
                        Toolbox.showToast?.(t('tierlist.t61'));
                        await renderAll();
                        goToTierlistEditTab();
                    } catch (err) {
                        Toolbox.showToast?.(t('tierlist.t62'), 'error', err);
                    }
                });
            });

            gridLocalPools?.querySelectorAll<HTMLElement>('.tl-list-card-catalog[data-catalog-id]').forEach((card) => {
                card.addEventListener('click', async () => {
                    const cid = card.dataset.catalogId;
                    if (!cid) return;
                    const c = T.state.getState().catalogs[cid];
                    if (!c || !Object.keys(c.items || {}).length) {
                        Toolbox.showToast?.(t('tierlist.t63'), 'error');
                        return;
                    }
                    T.state.createInstanceFromLocalCatalog(cid);
                    Toolbox.showToast?.(t('tierlist.t41'));
                    await renderAll();
                    goToTierlistEditTab();
                });
                card.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const cid = card.dataset.catalogId;
                    if (!cid) return;
                    T.ui.showContextMenu(e.clientX, e.clientY, [
                        { label: t('tierlist.t64'), action: () => T.dialogs.showAddCatalogItemDialog?.(cid) },
                        {
                            label: t('tierlist.t55', undefined, "삭제"),
                            danger: true,
                            action: () => {
                                if (!confirm(t('tierlist.t65'))) return;
                                T.state.deleteCatalog(cid);
                                void renderAll();
                                Toolbox.showToast?.(t('tierlist.t66'));
                            },
                        },
                    ]);
                });
            });

            instGrid?.querySelectorAll<HTMLElement>('.tl-list-card-instance[data-instance-id]').forEach((card) => {
                card.addEventListener('click', async () => {
                    const iid = card.dataset.instanceId;
                    if (!iid) return;
                    T.state.switchToInstance(iid);
                    await renderAll();
                    goToTierlistEditTab();
                });
                card.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const iid = card.dataset.instanceId;
                    if (!iid) return;
                    T.ui.showContextMenu(e.clientX, e.clientY, [
                        {
                            label: t('tierlist.t67', undefined, "복제"),
                            action: () => {
                                T.state.duplicateList(iid);
                                void renderAll().then(() => goToTierlistEditTab());
                                Toolbox.showToast?.(t('tierlist.t68'));
                            },
                        },
                        {
                            label: t('tierlist.t55', undefined, "삭제"),
                            danger: true,
                            action: () => {
                                if (!confirm(t('tierlist.t69'))) return;
                                T.state.deleteList(iid);
                                void renderAll().then(() => goToTierlistEditTab());
                                Toolbox.showToast?.(t('tierlist.t70'));
                            },
                        },
                    ]);
                });
            });
        })();
    }

    function renderStats() {
        if (!statsContainer) return;
        const esc = Toolbox.escapeHtml ?? ((s: string) => s);
        const bundles = T.state.iterAllInstances();

        if (!bundles.length) {
            statsContainer.innerHTML = t('tierlist.t71');
            return;
        }

        let totalItems = 0, totalRanked = 0;
        const tierCounts: Record<string, { count: number; color: string }> = {};

        bundles.forEach(({ list: l }) => {
            const itemCount = Object.keys(l.items || {}).length;
            totalItems += itemCount;
            (l.tiers || []).forEach((tier) => {
                const count = (l.rankings?.[tier.id] || []).length;
                totalRanked += count;
                const key = String(tier.label || tier.id || '?').toUpperCase();
                tierCounts[key] = (tierCounts[key] || { count: 0, color: tier.color || '#999' });
                tierCounts[key].count += count;
            });
        });

        const maxCount = Math.max(1, ...Object.values(tierCounts).map((v) => v.count));

        let html = `<div class="tl-stats">
            <div class="tl-stat-cards">
                <div class="tl-stat-card"><div class="tl-stat-card-value">${bundles.length}</div><div class="tl-stat-card-label">${esc(t('tierlist.t25'))}</div></div>
                <div class="tl-stat-card"><div class="tl-stat-card-value">${totalItems}</div><div class="tl-stat-card-label">${esc(t('tierlist.t26'))}</div></div>
                <div class="tl-stat-card"><div class="tl-stat-card-value">${totalRanked}</div><div class="tl-stat-card-label">${esc(t('tierlist.t27'))}</div></div>
                <div class="tl-stat-card"><div class="tl-stat-card-value">${totalItems - totalRanked}</div><div class="tl-stat-card-label">${esc(t('tierlist.t09'))}</div></div>
            </div>
            <div class="tl-stat-section">
                <h4>${esc(t('tierlist.t28'))}</h4>`;

        for (const [label, { count, color }] of Object.entries(tierCounts)) {
            const pct = Math.round((count / maxCount) * 100);
            html += `<div class="tl-bar-row">
                <div class="tl-bar-label" style="color:${esc(color)}">${esc(label)}</div>
                <div class="tl-bar-track"><div class="tl-bar-fill" style="width:${pct}%;background:${esc(color)};"><span class="tl-bar-count">${count}</span></div></div>
            </div>`;
        }

        html += `</div>
            <div class="tl-stat-section">
                <h4>${esc(t('tierlist.t29'))}</h4>
                <table class="tl-stat-table">
                    <thead><tr><th>${esc(t('tierlist.t30'))}</th><th>${esc(t('tierlist.t31'))}</th><th>${esc(t('tierlist.t32'))}</th><th>${esc(t('tierlist.t33'))}</th><th>${esc(t('tierlist.t34'))}</th><th>${esc(t('tierlist.t35'))}</th></tr></thead>
                    <tbody>`;

        function sourceLabel(l: TlListInstance): string {
            const s = l.meta?.source || 'local';
            if (s === 'from-local-catalog') return t('tierlist.t18');
            if (s === 'from-catalog') return t('tierlist.t72');
            if (s === 'published-draft') return t('tierlist.t73');
            if (s === 'import') return t('tierlist.t74');
            if (s === 'duplicate') return t('tierlist.t67');
            return s;
        }

        bundles.sort((a, b) => (b.list.updatedAt || 0) - (a.list.updatedAt || 0)).forEach(({ list: l }) => {
            const ic = Object.keys(l.items || {}).length;
            const rc = Object.entries(l.rankings || {}).filter(([k]) => k !== '_pool').reduce((s, [, arr]) => s + (Array.isArray(arr) ? arr.length : 0), 0);
            html += `<tr>
                <td>${esc(sourceLabel(l))}</td>
                <td>${esc(l.title || t('tierlist.noTitle'))}</td>
                <td>${esc(l.category || '-')}</td>
                <td>${ic}</td>
                <td>${rc}</td>
                <td>${new Date(l.updatedAt || Date.now()).toLocaleDateString()}</td>
            </tr>`;
        });

        html += '</tbody></table></div></div>';
        statsContainer.innerHTML = html;
    }

    async function renderAll() {
        await renderEditor();
        renderListTab();
        renderStats();
    }

    T.render = {
        setContainers,
        renderEditor,
        renderAll,
        renderListTab,
        renderStats,
        publishedIndexGroup,
    };
})();
