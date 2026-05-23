/**
 * imagegen - 큐 시스템, 유틸, 히스토리
 */
(function () {
    'use strict';
    const IG = window.ImageGen;
    if (!IG) return;
    if (typeof Gemini === 'undefined') return;
    const G = Gemini;

    interface VibeOption { id: string; label: string; suffix: string; desc?: string }
    interface GenerationOptions {
        apiRoute: string;
        modelId: string;
        aspectRatio: string;
        safetyThreshold: string;
        vibeSuffix: string;
        vertexProjectId: string;
        vertexLocation: string;
        negativePrompt?: string;
        personGeneration?: string;
    }
    type QueueStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';
    interface QueueItem {
        id: number;
        prompt: string;
        finalPrompt: string;
        options: GenerationOptions;
        status: QueueStatus;
        abortController: AbortController | null;
        elapsed: string | null;
        error: string | null;
        emojiChar?: string;
        resultItem?: ImageDBItem;
    }
    interface CoreDeps {
        state: {
            sessionGallery: ImageDBItem[];
            currentItem: ImageDBItem | null;
            compareMode?: boolean;
        };
        renderQueue: () => void;
        renderQueueItem: (q: QueueItem) => void;
        updateMainPreview: () => void;
        showResultInPreview: (item: ImageDBItem) => void;
        hideMainLoading: () => void;
        renderSessionGallery: () => void;
        saveGallerySession: () => void;
    }

    const VIBE_OPTIONS = (IG.VIBE_OPTIONS as VibeOption[] | undefined) || [];
    const GALLERY_SESSION_KEY = IG.GALLERY_SESSION_KEY ?? 'toolbox_imagegen_session';
    const GALLERY_SESSION_MAX = IG.GALLERY_SESSION_MAX ?? 50;
    const PROMPT_HISTORY_KEY = IG.PROMPT_HISTORY_KEY ?? 'toolbox_imagegen_prompts';
    const PROMPT_HISTORY_MAX = IG.PROMPT_HISTORY_MAX ?? 100;

    const escapeHtml = (Toolbox.escapeHtml || ((s: string) => s)) as (s: string) => string;

    function getModelDisplayName(modelId: string): string {
        const cat = G.MODELS;
        const all = [
            ...(cat?.gemini ?? []),
            ...(cat?.geminiImage ?? []),
            ...(cat?.imagen ?? [])
        ];
        const found = all.find(m => m.id === modelId);
        return found ? found.name : modelId;
    }

    function showLightbox(imageUrl: string): void {
        let lb = document.getElementById('igLightbox') as HTMLDivElement | null;
        if (!lb) {
            const el = document.createElement('div');
            el.id = 'igLightbox';
            el.className = 'ig-lightbox';
            el.innerHTML = `
                <img id="igLightboxImg" src="" alt="Full Size">
                <div class="ig-lightbox-actions">
                    <button class="btn btn-accent" id="igLightboxDl">⬇️ 다운로드</button>
                    <button class="btn btn-ghost" id="igLightboxClose">닫기</button>
                </div>`;
            el.onclick = (e) => { if (e.target === el) el.classList.remove('open'); };
            document.body.appendChild(el);
            lb = el;
        }
        const lbEl = lb;
        const img = document.getElementById('igLightboxImg') as HTMLImageElement | null;
        if (img) img.src = imageUrl;
        const dl = document.getElementById('igLightboxDl') as HTMLButtonElement | null;
        if (dl) dl.onclick = () => downloadImage(imageUrl);
        const close = document.getElementById('igLightboxClose') as HTMLButtonElement | null;
        if (close) close.onclick = () => lbEl.classList.remove('open');
        lbEl.classList.add('open');
    }

    function downloadImage(url: string): void {
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-image-${Date.now()}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        Toolbox.showToast?.('다운로드 시작');
    }

    function getPromptHistory(): string[] {
        try {
            const raw = localStorage.getItem(PROMPT_HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? (parsed as string[]) : [];
        } catch (_) { return []; }
    }

    function addPromptHistory(text: string): void {
        if (!text || text.length < 5) return;
        let history = getPromptHistory().filter(h => h !== text);
        history.unshift(text);
        if (history.length > PROMPT_HISTORY_MAX) history = history.slice(0, PROMPT_HISTORY_MAX);
        localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(history));
    }

    const queue: QueueItem[] = [];
    let queueProcessing = false;
    let queueIdCounter = 0;
    let _deps: CoreDeps | null = null;

    function collectCurrentOptions(): GenerationOptions {
        const modelSel = document.getElementById('igModelSelect') as HTMLSelectElement | null;
        const ratioSel = document.getElementById('igAspectRatio') as HTMLSelectElement | null;
        const safetySel = document.getElementById('igSafety') as HTMLSelectElement | null;
        const vibeSel = document.getElementById('igVibe') as HTMLSelectElement | null;
        const apiSel = document.getElementById('igApiRoute') as HTMLSelectElement | null;
        const vibeId = vibeSel?.value || 'none';
        const vibeSuffix = (VIBE_OPTIONS.find(v => v.id === vibeId) || VIBE_OPTIONS[0])?.suffix || '';
        const modelId = modelSel?.value || (G.getDefaultModel?.('geminiImage') ?? 'gemini-2.5-flash-image');
        const vertexProj = document.getElementById('igVertexProjectId') as HTMLInputElement | null;
        const vertexLoc = document.getElementById('igVertexLocation') as HTMLInputElement | null;
        const opts: GenerationOptions = {
            apiRoute: apiSel?.value || Toolbox.getPref?.('ig_api_route', '') || 'aiStudio',
            modelId,
            aspectRatio: ratioSel?.value || '16:9',
            safetyThreshold: safetySel?.value || 'BLOCK_ONLY_HIGH',
            vibeSuffix,
            vertexProjectId: (vertexProj?.value || Toolbox.getPref?.('ig_vertex_project_id', '') || '').trim(),
            vertexLocation: (vertexLoc?.value || Toolbox.getPref?.('ig_vertex_location', '') || 'us-central1').trim() || 'us-central1'
        };
        if (modelId.startsWith('imagen')) {
            const neg = document.getElementById('igNegPrompt') as HTMLInputElement | null;
            const pg = document.getElementById('igPersonGen') as HTMLSelectElement | null;
            opts.negativePrompt = neg?.value.trim() || '';
            opts.personGeneration = pg?.value || 'allow_adult';
        }
        return opts;
    }

    function enqueue(promptText: string, isEmoji: boolean, emojiChar: string | undefined, isMascot: boolean): void {
        const opts = collectCurrentOptions();
        if (isEmoji || isMascot) opts.aspectRatio = '1:1';
        const id = ++queueIdCounter;
        queue.push({
            id, prompt: promptText, finalPrompt: promptText + opts.vibeSuffix, options: opts,
            status: 'pending', abortController: null, elapsed: null, error: null,
            emojiChar: isEmoji ? emojiChar : undefined
        });
        _deps?.renderQueue();
        processQueue();
    }

    async function processQueue(): Promise<void> {
        if (queueProcessing || !_deps) return;
        const next = queue.find(q => q.status === 'pending');
        if (!next) return;

        const deps = _deps;
        queueProcessing = true;
        next.status = 'running';
        next.abortController = new AbortController();
        deps.renderQueue();
        deps.updateMainPreview();

        const start = Date.now();
        const timerId = setInterval(() => {
            next.elapsed = ((Date.now() - start) / 1000).toFixed(0);
            deps.renderQueueItem(next);
            const lt = document.getElementById('igLoadingText');
            if (lt) lt.textContent = `Dreaming... ${next.elapsed}s`;
        }, 1000);

        try {
            let imageUrl: string;
            let usage: { totalTokenCount?: number; [k: string]: unknown } | undefined;
            const { modelId, aspectRatio, safetyThreshold } = next.options;
            const signal = next.abortController.signal;

            if (modelId.startsWith('gemini')) {
                const route = next.options.apiRoute || 'aiStudio';
                if (route === 'vertex') {
                    if (!G.requireVertexApiKey?.()) throw new Error('Vertex API 키가 필요합니다.');
                    const result = await G.callVertexGeminiImage!(next.finalPrompt, modelId, {
                        signal, aspectRatio, safetyThreshold,
                        projectId: next.options.vertexProjectId,
                        location: next.options.vertexLocation
                    });
                    imageUrl = result.dataUrl;
                    usage = result.usage;
                } else {
                    const result = await G.callGeminiImage!(next.finalPrompt, modelId, { signal, aspectRatio, safetyThreshold });
                    imageUrl = result.dataUrl;
                    usage = result.usage;
                }
            } else {
                const imgSafety = safetyThreshold === 'OFF' ? 'block_none' : safetyThreshold.toLowerCase();
                const route = next.options.apiRoute || 'aiStudio';
                if (route === 'vertex') {
                    if (!G.requireVertexApiKey?.()) throw new Error('Vertex API 키가 필요합니다.');
                    const images = await G.callVertexImagen!(next.finalPrompt, modelId, 1, {
                        signal, aspectRatio, safetyFilterLevel: imgSafety,
                        negativePrompt: next.options.negativePrompt || undefined,
                        personGeneration: next.options.personGeneration,
                        projectId: next.options.vertexProjectId,
                        location: next.options.vertexLocation
                    });
                    imageUrl = images[0];
                } else {
                    const images = await G.callImagen!(next.finalPrompt, modelId, 1, {
                        signal, aspectRatio, safetyFilterLevel: imgSafety,
                        negativePrompt: next.options.negativePrompt || undefined,
                        personGeneration: next.options.personGeneration
                    });
                    imageUrl = images[0];
                }
            }

            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            const tokens = usage?.totalTokenCount ?? undefined;
            const item: ImageDBItem = {
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                url: imageUrl, prompt: next.prompt, model: modelId,
                modelName: getModelDisplayName(modelId), timestamp: Date.now(), tokens, elapsed
            };

            deps.state.sessionGallery.push(item);
            deps.state.currentItem = item;
            next.status = 'done';
            next.resultItem = item;

            deps.showResultInPreview(item);
            deps.renderSessionGallery();
            deps.saveGallerySession();
            ImageDB?.save(item).catch(e => console.warn('Library save failed:', e));
            addPromptHistory(next.emojiChar || next.prompt);
            Toolbox.recordUsage?.('image', tokens || 0);

            if (deps.state.compareMode) {
                deps.state.compareMode = false;
                const preview = document.getElementById('igPreview');
                const cmp = preview?.querySelector('.ig-compare') as HTMLElement | null;
                if (cmp) cmp.style.display = 'none';
            }
            const compareBtn = document.getElementById('igCompareBtn') as HTMLElement | null;
            if (compareBtn && deps.state.sessionGallery.length >= 2) compareBtn.style.display = '';
        } catch (e) {
            const err = e as Error;
            next.status = 'error';
            next.error = err.message || '생성 실패';
            if (err.message !== '요청이 취소되었습니다.') {
                const is429 = /429|Too Many/i.test(err.message || '');
                if (is429) {
                    clearQueue();
                    Toolbox.showToast?.('API 요청 한도 초과. 큐를 비웠습니다. 잠시 후 다시 시도해주세요.', 'error');
                } else {
                    Toolbox.showToast?.(err.message || '이미지 생성 실패', 'error', err);
                }
            }
        } finally {
            clearInterval(timerId);
            queueProcessing = false;
            deps.renderQueue();

            const remaining = queue.filter(q => q.status === 'pending').length;
            const doneCount = queue.filter(q => q.status === 'done').length;
            if (remaining > 0) {
                Mdd.linePreset('tool_run', { msg: `다음 이미지 시작! (${remaining}개 남음)` });
                processQueue();
            } else if (doneCount > 0) {
                Mdd.linePreset('success', { msg: '큐 작업 모두 완료!' });
                Toolbox.showToast?.(`큐 완료: ${doneCount}장 생성됨`);
                deps.hideMainLoading();
            }
        }
    }

    function cancelQueueItem(queueId: number): void {
        const item = queue.find(q => q.id === queueId);
        if (!item) return;
        if (item.status === 'running' && item.abortController) {
            item.abortController.abort();
            item.status = 'cancelled';
        } else if (item.status === 'pending') {
            item.status = 'cancelled';
        }
        _deps?.renderQueue();
    }

    function removeQueueItem(queueId: number): void {
        const idx = queue.findIndex(q => q.id === queueId);
        if (idx >= 0) queue.splice(idx, 1);
        _deps?.renderQueue();
    }

    function clearQueue(): void {
        queue.forEach(q => {
            if (q.status === 'running' && q.abortController) q.abortController.abort();
            if (q.status === 'pending') q.status = 'cancelled';
        });
        queue.length = 0;
        if (_deps) { _deps.renderQueue(); _deps.hideMainLoading(); }
    }

    function saveGallerySession(): void {
        if (!_deps) return;
        try {
            const { sessionGallery, currentItem } = _deps.state;
            const toSave = sessionGallery.slice(-GALLERY_SESSION_MAX);
            sessionStorage.setItem(GALLERY_SESSION_KEY, JSON.stringify({
                items: toSave,
                currentId: currentItem?.id
            }));
        } catch (e) { console.warn('Gallery session save failed', e); }
    }

    function loadGallerySession(): boolean {
        if (!_deps) return false;
        try {
            const raw = sessionStorage.getItem(GALLERY_SESSION_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw) as { items?: ImageDBItem[]; currentId?: string; urls?: string[] };
            const { state } = _deps;
            if (data.items && Array.isArray(data.items) && data.items.length > 0) {
                state.sessionGallery = data.items;
                state.currentItem = state.sessionGallery.find(i => i.id === data.currentId) || state.sessionGallery[state.sessionGallery.length - 1] || null;
                return true;
            }
            if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
                state.sessionGallery = data.urls.map((url, i): ImageDBItem => ({
                    id: `legacy_${i}`, url, prompt: '', model: '', modelName: '',
                    timestamp: Date.now()
                }));
                state.currentItem = state.sessionGallery[state.sessionGallery.length - 1] || null;
                return true;
            }
        } catch (e) { console.warn('Gallery session load failed', e); }
        return false;
    }

    function initCore(deps: CoreDeps): void {
        _deps = deps;
    }

    Object.assign(IG, {
        queue,
        queueProcessing: () => queueProcessing,
        getModelDisplayName,
        showLightbox,
        downloadImage,
        getPromptHistory,
        addPromptHistory,
        collectCurrentOptions,
        enqueue,
        processQueue,
        cancelQueueItem,
        removeQueueItem,
        clearQueue,
        saveGallerySession,
        loadGallerySession,
        initCore,
        escapeHtml
    });
})();
