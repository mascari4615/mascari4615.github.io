import { t, loadNamespace } from '../../lib/i18n';

/** 화면에 그대로 박는 글은 태그로 읽히면 안 된다. */
const esc = (v: unknown): string =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import {
    CB_API_SURFACE_PREF_KEY,
    ChatbotApiSurfaceUi,
    chatbotUiSurfaceToPackage,
    getChatbotApiSurfaceUi,
} from './api-surface';

(function () {
    /* ===== 상태 ===== */
    const CHATBOT_SESSIONS_INDEX_KEY = 'toolbox_chatbot_sessions_index';
    const CHATBOT_SESSION_PREFIX = 'toolbox_chatbot_session_';
    let currentSessionId: string | null = null;
    let lastLoadedSessionCharacterId = '';
    const MAX_SESSIONS = 10;

    function generateSessionId() { return 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

    function getSessionsIndex() {
        try {
            const raw = sessionStorage.getItem(CHATBOT_SESSIONS_INDEX_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }

    function saveSessionsIndex(index: any) {
        sessionStorage.setItem(CHATBOT_SESSIONS_INDEX_KEY, JSON.stringify(index));
    }

    function createNewSession(name?: any) {
        const id = generateSessionId();
        const index = getSessionsIndex();
        index.push({ id, name: name || t('chatbot.chatN', { n: index.length + 1 }), createdAt: Date.now() });
        if (index.length > MAX_SESSIONS) {
            const removed = index.shift();
            sessionStorage.removeItem(CHATBOT_SESSION_PREFIX + removed.id);
        }
        saveSessionsIndex(index);
        return id;
    }

    function deleteSession(id: any) {
        let index = getSessionsIndex().filter((s: any) => s.id !== id);
        saveSessionsIndex(index);
        sessionStorage.removeItem(CHATBOT_SESSION_PREFIX + id);
    }

    let chatHistory: any[] = [];
    let conversationSummary = '';
    let pendingImages: any[] = []; // { base64, mimeType }

    function fileToBase64(file: any) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl.split(',')[1];
                resolve({ base64, mimeType: file.type, dataUrl });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function addPendingImage(imgData: any) {
        if (pendingImages.length >= 5) { Toolbox.showToast(t('chatbot.t41'), 'error'); return; }
        pendingImages.push(imgData);
        renderAttachThumbs();
    }

    function renderAttachThumbs() {
        const area = (document.getElementById('cbAttachArea') as any);
        if (!area) return;
        area.querySelectorAll('.cb-attach-wrap').forEach((el: any) => el.remove());
        pendingImages.forEach((img: any, i: number) => {
            const wrap = document.createElement('span');
            wrap.className = 'cb-attach-wrap';
            const thumb = document.createElement('img');
            thumb.className = 'cb-attach-thumb';
            thumb.src = img.dataUrl;
            const rm = document.createElement('button');
            rm.className = 'cb-attach-remove';
            rm.textContent = '×';
            rm.onclick = () => { pendingImages.splice(i, 1); renderAttachThumbs(); };
            wrap.appendChild(thumb);
            wrap.appendChild(rm);
            area.insertBefore(wrap, area.querySelector('.cb-attach-btn') as Node);
        });
    }

    function saveSession() {
        if (!currentSessionId) return;
        try {
            const toSave = chatHistory.map((msg: any) => {
                const parts = msg.parts.map((p: any) => {
                    if (p.inlineData) return { text: '[image]' };
                    return p;
                });
                return { role: msg.role, parts };
            });
            const charSel = (document.getElementById('cbCharacterSelect') as any) as HTMLSelectElement | null;
            const characterId = charSel?.value || '';
            sessionStorage.setItem(CHATBOT_SESSION_PREFIX + currentSessionId, JSON.stringify({
                chatHistory: toSave,
                conversationSummary,
                characterId,
                savedAt: Date.now()
            }));
        } catch (e: any) {
            console.warn('Chatbot session save failed', e);
        }
    }

    function loadSession(id?: any) {
        lastLoadedSessionCharacterId = '';
        try {
            const raw = sessionStorage.getItem(CHATBOT_SESSION_PREFIX + (id || currentSessionId));
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
                chatHistory = data.chatHistory;
                conversationSummary = data.conversationSummary || '';
                lastLoadedSessionCharacterId = data.characterId || '';
                return true;
            }
        } catch (e: any) {
            console.warn('Chatbot session load failed', e);
        }
        return false;
    }

    function switchSession(id: any) {
        saveSession();
        currentSessionId = id;
        chatHistory = [];
        conversationSummary = '';
        pendingImages = [];
        renderAttachThumbs();
        const msgs = (document.getElementById('cbMessages') as any);
        if (msgs) msgs.innerHTML = '';
        if (loadSession(id) && chatHistory.length > 0) {
            chatHistory.forEach((msg: any) => {
                const role = msg.role === 'user' ? 'user' : 'bot';
                const text = msg.parts?.[0]?.text || '';
                if (text) appendMsg(role, text, false);
            });
        } else {
            appendMsg('bot', t('chatbot.t42'));
        }
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
        renderSessionTabs();
        syncCharacterSelectAfterSessionLoad();
    }

    function syncCharacterSelectAfterSessionLoad() {
        window.ChatbotCharacters?.syncAfterSessionLoad(lastLoadedSessionCharacterId);
    }

    function renderSessionTabs() {
        const container = (document.getElementById('cbSessionTabs') as any);
        if (!container) return;
        const index = getSessionsIndex();
        container.innerHTML = '';
        index.forEach((s: any) => {
            const tab = document.createElement('button');
            tab.className = 'cb-session-tab' + (s.id === currentSessionId ? ' active' : '');
            tab.innerHTML = `<span class="cb-session-tab-name">${Toolbox.escapeHtml?.(s.name) ?? s.name}</span>`;
            if (index.length > 1) {
                const del = document.createElement('span');
                del.className = 'cb-session-tab-del';
                del.textContent = '×';
                del.onclick = (e: any) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                    if (s.id === currentSessionId) {
                        const remaining = getSessionsIndex();
                        if (remaining.length > 0) switchSession(remaining[remaining.length - 1].id);
                        else { const nid = createNewSession(); switchSession(nid); }
                    } else {
                        renderSessionTabs();
                    }
                };
                tab.appendChild(del);
            }
            tab.onclick = () => { if (s.id !== currentSessionId) switchSession(s.id); };
            const nameSpan = tab.querySelector('.cb-session-tab-name') as HTMLElement | null;
            if (nameSpan) {
                nameSpan.ondblclick = (e: any) => {
                    e.stopPropagation();
                    const input = document.createElement('input');
                    input.className = 'cb-session-tab-edit';
                    input.value = s.name;
                    input.maxLength = 20;
                    const commit = () => {
                        const newName = input.value.trim() || s.name;
                        s.name = newName;
                        const idx = getSessionsIndex();
                        const found = idx.find((x: any) => x.id === s.id);
                        if (found) { found.name = newName; saveSessionsIndex(idx); }
                        renderSessionTabs();
                    };
                    input.onblur = commit;
                    input.onkeydown = (ev: any) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') renderSessionTabs(); };
                    nameSpan.replaceWith(input);
                    input.focus();
                    input.select();
                };
            }
            container.appendChild(tab);
        });
        const addBtn = document.createElement('button');
        addBtn.className = 'cb-session-tab cb-session-add';
        addBtn.textContent = '+';
        addBtn.title = t('chatbot.t43');
        addBtn.onclick = () => {
            if (getSessionsIndex().length >= MAX_SESSIONS) { Toolbox.showToast(t('chatbot.t44'), 'error'); return; }
            saveSession();
            const nid = createNewSession();
            switchSession(nid);
        };
        container.appendChild(addBtn);
    }

    /* ===== 빌드 ===== */
    function buildChat(container: any) {
        Mdd.linePreset('tool_run', { msg: t('chatbot.t45') });

        container.innerHTML = `
            <div class="cb-outer">
            <div class="cb-layout">
                <aside class="cb-sidebar cb-sidebar-left" aria-label="${esc(t('chatbot.t01'))}">
                    <div class="cb-sidebar-header">
                        <p class="cb-panel-heading">${esc(t('chatbot.t03'))}</p>
                        <div class="field-group">
                            <label class="field-label">${esc(t('chatbot.t04'))}</label>
                            <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
                            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">
                                    ${esc(t('chatbot.t05'))} <strong id="cbActiveProfileName" style="color:var(--text-secondary);">${typeof Gemini !== 'undefined' ? ((Gemini as any).getActiveProfileName() || '기본') : '-'}</strong>
                                </div>
                                <button class="btn btn-ghost" type="button" onclick="Toolbox.switchPage('user'); Toolbox.switchTab('user-settings');">${esc(t('chatbot.t06'))}</button>
                            </div>
                        </div>
                        <label class="cb-model-label">${esc(t('chatbot.t07'))}</label>
                        <select id="cbModelSelect" style="font-size:var(--font-size-xs);padding:6px 8px;width:100%;"></select>
                        <label class="cb-model-label" style="margin-top:8px;">API</label>
                        <select id="cbApiSurfaceSelect" style="font-size:var(--font-size-xs);padding:6px 8px;width:100%;">
                            <option value="studio">${esc(t('chatbot.opt.studio'))}</option>
                            <option value="vertex">${esc(t('chatbot.opt.vertex'))}</option>
                        </select>
                        <p class="cb-mini" style="font-size:var(--font-size-2xs);color:var(--text-tertiary);margin:6px 0 0;line-height:1.45;">${esc(t('chatbot.t08'))}<code style="font-size:1em;">ig_vertex_*</code>${esc(t('chatbot.t09'))}</p>
                    </div>

                    <div class="cb-options">
                        <p class="cb-panel-heading" style="margin-bottom:8px;">${esc(t('chatbot.t10'))}</p>
                        <div class="cb-option-row">
                            <label>${esc(t('chatbot.t11'))}</label>
                            <label class="cb-toggle"><input type="checkbox" id="cbWebSearch"><span class="cb-toggle-slider"></span></label>
                        </div>
                        <div class="cb-option-row">
                            <label>${esc(t('chatbot.t12'))}</label>
                            <label class="cb-toggle"><input type="checkbox" id="cbMemory" checked><span class="cb-toggle-slider"></span></label>
                        </div>
                        <div class="cb-option-row cb-temperature-row">
                            <label>Temperature <span id="cbTempValue">0.8</span></label>
                        </div>
                        <div class="cb-option-row" style="margin-top:2px;">
                            <input type="range" id="cbTemperature" min="0" max="2" step="0.1" value="0.8" style="width:100%;">
                        </div>
                        <label class="cb-model-label" style="margin-top:8px;">${esc(t('chatbot.t13'))}</label>
                        <select id="cbSafetyThreshold" style="font-size:var(--font-size-xs);padding:6px 8px;width:100%;"></select>
                    </div>
                </aside>

                <div class="cb-chat-stage">
                <div class="cb-chat" style="position:relative;">
                    <div class="cb-shortcuts-overlay" id="cbShortcutsOverlay">
                        <div class="cb-shortcuts-panel">
                            <h3>${esc(t('chatbot.t14'))}</h3>
                            <div class="cb-shortcut-row"><span>${esc(t('chatbot.aria.cbSendBtn'))}</span><span class="cb-shortcut-key">Enter</span></div>
                            <div class="cb-shortcut-row"><span>${esc(t('chatbot.t15'))}</span><span class="cb-shortcut-key">Shift + Enter</span></div>
                            <div class="cb-shortcut-row"><span>${esc(t('chatbot.t16'))}</span><span class="cb-shortcut-key">Ctrl + F</span></div>
                            <div class="cb-shortcut-row"><span>${esc(t('chatbot.t17'))}</span><span class="cb-shortcut-key">Ctrl + N</span></div>
                            <div class="cb-shortcut-row"><span>${esc(t('chatbot.t18'))}</span><span class="cb-shortcut-key">Ctrl + /</span></div>
                            <div style="margin-top:12px;text-align:center;">
                                <button class="btn btn-ghost" onclick="document.getElementById('cbShortcutsOverlay').classList.remove('open')">${esc(t('chatbot.title.cbSearchClose'))}</button>
                            </div>
                        </div>
                    </div>
                    <div class="cb-chat-header">
                        <span class="cb-chat-header-title" id="cbChatTitle">${esc(t('chatbot.label.cbChatTitle'))}</span>
                        <div class="cb-chat-header-actions">
                            <button class="btn btn-ghost" id="cbShortcutsBtn" title="${esc(t('chatbot.title.cbShortcutsBtn'))}">⌨️</button>
                            <button class="btn btn-ghost" id="cbSearchToggle" title="${esc(t('chatbot.title.cbSearchToggle'))}">🔍</button>
                            <button class="btn btn-ghost" onclick="window._cb.importChat()">${esc(t('chatbot.t19'))}</button>
                            <button class="btn btn-ghost" onclick="window._cb.exportChat('txt')">TXT</button>
                            <button class="btn btn-ghost" onclick="window._cb.exportChat('json')">JSON</button>
                            <button class="btn btn-ghost" onclick="window._cb.clearChat()">${esc(t('chatbot.t20'))}</button>
                        </div>
                    </div>
                    <div class="cb-session-bar" id="cbSessionTabs"></div>
                    <div class="cb-search-bar" id="cbSearchBar">
                        <input type="text" id="cbSearchInput" placeholder="${esc(t('chatbot.ph.cbSearchInput'))}">
                        <span class="cb-search-nav" id="cbSearchNav"></span>
                        <button class="btn btn-ghost" id="cbSearchPrev" title="${esc(t('chatbot.title.cbSearchPrev'))}">▲</button>
                        <button class="btn btn-ghost" id="cbSearchNext" title="${esc(t('chatbot.title.cbSearchNext'))}">▼</button>
                        <button class="btn btn-ghost" id="cbSearchClose" title="${esc(t('chatbot.title.cbSearchClose'))}">✕</button>
                    </div>
                    <div class="cb-messages" id="cbMessages" role="log" aria-live="polite" aria-label="${esc(t('chatbot.aria.cbMessages'))}"></div>
                    <div class="cb-input-area" id="cbInputArea">
                        <div class="cb-attach-area" id="cbAttachArea">
                            <button class="cb-attach-btn" id="cbAttachBtn" title="${esc(t('chatbot.title.cbAttachBtn'))}">📎</button>
                            <input type="file" id="cbFileInput" accept="image/*" multiple style="display:none">
                        </div>
                        <div class="cb-input-row">
                            <textarea id="cbInput" placeholder="${esc(t('chatbot.ph.cbInput'))}"></textarea>
                            <button class="cb-mic-btn" id="cbMicBtn" title="${esc(t('chatbot.title.cbMicBtn'))}" aria-label="${esc(t('chatbot.title.cbMicBtn'))}">🎤</button>
                            <button class="cb-send-btn" id="cbSendBtn" onclick="window._cb.send()" aria-label="${esc(t('chatbot.aria.cbSendBtn'))}">➤</button>
                            <button class="cb-stop-btn" id="cbStopBtn" style="display:none" onclick="window._cb.stopStream()" aria-label="${esc(t('chatbot.aria.cbStopBtn'))}">${esc(t('chatbot.btn.cbStopBtn'))}</button>
                        </div>
                        <div class="cb-token-bar">
                            <span id="cbTokenDisplay">Tokens: 0</span>
                            <span>${esc(t('chatbot.t21'))}</span>
                        </div>
                    </div>
                </div>
                </div>

                <aside class="cb-sidebar cb-sidebar-right" aria-label="${esc(t('chatbot.t02'))}">
                    <div class="cb-character-block" id="cbCharacterBlock">
                        <p class="cb-panel-heading" style="margin-bottom:8px;">${esc(t('chatbot.t22'))}</p>
                        <div class="cb-option-row" style="margin-bottom:6px;">
                            <label>${esc(t('chatbot.t23'))}</label>
                            <label class="cb-toggle"><input type="checkbox" id="cbCharUse" checked><span class="cb-toggle-slider"></span></label>
                        </div>
                        <div class="cb-option-row" style="margin-bottom:6px;">
                            <label>${esc(t('chatbot.t24'))}</label>
                            <label class="cb-toggle"><input type="checkbox" id="cbCharAutoImage"><span class="cb-toggle-slider"></span></label>
                        </div>
                        <div class="cb-char-profile-wrap">
                            <button type="button" class="cb-char-profile-btn" id="cbCharProfileOpen" title="${esc(t('chatbot.title.cbCharProfileOpen'))}" aria-label="${esc(t('chatbot.aria.cbCharProfileOpen'))}">
                                <img id="cbCharProfileAvatar" class="cb-char-profile-avatar" alt="" width="72" height="72" decoding="async" style="display:none">
                                <span id="cbCharProfilePlaceholder" class="cb-char-profile-placeholder">👤</span>
                            </button>
                            <p class="cb-char-profile-name" id="cbCharProfileName">—</p>
                        </div>
                    </div>
                    <div class="cb-sysprompt">
                        <p class="cb-panel-heading" style="margin-bottom:8px;">${esc(t('chatbot.t25'))}</p>
                        <label class="cb-mini" style="margin-top:0;">${esc(t('chatbot.t26'))}</label>
                        <select id="cbSystemPreset" style="font-size:var(--font-size-xs);padding:6px 8px;margin-bottom:8px;width:100%;">
                            <option value="">${esc(t('chatbot.t27'))}</option>
                            <option value="__none__">${esc(t('chatbot.opt.none'))}</option>
                            <option value="default">${esc(t('chatbot.opt.default'))}</option>
                            <option value="writer">${esc(t('chatbot.opt.writer'))}</option>
                            <option value="translator">${esc(t('chatbot.opt.translator'))}</option>
                            <option value="codereview">${esc(t('chatbot.opt.codereview'))}</option>
                            <option value="summarizer">${esc(t('chatbot.opt.summarizer'))}</option>
                            <option value="tutor">${esc(t('chatbot.opt.tutor'))}</option>
                            <option value="hodulgap">${esc(t('chatbot.opt.hodulgap'))}</option>
                        </select>
                        <textarea id="cbSystemPrompt" placeholder="${esc(t('chatbot.ph.cbSystemPrompt'))}">${esc(t('chatbot.label.cbSystemPrompt'))}</textarea>
                    </div>
                </aside>
            </div>

                <div id="cbCharEditModal" class="cb-modal-root" hidden aria-hidden="true">
                    <div class="cb-modal-backdrop" id="cbCharEditBackdrop" tabindex="-1"></div>
                    <div class="cb-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="cbCharEditTitle">
                        <div class="cb-modal-header">
                            <h2 class="cb-modal-title" id="cbCharEditTitle">${esc(t('chatbot.title.cbCharProfileOpen'))}</h2>
                            <button type="button" class="cb-modal-close" id="cbCharEditClose" aria-label="${esc(t('chatbot.title.cbSearchClose'))}">×</button>
                        </div>
                        <div class="cb-modal-body cb-char-modal-body">
                            <label class="cb-mini" style="margin-top:0;">${esc(t('chatbot.t28'))}</label>
                            <select id="cbCharacterSelect" style="font-size:var(--font-size-xs);padding:6px 8px;width:100%;margin-top:4px;"></select>
                            <label class="cb-mini">${esc(t('chatbot.t29'))}</label>
                            <select id="cbCharImageModel" style="font-size:var(--font-size-xs);padding:6px 8px;width:100%;margin-top:4px;"></select>
                            <label class="cb-mini">${esc(t('chatbot.t30'))}</label>
                            <input type="text" id="cbCharName" maxlength="80">
                            <label class="cb-mini">플레이어 ({{user}})</label>
                            <input type="text" id="cbCharUserName" maxlength="80">
                            <label class="cb-mini">${esc(t('chatbot.t31'))}</label>
                            <textarea id="cbCharUserNote" rows="2"></textarea>
                            <label class="cb-mini">${esc(t('chatbot.t32'))}</label>
                            <textarea id="cbCharVisual" rows="2"></textarea>
                            <label class="cb-mini">${esc(t('chatbot.t06'))}</label>
                            <textarea id="cbCharDesc" rows="2"></textarea>
                            <label class="cb-mini">${esc(t('chatbot.t33'))}</label>
                            <textarea id="cbCharPersonality" rows="2"></textarea>
                            <label class="cb-mini">${esc(t('chatbot.t34'))}</label>
                            <textarea id="cbCharScenario" rows="2"></textarea>
                            <label class="cb-mini">${esc(t('chatbot.t35'))}</label>
                            <textarea id="cbCharFirstMes" rows="2"></textarea>
                            <label class="cb-mini">${esc(t('chatbot.t36'))}</label>
                            <div class="cb-char-row">
                                <input type="file" id="cbCharRefFile" accept="image/*" style="font-size:var(--font-size-2xs);max-width:160px;">
                                <button type="button" class="btn btn-ghost" id="cbCharRefClear" style="font-size:var(--font-size-2xs);padding:4px 8px;">${esc(t('chatbot.btn.cbCharRefClear'))}</button>
                                <img id="cbCharRefThumb" class="cb-char-ref-thumb" alt="" style="display:none;">
                            </div>
                            <div class="cb-char-row">
                                <button type="button" class="btn btn-ghost" id="cbCharSave" style="font-size:var(--font-size-xs);padding:4px 10px;">${esc(t('chatbot.btn.cbCharSave'))}</button>
                                <button type="button" class="btn btn-ghost" id="cbCharNew" style="font-size:var(--font-size-xs);padding:4px 10px;">${esc(t('chatbot.btn.cbCharNew'))}</button>
                                <button type="button" class="btn btn-ghost" id="cbCharDel" style="font-size:var(--font-size-xs);padding:4px 10px;color:var(--error);">${esc(t('chatbot.btn.cbCharDel'))}</button>
                                <button type="button" class="btn btn-ghost" id="cbCharFirstBtn" style="font-size:var(--font-size-xs);padding:4px 10px;">${esc(t('chatbot.btn.cbCharFirstBtn'))}</button>
                            </div>
                            <label class="cb-mini">${esc(t('chatbot.t37'))}</label>
                            <label class="cb-char-import-overwrite" style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:var(--font-size-xs);color:var(--text-secondary);cursor:pointer;">
                                <input type="checkbox" id="cbCharImportOverwrite" style="width:auto;margin:0;">
                                <span>${esc(t('chatbot.t38'))}</span>
                            </label>
                            <div class="cb-char-row" style="margin-top:8px;">
                                <input type="file" id="cbCharImportFile" accept=".json,application/json,.png,image/png" style="display:none">
                                <button type="button" class="btn btn-ghost" id="cbCharImportBtn" style="font-size:var(--font-size-xs);padding:4px 10px;">${esc(t('chatbot.t19'))}</button>
                                <button type="button" class="btn btn-ghost" id="cbCharExportBtn" style="font-size:var(--font-size-xs);padding:4px 10px;">${esc(t('chatbot.btn.cbCharExportBtn'))}</button>
                            </div>
                            <p style="font-size:var(--font-size-2xs);color:var(--text-tertiary);margin:6px 0 0;line-height:1.45;">${esc(t('chatbot.t39'))} <code style="font-size:1em;">karmochat_character_v1</code> ${esc(t('chatbot.t40'))}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        requestAnimationFrame(() => {
            // 모델 셀렉트
            const sel = (document.getElementById('cbModelSelect') as any);
            if (sel) {
                (Gemini as any).MODELS.gemini.forEach((m: any) => {
                    const o = document.createElement('option');
                    o.value = m.id; o.textContent = m.name;
                    if (m.isDefault) o.selected = true;
                    sel.appendChild(o);
                });
            }

            // 설정 복원
            const savedModel = Toolbox.getPref('cb_model', '');
            if (savedModel && sel) { sel.value = savedModel; }
            if (sel) sel.addEventListener('change', () => Toolbox.setPref('cb_model', sel.value));

            const surfaceSel = (document.getElementById('cbApiSurfaceSelect') as any);
            function syncWebSearchForApiSurface() {
                const v = surfaceSel instanceof HTMLSelectElement ? surfaceSel.value : ChatbotApiSurfaceUi.studio;
                const ws = (document.getElementById('cbWebSearch') as any);
                const row = ws?.closest('.cb-option-row');
                if (ws instanceof HTMLInputElement) {
                    if (v === ChatbotApiSurfaceUi.vertex) {
                        ws.checked = false;
                        ws.disabled = true;
                        if (row instanceof HTMLElement) row.style.opacity = '0.45';
                    } else {
                        ws.disabled = false;
                        if (row instanceof HTMLElement) row.style.opacity = '';
                    }
                }
            }
            if (surfaceSel instanceof HTMLSelectElement) {
                const savedSurface = Toolbox.getPref(CB_API_SURFACE_PREF_KEY, '');
                if (savedSurface === ChatbotApiSurfaceUi.vertex || savedSurface === ChatbotApiSurfaceUi.studio) {
                    surfaceSel.value = savedSurface;
                }
                surfaceSel.addEventListener('change', () => {
                    Toolbox.setPref(CB_API_SURFACE_PREF_KEY, surfaceSel.value);
                    syncWebSearchForApiSurface();
                });
                syncWebSearchForApiSurface();
            }

            // 시스템 프롬프트 프리셋 (__none__ / 직접입력 / 명명 프리셋)
            const presetSel = (document.getElementById('cbSystemPreset') as any);
            const sysPromptTa = (document.getElementById('cbSystemPrompt') as any);
            const savedPreset = Toolbox.getPref('cb_preset', '');
            function applySystemPresetUi() {
                if (!presetSel || !sysPromptTa) return;
                const v = presetSel.value;
                if (v === '__none__') {
                    sysPromptTa.value = '';
                    sysPromptTa.readOnly = true;
                    sysPromptTa.placeholder = t('chatbot.t46');
                } else {
                    sysPromptTa.readOnly = false;
                    sysPromptTa.placeholder = t('chatbot.ph.cbSystemPrompt');
                    if (window.ChatbotPrompt?.SYSTEM_PROMPT_PRESETS[v]) sysPromptTa.value = window.ChatbotPrompt?.SYSTEM_PROMPT_PRESETS[v];
                }
            }
            if (presetSel && sysPromptTa) {
                if (typeof savedPreset === 'string') {
                    const hasOpt = Array.from(presetSel.options as any[]).some((o: any) => o.value === savedPreset);
                    if (hasOpt) presetSel.value = savedPreset;
                }
                applySystemPresetUi();
                presetSel.addEventListener('change', () => {
                    Toolbox.setPref('cb_preset', presetSel.value);
                    applySystemPresetUi();
                });
            }

            // Temperature 슬라이더 표시 갱신
            const tempSlider = (document.getElementById('cbTemperature') as any);
            const tempValueEl = (document.getElementById('cbTempValue') as any);
            const savedTemp = Toolbox.getPref('cb_temperature', '');
            if (tempSlider && tempValueEl) {
                if (savedTemp !== undefined) { tempSlider.value = savedTemp; tempValueEl.textContent = savedTemp; }
                tempSlider.addEventListener('input', () => { tempValueEl.textContent = tempSlider.value; Toolbox.setPref('cb_temperature', tempSlider.value); });
            }

            const safetySel = document.getElementById('cbSafetyThreshold');
            if (safetySel instanceof HTMLSelectElement && typeof Gemini !== 'undefined') {
                const levels = Gemini.GEMINI_SAFETY_LEVELS || [];
                const defaultThreshold = Gemini.DEFAULT_GEMINI_SAFETY_THRESHOLD || 'BLOCK_ONLY_HIGH';
                safetySel.innerHTML = levels
                    .map(level => `<option value="${level.value}">${Toolbox.escapeHtml(level.label)}</option>`)
                    .join('');
                const savedSafety = Toolbox.getPref('cb_safety_threshold', '') || defaultThreshold;
                safetySel.value = savedSafety;
                if (!safetySel.value && levels.length > 0) safetySel.value = defaultThreshold;
                safetySel.addEventListener('change', () => {
                    Toolbox.setPref('cb_safety_threshold', safetySel.value);
                });
            }

            // 이미지 첨부
            const attachBtn = (document.getElementById('cbAttachBtn') as any);
            const fileInput = (document.getElementById('cbFileInput') as any);
            const inputArea = (document.getElementById('cbInputArea') as any);
            if (attachBtn && fileInput) {
                attachBtn.onclick = () => fileInput.click();
                fileInput.onchange = async () => {
                    for (const f of fileInput.files) {
                        if (f.type.startsWith('image/')) addPendingImage(await fileToBase64(f));
                    }
                    fileInput.value = '';
                };
            }
            if (inputArea) {
                inputArea.ondragover = (e: any) => { e.preventDefault(); inputArea.classList.add('drag-over'); };
                inputArea.ondragleave = () => inputArea.classList.remove('drag-over');
                inputArea.ondrop = async (e: any) => {
                    e.preventDefault(); inputArea.classList.remove('drag-over');
                    for (const f of e.dataTransfer.files) {
                        if (f.type.startsWith('image/')) addPendingImage(await fileToBase64(f));
                    }
                };
            }

            // Enter 키 + 클립보드 이미지 붙여넣기
            const chatInput = (document.getElementById('cbInput') as any);
            if (chatInput) {
                chatInput.addEventListener('keydown', (e: any) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (window as any)._cb.send();
                    }
                });
                chatInput.addEventListener('paste', async (e: any) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of items) {
                        if (item.type.startsWith('image/')) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (file) addPendingImage(await fileToBase64(file));
                        }
                    }
                });
            }

            // 음성 입력 (Web Speech API)
            const micBtn = (document.getElementById('cbMicBtn') as any);
            if (micBtn) {
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (SpeechRecognition) {
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'ko-KR';
                    recognition.interimResults = true;
                    recognition.continuous = false;
                    let isRecording = false;
                    let finalTranscript = '';

                    micBtn.addEventListener('click', () => {
                        if (isRecording) { recognition.stop(); return; }
                        finalTranscript = '';
                        recognition.start();
                    });
                    recognition.onstart = () => {
                        isRecording = true;
                        micBtn.classList.add('recording');
                        micBtn.title = t('chatbot.t47');
                    };
                    recognition.onend = () => {
                        isRecording = false;
                        micBtn.classList.remove('recording');
                        micBtn.title = t('chatbot.title.cbMicBtn');
                        if (finalTranscript && chatInput) {
                            chatInput.value += (chatInput.value ? ' ' : '') + finalTranscript;
                            chatInput.focus();
                        }
                    };
                    recognition.onresult = (e: any) => {
                        let interim = '';
                        for (let i = e.resultIndex; i < e.results.length; i++) {
                            if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
                            else interim += e.results[i][0].transcript;
                        }
                    };
                    recognition.onerror = (e: any) => {
                        if (e.error !== 'aborted') Toolbox.showToast(t('chatbot.t48') + e.error, 'error');
                    };
                } else {
                    micBtn.style.display = 'none';
                }
            }

            // 다중 세션 초기화
            const index = getSessionsIndex();
            if (index.length === 0) {
                currentSessionId = createNewSession(t('chatbot.t49'));
            } else {
                currentSessionId = index[index.length - 1].id;
            }
            renderSessionTabs();

            // 세션 데이터 먼저 로드 → 캐릭터 선택 복원에 사용
            const msgs = (document.getElementById('cbMessages') as any);
            const sessionLoaded = msgs && loadSession(currentSessionId);
            window.ChatbotCharacters?.initCharacterUi({
                saveSession,
                getChatHistoryLength: () => chatHistory.length,
                appendBotFirstMes: (fm: any) => {
                    appendMsg('bot', fm, false);
                    chatHistory.push({ role: 'model', parts: [{ text: fm }] });
                    saveSession();
                },
                getLastLoadedSessionCharacterId: () => lastLoadedSessionCharacterId
            });
            if (msgs) {
                if (sessionLoaded && chatHistory.length > 0) {
                    chatHistory.forEach((msg: any) => {
                        const role = msg.role === 'user' ? 'user' : 'bot';
                        const text = msg.parts?.[0]?.text || '';
                        if (text) appendMsg(role, text, false);
                    });
                } else {
                    appendMsg('bot', t('chatbot.t42'));
                }
                syncCharacterSelectAfterSessionLoad();
                msgs.scrollTop = msgs.scrollHeight;
            }

            // 대화 검색
            const searchToggle = (document.getElementById('cbSearchToggle') as any);
            const searchBar = (document.getElementById('cbSearchBar') as any);
            const searchInput = (document.getElementById('cbSearchInput') as any);
            const searchNav = (document.getElementById('cbSearchNav') as any);
            const searchPrev = (document.getElementById('cbSearchPrev') as any);
            const searchNext = (document.getElementById('cbSearchNext') as any);
            const searchClose = (document.getElementById('cbSearchClose') as any);
            if (searchToggle && searchBar && searchInput) {
                let searchResults: any[] = [];
                let searchIdx = -1;

                function toggleSearch() {
                    const open = searchBar.classList.toggle('open');
                    if (open) { searchInput.focus(); }
                    else { clearHighlights(); searchInput.value = ''; searchNav.textContent = ''; }
                }

                function clearHighlights() {
                    if (!msgs) return;
                    msgs.querySelectorAll('.cb-search-highlight').forEach((el: any) => {
                        const parent = el.parentNode;
                        parent.replaceChild(document.createTextNode(el.textContent), el);
                        parent.normalize();
                    });
                    searchResults = [];
                    searchIdx = -1;
                }

                function doSearch() {
                    clearHighlights();
                    const q = searchInput.value.trim();
                    if (!q || !msgs) { searchNav.textContent = ''; return; }
                    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    const walker = document.createTreeWalker(msgs, NodeFilter.SHOW_TEXT);
                    const matches: any[] = [];
                    while (walker.nextNode()) {
                        const node = walker.currentNode;
                        if ((node.parentElement as any)?.closest('pre, code, .cb-code-header')) continue;
                        if (regex.test(node.textContent || '')) matches.push(node);
                        regex.lastIndex = 0;
                    }
                    matches.forEach((node: any) => {
                        const text = node.textContent || '';
                        const parts = text.split(regex);
                        if (parts.length <= 1) return;
                        const frag = document.createDocumentFragment();
                        let m;
                        regex.lastIndex = 0;
                        let lastIdx = 0;
                        while ((m = regex.exec(text)) !== null) {
                            if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
                            const mark = document.createElement('mark');
                            mark.className = 'cb-search-highlight';
                            mark.textContent = m[0];
                            frag.appendChild(mark);
                            lastIdx = regex.lastIndex;
                        }
                        if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
                        (node.parentNode as any)?.replaceChild(frag, node);
                    });
                    searchResults = Array.from(msgs.querySelectorAll('.cb-search-highlight'));
                    searchIdx = searchResults.length > 0 ? 0 : -1;
                    updateSearchNav();
                }

                function updateSearchNav() {
                    if (searchResults.length === 0) { searchNav.textContent = t('chatbot.t50'); return; }
                    searchNav.textContent = `${searchIdx + 1} / ${searchResults.length}`;
                    searchResults.forEach((el: any, i: number) => el.classList.toggle('current', i === searchIdx));
                    searchResults[searchIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                function navigate(dir: any) {
                    if (searchResults.length === 0) return;
                    searchIdx = (searchIdx + dir + searchResults.length) % searchResults.length;
                    updateSearchNav();
                }

                searchToggle.addEventListener('click', toggleSearch);
                searchClose.addEventListener('click', toggleSearch);
                searchInput.addEventListener('input', doSearch);
                searchPrev.addEventListener('click', () => navigate(-1));
                searchNext.addEventListener('click', () => navigate(1));
                searchInput.addEventListener('keydown', (e: any) => {
                    if (e.key === 'Enter') { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); }
                    if (e.key === 'Escape') toggleSearch();
                });

            }

            // 단축키 안내 버튼
            const shortcutsBtn = (document.getElementById('cbShortcutsBtn') as any);
            const shortcutsOverlay = (document.getElementById('cbShortcutsOverlay') as any);
            if (shortcutsBtn && shortcutsOverlay) {
                shortcutsBtn.addEventListener('click', () => shortcutsOverlay.classList.toggle('open'));
                shortcutsOverlay.addEventListener('click', (e: any) => {
                    if (e.target === shortcutsOverlay) shortcutsOverlay.classList.remove('open');
                });
            }

            // 글로벌 키보드 단축키 (단일 리스너)
            document.addEventListener('keydown', (e: any) => {
                const chatEl = document.querySelector('.cb-chat') as any;
                if (!chatEl || chatEl.offsetParent === null) return;

                if (e.ctrlKey && e.key === 'f') {
                    e.preventDefault();
                    const sb = (document.getElementById('cbSearchBar') as any);
                    const si = (document.getElementById('cbSearchInput') as any);
                    if (sb && si) {
                        if (!sb.classList.contains('open')) sb.classList.add('open');
                        si.focus();
                    }
                }
                if (e.ctrlKey && e.key === '/') {
                    e.preventDefault();
                    shortcutsOverlay?.classList.toggle('open');
                }
                if (e.ctrlKey && e.key === 'n') {
                    e.preventDefault();
                    const idx = getSessionsIndex();
                    if (idx.length >= 10) { Toolbox.showToast(t('chatbot.t51'), 'error'); return; }
                    const nid = createNewSession(t('chatbot.chatN', { n: idx.length + 1 }));
                    switchSession(nid);
                }
                if (e.key === 'Escape') {
                    shortcutsOverlay?.classList.remove('open');
                }
            });

            // 랜덤 생성기 → 이야기 만들기 연동
            const chatbotPage = (document.getElementById('page-chatbot') as any);
            if (chatbotPage) {
                const checkStoryKeywords = function () {
                    try {
                        const raw = sessionStorage.getItem('toolbox_chatbot_story_keywords');
                        if (raw) {
                            sessionStorage.removeItem('toolbox_chatbot_story_keywords');
                            const keywords = JSON.parse(raw);
                            if (Array.isArray(keywords) && keywords.length > 0) {
                                const input = (document.getElementById('cbInput') as any);
                                const presetSel = (document.getElementById('cbSystemPreset') as any);
                                const sysPromptTa = (document.getElementById('cbSystemPrompt') as any);
                                if (presetSel && sysPromptTa && window.ChatbotPrompt?.SYSTEM_PROMPT_PRESETS.writer) {
                                    presetSel.value = 'writer';
                                    Toolbox.setPref('cb_preset', 'writer');
                                    applySystemPresetUi();
                                }
                                if (input) {
                                    input.value = t('chatbot.t52') + keywords.join(', ');
                                    input.focus();
                                    Toolbox.showToast(t('chatbot.t53'));
                                }
                            }
                        }
                    } catch (err) {}
                };
                const obs = new MutationObserver(checkStoryKeywords);
                obs.observe(chatbotPage, { attributes: true, attributeFilter: ['class'] });
                if (chatbotPage.classList.contains('active')) checkStoryKeywords();
            }
        });
    }

    const { displayTextForStream, extractKarmoImage, appendCharacterImageAfterMessage } = (window.ChatbotKarmoImage || {}) as any;

    /** 메모리 요약 블록 제거 후 KARMO_IMAGE 파싱 (스트리밍 send / regenerate 공통) */
    function parseStreamResponseText(fullText: any, useMemory: any) {
        let body = fullText;
        let newSummary;
        if (useMemory) {
            const m = body.match(/\{\{\{(.*?)\}\}\}/s);
            if (m) {
                newSummary = m[1].trim();
                body = body.replace(/\{\{\{.*?\}\}\}/s, '').trim();
            }
        }
        const imgParsed = extractKarmoImage(body);
        return { responseText: imgParsed.cleanText, imgParsed, newSummary };
    }

    const renderMarkdown: any = window.ChatbotMarkdown?.renderMarkdown ?? ((s: string) => s);

    /* ===== 헬퍼 ===== */
    function appendMsg(role: any, text: any, isError = false) {
        const msgs = (document.getElementById('cbMessages') as any);
        if (!msgs) return;
        const wrap = document.createElement('div');
        wrap.className = 'cb-msg-wrap';
        const div = document.createElement('div');
        div.className = `cb-msg cb-msg-${role}` + (isError ? ' cb-msg-error' : '');
        if (role === 'bot' && !isError) {
            div.innerHTML = renderMarkdown(text);
        } else {
            div.textContent = text;
        }
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-ghost cb-msg-copy';
        copyBtn.type = 'button';
        copyBtn.textContent = t('chatbot.t54');
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(text).then(() => Toolbox.showToast(t('chatbot.t55'))).catch(() => {});
        };
        wrap.appendChild(div);
        wrap.appendChild(copyBtn);
        if (role === 'bot' && !isError && chatHistory.length > 0) {
            const regen = document.createElement('button');
            regen.className = 'btn btn-ghost';
            regen.textContent = t('chatbot.t56');
            regen.onclick = () => (window as any)._cb.regenerate();
            wrap.appendChild(regen);
        }
        msgs.appendChild(wrap);
        if (role === 'bot' && !isError && typeof Prism !== 'undefined') {
            div.querySelectorAll('pre code[class*="language-"]').forEach((el: any) => Prism!.highlightElement(el));
        }
        msgs.scrollTop = msgs.scrollHeight;
    }

    function updateTokens(usage: any) {
        if (!usage) return;
        const total = usage.totalTokenCount || 0;
        const display = (document.getElementById('cbTokenDisplay') as any);
        if (display) {
            display.textContent = `Tokens: ${total.toLocaleString()}`;
            display.style.color = 'var(--text-tertiary)';
        }
    }

    /* ===== 스트리밍 봇 메시지 헬퍼 ===== */
    function appendStreamMsg() {
        const msgs = (document.getElementById('cbMessages') as any);
        if (!msgs) return null;
        const wrap = document.createElement('div');
        wrap.className = 'cb-msg-wrap';
        const div = document.createElement('div');
        div.className = 'cb-msg cb-msg-bot';
        div.innerHTML = '<span class="cb-cursor-blink">▌</span>';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-ghost cb-msg-copy';
        copyBtn.type = 'button';
        copyBtn.textContent = t('chatbot.t54');
        wrap.appendChild(div);
        wrap.appendChild(copyBtn);
        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
        return { div, copyBtn, wrap };
    }

    function finalizeStreamMsg(el: any, fullText: any) {
        if (!el) return;
        el.div.innerHTML = renderMarkdown(fullText);
        if (typeof Prism !== 'undefined') {
            el.div.querySelectorAll('pre code[class*="language-"]').forEach((c: any) => Prism!.highlightElement(c));
        }
        el.copyBtn.onclick = () => {
            navigator.clipboard.writeText(fullText).then(() => Toolbox.showToast(t('chatbot.t55'))).catch(() => {});
        };
        const regen = document.createElement('button');
        regen.className = 'btn btn-ghost';
        regen.textContent = t('chatbot.t56');
        regen.onclick = () => (window as any)._cb.regenerate();
        el.wrap.appendChild(regen);
    }

    let currentStreamAbort: AbortController | null = null;

    /* ===== 액션 ===== */
    (window as any)._cb = {
        async send() {
            const input = (document.getElementById('cbInput') as any);
            const text = input?.value.trim();
            if (!text) return;

            const apiSurface = getChatbotApiSurfaceUi();
            if (chatbotUiSurfaceToPackage(apiSurface) === 'vertex') {
                if (!(Gemini as any).requireVertexApiKey()) return;
                if (!(Toolbox.getPref('ig_vertex_project_id', '') || '').trim()) {
                    Toolbox.showToast(t('chatbot.t57'), 'error');
                    return;
                }
            } else if (!(Gemini as any).requireApiKey()) {
                return;
            }

            appendMsg('user', text + (pendingImages.length ? ` ${t('chatbot.pendingImages', { n: pendingImages.length })}` : ''));
            input.value = '';

            const parts: any[] = [{ text }];
            pendingImages.forEach((img: any) => {
                parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
            });
            pendingImages = [];
            renderAttachThumbs();
            chatHistory.push({ role: 'user', parts });

            const useMemory = (document.getElementById('cbMemory') as any)?.checked;
            const useWebSearch = (document.getElementById('cbWebSearch') as any)?.checked;
            const systemPrompt = window.ChatbotPrompt?.assembleSystemPrompt({ useMemory, conversationSummary });

            const modelSel = (document.getElementById('cbModelSelect') as any);
            const modelId = modelSel?.value || (Gemini as any).getDefaultModel('gemini');
            const tempInput = (document.getElementById('cbTemperature') as any);
            const temperature = tempInput ? parseFloat(tempInput.value) : 0.8;
            const safetyInput = document.getElementById('cbSafetyThreshold') as HTMLInputElement | null;
            const safetyThreshold = safetyInput?.value || Gemini?.DEFAULT_GEMINI_SAFETY_THRESHOLD;

            const streamEl = appendStreamMsg() as any;
            currentStreamAbort = new AbortController();
            const sendBtn = (document.getElementById('cbSendBtn') as any);
            const stopBtn = (document.getElementById('cbStopBtn') as any);
            if (sendBtn) sendBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';

            try {
                const stream =
                    chatbotUiSurfaceToPackage(apiSurface) === 'vertex'
                        ? await (Gemini as any).callVertexChatStream(chatHistory, systemPrompt, modelId, {
                              temperature,
                              safetyThreshold,
                              signal: currentStreamAbort.signal
                          })
                        : await (Gemini as any).callChatStream(chatHistory, systemPrompt, modelId, {
                              webSearch: useWebSearch,
                              temperature,
                              safetyThreshold,
                              signal: currentStreamAbort.signal
                          });

                let fullText = '';
                let lastUsage = null;
                let renderPending = false;
                for await (const chunk of stream.chunks()) {
                    fullText += chunk.text;
                    if (chunk.usage) lastUsage = chunk.usage;
                    if (!renderPending) {
                        renderPending = true;
                        requestAnimationFrame(() => {
                            renderPending = false;
                            streamEl.div.innerHTML = renderMarkdown(displayTextForStream(fullText)) + '<span class="cb-cursor-blink">▌</span>';
                            const msgs = (document.getElementById('cbMessages') as any);
                            if (msgs) msgs.scrollTop = msgs.scrollHeight;
                        });
                    }
                }

                const { responseText, imgParsed, newSummary } = parseStreamResponseText(fullText, useMemory);
                if (newSummary !== undefined) conversationSummary = newSummary;

                const autoImgOn = (document.getElementById('cbCharAutoImage') as any)?.checked;
                const charSel = (document.getElementById('cbCharacterSelect') as any);
                const charForImg = charSel?.value
                    ? window.ChatbotCharacters?.getCharacterById(charSel.value)
                    : null;

                finalizeStreamMsg(streamEl, responseText);
                updateTokens(lastUsage);

                chatHistory.push({ role: 'model', parts: [{ text: responseText }] });
                saveSession();
                Toolbox.recordUsage('chat', lastUsage?.totalTokenCount || 0);
                Mdd.linePreset('success', { mood: 'happy', msg: t('chatbot.t58') });

                if (autoImgOn && imgParsed.spec?.show && charForImg) {
                    void appendCharacterImageAfterMessage(streamEl.wrap, charForImg, imgParsed.spec);
                }

            } catch (e: any) {
                if (streamEl.wrap.parentNode) streamEl.wrap.remove();
                if (e.message !== t('chatbot.t59')) {
                    appendMsg('bot', t('chatbot.error', { why: e.message }), true);
                    Toolbox.showToast(e.message || '오류', 'error', e);
                    Mdd.linePreset('error', { msg: t('chatbot.t60') });
                }
                console.error('Chat Error:', e);
            } finally {
                currentStreamAbort = null;
                if (sendBtn) sendBtn.style.display = '';
                if (stopBtn) stopBtn.style.display = 'none';
            }
        },

        stopStream() {
            if (currentStreamAbort) {
                currentStreamAbort.abort();
                Toolbox.showToast(t('chatbot.t61'));
            }
        },

        async regenerate() {
            if (chatHistory.length < 2) return;
            const lastModel = chatHistory[chatHistory.length - 1];
            if (lastModel?.role === 'model') {
                chatHistory.pop();
            }
            const msgs = (document.getElementById('cbMessages') as any);
            if (msgs) {
                const wraps = msgs.querySelectorAll('.cb-msg-wrap');
                const last = wraps[wraps.length - 1];
                if (last) last.remove();
            }
            saveSession();

            const lastUser = chatHistory[chatHistory.length - 1];
            if (!lastUser || lastUser.role !== 'user') return;

            const apiSurface = getChatbotApiSurfaceUi();
            if (chatbotUiSurfaceToPackage(apiSurface) === 'vertex') {
                if (!(Gemini as any).requireVertexApiKey()) return;
                if (!(Toolbox.getPref('ig_vertex_project_id', '') || '').trim()) {
                    Toolbox.showToast(t('chatbot.t57'), 'error');
                    return;
                }
            } else if (!(Gemini as any).requireApiKey()) {
                return;
            }

            const useMemory = (document.getElementById('cbMemory') as any)?.checked;
            const useWebSearch = (document.getElementById('cbWebSearch') as any)?.checked;
            const systemPrompt = window.ChatbotPrompt?.assembleSystemPrompt({ useMemory, conversationSummary });

            const modelSel = (document.getElementById('cbModelSelect') as any);
            const modelId = modelSel?.value || (Gemini as any).getDefaultModel('gemini');
            const tempInput = (document.getElementById('cbTemperature') as any);
            const temperature = tempInput ? parseFloat(tempInput.value) : 0.8;
            const safetyInput = document.getElementById('cbSafetyThreshold') as HTMLInputElement | null;
            const safetyThreshold = safetyInput?.value || Gemini?.DEFAULT_GEMINI_SAFETY_THRESHOLD;

            const streamEl = appendStreamMsg() as any;
            currentStreamAbort = new AbortController();
            const sendBtn = (document.getElementById('cbSendBtn') as any);
            const stopBtn = (document.getElementById('cbStopBtn') as any);
            if (sendBtn) sendBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';

            try {
                const stream =
                    chatbotUiSurfaceToPackage(apiSurface) === 'vertex'
                        ? await (Gemini as any).callVertexChatStream(chatHistory, systemPrompt, modelId, {
                              temperature,
                              safetyThreshold,
                              signal: currentStreamAbort.signal
                          })
                        : await (Gemini as any).callChatStream(chatHistory, systemPrompt, modelId, {
                              webSearch: useWebSearch,
                              temperature,
                              safetyThreshold,
                              signal: currentStreamAbort.signal
                          });
                let fullText = '';
                let lastUsage = null;
                let renderPending2 = false;
                for await (const chunk of stream.chunks()) {
                    fullText += chunk.text;
                    if (chunk.usage) lastUsage = chunk.usage;
                    if (!renderPending2) {
                        renderPending2 = true;
                        requestAnimationFrame(() => {
                            renderPending2 = false;
                            streamEl.div.innerHTML = renderMarkdown(displayTextForStream(fullText)) + '<span class="cb-cursor-blink">▌</span>';
                            const msgsEl = (document.getElementById('cbMessages') as any);
                            if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
                        });
                    }
                }
                const { responseText, imgParsed: imgParsedR, newSummary: newSummaryR } = parseStreamResponseText(fullText, useMemory);
                if (newSummaryR !== undefined) conversationSummary = newSummaryR;

                const autoImgR = (document.getElementById('cbCharAutoImage') as any)?.checked;
                const charSelR = (document.getElementById('cbCharacterSelect') as any);
                const charForImgR = charSelR?.value
                    ? window.ChatbotCharacters?.getCharacterById(charSelR.value)
                    : null;
                finalizeStreamMsg(streamEl, responseText);
                updateTokens(lastUsage);
                chatHistory.push({ role: 'model', parts: [{ text: responseText }] });
                saveSession();
                Toolbox.recordUsage('chat', lastUsage?.totalTokenCount || 0);
                Mdd.linePreset('success', { mood: 'happy', msg: t('chatbot.t62') });
                if (autoImgR && imgParsedR.spec?.show && charForImgR) {
                    void appendCharacterImageAfterMessage(streamEl.wrap, charForImgR, imgParsedR.spec);
                }
            } catch (e: any) {
                if (streamEl.wrap.parentNode) streamEl.wrap.remove();
                if (e.message !== t('chatbot.t59')) {
                    appendMsg('bot', t('chatbot.error', { why: e.message }), true);
                    Toolbox.showToast(e.message || '오류', 'error', e);
                }
            } finally {
                currentStreamAbort = null;
                if (sendBtn) sendBtn.style.display = '';
                if (stopBtn) stopBtn.style.display = 'none';
            }
        },

        clearChat() {
            chatHistory = [];
            conversationSummary = '';
            pendingImages = [];
            renderAttachThumbs();
            if (currentSessionId) {
                try { sessionStorage.removeItem(CHATBOT_SESSION_PREFIX + currentSessionId); } catch (e: any) {}
            }
            const msgs = (document.getElementById('cbMessages') as any);
            if (msgs) {
                msgs.innerHTML = '';
                appendMsg('bot', t('chatbot.t63'));
            }
            Toolbox.showToast(t('chatbot.t64'));
            Mdd.linePreset('tool_run', { mood: 'idle', msg: t('chatbot.t65') });
        },

        importChat() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt,.json';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    let imported = [];
                    if (file.name.endsWith('.json')) {
                        const data = JSON.parse(text);
                        if (Array.isArray(data)) imported = data;
                        else throw new Error(t('chatbot.err.66'));
                    } else {
                        const blocks = text.split(/\n\n/).filter(b => b.trim());
                        for (const block of blocks) {
                            const m = block.match(/^\[(You|AI)\]\n([\s\S]*)$/);
                            if (m) {
                                imported.push({
                                    role: m[1] === 'You' ? 'user' : 'model',
                                    parts: [{ text: m[2] }]
                                });
                            }
                        }
                    }
                    if (imported.length === 0) { Toolbox.showToast(t('chatbot.t67'), 'error'); return; }
                    const sessionName = file.name.replace(/\.[^.]+$/, '');
                    const newId = createNewSession(sessionName);
                    currentSessionId = newId;
                    chatHistory = imported;
                    saveSession();
                    renderSessionTabs();
                    const msgs = (document.getElementById('cbMessages') as any);
                    if (msgs) {
                        msgs.innerHTML = '';
                        chatHistory.forEach(msg => {
                            const role = msg.role === 'user' ? 'user' : 'bot';
                            const text = msg.parts?.[0]?.text || '';
                            if (text) appendMsg(role, text, false);
                        });
                        msgs.scrollTop = msgs.scrollHeight;
                    }
                    Toolbox.showToast(t('chatbot.imported', { n: imported.length }));
                } catch (e: any) {
                    Toolbox.showToast(t('chatbot.t68') + e.message, 'error');
                }
            };
            input.click();
        },

        exportChat(format = 'txt') {
            if (chatHistory.length === 0) {
                Toolbox.showToast(t('chatbot.t69'), 'error');
                return;
            }
            const date = new Date().toISOString().slice(0, 10);
            let blob, filename;
            if (format === 'json') {
                blob = new Blob([JSON.stringify(chatHistory, null, 2)], { type: 'application/json;charset=utf-8' });
                filename = `chat-export-${date}.json`;
            } else {
                const lines = chatHistory.map(m => {
                    const role = m.role === 'user' ? 'You' : 'AI';
                    const text = m.parts?.[0]?.text || '';
                    return `[${role}]\n${text}`;
                });
                blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
                filename = `chat-export-${date}.txt`;
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
            Toolbox.showToast(t('chatbot.exported', { format: format.toUpperCase() }));
        }
    };

    /* ===== 위젯 등록 ===== */
    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta('chatbot'),
        tabs: [
            {
                id: 'chatbot-main',
                label: t('chatbot.tab.main', undefined, '채팅'),
                /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
                build: function (container: HTMLElement): void {
                    void loadNamespace('chatbot').then(function () {
                        buildChat(container);
                    });
                }
            }
        ]
    });
})();
