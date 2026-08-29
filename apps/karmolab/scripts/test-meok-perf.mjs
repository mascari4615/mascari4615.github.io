/**
 * 먹 성능 회귀 검사
 *
 * 시간은 기계마다 흔들려 게이트로 못 쓴다. 대신 **할당 바이트**를 잰다. 이 값은 기계와 무관하고,
 * 이 위젯이 느려지는 방식이 늘 같기 때문이다. 붓 자리 하나를 다시 섞는 데 판 전체 크기 배열을
 * 얻는 것 (2026-08-29 에 고친 그것). 그래서 여기서 잠그는 계약은 하나.
 *
 *   **부분 갱신이 얻는 메모리는 문서 크기와 무관하다.**
 *
 * 사용: node scripts/test-meok-perf.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const dir = path.resolve('src/widgets/meok');
const cache = new Map();

/** 얻은 바이트를 센다. 판을 새로 얻을 때마다 늘어난다. */
let allocated = 0;
class CountingFloat32Array extends Float32Array {
  constructor(...args) {
    super(...args);
    allocated += this.byteLength;
  }
}

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(path.join(dir, name + '.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  cache.set(name, module.exports);
  const require_ = (spec) => load(spec.replace(/^\.\//, ''));
  vm.runInNewContext(
    '(function(exports,module,require){' + compiled + '\n})(module.exports,module,require);',
    {
      module, require: require_, console, Math, Date, JSON, Set, Map, Infinity,
      Uint8Array, Uint8ClampedArray, Uint32Array, Int32Array, Array, Object,
      String, Number, Boolean, Error, isNaN, parseInt, parseFloat,
      Float32Array: CountingFloat32Array
    }
  );
  cache.set(name, module.exports);
  return module.exports;
}

const D = load('doc');
const C = load('composite');

function makeDoc(size, layers) {
  const doc = D.createDoc(size, size, 'perf');
  for (let i = 1; i < layers; i += 1) D.addLayer(doc);
  return doc;
}

/** 이 일을 하는 동안 새로 얻은 바이트. */
function bytesOf(work) {
  allocated = 0;
  work();
  return allocated;
}

const RECT = { x: 8, y: 8, w: 64, h: 64 };

/* ① 부분 갱신이 얻는 메모리는 문서 크기와 무관하다. 이것이 이 검사의 전부다. */
const small = makeDoc(256, 5);
const smallInto = D.createSurface(256, 256);
const big = makeDoc(4096, 5);
const bigInto = D.createSurface(4096, 4096);

const smallBytes = bytesOf(() => C.composite(small, 0, undefined, { into: smallInto, rect: RECT }));
const bigBytes = bytesOf(() => C.composite(big, 0, undefined, { into: bigInto, rect: RECT }));

assert.equal(bigBytes, smallBytes,
  '같은 사각형인데 문서가 크다고 더 얻는다 (256^2 ' + smallBytes + 'B, 4096^2 ' + bigBytes + 'B). '
  + '판을 문서 크기로 잡는 자리가 다시 생겼다');

/* ② 얻는 양은 사각형에 걸맞아야 한다. 64x64 짜리 float 판 하나가 64KB. 넉넉히 잡아도 그 두 배 안. */
const rectBudget = RECT.w * RECT.h * 4 * 4 * 2;
assert.ok(smallBytes <= rectBudget,
  '사각형 64x64 하나에 ' + smallBytes + 'B 를 얻었다 (예산 ' + rectBudget + 'B)');

/* ③ 끼워 붙인 레이어가 없으면 클리핑 밑판을 안 얻는다. clip 을 켠 판과 비교해 그 차이를 본다. */
const clipped = makeDoc(256, 5);
clipped.layers[2].clip = true;
const clippedInto = D.createSurface(256, 256);
const clipBytes = bytesOf(() => C.composite(clipped, 0, undefined, { into: clippedInto, rect: RECT }));
assert.ok(clipBytes > smallBytes, 'clip 이 있으면 밑판을 얻어야 한다');
assert.ok(clipBytes <= rectBudget * 2, 'clip 밑판도 사각형 크기여야 한다 (' + clipBytes + 'B)');

/* ④ 레이어가 늘어도 부분 갱신의 메모리는 안 늘어난다 (밑판을 레이어마다 새로 얻던 자리). */
const many = makeDoc(256, 20);
const manyInto = D.createSurface(256, 256);
const manyBytes = bytesOf(() => C.composite(many, 0, undefined, { into: manyInto, rect: RECT }));
assert.equal(manyBytes, smallBytes,
  '레이어 20장이 5장보다 더 얻는다 (' + manyBytes + 'B 대 ' + smallBytes + 'B)');

/* ⑤ 전체 합성은 문서 크기에 비례한다. 그건 정상이고, 위 계약이 통짜에도 적용된다는 오해를 막는다. */
const fullSmall = bytesOf(() => C.composite(small, 0));
const fullBig = bytesOf(() => C.composite(big, 0));
assert.ok(fullBig > fullSmall * 100, '전체 합성은 문서 크기를 따라간다');

console.log('[test-meok-perf] ✓ 부분 갱신 메모리가 문서 크기와 무관 (256^2 와 4096^2 둘 다 '
  + Math.round(smallBytes / 1024) + 'KB), 레이어 수와도 무관, clip 밑판도 사각형 크기');
