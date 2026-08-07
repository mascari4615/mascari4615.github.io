/**
 * KarmoLab 그림 올리기 (TASK-KL-098).
 *
 * 왜 있나: 「자랑」 갤러리인데 그림을 못 올렸다. 커뮤니티에서 그림이 안 되면 자랑도 질문도
 * 반쪽이 된다 (「이렇게 나와요」를 글로만 설명해야 한다).
 *
 * 어떻게: 브라우저가 그림을 글자로 바꿔 보내면 서버가 파일로 떨군다. 남의 저장소를 안 쓴다 —
 * 이 사이트의 다른 것들과 같은 원칙이다(넣은 것이 남의 서버로 안 간다).
 *
 * 지키는 것 셋:
 *  - **그림만.** 받은 바이트의 앞머리를 직접 확인한다. 확장자나 사람이 말한 종류를 안 믿는다
 *    (그건 얼마든지 거짓말할 수 있고, 그렇게 스크립트 파일이 올라간다).
 *  - **크기 상한.** 노트북 한 대가 서버라 큰 파일이 몇 개만 와도 디스크가 찬다.
 *  - **사람마다 하루 상한.** 한 사람이 디스크를 다 먹지 못하게.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

/** 한 장 최대 크기. 사진 한 장으로는 넉넉하고, 디스크를 지키기에는 충분히 작다. */
export const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

/** 한 사람이 하루에 올릴 수 있는 장 수. */
export const UPLOAD_DAILY_LIMIT = 20;

function uploadDir(): string {
    return path.join(PKG_ROOT, 'data', 'uploads');
}

/**
 * 바이트 앞머리로 진짜 종류를 알아낸다 (magic number).
 * 사람이 말한 종류는 안 믿는다 — 그게 이 함수가 있는 이유다.
 */
export function sniffImage(bytes: Buffer): { ext: string; mime: string } | null {
    if (bytes.length < 12) return null;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { ext: 'png', mime: 'image/png' };
    }
    if (bytes.subarray(0, 6).toString('latin1') === 'GIF89a' || bytes.subarray(0, 6).toString('latin1') === 'GIF87a') {
        return { ext: 'gif', mime: 'image/gif' };
    }
    if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
        return { ext: 'webp', mime: 'image/webp' };
    }
    return null;
}

/** 오늘 이 사람이 몇 장 올렸나 — 파일 이름에 날짜와 사람이 들어 있어 세기만 하면 된다. */
export function uploadsTodayBy(accountId: string, now: Date = new Date()): number {
    const day = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `${day}-${accountId.slice(0, 8)}-`;
    try {
        return fs.readdirSync(uploadDir()).filter((name) => name.startsWith(prefix)).length;
    } catch {
        return 0;
    }
}

export interface SavedUpload {
    id: string;
    url: string;
    bytes: number;
    mime: string;
}

/**
 * 그림을 저장한다.
 * @returns 저장했으면 정보, 아니면 왜 안 됐는지.
 */
export function saveImage(
    bytes: Buffer,
    accountId: string,
    now: Date = new Date(),
): { ok: true; saved: SavedUpload } | { ok: false; reason: 'too_big' | 'not_image' | 'daily_limit' | 'write_failed' } {
    if (bytes.length > UPLOAD_MAX_BYTES) return { ok: false, reason: 'too_big' };
    const kind = sniffImage(bytes);
    if (!kind) return { ok: false, reason: 'not_image' };
    if (uploadsTodayBy(accountId, now) >= UPLOAD_DAILY_LIMIT) return { ok: false, reason: 'daily_limit' };

    const day = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const id = `${day}-${accountId.slice(0, 8)}-${crypto.randomBytes(5).toString('hex')}.${kind.ext}`;
    try {
        fs.mkdirSync(uploadDir(), { recursive: true });
        fs.writeFileSync(path.join(uploadDir(), id), bytes);
    } catch (error) {
        console.error('[karmolab-uploads] 그림 저장 실패:', error);
        return { ok: false, reason: 'write_failed' };
    }
    return { ok: true, saved: { id, url: `/kl/img/${id}`, bytes: bytes.length, mime: kind.mime } };
}

/** 저장된 그림 읽기. 이름에 경로가 섞여 들어오지 못하게 막는다. */
export function readImage(id: string): { bytes: Buffer; mime: string } | null {
    if (!/^\d{8}-[a-z0-9-]{1,10}-[a-f0-9]{10}\.(jpg|png|gif|webp)$/.test(id)) return null;
    try {
        const bytes = fs.readFileSync(path.join(uploadDir(), id));
        const kind = sniffImage(bytes);
        return kind ? { bytes, mime: kind.mime } : null;
    } catch {
        return null;
    }
}
