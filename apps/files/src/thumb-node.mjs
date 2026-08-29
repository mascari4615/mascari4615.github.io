/**
 * ffmpeg 을 실제로 돌려 미리보기 한 장 만들기. 판단은 `thumb.mjs`.
 *
 * ffmpeg 이 없으면 **조용히 건너뛴다**. 미리보기가 없다고 올리기를 멈출 이유는 없다.
 * 없는 것은 화면에서 갈래 글자로 떨어질 뿐이다.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegArgs, seekPoint, thumbKind } from './thumb.mjs';

let known = null;

/** ffmpeg 이 이 기계에 있나. 한 번만 묻는다 */
export async function hasFfmpeg() {
    if (known !== null) return known;
    known = await new Promise((resolve) => {
        execFile('ffmpeg', ['-version'], { windowsHide: true }, (err) => resolve(!err));
    });
    return known;
}

function run(cmd, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
            if (err) reject(err);
            else resolve(String(stdout));
        });
    });
}

/** 영상 길이(초). 못 재면 0 */
async function durationOf(input) {
    try {
        const out = await run('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', input,
        ], 20_000);
        const n = Number(String(out).trim());
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

/**
 * 파일 하나에서 미리보기 바이트. 못 만들면 null.
 * @param {string} absPath 원본 파일 자리
 * @param {string} rel 클라우드 안 경로 (갈래 판단용)
 * @param {number} size 바이트
 */
export async function makeThumb(absPath, rel, size) {
    const kind = thumbKind(rel, size);
    if (!kind) return null;
    if (!(await hasFfmpeg())) return null;
    const dir = await mkdtemp(join(tmpdir(), 'karm-thumb-'));
    const out = join(dir, 't.jpg');
    try {
        const seconds = kind === 'video' ? seekPoint(await durationOf(absPath)) : 0;
        /* 한 장 굽는 데 1분을 넘기면 뭔가 잘못된 것이다. 전송을 붙잡아 두지 않는다 */
        await run('ffmpeg', ffmpegArgs(kind, absPath, out, { seconds }), 60_000);
        return new Uint8Array(await readFile(out));
    } catch {
        return null;
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

/**
 * 바이트에서 바로. 클라우드에만 있는 파일(이미 올라간 것)을 채울 때 쓴다.
 * ffmpeg 은 파일을 읽으므로 임시로 한 번 적는다.
 */
export async function makeThumbFromBytes(bytes, rel, size) {
    const kind = thumbKind(rel, size ?? bytes.length);
    if (!kind) return null;
    if (!(await hasFfmpeg())) return null;
    const dir = await mkdtemp(join(tmpdir(), 'karm-thumb-'));
    const src = join(dir, 'src' + rel.slice(rel.lastIndexOf('.')));
    try {
        await writeFile(src, bytes);
        return await makeThumb(src, rel, size ?? bytes.length);
    } catch {
        return null;
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}
