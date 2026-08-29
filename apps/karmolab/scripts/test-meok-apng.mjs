/**
 * 먹 APNG 라이터 검사
 *
 * 움직이는 PNG 는 첫 장만 맞아도 눈에는 멀쩡. 그래서 여기서는 **바이트를 뜯어**
 * 청크 차례와 순번을 잰다. 규약이 어긋나면 브라우저는 조용히 정지 그림 한 장으로 떨어뜨림.
 * 사용: node scripts/test-meok-apng.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import ts from 'typescript';

const dir = path.resolve('src/widgets/meok');
const source = fs.readFileSync(path.join(dir, 'apng.ts'), 'utf8');
/* 이 파일은 브라우저를 모른다. 그 약속이 깨지면 여기서 먼저 걸림. */
assert.ok(!/\bdocument\.|\bwindow\./.test(source), 'apng.ts 가 document 나 window 를 쓴다');

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
vm.runInNewContext(
  '(function(exports,module,require){' + compiled + '\n})(module.exports,module,require);',
  {
    module, require: () => ({}), console, Math, Date, JSON, Set, Map, Infinity,
    Uint8Array, Uint8ClampedArray, Uint32Array, Int32Array, DataView, ArrayBuffer, Array, Object,
    String, Number, Boolean, Error, isNaN, parseInt, parseFloat, Promise,
    Blob, Response, CompressionStream, TextEncoder
  }
);
const { encodeApng } = module.exports;

/** 청크를 차례대로 훑기. [이름, 알맹이] 목록. */
function chunks(bytes) {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    out.push([name, bytes.subarray(at + 8, at + 8 + length)]);
    at += length + 12;
  }
  return out;
}

const W = 8;
const H = 6;
const frame = (r, g, b, a = 255) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; }
  return data;
};

const blob = await encodeApng({
  width: W, height: H, plays: 0,
  frames: [
    { data: frame(200, 30, 30), delayMs: 100 },
    { data: frame(30, 200, 30), delayMs: 250 },
    { data: frame(30, 30, 200, 0), delayMs: 40 }
  ]
});
const bytes = new Uint8Array(await blob.arrayBuffer());

/* ① 겉모습. PNG 시그니처와 청크 차례. */
assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG 머리가 아니다');
const list = chunks(bytes);
const names = list.map(([name]) => name);
assert.equal(names[0], 'IHDR');
assert.equal(names[names.length - 1], 'IEND');
assert.ok(names.indexOf('acTL') < names.indexOf('IDAT'), 'acTL 은 IDAT 보다 앞이어야 한다');
assert.ok(names.indexOf('fcTL') < names.indexOf('IDAT'), '첫 장의 fcTL 은 IDAT 앞이어야 한다');
assert.equal(names.filter((n) => n === 'fcTL').length, 3, 'fcTL 은 장마다 하나');
assert.equal(names.filter((n) => n === 'IDAT').length, 1, 'IDAT 은 첫 장 하나뿐');
assert.equal(names.filter((n) => n === 'fdAT').length, 2, '나머지 장은 fdAT');

/* ② 머리 정보. 크기와 색 종류. */
const ihdr = list.find(([n]) => n === 'IHDR')[1];
const ihdrView = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
assert.equal(ihdrView.getUint32(0), W);
assert.equal(ihdrView.getUint32(4), H);
assert.equal(ihdr[8], 8, '비트 깊이 8');
assert.equal(ihdr[9], 6, '색 종류 6 (RGBA)');

/* ③ acTL. 장수와 반복. */
const actl = list.find(([n]) => n === 'acTL')[1];
const actlView = new DataView(actl.buffer, actl.byteOffset, actl.byteLength);
assert.equal(actlView.getUint32(0), 3, '장수');
assert.equal(actlView.getUint32(4), 0, '끝없이 반복');

/* ④ 순번. fcTL 과 fdAT 를 통틀어 0 부터 하나씩. 어긋나면 브라우저가 정지 그림으로 떨어뜨림. */
const sequences = list
  .filter(([n]) => n === 'fcTL' || n === 'fdAT')
  .map(([, body]) => new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0));
assert.deepEqual(sequences, [0, 1, 2, 3, 4], '순번이 0 부터 이어지지 않는다');

/* ⑤ 지연. 분모 1000 이면 ms 가 그대로 분자. */
const delays = list.filter(([n]) => n === 'fcTL').map(([, body]) => {
  const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
  return [v.getUint16(20), v.getUint16(22)];
});
assert.deepEqual(delays, [[100, 1000], [250, 1000], [40, 1000]], '지연이 안 맞다');

/* ⑥ 픽셀 왕복. 첫 장을 풀어서 원본과 대조. 알파 0 인 셋째 장도 함께. */
const idat = list.find(([n]) => n === 'IDAT')[1];
const raw = zlib.inflateSync(Buffer.from(idat));
assert.equal(raw.length, (W * 4 + 1) * H, '스캔라인 길이가 안 맞다');
assert.equal(raw[0], 0, '첫 줄은 필터 없음이어야 한다 (위 줄이 없다)');
assert.deepEqual([raw[1], raw[2], raw[3], raw[4]], [200, 30, 30, 255], '첫 픽셀 색이 다르다');

const lastFdat = list.filter(([n]) => n === 'fdAT').pop()[1];
const lastRaw = zlib.inflateSync(Buffer.from(lastFdat.subarray(4)));
assert.deepEqual([lastRaw[1], lastRaw[2], lastRaw[3], lastRaw[4]], [30, 30, 200, 0], '투명한 장이 안 살아났다');

/* ⑦ 필터 고르기. 같은 색으로 채운 줄은 Up 이 전부 0 이므로 Up 을 골라야 함. */
const filters = [];
for (let y = 0; y < H; y += 1) filters.push(raw[y * (W * 4 + 1)]);
assert.equal(filters[0], 0, '첫 줄은 필터 없음');
assert.ok(filters.slice(1).every((f) => f === 2), '단색 그림은 둘째 줄부터 Up 을 골라야 한다');

/* ⑧ 압축 효과. 단색 64x64 열 장이 원본보다 훨씬 작아야 함. */
const big = await encodeApng({
  width: 64, height: 64,
  frames: Array.from({ length: 10 }, (_unused, i) => ({ data: frame(i * 20, 100, 150), delayMs: 80 }))
});
const rawSize = 64 * 64 * 4 * 10;
assert.ok(big.size < rawSize / 20, '압축이 안 먹는다 (' + big.size + ' / ' + rawSize + ')');

console.log('[test-meok-apng] ✓ 청크 차례, 순번, 지연, 픽셀 왕복(투명 포함), 필터 고르기, 압축 ('
  + Math.round(big.size / 1024) + 'KB / 원본 ' + Math.round(rawSize / 1024) + 'KB)');
