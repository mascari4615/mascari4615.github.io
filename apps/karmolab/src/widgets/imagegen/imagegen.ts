import { t, loadNamespace } from '../../lib/i18n';

/** 화면에 그대로 박는 글은 태그로 읽히면 안 된다. */
const esc = (v: unknown): string =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * imagegen - 메인 엔트리 (buildMain, UI, (window as any)._ig)
 * window.ImageGen (IG) 의 presets, config, queue, utils 사용
 */
(function () {
    'use strict';
    /**
     * 방금 이 코드가 만들어 붙인 요소를 다시 집을 때 쓴다.
     * 없으면 조용히 undefined 를 만지다 엉뚱한 곳에서 터지는 대신, 여기서 이름과 함께 멈춘다.
     */
    function mustEl<T extends HTMLElement>(id: string): T {
        const found = document.getElementById(id);
        if (found == null) throw new Error(t('imagegen.err.32') + id);
        return found as T;
    }

    const IG = window.ImageGen;
    if (!IG) {
        console.warn('ImageGen: window.ImageGen not found. Load config, presets, styles, core first.');
        return;
    }

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
    } = IG;

    /* ===== 상태 ===== */
    const state: any = {
        sessionGallery: [] as any[],
        currentItem: null,
        compareMode: false,
        currentContextTab: 'bg',
        currentContextPreset: null,
        slotValues: {} as Record<string, any>,
        igPresetPopup: null as any
    };

    /* ===== renderQueue, renderQueueItem ===== */
    function renderQueue() {
        const panel = document.getElementById('igQueuePanel') as HTMLDivElement | null;
        if (!panel) return;

        const active = queue.filter((q: any) => q.status !== 'cancelled');
        if (active.length === 0) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';

        const listEl = document.getElementById('igQueueList') as HTMLDivElement | null;
        if (!listEl) return;
        listEl.innerHTML = '';

        active.forEach((q: any) => {
            const row = document.createElement('div');
            row.className = 'ig-q-item ig-q-' + q.status;
            row.id = 'igQ_' + q.id;

            const statusIcon = ({ pending: '⏳', running: '🔄', done: '✅', error: '❌', cancelled: '🚫' } as Record<string, string>)[q.status];
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
                    ? `<button class="ig-q-cancel" data-qid="${q.id}" title="${esc(t('imagegen.t01'))}">✕</button>`
                    : `<button class="ig-q-remove" data-qid="${q.id}" title="${esc(t('imagegen.t02'))}">✕</button>`
                }`;
            listEl.appendChild(row);
        });

        panel.querySelectorAll('.ig-q-cancel').forEach((btn: any) => {
            btn.onclick = () => cancelQueueItem(Number(btn.dataset.qid));
        });
        panel.querySelectorAll('.ig-q-remove').forEach((btn: any) => {
            btn.onclick = () => removeQueueItem(Number(btn.dataset.qid));
        });

        const countEl = document.getElementById('igQueueCount') as HTMLElement | null;
        const pending = queue.filter((q: any) => q.status === 'pending').length;
        const running = queue.filter((q: any) => q.status === 'running').length;
        if (countEl) countEl.textContent = running ? t('imagegen.queueBoth', { running, pending }) : t('imagegen.queueWaiting', { pending });

        const cancelBtn = document.getElementById('igCancelBtn') as HTMLButtonElement | null;
        if (cancelBtn) cancelBtn.style.display = running > 0 ? '' : 'none';
    }

    function renderQueueItem(q: any) {
        const row = document.getElementById('igQ_' + q.id) as HTMLDivElement | null;
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
        const placeholder = document.getElementById('igPlaceholder') as HTMLDivElement | null;
        const loadingArea = document.getElementById('igLoadingArea') as HTMLDivElement | null;
        const loadingText = document.getElementById('igLoadingText') as HTMLElement | null;
        const downloadBtn = document.getElementById('igDownloadBtn') as HTMLButtonElement | null;
        const tokenDisplay = document.getElementById('igTokenDisplay') as HTMLElement | null;

        if (placeholder) placeholder.style.display = 'none';
        if (img) img.style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (tokenDisplay) tokenDisplay.textContent = '';
        if (loadingArea) loadingArea.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Dreaming...';
    }

    function showResultInPreview(item: any) {
        const img = document.getElementById('igImage') as HTMLImageElement | null;
        const loadingArea = document.getElementById('igLoadingArea') as HTMLDivElement | null;
        const downloadBtn = document.getElementById('igDownloadBtn') as HTMLButtonElement | null;
        const tokenDisplay = document.getElementById('igTokenDisplay') as HTMLElement | null;

        if (loadingArea) loadingArea.style.display = 'none';
        if (img) { img.src = item.url; img.style.display = ''; img.onclick = () => showLightbox(item.url); }
        if (downloadBtn) downloadBtn.style.display = '';
        if (item.tokens && tokenDisplay) {
            tokenDisplay.textContent = `${item.tokens.toLocaleString()} tokens · ${item.elapsed}s`;
        }
        updateMetaDisplay();
    }

    function hideMainLoading() {
        const loadingArea = document.getElementById('igLoadingArea') as HTMLDivElement | null;
        if (loadingArea) loadingArea.style.display = 'none';
        const placeholder = document.getElementById('igPlaceholder') as HTMLDivElement | null;
        if (!state.currentItem && placeholder) placeholder.style.display = '';
    }

    /* ===== updateMetaDisplay ===== */
    function updateMetaDisplay() {
        const el = document.getElementById('igMetaDisplay') as HTMLElement | null;
        if (!el || !state.currentItem) { if (el) el.textContent = ''; return; }
        const model = state.currentItem.modelName || state.currentItem.model || '';
        const prompt = state.currentItem.prompt || '';
        const truncated = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
        el.textContent = model ? `${model}  ·  ${truncated}` : truncated;
        el.title = `${model}\n${prompt}`;
    }

    /* ===== saveGallerySession, renderSessionGallery ===== */
    function saveGallerySession() {
        try {
            const toSave = state.sessionGallery.slice(-(GALLERY_SESSION_MAX as number));
            sessionStorage.setItem(GALLERY_SESSION_KEY as string, JSON.stringify({
                items: toSave,
                currentId: state.currentItem?.id
            }));
        } catch (e) {
            console.warn('Gallery session save failed', e);
        }
    }

    function renderSessionGallery() {
        const el = document.getElementById('igGallery') as HTMLDivElement | null;
        if (!el) return;
        el.innerHTML = '';
        state.sessionGallery.forEach((item: any) => {
            const thumb = document.createElement('img');
            thumb.className = 'ig-thumb' + (item.id === state.currentItem?.id ? ' active' : '');
            thumb.src = item.url;
            thumb.alt = item.modelName || 'Image';
            thumb.title = `${item.modelName || item.model || ''}\n${(item.prompt || '').slice(0, 80)}`;
            thumb.onclick = () => {
                state.currentItem = item;
                const img = document.getElementById('igImage') as HTMLImageElement | null;
                const placeholder = document.getElementById('igPlaceholder') as HTMLDivElement | null;
                const downloadBtn = document.getElementById('igDownloadBtn') as HTMLButtonElement | null;
                if (img) { img.src = item.url; img.style.display = ''; img.onclick = () => showLightbox(item.url); }
                if (placeholder) placeholder.style.display = 'none';
                if (downloadBtn) downloadBtn.style.display = '';
                el.querySelectorAll('.ig-thumb').forEach((t: any) => t.classList.remove('active'));
                thumb.classList.add('active');
                updateMetaDisplay();
            };
            el.appendChild(thumb);
        });
        el.scrollLeft = el.scrollWidth;
    }

    /* ===== updateImagenOptionsVisibility, updateVibeInfo ===== */
    function updateVertexImagenFieldsVisibility() {
        const modelSel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
        const apiSel = document.getElementById('igApiRoute') as HTMLSelectElement | null;
        const group = document.getElementById('igVertexImagenGroup') as HTMLDivElement | null;
        if (!group) return;
        const show = (apiSel?.value === 'vertex') && (modelSel?.value?.startsWith('imagen') || false);
        group.style.display = show ? '' : 'none';
    }

    function updateImagenOptionsVisibility() {
        const modelSel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
        const isImagen = modelSel?.value?.startsWith('imagen') || false;
        const negGroup = document.getElementById('igNegPromptGroup') as HTMLDivElement | null;
        const personGroup = document.getElementById('igPersonGenGroup') as HTMLDivElement | null;
        if (negGroup) negGroup.style.display = isImagen ? '' : 'none';
        if (personGroup) personGroup.style.display = isImagen ? '' : 'none';
        updateVertexImagenFieldsVisibility();
    }

    function updateVibeInfo() {
        const vibeSel = document.getElementById('igVibe') as HTMLSelectElement | null;
        const infoEl = document.getElementById('igVibeInfo') as HTMLElement | null;
        if (!vibeSel || !infoEl) return;
        const vibe = VIBE_OPTIONS.find((v: any) => v.id === vibeSel.value);
        if (!vibe || vibe.id === 'none') {
            infoEl.innerHTML = '';
            return;
        }
        infoEl.innerHTML = `${escapeHtml(vibe.desc)}<span class="ig-vibe-suffix">${escapeHtml(vibe.suffix)}</span>`;
    }

    /* ===== renderPresetButtons, getOrCreatePresetPopup, closePresetPopup ===== */
    function renderPresetButtons() {
        const container = document.getElementById('igPresetBtns') as HTMLDivElement | null;
        if (!container) return;
        container.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'ig-preset-btn';
        btn.title = t('imagegen.t33');
        btn.textContent = '📚';
        btn.onclick = () => showPresetPopup(state.currentContextTab);
        container.appendChild(btn);
    }

    function getOrCreatePresetPopup() {
        if (state.igPresetPopup) return state.igPresetPopup;
        state.igPresetPopup = document.createElement('div');
        state.igPresetPopup.id = 'igPresetPopup';
        state.igPresetPopup.className = 'ig-preset-popup';
        state.igPresetPopup.innerHTML = `
            <div class="ig-preset-panel">
                <div class="ig-preset-popup-header">
                    <h3>${esc(t('imagegen.t05'))}</h3>
                    <button class="btn btn-ghost" id="igPresetPopupClose">✕</button>
                </div>
                <div class="ig-preset-popup-tabs" id="igPresetPopupTabs"></div>
                <div class="ig-preset-popup-body" id="igPresetPopupBody"></div>
            </div>`;
        state.igPresetPopup.onclick = (e: any) => { if (e.target === state.igPresetPopup) closePresetPopup(); };
        document.body.appendChild(state.igPresetPopup);
        const closeBtn = state.igPresetPopup.querySelector('#igPresetPopupClose');
        if (closeBtn) closeBtn.onclick = closePresetPopup;
        return state.igPresetPopup;
    }

    function closePresetPopup() {
        if (state.igPresetPopup) state.igPresetPopup.classList.remove('open');
    }

    /* ===== applyContextPreset, showSlotSection, showAddCharacterForm, hideSlotSection ===== */
    function applyContextPreset(item: any) {
        if (!item || item.id === '_none') {
            state.currentContextPreset = null;
            state.slotValues = {};
            hideSlotSection();
            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            if (promptEl) { promptEl.value = ''; promptEl.placeholder = t('imagegen.ph.igPrompt'); }
            return;
        }
        state.currentContextPreset = item;
        state.slotValues = {};
        const slots = getSlotsFromPrompt(item.prompt);
        const hasSlots = slots.length > 0;

        if (hasSlots) {
            showSlotSection(item);
        } else {
            hideSlotSection();
            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            if (promptEl) promptEl.value = item.prompt;
        }
        const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
        if (promptEl) promptEl.placeholder = hasSlots ? t('imagegen.t34') : t('imagegen.t34');
    }

    function showSlotSection(contextItem: any) {
        const section = document.getElementById('igSlotSection') as HTMLDivElement | null;
        if (!section) return;
        section.style.display = '';
        section.innerHTML = '';
        const slots = getSlotsFromPrompt(contextItem.prompt);
        const charOpts = getCharacterOptions();

        const header = document.createElement('div');
        header.className = 'ig-slot-header';
        header.innerHTML = `<span class="ig-slot-context">${escapeHtml(contextItem.icon + ' ' + contextItem.label)}</span><button type="button" class="btn btn-ghost" onclick="window._ig.openContextPreset()">${esc(t('imagegen.t06'))}</button>`;
        section.appendChild(header);

        function buildCharSelect(slotId: any, label: any) {
            const opts = charOpts.map((c: any) => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon || '') + ' ' + c.label)}</option>`).join('');
            const row = document.createElement('div');
            row.className = 'ig-slot-row';
            row.dataset.slotId = slotId;
            row.innerHTML = `
                <label class="ig-slot-label">${label}</label>
                <div class="ig-slot-select-wrap">
                    <select id="igSlot_${slotId}"><option value="">${esc(t('imagegen.t07'))}</option>${opts}<option value="${CUSTOM_INPUT_ID}">${esc(t('imagegen.opt.cUSTOMINPUTID'))}</option></select>
                    <button type="button" class="btn btn-ghost ig-slot-add-char" title="${esc(t('imagegen.t03'))}">➕</button>
                </div>
                <input type="text" id="igSlotCustom_${slotId}" class="ig-slot-custom-input" placeholder="${esc(t('imagegen.ph.igSlotCustomslotId'))}" style="display:none;">
            `;
            const sel = row.querySelector('select') as HTMLSelectElement | null;
            const customInput = row.querySelector('.ig-slot-custom-input') as HTMLInputElement | null;
            const addBtn = row.querySelector('.ig-slot-add-char');

            if (sel && state.slotValues[slotId]) {
                const v = state.slotValues[slotId];
                if (v === CUSTOM_INPUT_ID) { sel.value = CUSTOM_INPUT_ID; if (customInput) { customInput.style.display = ''; customInput.value = state.slotValues[slotId + '_custom'] || ''; } }
                else sel.value = v;
            }
            sel?.addEventListener('change', () => {
                const isCustom = sel.value === CUSTOM_INPUT_ID;
                if (customInput) customInput.style.display = isCustom ? '' : 'none';
                state.slotValues[slotId] = sel.value;
                if (!isCustom) state.slotValues[slotId + '_custom'] = '';
            });
            customInput?.addEventListener('input', () => { state.slotValues[slotId + '_custom'] = customInput.value; });
            addBtn?.addEventListener('click', (e: any) => { e.stopPropagation(); showAddCharacterForm(slotId, charOpts, row); });
            return row;
        }

        slots.forEach((slotId: any) => {
            const label = slotId === 'CHAR' ? t('imagegen.t35') : `<${slotId}>`;
            section.appendChild(buildCharSelect(slotId, escapeHtml(label)));
        });
    }

    function showAddCharacterForm(slotId: any, currentOpts: any, rowEl: any) {
        const form = document.createElement('div');
        form.className = 'ig-add-char-form';
        form.innerHTML = `
            <div class="ig-add-char-row">
                <input id="igAcIcon" placeholder="${esc(t('imagegen.ph.igAcIcon'))}" value="🎨" style="width:48px;">
                <input id="igAcLabel" placeholder="${esc(t('imagegen.ph.igAcLabel'))}" style="flex:1;">
            </div>
            <textarea id="igAcPrompt" placeholder="${esc(t('imagegen.ph.igAcPrompt'))}"></textarea>
            <div class="ig-add-char-actions">
                <button type="button" class="btn btn-ghost" id="igAcSave">${esc(t('imagegen.btn.igAcSave'))}</button>
                <button type="button" class="btn btn-ghost" id="igAcCancel">${esc(t('imagegen.t01'))}</button>
            </div>
        `;
        const prev = rowEl.nextElementSibling;
        rowEl.parentNode.insertBefore(form, prev || null);
        mustEl<HTMLButtonElement>('igAcCancel').onclick = () => { form.remove(); showSlotSection(state.currentContextPreset); };
        mustEl<HTMLButtonElement>('igAcSave').onclick = () => {
            const icon = mustEl<HTMLInputElement>('igAcIcon').value.trim() || '🎨';
            const label = mustEl<HTMLInputElement>('igAcLabel').value.trim();
            const prompt = mustEl<HTMLTextAreaElement>('igAcPrompt').value.trim();
            if (!label || !prompt) { Toolbox.showToast(t('imagegen.t36'), 'error'); return; }
            const list = loadCustomCharacters();
            list.push({ id: 'uc_' + Date.now(), icon, label, prompt });
            saveCustomCharacters(list);
            form.remove();
            showSlotSection(state.currentContextPreset);
            Toolbox.showToast(t('imagegen.t37'));
        };
    }

    function hideSlotSection() {
        const section = document.getElementById('igSlotSection') as HTMLDivElement | null;
        const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
        if (section) section.style.display = 'none';
        if (promptEl) promptEl.placeholder = t('imagegen.ph.igPrompt');
        state.currentContextPreset = null;
        state.slotValues = {};
    }

    /* ===== openContextPreset, getSlotValue, buildFinalPrompt ===== */
    function openContextPreset() {
        showPresetPopup(state.currentContextTab);
    }

    function getSlotValue(slotId: any, opts?: any) {
        const useShort = opts?.useShortForChar && slotId === 'CHAR';
        const presetId = (document.getElementById('igSlot_' + slotId) as HTMLSelectElement | null)?.value || state.slotValues[slotId];
        if (!presetId) return '';
        if (presetId === CUSTOM_INPUT_ID) {
            return (document.getElementById('igSlotCustom_' + slotId) as HTMLInputElement | null)?.value.trim() || state.slotValues[slotId + '_custom'] || '';
        }
        const builtin = ((IG as any)?.CHARACTER_PRESETS?.char || []).find((c: any) => c.id === presetId);
        if (builtin) return useShort ? (builtin.shortLabel || builtin.prompt) : builtin.prompt;
        const custom = loadCustomCharacters().find((c: any) => c.id === presetId);
        if (custom) return useShort ? (custom.shortLabel || custom.label || custom.prompt) : custom.prompt;
        return '';
    }

    function buildFinalPrompt() {
        if (!state.currentContextPreset) return null;
        const useShortForChar = state.currentContextTab === 'emoji' || state.currentContextTab === 'mascot';
        let prompt = state.currentContextPreset.prompt;
        const slots = getSlotsFromPrompt(prompt);
        for (const slotId of slots) {
            const val = getSlotValue(slotId, { useShortForChar });
            prompt = prompt.replace(new RegExp('<' + slotId + '>', 'g'), val);
        }
        const additional = (document.getElementById('igPrompt') as HTMLTextAreaElement | null)?.value.trim() || '';
        return prompt + (additional ? '. ' + additional : '');
    }

    /* ===== showPresetPopup, showCustomFormInPopup ===== */
    function showPresetPopup(tabId?: any) {
        state.currentContextTab = tabId || state.currentContextTab;
        const popup = getOrCreatePresetPopup();
        const tabsEl = popup.querySelector('#igPresetPopupTabs');
        const bodyEl = popup.querySelector('#igPresetPopupBody');
        if (!bodyEl) return;

        if (tabsEl) {
            tabsEl.innerHTML = '';
            Object.keys(CONTEXT_TAB_LABELS).forEach((tid: any) => {
                const tbtn = document.createElement('button');
                tbtn.className = 'ig-preset-tab-btn' + (tid === state.currentContextTab ? ' active' : '');
                tbtn.textContent = (CONTEXT_TAB_ICONS[tid] || '') + ' ' + CONTEXT_TAB_LABELS[tid];
                tbtn.onclick = () => showPresetPopup(tid);
                tabsEl.appendChild(tbtn);
            });
        }

        bodyEl.innerHTML = '';
        const rawItems = state.currentContextTab === 'custom' ? loadCustomPresets() : (CONTEXT_PRESETS[state.currentContextTab] || []);
        const noneItem = { id: '_none', icon: '⬜', label: t('imagegen.t38') };
        const items = [noneItem, ...rawItems];

        const grid = document.createElement('div');
        grid.className = 'ig-preset-grid';

        items.forEach((item: any, idx: number) => {
            const card = document.createElement('div');
            card.className = 'ig-card';
            card.innerHTML = `<div class="ig-card-icon">${escapeHtml(item.icon || '🎨')}</div><div class="ig-card-label">${escapeHtml(item.label)}</div>`;
            if (state.currentContextTab === 'custom' && item.id !== '_none') {
                const acts = document.createElement('div');
                acts.className = 'ig-card-actions';
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-ghost';
                editBtn.textContent = t('imagegen.t39');
                editBtn.onclick = (e: any) => { e.stopPropagation(); showCustomFormInPopup(item, idx - 1, bodyEl, state.currentContextTab); };
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger';
                delBtn.textContent = t('imagegen.t40');
                delBtn.onclick = (e: any) => {
                    e.stopPropagation();
                    const presets = loadCustomPresets();
                    presets.splice(idx - 1, 1);
                    saveCustomPresets(presets);
                    showPresetPopup(state.currentContextTab);
                    Toolbox.showToast(t('imagegen.t41'));
                };
                acts.appendChild(editBtn);
                acts.appendChild(delBtn);
                card.appendChild(acts);
            }
            card.onclick = () => {
                applyContextPreset(item);
                closePresetPopup();
                Toolbox.showToast(item.id === '_none' ? t('imagegen.t42') : t('imagegen.t43'));
            };
            grid.appendChild(card);
        });

        if (state.currentContextTab === 'custom') {
            const addCard = document.createElement('div');
            addCard.className = 'ig-card';
            addCard.innerHTML = `<div class="ig-card-icon" style="font-size:24px">+</div><div class="ig-card-label">${esc(t('imagegen.t08'))}</div>`;
            addCard.onclick = () => showCustomFormInPopup(null, -1, bodyEl, state.currentContextTab);
            grid.appendChild(addCard);
        }

        bodyEl.appendChild(grid);
        popup.classList.add('open');
    }

    function showCustomFormInPopup(item: any, idx: any, bodyEl: any, tabId: any) {
        const form = document.createElement('div');
        form.className = 'ig-custom-form';
        form.innerHTML = `
            <div class="ig-custom-form-row">
                <input id="igCfIcon" placeholder="${esc(t('imagegen.ph.igCfIcon'))}" value="${escapeHtml(item?.icon || '')}" style="width:60px;">
                <input id="igCfLabel" placeholder="${esc(t('imagegen.ph.igAcLabel'))}" value="${escapeHtml(item?.label || '')}" style="flex:1;">
            </div>
            <textarea id="igCfPrompt" placeholder="${esc(t('imagegen.ph.igCfPrompt'))}">${escapeHtml(item?.prompt || '')}</textarea>
            <div class="ig-custom-form-row">
                <button class="btn btn-ghost" id="igCfSave" style="flex:1;">${idx >= 0 ? t('imagegen.t39') : t('imagegen.btn.igAcSave')}</button>
                <button class="btn btn-ghost" id="igCfCancel">${esc(t('imagegen.t01'))}</button>
            </div>`;
        bodyEl.innerHTML = '';
        bodyEl.appendChild(form);

        mustEl<HTMLButtonElement>('igCfCancel').onclick = () => showPresetPopup(state.currentContextTab);
        mustEl<HTMLButtonElement>('igCfSave').onclick = () => {
            const icon = mustEl<HTMLInputElement>('igCfIcon').value.trim() || '🎨';
            const label = mustEl<HTMLInputElement>('igCfLabel').value.trim();
            const prompt = mustEl<HTMLTextAreaElement>('igCfPrompt').value.trim();
            if (!label || !prompt) { Toolbox.showToast(t('imagegen.t36'), 'error'); return; }
            const presets = loadCustomPresets();
            const entry = { id: item?.id || 'c_' + Date.now(), icon, label, prompt };
            if (idx >= 0 && idx < presets.length) presets[idx] = entry;
            else presets.push(entry);
            saveCustomPresets(presets);
            showPresetPopup(state.currentContextTab);
            Toolbox.showToast(idx >= 0 ? t('imagegen.t44') : t('imagegen.t45'));
        };
    }

    /* ===== showApiHistory ===== */
    function showApiHistory() {
        const history = typeof Gemini !== 'undefined' ? (Gemini as any).getApiHistory() : [];
        // 창을 만든 뒤 콜백에서 다시 쓰므로, 만들고 나서는 '없을 수 있음' 이 아닌 값으로 고정한다.
        let found = document.getElementById('igApiHistoryOverlay') as HTMLDivElement | null;
        if (found == null) {
            const overlay = document.createElement('div');
            overlay.id = 'igApiHistoryOverlay';
            overlay.className = 'ig-api-history-overlay';
            overlay.innerHTML = `
                <div class="ig-api-history-panel">
                    <div class="ig-api-history-header">
                        <h3>${esc(t('imagegen.t09'))}</h3>
                        <div>
                            <button class="btn btn-ghost" id="igApiHistoryClear">${esc(t('imagegen.btn.igApiHistoryClear'))}</button>
                            <button class="btn btn-ghost" id="igApiHistoryClose">${esc(t('imagegen.btn.igApiHistoryClose'))}</button>
                        </div>
                    </div>
                    <div class="ig-api-history-list" id="igApiHistoryList"></div>
                </div>`;
            overlay.onclick = (e: any) => { if (e.target === overlay) overlay.classList.remove('open'); };
            document.body.appendChild(overlay);

            mustEl<HTMLButtonElement>('igApiHistoryClose').onclick = () => overlay.classList.remove('open');
            mustEl<HTMLButtonElement>('igApiHistoryClear').onclick = () => {
                if (typeof Gemini !== 'undefined') (Gemini as any).clearApiHistory();
                showApiHistory();
            };
            found = overlay;
        }
        const overlay = found;

        const listEl = mustEl<HTMLDivElement>('igApiHistoryList');
        listEl.innerHTML = '';

        if (history.length === 0) {
            listEl.innerHTML = t('imagegen.t46');
        } else {
            history.forEach((entry: any, i: number) => {
                const card = document.createElement('div');
                card.className = 'ig-api-history-card';
                const statusCls = entry.status >= 400 ? 'error' : 'ok';
                const promptPreview = entry.requestBody?.contents?.[0]?.parts?.[0]?.text?.slice(0, 60) || entry.requestBody?.instances?.[0]?.prompt?.slice(0, 60) || '-';
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
                (card.querySelector('.ig-api-history-card-head') as any).onclick = () => {
                    const body = document.getElementById('igApiBody' + i) as HTMLDivElement | null;
                    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
                };
                listEl.appendChild(card);
            });
        }

        overlay.classList.add('open');
    }

    /* ===== (window as any)._ig ===== */
    (window as any)._ig = {
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
        let promptText;
        if (state.currentContextPreset) {
            promptText = buildFinalPrompt();
            if (!promptText) { Toolbox.showToast(t('imagegen.t47'), 'error'); return; }
            const slots = getSlotsFromPrompt(state.currentContextPreset.prompt);
            const allFilled = slots.every((s: any) => {
                const selVal = (document.getElementById('igSlot_' + s) as HTMLSelectElement | null)?.value || state.slotValues[s];
                if (!selVal) return false;
                if (selVal === CUSTOM_INPUT_ID) return !!((document.getElementById('igSlotCustom_' + s) as HTMLInputElement | null)?.value.trim() || state.slotValues[s + '_custom']);
                return true;
            });
            if (!allFilled) { Toolbox.showToast(t('imagegen.t48'), 'error'); return; }
        } else {
            const promptEl = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            promptText = promptEl?.value.trim();
            if (!promptText) { Toolbox.showToast(t('imagegen.t47'), 'error'); return; }
        }
        if (!(Gemini as any).requireApiKey()) return;

        const isEmoji = state.currentContextPreset && state.currentContextTab === 'emoji';
        const isMascot = state.currentContextPreset && state.currentContextTab === 'mascot';
        let emojiChar = '';
        if (isEmoji && (document.getElementById('igSlot_CHAR') as HTMLSelectElement | null)) {
            const v = mustEl<HTMLSelectElement>('igSlot_CHAR').value;
            emojiChar = v === CUSTOM_INPUT_ID ? ((document.getElementById('igSlotCustom_CHAR') as HTMLInputElement | null)?.value.trim() || '') : ((getCharacterOptions().find((c: any) => c.id === v))?.label || '');
        }
        enqueue(promptText, isEmoji, emojiChar, isMascot);
        const pending = queue.filter((q: any) => q.status === 'pending').length;
        const running = queue.filter((q: any) => q.status === 'running').length;
        if (pending + running > 1) {
            Toolbox.showToast(t('imagegen.queued', { pending }));
        }
    }

    function cancel() {
        const running = queue.find((q: any) => q.status === 'running');
        if (running) {
            cancelQueueItem(running.id);
            Toolbox.showToast(t('imagegen.t49'));
            Mdd.linePreset('tool_run', { mood: 'idle', msg: t('imagegen.t50') });
        }
    }

    function download() {
        if (!state.currentItem?.url) return;
        downloadImage(state.currentItem.url);
    }

    function toggleCompare() {
        if (state.sessionGallery.length < 2) { Toolbox.showToast(t('imagegen.t51'), 'error'); return; }
        state.compareMode = !state.compareMode;
        const preview = document.getElementById('igPreview') as HTMLDivElement | null;
        const img = document.getElementById('igImage') as HTMLImageElement | null;
        const placeholder = document.getElementById('igPlaceholder') as HTMLDivElement | null;
        const btn = document.getElementById('igCompareBtn') as HTMLButtonElement | null;

        if (state.compareMode && state.currentItem) {
            const idx = state.sessionGallery.indexOf(state.currentItem);
            const prevItem = idx > 0 ? state.sessionGallery[idx - 1] : state.sessionGallery[state.sessionGallery.length - 1];
            if (img) img.style.display = 'none';
            if (placeholder) placeholder.style.display = 'none';
            if (preview == null) return;
            let cmp = preview.querySelector('.ig-compare') as HTMLDivElement | null;
            if (cmp == null) { cmp = document.createElement('div'); cmp.className = 'ig-compare'; preview.appendChild(cmp); }
            cmp.innerHTML = `
                <div class="ig-compare-pane"><div class="ig-compare-label">${esc(t('imagegen.t10'))}</div><img src="${prevItem.url}" alt="Previous"></div>
                <div class="ig-compare-pane"><div class="ig-compare-label">${esc(t('imagegen.t11'))}</div><img src="${state.currentItem.url}" alt="Current"></div>`;
            cmp.style.display = 'flex';
            if (btn) btn.textContent = t('imagegen.t52');
        } else {
            const cmp = preview?.querySelector('.ig-compare') as HTMLDivElement | null;
            if (cmp) cmp.style.display = 'none';
            if (img && state.currentItem) img.style.display = '';
            if (btn) btn.textContent = t('imagegen.btn.igCompareBtn');
        }
    }

    function toggleHistory() {
        const dd = document.getElementById('igHistoryDropdown') as HTMLDivElement | null;
        if (!dd) return;
        const isOpen = dd.classList.toggle('open');
        if (isOpen) {
            const history = getPromptHistory();
            if (history.length === 0) {
                dd.innerHTML = t('imagegen.t53');
            } else {
                dd.innerHTML = '';
                history.forEach((text: any) => {
                    const item = document.createElement('div');
                    item.className = 'ig-history-item';
                    item.textContent = text;
                    item.title = text;
                    item.onclick = () => {
                        if (state.currentContextPreset) {
                            const slots = getSlotsFromPrompt(state.currentContextPreset.prompt);
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
        if (!raw) { Toolbox.showToast(t('imagegen.t47'), 'error'); return; }
        if (!(Gemini as any).requireApiKey()) return;

        const btn = document.querySelector('.ig-enhance-btn') as HTMLButtonElement | null;
        const originalLabel = btn?.textContent;
        try {
            if (btn) { btn.disabled = true; btn.textContent = t('imagegen.t54'); }
            if (promptEl) promptEl.classList.add('ig-enhancing');

            const enhanced = await (Gemini as any).enhancePrompt(raw);
            if (promptEl && enhanced) {
                promptEl.classList.add('ig-enhanced-flash');
                promptEl.value = enhanced;
                setTimeout(() => promptEl.classList.remove('ig-enhanced-flash'), 600);
            }
            Toolbox.showToast(t('imagegen.t55'));
        } catch (e: any) {
            Toolbox.showToast(e.message || '다듬기 실패', 'error', e);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = originalLabel || ''; }
            if (promptEl) promptEl.classList.remove('ig-enhancing');
        }
    }

    /* ===== buildMain ===== */
    function buildMain(container: any) {
        Mdd.linePreset('daily_start', { msg: t('imagegen.t56') });

        container.innerHTML = `
            <div class="ig-layout">
                <div class="ig-sidebar">
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t12'))}</label>
                        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
                            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">
                                ${esc(t('imagegen.t13'))} <strong id="igActiveProfileName" style="color:var(--text-secondary);">${typeof Gemini !== 'undefined' ? ((Gemini as any).getActiveProfileName() || '기본') : '-'}</strong>
                            </div>
                            <button class="btn btn-ghost" type="button" onclick="Toolbox.switchPage('user'); Toolbox.switchTab('user-settings');">${esc(t('imagegen.t14'))}</button>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t15'))}</label>
                        <select id="igModelSelect"></select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t16'))}</label>
                        <select id="igApiRoute">
                            <option value="aiStudio">${esc(t('imagegen.opt.aiStudio'))}</option>
                            <option value="vertex">Vertex AI</option>
                        </select>
                        <div style="font-size:var(--font-size-2xs);color:var(--text-tertiary);margin-top:6px;line-height:1.4;">
                            ${esc(t('imagegen.t17'))} <code>generateContent</code>${esc(t('imagegen.t18'))} <code>predict</code>${esc(t('imagegen.t19'))}
                        </div>
                    </div>
                    <div class="field-group" id="igVertexImagenGroup" style="display:none">
                        <label class="field-label">☁️ Vertex Imagen (GCP)</label>
                        <p style="font-size:var(--font-size-2xs);color:var(--text-tertiary);margin:0 0 8px 0;line-height:1.4;">
                            <code>projects/…/locations/…/publishers/google/models/…:predict</code> ${esc(t('imagegen.t20'))} <code>PROJECT_ID</code>, <code>LOCATION</code>)
                        </p>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div>
                                <label class="field-label" for="igVertexProjectId" style="font-size:var(--font-size-xs);">${esc(t('imagegen.label.igVertexProjectId'))}</label>
                                <input type="text" id="igVertexProjectId" class="settings-control" style="width:100%;box-sizing:border-box;" placeholder="my-gcp-project-id" autocomplete="off">
                            </div>
                            <div>
                                <label class="field-label" for="igVertexLocation" style="font-size:var(--font-size-xs);">${esc(t('imagegen.label.igVertexLocation'))}</label>
                                <input type="text" id="igVertexLocation" class="settings-control" style="width:100%;box-sizing:border-box;" placeholder="us-central1" autocomplete="off">
                            </div>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t21'))}</label>
                        <select id="igAspectRatio">
                            ${ASPECT_RATIOS.map((r: any) => `<option value="${r.value}"${r.value === '16:9' ? ' selected' : ''}>${r.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t22'))}</label>
                        <select id="igVibe">
                            ${VIBE_OPTIONS.map((v: any) => `<option value="${v.id}">${v.label}</option>`).join('')}
                        </select>
                        <div class="ig-vibe-info" id="igVibeInfo"></div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t23'))}</label>
                        <select id="igSafety">
                            ${SAFETY_LEVELS.map((s: any) => `<option value="${s.value}"${s.value === 'BLOCK_ONLY_HIGH' ? ' selected' : ''}>${s.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group" id="igNegPromptGroup" style="display:none">
                        <label class="field-label">${esc(t('imagegen.t24'))} <span style="font-weight:400;color:var(--text-tertiary)">(Imagen)</span></label>
                        <input type="text" id="igNegPrompt" placeholder="${esc(t('imagegen.ph.igNegPrompt'))}">
                    </div>
                    <div class="field-group" id="igPersonGenGroup" style="display:none">
                        <label class="field-label">${esc(t('imagegen.t25'))} <span style="font-weight:400;color:var(--text-tertiary)">(Imagen)</span></label>
                        <select id="igPersonGen">
                            ${PERSON_GEN_OPTIONS.map((p: any) => `<option value="${p.value}">${p.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">${esc(t('imagegen.t05'))}</label>
                        <div class="ig-preset-btns" id="igPresetBtns"></div>
                    </div>
                    <div class="ig-ref-card">
                        <div class="ig-ref-label">${esc(t('imagegen.t26'))}</div>
                        <a href="https://pixai.art/ko/generator/image" target="_blank" rel="noopener">PixAI</a>
                        <a href="https://tensor.art/ko-KR" target="_blank" rel="noopener">Tensor.art</a>
                        <a href="https://novelai.net" target="_blank" rel="noopener">NovelAI</a>
                    </div>
                </div>

                <div class="ig-canvas">
                    <div class="ig-preview" id="igPreview">
                        <div class="ig-placeholder" id="igPlaceholder"><span>🎨</span>${esc(t('imagegen.t27'))}</div>
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
                            <textarea id="igPrompt" placeholder="${esc(t('imagegen.ph.igPrompt'))}"></textarea>
                            <button class="btn btn-ghost" id="igHistoryBtn" onclick="window._ig.toggleHistory()" title="${esc(t('imagegen.title.igHistoryBtn'))}">📜</button>
                            <button class="btn btn-ghost ig-enhance-btn" onclick="window._ig.enhancePrompt()">${esc(t('imagegen.t28'))}</button>
                            <button class="btn btn-accent ig-gen-btn" id="igGenBtn" onclick="window._ig.generate()"><span>✨</span>${esc(t('imagegen.t29'))}</button>
                            <button class="btn btn-danger ig-gen-btn" id="igCancelBtn" style="display:none" onclick="window._ig.cancel()"><span>✕</span>${esc(t('imagegen.t01'))}</button>
                        </div>
                        <div class="ig-actions">
                            <span id="igMetaDisplay" class="ig-meta-display"></span>
                            <button class="btn btn-ghost" id="igCompareBtn" style="display:none;font-size:var(--font-size-xs);" onclick="window._ig.toggleCompare()">${esc(t('imagegen.btn.igCompareBtn'))}</button>
                            <button class="btn btn-ghost" id="igDownloadBtn" style="display:none" onclick="window._ig.download()">${esc(t('imagegen.btn.igDownloadBtn'))}</button>
                            <button class="btn btn-ghost" style="font-size:var(--font-size-xs);" onclick="window._ig.showApiHistory()" title="${esc(t('imagegen.t04'))}">${esc(t('imagegen.t30'))}</button>
                            <span id="igTokenDisplay" class="ig-token-display"></span>
                        </div>
                        <div class="ig-gallery" id="igGallery"></div>
                        <div class="ig-queue-panel" id="igQueuePanel" style="display:none">
                            <div class="ig-queue-header">
                                <div><span class="ig-queue-title">${esc(t('imagegen.t31'))}</span><span class="ig-queue-count" id="igQueueCount"></span></div>
                                <button class="ig-queue-clear" id="igQueueClear">${esc(t('imagegen.btn.igQueueClear'))}</button>
                            </div>
                            <div class="ig-queue-list" id="igQueueList"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        requestAnimationFrame(() => {
            const sel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
            if (sel) {
                const gGroup = document.createElement('optgroup');
                gGroup.label = t('imagegen.t57');
                ((Gemini as any).MODELS.geminiImage || (Gemini as any).MODELS.gemini).forEach((m: any) => {
                    const o = document.createElement('option');
                    o.value = m.id; o.textContent = m.name;
                    if (m.isDefault) o.selected = true;
                    gGroup.appendChild(o);
                });
                sel.appendChild(gGroup);

                const iGroup = document.createElement('optgroup');
                iGroup.label = 'Imagen';
                (Gemini as any).MODELS.imagen.forEach((m: any) => {
                    const o = document.createElement('option');
                    o.value = m.id; o.textContent = m.name;
                    iGroup.appendChild(o);
                });
                sel.appendChild(iGroup);

                const savedModel = Toolbox.getPref('ig_model', '');
                if (savedModel) sel.value = savedModel;
                sel.addEventListener('change', () => { Toolbox.setPref('ig_model', sel.value); updateImagenOptionsVisibility(); });
                updateImagenOptionsVisibility();
            }

            const ratioSel = document.getElementById('igAspectRatio') as HTMLSelectElement | null;
            const apiSel = document.getElementById('igApiRoute') as HTMLSelectElement | null;
            const vibeSel = document.getElementById('igVibe') as HTMLSelectElement | null;
            const safetySel = document.getElementById('igSafety') as HTMLSelectElement | null;
            if (ratioSel) { const sr = Toolbox.getPref('ig_ratio', ''); if (sr) ratioSel.value = sr; ratioSel.addEventListener('change', () => Toolbox.setPref('ig_ratio', ratioSel.value)); }
            if (apiSel) {
                const savedApi = Toolbox.getPref('ig_api_route', '');
                if (savedApi) apiSel.value = savedApi;
                apiSel.addEventListener('change', () => {
                    Toolbox.setPref('ig_api_route', apiSel.value);
                    updateVertexImagenFieldsVisibility();
                });
            }

            const vProj = document.getElementById('igVertexProjectId') as HTMLInputElement | null;
            const vLoc = document.getElementById('igVertexLocation') as HTMLInputElement | null;
            if (vLoc) {
                const sl = Toolbox.getPref('ig_vertex_location', '');
                if (sl) vLoc.value = sl;
                else vLoc.value = 'us-central1';
                vLoc.addEventListener('change', () => Toolbox.setPref('ig_vertex_location', vLoc.value.trim() || 'us-central1'));
            }
            if (vProj) {
                const sp = Toolbox.getPref('ig_vertex_project_id', '');
                if (sp) vProj.value = sp;
                vProj.addEventListener('change', () => Toolbox.setPref('ig_vertex_project_id', vProj.value.trim()));
            }
            function syncIgVertexFieldsFromPrefs() {
                const p = document.getElementById('igVertexProjectId') as HTMLInputElement | null;
                const l = document.getElementById('igVertexLocation') as HTMLInputElement | null;
                if (p instanceof HTMLInputElement) {
                    const v = Toolbox.getPref('ig_vertex_project_id', '');
                    if (typeof v === 'string') p.value = v;
                }
                if (l instanceof HTMLInputElement) {
                    const v = Toolbox.getPref('ig_vertex_location', '');
                    l.value = (typeof v === 'string' && v.trim()) ? v.trim() : 'us-central1';
                }
            }
            window.addEventListener('vertex-context-changed', syncIgVertexFieldsFromPrefs);
            updateVertexImagenFieldsVisibility();
            if (vibeSel) { const sv = Toolbox.getPref('ig_vibe', ''); if (sv) vibeSel.value = sv; vibeSel.addEventListener('change', () => { Toolbox.setPref('ig_vibe', vibeSel.value); updateVibeInfo(); }); updateVibeInfo(); }
            if (safetySel) { const ss = Toolbox.getPref('ig_safety', ''); if (ss) safetySel.value = ss; safetySel.addEventListener('change', () => Toolbox.setPref('ig_safety', safetySel.value)); }

            renderPresetButtons();

            const qClearBtn = document.getElementById('igQueueClear') as HTMLButtonElement | null;
            if (qClearBtn) qClearBtn.onclick = () => (IG as any).clearQueue();

            const prompt = document.getElementById('igPrompt') as HTMLTextAreaElement | null;
            if (prompt) {
                prompt.addEventListener('keydown', (e: any) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (window as any)._ig.generate();
                    }
                });
            }

            (IG as any).initCore({
                state,
                renderQueue,
                renderQueueItem,
                updateMainPreview,
                showResultInPreview,
                hideMainLoading,
                renderSessionGallery,
                saveGallerySession
            });

            if ((IG as any).loadGallerySession()) {
                renderSessionGallery();
                if (state.currentItem) {
                    const img = document.getElementById('igImage') as HTMLImageElement | null;
                    const placeholder = document.getElementById('igPlaceholder') as HTMLDivElement | null;
                    const downloadBtn = document.getElementById('igDownloadBtn') as HTMLButtonElement | null;
                    const compareBtnR = document.getElementById('igCompareBtn') as HTMLButtonElement | null;
                    if (img) { img.src = state.currentItem.url; img.style.display = ''; img.onclick = () => showLightbox(state.currentItem.url); }
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
        ...Toolbox.getLazyWidgetPublicMeta('imagegen'),
        tabs: [
            {
                id: 'imagegen-main',
                label: t('imagegen.tab.main', undefined, '생성'),
                /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
                build: function (container: HTMLElement): void {
                    void loadNamespace('imagegen').then(function () {
                        buildMain(container);
                    });
                }
            }
        ]
    });
})();
