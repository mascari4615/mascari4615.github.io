/**
 * imagegen - 메인 엔트리 (buildMain, UI, window._ig)
 * window.ImageGen (IG) 의 presets, config, queue, utils 사용
 */
(function () {
    'use strict';

    interface IgPresetItem { id: string; icon?: string; label: string; prompt?: string; shortLabel?: string; }
    interface IgCharacterOption { id: string; icon?: string; label: string; prompt?: string; shortLabel?: string; }
    interface IgVibeOption { id: string; label: string; suffix: string; desc?: string; }
    interface IgAspectRatio { value: string; label: string; }
    interface IgSafetyLevel { value: string; label: string; }
    interface IgPersonGenOption { value: string; label: string; }
    interface IgQueueItem {
        id: number; prompt: string; options: { modelId: string };
        status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
        elapsed?: string | null; error?: string | null; resultItem?: ImageDBItem;
    }
    interface IgState {
        sessionGallery: ImageDBItem[];
        currentItem: ImageDBItem | null;
        compareMode: boolean;
        currentContextTab: string;
        currentContextPreset: IgPresetItem | null;
        slotValues: Record<string, string>;
        igPresetPopup: HTMLDivElement | null;
    }
    interface IgFull {
        CONTEXT_PRESETS: Record<string, IgPresetItem[]>;
        CONTEXT_TAB_LABELS: Record<string, string>;
        CONTEXT_TAB_ICONS: Record<string, string>;
        VIBE_OPTIONS: IgVibeOption[];
        ASPECT_RATIOS: IgAspectRatio[];
        SAFETY_LEVELS: IgSafetyLevel[];
        PERSON_GEN_OPTIONS: IgPersonGenOption[];
        CUSTOM_INPUT_ID: string;
        CHARACTER_PRESETS?: { char?: IgCharacterOption[] };
        getSlotsFromPrompt: (prompt: string) => string[];
        getCharacterOptions: () => IgCharacterOption[];
        loadCustomCharacters: () => IgCharacterOption[];
        saveCustomCharacters: (list: IgCharacterOption[]) => void;
        loadCustomPresets: () => IgPresetItem[];
        saveCustomPresets: (list: IgPresetItem[]) => void;
        queue: IgQueueItem[];
        enqueue: (promptText: string, isEmoji: boolean, emojiChar: string, isMascot: boolean) => void;
        cancelQueueItem: (id: number) => void;
        removeQueueItem: (id: number) => void;
        clearQueue: () => void;
        getModelDisplayName: (modelId: string) => string;
        getPromptHistory: () => string[];
        addPromptHistory: (text: string) => void;
        escapeHtml: (s: string) => string;
        showLightbox: (url: string) => void;
        downloadImage: (url: string) => void;
        GALLERY_SESSION_KEY: string;
        GALLERY_SESSION_MAX: number;
        initCore: (deps: unknown) => void;
        loadGallerySession: () => boolean;
    }

    const IG = window.ImageGen;
    if (!IG) {
        console.warn('ImageGen: window.ImageGen not found. Load config, presets, styles, core first.');
        return;
    }
    const ig = IG as unknown as IgFull;

    const {
        CONTEXT_PRESETS,
        CONTEXT_TAB_LABELS,
        CONTEXT_TAB_ICONS,
        VIBE_OPTIONS,
        ASPECT_RATIOS,
        SAFETY_LEVELS,
        PERSON_GEN_OPTIONS,
        CUSTOM_INPUT_ID,
        getSlotsFromPrompt,
        getCharacterOptions,
        loadCustomCharacters,
        saveCustomCharacters,
        loadCustomPresets,
        saveCustomPresets,
        queue,
        enqueue,
        cancelQueueItem,
        removeQueueItem,
        clearQueue,
        getModelDisplayName,
        getPromptHistory,
        addPromptHistory,
        escapeHtml,
        showLightbox,
        downloadImage,
        GALLERY_SESSION_KEY,
        GALLERY_SESSION_MAX
    } = ig;

    /* ===== 상태 ===== */
    const state: IgState = {
        sessionGallery: [],
        currentItem: null,
        compareMode: false,
        currentContextTab: 'bg',
        currentContextPreset: null,
        slotValues: {},
        igPresetPopup: null
    };

    /* ===== renderQueue, renderQueueItem ===== */
    function renderQueue() {
        const panel = document.getElementById('igQueuePanel');
        if (!panel) return;

        const active = queue.filter(q => q.status !== 'cancelled');
        if (active.length === 0) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';

        const listEl = document.getElementById('igQueueList');
        if (!listEl) return;
        listEl.innerHTML = '';

        active.forEach(q => {
            const row = document.createElement('div');
            row.className = 'ig-q-item ig-q-' + q.status;
            row.id = 'igQ_' + q.id;

            const statusIcon = { pending: '⏳', running: '🔄', done: '✅', error: '❌', cancelled: '🚫' }[q.status];
            const shortPrompt = q.prompt.length > 40 ? q.prompt.slice(0, 40) + '...' : q.prompt;
            const modelName = getModelDisplayName(q.options.modelId);

            let infoText = '';
            if (q.status === 'running') infoText = `${q.elapsed || 0}s`;
            else if (q.status === 'done') infoText = `${q.resultItem?.elapsed || '?'}s`;
            else if (q.status === 'error') infoText = q.error || '실패';

            row.innerHTML = `
                <span class="ig-q-status">${statusIcon}</span>
                <div class="ig-q-body">
                    <div class="ig-q-prompt" title="${escapeHtml(q.prompt)}">${escapeHtml(shortPrompt)}</div>
                    <div class="ig-q-meta">${escapeHtml(modelName)}${infoText ? ' · ' + escapeHtml(infoText) : ''}</div>
                </div>
                ${q.status === 'pending' || q.status === 'running'
                    ? `<button class="ig-q-cancel" data-qid="${q.id}" title="취소">✕</button>`
                    : `<button class="ig-q-remove" data-qid="${q.id}" title="제거">✕</button>`
                }`;
            listEl.appendChild(row);
        });

        panel.querySelectorAll<HTMLButtonElement>('.ig-q-cancel').forEach(btn => {
            btn.onclick = () => cancelQueueItem(Number(btn.dataset.qid));
        });
        panel.querySelectorAll<HTMLButtonElement>('.ig-q-remove').forEach(btn => {
            btn.onclick = () => removeQueueItem(Number(btn.dataset.qid));
        });

        const countEl = document.getElementById('igQueueCount');
        const pending = queue.filter(q => q.status === 'pending').length;
        const running = queue.filter(q => q.status === 'running').length;
        if (countEl) countEl.textContent = running ? `처리 중 ${running} / 대기 ${pending}` : `대기 ${pending}`;

        const cancelBtn = document.getElementById('igCancelBtn');
        if (cancelBtn) cancelBtn.style.display = running > 0 ? '' : 'none';
    }

    function renderQueueItem(q: IgQueueItem) {
        const row = document.getElementById('igQ_' + q.id);
        if (!row) return;
        const infoText = q.status === 'running' ? `${q.elapsed || 0}s` : '';
        const metaEl = row.querySelector('.ig-q-meta');
        if (metaEl) {
            const modelName = getModelDisplayName(q.options.modelId);
            metaEl.textContent = modelName + (infoText ? ' · ' + infoText : '');
        }
    }

    /* ===== updateMainPreview, showResultInPreview, hideMainLoading ===== */
    function updateMainPreview() {
        const img = document.getElementById('igImage') as HTMLImageElement | null;
        const placeholder = document.getElementById('igPlaceholder');
        const loadingArea = document.getElementById('igLoadingArea');
        const loadingText = document.getElementById('igLoadingText');
        const downloadBtn = document.getElementById('igDownloadBtn');
        const tokenDisplay = document.getElementById('igTokenDisplay');

        if (placeholder) placeholder.style.display = 'none';
        if (img) img.style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (tokenDisplay) tokenDisplay.textContent = '';
        if (loadingArea) loadingArea.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Dreaming...';
    }

    function showResultInPreview(item: ImageDBItem) {
        const img = document.getElementById('igImage') as HTMLImageElement | null;
        const loadingArea = document.getElementById('igLoadingArea');
        const downloadBtn = document.getElementById('igDownloadBtn');
        const tokenDisplay = document.getElementById('igTokenDisplay');

        if (loadingArea) loadingArea.style.display = 'none';
        if (img) { img.src = item.url; img.style.display = ''; img.onclick = () => showLightbox(item.url); }
        if (downloadBtn) downloadBtn.style.display = '';
        if (item.tokens && tokenDisplay) {
            tokenDisplay.textContent = `${item.tokens.toLocaleString()} tokens · ${item.elapsed}s`;
        }
        updateMetaDisplay();
    }

    function hideMainLoading() {
        const loadingArea = document.getElementById('igLoadingArea');
        if (loadingArea) loadingArea.style.display = 'none';
        const placeholder = document.getElementById('igPlaceholder');
        if (!state.currentItem && placeholder) placeholder.style.display = '';
    }

    /* ===== updateMetaDisplay ===== */
    function updateMetaDisplay() {
        const el = document.getElementById('igMetaDisplay');
        if (!el || !state.currentItem) { if (el) el.textContent = ''; return; }
        const model = (state.currentItem.modelName as string | undefined) || (state.currentItem.model as string | undefined) || '';
        const prompt = (state.currentItem.prompt as string | undefined) || '';
        const truncated = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
        el.textContent = model ? `${model}  ·  ${truncated}` : truncated;
        el.title = `${model}\n${prompt}`;
    }

    /* ===== saveGallerySession, renderSessionGallery ===== */
    function saveGallerySession() {
        try {
            const toSave = state.sessionGallery.slice(-GALLERY_SESSION_MAX);
            sessionStorage.setItem(GALLERY_SESSION_KEY, JSON.stringify({
                items: toSave,
                currentId: state.currentItem?.id
            }));
        } catch (e) {
            console.warn('Gallery session save failed', e);
        }
    }

    function renderSessionGallery() {
        const el = document.getElementById('igGallery');
        if (!el) return;
        el.innerHTML = '';
        state.sessionGallery.forEach((item) => {
            const thumb = document.createElement('img');
            const modelName = (item.modelName as string | undefined) || '';
            const model = (item.model as string | undefined) || '';
            const prompt = (item.prompt as string | undefined) || '';
            thumb.className = 'ig-thumb' + (item.id === state.currentItem?.id ? ' active' : '');
            thumb.src = item.url;
            thumb.alt = modelName || 'Image';
            thumb.title = `${modelName || model}\n${prompt.slice(0, 80)}`;
            thumb.onclick = () => {
                state.currentItem = item;
                const img = document.getElementById('igImage') as HTMLImageElement | null;
                const placeholder = document.getElementById('igPlaceholder');
                const downloadBtn = document.getElementById('igDownloadBtn');
                if (img) { img.src = item.url; img.style.display = ''; img.onclick = () => showLightbox(item.url); }
                if (placeholder) placeholder.style.display = 'none';
                if (downloadBtn) downloadBtn.style.display = '';
                el.querySelectorAll('.ig-thumb').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
                updateMetaDisplay();
            };
            el.appendChild(thumb);
        });
        el.scrollLeft = el.scrollWidth;
    }

    /* ===== updateVertexImagenFieldsVisibility, updateImagenOptionsVisibility, updateVibeInfo ===== */
    function updateVertexImagenFieldsVisibility() {
        const modelSel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
        const apiSel = document.getElementById('igApiRoute') as HTMLSelectElement | null;
        const group = document.getElementById('igVertexImagenGroup');
        if (!group) return;
        const show = (apiSel?.value === 'vertex') && (modelSel?.value?.startsWith('imagen') || false);
        group.style.display = show ? '' : 'none';
    }

    function updateImagenOptionsVisibility() {
        const modelSel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
        const isImagen = modelSel?.value?.startsWith('imagen') || false;
        const negGroup = document.getElementById('igNegPromptGroup');
        const personGroup = document.getElementById('igPersonGenGroup');
        if (negGroup) negGroup.style.display = isImagen ? '' : 'none';
        if (personGroup) personGroup.style.display = isImagen ? '' : 'none';
        updateVertexImagenFieldsVisibility();
    }

    function updateVibeInfo() {
        const vibeSel = document.getElementById('igVibe') as HTMLSelectElement | null;
        const infoEl = document.getElementById('igVibeInfo');
        if (!vibeSel || !infoEl) return;
        const vibe = VIBE_OPTIONS.find(v => v.id === vibeSel.value);
        if (!vibe || vibe.id === 'none') {
            infoEl.innerHTML = '';
            return;
        }
        infoEl.innerHTML = `${escapeHtml(vibe.desc ?? '')}<span class="ig-vibe-suffix">${escapeHtml(vibe.suffix)}</span>`;
    }

    /* ===== renderPresetButtons, getOrCreatePresetPopup, closePresetPopup ===== */
    function renderPresetButtons() {
        const container = document.getElementById('igPresetBtns');
        if (!container) return;
        container.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'ig-preset-btn';
        btn.title = '프리셋 선택';
        btn.textContent = '📚';
        btn.onclick = () => showPresetPopup(state.currentContextTab);
        container.appendChild(btn);
    }

    function getOrCreatePresetPopup(): HTMLDivElement {
        if (state.igPresetPopup) return state.igPresetPopup;
        const popup = document.createElement('div');
        popup.id = 'igPresetPopup';
        popup.className = 'ig-preset-popup';
        popup.innerHTML = `
            <div class="ig-preset-panel">
                <div class="ig-preset-popup-header">
                    <h3>📚 프리셋</h3>
                    <button class="btn btn-ghost" id="igPresetPopupClose">✕</button>
                </div>
                <div class="ig-preset-popup-tabs" id="igPresetPopupTabs"></div>
                <div class="ig-preset-popup-body" id="igPresetPopupBody"></div>
            </div>`;
        popup.onclick = (e) => { if (e.target === popup) closePresetPopup(); };
        document.body.appendChild(popup);
        const closeBtn = popup.querySelector<HTMLButtonElement>('#igPresetPopupClose');
        if (closeBtn) closeBtn.onclick = closePresetPopup;
        state.igPresetPopup = popup;
        return popup;
    }

    function closePresetPopup() {
        if (state.igPresetPopup) state.igPresetPopup.classList.remove('open');
    }

    /* ===== applyContextPreset, showSlotSection, showAddCharacterForm, hideSlotSection ===== */
    function applyContextPreset(item: IgPresetItem) {
        if (!item || item.id === '_none') {
            state.currentContextPreset = null;
            state.slotValues = {};
            hideSlotSection();
            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            if (promptEl) { promptEl.value = ''; promptEl.placeholder = '이미지 프롬프트를 입력하세요...'; }
            return;
        }
        state.currentContextPreset = item;
        state.slotValues = {};
        const slots = getSlotsFromPrompt(item.prompt ?? '');
        const hasSlots = slots.length > 0;

        if (hasSlots) {
            showSlotSection(item);
        } else {
            hideSlotSection();
            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            if (promptEl) promptEl.value = item.prompt ?? '';
        }
        const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
        if (promptEl) promptEl.placeholder = hasSlots ? '추가 설명 (선택)' : '추가 설명 (선택)';
    }

    function showSlotSection(contextItem: IgPresetItem) {
        const section = document.getElementById('igSlotSection');
        if (!section) return;
        section.style.display = '';
        section.innerHTML = '';
        const slots = getSlotsFromPrompt(contextItem.prompt ?? '');
        const charOpts = getCharacterOptions();

        const header = document.createElement('div');
        header.className = 'ig-slot-header';
        header.innerHTML = `<span class="ig-slot-context">${escapeHtml((contextItem.icon ?? '') + ' ' + contextItem.label)}</span><button type="button" class="btn btn-ghost" onclick="window._ig.openContextPreset()">컨텍스트 변경</button>`;
        section.appendChild(header);

        function buildCharSelect(slotId: string, label: string): HTMLElement {
            const opts = charOpts.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon || '') + ' ' + c.label)}</option>`).join('');
            const row = document.createElement('div');
            row.className = 'ig-slot-row';
            row.dataset.slotId = slotId;
            row.innerHTML = `
                <label class="ig-slot-label">${label}</label>
                <div class="ig-slot-select-wrap">
                    <select id="igSlot_${slotId}"><option value="">선택</option>${opts}<option value="${CUSTOM_INPUT_ID}">✏️ 직접 입력</option></select>
                    <button type="button" class="btn btn-ghost ig-slot-add-char" title="캐릭터 추가">➕</button>
                </div>
                <input type="text" id="igSlotCustom_${slotId}" class="ig-slot-custom-input" placeholder="직접 입력 (캐릭터 설명)" style="display:none;">
            `;
            const sel = row.querySelector<HTMLSelectElement>('select');
            const customInput = row.querySelector<HTMLInputElement>('.ig-slot-custom-input');
            const addBtn = row.querySelector<HTMLButtonElement>('.ig-slot-add-char');

            if (sel && state.slotValues[slotId]) {
                const v = state.slotValues[slotId];
                if (v === CUSTOM_INPUT_ID) {
                    sel.value = CUSTOM_INPUT_ID;
                    if (customInput) { customInput.style.display = ''; customInput.value = state.slotValues[slotId + '_custom'] || ''; }
                } else {
                    sel.value = v;
                }
            }
            sel?.addEventListener('change', () => {
                const isCustom = sel.value === CUSTOM_INPUT_ID;
                if (customInput) customInput.style.display = isCustom ? '' : 'none';
                state.slotValues[slotId] = sel.value;
                if (!isCustom) state.slotValues[slotId + '_custom'] = '';
            });
            customInput?.addEventListener('input', () => { state.slotValues[slotId + '_custom'] = customInput.value; });
            addBtn?.addEventListener('click', (e) => { e.stopPropagation(); showAddCharacterForm(slotId, charOpts, row); });
            return row;
        }

        slots.forEach(slotId => {
            const label = slotId === 'CHAR' ? '👤 캐릭터' : `<${slotId}>`;
            section.appendChild(buildCharSelect(slotId, escapeHtml(label)));
        });
    }

    function showAddCharacterForm(slotId: string, currentOpts: IgCharacterOption[], rowEl: HTMLElement) {
        const form = document.createElement('div');
        form.className = 'ig-add-char-form';
        form.innerHTML = `
            <div class="ig-add-char-row">
                <input id="igAcIcon" placeholder="아이콘" value="🎨" style="width:48px;">
                <input id="igAcLabel" placeholder="이름" style="flex:1;">
            </div>
            <textarea id="igAcPrompt" placeholder="캐릭터 프롬프트 (설명)"></textarea>
            <div class="ig-add-char-actions">
                <button type="button" class="btn btn-ghost" id="igAcSave">추가</button>
                <button type="button" class="btn btn-ghost" id="igAcCancel">취소</button>
            </div>
        `;
        const prev = rowEl.nextElementSibling;
        rowEl.parentNode?.insertBefore(form, prev || null);
        const cancelBtn = document.getElementById('igAcCancel') as HTMLButtonElement | null;
        const saveBtn = document.getElementById('igAcSave') as HTMLButtonElement | null;
        if (cancelBtn) cancelBtn.onclick = () => {
            form.remove();
            if (state.currentContextPreset) showSlotSection(state.currentContextPreset);
        };
        if (saveBtn) saveBtn.onclick = () => {
            const iconEl = document.getElementById('igAcIcon') as HTMLInputElement | null;
            const labelEl = document.getElementById('igAcLabel') as HTMLInputElement | null;
            const promptTextEl = document.getElementById('igAcPrompt') as HTMLTextAreaElement | null;
            const icon = iconEl?.value.trim() || '🎨';
            const label = labelEl?.value.trim() ?? '';
            const prompt = promptTextEl?.value.trim() ?? '';
            if (!label || !prompt) { Toolbox.showToast?.('이름과 프롬프트를 입력해주세요.', 'error'); return; }
            const list = loadCustomCharacters();
            list.push({ id: 'uc_' + Date.now(), icon, label, prompt });
            saveCustomCharacters(list);
            form.remove();
            if (state.currentContextPreset) showSlotSection(state.currentContextPreset);
            Toolbox.showToast?.('캐릭터 추가됨');
        };
        void currentOpts;
    }

    function hideSlotSection() {
        const section = document.getElementById('igSlotSection');
        const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
        if (section) section.style.display = 'none';
        if (promptEl) promptEl.placeholder = '이미지 프롬프트를 입력하세요...';
        state.currentContextPreset = null;
        state.slotValues = {};
    }

    /* ===== openContextPreset, getSlotValue, buildFinalPrompt ===== */
    function openContextPreset() {
        showPresetPopup(state.currentContextTab);
    }

    function getSlotValue(slotId: string, opts?: { useShortForChar?: boolean }): string {
        const useShort = opts?.useShortForChar && slotId === 'CHAR';
        const slotEl = document.getElementById('igSlot_' + slotId) as HTMLSelectElement | null;
        const presetId = slotEl?.value || state.slotValues[slotId];
        if (!presetId) return '';
        if (presetId === CUSTOM_INPUT_ID) {
            const customEl = document.getElementById('igSlotCustom_' + slotId) as HTMLInputElement | null;
            return customEl?.value.trim() || state.slotValues[slotId + '_custom'] || '';
        }
        const builtin = (ig.CHARACTER_PRESETS?.char || []).find(c => c.id === presetId);
        if (builtin) return useShort ? (builtin.shortLabel || builtin.prompt || '') : (builtin.prompt || '');
        const custom = loadCustomCharacters().find(c => c.id === presetId);
        if (custom) return useShort ? (custom.shortLabel || custom.label || custom.prompt || '') : (custom.prompt || '');
        return '';
    }

    function buildFinalPrompt(): string | null {
        if (!state.currentContextPreset) return null;
        const useShortForChar = state.currentContextTab === 'emoji' || state.currentContextTab === 'mascot';
        let prompt = state.currentContextPreset.prompt ?? '';
        const slots = getSlotsFromPrompt(prompt);
        for (const slotId of slots) {
            const val = getSlotValue(slotId, { useShortForChar });
            prompt = prompt.replace(new RegExp('<' + slotId + '>', 'g'), val);
        }
        const additionalEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
        const additional = additionalEl?.value.trim() || '';
        return prompt + (additional ? '. ' + additional : '');
    }

    /* ===== showPresetPopup, showCustomFormInPopup ===== */
    function showPresetPopup(tabId: string) {
        state.currentContextTab = tabId || state.currentContextTab;
        const popup = getOrCreatePresetPopup();
        const tabsEl = popup.querySelector<HTMLElement>('#igPresetPopupTabs');
        const bodyEl = popup.querySelector<HTMLElement>('#igPresetPopupBody');
        if (!bodyEl) return;

        if (tabsEl) {
            tabsEl.innerHTML = '';
            Object.keys(CONTEXT_TAB_LABELS).forEach(tid => {
                const tbtn = document.createElement('button');
                tbtn.className = 'ig-preset-tab-btn' + (tid === state.currentContextTab ? ' active' : '');
                tbtn.textContent = (CONTEXT_TAB_ICONS[tid] || '') + ' ' + CONTEXT_TAB_LABELS[tid];
                tbtn.onclick = () => showPresetPopup(tid);
                tabsEl.appendChild(tbtn);
            });
        }

        bodyEl.innerHTML = '';
        const rawItems = state.currentContextTab === 'custom' ? loadCustomPresets() : (CONTEXT_PRESETS[state.currentContextTab] || []);
        const noneItem: IgPresetItem = { id: '_none', icon: '⬜', label: '없음' };
        const items = [noneItem, ...rawItems];

        const grid = document.createElement('div');
        grid.className = 'ig-preset-grid';

        items.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'ig-card';
            card.innerHTML = `<div class="ig-card-icon">${escapeHtml(item.icon || '🎨')}</div><div class="ig-card-label">${escapeHtml(item.label)}</div>`;
            if (state.currentContextTab === 'custom' && item.id !== '_none') {
                const acts = document.createElement('div');
                acts.className = 'ig-card-actions';
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-ghost';
                editBtn.textContent = '수정';
                editBtn.onclick = e => { e.stopPropagation(); showCustomFormInPopup(item, idx - 1, bodyEl, state.currentContextTab); };
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger';
                delBtn.textContent = '삭제';
                delBtn.onclick = e => {
                    e.stopPropagation();
                    const presets = loadCustomPresets();
                    presets.splice(idx - 1, 1);
                    saveCustomPresets(presets);
                    showPresetPopup(state.currentContextTab);
                    Toolbox.showToast?.('프리셋 삭제됨');
                };
                acts.appendChild(editBtn);
                acts.appendChild(delBtn);
                card.appendChild(acts);
            }
            card.onclick = () => {
                applyContextPreset(item);
                closePresetPopup();
                Toolbox.showToast?.(item.id === '_none' ? '프리셋 해제됨' : '컨텍스트 적용됨');
            };
            grid.appendChild(card);
        });

        if (state.currentContextTab === 'custom') {
            const addCard = document.createElement('div');
            addCard.className = 'ig-card';
            addCard.innerHTML = `<div class="ig-card-icon" style="font-size:24px">+</div><div class="ig-card-label">새 프리셋</div>`;
            addCard.onclick = () => showCustomFormInPopup(null, -1, bodyEl, state.currentContextTab);
            grid.appendChild(addCard);
        }

        bodyEl.appendChild(grid);
        popup.classList.add('open');
    }

    function showCustomFormInPopup(item: IgPresetItem | null, idx: number, bodyEl: HTMLElement, tabId: string) {
        const form = document.createElement('div');
        form.className = 'ig-custom-form';
        form.innerHTML = `
            <div class="ig-custom-form-row">
                <input id="igCfIcon" placeholder="아이콘 (이모지)" value="${escapeHtml(item?.icon || '')}" style="width:60px;">
                <input id="igCfLabel" placeholder="이름" value="${escapeHtml(item?.label || '')}" style="flex:1;">
            </div>
            <textarea id="igCfPrompt" placeholder="프롬프트 (캐릭터 슬롯: &lt;A&gt;, &lt;B&gt;, &lt;CHAR&gt; 등)">${escapeHtml(item?.prompt || '')}</textarea>
            <div class="ig-custom-form-row">
                <button class="btn btn-ghost" id="igCfSave" style="flex:1;">${idx >= 0 ? '수정' : '추가'}</button>
                <button class="btn btn-ghost" id="igCfCancel">취소</button>
            </div>`;
        bodyEl.innerHTML = '';
        bodyEl.appendChild(form);

        const cancelBtn = document.getElementById('igCfCancel') as HTMLButtonElement | null;
        const saveBtn = document.getElementById('igCfSave') as HTMLButtonElement | null;
        if (cancelBtn) cancelBtn.onclick = () => showPresetPopup(state.currentContextTab);
        if (saveBtn) saveBtn.onclick = () => {
            const iconEl = document.getElementById('igCfIcon') as HTMLInputElement | null;
            const labelEl = document.getElementById('igCfLabel') as HTMLInputElement | null;
            const promptTextEl = document.getElementById('igCfPrompt') as HTMLTextAreaElement | null;
            const icon = iconEl?.value.trim() || '🎨';
            const label = labelEl?.value.trim() ?? '';
            const prompt = promptTextEl?.value.trim() ?? '';
            if (!label || !prompt) { Toolbox.showToast?.('이름과 프롬프트를 입력해주세요.', 'error'); return; }
            const presets = loadCustomPresets();
            const entry: IgPresetItem = { id: item?.id || 'c_' + Date.now(), icon, label, prompt };
            if (idx >= 0 && idx < presets.length) presets[idx] = entry;
            else presets.push(entry);
            saveCustomPresets(presets);
            showPresetPopup(state.currentContextTab);
            Toolbox.showToast?.(idx >= 0 ? '프리셋 수정 완료' : '프리셋 추가 완료');
        };
        void tabId;
    }

    /* ===== showApiHistory ===== */
    function showApiHistory() {
        const history = typeof Gemini !== 'undefined' ? (Gemini.getApiHistory?.() ?? []) : [];
        let overlay = document.getElementById('igApiHistoryOverlay') as HTMLDivElement | null;
        if (!overlay) {
            const el = document.createElement('div');
            el.id = 'igApiHistoryOverlay';
            el.className = 'ig-api-history-overlay';
            el.innerHTML = `
                <div class="ig-api-history-panel">
                    <div class="ig-api-history-header">
                        <h3>📋 API 요청/응답 이력</h3>
                        <div>
                            <button class="btn btn-ghost" id="igApiHistoryClear">비우기</button>
                            <button class="btn btn-ghost" id="igApiHistoryClose">닫기</button>
                        </div>
                    </div>
                    <div class="ig-api-history-list" id="igApiHistoryList"></div>
                </div>`;
            el.onclick = (e) => { if (e.target === el) el.classList.remove('open'); };
            document.body.appendChild(el);
            overlay = el;

            const closeBtn = document.getElementById('igApiHistoryClose') as HTMLButtonElement | null;
            const clearBtn = document.getElementById('igApiHistoryClear') as HTMLButtonElement | null;
            if (closeBtn) closeBtn.onclick = () => overlay?.classList.remove('open');
            if (clearBtn) clearBtn.onclick = () => {
                if (typeof Gemini !== 'undefined') Gemini.clearApiHistory?.();
                showApiHistory();
            };
        }

        const listEl = document.getElementById('igApiHistoryList');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (history.length === 0) {
            listEl.innerHTML = '<div class="ig-api-history-empty">이미지 생성 요청 후 여기서 확인할 수 있습니다.</div>';
        } else {
            history.forEach((entry, i) => {
                const card = document.createElement('div');
                card.className = 'ig-api-history-card';
                const statusCls = entry.status >= 400 ? 'error' : 'ok';
                const reqBody = entry.requestBody as Record<string, unknown> | undefined;
                const contents = reqBody?.['contents'] as Array<Record<string, unknown>> | undefined;
                const instances = reqBody?.['instances'] as Array<Record<string, unknown>> | undefined;
                const firstPart = (contents?.[0]?.['parts'] as Array<Record<string, unknown>> | undefined)?.[0];
                const promptPreview = (firstPart?.['text'] as string | undefined)?.slice(0, 60)
                    || (instances?.[0]?.['prompt'] as string | undefined)?.slice(0, 60)
                    || '-';
                card.innerHTML = `
                    <div class="ig-api-history-card-head" data-i="${i}">
                        <span class="ig-api-history-badge ${statusCls}">${entry.status}</span>
                        <span class="ig-api-history-type">${entry.type || '?'}</span>
                        <span class="ig-api-history-ts">${entry.ts || ''}</span>
                        <span class="ig-api-history-prompt">${escapeHtml(promptPreview)}${(promptPreview.length >= 60 ? '...' : '')}</span>
                    </div>
                    <div class="ig-api-history-card-body" id="igApiBody${i}" style="display:none">
                        <div class="ig-api-history-section">
                            <div class="ig-api-history-label">Request (URL)</div>
                            <pre class="ig-api-history-pre">${escapeHtml(entry.url || '')}</pre>
                        </div>
                        <div class="ig-api-history-section">
                            <div class="ig-api-history-label">Request (Body)</div>
                            <pre class="ig-api-history-pre">${escapeHtml(JSON.stringify(entry.requestBody || {}, null, 2))}</pre>
                        </div>
                        <div class="ig-api-history-section">
                            <div class="ig-api-history-label">Response (Body)</div>
                            <pre class="ig-api-history-pre">${escapeHtml(JSON.stringify(entry.responseBody || {}, null, 2))}</pre>
                        </div>
                    </div>`;
                const head = card.querySelector<HTMLElement>('.ig-api-history-card-head');
                if (head) head.onclick = () => {
                    const body = document.getElementById('igApiBody' + i) as HTMLElement | null;
                    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
                };
                listEl.appendChild(card);
            });
        }

        overlay.classList.add('open');
    }

    /* ===== window._ig ===== */
    window._ig = {
        generate,
        cancel,
        download,
        toggleCompare,
        toggleHistory,
        enhancePrompt,
        openContextPreset,
        showApiHistory
    };

    function generate() {
        let promptText: string;
        if (state.currentContextPreset) {
            const built = buildFinalPrompt();
            if (!built) { Toolbox.showToast?.('프롬프트를 입력해주세요.', 'error'); return; }
            promptText = built;
            const slots = getSlotsFromPrompt(state.currentContextPreset.prompt ?? '');
            const allFilled = slots.every(s => {
                const selEl = document.getElementById('igSlot_' + s) as HTMLSelectElement | null;
                const selVal = selEl?.value || state.slotValues[s];
                if (!selVal) return false;
                if (selVal === CUSTOM_INPUT_ID) {
                    const customEl = document.getElementById('igSlotCustom_' + s) as HTMLInputElement | null;
                    return !!(customEl?.value.trim() || state.slotValues[s + '_custom']);
                }
                return true;
            });
            if (!allFilled) { Toolbox.showToast?.('모든 캐릭터 슬롯을 채워주세요.', 'error'); return; }
        } else {
            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            const val = promptEl?.value.trim();
            if (!val) { Toolbox.showToast?.('프롬프트를 입력해주세요.', 'error'); return; }
            promptText = val;
        }
        if (!Gemini?.requireApiKey?.()) return;

        const isEmoji = Boolean(state.currentContextPreset) && state.currentContextTab === 'emoji';
        const isMascot = Boolean(state.currentContextPreset) && state.currentContextTab === 'mascot';
        let emojiChar = '';
        if (isEmoji) {
            const slotEl = document.getElementById('igSlot_CHAR') as HTMLSelectElement | null;
            if (slotEl) {
                const v = slotEl.value;
                const customEl = document.getElementById('igSlotCustom_CHAR') as HTMLInputElement | null;
                emojiChar = v === CUSTOM_INPUT_ID
                    ? (customEl?.value.trim() || '')
                    : (getCharacterOptions().find(c => c.id === v)?.label || '');
            }
        }
        enqueue(promptText, isEmoji, emojiChar, isMascot);
        const pending = queue.filter(q => q.status === 'pending').length;
        const running = queue.filter(q => q.status === 'running').length;
        if (pending + running > 1) {
            Toolbox.showToast?.(`큐에 추가됨 (대기 ${pending}개)`);
        }
    }

    function cancel() {
        const running = queue.find(q => q.status === 'running');
        if (running) {
            cancelQueueItem(running.id);
            Toolbox.showToast?.('현재 생성 취소됨');
            Mdd.linePreset('tool_run', { mood: 'idle', msg: '취소했어요!' });
        }
    }

    function download() {
        if (!state.currentItem?.url) return;
        downloadImage(state.currentItem.url);
    }

    function toggleCompare() {
        if (state.sessionGallery.length < 2) { Toolbox.showToast?.('비교하려면 이미지가 2장 이상 필요합니다.', 'error'); return; }
        state.compareMode = !state.compareMode;
        const preview = document.getElementById('igPreview');
        const img = document.getElementById('igImage') as HTMLImageElement | null;
        const placeholder = document.getElementById('igPlaceholder');
        const btn = document.getElementById('igCompareBtn');

        if (state.compareMode && state.currentItem && preview) {
            const idx = state.sessionGallery.indexOf(state.currentItem);
            const prevItem = idx > 0 ? state.sessionGallery[idx - 1] : state.sessionGallery[state.sessionGallery.length - 1];
            if (img) img.style.display = 'none';
            if (placeholder) placeholder.style.display = 'none';
            let cmp = preview.querySelector<HTMLDivElement>('.ig-compare');
            if (!cmp) { cmp = document.createElement('div'); cmp.className = 'ig-compare'; preview.appendChild(cmp); }
            cmp.innerHTML = `
                <div class="ig-compare-pane"><div class="ig-compare-label">이전</div><img src="${prevItem.url}" alt="Previous"></div>
                <div class="ig-compare-pane"><div class="ig-compare-label">현재</div><img src="${state.currentItem.url}" alt="Current"></div>`;
            cmp.style.display = 'flex';
            if (btn) btn.textContent = '🔀 비교 해제';
        } else if (preview) {
            const cmp = preview.querySelector<HTMLElement>('.ig-compare');
            if (cmp) cmp.style.display = 'none';
            if (img && state.currentItem) img.style.display = '';
            if (btn) btn.textContent = '🔀 비교';
        }
    }

    function toggleHistory() {
        const dd = document.getElementById('igHistoryDropdown');
        if (!dd) return;
        const isOpen = dd.classList.toggle('open');
        if (isOpen) {
            const history = getPromptHistory();
            if (history.length === 0) {
                dd.innerHTML = '<div class="ig-history-empty">아직 히스토리가 없습니다</div>';
            } else {
                dd.innerHTML = '';
                history.forEach(text => {
                    const item = document.createElement('div');
                    item.className = 'ig-history-item';
                    item.textContent = text;
                    item.title = text;
                    item.onclick = () => {
                        if (state.currentContextPreset) {
                            const slots = getSlotsFromPrompt(state.currentContextPreset.prompt ?? '');
                            if (slots.includes('CHAR')) {
                                const sel = document.getElementById('igSlot_CHAR') as HTMLSelectElement | null;
                                const customInput = document.getElementById('igSlotCustom_CHAR') as HTMLInputElement | null;
                                if (sel && customInput) { sel.value = CUSTOM_INPUT_ID; customInput.value = text; customInput.style.display = ''; state.slotValues.CHAR = CUSTOM_INPUT_ID; state.slotValues.CHAR_custom = text; }
                            } else {
                                const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
                                if (promptEl) promptEl.value = text;
                            }
                        } else {
                            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
                            if (promptEl) promptEl.value = text;
                        }
                        dd.classList.remove('open');
                    };
                    dd.appendChild(item);
                });
            }
        }
    }

    async function enhancePrompt() {
        const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
        const raw = promptEl?.value.trim();
        if (!raw) { Toolbox.showToast?.('프롬프트를 입력해주세요.', 'error'); return; }
        if (!Gemini?.requireApiKey?.()) return;

        const btn = document.querySelector<HTMLButtonElement>('.ig-enhance-btn');
        const originalLabel = btn?.textContent;
        try {
            if (btn) { btn.disabled = true; btn.textContent = '⏳ 다듬는 중...'; }
            if (promptEl) promptEl.classList.add('ig-enhancing');

            const enhanced = await Gemini?.enhancePrompt?.(raw);
            if (promptEl && enhanced) {
                promptEl.classList.add('ig-enhanced-flash');
                promptEl.value = enhanced;
                setTimeout(() => promptEl.classList.remove('ig-enhanced-flash'), 600);
            }
            Toolbox.showToast?.('프롬프트를 다듬었습니다.');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '다듬기 실패';
            Toolbox.showToast?.(msg, 'error', e);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = originalLabel ?? ''; }
            if (promptEl) promptEl.classList.remove('ig-enhancing');
        }
    }

    /* ===== buildMain ===== */
    function buildMain(container: HTMLElement) {
        Mdd.linePreset('daily_start', { msg: '이미지 만들어볼까요?' });

        container.innerHTML = `
            <div class="ig-layout">
                <div class="ig-sidebar">
                    <div class="field-group">
                        <label class="field-label">🔑 API 키</label>
                        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
                            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">
                                프로필: <strong id="igActiveProfileName" style="color:var(--text-secondary);">${typeof Gemini !== 'undefined' ? (Gemini.getActiveProfileName?.() || '기본') : '-'}</strong>
                            </div>
                            <button class="btn btn-ghost" type="button" onclick="Toolbox.switchPage('user'); Toolbox.switchTab('user-settings');">설정에서 변경</button>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">🤖 모델</label>
                        <select id="igModelSelect"></select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">🌐 호출</label>
                        <select id="igApiRoute">
                            <option value="aiStudio">AI Studio (기존)</option>
                            <option value="vertex">Vertex AI</option>
                        </select>
                        <div style="font-size:var(--font-size-2xs);color:var(--text-tertiary);margin-top:6px;line-height:1.4;">
                            Gemini 이미지: Vertex는 <code>generateContent</code>, Imagen은 Vertex <code>predict</code>(참고 스크립트와 동일 계열)입니다. Imagen+Vertex일 때 GCP 프로젝트·리전이 필요합니다.
                        </div>
                    </div>
                    <div class="field-group" id="igVertexImagenGroup" style="display:none">
                        <label class="field-label">☁️ Vertex Imagen (GCP)</label>
                        <p style="font-size:var(--font-size-2xs);color:var(--text-tertiary);margin:0 0 8px 0;line-height:1.4;">
                            <code>projects/…/locations/…/publishers/google/models/…:predict</code> 호출에 사용합니다. (예: 스크립트의 <code>PROJECT_ID</code>, <code>LOCATION</code>)
                        </p>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div>
                                <label class="field-label" for="igVertexProjectId" style="font-size:var(--font-size-xs);">프로젝트 ID</label>
                                <input type="text" id="igVertexProjectId" class="settings-control" style="width:100%;box-sizing:border-box;" placeholder="my-gcp-project-id" autocomplete="off">
                            </div>
                            <div>
                                <label class="field-label" for="igVertexLocation" style="font-size:var(--font-size-xs);">리전</label>
                                <input type="text" id="igVertexLocation" class="settings-control" style="width:100%;box-sizing:border-box;" placeholder="us-central1" autocomplete="off">
                            </div>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">📐 비율</label>
                        <select id="igAspectRatio">
                            ${ASPECT_RATIOS.map(r => `<option value="${r.value}"${r.value === '16:9' ? ' selected' : ''}>${r.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">🎭 바이브</label>
                        <select id="igVibe">
                            ${VIBE_OPTIONS.map(v => `<option value="${v.id}">${v.label}</option>`).join('')}
                        </select>
                        <div class="ig-vibe-info" id="igVibeInfo"></div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">🛡️ 안전 필터</label>
                        <select id="igSafety">
                            ${SAFETY_LEVELS.map(s => `<option value="${s.value}"${s.value === 'BLOCK_ONLY_HIGH' ? ' selected' : ''}>${s.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group" id="igNegPromptGroup" style="display:none">
                        <label class="field-label">🚫 네거티브 프롬프트 <span style="font-weight:400;color:var(--text-tertiary)">(Imagen)</span></label>
                        <input type="text" id="igNegPrompt" placeholder="예: blurry, low quality, watermark">
                    </div>
                    <div class="field-group" id="igPersonGenGroup" style="display:none">
                        <label class="field-label">👤 인물 생성 <span style="font-weight:400;color:var(--text-tertiary)">(Imagen)</span></label>
                        <select id="igPersonGen">
                            ${PERSON_GEN_OPTIONS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">📚 프리셋</label>
                        <div class="ig-preset-btns" id="igPresetBtns"></div>
                    </div>
                    <div class="ig-ref-card">
                        <div class="ig-ref-label">참고 사이트</div>
                        <a href="https://pixai.art/ko/generator/image" target="_blank" rel="noopener">PixAI</a>
                        <a href="https://tensor.art/ko-KR" target="_blank" rel="noopener">Tensor.art</a>
                        <a href="https://novelai.net" target="_blank" rel="noopener">NovelAI</a>
                    </div>
                </div>

                <div class="ig-canvas">
                    <div class="ig-preview" id="igPreview">
                        <div class="ig-placeholder" id="igPlaceholder"><span>🎨</span>프리셋을 선택하거나 프롬프트를 입력하세요</div>
                        <div id="igLoadingArea" style="display:none; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                            <div id="igSpinner" class="ig-spinner"></div>
                            <div id="igLoadingText" class="ig-loading-text">Dreaming...</div>
                        </div>
                        <img id="igImage" style="display:none" alt="Generated">
                    </div>
                    <div class="ig-input-area" style="position:relative;">
                        <div class="ig-slot-section" id="igSlotSection" style="display:none;"></div>
                        <div class="ig-history-dropdown" id="igHistoryDropdown"></div>
                        <div class="ig-input-row">
                            <textarea id="igPrompt" placeholder="이미지 프롬프트를 입력하세요..."></textarea>
                            <button class="btn btn-ghost" id="igHistoryBtn" onclick="window._ig.toggleHistory()" title="최근 프롬프트">📜</button>
                            <button class="btn btn-ghost ig-enhance-btn" onclick="window._ig.enhancePrompt()">✨ 다듬기</button>
                            <button class="btn btn-accent ig-gen-btn" id="igGenBtn" onclick="window._ig.generate()"><span>✨</span>생성</button>
                            <button class="btn btn-danger ig-gen-btn" id="igCancelBtn" style="display:none" onclick="window._ig.cancel()"><span>✕</span>취소</button>
                        </div>
                        <div class="ig-actions">
                            <span id="igMetaDisplay" class="ig-meta-display"></span>
                            <button class="btn btn-ghost" id="igCompareBtn" style="display:none;font-size:var(--font-size-xs);" onclick="window._ig.toggleCompare()">🔀 비교</button>
                            <button class="btn btn-ghost" id="igDownloadBtn" style="display:none" onclick="window._ig.download()">⬇️ 다운로드</button>
                            <button class="btn btn-ghost" style="font-size:var(--font-size-xs);" onclick="window._ig.showApiHistory()" title="요청/응답 raw 확인">📋 API 이력</button>
                            <span id="igTokenDisplay" class="ig-token-display"></span>
                        </div>
                        <div class="ig-gallery" id="igGallery"></div>
                        <div class="ig-queue-panel" id="igQueuePanel" style="display:none">
                            <div class="ig-queue-header">
                                <div><span class="ig-queue-title">📋 생성 큐</span><span class="ig-queue-count" id="igQueueCount"></span></div>
                                <button class="ig-queue-clear" id="igQueueClear">전체 비우기</button>
                            </div>
                            <div class="ig-queue-list" id="igQueueList"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        requestAnimationFrame(() => {
            const sel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
            if (sel && typeof Gemini !== 'undefined' && Gemini.MODELS) {
                const gGroup = document.createElement('optgroup');
                gGroup.label = 'Gemini (이미지)';
                (Gemini.MODELS.geminiImage || Gemini.MODELS.gemini).forEach(m => {
                    const o = document.createElement('option');
                    o.value = m.id; o.textContent = m.name;
                    if (m.isDefault) o.selected = true;
                    gGroup.appendChild(o);
                });
                sel.appendChild(gGroup);

                const iGroup = document.createElement('optgroup');
                iGroup.label = 'Imagen';
                Gemini.MODELS.imagen.forEach(m => {
                    const o = document.createElement('option');
                    o.value = m.id; o.textContent = m.name;
                    iGroup.appendChild(o);
                });
                sel.appendChild(iGroup);

                const savedModel = Toolbox.getPref?.('ig_model', '');
                if (savedModel) sel.value = savedModel;
                sel.addEventListener('change', () => { Toolbox.setPref?.('ig_model', sel.value); updateImagenOptionsVisibility(); });
                updateImagenOptionsVisibility();
            }

            const ratioSel = document.getElementById('igAspectRatio') as HTMLSelectElement | null;
            const apiSel = document.getElementById('igApiRoute') as HTMLSelectElement | null;
            const vibeSel = document.getElementById('igVibe') as HTMLSelectElement | null;
            const safetySel = document.getElementById('igSafety') as HTMLSelectElement | null;
            if (ratioSel) { const sr = Toolbox.getPref?.('ig_ratio', ''); if (sr) ratioSel.value = sr; ratioSel.addEventListener('change', () => Toolbox.setPref?.('ig_ratio', ratioSel.value)); }
            if (apiSel) {
                const savedApi = Toolbox.getPref?.('ig_api_route', '');
                if (savedApi) apiSel.value = savedApi;
                apiSel.addEventListener('change', () => {
                    Toolbox.setPref?.('ig_api_route', apiSel.value);
                    updateVertexImagenFieldsVisibility();
                });
            }

            const vProj = document.getElementById('igVertexProjectId') as HTMLInputElement | null;
            const vLoc = document.getElementById('igVertexLocation') as HTMLInputElement | null;
            if (vLoc) {
                const sl = Toolbox.getPref?.('ig_vertex_location', '');
                if (sl) vLoc.value = sl;
                else vLoc.value = 'us-central1';
                vLoc.addEventListener('change', () => Toolbox.setPref?.('ig_vertex_location', vLoc.value.trim() || 'us-central1'));
            }
            if (vProj) {
                const sp = Toolbox.getPref?.('ig_vertex_project_id', '');
                if (sp) vProj.value = sp;
                vProj.addEventListener('change', () => Toolbox.setPref?.('ig_vertex_project_id', vProj.value.trim()));
            }
            function syncIgVertexFieldsFromPrefs() {
                const p = document.getElementById('igVertexProjectId') as HTMLInputElement | null;
                const l = document.getElementById('igVertexLocation') as HTMLInputElement | null;
                if (p) {
                    const v = Toolbox.getPref?.('ig_vertex_project_id', '');
                    if (typeof v === 'string') p.value = v;
                }
                if (l) {
                    const v = Toolbox.getPref?.('ig_vertex_location', '');
                    l.value = (typeof v === 'string' && v.trim()) ? v.trim() : 'us-central1';
                }
            }
            window.addEventListener('vertex-context-changed', syncIgVertexFieldsFromPrefs);
            updateVertexImagenFieldsVisibility();
            if (vibeSel) { const sv = Toolbox.getPref?.('ig_vibe', ''); if (sv) vibeSel.value = sv; vibeSel.addEventListener('change', () => { Toolbox.setPref?.('ig_vibe', vibeSel.value); updateVibeInfo(); }); updateVibeInfo(); }
            if (safetySel) { const ss = Toolbox.getPref?.('ig_safety', ''); if (ss) safetySel.value = ss; safetySel.addEventListener('change', () => Toolbox.setPref?.('ig_safety', safetySel.value)); }

            renderPresetButtons();

            const qClearBtn = document.getElementById('igQueueClear') as HTMLButtonElement | null;
            if (qClearBtn) qClearBtn.onclick = () => clearQueue();

            const prompt = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            if (prompt) {
                prompt.addEventListener('keydown', e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        window._ig?.generate();
                    }
                });
            }

            ig.initCore({
                state,
                renderQueue,
                renderQueueItem,
                updateMainPreview,
                showResultInPreview,
                hideMainLoading,
                renderSessionGallery,
                saveGallerySession
            });

            if (ig.loadGallerySession()) {
                renderSessionGallery();
                if (state.currentItem) {
                    const img = document.getElementById('igImage') as HTMLImageElement | null;
                    const placeholder = document.getElementById('igPlaceholder');
                    const downloadBtn = document.getElementById('igDownloadBtn');
                    const compareBtnR = document.getElementById('igCompareBtn');
                    const currentItem = state.currentItem;
                    if (img) { img.src = currentItem.url; img.style.display = ''; img.onclick = () => showLightbox(currentItem.url); }
                    if (placeholder) placeholder.style.display = 'none';
                    if (downloadBtn) downloadBtn.style.display = '';
                    if (compareBtnR && state.sessionGallery.length >= 2) compareBtnR.style.display = '';
                    updateMetaDisplay();
                }
            }
        });
    }

    /* ===== Toolbox.register ===== */
    Toolbox.register({
        ...(Toolbox.getLazyWidgetPublicMeta?.('imagegen') ?? {}),
        tabs: [
            { id: 'imagegen-main', label: '생성', build: buildMain }
        ]
    });

    void addPromptHistory;
})();
