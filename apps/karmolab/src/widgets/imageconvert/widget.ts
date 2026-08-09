type ImageConvertOutputMime = string;

type ImageConvertSettings = {
    outFmt: 'png' | 'jpeg' | 'webp';
    quality: number; // 5..100
    maxPreset: '' | 'custom' | string;
    maxCustom: number; // 64..16384
    bg: string; // #RRGGBB
    fillAlpha: boolean;
    smoothing: 'high' | 'medium' | 'low';
};

type ImageConvertConvertOpts = {
    outputMime: ImageConvertOutputMime;
    quality: number; // 0..1
    maxLongSide: number; // 0 => keep
    background: string; // #RRGGBB
    fillAlpha: boolean;
    smoothing: 'high' | 'medium' | 'low';
};

type ImageConvertLoadResult = { img: HTMLImageElement; objectUrl: string; file: File };

type ImageConvertCore = {
    MIME_JPEG: ImageConvertOutputMime;
    MIME_PNG: ImageConvertOutputMime;
    MIME_WEBP: ImageConvertOutputMime;
    supportsWebpOutput: () => boolean;
    extFromMime: (mime: ImageConvertOutputMime) => string;
    baseNameFromFile: (file: File) => string;
    loadImageFromFile: (file: File) => Promise<ImageConvertLoadResult>;
    convertImage: (img: HTMLImageElement, opts: ImageConvertConvertOpts) => Promise<Blob>;
    revokeObjectUrl: (url: string | null) => void;
};

