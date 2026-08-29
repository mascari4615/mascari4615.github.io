import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, makeZip, uniqueNames } from '../src/zip.mjs';

const enc = (s) => new TextEncoder().encode(s);

test('crc32 는 알려진 값과 맞는다', () => {
    /* zip 이 이 값을 검사한다. 틀리면 푸는 쪽이 깨졌다고 한다 */
    assert.equal(crc32(enc('hello')), 0x3610a686);
    assert.equal(crc32(enc('')), 0);
});

test('같은 이름은 번호를 붙여 가른다', () => {
    /* 다른 폴더의 같은 이름을 함께 고를 수 있다. 안 가르면 하나가 덮인다 */
    assert.deepEqual(uniqueNames(['a.png', 'a.png', 'b.txt', 'a.png']), [
        'a.png',
        'a (1).png',
        'b.txt',
        'a (2).png'
    ]);
    assert.deepEqual(uniqueNames(['README', 'README']), ['README', 'README (1)']);
});

test('머리와 끝 표시가 규격대로 선다', () => {
    const zip = makeZip([{ name: 'a.txt', bytes: enc('hello') }]);
    const v = new DataView(zip.buffer);
    assert.equal(v.getUint32(0, true), 0x04034b50);
    assert.equal(v.getUint16(6, true), 0x0800, '이름이 UTF-8 이라는 표시');
    assert.equal(v.getUint16(8, true), 0, '압축 안 함');
    assert.equal(v.getUint32(14, true), 0x3610a686);
    const eocd = zip.length - 22;
    assert.equal(v.getUint32(eocd, true), 0x06054b50);
    assert.equal(v.getUint16(eocd + 8, true), 1, '항목 수');
});

test('너무 크면 안 묶는다', () => {
    const huge = { name: 'x', bytes: { length: 3 * 1024 * 1024 * 1024 } };
    assert.throws(() => makeZip([huge]), /너무 큽니다/);
});

test('윈도우가 실제로 푼다', async (t) => {
    /* 규격을 흉내 낸 것이 아니라 진짜 zip 인지. 바이트 검사만으로는 못 잡는다 */
    const zip = makeZip([
        { name: 'a.txt', bytes: enc('hello') },
        { name: '한글 이름.txt', bytes: enc('안녕') }
    ]);
    const dir = await mkdtemp(join(tmpdir(), 'zip-'));
    const path = join(dir, 'p.zip');
    await writeFile(path, zip);
    const ok = await new Promise((resolve) => {
        execFile(
            'powershell',
            ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${path}' -DestinationPath '${dir}\\out' -Force`],
            { windowsHide: true },
            (err) => resolve(!err)
        );
    });
    if (!ok) return t.skip('이 기계에서 Expand-Archive 를 못 돌림');
    const names = await readdir(join(dir, 'out'));
    assert.deepEqual(names.sort(), ['a.txt', '한글 이름.txt']);
    assert.equal(await readFile(join(dir, 'out', 'a.txt'), 'utf8'), 'hello');
    assert.equal(await readFile(join(dir, 'out', '한글 이름.txt'), 'utf8'), '안녕');
});
