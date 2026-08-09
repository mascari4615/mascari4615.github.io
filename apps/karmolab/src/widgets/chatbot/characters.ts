import { t } from '../../lib/i18n';

/** 캐릭터 저장소·폼·모달 (chatbot.js에서 세션·전송과 연동) */
(function () {
    type Char = ChatbotCharacter & {
        name?: string;
        userName?: string;
        userNote?: string;
        visualDescription?: string;
        description?: string;
        personality?: string;
        scenario?: string;
        firstMes?: string;
        referenceImageDataUrl?: string;
    };
    type CharUiDeps = {
        saveSession?: () => void;
        getChatHistoryLength?: () => number;
        appendBotFirstMes?: (m: string) => void;
        getLastLoadedSessionCharacterId?: () => string | null | undefined;
    };

    function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
        return document.getElementById(id) as T | null;
    }

    let cbCharModalEscBound = false;
    let cbCharModalTabBound = false;
    let charModalPreviousFocus: Element | null = null;

    const CHARACTERS_KEY = 'karmolab_chatbot_characters_v1';
    function defaultCharacterSeed(): Char {
        return {
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: t('chatbot.t71'),
            userName: t('chatbot.t72'),
            userNote: '',
            visualDescription: '',
            description: '',
            personality: '',
            scenario: '',
            firstMes: '',
            referenceImageDataUrl: ''
        };
    }

    /** SillyTavern Character Card V2/V3 `data` 또는 이 위젯 내보내기 JSON → 내부 캐릭터 객체 (항상 새 id) */
    function mapImportedJsonToCharacter(obj: Record<string, unknown> | null | undefined): Char {
        if (!obj || typeof obj !== 'object') throw new Error(t('chatbot.err.73'));
        const str = (x: unknown): string => (x == null ? '' : String(x)).trim();
        if (obj.spec === 'karmochat_character_v1' && obj.data && typeof obj.data === 'object') {
            const d = obj.data as Record<string, unknown>;
            return {
                id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                name: str(d.name) || '가져온 캐릭터',
                userName: str(d.userName) || '사용자',
                userNote: str(d.userNote),
                visualDescription: str(d.visualDescription),
                description: str(d.description),
                personality: str(d.personality),
                scenario: str(d.scenario),
                firstMes: str(d.firstMes),
                referenceImageDataUrl: typeof d.referenceImageDataUrl === 'string' && d.referenceImageDataUrl.startsWith('data:')
                    ? d.referenceImageDataUrl
                    : ''
            };
        }
        let d = obj.data as Record<string, unknown> | undefined;
        if (!d || typeof d !== 'object') {
            if (obj.name != null || obj.description != null || obj.personality != null) d = obj as Record<string, unknown>;
        }
        if (!d || typeof d !== 'object') throw new Error(t('chatbot.err.74'));
        const name = str(d.name) || '가져온 캐릭터';
        let description = str(d.description);
        const sp = str(d.system_prompt);
        if (sp) description += (description ? '\n\n' : '') + '[시스템 프롬프트]\n' + sp;
        let scenario = str(d.scenario);
        const mesEx = str(d.mes_example);
        if (mesEx) scenario += (scenario ? '\n\n' : '') + '[대화 예시]\n' + mesEx;
        const notes = [str(d.creator_notes), str(d.post_history_instructions)].filter(Boolean).join('\n\n');
        let firstMes = str(d.first_mes || d.firstMes);
        if (!firstMes && Array.isArray(d.alternate_greetings) && d.alternate_greetings.length) {
            firstMes = str(d.alternate_greetings[0]);
        }
        let visualDescription = str(d.appearance);
        if (!visualDescription && d.extensions && typeof d.extensions === 'object') {
            const ext = d.extensions as Record<string, unknown>;
            visualDescription = str(ext.portrait || ext.face || '');
        }
        return {
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name,
            userName: t('chatbot.t72'),
            userNote: notes,
            visualDescription,
            description,
            personality: str(d.personality),
            scenario,
            firstMes,
            referenceImageDataUrl: ''
        };
    }

    function exportCurrentCharacterToJsonFile(): void {
        const ch = readCharacterFromForm();
        if (!ch) {
            Toolbox.showToast!(t('chatbot.t75'), 'error');
            return;
        }
        const exportObj = {
            spec: 'karmochat_character_v1',
            exportedAt: new Date().toISOString(),
            data: {
                name: ch.name,
                userName: ch.userName,
                userNote: ch.userNote,
                visualDescription: ch.visualDescription,
                description: ch.description,
                personality: ch.personality,
                scenario: ch.scenario,
                firstMes: ch.firstMes,
                referenceImageDataUrl: ch.referenceImageDataUrl || ''
            }
        };
        const safe = (ch.name || 'character').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60);
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `karmochat-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        Toolbox.showToast!(t('chatbot.t76'));
    }

    async function zlibInflateZtxChunk(compressed: Uint8Array): Promise<Uint8Array> {
        if (typeof DecompressionStream === 'undefined') throw new Error(t('chatbot.err.77'));
        const ds = new DecompressionStream('deflate');
        const buf = await new Response(new Blob([compressed as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(buf);
    }

    /** SillyTavern 등 PNG의 tEXt/zTXt `chara` 청크 → 원본 JSON 객체 */
    async function extractCharaObjectFromPngBuffer(buffer: ArrayBuffer): Promise<Record<string, unknown> | null> {
        const view = new DataView(buffer);
        if (buffer.byteLength < 24) return null;
        if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) return null;
        let offset = 8;
        const decoder = new TextDecoder();
        while (offset + 12 <= buffer.byteLength) {
            const len = view.getUint32(offset);
            const type = String.fromCharCode(
                view.getUint8(offset + 4), view.getUint8(offset + 5),
                view.getUint8(offset + 6), view.getUint8(offset + 7)
            );
            const dataOffset = offset + 8;
            if (len < 0 || len > buffer.byteLength || dataOffset + len > buffer.byteLength) break;
            if (type === 'tEXt' && len > 0) {
                const chunk = new Uint8Array(buffer, dataOffset, len);
                let i = 0;
                while (i < chunk.length && chunk[i] !== 0) i++;
                const keyword = decoder.decode(chunk.slice(0, i));
                const text = decoder.decode(chunk.slice(i + 1));
                if (keyword.toLowerCase() === 'chara') {
                    try {
                        const jsonStr = atob(text.replace(/\s/g, ''));
                        return JSON.parse(jsonStr) as Record<string, unknown>;
                    } catch (_) {}
                }
            }
            if (type === 'zTXt' && len > 2) {
                const chunk = new Uint8Array(buffer, dataOffset, len);
                let i = 0;
                while (i < chunk.length && chunk[i] !== 0) i++;
                const keyword = decoder.decode(chunk.slice(0, i));
                const compMethod = chunk[i + 1];
                const compressed = chunk.slice(i + 2);
                if (keyword.toLowerCase() === 'chara' && compMethod === 0 && compressed.length) {
                    try {
                        const inflated = await zlibInflateZtxChunk(compressed);
                        const jsonStr = decoder.decode(inflated);
                        return JSON.parse(jsonStr) as Record<string, unknown>;
                    } catch (_) {}
                }
            }
            offset += 12 + len;
        }
        return null;
    }

    async function parseCharacterImportFile(buffer: ArrayBuffer): Promise<Record<string, unknown>> {
        const u8 = new Uint8Array(buffer);
        if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
            const obj = await extractCharaObjectFromPngBuffer(buffer);
            if (obj) return obj;
            throw new Error(t('chatbot.err.78'));
        }
        const text = new TextDecoder('utf-8').decode(buffer);
        return JSON.parse(text) as Record<string, unknown>;
    }

    function loadCharacterList(): Char[] {
        try {
            const raw = localStorage.getItem(CHARACTERS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
    }

    function saveCharacterList(list: Char[]): void {
        try {
            localStorage.setItem(CHARACTERS_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('saveCharacterList', e);
            Toolbox.showToast!(t('chatbot.t79'), 'error');
        }
    }

    /** imagegen CHARACTER_PRESETS(witch / alisa / ling)와 동일 컨셉 — id 기준으로 없을 때만 병합 */
    function getBuiltinMascotCharacters(): Char[] {
        try {
            const b = window.KarmoWorld?.bindings?.chatbot?.characters as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(b) && b.length) {
                const out = b.map(x => ({
                    id: String(x.chatbotId ?? ''),
                    name: x.name as string | undefined,
                    userName: x.userName as string | undefined,
                    userNote: x.userNote as string | undefined,
                    visualDescription: x.visualDescription as string | undefined,
                    description: x.description as string | undefined,
                    personality: x.personality as string | undefined,
                    scenario: x.scenario as string | undefined,
                    firstMes: x.firstMes as string | undefined,
                    referenceImageDataUrl: ''
                } as Char)).filter(x => x.id && x.name);
                if (out.length) return out;
            }
        } catch (_) {}
        return [
            {
                id: 'c_mascot_yon',
                name: t('chatbot.t80'),
                userName: t('chatbot.t81'),
                userNote: t('chatbot.t82'),
                visualDescription: 'Young adult witch Yawn, very slender petite, messy orange hair, half-lidded sleepy eyes, short thick eyebrows (maro-mayu), round glasses, slight blush, drooping nightcap, large fluffy sleeping earmuffs with orange spiral pattern, oversized loose witch robe, introverted cute atmosphere, soft colors, anime style',
                description: t('chatbot.t83'),
                personality: t('chatbot.t84'),
                scenario: t('chatbot.t85'),
                firstMes: t('chatbot.t86'),
                referenceImageDataUrl: ''
            },
            {
                id: 'c_mascot_alisa',
                name: t('chatbot.t87'),
                userName: t('chatbot.t81'),
                userNote: t('chatbot.t88'),
                visualDescription: 'Cute maid Alisa, sharp intellectual eyes, stylish glasses (megane), stoic cool beauty expression, black ponytail, classic black and white maid outfit, large magical broomstick, dynamic posing, anime style, detailed',
                description: t('chatbot.t89'),
                personality: t('chatbot.t90'),
                scenario: t('chatbot.t91'),
                firstMes: t('chatbot.t92'),
                referenceImageDataUrl: ''
            },
            {
                id: 'c_mascot_ling',
                name: t('chatbot.t93'),
                userName: t('chatbot.t81'),
                userNote: t('chatbot.t94'),
                visualDescription: 'Beautiful Jiangshi Chinese vampire maid girl Ling, innocent baby face, mischievous smile, glamorous curvy body, dark brown hair in cute twin buns, black Qipao-Maid fusion dress form-fitting with frills, yellow paper talisman on forehead, floating pose, anime style, white background friendly',
                description: t('chatbot.t95'),
                personality: t('chatbot.t96'),
                scenario: t('chatbot.t97'),
                firstMes: t('chatbot.t98'),
                referenceImageDataUrl: ''
            }
        ];
    }

    function mergeBuiltinMascotCharactersIfMissing(): void {
        const list = loadCharacterList();
        const existing = new Set(list.map(c => c.id));
        let changed = false;
        for (const ch of getBuiltinMascotCharacters()) {
            if (!existing.has(ch.id)) {
                list.push(ch);
                changed = true;
            }
        }
        if (changed) saveCharacterList(list);
    }

    function ensureDefaultCharacters(): Char[] {
        // 카레 (옛 비서 마스코트) hardcoded 디폴트 폐기 (TASK-KL-033 검증).
        // 빈 list 일 때 mergeBuiltinMascotCharactersIfMissing() 가 yon/alisa/ling
        // (그리고 wiki 로드 후 티메토) 시드. KarmoLab 마스코트 정합.
        mergeBuiltinMascotCharactersIfMissing();
        return loadCharacterList();
    }

    function getCharacterById(id: string): Char | null {
        return loadCharacterList().find(x => x.id === id) || null;
    }
    function buildCharacterSystemBlock(char: Char | null): string {
        if (!char) return '';
        const user = char.userName || '사용자';
        const charName = char.name || '캐릭터';
        const parts = [
            t('chatbot.t99'),
            t('chatbot.rp.intro', { name: charName }),
            '',
            t('chatbot.t100'),
            t('chatbot.rp.name', { value: user }),
            char.userNote ? t('chatbot.rp.note', { value: char.userNote }) : '',
            '',
            t('chatbot.rp.charHead', { name: charName }),
            char.description ? t('chatbot.rp.desc', { value: char.description }) : '',
            char.personality ? t('chatbot.rp.personality', { value: char.personality }) : '',
            char.scenario ? t('chatbot.rp.scenario', { value: char.scenario }) : '',
            char.visualDescription ? t('chatbot.rp.visual', { value: char.visualDescription }) : '',
            '',
            t('chatbot.t101')
        ];
        return parts.filter(Boolean).join('\n');
    }
    function syncAfterSessionLoad(sessionCharacterId: string | null | undefined): void {
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        if (!charSel) return;
        if (sessionCharacterId && getCharacterById(sessionCharacterId)) {
            charSel.value = sessionCharacterId;
        }
        applyCharacterFormFromSelection();
        updateChatHeaderTitle();
    }

    function populateCharacterSelectOptions(): void {
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        if (!charSel) return;
        const cur = charSel.value;
        const list = ensureDefaultCharacters();
        const esc = Toolbox.escapeHtml!;
        charSel.innerHTML = list.map(c => `<option value="${esc(c.id)}">${esc(c.name || c.id)}</option>`).join('');
        if (cur && getCharacterById(cur)) charSel.value = cur;
        else if (list[0]) charSel.value = list[0].id;
    }

    function applyCharacterFormFromSelection(): void {
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        const ch = charSel && getCharacterById(charSel.value);
        if (!ch) {
            updateCharProfilePreview();
            return;
        }
        const set = (id: string, v: string | undefined): void => {
            const el = byId<HTMLInputElement>(id);
            if (el) el.value = v ?? '';
        };
        set('cbCharName', ch.name);
        set('cbCharUserName', ch.userName);
        set('cbCharUserNote', ch.userNote);
        set('cbCharVisual', ch.visualDescription);
        set('cbCharDesc', ch.description);
        set('cbCharPersonality', ch.personality);
        set('cbCharScenario', ch.scenario);
        set('cbCharFirstMes', ch.firstMes);
        const thumb = byId<HTMLImageElement>('cbCharRefThumb');
        if (thumb) {
            if (ch.referenceImageDataUrl) {
                thumb.src = ch.referenceImageDataUrl;
                thumb.style.display = '';
            } else {
                thumb.removeAttribute('src');
                thumb.style.display = 'none';
            }
        }
        updateCharProfilePreview();
    }

    function updateCharProfilePreview(): void {
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        const ch = charSel && getCharacterById(charSel.value);
        const refThumb = byId<HTMLImageElement>('cbCharRefThumb');
        const av = byId<HTMLImageElement>('cbCharProfileAvatar');
        const ph = byId('cbCharProfilePlaceholder');
        const nameEl = byId('cbCharProfileName');
        let refUrl = ch?.referenceImageDataUrl || '';
        if (refThumb && refThumb.getAttribute('src') && refThumb.style.display !== 'none') refUrl = refThumb.src || refUrl;
        if (nameEl) nameEl.textContent = ch ? (ch.name || '이름 없음') : '—';
        if (av && ph) {
            if (refUrl) {
                av.src = refUrl;
                av.style.display = '';
                ph.style.display = 'none';
            } else {
                av.removeAttribute('src');
                av.style.display = 'none';
                ph.style.display = '';
            }
        }
    }

    function readCharacterFromForm(): Char | null {
        const g = (id: string): string => byId<HTMLInputElement>(id)?.value?.trim() ?? '';
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        const id = charSel?.value;
        if (!id) return null;
        const ch = getCharacterById(id) || { id } as Char;
        ch.name = g('cbCharName') || ch.name || '이름 없음';
        ch.userName = g('cbCharUserName') || '사용자';
        ch.userNote = g('cbCharUserNote');
        ch.visualDescription = g('cbCharVisual');
        ch.description = g('cbCharDesc');
        ch.personality = g('cbCharPersonality');
        ch.scenario = g('cbCharScenario');
        ch.firstMes = g('cbCharFirstMes');
        const thumb = byId<HTMLImageElement>('cbCharRefThumb');
        if (thumb && thumb.src && thumb.style.display !== 'none') ch.referenceImageDataUrl = thumb.src;
        else ch.referenceImageDataUrl = '';
        return ch;
    }

    function persistCharacterFromForm(): void {
        const ch = readCharacterFromForm();
        if (!ch) return;
        const list = loadCharacterList();
        const idx = list.findIndex(c => c.id === ch.id);
        if (idx >= 0) list[idx] = ch;
        else list.push(ch);
        saveCharacterList(list);
        populateCharacterSelectOptions();
        const selAfter = byId<HTMLSelectElement>('cbCharacterSelect');
        if (selAfter) selAfter.value = ch.id;
        Toolbox.showToast!(t('chatbot.t102'));
        updateChatHeaderTitle();
        updateCharProfilePreview();
    }

    function updateChatHeaderTitle(): void {
        const el = byId('cbChatTitle');
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        if (!el || !charSel) return;
        const ch = getCharacterById(charSel.value);
        el.textContent = ch ? t('chatbot.charBadge', { name: ch.name ?? '' }) : t('chatbot.t103');
    }

    function openCharEditModal(): void {
        const modal = byId('cbCharEditModal');
        if (!modal) return;
        charModalPreviousFocus = document.activeElement;
        applyCharacterFormFromSelection();
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        document.body.dataset.cbCharModalOpen = '1';
        byId<HTMLButtonElement>('cbCharEditClose')?.focus();
    }

    function closeCharEditModal(): void {
        const modal = byId('cbCharEditModal');
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        delete document.body.dataset.cbCharModalOpen;
        updateCharProfilePreview();
        const prev = charModalPreviousFocus as HTMLElement | null;
        charModalPreviousFocus = null;
        if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) prev.focus();
        else byId<HTMLButtonElement>('cbCharProfileOpen')?.focus();
    }

    function initCharacterUi(deps: CharUiDeps): void {
        const saveSession = deps && deps.saveSession;
        const getChatHistoryLength = deps && deps.getChatHistoryLength;
        const appendBotFirstMes = deps && deps.appendBotFirstMes;
        const getLastLoadedSessionCharacterId = deps && deps.getLastLoadedSessionCharacterId;
        const block = byId('cbCharacterBlock');
        if (block?.dataset.inited === '1') {
            populateCharacterSelectOptions();
            applyCharacterFormFromSelection();
            updateChatHeaderTitle();
            updateCharProfilePreview();
            return;
        }
        if (block) block.dataset.inited = '1';

        populateCharacterSelectOptions();
        const pref = Toolbox.getPref!('cb_active_character', '');
        const charSel = byId<HTMLSelectElement>('cbCharacterSelect');
        if (charSel && pref && getCharacterById(pref)) charSel.value = pref;
        if (charSel && getLastLoadedSessionCharacterId) {
            const sid = getLastLoadedSessionCharacterId();
            if (sid && getCharacterById(sid)) charSel.value = sid;
        }
        applyCharacterFormFromSelection();

        const imgSel = byId<HTMLSelectElement>('cbCharImageModel');
        if (imgSel && typeof Gemini !== 'undefined' && Gemini && Gemini.MODELS?.geminiImage) {
            imgSel.innerHTML = '';
            Gemini.MODELS.geminiImage.forEach(m => {
                const o = document.createElement('option');
                o.value = m.id;
                o.textContent = m.name;
                if (m.isDefault) o.selected = true;
                imgSel.appendChild(o);
            });
            const saved = Toolbox.getPref!('cb_char_image_model', '');
            if (saved) imgSel.value = saved;
            imgSel.addEventListener('change', () => Toolbox.setPref!('cb_char_image_model', imgSel.value));
        }

        charSel?.addEventListener('change', () => {
            Toolbox.setPref!('cb_active_character', charSel.value);
            applyCharacterFormFromSelection();
            updateChatHeaderTitle();
            saveSession && saveSession();
        });

        byId<HTMLButtonElement>('cbCharSave')?.addEventListener('click', () => persistCharacterFromForm());
        byId<HTMLButtonElement>('cbCharNew')?.addEventListener('click', () => {
            const n = defaultCharacterSeed();
            const list = loadCharacterList();
            list.push(n);
            saveCharacterList(list);
            populateCharacterSelectOptions();
            if (charSel) charSel.value = n.id;
            applyCharacterFormFromSelection();
            updateChatHeaderTitle();
            Toolbox.showToast!(t('chatbot.t104'));
        });
        byId<HTMLButtonElement>('cbCharDel')?.addEventListener('click', () => {
            if (!charSel?.value) return;
            if (!confirm(t('chatbot.t105'))) return;
            const list = loadCharacterList().filter(c => c.id !== charSel.value);
            if (!list.length) {
                Toolbox.showToast!(t('chatbot.t106'), 'error');
                return;
            }
            saveCharacterList(list);
            populateCharacterSelectOptions();
            applyCharacterFormFromSelection();
            updateChatHeaderTitle();
            saveSession && saveSession();
        });
        byId<HTMLInputElement>('cbCharRefFile')?.addEventListener('change', async (e) => {
            const tgt = e.target as HTMLInputElement;
            const f = tgt.files?.[0];
            const thumb = byId<HTMLImageElement>('cbCharRefThumb');
            if (!f || !f.type.startsWith('image/') || !thumb) return;
            const reader = new FileReader();
            reader.onload = () => {
                thumb.src = reader.result as string;
                thumb.style.display = '';
                updateCharProfilePreview();
            };
            reader.readAsDataURL(f);
            tgt.value = '';
        });
        byId<HTMLButtonElement>('cbCharRefClear')?.addEventListener('click', () => {
            const thumb = byId<HTMLImageElement>('cbCharRefThumb');
            if (thumb) { thumb.removeAttribute('src'); thumb.style.display = 'none'; }
            updateCharProfilePreview();
        });
        byId<HTMLButtonElement>('cbCharFirstBtn')?.addEventListener('click', () => {
            const ch = getCharacterById(charSel?.value ?? '');
            const fm = ch?.firstMes?.trim();
            if (!fm) { Toolbox.showToast!(t('chatbot.t107'), 'error'); return; }
            if (getChatHistoryLength && getChatHistoryLength() > 0) { Toolbox.showToast!(t('chatbot.t108'), 'error'); return; }
            if (appendBotFirstMes) appendBotFirstMes(fm);
        });

        const importOverwriteEl = byId<HTMLInputElement>('cbCharImportOverwrite');
        if (importOverwriteEl) {
            const savedOw = Toolbox.getPref!('cb_char_import_overwrite', '');
            if (savedOw === '1') importOverwriteEl.checked = true;
            importOverwriteEl.addEventListener('change', () => {
                Toolbox.setPref!('cb_char_import_overwrite', importOverwriteEl.checked ? '1' : '0');
            });
        }

        byId<HTMLButtonElement>('cbCharImportBtn')?.addEventListener('click', () => byId<HTMLInputElement>('cbCharImportFile')?.click());
        byId<HTMLInputElement>('cbCharImportFile')?.addEventListener('change', (e) => {
            const tgt = e.target as HTMLInputElement;
            const f = tgt.files?.[0];
            tgt.value = '';
            if (!f) return;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const buffer = reader.result;
                    if (!buffer || !(buffer instanceof ArrayBuffer)) throw new Error(t('chatbot.err.109'));
                    const obj = await parseCharacterImportFile(buffer);
                    let ch = mapImportedJsonToCharacter(obj);
                    const overwrite = byId<HTMLInputElement>('cbCharImportOverwrite')?.checked;
                    const curId = charSel?.value;
                    const list = loadCharacterList();
                    if (overwrite && curId && getCharacterById(curId)) {
                        ch = Object.assign({}, ch, { id: curId });
                        const idx = list.findIndex(c => c.id === curId);
                        if (idx >= 0) list[idx] = ch;
                        else list.push(ch);
                        saveCharacterList(list);
                        Toolbox.showToast!(t('chatbot.charOverwritten', { name: ch.name ?? '' }));
                    } else {
                        list.push(ch);
                        saveCharacterList(list);
                        Toolbox.showToast!(`캐릭터 카드를 불러왔습니다: ${ch.name}`);
                    }
                    populateCharacterSelectOptions();
                    if (charSel) charSel.value = ch.id;
                    Toolbox.setPref!('cb_active_character', ch.id);
                    applyCharacterFormFromSelection();
                    updateChatHeaderTitle();
                    updateCharProfilePreview();
                } catch (err) {
                    const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message) : String(err);
                    Toolbox.showToast!(t('chatbot.t110') + msg, 'error');
                }
            };
            reader.onerror = () => Toolbox.showToast!(t('chatbot.err.109'), 'error');
            reader.readAsArrayBuffer(f);
        });
        byId<HTMLButtonElement>('cbCharExportBtn')?.addEventListener('click', () => exportCurrentCharacterToJsonFile());

        const syncAuto = (): void => {
            const use = byId<HTMLInputElement>('cbCharUse')?.checked;
            const auto = byId<HTMLInputElement>('cbCharAutoImage');
            if (auto) auto.disabled = !use;
            if (!use && auto) auto.checked = false;
        };
        byId<HTMLInputElement>('cbCharUse')?.addEventListener('change', () => { syncAuto(); saveSession && saveSession(); });
        byId<HTMLInputElement>('cbCharAutoImage')?.addEventListener('change', () => saveSession && saveSession());
        syncAuto();

        byId<HTMLButtonElement>('cbCharProfileOpen')?.addEventListener('click', () => openCharEditModal());
        byId<HTMLElement>('cbCharEditBackdrop')?.addEventListener('click', closeCharEditModal);
        byId<HTMLButtonElement>('cbCharEditClose')?.addEventListener('click', closeCharEditModal);
        if (!cbCharModalEscBound) {
            cbCharModalEscBound = true;
            document.addEventListener('keydown', e => {
                if (e.key !== 'Escape') return;
                const modal = byId('cbCharEditModal');
                if (!modal || modal.hidden) return;
                e.preventDefault();
                e.stopPropagation();
                closeCharEditModal();
            }, true);
        }
        if (!cbCharModalTabBound) {
            cbCharModalTabBound = true;
            document.addEventListener('keydown', e => {
                if (e.key !== 'Tab' || !document.body.dataset.cbCharModalOpen) return;
                const modal = byId('cbCharEditModal');
                if (!modal || modal.hidden) return;
                const dialog = modal.querySelector<HTMLElement>('.cb-modal-dialog');
                if (!dialog) return;
                const nodes = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
                const list = Array.from(nodes).filter(el => {
                    if ((el as HTMLInputElement | HTMLButtonElement).disabled) return false;
                    const st = window.getComputedStyle(el);
                    return st.display !== 'none' && st.visibility !== 'hidden';
                });
                if (list.length === 0) return;
                const first = list[0];
                const last = list[list.length - 1];
                if (!dialog.contains(document.activeElement)) {
                    first.focus();
                    e.preventDefault();
                    return;
                }
                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        last.focus();
                        e.preventDefault();
                    }
                } else if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }, true);
        }

        updateChatHeaderTitle();
    }

    window.ChatbotCharacters = {
        getCharacterById,
        buildCharacterSystemBlock,
        syncAfterSessionLoad,
        initCharacterUi
    };
})();