type ImageBatchResultItem = { ok: boolean; file?: File; error?: unknown; blob?: Blob; name?: string };
type ImageBatchProcessOutput = { results: ImageBatchResultItem[]; aborted: boolean };
type ImageBatch = {
    recipeConvert: (opts: ImageConvertConvertOpts) => unknown;
    processFilesSequential: (
        ic: ImageConvertCore,
        files: File[],
        recipe: unknown,
        opts: { signal: AbortSignal; onItemStart?: (idx: number, file: File, total: number) => void }
    ) => Promise<ImageBatchProcessOutput>;
    downloadResultsSequential: (results: ImageBatchResultItem[], ic: ImageConvertCore, mime: ImageConvertOutputMime) => Promise<void>;
};

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
    const IC = (window as unknown as { KarmoLabImageConvert?: ImageConvertCore }).KarmoLabImageConvert;
    if (!IC) {
        console.error('KarmoLabImageConvert missing');
        return;
    }
    const core: ImageConvertCore = IC;

    const STORAGE_KEY = 'karmolab_imageconvert_settings_v1';

    const DEFAULTS: ImageConvertSettings = {
        outFmt: 'png',
        quality: 92,
        maxPreset: '',
        maxCustom: 1920,
        bg: '#ffffff',
        fillAlpha: false,
        smoothing: 'high'
    };

    function loadSettings(): ImageConvertSettings {
        let o: Record<string, unknown> = {};
        try {
            o = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch (_) {}
        return {
            outFmt: (o.outFmt === 'jpeg' || o.outFmt === 'webp' || o.outFmt === 'png') ? o.outFmt : DEFAULTS.outFmt,
            quality: Math.min(100, Math.max(5, parseInt(String(o.quality ?? ''), 10) || DEFAULTS.quality)),
            maxPreset: typeof o.maxPreset === 'string' ? o.maxPreset : DEFAULTS.maxPreset,
            maxCustom: Math.min(16384, Math.max(64, parseInt(String(o.maxCustom ?? ''), 10) || DEFAULTS.maxCustom)),
            bg: typeof o.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.bg) ? o.bg : DEFAULTS.bg,
            fillAlpha: !!o.fillAlpha,
            smoothing: (o.smoothing === 'low' || o.smoothing === 'medium') ? o.smoothing : DEFAULTS.smoothing
        };
    }

    function saveSettings(s: ImageConvertSettings): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        } catch (_) {}
    }

    function mimeForFmt(fmt: ImageConvertSettings['outFmt']): ImageConvertOutputMime {
        if (fmt === 'jpeg') return core.MIME_JPEG;
        if (fmt === 'webp') return core.MIME_WEBP;
        return core.MIME_PNG;
    }

    function maxLongFromUI(preset: ImageConvertSettings['maxPreset'], customVal: number): number {
        if (preset === 'custom') return customVal > 0 ? customVal : 0;
        if (!preset) return 0;
        const n = parseInt(preset, 10);
        return n > 0 ? n : 0;
    }

    Mdd.injectCSS('imageconvert', `
        .imc-root {
            --imc-preview-slot-h: min(55vh, 560px);
            display:flex; flex-direction:column; gap:16px; max-width:min(100%, 1080px); margin:0 auto; padding:8px 0 28px; position:relative;
        }
        .imc-drop {
            border:2px dashed var(--border); border-radius:var(--radius-lg); padding:32px 22px;
            text-align:center; background:var(--bg-secondary); color:var(--text-secondary);
            cursor:pointer; transition:border-color var(--transition), background var(--transition);
        }
        .imc-drop:hover, .imc-drop.imc-drag { border-color:var(--accent); background:var(--accent-subtle); }
        .imc-drop-title { font-size:var(--font-size-sm); font-weight:600; color:var(--text-primary); margin-bottom:6px; }
        .imc-drop-hint { font-size:var(--font-size-xs); color:var(--text-tertiary); line-height:1.45; }
        .imc-panel {
            border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px 18px;
            background:var(--bg-secondary); display:none; flex-direction:column; gap:14px;
        }
        .imc-panel.imc-visible { display:flex; }
        .imc-preview-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:stretch; }
        .imc-preview-col { min-width:0; display:flex; flex-direction:column; }
        @media (max-width:640px) { .imc-preview-row { grid-template-columns:1fr; } }
        .imc-preview-caption {
            font-size:var(--font-size-2xs); font-weight:600; color:var(--text-tertiary);
            margin-bottom:6px; letter-spacing:0.02em;
        }
        .imc-preview-caption .imc-zoom-hint { font-weight:500; opacity:0.75; }
        .imc-preview-wrap {
            border-radius:var(--radius-md); overflow:hidden; background:var(--bg-tertiary);
            border:1px solid var(--border);
            height:var(--imc-preview-slot-h);
            width:100%; box-sizing:border-box;
            display:grid; grid-template:1fr / 1fr; place-items:stretch;
            background-image: linear-gradient(45deg, var(--bg-primary) 25%, transparent 25%),
                linear-gradient(-45deg, var(--bg-primary) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, var(--bg-primary) 75%),
                linear-gradient(-45deg, transparent 75%, var(--bg-primary) 75%);
            background-size: 12px 12px;
            background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
        }
        .imc-preview-wrap > * { grid-area:1 / 1; min-width:0; min-height:0; }
        .imc-preview-wrap img {
            box-sizing:border-box; display:block;
            width:100%; height:100%;
            object-fit:contain; cursor:zoom-in;
        }
        .imc-preview-wrap .imc-out-empty {
            cursor:default; box-sizing:border-box;
            display:flex; align-items:center; justify-content:center;
            margin:0;
        }
        .imc-out-empty {
            padding:20px 14px; text-align:center; font-size:var(--font-size-xs);
            color:var(--text-tertiary); line-height:1.5;
        }
        .imc-preview-out-img { display:none; }
        .imc-preview-out-img.imc-visible { display:block; }
        .imc-meta { font-size:var(--font-size-2xs); color:var(--text-tertiary); font-family:monospace; line-height:1.5; }
        .imc-section-title {
            font-size:var(--font-size-2xs); font-weight:700; text-transform:uppercase; letter-spacing:0.04em;
            color:var(--text-tertiary); margin:4px 0 2px;
        }
        .imc-grid { display:grid; grid-template-columns:100px 1fr; gap:10px 14px; align-items:center; }
        @media (max-width:560px) { .imc-grid { grid-template-columns:1fr; } }
        .imc-label { font-size:var(--font-size-xs); font-weight:600; color:var(--text-secondary); }
        .imc-format { display:flex; gap:8px; flex-wrap:wrap; }
        .imc-format label {
            display:inline-flex; align-items:center; gap:6px; font-size:var(--font-size-xs);
            cursor:pointer; color:var(--text-secondary); padding:6px 10px; border-radius:var(--radius-sm);
            border:1px solid var(--border); background:var(--bg-tertiary);
        }
        .imc-format input { accent-color:var(--accent); }
        .imc-format label.imc-fmt-off { opacity:0.4; pointer-events:none; }
        .imc-format label:has(input:checked) { border-color:var(--accent); color:var(--text-primary); background:var(--accent-subtle); }
        .imc-quality { display:flex; align-items:center; gap:10px; width:100%; max-width:320px; }
        .imc-quality input[type="range"] { flex:1; accent-color:var(--accent); }
        .imc-select, .imc-num {
            padding:6px 10px; font-size:var(--font-size-xs); border-radius:var(--radius-sm);
            border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-primary); font-family:inherit;
            max-width:100%;
        }
        .imc-num { width:100px; }
        .imc-color { width:44px; height:32px; padding:2px; border:1px solid var(--border); border-radius:var(--radius-sm); cursor:pointer; background:var(--bg-tertiary); }
        .imc-row-inline { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
        .imc-check { display:inline-flex; align-items:center; gap:8px; font-size:var(--font-size-xs); color:var(--text-secondary); cursor:pointer; }
        .imc-check input { accent-color:var(--accent); }
        .imc-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:4px; }
        .imc-note { font-size:var(--font-size-2xs); color:var(--text-tertiary); line-height:1.55; margin:0; }
        .imc-resample-block.imc-off { display:none; }
        .imc-batch {
            margin-top:12px; padding-top:14px; border-top:1px solid var(--border);
            display:flex; flex-direction:column; gap:10px;
        }
        .imc-batch.imc-off { display:none; }
        .imc-batch-status { font-size:var(--font-size-2xs); color:var(--text-tertiary); line-height:1.45; margin:0; }
        .imc-embed.imc-root { max-width:100%; padding:4px 0 16px; }
        .imc-embed-bar {
            display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px;
            padding:10px 12px; margin-bottom:10px; border-radius:var(--radius-md);
            border:1px solid var(--border); background:var(--bg-secondary);
            font-size:var(--font-size-xs); color:var(--text-secondary);
        }
        .imc-embed-bar-text { flex:1; min-width:140px; line-height:1.45; }
        .imc-lightbox {
            display:none; position:fixed; inset:0; z-index:100000;
            box-sizing:border-box; margin:0; padding:0;
            min-height:100vh; min-height:100dvh;
            background:rgba(0,0,0,0.92); backdrop-filter:blur(4px);
            cursor:pointer;
        }
        .imc-lightbox.imc-open {
            display:grid; grid-template:1fr / 1fr; place-items:stretch;
        }
        .imc-lightbox img {
            grid-area:1 / 1; box-sizing:border-box;
            width:100%; height:100%; min-width:0; min-height:0;
            object-fit:contain; object-position:center;
            cursor:pointer; user-select:none;
        }
    `);

    type BuildOptions = { embed?: boolean; onSyncCanvas?: () => void };

    const ImageConvertApp = {
        /* 이 부품은 다른 위젯이 불러다 쓴다(도구 목록에 따로 안 선다).
         * 그래도 화면 글자는 여기서 만들어지므로, 그리기 전에 말 묶음을 받는다. */
        build: function (container: HTMLElement, opts?: BuildOptions) {
            void loadNamespace('imageconvert').then(function () {
                ImageConvertApp._draw(container, opts);
            });
        },
        _draw: function (container: HTMLElement, opts?: BuildOptions) {
            const o = opts || {};
            const embed = !!o.embed;
            const webpOk = core.supportsWebpOutput();
            var dropBlock = embed
                ? '<div class="imc-embed-bar" id="imcEmbedBar">' +
                  t('imageconvert.t01') +
                  t('imageconvert.t02') +
                  '</div>'
                : t('imageconvert.t03') +
                  t('imageconvert.t04') +
                  t('imageconvert.t05') +
                  '</div>';

            container.innerHTML =
                '<div class="imc-root' + (embed ? ' imc-embed' : '') + '">' +
                dropBlock +
                '<input type="file" id="imcInput" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.bmp" hidden>' +
                '<div class="imc-panel" id="imcPanel">' +
                '<div class="imc-preview-row">' +
                '<div class="imc-preview-col">' +
                t('imageconvert.t06') +
                t('imageconvert.t07') +
                '<div class="imc-meta" id="imcMeta" style="margin-top:6px"></div>' +
                '</div>' +
                '<div class="imc-preview-col">' +
                t('imageconvert.t08') +
                t('imageconvert.t09') +
                t('imageconvert.t10') +
                t('imageconvert.t11') +
                '</div>' +
                '<div class="imc-meta" id="imcOutMeta" style="margin-top:6px"></div>' +
                '</div></div>' +
                t('imageconvert.t12') +
                '<div class="imc-grid">' +
                t('imageconvert.t13') +
                '<div class="imc-format">' +
                '<label><input type="radio" name="imcFmt" value="png"> PNG</label>' +
                '<label><input type="radio" name="imcFmt" value="jpeg"> JPEG</label>' +
                '<label class="' + (webpOk ? '' : 'imc-fmt-off') + '"><input type="radio" name="imcFmt" value="webp"' + (webpOk ? '' : ' disabled') + '> WebP</label>' +
                '</div>' +
                t('imageconvert.t14') +
                '<div class="imc-quality"><input type="range" id="imcQuality" min="5" max="100" value="92"><span class="imc-meta" id="imcQualityVal">92%</span></div>' +
                '</div>' +
                t('imageconvert.t15') +
                '<div class="imc-grid">' +
                t('imageconvert.t16') +
                '<div class="imc-row-inline">' +
                '<select class="imc-select" id="imcMaxPreset">' +
                t('imageconvert.t17') +
                t('imageconvert.t18') +
                t('imageconvert.t19') +
                t('imageconvert.t20') +
                t('imageconvert.t21') +
                t('imageconvert.t22') +
                t('imageconvert.t23') +
                t('imageconvert.t24') +
                t('imageconvert.t25') +
                t('imageconvert.t26') +
                t('imageconvert.t27') +
                t('imageconvert.t28') +
                t('imageconvert.t29') +
                '</select>' +
                t('imageconvert.t30') +
                '</div></div>' +
                t('imageconvert.t31') +
                '<div class="imc-grid">' +
                t('imageconvert.t32') +
                '<div class="imc-row-inline">' +
                '<input type="color" class="imc-color" id="imcBg" value="#ffffff">' +
                t('imageconvert.t33') +
                '</div></div>' +
                '<div class="imc-resample-block" id="imcResampleBlock">' +
                t('imageconvert.t34') +
                '<div class="imc-grid">' +
                t('imageconvert.t35') +
                '<select class="imc-select" id="imcSmooth">' +
                t('imageconvert.t36') +
                t('imageconvert.t37') +
                t('imageconvert.t38') +
                '</select>' +
                '</div></div>' +
                t('imageconvert.t39') +
                '<div class="imc-actions">' +
                t('imageconvert.t40') +
                t('imageconvert.t41') +
                t('imageconvert.t42') +
                '</div>' +
                '<p class="imc-note" id="imcFootNote"></p>' +
                '<div class="imc-batch" id="imcBatchRoot">' +
                t('imageconvert.t43') +
                t('imageconvert.t44') +
                '<input type="file" id="imcBatchInput" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.bmp" multiple hidden>' +
                '<div class="imc-actions" style="margin-top:0">' +
                t('imageconvert.t45') +
                t('imageconvert.t46') +
                t('imageconvert.t47') +
                '</div>' +
                t('imageconvert.t48') +
                '</div>' +
                '</div>' +
                t('imageconvert.t49') +
                '<img id="imcLightboxImg" alt="">' +
                '</div>' +
                '</div>';

            const drop = container.querySelector<HTMLElement>('#imcDrop');
            const input = container.querySelector<HTMLInputElement>('#imcInput')!;
            const panel = container.querySelector<HTMLElement>('#imcPanel')!;
            const preview = container.querySelector<HTMLImageElement>('#imcPreview')!;
            const meta = container.querySelector<HTMLElement>('#imcMeta')!;
            const quality = container.querySelector<HTMLInputElement>('#imcQuality')!;
            const qualityVal = container.querySelector<HTMLElement>('#imcQualityVal')!;
            const qlLabel = container.querySelector<HTMLElement>('#imcQlLabel')!;
            const maxPreset = container.querySelector<HTMLSelectElement>('#imcMaxPreset')!;
            const maxCustom = container.querySelector<HTMLInputElement>('#imcMaxCustom')!;
            const bgInput = container.querySelector<HTMLInputElement>('#imcBg')!;
            const fillAlpha = container.querySelector<HTMLInputElement>('#imcFillAlpha')!;
            const smoothSel = container.querySelector<HTMLSelectElement>('#imcSmooth')!;
            const resampleBlock = container.querySelector<HTMLElement>('#imcResampleBlock');
            const previewBtn = container.querySelector<HTMLButtonElement>('#imcPreviewBtn')!;
            const downloadBtn = container.querySelector<HTMLButtonElement>('#imcDownload')!;
            const clearBtn = container.querySelector<HTMLButtonElement>('#imcClear')!;
            const foot = container.querySelector<HTMLElement>('#imcFootNote')!;
            const outEmpty = container.querySelector<HTMLElement>('#imcOutEmpty')!;
            const previewOut = container.querySelector<HTMLImageElement>('#imcPreviewOut')!;
            const outMeta = container.querySelector<HTMLElement>('#imcOutMeta')!;
            const lightbox = container.querySelector<HTMLElement>('#imcLightbox')!;
            const lightboxImg = container.querySelector<HTMLImageElement>('#imcLightboxImg')!;

            let st = loadSettings();
            let current: { img: HTMLImageElement | null; objectUrl: string | null; file: File | null; baseName: string } = { img: null, objectUrl: null, file: null, baseName: 'image' };
            let outBlob: Blob | null = null;
            let outPreviewUrl: string | null = null;
            let lastPreviewKey: string | null = null;

            var EMPTY_OUT =
                t('imageconvert.t50');
            var STALE_OUT = t('imageconvert.t51');

            function revokeOutPreview(): void {
                if (outPreviewUrl) {
                    try {
                        URL.revokeObjectURL(outPreviewUrl);
                    } catch (_) {}
                    outPreviewUrl = null;
                }
                outBlob = null;
                lastPreviewKey = null;
            }

            function closeLightbox(): void {
                if (!lightbox.classList.contains('imc-open')) return;
                lightbox.classList.remove('imc-open');
                lightbox.setAttribute('aria-hidden', 'true');
                lightboxImg.removeAttribute('src');
                lightboxImg.alt = '';
                document.removeEventListener('keydown', onLightboxEscape);
                document.body.style.overflow = '';
            }

            function onLightboxEscape(e: KeyboardEvent): void {
                if (e.key === 'Escape') closeLightbox();
            }

            function openLightbox(src: string, altText?: string): void {
                if (!src || !lightbox || !lightboxImg) return;
                lightboxImg.src = src;
                lightboxImg.alt = altText || '';
                lightbox.classList.add('imc-open');
                lightbox.setAttribute('aria-hidden', 'false');
                document.addEventListener('keydown', onLightboxEscape);
                document.body.style.overflow = 'hidden';
                try {
                    lightbox.focus();
                } catch (_) {}
            }

            function invalidateOutPreview(stale: boolean): void {
                closeLightbox();
                revokeOutPreview();
                outEmpty.textContent = stale ? STALE_OUT : EMPTY_OUT;
                outEmpty.style.display = 'block';
                previewOut.removeAttribute('src');
                previewOut.classList.remove('imc-visible');
                outMeta.textContent = '';
            }

            function settingsKey(): string {
                return JSON.stringify({
                    f: st.outFmt,
                    q: st.quality,
                    mp: st.maxPreset,
                    mc: st.maxCustom,
                    bg: st.bg,
                    fa: st.fillAlpha,
                    sm: st.smoothing
                });
            }

            function getConvertOptsFromSt(): ImageConvertConvertOpts {
                return {
                    outputMime: mimeForFmt(st.outFmt),
                    quality: st.quality / 100,
                    maxLongSide: maxLongFromUI(st.maxPreset, st.maxCustom),
                    background: st.bg,
                    fillAlpha: st.fillAlpha,
                    smoothing: st.smoothing
                };
            }

            function triggerDownloadBlob(blob: Blob, mime: ImageConvertOutputMime): void {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = current.baseName + '.' + core.extFromMime(mime);
                a.click();
                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 2000);
            }

            function onSettingsChanged(): void {
                persistFromForm();
                if (lastPreviewKey !== null) invalidateOutPreview(true);
            }

            function persistFromForm(): void {
                st.outFmt = (container.querySelector<HTMLInputElement>('input[name="imcFmt"]:checked')!.value as ImageConvertSettings['outFmt']);
                st.quality = parseInt(quality.value, 10);
                st.maxPreset = maxPreset.value;
                st.maxCustom = parseInt(maxCustom.value, 10) || DEFAULTS.maxCustom;
                st.bg = bgInput.value;
                st.fillAlpha = fillAlpha.checked;
                st.smoothing = (smoothSel.value as ImageConvertSettings['smoothing']);
                saveSettings(st);
            }

            function applySettingsToForm(): void {
                container.querySelectorAll<HTMLInputElement>('input[name="imcFmt"]').forEach(function (r) {
                    r.checked = r.value === st.outFmt;
                });
                if (st.outFmt === 'webp' && !webpOk) {
                    const png = container.querySelector<HTMLInputElement>('input[name="imcFmt"][value="png"]');
                    if (png) png.checked = true;
                    st.outFmt = 'png';
                    saveSettings(st);
                }
                quality.value = String(st.quality);
                qualityVal.textContent = st.quality + '%';
                maxPreset.value = st.maxPreset;
                maxCustom.value = String(st.maxCustom);
                bgInput.value = st.bg;
                fillAlpha.checked = st.fillAlpha;
                smoothSel.value = st.smoothing;
                syncMaxCustomVis();
                syncResampleVis();
                updateQualityRow();
            }

            function syncMaxCustomVis(): void {
                maxCustom.style.display = maxPreset.value === 'custom' ? 'inline-block' : 'none';
            }

            function syncResampleVis(): void {
                if (!resampleBlock) return;
                var resizing = maxPreset.value !== '';
                resampleBlock.classList.toggle('imc-off', !resizing);
            }

            function updateQualityRow(): void {
                const fmt = container.querySelector<HTMLInputElement>('input[name="imcFmt"]:checked')!.value as ImageConvertSettings['outFmt'];
                var lossy = fmt === 'jpeg' || fmt === 'webp';
                qlLabel.style.opacity = lossy ? '1' : '0.45';
                quality.disabled = !lossy;
                quality.style.opacity = lossy ? '1' : '0.45';
                qualityVal.style.opacity = lossy ? '1' : '0.45';
                var tail = t('imageconvert.t52');
                if (fmt === 'jpeg') {
                    foot.textContent =
                        t('imageconvert.t53') + tail;
                } else if (fmt === 'webp') {
                    foot.textContent =
                        t('imageconvert.t54') + tail;
                } else {
                    foot.textContent =
                        t('imageconvert.t55') + tail;
                }
            }

            function showError(msg: string): void {
                Toolbox.showToast(msg, 'error', undefined);
                Mdd.linePreset('error', { msg: msg });
            }

            function revokeCurrent(): void {
                core.revokeObjectUrl(current.objectUrl);
                current = { img: null, objectUrl: null, file: null, baseName: 'image' };
            }

            function applyFile(file: File): void {
                core.loadImageFromFile(file).then(
                    function (res) {
                        revokeCurrent();
                        invalidateOutPreview(false);
                        current.img = res.img;
                        current.objectUrl = res.objectUrl;
                        current.file = res.file;
                        current.baseName = core.baseNameFromFile(res.file);
                        preview.src = res.objectUrl;
                        var w = res.img.naturalWidth;
                        var h = res.img.naturalHeight;
                        meta.innerHTML =
                            w +
                            ' × ' +
                            h +
                            ' px · ' +
                            (res.file.size / 1024).toFixed(1) +
                            ' KB · ' +
                            (res.file.type || 'unknown');
                        panel.classList.add('imc-visible');
                        Mdd.linePreset('success', { mood: 'happy', msg: t('imageconvert.t56') });
                    },
                    function (err: unknown) {
                        const e = err as { message?: string } | null;
                        showError(e?.message || '오류');
                    }
                );
            }

            function pick(): void {
                input.click();
            }

            if (drop) {
                drop.addEventListener('click', pick);
                drop.addEventListener('keydown', function (e: KeyboardEvent) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick();
                    }
                });
                (['dragenter', 'dragover'] as const).forEach(function (ev) {
                    drop.addEventListener(ev, function (e: Event) {
                        e.preventDefault();
                        e.stopPropagation();
                        drop.classList.add('imc-drag');
                    });
                });
                (['dragleave', 'drop'] as const).forEach(function (ev) {
                    drop.addEventListener(ev, function (e: Event) {
                        e.preventDefault();
                        e.stopPropagation();
                        drop.classList.remove('imc-drag');
                    });
                });
                drop.addEventListener('drop', function (e: DragEvent) {
                    const f = e.dataTransfer?.files?.[0];
                    if (f) applyFile(f);
                });
            }
            const syncBtn = container.querySelector<HTMLButtonElement>('#imcSyncCanvas');
            if (syncBtn) {
                if (embed && typeof o.onSyncCanvas === 'function') {
                    syncBtn.onclick = function () {
                        o.onSyncCanvas?.();
                    };
                } else {
                    syncBtn.style.display = 'none';
                }
            }
            input.addEventListener('change', function () {
                const f = input.files?.[0];
                if (f) applyFile(f);
                input.value = '';
            });

            preview.addEventListener('click', function () {
                if (preview.naturalWidth > 0 && preview.src) openLightbox(preview.src, t('imageconvert.t57'));
            });
            previewOut.addEventListener('click', function () {
                if (!previewOut.classList.contains('imc-visible')) return;
                if (previewOut.naturalWidth > 0 && previewOut.src) openLightbox(previewOut.src, t('imageconvert.t58'));
            });
            lightbox.addEventListener('click', function () {
                closeLightbox();
            });

            container.querySelectorAll<HTMLInputElement>('input[name="imcFmt"]').forEach(function (r) {
                r.addEventListener('change', function () {
                    updateQualityRow();
                    onSettingsChanged();
                });
            });
            quality.addEventListener('input', function () {
                qualityVal.textContent = quality.value + '%';
            });
            quality.addEventListener('change', onSettingsChanged);
            maxPreset.addEventListener('change', function () {
                syncMaxCustomVis();
                syncResampleVis();
                onSettingsChanged();
            });
            maxCustom.addEventListener('change', onSettingsChanged);
            bgInput.addEventListener('change', onSettingsChanged);
            fillAlpha.addEventListener('change', onSettingsChanged);
            smoothSel.addEventListener('change', onSettingsChanged);

            previewBtn.addEventListener('click', function () {
                if (!current.img) return;
                persistFromForm();
                var key = settingsKey();
                var opts = getConvertOptsFromSt();
                previewBtn.disabled = true;
                core.convertImage(current.img, opts)
                    .then(function (blob) {
                        revokeOutPreview();
                        outBlob = blob;
                        outPreviewUrl = URL.createObjectURL(blob);
                        lastPreviewKey = key;
                        outEmpty.style.display = 'none';
                        previewOut.src = outPreviewUrl;
                        previewOut.classList.add('imc-visible');
                        var im = new Image();
                        im.onload = function () {
                            outMeta.textContent =
                                im.naturalWidth +
                                ' × ' +
                                im.naturalHeight +
                                t('imageconvert.t59') +
                                (blob.size / 1024).toFixed(1) +
                                ' KB';
                        };
                        im.src = outPreviewUrl;
                        Toolbox.showToast(t('imageconvert.t60'), undefined, undefined);
                        Mdd.linePreset('success', { mood: 'happy', msg: t('imageconvert.t61') });
                    })
                    .catch(function () {
                        showError(t('imageconvert.t62'));
                    })
                    .finally(function () {
                        previewBtn.disabled = false;
                    });
            });

            downloadBtn.addEventListener('click', function () {
                if (!current.img) return;
                persistFromForm();
                var key = settingsKey();
                var mime = mimeForFmt(st.outFmt);
                if (outBlob && lastPreviewKey === key) {
                    triggerDownloadBlob(outBlob, mime);
                    Toolbox.showToast(t('imageconvert.t63'), undefined, undefined);
                    Mdd.linePreset('success', { mood: 'happy', msg: t('imageconvert.t64') });
                    return;
                }
                core.convertImage(current.img, getConvertOptsFromSt()).then(
                    function (blob) {
                        triggerDownloadBlob(blob, mime);
                        Toolbox.showToast(t('imageconvert.t63'), undefined, undefined);
                        Mdd.linePreset('success', { mood: 'happy', msg: t('imageconvert.t64') });
                    },
                    function () {
                        showError(t('imageconvert.t62'));
                    }
                );
            });

            clearBtn.addEventListener('click', function () {
                closeLightbox();
                preview.removeAttribute('src');
                panel.classList.remove('imc-visible');
                meta.textContent = '';
                invalidateOutPreview(false);
                revokeCurrent();
                Mdd.linePreset('tool_run', { mood: 'idle', msg: t('imageconvert.t65') });
            });

            const Batch = (window as unknown as { KarmoLabImageBatch?: ImageBatch }).KarmoLabImageBatch;
            const batchRoot = container.querySelector<HTMLElement>('#imcBatchRoot');
            const batchInput = container.querySelector<HTMLInputElement>('#imcBatchInput');
            const batchPick = container.querySelector<HTMLButtonElement>('#imcBatchPick');
            const batchRun = container.querySelector<HTMLButtonElement>('#imcBatchRun');
            const batchCancel = container.querySelector<HTMLButtonElement>('#imcBatchCancel');
            const batchStatus = container.querySelector<HTMLElement>('#imcBatchStatus');
            let batchFiles: File[] = [];
            let batchAbort: AbortController | null = null;

            function batchUiIdle(): void {
                batchAbort = null;
                if (batchRun) batchRun.disabled = batchFiles.length === 0;
                if (batchPick) batchPick.disabled = false;
                if (batchCancel) {
                    batchCancel.disabled = true;
                    batchCancel.style.display = 'none';
                }
                previewBtn.disabled = false;
                downloadBtn.disabled = false;
            }

            function batchStatusLine(): void {
                if (!batchStatus) return;
                batchStatus.textContent =
                    batchFiles.length === 0
                        ? t('imageconvert.t66')
                        : t('imageconvert.t67') + batchFiles.length + t('imageconvert.t68');
            }

            if (!Batch || !batchRoot || !batchInput || !batchPick || !batchRun || !batchCancel || !batchStatus) {
                if (batchRoot) batchRoot.classList.add('imc-off');
            } else {
                batchPick.addEventListener('click', function () {
                    batchInput.click();
                });
                batchInput.addEventListener('change', function () {
                    batchFiles = batchInput.files ? Array.from(batchInput.files) : [];
                    batchStatusLine();
                    batchRun.disabled = batchFiles.length === 0;
                    if (batchFiles.length) panel.classList.add('imc-visible');
                    batchInput.value = '';
                });
                batchCancel.addEventListener('click', function () {
                    if (batchAbort) batchAbort.abort();
                });
                batchRun.addEventListener('click', function () {
                    if (!batchFiles.length) return;
                    persistFromForm();
                    var mime = mimeForFmt(st.outFmt);
                    var recipe = Batch.recipeConvert(getConvertOptsFromSt());
                    batchAbort = new AbortController();
                    batchRun.disabled = true;
                    batchPick.disabled = true;
                    batchCancel.disabled = false;
                    batchCancel.style.display = 'inline-block';
                    previewBtn.disabled = true;
                    downloadBtn.disabled = true;
                    batchStatus.textContent = t('imageconvert.t69') + batchFiles.length;
                    Batch.processFilesSequential(core, batchFiles, recipe, {
                        signal: batchAbort.signal,
                        onItemStart: function (idx, file, total) {
                            batchStatus.textContent =
                                t('imageconvert.t70') + (idx + 1) + ' / ' + total + ' · ' + (file.name || '');
                        }
                    })
                        .then(function (out) {
                            var results = out.results;
                            var okc = results.filter(function (r) {
                                return r.ok;
                            }).length;
                            var failed = results.length - okc;
                            if (out.aborted) {
                                Toolbox.showToast(t('imageconvert.t71'), undefined, undefined);
                                batchStatus.textContent =
                                    t('imageconvert.t72') + results.length + t('imageconvert.t73') + okc + t('imageconvert.t74') + failed;
                                return;
                            }
                            batchStatus.textContent =
                                t('imageconvert.t75') + okc + t('imageconvert.t74') + failed + (okc ? t('imageconvert.t76') : '');
                            if (!okc) {
                                Toolbox.showToast(t('imageconvert.t77'), undefined, undefined);
                                return;
                            }
                            return Batch.downloadResultsSequential(results, core, mime).then(function () {
                                Toolbox.showToast(t('imageconvert.t78'), undefined, undefined);
                                Mdd.linePreset('success', { mood: 'happy', msg: t('imageconvert.t79') });
                            });
                        })
                        .catch(function () {
                            showError(t('imageconvert.t80'));
                        })
                        .finally(function () {
                            batchUiIdle();
                            batchStatusLine();
                        });
                });
            }

            applySettingsToForm();
            Mdd.linePreset('tool_run', {
                mood: 'idle',
                msg: embed ? t('imageconvert.t81') : t('imageconvert.t82'),
            });

            return { applyFile: applyFile };
        }
    };

    (window as unknown as { KarmoLabImageConvertUI?: typeof ImageConvertApp }).KarmoLabImageConvertUI = ImageConvertApp;
})();
