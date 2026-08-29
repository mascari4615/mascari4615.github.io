/**
 * 사진에 붙어 오는 정보 읽기 (TASK-KL-316 / 31, `exifclean` 과 공용)
 *
 * 이 셈은 원래 `exifclean` 위젯 **안에** 있었다. 사진 위치를 쓰는 도구가 하나 더 생기는 순간
 * 같은 파서가 두 벌이 되고, 한쪽만 고쳐지면 **같은 사진에 두 답**이 나온다. 그래서 여기로 뺀다.
 *
 * 읽는 것만 한다. 지우는 일(`strip`)은 그림 데이터를 다시 잇는 일이라 그쪽 도구에 남긴다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'exif',
  ops: {
    read: {
      desc: 'Read the camera, date and GPS position out of a JPEG (hex or base64 bytes).',
      in: { bytes: 'string' },
      out: 'string'
    }
  }
};

export interface ExifInfo {
  camera?: string;
  /** 렌즈 이름 (Exif SubIFD 0xA434) */
  lens?: string;
  /** `2026:08:14 09:00:00` 그대로 (형식을 여기서 바꾸지 않는다) */
  date?: string;
  gps?: { lat: number; lon: number };
  orientation?: number;
  software?: string;
}

/** JPEG 안의 구획들을 훑는다. `0xFFE1` 이 EXIF 가 담기는 자리다. */
export function segments(bytes: Uint8Array): Array<{ marker: number; start: number; length: number }> {
  const out: Array<{ marker: number; start: number; length: number }> = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return out;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1];
    if (marker === 0xd9 || marker === 0xda) break; // 그림 데이터가 시작되면 그만
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    out.push({ marker, start: at, length });
    at += 2 + length;
  }
  return out;
}

const TAGS: Record<number, keyof ExifInfo> = {
  0x010f: 'camera',
  0x0110: 'camera',
  0x0131: 'software',
  0xa434: 'lens',
  0x0132: 'date',
  0x9003: 'date'
};

/** JPEG 바이트에서 정보를 읽는다. EXIF 가 없으면 **빈 것**을 돌려준다(없는 건 잘못이 아니다). */
export function read(bytes: Uint8Array): ExifInfo {
  const info: ExifInfo = {};
  const app1 = segments(bytes).find((s) => s.marker === 0xe1);
  if (app1 === undefined) return info;

  const base = app1.start + 4 + 6; // 구획 머리 + 'Exif\0\0'
  if (base + 8 > bytes.length) return info;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /* 바이트 순서가 파일마다 다르다. 여기서 안 정하면 숫자가 전부 엉뚱해진다. */
  const little = view.getUint16(base) === 0x4949;
  const first = view.getUint32(base + 4, little);

  /*
   * 규격은 ASCII 라고 하지만 **카메라, 프로그램이 UTF-8 을 그냥 쓴다** (한글 이름이 그렇게 들어온다).
   * 한 글자씩 코드로 읽으면 그게 깨진다. UTF-8 로 읽어 보고, 아니면 있는 그대로 둔다.
   */
  const ascii = (off: number, count: number): string => {
    const slice = bytes.slice(off, off + Math.max(0, count - 1));
    const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    return text.replace(/\0+$/, '').trim();
  };
  const rational = (off: number): number => {
    const a = view.getUint32(off, little);
    const b = view.getUint32(off + 4, little);
    return b === 0 ? 0 : a / b;
  };

  const walk = (offset: number, gps = false): number => {
    const at = base + offset;
    if (at + 2 > bytes.length) return 0;
    const count = view.getUint16(at, little);
    let sub = 0;
    const gpsValues: Record<number, number[]> = {};
    const gpsRefs: Record<number, string> = {};

    for (let i = 0; i < count; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > bytes.length) break;
      const tag = view.getUint16(e, little);
      const type = view.getUint16(e + 2, little);
      const num = view.getUint32(e + 4, little);
      const sizeOf: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
      const length = (sizeOf[type] ?? 1) * num;
      const valueAt = length > 4 ? base + view.getUint32(e + 8, little) : e + 8;

      if (gps) {
        if (type === 5 && (tag === 0x0002 || tag === 0x0004)) {
          gpsValues[tag] = [rational(valueAt), rational(valueAt + 8), rational(valueAt + 16)];
        } else if (type === 2 && (tag === 0x0001 || tag === 0x0003)) {
          gpsRefs[tag] = ascii(valueAt, num);
        }
        continue;
      }

      if (tag === 0x8769) sub = view.getUint32(e + 8, little);
      else if (tag === 0x8825) walk(view.getUint32(e + 8, little), true);
      else if (TAGS[tag] !== undefined && type === 2) {
        const text = ascii(valueAt, num);
        if (text === '') continue;
        const key = TAGS[tag];
        if (key === 'camera') info.camera = info.camera === undefined ? text : (info.camera + ' ' + text).trim();
        else if (key === 'date') info.date = tag === 0x9003 ? text : info.date ?? text;
        else if (key === 'software') info.software = text;
        else if (key === 'lens') info.lens = text;
      } else if (tag === 0x0112 && type === 3) {
        info.orientation = view.getUint16(valueAt, little);
      }
    }

    if (gps && gpsValues[0x0002] !== undefined && gpsValues[0x0004] !== undefined) {
      const dms = (v: number[]): number => v[0] + v[1] / 60 + v[2] / 3600;
      info.gps = {
        lat: dms(gpsValues[0x0002]) * (gpsRefs[0x0001] === 'S' ? -1 : 1),
        lon: dms(gpsValues[0x0004]) * (gpsRefs[0x0003] === 'W' ? -1 : 1)
      };
    }
    return sub;
  };

  const subOffset = walk(first);
  if (subOffset !== 0) walk(subOffset);
  return info;
}

/** `2026:08:14 09:00:00` → 밀리초. 못 읽으면 없음(지어내지 않는다). */
export function dateToMs(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (m === null) return undefined;
  const ms = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6]);
  return Number.isNaN(ms) ? undefined : ms;
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'read') throw new Error('exif: 모르는 연산 ' + op);
  const text = String(args.bytes ?? '').replace(/\s/g, '');
  const bytes = new Uint8Array(Math.floor(text.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  const info = read(bytes);
  return [
    info.camera === undefined ? '' : 'camera: ' + info.camera,
    info.date === undefined ? '' : 'date: ' + info.date,
    info.gps === undefined ? '' : 'gps: ' + info.gps.lat.toFixed(6) + ', ' + info.gps.lon.toFixed(6)
  ]
    .filter((s) => s !== '')
    .join('\n');
};
