import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTrash,
    emptyTrash,
    inTrash,
    normalizeTrash,
    putTrash,
    takeTrash,
    trashSummary
} from '../src/trash.mjs';
import { allowedKey, writableKey } from '../src/blob-key.mjs';
import { createVault, fetchStore, memoryStore, putFile, readTrash, writeTrash } from '../src/vault.mjs';

const files = [
    { path: 'a/x.png', size: 100 },
    { path: 'a/y.png', size: 200 },
    { path: 'a/z.png', size: 300 }
];

test('버리고 되살리기', () => {
    let t = putTrash(emptyTrash(), ['a/x.png'], 1000);
    assert.equal(inTrash(t, 'a/x.png'), true);
    /* 두 번 버려도 처음 버린 때가 남는다. 그게 알고 싶은 값이다 */
    t = putTrash(t, ['a/x.png'], 9999);
    assert.equal(t.items['a/x.png'], 1000);
    t = takeTrash(t, ['a/x.png']);
    assert.equal(inTrash(t, 'a/x.png'), false);
});

test('목록에서 버린 것을 빼고, 휴지통 보기에서는 그것만', () => {
    const t = putTrash(emptyTrash(), ['a/y.png'], 1);
    assert.deepEqual(applyTrash(files, t).map((f) => f.path), ['a/x.png', 'a/z.png']);
    assert.deepEqual(applyTrash(files, t, { showTrash: true }).map((f) => f.path), ['a/y.png']);
});

test('깨진 값이 와도 화면이 안 죽는다', () => {
    /* 휴지통 하나 때문에 저장소 전체가 안 열리면 안 된다 */
    assert.deepEqual(normalizeTrash(null), emptyTrash());
    assert.deepEqual(normalizeTrash('아님'), emptyTrash());
    assert.deepEqual(normalizeTrash({ items: 'x' }), emptyTrash());
    /* 말이 안 되는 줄은 버린다 */
    const t = normalizeTrash({ items: { 'a/x.png': 5, 'a/y.png': 'x', '': 9 } });
    assert.deepEqual(Object.keys(t.items), ['a/x.png']);
});

test('몇 개, 합쳐서 몇 바이트', () => {
    const t = putTrash(emptyTrash(), ['a/x.png', 'a/z.png'], 1);
    assert.deepEqual(trashSummary(files, t), { count: 2, bytes: 400 });
});

test('화면이 쓸 수 있는 키는 휴지통 하나뿐', () => {
    /* 색인이나 열쇠 재료를 화면에서 쓸 수 있으면 세션 하나로 저장소가 잠긴다 */
    assert.equal(writableKey('trash'), true);
    assert.equal(writableKey('idx'), false);
    assert.equal(writableKey('hdr'), false);
    assert.equal(writableKey('c/abc/0'), false);
    assert.equal(writableKey('t/abc'), false);
    /* 되돌릴 판은 읽을 수 있어야 한다 */
    assert.equal(allowedKey('trash'), true);
    assert.equal(allowedKey('trash.bak'), true);
});

test('클라우드에 담고 꺼낸다. 없으면 빈 것', async () => {
    const s = await createVault(memoryStore(), 'pw', { iterations: 1000 });
    await putFile(s, 'a/x.png', new Uint8Array([1]));
    assert.deepEqual(await readTrash(s), emptyTrash(), '없는 것은 고장이 아니다');
    await writeTrash(s, putTrash(emptyTrash(), ['a/x.png'], 1234));
    assert.deepEqual((await readTrash(s)).items, { 'a/x.png': 1234 });
});

test('화면 저장소는 휴지통만 쓴다', async () => {
    const calls = [];
    const store = fetchStore('https://x/blob', async (url, opt) => {
        calls.push([url, opt?.method ?? 'GET']);
        return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    await store.put('trash', new Uint8Array([1]));
    assert.deepEqual(calls.at(-1), ['https://x/blob/trash', 'PUT']);
    await assert.rejects(() => store.put('idx', new Uint8Array([1])), /read-only/);
    await assert.rejects(() => store.put('c/abc/0', new Uint8Array([1])), /read-only/);
});
