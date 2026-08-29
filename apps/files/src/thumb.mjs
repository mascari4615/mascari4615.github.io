/**
 * 미리보기 한 장을 **무엇에서, 어떻게** 굽나.
 *
 * 왜 여기서 굽나: 브라우저는 못 굽는다. 영상 대부분이 HEVC 라 WebView 가 화면을 못 풀고,
 * 굽자고 100MB 를 받아 오는 것 자체가 액자가 피하려던 일이다. 그래서 **올리는 쪽**에서
 * 한 번 구워 클라우드에 같이 넣는다. 화면은 수십 KB 한 장만 받는다.
 *
 * 값 (2026-08-29 실측, 4032x3024 JPEG 한 장): 원본 322KB 가 320px 미리보기에서 11.7KB. 28배.
 * 잔무늬가 빽빽한 시험용 그림이라 사진은 이보다 더 줄어든다.
 * 영상은 첫 프레임이 검은 경우가 많아 **10% 지점**을 뽑는다.
 *
 * 여기 있는 것은 판단과 명령 줄뿐이다. 실제 실행은 `thumb-node.mjs`.
 */

/** 미리보기 긴 변. 액자 제일 큰 칸이 320px 이라 그 배는 안 필요하다 */
export const THUMB_MAX = 320;

/** 이보다 작은 그림은 원본이 곧 미리보기다. 두 번 둘 이유가 없다 */
export const SKIP_UNDER = 64 * 1024;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv', '.avi', '.wmv']);

function extOf(rel) {
    const name = String(rel).slice(String(rel).lastIndexOf('/') + 1);
    const i = name.lastIndexOf('.');
    return i <= 0 ? '' : name.slice(i).toLowerCase();
}

/** 이 파일에서 미리보기를 구울까. `null` 이면 안 굽는다 */
export function thumbKind(rel, size) {
    const e = extOf(rel);
    if (VIDEO_EXT.has(e)) return 'video';
    if (!IMAGE_EXT.has(e)) return null;
    /* 작은 그림은 원본이 곧 미리보기 */
    if (typeof size === 'number' && size < SKIP_UNDER) return null;
    return 'image';
}

/**
 * ffmpeg 명령 줄. 입력은 파일 경로, 출력도 파일 경로.
 *
 * `scale` 의 `-1` 은 비율 유지. `min(320,iw)` 은 원본보다 크게 늘리지 않기 위한 것.
 * 영상은 `-ss` 를 입력 앞에 둬야 빠르다. 뒤에 두면 처음부터 훑는다.
 */
export function ffmpegArgs(kind, input, output, opts = {}) {
    const max = opts.max ?? THUMB_MAX;
    const scale = `scale='min(${max},iw)':-1`;
    if (kind === 'video') {
        const at = Number.isFinite(opts.seconds) && opts.seconds > 0 ? opts.seconds : 1;
        /* 첫 프레임은 검은 경우가 많다. 조금 들어간 자리를 뽑는다 */
        return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', input,
            '-frames:v', '1', '-vf', scale, '-q:v', '4', output];
    }
    return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
        '-frames:v', '1', '-vf', scale, '-q:v', '4', output];
}

/** 영상 길이에서 어느 지점을 뽑나. 10%, 다만 1초와 10초 사이 */
export function seekPoint(durationSec) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
    return Math.min(10, Math.max(1, durationSec * 0.1));
}
