/**
 * **액자 보기**. 폴더를 표가 아니라 그림으로 본다.
 *
 * 왜 여기서 조심해야 하나: 이 저장소에는 **썸네일이 따로 없다**. 칸 하나를 채우려면 그
 * 파일을 통째로 받아 복호해야 한다(사진 한 장 4MB 면 20칸 = 80MB). 그래서 셋을 지킨다:
 *   ① 화면에 들어온 칸만 받는다 (IntersectionObserver)
 *   ② 한 번에 넷까지만 (`LIMIT`). 폴더에 들어서자마자 수십 개를 동시에 부르면
 *      Worker 도 브라우저도 줄을 서고, 정작 먼저 보이는 칸이 제일 늦게 뜬다
 *   ③ 받은 것은 blob 으로 들고 있다가 화면을 뜰 때 되돌려 준다 (`dispose`)
 *
 * 그림 아닌 것(영상, 문서, 꾸러미)은 안 받음. 대신 갈래 표시와 이름과 크기.
 * 예전엔 빗금만. 사람 눈에 고장난 칸과 구별 안 됨 (2026-08-29 관측)
 * R2 에 아직 안 올라간 것은 404 가 나는데, 그것도 못 받았다로 조용히 남긴다.
 * 열람 저장에는 그림, 글만 올라가므로(mirror-policy) **빈 칸은 고장이 아니다**.
 */

const LIMIT = 4;

/**
 * 칸 크기 넷. 탐색기의 아주 큰, 큰, 보통, 작은 아이콘과 같은 결.
 * 값은 한 칸의 최소 너비(px). 실제 칸 수는 창 너비가 정한다.
 */
export const CELL_SIZES = [
    { id: 'sm', label: '작게', px: 104 },
    { id: 'md', label: '보통', px: 146 },
    { id: 'lg', label: '크게', px: 220 },
    { id: 'xl', label: '아주 크게', px: 320 }
];

/** 모르는 값이 와도 보통으로. 저장된 값이 옛것일 수 있다 */
export function cellSize(id) {
    return CELL_SIZES.find((c) => c.id === id) ?? CELL_SIZES[1];
}

/** 이 폴더에서 액자로 볼 만한가. 그림이 한 장이라도 있으면. */
export function worthGallery(files, kindOf) {
    return files.some((f) => kindOf(f.path) === 'image');
}

/** 갈래마다 한 글자. 그림 못 오는 칸에 최소한의 단서 */
const FACE = { video: '▶', text: '≡', file: '◻' };

/** 사람이 읽는 크기. 칸이 좁아 한 자리까지 */
function human(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const unit = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < unit.length - 1) {
        n /= 1024;
        i += 1;
    }
    return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)}${unit[i]}`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host      칸을 담을 자리
 * @param {Array} opts.files           `{ path, size }`
 * @param {(path:string)=>string} opts.kindOf     previewKind
 * @param {(path:string)=>Promise<{bytes:Uint8Array}|null>} opts.load  복호해서 바이트를 준다
 * @param {(path:string)=>string} opts.mimeOf
 * @param {(path:string)=>string} opts.hrefOf     칸을 누르면 갈 곳
 * @returns {{ dispose: () => void }}
 */
export function mountGallery({ host, files, kindOf, load, mimeOf, hrefOf }) {
    const urls = [];
    let running = 0;
    const queue = [];

    host.innerHTML = files
        .map((f) => {
            const name = f.path.split('/').pop();
            const kind = kindOf(f.path);
            const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
            /* 그림 아니면 갈래 글자와 크기 미리 박기. 그림이면 비워 두고 `fill` 이 채움 */
            const art =
                kind === 'image'
                    ? '<span class="frame-art"></span>'
                    : `<span class="frame-art"><span class="frame-face">${FACE[kind] ?? FACE.file}` +
                      `<i>${esc(human(f.size))}</i></span></span>`;
            return (
                `<a class="frame" href="${hrefOf(f.path)}" data-path="${encodeURIComponent(f.path)}"` +
                ` data-kind="${kind}" title="${name.replace(/"/g, '&quot;')}">` +
                art +
                `<span class="frame-cap">${esc(name)}</span></a>`
            );
        })
        .join('');

    const pump = () => {
        while (running < LIMIT && queue.length) {
            const cell = queue.shift();
            running += 1;
            void fill(cell).finally(() => {
                running -= 1;
                pump();
            });
        }
    };

    async function fill(cell) {
        const path = decodeURIComponent(cell.dataset.path);
        const art = cell.querySelector('.frame-art');
        try {
            const got = await load(path);
            if (!got) throw new Error('none');
            const url = URL.createObjectURL(new Blob([got.bytes], { type: mimeOf(path) }));
            urls.push(url);
            const img = new Image();
            img.loading = 'lazy';
            img.alt = '';
            img.src = url;
            art.replaceChildren(img);
            cell.classList.add('ready');
        } catch {
            /* 아직 열람 저장에 없거나 받지 못했다. 칸은 남기고 표시만 바꾼다. */
            cell.classList.add('blank');
        }
    }

    const io = new IntersectionObserver(
        (entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                io.unobserve(e.target);
                if (e.target.dataset.kind !== 'image') {
                    /* 갈래 글자 이미 있음. 받아올 것 없으므로 여기서 끝 */
                    e.target.classList.add('shown');
                    continue;
                }
                queue.push(e.target);
            }
            pump();
        },
        { rootMargin: '300px' }
    );
    for (const cell of host.querySelectorAll('.frame')) io.observe(cell);

    return {
        dispose() {
            io.disconnect();
            queue.length = 0;
            for (const url of urls) URL.revokeObjectURL(url);
            urls.length = 0;
        }
    };
}
