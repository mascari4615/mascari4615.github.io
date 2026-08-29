import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, infoRows, shortHash, withCommas } from '../src/fileinfo.mjs';

const fmtSize = (n) => `${n} B`;
const entry = { size: 1234567, chunks: 3, sha256: 'a'.repeat(64) };

test('정확한 바이트를 같이 보여 준다', () => {
    assert.equal(withCommas(1234567), '1,234,567');
    assert.equal(withCommas(0), '0');
});

test('길이는 한 시간을 넘으면 자리를 하나 더', () => {
    assert.equal(fmtDuration(83), '1:23');
    assert.equal(fmtDuration(3723), '1:02:03');
    assert.equal(fmtDuration(NaN), '');
});

test('해시는 앞뒤만', () => {
    assert.equal(shortHash('a'.repeat(64)), 'aaaaaaaaaa...aaaaaa');
    assert.equal(shortHash('short'), 'short');
});

test('색인에 있는 것만으로도 줄이 선다', () => {
    const rows = infoRows('사진/2024/a.png', entry, { kind: 'image', fmtSize });
    const map = new Map(rows);
    assert.equal(map.get('이름'), 'a.png');
    assert.equal(map.get('폴더'), '사진/2024');
    assert.equal(map.get('갈래'), '그림');
    assert.equal(map.get('크기'), '1234567 B (1,234,567 B)');
    assert.equal(map.get('조각'), '3개');
});

test('뿌리에 있는 파일도 폴더 칸이 빈 채로 안 남는다', () => {
    const map = new Map(infoRows('a.png', entry, { fmtSize }));
    assert.equal(map.get('폴더'), '뿌리');
});

test('가로세로와 길이는 값이 올 때만 선다', () => {
    /* 아직 안 실린 미디어는 0 이다. 0 x 0 을 보여 주면 고장처럼 보인다 */
    const none = new Map(infoRows('a.mp4', entry, { fmtSize, media: { width: 0, height: 0, duration: 0 } }));
    assert.equal(none.has('가로세로'), false);
    assert.equal(none.has('길이'), false);
    const got = new Map(
        infoRows('a.mp4', entry, { fmtSize, media: { width: 1920, height: 1080, duration: 83 } })
    );
    assert.equal(got.get('가로세로'), '1920 x 1080');
    assert.equal(got.get('길이'), '1:23');
});

test('색인 항목이 없어도 이름과 폴더는 나온다', () => {
    const map = new Map(infoRows('a/b.txt', null, { fmtSize }));
    assert.equal(map.get('이름'), 'b.txt');
    assert.equal(map.has('크기'), false);
});
