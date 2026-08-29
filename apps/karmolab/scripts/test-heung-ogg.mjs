/** 흥 OGG 루프 지점. 페이지를 다시 엮고 CRC 를 맞추는 자리를 바이트로 잰다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync(path.resolve('src/widgets/heung/ogg-comments.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${compiled}\n})(module.exports,module);`, { module, console, Math, Uint8Array, Uint32Array, DataView, BigInt, Object, Number, Error });
const { oggCrc32, readOggPages, splitPackets, rebuildCommentPacket, injectVorbisComments } = module.exports;

const text = (value) => Uint8Array.from([...value].map((character) => character.charCodeAt(0)));

/** 주석 패킷 하나를 손으로 엮기 */
function commentPacket(vendor, comments) {
  const vendorBytes = text(vendor);
  const lines = comments.map((line) => text(line));
  let size = 7 + 4 + vendorBytes.length + 4 + 1;
  for (const line of lines) size += 4 + line.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = 3; out.set(text('vorbis'), 1);
  view.setUint32(7, vendorBytes.length, true);
  out.set(vendorBytes, 11);
  let at = 11 + vendorBytes.length;
  view.setUint32(at, lines.length, true); at += 4;
  for (const line of lines) { view.setUint32(at, line.length, true); at += 4; out.set(line, at); at += line.length; }
  out[at] = 1;
  return out;
}

/** 페이지 하나를 손으로 엮기. CRC 는 코드와 같은 방식 */
function page(packets, sequence = 1) {
  const segments = [];
  for (const packet of packets) { let left = packet.length; while (left >= 255) { segments.push(255); left -= 255; } segments.push(left); }
  let bodyLength = 0; for (const packet of packets) bodyLength += packet.length;
  const out = new Uint8Array(27 + segments.length + bodyLength);
  const view = new DataView(out.buffer);
  out.set(text('OggS'), 0); out[4] = 0; out[5] = 0;
  view.setBigUint64(6, 0n, true);
  view.setUint32(14, 0x1234, true);
  view.setUint32(18, sequence, true);
  out[26] = segments.length;
  for (let index = 0; index < segments.length; index++) out[27 + index] = segments[index];
  let at = 27 + segments.length;
  for (const packet of packets) { out.set(packet, at); at += packet.length; }
  view.setUint32(22, oggCrc32(out), true);
  return out;
}

// CRC 는 Ogg 방식. 뒤집기 없음
assert.equal(oggCrc32(text('OggS')), oggCrc32(text('OggS')), '같은 입력은 같은 값');
assert.notEqual(oggCrc32(text('OggS')), oggCrc32(text('OggT')), '한 글자만 달라도 값이 바뀐다');

// 페이지와 패킷 가르기
const identity = new Uint8Array(30); identity[0] = 1; identity.set(text('vorbis'), 1);
const comments = commentPacket('heung test', ['ARTIST=karmo']);
const file = new Uint8Array([...page([identity], 0), ...page([comments], 1)]);
const pages = readOggPages(file);
assert.equal(pages.length, 2, '페이지 둘');
assert.equal(splitPackets(pages[1]).length, 1, '주석 페이지에 패킷 하나');

// 긴 패킷은 조각 여럿으로
const long = commentPacket('x'.repeat(300), ['A=1']);
assert.ok(splitPackets(readOggPages(page([long]))[0])[0].length === long.length, '갈렸다가 다시 붙는다');

// 주석 끼우기
const result = injectVorbisComments(file, { LOOPSTART: '44100', LOOPLENGTH: '88200' });
assert.ok(result.injected, '끼웠다');
const after = readOggPages(result.bytes);
assert.equal(after.length, 2, '페이지 수는 그대로');
const rebuilt = splitPackets(after[1])[0];
const readable = Buffer.from(rebuilt).toString('utf8');
assert.ok(readable.includes('LOOPSTART=44100'), '루프 시작이 들어갔다');
assert.ok(readable.includes('LOOPLENGTH=88200'), '루프 길이도');
assert.ok(readable.includes('ARTIST=karmo'), '원래 있던 줄은 그대로');
assert.ok(readable.includes('heung test'), 'vendor 도 그대로');

// CRC 재계산 필수. 안 맞으면 재생기가 파일을 버림
const checkPage = after[1];
const bytes = result.bytes.subarray(checkPage.start, checkPage.end).slice();
const stored = new DataView(bytes.buffer).getUint32(22, true);
new DataView(bytes.buffer).setUint32(22, 0, true);
assert.equal(oggCrc32(bytes), stored, '주석 페이지 CRC 가 맞다');
// 첫 페이지는 그대로
assert.equal(Buffer.compare(Buffer.from(file.subarray(0, pages[0].end)), Buffer.from(result.bytes.subarray(0, after[0].end))), 0, '앞 페이지는 그대로');

// 못 끼우는 경우엔 원본 그대로
const noComment = page([identity]);
const untouched = injectVorbisComments(noComment, { LOOPSTART: '1' });
assert.equal(untouched.injected, false, '주석 패킷이 없으면 안 끼운다');
assert.equal(Buffer.compare(Buffer.from(noComment), Buffer.from(untouched.bytes)), 0, '원본 그대로 돌려준다');

console.log('[test-heung-ogg] ✓ CRC, 페이지 가르기, 주석 끼우기, 원본 보존');
