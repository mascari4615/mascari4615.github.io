/**
 * 「먹」 저장 검사 — 접었다 펴도 그림이 같은가 (TASK-KL-240)
 *
 * 자동 저장은 조용히 망가지는 기능이다: 저장은 되는데 열었더니 색이 밀려 있거나 프레임이
 * 사라지는 식. 눈으로는 다음 세션에야 안다. 그래서 여기서 **왕복**을 값으로 잠근다.
 * 사용: node scripts/test-meok-storage.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const dir = path.resolve('src/widgets/meok');
const cache = new Map();
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
      module, require: require_, console, Math, Date, JSON, Set, Map, Infinity, Error,
      Uint8Array, Uint8ClampedArray, Float32Array, Array, Object, Number, String, parseInt, isNaN
    }
  );
  cache.set(name, module.exports);
  return module.exports;
}

const source = fs.readFileSync(path.join(dir, 'storage.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/\bdocument\.|\bwindow\.|\bindexedDB\b|\bToolbox\b/.test(source), 'storage.ts 가 브라우저를 부른다');

const D = load('doc');
const S = load('storage');

/* ===== 판 한 장 왕복 ===== */
{
  /* 단색 — 크게 접힌다. */
  const flat = D.createSurface(64, 64, [10, 20, 30, 255]);
  const packed = S.packSurface(flat);
  assert.ok(packed.length < flat.data.length / 20, '단색은 20배 넘게 접힌다 (' + packed.length + ' / ' + flat.data.length + ')');
  const back = S.unpackSurface(packed, 64, 64);
  assert.deepEqual([...back.data], [...flat.data], '펴면 같은 그림');
}
{
  /* 전부 다른 색 — 최악이라도 원본보다 크게 부풀지 않는다. */
  const noisy = D.createSurface(40, 40);
  for (let p = 0; p < 1600; p += 1) {
    noisy.data.set([(p * 7) % 256, (p * 13) % 256, (p * 29) % 256, 255], p * 4);
  }
  const packed = S.packSurface(noisy);
  assert.ok(packed.length < noisy.data.length * 1.05, '최악에도 5% 넘게 안 부푼다 (' + packed.length + ')');
  assert.deepEqual([...S.unpackSurface(packed, 40, 40).data], [...noisy.data], '잡색도 왕복');
}
{
  /* 도트 그림 꼴 — 묶임과 안 묶임이 섞인다. */
  const sprite = D.createSurface(16, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if ((x + y) % 5 === 0) sprite.data.set([255, 79, 136, 255], (y * 16 + x) * 4);
      else if (y > 8) sprite.data.set([24, 34, 45, 255], (y * 16 + x) * 4);
    }
  }
  assert.deepEqual([...S.unpackSurface(S.packSurface(sprite), 16, 16).data], [...sprite.data], '섞인 그림도 왕복');
}
{
  const empty = D.createSurface(8, 8);
  assert.deepEqual([...S.unpackSurface(S.packSurface(empty), 8, 8).data], [...empty.data], '빈 판도 왕복');
}

/* ===== 문서 통째 왕복 ===== */
{
  const doc = D.createDoc(24, 16, '테스트 그림');
  D.setFrameCount(doc, 3);
  doc.fps = 24;
  doc.grid = 8;
  doc.palette = ['#ff4f88', '#18222d'];
  const back = doc.layers[0];
  back.name = '배경';
  const cel = D.ensureCel(doc, back, 0);
  cel.data.fill(200);
  const ink = D.addLayer(doc, '선');
  ink.opacity = 0.6;
  ink.blend = 'multiply';
  ink.clip = true;
  ink.locked = true;
  ink.visible = false;
  const inkCel = D.ensureCel(doc, ink, 2);
  inkCel.data.set([1, 2, 3, 255], 0);
  ink.mask = new Uint8ClampedArray(24 * 16);
  ink.mask[5] = 128;
  doc.activeFrame = 2;
  doc.activeLayer = ink.id;

  const stored = S.packDoc(doc, 1234);
  assert.equal(stored.version, 1);
  assert.equal(stored.savedAt, 1234);
  assert.equal(S.isStoredDoc(stored), true);
  assert.equal(S.isStoredDoc({ hello: 1 }), false, '남의 파일은 거른다');
  assert.ok(S.storedSize(stored) > 0);

  /* IndexedDB·파일을 거치면 JSON 을 지나므로, 그 왕복까지 함께 본다. */
  const roundTripped = JSON.parse(JSON.stringify(stored));
  const opened = S.unpackDoc(roundTripped);

  assert.equal(opened.w, 24); assert.equal(opened.h, 16);
  assert.equal(opened.frames, 3); assert.equal(opened.fps, 24); assert.equal(opened.grid, 8);
  assert.equal(opened.name, '테스트 그림');
  assert.deepEqual(opened.palette, ['#ff4f88', '#18222d']);
  assert.equal(opened.activeFrame, 2);
  assert.equal(opened.layers.length, 2);

  const openedBack = opened.layers[0];
  const openedInk = opened.layers[1];
  assert.equal(openedBack.name, '배경');
  assert.deepEqual([...D.celAt(openedBack, 0).data], [...cel.data], '배경 그림이 그대로');
  assert.equal(openedInk.opacity, 0.6);
  assert.equal(openedInk.blend, 'multiply');
  assert.equal(openedInk.clip, true);
  assert.equal(openedInk.locked, true);
  assert.equal(openedInk.visible, false, '숨김 상태도 살아 온다');
  assert.equal(opened.activeLayer, openedInk.id, '고른 레이어도 살아 온다');
  assert.equal(openedInk.mask[5], 128, '레이어 마스크도 왕복');
  assert.deepEqual([...D.celAt(openedInk, 2).data.slice(0, 4)], [1, 2, 3, 255], '셀이 제 프레임에 온다');
  assert.equal(openedInk.cels[1], null, '물려받던 프레임은 물려받은 채로 (hold 유지)');
}
{
  /* 저장본이 깨져 있어도 열 수 있는 만큼은 연다 — 「아예 못 염」이 제일 나쁘다. */
  const doc = D.createDoc(4, 4);
  const stored = S.packDoc(doc);
  stored.frames = 2;                 /* 프레임 수만 늘어난 저장본 */
  const opened = S.unpackDoc(stored);
  assert.equal(opened.frames, 2);
  assert.equal(opened.layers[0].cels.length, 2, '없는 프레임은 빈 채로 채운다');

  const broken = S.packDoc(doc);
  broken.layers = [];
  assert.throws(() => S.unpackDoc(broken), /레이어/, '레이어가 없으면 조용히 빈 문서를 내지 않고 알린다');
}

console.log('[test-meok-storage] ✓ 접기/펴기 왕복(단색 20배·잡색 무부풀림) · 문서 통째(레이어 속성·마스크·hold·고른 자리) · JSON 왕복 · 깨진 저장본');
