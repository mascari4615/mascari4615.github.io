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

/* 줄 가르기. ffprobe 출력은 윈도우에서 CRLF 로 온다 */
const NL = String.fromCharCode(10);

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

/**
 * 영상 길이와 촬영 시각. 못 재면 둘 다 0.
 *
 * 촬영 시각은 컨테이너가 적어 둔 `creation_time` 이다. mp4, mov 는 대개 있고
 * 없는 것도 많다. 없으면 그 자리엔 디스크 수정 시각이 선다.
 *
 * ffprobe 한 판에 둘을 같이 받는다. 따로 부르면 영상마다 두 번 돈다.
 */
export async function probeVideo(input) {
    try {
        const out = await run('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration:format_tags=creation_time',
            '-of', 'default=noprint_wrappers=1', input,
        ], 20_000);
        let duration = 0;
        let createdAt = 0;
        for (const line of String(out).split(NL)) {
            const i = line.indexOf('=');
            if (i < 1) continue;
            const k = line.slice(0, i).trim();
            const v = line.slice(i + 1).trim();
            if (k === 'duration') {
                const n = Number(v);
                if (Number.isFinite(n)) duration = n;
            } else if (k.endsWith('creation_time')) {
                createdAt = parseCreationTime(v);
            }
        }
        return { duration, createdAt };
    } catch {
        return { duration: 0, createdAt: 0 };
    }
}

/**
 * ffprobe 가 주는 ISO 시각을 ms 로. 못 읽거나 말이 안 되는 값이면 0.
 *
 * 왜 아래를 자르나: 컨테이너가 시각을 안 적었을 때 1904년이나 1970년이 그대로 나온다.
 * 그 값을 시각으로 세우면 날짜순 맨 앞이 전부 그것으로 찬다.
 */
export function parseCreationTime(text) {
    const ms = Date.parse(String(text).trim());
    if (!Number.isFinite(ms)) return 0;
    const floor = Date.UTC(1990, 0, 1);
    if (ms < floor || ms > Date.now() + 86400000) return 0;
    return ms;
}

/**
 * 파일 하나에서 미리보기 바이트. 못 만들면 null.
 * @param {string} absPath 원본 파일 자리
 * @param {string} rel 클라우드 안 경로 (갈래 판단용)
 * @param {number} size 바이트
 * @param {{duration?:number}} [opts] 길이를 이미 쟀으면 넘긴다. ffprobe 를 두 번 안 돈다
 */
export async function makeThumb(absPath, rel, size, opts = {}) {
    const kind = thumbKind(rel, size);
    if (!kind) return null;
    if (!(await hasFfmpeg())) return null;
    const dir = await mkdtemp(join(tmpdir(), 'karm-thumb-'));
    const out = join(dir, 't.jpg');
    try {
        /* 길이를 이미 잰 자리에서 넘겨받으면 ffprobe 를 두 번 안 돈다 */
        const dur = kind === 'video'
            ? (Number.isFinite(opts.duration) ? opts.duration : (await probeVideo(absPath)).duration)
            : 0;
        const seconds = kind === 'video' ? seekPoint(dur) : 0;
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
