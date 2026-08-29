import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exifTakenAt, hasExif, parseExifDate } from '../src/exif.mjs';
import { arrange, timeOf } from '../src/browse.mjs';
import { previewKind } from '../src/vault.mjs';

/** EXIF 를 실제 규격대로 짜서 JPEG 한 장을 만든다. 시험이 진짜 파서를 재게 */
function jpegWithDate(text, { little = true } = {}) {
    const date = Buffer.from(text + '\0', 'ascii');
    /* IFD0 한 항목(ExifIFD 가리키기) + ExifIFD 한 항목(DateTimeOriginal) */
    const tiff = Buffer.alloc(2 + 2 + 4 + 2 + 12 + 4 + 2 + 12 + 4 + date.length);
    const w16 = (off, v) => (little ? tiff.writeUInt16LE(v, off) : tiff.writeUInt16BE(v, off));
    const w32 = (off, v) => (little ? tiff.writeUInt32LE(v, off) : tiff.writeUInt32BE(v, off));
    w16(0, little ? 0x4949 : 0x4d4d);
    w16(2, 42);
    w32(4, 8); /* IFD0 자리 */
    const ifd0 = 8;
    w16(ifd0, 1);
    w16(ifd0 + 2, 0x8769); /* ExifIFD 가리키는 태그 */
    w16(ifd0 + 4, 4);
    w32(ifd0 + 6, 1);
    const exifIfd = ifd0 + 2 + 12 + 4;
    w32(ifd0 + 10, exifIfd);
    w32(ifd0 + 2 + 12, 0); /* 다음 IFD 없음 */
    w16(exifIfd, 1);
    w16(exifIfd + 2, 0x9003); /* DateTimeOriginal */
    w16(exifIfd + 4, 2);
    w32(exifIfd + 6, date.length);
    const dataOff = exifIfd + 2 + 12 + 4;
    w32(exifIfd + 10, dataOff);
    w32(exifIfd + 2 + 12, 0);
    date.copy(tiff, dataOff);

    const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xffe1, 0);
    head.writeUInt16BE(app1.length + 2, 2);
    return Uint8Array.from(
        Buffer.concat([Buffer.from([0xff, 0xd8]), head, app1, Buffer.from([0xff, 0xd9])])
    );
}

test('EXIF 날짜 글을 ms 로', () => {
    /* EXIF 에는 시간대가 안 적힌다. 이 저장소의 사진은 한국에서 찍혔다고 본다 */
    assert.equal(parseExifDate('2024:03:07 18:22:05'), Date.UTC(2024, 2, 7, 9, 22, 5));
    assert.equal(parseExifDate('아님'), 0);
    assert.equal(parseExifDate(''), 0);
});

test('진짜 EXIF 구조에서 찍은 날을 꺼낸다', () => {
    const want = Date.UTC(2024, 2, 7, 9, 22, 5);
    assert.equal(exifTakenAt(jpegWithDate('2024:03:07 18:22:05')), want);
    /* MM 순서도 실제로 쓰인다 */
    assert.equal(exifTakenAt(jpegWithDate('2024:03:07 18:22:05', { little: false })), want);
});

test('EXIF 가 없거나 JPEG 이 아니면 0. 고장이 아니다', () => {
    assert.equal(exifTakenAt(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), 0);
    assert.equal(exifTakenAt(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), 0);
    assert.equal(exifTakenAt(new Uint8Array(0)), 0);
    assert.equal(hasExif('a/b.png'), false);
    assert.equal(hasExif('a/b.JPG'), true);
});

test('찍은 날이 있으면 그것이 그 파일의 시각', () => {
    /* 사진의 수정 시각은 복사 한 번이면 전부 같은 날이 된다 */
    assert.equal(timeOf({ shot: 100, mtime: 900 }), 100);
    assert.equal(timeOf({ mtime: 900 }), 900);
    assert.equal(timeOf({}), 0);
});

test('날짜순에서 시각 모르는 것은 뒤집어도 뒤에 남는다', () => {
    const files = [
        { path: 'a/c.jpg', size: 1, shot: 300 },
        { path: 'a/a.bin', size: 1 },
        { path: 'a/b.jpg', size: 1, mtime: 100 }
    ];
    const opt = { sort: 'date', kindOf: previewKind };
    assert.deepEqual(arrange(files, opt).map((f) => f.path), ['a/b.jpg', 'a/c.jpg', 'a/a.bin']);
    assert.deepEqual(
        arrange(files, { ...opt, desc: true }).map((f) => f.path),
        ['a/c.jpg', 'a/b.jpg', 'a/a.bin']
    );
});

test('시각은 있을 때만 색인에 담긴다', async () => {
    const v = await import('../src/vault.mjs');
    const s = await v.createVault(v.memoryStore(), 'pw', { iterations: 1000 });
    await v.putFile(s, 'a.bin', new Uint8Array([1]));
    let row = (await v.listFiles(s))[0];
    assert.equal(row.mtime, 0, '모르면 0 으로 읽힌다');

    await v.setTimes(s, 'a.bin', { mtime: 1700000000000, shot: 0 });
    row = (await v.listFiles(s))[0];
    assert.equal(row.mtime, 1700000000000);
    assert.equal(row.shot, 0, '없는 값은 안 덮는다');

    const again = await v.setTimes(s, 'a.bin', { mtime: 1700000000000 });
    assert.equal(again.changed, false, '같은 값이면 색인을 다시 안 쓴다');
    assert.equal(await v.setTimes(s, '없는.bin', { mtime: 1 }), null);
});
