/**
 * JPEG 에서 **찍은 날** 한 값만 꺼낸다.
 *
 * 왜 필요한가: 목록의 수정한 날짜 칸이 늘 비어 있었다. 색인에 시각 자체가 없었다.
 * 디스크의 수정 시각은 공짜로 담을 수 있지만, 사진은 그 값이 **옮긴 날**로 덮이는 일이 잦다.
 * 복사, 내려받기, 백업 한 번이면 전부 같은 날이 된다. 그래서 찍은 날을 따로 본다.
 *
 * 왜 직접 읽나: 이 화면은 바깥 꾸러미를 안 쓴다. 그리고 필요한 것이 태그 하나뿐이다.
 * 방향, GPS, 기종은 안 읽는다. 필요해지면 그때 늘린다.
 *
 * 안 읽는 것: PNG, WebP, HEIC, 그리고 영상. 영상의 촬영 시각은 컨테이너마다 자리가 달라
 * ffprobe 를 따로 돌려야 한다. 지금은 그 자리에 디스크 수정 시각이 선다.
 */

/** 앞쪽 이만큼만 본다. EXIF 는 파일 머리에 있다. 4MB 사진을 통째로 읽을 이유가 없다 */
export const HEAD_BYTES = 128 * 1024;

const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;

/** `2024:03:07 18:22:05` 를 ms 로. KST 로 읽는다. EXIF 에는 시간대가 안 적힌다 */
export function parseExifDate(text) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text).trim());
    if (!m) return 0;
    const [, y, mo, d, h, mi, s] = m.map(Number);
    if (!y || !mo || !d) return 0;
    /* 시간대가 없다. 이 저장소의 사진은 한국에서 찍혔다고 본다 */
    const ms = Date.UTC(y, mo - 1, d, h, mi, s) - 9 * 3600000;
    return Number.isFinite(ms) ? ms : 0;
}

function readAscii(view, off, len) {
    let out = '';
    for (let i = 0; i < len; i++) {
        const c = view.getUint8(off + i);
        if (c === 0) break;
        out += String.fromCharCode(c);
    }
    return out;
}

/** IFD 한 판을 훑어 원하는 태그를 줍는다. 반환은 `{ dates, exifOff }` */
function scanIfd(view, tiff, ifd, little) {
    const out = { dates: {}, exifOff: 0 };
    if (ifd + 2 > view.byteLength) return out;
    const count = view.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > view.byteLength) break;
        const tag = view.getUint16(e, little);
        const len = view.getUint32(e + 4, little);
        const valOff = len <= 4 ? e + 8 : tiff + view.getUint32(e + 8, little);
        if (tag === TAG_EXIF_IFD) {
            out.exifOff = tiff + view.getUint32(e + 8, little);
        } else if (tag === TAG_DATE_TIME_ORIGINAL || tag === TAG_DATE_TIME) {
            if (valOff + Math.min(len, 20) <= view.byteLength) {
                out.dates[tag] = readAscii(view, valOff, Math.min(len, 20));
            }
        }
    }
    return out;
}

/**
 * 찍은 날 ms. 못 찾으면 0.
 * @param {Uint8Array} bytes 파일 앞부분이면 충분하다
 */
export function exifTakenAt(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12) return 0;
    /* JPEG 머리 */
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    /* APP1 조각을 찾아 걷는다. 조각마다 길이가 적혀 있어 건너뛸 수 있다 */
    let p = 2;
    let app1 = -1;
    while (p + 4 <= view.byteLength) {
        if (view.getUint8(p) !== 0xff) break;
        const marker = view.getUint8(p + 1);
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            p += 2;
            continue;
        }
        /* 화면 자료가 시작되면 EXIF 는 없다 */
        if (marker === 0xda || marker === 0xd9) break;
        const len = view.getUint16(p + 2, false);
        if (marker === 0xe1) {
            app1 = p + 4;
            break;
        }
        p += 2 + len;
    }
    if (app1 < 0 || app1 + 8 > view.byteLength) return 0;
    if (readAscii(view, app1, 4) !== 'Exif') return 0;

    const tiff = app1 + 6;
    if (tiff + 8 > view.byteLength) return 0;
    const order = view.getUint16(tiff, false);
    /* `II` 는 작은 끝 먼저, `MM` 은 큰 끝 먼저. 둘 다 실제로 쓰인다 */
    const little = order === 0x4949;
    if (!little && order !== 0x4d4d) return 0;
    if (view.getUint16(tiff + 2, little) !== 42) return 0;

    const ifd0 = tiff + view.getUint32(tiff + 4, little);
    const first = scanIfd(view, tiff, ifd0, little);
    let taken = first.dates[TAG_DATE_TIME_ORIGINAL];
    if (!taken && first.exifOff) {
        const sub = scanIfd(view, tiff, first.exifOff, little);
        taken = sub.dates[TAG_DATE_TIME_ORIGINAL] || sub.dates[TAG_DATE_TIME];
    }
    /* 찍은 날이 없으면 파일이 적어 둔 날짜라도 */
    if (!taken) taken = first.dates[TAG_DATE_TIME];
    return taken ? parseExifDate(taken) : 0;
}

/** 이 갈래에서 찍은 날을 찾아볼까 */
export function hasExif(rel) {
    const name = String(rel).toLowerCase();
    return name.endsWith('.jpg') || name.endsWith('.jpeg');
}
