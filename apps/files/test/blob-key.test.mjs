import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allowedKey, immutableKey } from '../src/blob-key.mjs';

test('아는 모양만 내준다', () => {
    assert.equal(allowedKey('hdr'), true);
    assert.equal(allowedKey('idx'), true);
    assert.equal(allowedKey('c/0123abcdef/0'), true);
    assert.equal(allowedKey('c/0123abcdef/17'), true);
    /* 미리보기. 이 줄이 없어서 배포됐으면 액자가 전부 400 이었다 (2026-08-29) */
    assert.equal(allowedKey('t/0123abcdef'), true);
});

test('버킷의 다른 자리를 주소로 훑을 수 없다', () => {
    assert.equal(allowedKey(''), false);
    assert.equal(allowedKey('../secret'), false);
    assert.equal(allowedKey('c/../hdr'), false);
    assert.equal(allowedKey('t/'), false);
    assert.equal(allowedKey('t/ZZZZ'), false, 'id 는 hex 만');
    assert.equal(allowedKey('c/0123abcdef'), false, '조각 번호가 있어야 한다');
    assert.equal(allowedKey('c/0123abcdef/x'), false);
    assert.equal(allowedKey('hdr2'), false);
    assert.equal(allowedKey(null), false);
});

test('한 번 쓰이면 안 바뀌는 것만 오래 잡아 둔다', () => {
    /* hdr 과 idx 는 파일이 늘 때마다 바뀐다. 잡아 두면 옛 색인을 본다 */
    assert.equal(immutableKey('c/0123abcdef/0'), true);
    assert.equal(immutableKey('t/0123abcdef'), true);
    assert.equal(immutableKey('hdr'), false);
    assert.equal(immutableKey('idx'), false);
});

test('worker 가 이 규칙을 쓴다', async () => {
    /* 규칙을 따로 빼 놓고 worker 안에 옛 정규식이 남아 있으면 아무 소용이 없다 */
    const code = await readFile(new URL('../worker.mjs', import.meta.url), 'utf8');
    assert.ok(code.includes("from './src/blob-key.mjs'"), 'worker 가 규칙을 불러와야 한다');
    assert.ok(code.includes('allowedKey(key)'));
    assert.ok(!/\/\^\(hdr\|idx/.test(code), '옛 정규식이 남아 있으면 안 된다');
});
