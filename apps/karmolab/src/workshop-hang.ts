/**
 * 만든 것을 **작업실에 건다** — 누를 때 데려오는 조각 (TASK-KL-191 축3·8).
 *
 * 왜 셸에서 떼어 냈나: 갈래를 가르고, PDF 첫 장을 그리고, 미리보기를 올리는 이 일은
 * **결과가 나온 뒤 단추를 눌러야** 시작된다. 그런데 셸에 두면 첫 화면을 그리기도 전에
 * 모두가 그 무게를 내려받는다 — 실제로 첫 화면 예산(JS 39KB)을 1.3KB 넘겼고 배포가 빨갛게 섰다.
 *
 * 셸에는 「단추를 만들고 이 조각을 데려온다」만 남는다. 여기가 그 조각이다.
 */
type HangItem = { blob: Blob; name?: string; from?: string | null };

type PdfJsLike = {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (opts: { data: Uint8Array }) => {
        promise: Promise<{
            getPage: (n: number) => Promise<{
                getViewport: (o: { scale: number }) => { width: number; height: number };
                render: (o: { canvasContext: CanvasRenderingContext2D | null; viewport: unknown }) => { promise: Promise<void> };
            }>;
        }>;
    };
};

/** 무엇을 만든 것인가. 모르는 것은 「그 밖」이다 — 지어낸 갈래를 붙이지 않는다. */
function kindOf(mime: string): string {
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('text/') || mime.includes('json') || mime.includes('csv')) return 'text';
    return 'file';
}

function sizeNote(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function readDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/** 미리보기 한 장을 올리고 그 열쇠를 준다. 못 올리면 null — 없는 그림을 가리키지 않는다. */
async function uploadPreview(base: string, dataUrl: string): Promise<string | null> {
    try {
        const up = await fetch(`${base}/kl/uploads`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataUrl }),
        });
        if (!up.ok) return null;
        const saved = (await up.json()) as { id?: string };
        return saved.id ?? null;
    } catch {
        return null;
    }
}

/**
 * PDF 는 **첫 장을 그려서** 미리보기로 쓴다. 그리는 도구는 이 앱이 이미 들고 있고,
 * 여기서 처음 필요해질 때만 받는다. 못 그리면 미리보기 없이 건다 —
 * 거는 것 자체가 실패하면 만든 것이 사라진다.
 */
async function pdfThumb(blob: Blob): Promise<string | null> {
    try {
        await Toolbox.ensureScript?.('vendor/pdfjs.min');
        const lib = (window as unknown as { pdfjsLib?: PdfJsLike }).pdfjsLib;
        if (!lib) return null;
        // 워커도 같은 자리에서 받아야 한다 (다른 데서 받으면 판본이 어긋난다)
        lib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await lib.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        const view = page.getViewport({ scale: 1 });
        const scaled = page.getViewport({ scale: Math.min(1.6, 640 / view.width) });
        const cv = document.createElement('canvas');
        cv.width = Math.round(scaled.width);
        cv.height = Math.round(scaled.height);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: scaled }).promise;
        return cv.toDataURL('image/png');
    } catch {
        return null;
    }
}

/** 한 번 건다. 성공하면 true. */
async function hang(item: HangItem): Promise<boolean> {
    const account = window.KarmoAccount;
    if (!account?.state.account) return false;
    const base = account.apiBase;
    const mime = String(item.blob.type || '');
    const kind = kindOf(mime);
    let uploadId: string | null = null;
    let note = sizeNote(item.blob.size || 0);

    if (kind === 'image') uploadId = await uploadPreview(base, await readDataUrl(item.blob));
    else if (kind === 'pdf') {
        const thumb = await pdfThumb(item.blob);
        if (thumb) uploadId = await uploadPreview(base, thumb);
    } else if (kind === 'text') {
        // 글은 앞머리 한 줄이 미리보기다 — 통째로 올리면 그건 걸기가 아니라 업로드다.
        note = (await item.blob.slice(0, 400).text()).replace(/\s+/g, ' ').trim().slice(0, 80) || note;
    }

    const res = await fetch(`${base}/kl/me/works`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: uploadId || '',
            title: item.name || '작업',
            toolId: item.from || null,
            kind,
            preview: !!uploadId,
            note,
        }),
    });
    return res.ok;
}

declare global {
    interface Window {
        KarmoWorkshop?: { hang: typeof hang };
    }
}

window.KarmoWorkshop = { hang };

export {};
