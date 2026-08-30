/**
 * 고른 파일 여럿을 한 덩이로 묶어 받기.
 *
 * 왜 직접 쓰나: 이 화면은 바깥 꾸러미를 안 쓴다(암호문을 다루는 자리라 들이는 것을 줄인다).
 * 묶기만 하면 되므로 **압축은 안 한다**(method 0, store). 어차피 안에 든 것은 이미 압축된
 * png, jpg, mp4 다. 압축을 걸어도 몇 %가 줄고 시간만 든다.
 *
 * 안 하는 것:
 * - zip64. 4GB 를 넘는 묶음은 만들지 않는다. `MAX_TOTAL` 에서 미리 거절한다
 * - 폴더 항목. 이름에 `/` 가 들어가면 푸는 쪽이 알아서 폴더를 만든다
 *
 * 이름은 UTF-8 로 적고 그 표시(플래그 0x0800)를 세운다. 안 세우면 한글 이름이 깨진다.
 */

/** 이 크기를 넘으면 안 묶는다. 4GB 위는 zip64 가 필요하고, 브라우저 메모리도 못 버틴다 */
export const MAX_TOTAL = 2 * 1024 * 1024 * 1024;

const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c >>> 0;
    }
    return t;
})();

/** zip 이 요구하는 검사값 */
export function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** 같은 이름이 두 번 들어가면 푸는 쪽이 하나를 덮어쓴다. 뒤엣것에 번호를 붙인다 */
export function uniqueNames(names) {
    const seen = new Map();
    return names.map((raw) => {
        const n = String(raw);
        if (!seen.has(n)) {
            seen.set(n, 1);
            return n;
        }
        const i = seen.get(n);
        seen.set(n, i + 1);
        const dot = n.lastIndexOf('.');
        return dot > 0 ? `${n.slice(0, dot)} (${i})${n.slice(dot)}` : `${n} (${i})`;
    });
}

function put(view, off, val, size) {
    for (let i = 0; i < size; i++) view.setUint8(off + i, (val >>> (i * 8)) & 0xff);
}

/**
 * 묶기.
 * @param {Array<{name:string, bytes:Uint8Array}>} entries
 * @returns {Uint8Array}
 */
export function makeZip(entries) {
    const total = entries.reduce((n, e) => n + e.bytes.length, 0);
    if (total > MAX_TOTAL) throw new Error('묶기에는 너무 큽니다');

    const enc = new TextEncoder();
    const names = uniqueNames(entries.map((e) => e.name)).map((n) => enc.encode(n));
    const crcs = entries.map((e) => crc32(e.bytes));

    let size = 0;
    for (let i = 0; i < entries.length; i++) {
        size += 30 + names[i].length + entries[i].bytes.length; /* 앞 머리와 내용 */
        size += 46 + names[i].length; /* 가운데 차례표 */
    }
    size += 22; /* 끝 표시 */

    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    const offsets = [];
    let p = 0;

    for (let i = 0; i < entries.length; i++) {
        offsets.push(p);
        const n = names[i];
        const b = entries[i].bytes;
        put(view, p, 0x04034b50, 4);
        put(view, p + 4, 20, 2); /* 풀려면 이 판 이상 */
        put(view, p + 6, 0x0800, 2); /* 이름이 UTF-8 이라는 표시. 안 세우면 한글이 깨진다 */
        put(view, p + 8, 0, 2); /* 압축 안 함 */
        put(view, p + 10, 0, 2);
        put(view, p + 12, 0, 2);
        put(view, p + 14, crcs[i], 4);
        put(view, p + 18, b.length, 4);
        put(view, p + 22, b.length, 4);
        put(view, p + 26, n.length, 2);
        put(view, p + 28, 0, 2);
        out.set(n, p + 30);
        out.set(b, p + 30 + n.length);
        p += 30 + n.length + b.length;
    }

    const cdStart = p;
    for (let i = 0; i < entries.length; i++) {
        const n = names[i];
        const b = entries[i].bytes;
        put(view, p, 0x02014b50, 4);
        put(view, p + 4, 20, 2);
        put(view, p + 6, 20, 2);
        put(view, p + 8, 0x0800, 2);
        put(view, p + 10, 0, 2);
        put(view, p + 12, 0, 2);
        put(view, p + 14, 0, 2);
        put(view, p + 16, crcs[i], 4);
        put(view, p + 20, b.length, 4);
        put(view, p + 24, b.length, 4);
        put(view, p + 28, n.length, 2);
        put(view, p + 30, 0, 2);
        put(view, p + 32, 0, 2);
        put(view, p + 34, 0, 2);
        put(view, p + 36, 0, 2);
        put(view, p + 38, 0, 4);
        put(view, p + 42, offsets[i], 4);
        out.set(n, p + 46);
        p += 46 + n.length;
    }

    put(view, p, 0x06054b50, 4);
    put(view, p + 4, 0, 2);
    put(view, p + 6, 0, 2);
    put(view, p + 8, entries.length, 2);
    put(view, p + 10, entries.length, 2);
    put(view, p + 12, p - cdStart, 4);
    put(view, p + 16, cdStart, 4);
    put(view, p + 20, 0, 2);
    return out;
}
