import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGone, rcloneStore } from '../src/store-rclone.mjs';

test('남이 데몬을 내린 것만 되살린다', () => {
    assert.equal(isGone(new Error('connect ECONNREFUSED 127.0.0.1:5572')), true);
    assert.equal(isGone(new Error('fetch failed')), true);
    /* 없는 파일이나 통신 제한은 데몬 문제가 아니다 */
    assert.equal(isGone(new Error('object not found')), false);
    assert.equal(isGone(new Error('RATE_LIMIT')), false);
});

test('데몬이 죽으면 다시 띄워 이어서 올린다', async () => {
    /* 2026-08-29: 영상 미러 백필이 끝나며 미리보기 백필을 같이 죽였다 */
    const seen = [];
    let first = true;
    const store = rcloneStore('r2:bucket', {
        rcUrl: 'http://127.0.0.1:5572',
        revive: async () => ({ url: 'http://127.0.0.1:5599' }),
        rcPut: async (url, fs, key) => {
            if (first) {
                first = false;
                throw new Error('connect ECONNREFUSED 127.0.0.1:5572');
            }
            seen.push([url, key]);
        },
        run: async () => Buffer.alloc(0),
    });
    await store.put('t/abc', new Uint8Array([1]));
    assert.deepEqual(seen, [['http://127.0.0.1:5599', 't/abc']]);
});

test('되살리기도 안 되면 데몬 없이 간다. 느릴 뿐 하던 일은 끝난다', async () => {
    const ran = [];
    const store = rcloneStore('r2:bucket', {
        rcUrl: 'http://127.0.0.1:5572',
        revive: async () => null,
        rcPut: async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:5572');
        },
        run: async (args) => {
            ran.push(args[0]);
            return Buffer.alloc(0);
        },
    });
    await store.put('t/abc', new Uint8Array([1]));
    assert.deepEqual(ran, ['rcat']);
});

test('데몬과 무관한 오류는 그대로 던진다', async () => {
    const store = rcloneStore('r2:bucket', {
        rcUrl: 'http://127.0.0.1:5572',
        tries: 1,
        rcPut: async () => {
            throw new Error('quota exceeded for bucket');
        },
        run: async () => Buffer.alloc(0),
    });
    await assert.rejects(() => store.put('t/abc', new Uint8Array([1])), /quota/);
});
