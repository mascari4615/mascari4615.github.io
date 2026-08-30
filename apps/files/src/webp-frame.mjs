/**
 * 애니메이션 WebP 에서 **첫 장면 하나**를 뽑아 정지 WebP 로 감싼다.
 *
 * 왜 필요한가 (2026-08-29 실측): 미리보기를 못 구운 18개 중 12개가 애니메이션 WebP 였다.
 * ffmpeg 의 `webp` 디코더는 그것을 못 읽는다 (`image data not found`).
 * 이 기계의 ffmpeg 에는 `libwebp_anim` 디코더가 아예 없다.
 *
 * 어떻게: 애니메이션 WebP 는 RIFF 통 안에 `VP8X`, `ANIM`, 그리고 장면마다 `ANMF` 가 든다.
 * `ANMF` 안에는 머리 16바이트 뒤에 보통 WebP 조각(`VP8 ` 또는 `VP8L`)이 그대로 들어 있다.
 * 그 조각만 꺼내 `RIFF....WEBPVP8 ....` 로 다시 싸면 어떤 디코더든 읽는 정지 그림이 된다.
 *
 * 안 하는 것: 투명도(`ALPH`). 미리보기라 없어도 된다. 있으면 건너뛰고 색만 가져온다.
 */

const RIFF = 0x52494646; /* 'RIFF' */

function tagAt(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

function u32(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
}

/** 이 바이트가 WebP 통인가 */
export function isWebp(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 16) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(0, false) === RIFF && tagAt(bytes, 8) === 'WEBP';
}

/** 장면이 여럿인가. 아니면 그대로 써도 된다 */
export function isAnimated(bytes) {
    if (!isWebp(bytes)) return false;
    let p = 12;
    while (p + 8 <= bytes.length) {
        const tag = tagAt(bytes, p);
        if (tag === 'ANMF' || tag === 'ANIM') return true;
        const len = u32(bytes, p + 4);
        p += 8 + len + (len % 2);
    }
    return false;
}

/**
 * 첫 장면을 정지 WebP 로. 못 뽑으면 null.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array|null}
 */
export function firstFrame(bytes) {
    if (!isAnimated(bytes)) return null;
    let p = 12;
    while (p + 8 <= bytes.length) {
        const tag = tagAt(bytes, p);
        const len = u32(bytes, p + 4);
        const body = p + 8;
        if (tag === 'ANMF') {
            /* ANMF 머리 16바이트: 자리(3+3), 크기(3+3), 머문 시간(3), 섞는 법(1) */
            let q = body + 16;
            const end = Math.min(bytes.length, body + len);
            while (q + 8 <= end) {
                const inner = tagAt(bytes, q);
                const innerLen = u32(bytes, q + 4);
                if (inner === 'VP8 ' || inner === 'VP8L') {
                    return wrapStill(inner, bytes.subarray(q + 8, Math.min(end, q + 8 + innerLen)));
                }
                /* 투명도 조각 등은 건너뛴다 */
                q += 8 + innerLen + (innerLen % 2);
            }
            return null;
        }
        p += body + len + (len % 2) - p;
    }
    return null;
}

/** 조각 하나를 RIFF 통에 다시 싸기 */
function wrapStill(tag, payload) {
    if (!payload.length) return null;
    const pad = payload.length % 2;
    const out = new Uint8Array(12 + 8 + payload.length + pad);
    const put4 = (off, s) => {
        for (let i = 0; i < 4; i++) out[off + i] = s.charCodeAt(i);
    };
    const putLE = (off, n) => {
        out[off] = n & 0xff;
        out[off + 1] = (n >>> 8) & 0xff;
        out[off + 2] = (n >>> 16) & 0xff;
        out[off + 3] = (n >>> 24) & 0xff;
    };
    put4(0, 'RIFF');
    /* RIFF 크기는 그 뒤 전부. 'WEBP' 넉 자부터 센다 */
    putLE(4, out.length - 8);
    put4(8, 'WEBP');
    put4(12, tag);
    putLE(16, payload.length);
    out.set(payload, 20);
    return out;
}
