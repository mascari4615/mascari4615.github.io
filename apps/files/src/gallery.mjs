/**
 * **액자 보기** — 폴더를 표가 아니라 그림으로 본다.
 *
 * 왜 여기서 조심해야 하나: 이 저장소에는 **썸네일이 따로 없다**. 칸 하나를 채우려면 그
 * 파일을 통째로 받아 복호해야 한다(사진 한 장 4MB 면 20칸 = 80MB). 그래서 셋을 지킨다:
 *   ① 화면에 들어온 칸만 받는다 (IntersectionObserver)
 *   ② 한 번에 넷까지만 (`LIMIT`) — 폴더에 들어서자마자 수십 개를 동시에 부르면
 *      Worker 도 브라우저도 줄을 서고, 정작 먼저 보이는 칸이 제일 늦게 뜬다
 *   ③ 받은 것은 blob 으로 들고 있다가 화면을 뜰 때 되돌려 준다 (`dispose`)
 *
 * 그림이 아닌 것(영상·문서·꾸러미)은 받지 않는다 — 칸에 갈래 표시만 둔다.
 * R2 에 아직 안 올라간 것은 404 가 나는데, 그것도 「못 받았다」로 조용히 남긴다.
 * 열람 저장에는 그림·글만 올라가므로(mirror-policy) **빈 칸은 고장이 아니다**.
 */

const LIMIT = 4;

/** 이 폴더에서 액자로 볼 만한가 — 그림이 한 장이라도 있으면. */
export function worthGallery(files, kindOf) {
    return files.some((f) => kindOf(f.path) === 'image');
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
            return (
                `<a class="frame" href="${hrefOf(f.path)}" data-path="${encodeURIComponent(f.path)}"` +
                ` data-kind="${kind}" title="${name.replace(/"/g, '&quot;')}">` +
                `<span class="frame-art"></span>` +
                `<span class="frame-cap">${name.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</span></a>`
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
            /* 아직 열람 저장에 없거나 받지 못했다 — 칸은 남기고 표시만 바꾼다. */
            cell.classList.add('blank');
        }
    }

    const io = new IntersectionObserver(
        (entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                io.unobserve(e.target);
                if (e.target.dataset.kind !== 'image') {
                    e.target.classList.add('blank');
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
