(function () {
    interface TierItem {
        name?: string;
        tlOrigin?: string;
        tlEdited?: boolean;
        userLabelIds?: string[];
        [k: string]: unknown;
    }
    interface UserLabelDef { id: string; name?: string; color?: string }
    interface TierDef { id: string; label?: string; color?: string }
    interface TierList {
        items?: Record<string, TierItem>;
        tiers?: TierDef[];
        userLabels: Record<string, UserLabelDef>;
        updatedAt?: number;
        [k: string]: unknown;
    }
    interface Catalog { items?: Record<string, TierItem>; [k: string]: unknown }
    interface DialogMountArgs { dialog: HTMLElement; close: () => void }
    interface OpenDialogOptions {
        title: string;
        wide?: boolean;
        bodyHtml: string;
        onMount: (args: DialogMountArgs) => void;
    }
    interface TierlistApi {
        state: {
            currentList: () => TierList | null;
            processImageFile: (f: File) => Promise<string>;
            addItem: (name: string, imgKey: string | null) => void;
            canResetItemFromPool: (list: TierList, itemId: string) => boolean;
            ensureWritableList?: (reason: string) => void;
            saveState: () => void;
            createList: (title: string, cat: string) => void;
            getState: () => { catalogs?: Record<string, Catalog | undefined>; [k: string]: unknown };
            createCatalog: (title: string, cat: string) => void;
            addCatalogItem: (catalogId: string, name: string, imgKey: string | null) => void;
            uid: () => string;
            getDefaultTiers: () => TierDef[];
            applyTiers: (list: TierList, tiers: TierDef[]) => boolean;
            ensureListUserLabels: (list: TierList) => void;
            addUserLabelDef: (name: string, color: string) => void;
            updateUserLabelDef: (id: string, name: string, color: string) => void;
            countCardsUsingUserLabel: (id: string) => number;
            removeUserLabelDef: (id: string) => void;
            setItemUserLabelIds: (itemId: string, ids: string[]) => void;
        };
        ui: { openDialog: (o: OpenDialogOptions) => void };
        publish: { resetItemToCatalogDefault: (itemId: string) => Promise<boolean> };
        render: { renderAll: () => void };
        dialogs?: Record<string, unknown>;
    }

    const T = ((window.Tierlist = window.Tierlist || {}) as unknown) as TierlistApi;

    function dq<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
        return root.querySelector(sel) as T | null;
    }

    const esc = (s: string): string => Toolbox.escapeHtml?.(s) ?? s;

    function showAddItemDialog(): void {
        const list = T.state.currentList();
        if (!list) { Toolbox.showToast?.('먼저 티어리스트를 선택하세요.', 'error'); return; }

        let pendingFiles: File[] = [];
        T.ui.openDialog({
            title: '아이템 추가',
            wide: false,
            bodyHtml: `
                <input type="file" id="tl-add-file" accept="image/*" multiple>
                <label>이름(선택)</label>
                <input type="text" id="tl-add-name" placeholder="아이템 이름">
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-add-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-add-ok">추가</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const fileInput = dq<HTMLInputElement>(dialog, '#tl-add-file');
                const nameInput = dq<HTMLInputElement>(dialog, '#tl-add-name');
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-add-cancel');
                const ok = dq<HTMLButtonElement>(dialog, '#tl-add-ok');
                if (!fileInput || !nameInput || !cancel || !ok) return;
                fileInput.onchange = () => {
                    pendingFiles = Array.from(fileInput.files || []).filter(f => f.type.startsWith('image/'));
                };
                cancel.onclick = close;
                ok.onclick = async () => {
                    const name = nameInput.value.trim();
                    if (!pendingFiles.length && !name) { Toolbox.showToast?.('이미지나 이름을 입력하세요.', 'error'); return; }
                    close();
                    if (pendingFiles.length) {
                        for (const f of pendingFiles) {
                            const imgKey = await T.state.processImageFile(f);
                            T.state.addItem(name || f.name.replace(/\.[^.]+$/, ''), imgKey);
                        }
                    } else {
                        T.state.addItem(name, null);
                    }
                    T.render.renderAll();
                };
            }
        });
    }

    function showEditItemDialog(itemId: string): void {
        const list = T.state.currentList();
        if (!list?.items?.[itemId]) return;
        const item = list.items[itemId];
        const origName = item.name || '';

        const showReset = T.state.canResetItemFromPool(list, itemId);
        T.ui.openDialog({
            title: '아이템 편집',
            wide: false,
            bodyHtml: `
                <label>이름</label>
                <input type="text" id="tl-edit-name" value="${Toolbox.escapeHtml?.(item.name || '') ?? ''}">
                ${showReset ? '<p class="tl-tier-hint" style="margin-top:10px;">이름·이미지·라벨을 연결된 후보 풀과 동일하게 맞춥니다.</p><button type="button" class="tl-btn" id="tl-edit-reset" style="margin-top:6px;">수정 초기화 (풀과 같게)</button>' : ''}
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-edit-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-edit-ok">저장</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                dq<HTMLButtonElement>(dialog, '#tl-edit-reset')?.addEventListener('click', async () => {
                    const ok = await T.publish.resetItemToCatalogDefault(itemId);
                    if (ok) {
                        close();
                        T.render.renderAll();
                    }
                });
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-edit-cancel');
                const okBtn = dq<HTMLButtonElement>(dialog, '#tl-edit-ok');
                if (!cancel || !okBtn) return;
                cancel.onclick = close;
                okBtn.onclick = () => {
                    T.state.ensureWritableList?.('editItem');
                    const cur = T.state.currentList();
                    if (!cur?.items?.[itemId]) { close(); return; }
                    const nameInput = dq<HTMLInputElement>(dialog, '#tl-edit-name');
                    const next = nameInput?.value.trim() ?? '';
                    const it = cur.items[itemId];
                    it.name = next;
                    /** 직접 추가(custom)만 제외 — tlOrigin 누락·레거시 풀 카드도 이름 바꾸면 「수정」 */
                    if (next !== origName && it.tlOrigin !== 'custom') it.tlEdited = true;
                    cur.updatedAt = Date.now();
                    T.state.saveState();
                    close();
                    T.render.renderAll();
                };
            }
        });
    }

    function showNewListDialog(): void {
        T.ui.openDialog({
            title: '새 티어리스트',
            wide: false,
            bodyHtml: `
                <label>제목</label>
                <input type="text" id="tl-new-title" placeholder="예: 2026 애니">
                <label>카테고리</label>
                <input type="text" id="tl-new-cat" placeholder="예: 애니">
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-new-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-new-ok">생성</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-new-cancel');
                const ok = dq<HTMLButtonElement>(dialog, '#tl-new-ok');
                if (!cancel || !ok) return;
                cancel.onclick = close;
                ok.onclick = () => {
                    const titleEl = dq<HTMLInputElement>(dialog, '#tl-new-title');
                    const catEl = dq<HTMLInputElement>(dialog, '#tl-new-cat');
                    const t = titleEl?.value.trim() ?? '';
                    const c = catEl?.value.trim() ?? '';
                    T.state.createList(t || '새 티어리스트', c);
                    close();
                    T.render.renderAll();
                };
            }
        });
    }

    function showNewCatalogDialog(): void {
        T.ui.openDialog({
            title: '새 후보 풀',
            wide: false,
            bodyHtml: `
                <label>주제 이름</label>
                <input type="text" id="tl-cat-title" placeholder="예: 2026 겨울 애니 후보">
                <label>카테고리(선택)</label>
                <input type="text" id="tl-cat-cat" placeholder="예: 애니">
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-cat-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-cat-ok">만들기</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-cat-cancel');
                const ok = dq<HTMLButtonElement>(dialog, '#tl-cat-ok');
                if (!cancel || !ok) return;
                cancel.onclick = close;
                ok.onclick = () => {
                    const titleEl = dq<HTMLInputElement>(dialog, '#tl-cat-title');
                    const catEl = dq<HTMLInputElement>(dialog, '#tl-cat-cat');
                    const t = titleEl?.value.trim() ?? '';
                    const c = catEl?.value.trim() ?? '';
                    T.state.createCatalog(t || '새 후보 풀', c);
                    close();
                    T.render.renderAll();
                    Toolbox.showToast?.('후보 풀을 만들었어요. 목록에서 우클릭으로 항목을 추가할 수 있어요.');
                };
            }
        });
    }

    function showAddCatalogItemDialog(catalogId: string): void {
        const cat = T.state.getState().catalogs?.[catalogId];
        if (!cat) return;

        let pendingFiles: File[] = [];
        T.ui.openDialog({
            title: '후보 항목 추가',
            wide: false,
            bodyHtml: `
                <input type="file" id="tl-cat-add-file" accept="image/*" multiple>
                <label>이름(선택)</label>
                <input type="text" id="tl-cat-add-name" placeholder="항목 이름">
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-cat-add-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-cat-add-ok">추가</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const fileInput = dq<HTMLInputElement>(dialog, '#tl-cat-add-file');
                const nameInput = dq<HTMLInputElement>(dialog, '#tl-cat-add-name');
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-cat-add-cancel');
                const ok = dq<HTMLButtonElement>(dialog, '#tl-cat-add-ok');
                if (!fileInput || !nameInput || !cancel || !ok) return;
                fileInput.onchange = () => {
                    pendingFiles = Array.from(fileInput.files || []).filter(f => f.type.startsWith('image/'));
                };
                cancel.onclick = close;
                ok.onclick = async () => {
                    const name = nameInput.value.trim();
                    if (!pendingFiles.length && !name) { Toolbox.showToast?.('이미지나 이름을 입력하세요.', 'error'); return; }
                    close();
                    if (pendingFiles.length) {
                        for (const f of pendingFiles) {
                            const imgKey = await T.state.processImageFile(f);
                            T.state.addCatalogItem(catalogId, name || f.name.replace(/\.[^.]+$/, ''), imgKey);
                        }
                    } else {
                        T.state.addCatalogItem(catalogId, name, null);
                    }
                    T.render.renderAll();
                };
            }
        });
    }

    function normTierColor(c: unknown): string {
        const s = String(c || '#999999').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
        if (/^#[0-9a-fA-F]{3}$/.test(s)) {
            return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
        }
        return '#999999';
    }

    function tierRowHtml(t: TierDef): string {
        const id = esc(t.id);
        const lab = esc(t.label || '');
        const col = esc(normTierColor(t.color));
        return `<div class="tl-tier-row" data-tier-id="${id}">
            <input type="text" class="tl-tier-label" value="${lab}" maxlength="12" aria-label="티어 이름">
            <input type="color" class="tl-tier-color" value="${col}" aria-label="티어 색">
            <div class="tl-tier-row-btns">
                <button type="button" class="tl-btn tl-tier-up" title="위로">↑</button>
                <button type="button" class="tl-btn tl-tier-down" title="아래로">↓</button>
                <button type="button" class="tl-btn tl-tier-del" title="삭제">✕</button>
            </div>
        </div>`;
    }

    function showTierSettingsDialog(): void {
        T.state.ensureWritableList?.('tierSettings');
        const list = T.state.currentList();
        if (!list?.tiers?.length) {
            Toolbox.showToast('순위 보드를 먼저 열어 주세요.', 'error');
            return;
        }

        T.ui.openDialog({
            title: '티어 설정 (S A B … 이름·색·순서)',
            wide: true,
            bodyHtml: `
                <p class="tl-tier-hint">위에서 아래 순으로 티어판에 나옵니다. 줄을 삭제하면 그 티어에 있던 카드는 <strong>미배치</strong>로 옮겨집니다.</p>
                <div id="tl-tier-rows" class="tl-tier-rows"></div>
                <div class="tl-tier-actions">
                    <button type="button" class="tl-btn" id="tl-tier-add">티어 추가</button>
                    <button type="button" class="tl-btn" id="tl-tier-default">S A B C D F로 맞추기</button>
                </div>
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-tier-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-tier-ok">저장</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const wrap = dq<HTMLElement>(dialog, '#tl-tier-rows');
                const addBtn = dq<HTMLButtonElement>(dialog, '#tl-tier-add');
                const defaultBtn = dq<HTMLButtonElement>(dialog, '#tl-tier-default');
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-tier-cancel');
                const okBtn = dq<HTMLButtonElement>(dialog, '#tl-tier-ok');
                if (!wrap || !addBtn || !defaultBtn || !cancel || !okBtn) return;
                const paint = (tiers: TierDef[] | undefined): void => {
                    wrap.innerHTML = (tiers || []).map(tierRowHtml).join('');
                };
                paint(list.tiers);

                wrap.addEventListener('click', (ev: Event) => {
                    const target = ev.target as Element | null;
                    const btn = target?.closest('button');
                    if (!btn || !wrap.contains(btn)) return;
                    const row = btn.closest('.tl-tier-row');
                    if (!row) return;
                    if (btn.classList.contains('tl-tier-up')) {
                        const prev = row.previousElementSibling;
                        if (prev) wrap.insertBefore(row, prev);
                    } else if (btn.classList.contains('tl-tier-down')) {
                        const next = row.nextElementSibling;
                        if (next) wrap.insertBefore(next, row);
                    } else if (btn.classList.contains('tl-tier-del')) {
                        if (wrap.querySelectorAll('.tl-tier-row').length <= 1) {
                            Toolbox.showToast?.('티어는 최소 1개 필요합니다.', 'error');
                            return;
                        }
                        row.remove();
                    }
                });

                addBtn.onclick = () => {
                    const id = 'tr-' + T.state.uid();
                    const holder = document.createElement('div');
                    holder.innerHTML = tierRowHtml({ id, label: '?', color: '#cccccc' });
                    const first = holder.firstElementChild;
                    if (first) wrap.appendChild(first);
                };

                defaultBtn.onclick = () => {
                    if (!confirm('티어 줄을 S A B C D F(기본 색)로 바꿉니다.\n지금 쓰는 티어 id와 다른 줄에 있던 카드는 미배치로 옮겨질 수 있어요. 계속할까요?')) return;
                    paint(T.state.getDefaultTiers());
                };

                cancel.onclick = close;
                okBtn.onclick = () => {
                    const rows = [...wrap.querySelectorAll('.tl-tier-row')] as HTMLElement[];
                    if (!rows.length) {
                        Toolbox.showToast?.('티어는 최소 1개 필요합니다.', 'error');
                        return;
                    }
                    const cur = T.state.currentList();
                    if (!cur) {
                        Toolbox.showToast?.('순위를 찾을 수 없어요.', 'error');
                        return;
                    }
                    const tiers: TierDef[] = rows.map(r => {
                        const labelEl = r.querySelector('.tl-tier-label') as HTMLInputElement | null;
                        const colorEl = r.querySelector('.tl-tier-color') as HTMLInputElement | null;
                        return {
                            id: r.getAttribute('data-tier-id') || r.dataset.tierId || '',
                            label: labelEl?.value.trim() || '?',
                            color: colorEl?.value || '#cccccc',
                        };
                    });
                    if (!T.state.applyTiers(cur, tiers)) {
                        Toolbox.showToast?.('저장에 실패했어요.', 'error');
                        return;
                    }
                    close();
                    T.render.renderAll();
                };
            },
        });
    }

    function showUserLabelsManagerDialog(): void {
        T.state.ensureWritableList?.('userLabels');
        const list0 = T.state.currentList();
        if (!list0) {
            Toolbox.showToast?.('순위 보드를 먼저 열어 주세요.', 'error');
            return;
        }
        T.state.ensureListUserLabels(list0);

        T.ui.openDialog({
            title: '카드 라벨 · 뱃지 (이름·색)',
            wide: true,
            bodyHtml: `
                <p class="tl-tier-hint">여기서 만든 라벨을 카드 <strong>우클릭 → 라벨</strong>에서 고를 수 있어요. 이름은 카드 위에 색 띠로 보입니다.</p>
                <div id="tl-ul-manager-body" class="tl-ul-manager-body"></div>
                <button type="button" class="tl-btn" id="tl-ul-add">라벨 추가</button>
                <div class="tl-dialog-actions">
                    <button class="tl-btn tl-btn-primary" id="tl-ul-done">닫기</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const body = dq<HTMLElement>(dialog, '#tl-ul-manager-body');
                const addBtn = dq<HTMLButtonElement>(dialog, '#tl-ul-add');
                const doneBtn = dq<HTMLButtonElement>(dialog, '#tl-ul-done');
                if (!body || !addBtn || !doneBtn) return;

                function paint(): void {
                    if (!body) return;
                    const list = T.state.currentList();
                    if (!list) return;
                    T.state.ensureListUserLabels(list);
                    const defs = Object.values(list.userLabels).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
                    if (!defs.length) {
                        body.innerHTML = '<div class="tl-ul-empty">아직 라벨이 없습니다. 「라벨 추가」로 예: 보기만 함, 기대작 등을 만드세요.</div>';
                        return;
                    }
                    body.innerHTML = defs.map(d => {
                        const n = T.state.countCardsUsingUserLabel(d.id);
                        const nm = esc(d.name || '');
                        const col = esc(d.color || '#5c6bc0');
                        return `<div class="tl-ul-row" data-id="${esc(d.id)}">
                            <input type="text" class="tl-ul-name" value="${nm}" maxlength="32" aria-label="라벨 이름">
                            <input type="color" class="tl-ul-color" value="${col}" aria-label="라벨 색">
                            <span class="tl-ul-usage" title="이 라벨이 붙은 카드 수">${n}장</span>
                            <button type="button" class="tl-btn tl-ul-del" title="삭제">✕</button>
                        </div>`;
                    }).join('');
                }

                paint();

                addBtn.onclick = () => {
                    T.state.addUserLabelDef('새 라벨', '#5c6bc0');
                    paint();
                };

                body.addEventListener('change', (ev: Event) => {
                    const target = ev.target as Element | null;
                    const row = target?.closest('.tl-ul-row') as HTMLElement | null;
                    if (!row) return;
                    const id = row.getAttribute('data-id') || row.dataset.id || '';
                    const nameEl = row.querySelector('.tl-ul-name') as HTMLInputElement | null;
                    const colorEl = row.querySelector('.tl-ul-color') as HTMLInputElement | null;
                    const name = nameEl?.value ?? '';
                    const color = colorEl?.value ?? '#5c6bc0';
                    const classes = target?.classList;
                    if (classes?.contains('tl-ul-name') || classes?.contains('tl-ul-color')) {
                        T.state.updateUserLabelDef(id, name, color);
                        if (classes.contains('tl-ul-color')) paint();
                        else {
                            const n = T.state.countCardsUsingUserLabel(id);
                            const u = row.querySelector('.tl-ul-usage');
                            if (u) u.textContent = `${n}장`;
                        }
                    }
                });

                body.addEventListener('click', (ev: Event) => {
                    const target = ev.target as Element | null;
                    const btn = target?.closest('.tl-ul-del');
                    if (!btn) return;
                    const row = btn.closest('.tl-ul-row') as HTMLElement | null;
                    if (!row) return;
                    const id = row.getAttribute('data-id') || row.dataset.id || '';
                    if (!confirm('이 라벨을 지우면 모든 카드에서 빠집니다. 계속할까요?')) return;
                    T.state.removeUserLabelDef(id);
                    paint();
                });

                doneBtn.onclick = () => {
                    close();
                    T.render.renderAll();
                };
            },
        });
    }

    function showAssignUserLabelsDialog(itemId: string): void {
        T.state.ensureWritableList?.('assignUserLabels');
        const list = T.state.currentList();
        if (!list?.items?.[itemId]) return;
        T.state.ensureListUserLabels(list);

        const defs = Object.values(list.userLabels).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
        const cur = new Set(list.items[itemId].userLabelIds || []);

        if (!defs.length) {
            Toolbox.showToast?.('먼저 툴바 「라벨」에서 라벨을 추가하세요.', 'error');
            return;
        }

        const checks = defs.map(d => {
            const ck = cur.has(d.id) ? 'checked' : '';
            const col = esc(d.color || '#666');
            const nm = esc(d.name || '');
            return `<label class="tl-ul-assign-row">
                <input type="checkbox" data-label-id="${esc(d.id)}" ${ck}>
                <span class="tl-ul-assign-swatch" style="background:${col}"></span>
                <span class="tl-ul-assign-name">${nm}</span>
            </label>`;
        }).join('');

        T.ui.openDialog({
            title: '이 카드에 라벨 달기',
            wide: false,
            bodyHtml: `
                <div id="tl-ul-assign-list" class="tl-ul-assign-list">${checks}</div>
                <div class="tl-dialog-actions">
                    <button class="tl-btn" id="tl-ul-assign-cancel">취소</button>
                    <button class="tl-btn tl-btn-primary" id="tl-ul-assign-ok">적용</button>
                </div>
            `,
            onMount: ({ dialog, close }) => {
                const cancel = dq<HTMLButtonElement>(dialog, '#tl-ul-assign-cancel');
                const ok = dq<HTMLButtonElement>(dialog, '#tl-ul-assign-ok');
                if (!cancel || !ok) return;
                cancel.onclick = close;
                ok.onclick = () => {
                    const checkboxes = [...dialog.querySelectorAll('#tl-ul-assign-list input[type="checkbox"]')] as HTMLInputElement[];
                    const ids = checkboxes
                        .filter(cb => cb.checked)
                        .map(cb => cb.getAttribute('data-label-id') || cb.dataset.labelId || '')
                        .filter(Boolean);
                    T.state.setItemUserLabelIds(itemId, ids);
                    close();
                    T.render.renderAll();
                };
            },
        });
    }

    T.dialogs = {
        showAddItemDialog,
        showEditItemDialog,
        showNewListDialog,
        showNewCatalogDialog,
        showAddCatalogItemDialog,
        showTierSettingsDialog,
        showUserLabelsManagerDialog,
        showAssignUserLabelsDialog,
    };
})();

