/**
 * 열어 둔 파일이 무엇인지 한 판에 보여 주기.
 *
 * 왜: 화면에 그림만 뜨고 그것이 몇 바이트인지, 어느 폴더인지, 몇 조각으로 잘렸는지 알 길이 없었다.
 * 탐색기의 속성 창, Drive 의 세부정보 패널이 하는 일이다.
 *
 * 어디서 오나:
 * - 이름, 폴더, 크기, 조각 수, sha256 은 색인(`idx`)에 이미 있다. 공짜다
 * - 가로세로와 길이는 **화면이 이미 그린 것에서 읽는다**. 그림은 naturalWidth,
 *   영상은 videoWidth 와 duration. 따로 굽는 것이 없다
 * - 수정한 날과 찍은 날은 올릴 때 색인에 같이 담는다 (`exif.mjs`, `walk.mjs`)
 *
 * 여기 있는 것은 값 계산뿐이다. DOM 은 `app.mjs` 몫.
 */

/** 소수점 없이 자릿수 쉼표. 정확한 바이트를 같이 보여 주려고 */
export function withCommas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 초를 `1:02:03` 또는 `2:03` 으로 */
export function fmtDuration(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '';
    const total = Math.round(sec);
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const p = (x) => String(x).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/** 해시는 통째로 보면 눈이 미끄러진다. 앞뒤만 */
export function shortHash(hex) {
    if (typeof hex !== 'string' || hex.length <= 20) return hex ?? '';
    return hex.slice(0, 10) + '...' + hex.slice(-6);
}

const KIND_LABEL = { image: '그림', video: '영상', text: '글', file: '기타' };

/**
 * 보여 줄 줄들.
 * @param {string} path 클라우드 안 경로
 * @param {{size:number, chunks:number, sha256:string}|null} entry 색인 항목
 * @param {{kind?:string, fmtSize?:(n:number)=>string, media?:{width?:number, height?:number, duration?:number}}} opt
 * @returns {Array<[string, string]>} 이름과 값
 */
export function infoRows(path, entry, opt = {}) {
    const fmtSize = opt.fmtSize ?? ((n) => `${n} B`);
    const parts = String(path).split('/');
    const name = parts.pop();
    const rows = [['이름', name]];
    rows.push(['폴더', parts.length ? parts.join('/') : '뿌리']);
    if (opt.kind) rows.push(['갈래', KIND_LABEL[opt.kind] ?? opt.kind]);

    const m = opt.media ?? {};
    if (m.width > 0 && m.height > 0) rows.push(['가로세로', `${m.width} x ${m.height}`]);
    if (m.duration > 0) rows.push(['길이', fmtDuration(m.duration)]);

    if (entry) {
        /* 찍은 날을 먼저. 사진의 수정 시각은 옮긴 날로 덮이는 일이 잦다 */
        if (entry.shot > 0) rows.push(['찍은 날', opt.fmtTime ? opt.fmtTime(entry.shot) : String(entry.shot)]);
        if (entry.mtime > 0) rows.push(['수정한 날', opt.fmtTime ? opt.fmtTime(entry.mtime) : String(entry.mtime)]);
        rows.push(['크기', `${fmtSize(entry.size)} (${withCommas(entry.size)} B)`]);
        if (entry.chunks > 0) rows.push(['조각', `${entry.chunks}개`]);
        if (entry.sha256) rows.push(['sha256', shortHash(entry.sha256)]);
    }
    return rows;
}
