import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SKIP_UNDER, THUMB_MAX, ffmpegArgs, seekPoint, thumbKind } from '../src/thumb.mjs';
import { hasFfmpeg, makeThumb } from '../src/thumb-node.mjs';
import { createVault, getThumb, listFiles, memoryStore, putFile, putThumb, thumbKeys } from '../src/vault.mjs';

test('무엇에서 굽나', () => {
    assert.equal(thumbKind('a/b.mp4', 900), 'video');
    assert.equal(thumbKind('a/b.mkv', 900), 'video', '화면이 못 여는 갈래도 칸은 보여야 한다');
    assert.equal(thumbKind('a/b.jpg', SKIP_UNDER + 1), 'image');
    /* 작은 그림은 원본이 곧 미리보기다. 두 번 둘 이유가 없다 */
    assert.equal(thumbKind('a/b.jpg', 1000), null);
    assert.equal(thumbKind('a/b.zip', 9_000_000), null);
});

test('영상은 첫 프레임이 아니라 조금 들어간 자리', () => {
    /* 첫 프레임은 검은 경우가 많다 */
    assert.equal(seekPoint(0), 1);
    assert.equal(seekPoint(5), 1);
    assert.equal(seekPoint(60), 6);
    assert.equal(seekPoint(6000), 10, '긴 영상도 10초를 안 넘는다');
});

test('영상은 -ss 를 입력 앞에 둔다', () => {
    /* 뒤에 두면 처음부터 훑어 몇 분이 걸린다 */
    const args = ffmpegArgs('video', 'in.mp4', 'out.jpg', { seconds: 3 });
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
    assert.equal(args[args.indexOf('-ss') + 1], '3');
    assert.ok(args.join(' ').includes(`min(${THUMB_MAX},iw)`));
});

test('클라우드는 미리보기를 따로 담고 따로 꺼낸다', async () => {
    const store = memoryStore();
    const s = await createVault(store, 'pw', { iterations: 1000 });
    await putFile(s, 'a/b.png', new Uint8Array([1, 2, 3]));
    assert.equal(await getThumb(s, 'a/b.png'), null, '없는 것은 고장이 아니다');

    const shot = new Uint8Array([9, 9, 9, 9]);
    const put = await putThumb(s, 'a/b.png', shot);
    assert.equal(put.size, 4);
    const got = await getThumb(s, 'a/b.png');
    assert.deepEqual([...got.bytes], [9, 9, 9, 9]);

    const row = (await listFiles(s)).find((f) => f.path === 'a/b.png');
    assert.equal(row.thumb, 4);
    /* 열람 저장에 늘 올려야 하므로 키가 따로 나와야 한다 */
    assert.deepEqual((await thumbKeys(s)).map((t) => t.path), ['a/b.png']);
});

test('미리보기는 청크 자리에 갖다 놔도 안 열린다', async () => {
    /* 다른 AAD 를 쓰는 이유. 같으면 바꿔치기가 통한다 */
    const store = memoryStore();
    const s = await createVault(store, 'pw', { iterations: 1000 });
    await putFile(s, 'a.bin', new Uint8Array([1, 2, 3]));
    await putThumb(s, 'a.bin', new Uint8Array([7, 7]));
    const snap = new Map(store.snapshot());
    const thumbKey = [...snap.keys()].find((k) => k.startsWith('t/'));
    const chunkKey = [...snap.keys()].find((k) => k.startsWith('c/'));
    await store.put(chunkKey, snap.get(thumbKey));
    await assert.rejects(() => import('../src/vault.mjs').then((m) => m.getFile(s, 'a.bin')));
});

test('진짜 영상에서 한 장을 굽는다', async (t) => {
    if (!(await hasFfmpeg())) return t.skip('이 기계에 ffmpeg 없음');
    const dir = await mkdtemp(join(tmpdir(), 'thumbtest-'));
    try {
        const mp4 = join(dir, 'clip.mp4');
        await new Promise((resolve, reject) => {
            import('node:child_process').then(({ execFile }) => {
                execFile(
                    'ffmpeg',
                    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
                        '-i', 'testsrc=size=640x480:rate=10:duration=3', mp4],
                    { windowsHide: true },
                    (e) => (e ? reject(e) : resolve()),
                );
            });
        });
        const size = (await readFile(mp4)).length;
        const shot = await makeThumb(mp4, 'clip.mp4', size);
        assert.ok(shot && shot.length > 0, '한 장이 나와야 한다');
        assert.equal(shot[0], 0xff, 'JPEG 머리');
        assert.equal(shot[1], 0xd8);
        /* 원본보다 훨씬 작아야 의미가 있다 */
        assert.ok(shot.length < size, `${shot.length} < ${size}`);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('굽지 않는 갈래는 조용히 null', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'thumbtest-'));
    try {
        const p = join(dir, 'a.zip');
        await writeFile(p, 'x');
        assert.equal(await makeThumb(p, 'a.zip', 1), null);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('말이 안 되는 촬영 시각은 안 받는다', async () => {
    const { parseCreationTime } = await import('../src/thumb-node.mjs');
    /* 컨테이너가 시각을 안 적으면 1904년이나 1970년이 그대로 나온다.
       그걸 세우면 날짜순 맨 앞이 전부 그것으로 찬다 */
    assert.equal(parseCreationTime('1904-01-01T00:00:00.000000Z'), 0);
    assert.equal(parseCreationTime('1970-01-01T00:00:00.000000Z'), 0);
    assert.equal(parseCreationTime('아님'), 0);
    assert.equal(parseCreationTime(''), 0);
    /* 내일 찍힌 영상은 없다 */
    assert.equal(parseCreationTime(new Date(Date.now() + 5 * 86400000).toISOString()), 0);
    assert.equal(
        parseCreationTime('2024-03-07T09:22:05.000000Z'),
        Date.UTC(2024, 2, 7, 9, 22, 5)
    );
});

test('진짜 영상에서 길이와 촬영 시각을 한 판에 잰다', async (t) => {
    const { probeVideo } = await import('../src/thumb-node.mjs');
    if (!(await hasFfmpeg())) return t.skip('이 기계에 ffmpeg 없음');
    const dir = await mkdtemp(join(tmpdir(), 'probetest-'));
    try {
        const mp4 = join(dir, 'clip.mp4');
        await new Promise((resolve, reject) => {
            import('node:child_process').then(({ execFile }) => {
                execFile(
                    'ffmpeg',
                    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
                        '-i', 'testsrc=size=320x240:rate=10:duration=2',
                        '-metadata', 'creation_time=2024-03-07T09:22:05Z', mp4],
                    { windowsHide: true },
                    (e) => (e ? reject(e) : resolve()),
                );
            });
        });
        const got = await probeVideo(mp4);
        assert.ok(Math.abs(got.duration - 2) < 0.5, `길이 ${got.duration}`);
        assert.equal(got.createdAt, Date.UTC(2024, 2, 7, 9, 22, 5));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
