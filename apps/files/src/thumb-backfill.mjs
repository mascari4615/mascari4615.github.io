#!/usr/bin/env node
/**
 * 이미 올라간 파일들에 미리보기와 시각을 채운다.
 *
 * 왜 필요한가: 미리보기는 **올릴 때** 굽는다. 그래서 그 전에 올라간 것들은 영원히 없다
 * (열람 저장을 나중에 켰을 때와 같은 구멍이다, `mirror-backfill.mjs` 참고).
 *
 * 원본을 어디서 읽나 둘:
 * - `FILES_VAULT_ROOT` 아래 그 자리에 있으면 **디스크에서**. 빠르고 통신이 없다
 * - 없으면 클라우드에서 받아 복호한다. 느리므로 `--cloud` 를 줄 때만 한다
 *
 * 시각도 같은 판에 붙인다. 원본을 이미 손에 쥔 자리라 값이 거의 안 든다.
 * 두 번 훑으면 7,510개를 두 번 읽게 된다.
 *
 * 쓰기: node src/thumb-backfill.mjs [--cloud] [--limit N] [--dry-run]
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFilesEnv } from './env-file.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { getFile, listFiles, putThumb, setTimes, unlockVault } from './vault.mjs';
import { takenAtOf } from './vault-node.mjs';
import { teeStore } from './store-tee.mjs';
import { thumbKind } from './thumb.mjs';
import { hasFfmpeg, makeThumb, makeThumbFromBytes, probeVideo } from './thumb-node.mjs';

await loadFilesEnv();

function need(name) {
    const v = process.env[name];
    if (!v) {
        console.error(`없음: ${name}`);
        process.exit(2);
    }
    return v;
}

const pass = need('FILES_VAULT_PASS');
const root = process.env.FILES_VAULT_ROOT || '';
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const extraRemote = process.env.FILES_VAULT_R2 || '';
const useCloud = process.argv.includes('--cloud');
const dry = process.argv.includes('--dry-run');
const limitAt = process.argv.indexOf('--limit');
const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1]) || Infinity;

if (!(await hasFfmpeg())) {
    console.error('[thumb] 못 돌림. ffmpeg 없음');
    process.exit(2);
}

const daemon = await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = extraRemote ? rcloneStore(extraRemote, { rcUrl, delayMs: rcUrl ? 0 : 400 }) : null;
/* 미리보기는 늘 열람 저장까지 간다. 그게 화면이 보는 자리다 */
const store = extra ? teeStore(primary, extra) : primary;

const session = await unlockVault(store, pass);
console.log('클라우드 염');

const files = await listFiles(session);
/* 미리보기가 없거나 시각이 없으면 손볼 것이 있다 */
const todo = files.filter((f) => (!f.thumb && thumbKind(f.path, f.size)) || !(f.mtime || f.shot));
const noThumb = files.filter((f) => !f.thumb && thumbKind(f.path, f.size)).length;
const noTime = files.filter((f) => !(f.mtime || f.shot)).length;
console.log(`손볼 것 ${todo.length}개 (미리보기 ${noThumb}, 시각 ${noTime}) / 전체 ${files.length}개`);

let made = 0;
let timed = 0;
let fromDisk = 0;
let fromCloud = 0;
let skipped = 0;
let failed = 0;

for (const f of todo) {
    if (made >= limit) break;
    let bytes = null;
    let abs = '';
    if (root) {
        abs = join(root, ...f.path.split('/'));
        try {
            await stat(abs);
        } catch {
            abs = '';
        }
    }
    try {
        /* 시각은 디스크에 원본이 있을 때만. 클라우드 사본에는 원래 수정 시각이 없다 */
        const isVideo = thumbKind(f.path, f.size) === 'video';
        let video = null;
        if (abs && !(f.mtime || f.shot)) {
            const st = await stat(abs);
            /* 사진은 EXIF, 영상은 컨테이너가 적어 둔 촬영 시각 */
            if (isVideo) video = await probeVideo(abs);
            const shot = video ? video.createdAt : await takenAtOf(abs, f.path);
            if (!dry) await setTimes(session, f.path, { mtime: Math.round(st.mtimeMs), shot });
            timed += 1;
        }
        /* 미리보기가 이미 있거나 애초에 굽지 않는 갈래면 여기까지가 할 일이다 */
        if (f.thumb || !thumbKind(f.path, f.size)) continue;
        let thumb = null;
        if (abs) {
            thumb = await makeThumb(abs, f.path, f.size, { duration: video?.duration });
            if (thumb) fromDisk += 1;
        } else if (useCloud) {
            const got = await getFile(session, f.path);
            bytes = got?.bytes ?? null;
            if (bytes) {
                thumb = await makeThumbFromBytes(bytes, f.path, f.size);
                if (thumb) fromCloud += 1;
            }
        } else {
            skipped += 1;
            continue;
        }
        if (!thumb) {
            failed += 1;
            continue;
        }
        if (!dry) await putThumb(session, f.path, thumb);
        made += 1;
        if (made % 20 === 0) console.log(`구움 ${made} (디스크 ${fromDisk}, 클라우드 ${fromCloud}), 못 구움 ${failed}`);
    } catch {
        failed += 1;
    }
}

console.log(
    `끝. 구움 ${made} (디스크 ${fromDisk}, 클라우드 ${fromCloud}), 시각 ${timed}, ` +
    `원본 못 찾음 ${skipped}, 못 구움 ${failed}${dry ? ' (연습)' : ''}`,
);
await daemon?.stop?.();
