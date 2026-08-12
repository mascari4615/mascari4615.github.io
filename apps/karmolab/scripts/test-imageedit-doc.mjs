/**
 * 이미지 편집기 기반 검사 — 문서 모델 · 합성 · 되돌리기 (TASK-KL-240)
 *
 * 화면을 안 띄운다. 이 세 파일이 브라우저를 모른다는 것 자체가 성질이므로, 여기서 잠근다.
 * 사용: node scripts/test-imageedit-doc.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const dir = path.resolve('src/widgets/imageedit');
const cache = new Map();

/** `./doc` 같은 상대 import 를 그 자리에서 물려 주며 TS 를 그대로 돌린다. */
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
    { module, require: require_, console, Math, Date, Uint8ClampedArray, Float32Array, Array, Object, Number, JSON }
  );
  cache.set(name, module.exports);
  return module.exports;
}

/* 브라우저를 모르는지부터 — vm 안에 document·window 를 안 넣었으므로 쓰면 위에서 이미 터진다.
   그래도 눈으로 못 보고 지나가는 일이 없게 글자로도 확인한다. */
for (const file of ['doc', 'composite', 'history']) {
  const source = fs.readFileSync(path.join(dir, file + '.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\bdocument\.|\bwindow\.|\bToolbox\b/.test(source), file + '.ts 가 브라우저를 부른다');
}

const D = load('doc');
const C = load('composite');
const H = load('history');

/* ===== 문서 모델 ===== */
{
  const doc = D.createDoc(4, 4, 'test');
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.activeLayer, doc.layers[0].id);
  assert.equal(doc.layers[0].cels.length, 1);

  const second = D.addLayer(doc, 'ink');
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.layers[1].id, second.id, '새 레이어가 위에 얹힌다');
  assert.equal(doc.activeLayer, second.id);

  assert.equal(D.moveLayer(doc, second.id, 0), true);
  assert.equal(doc.layers[0].id, second.id, '순서를 바꾼다');

  assert.equal(D.removeLayer(doc, second.id), true);
  assert.equal(D.removeLayer(doc, doc.layers[0].id), false, '마지막 한 장은 안 지운다');
}

/* ===== 셀 hold — 애니메이션의 뼈대 ===== */
{
  const doc = D.createDoc(2, 2);
  D.setFrameCount(doc, 4);
  const layer = doc.layers[0];
  assert.equal(layer.cels.length, 4);
  assert.equal(D.isHold(layer, 2), true, '안 그린 프레임은 앞 그림을 물려받는다');
  assert.equal(D.celAt(layer, 2), layer.cels[0]);

  const own = D.ensureCel(doc, layer, 2);
  assert.notEqual(own, layer.cels[0], '그리려 하면 사본을 떠 끊는다');
  own.data[3] = 255;
  assert.equal(layer.cels[0].data[3], 0, '앞 프레임이 같이 안 바뀐다');
  assert.equal(D.celAt(layer, 3), own, '뒤 프레임은 새로 끊은 그림을 물려받는다');

  /* 물려주던 칸을 지우면 그림이 뒤 칸으로 옮겨 간다(그림이 튀지 않게). */
  D.removeFrame(doc, 2);
  assert.equal(doc.frames, 3);
  assert.equal(D.celAt(layer, 2), own);

  D.insertFrame(doc, 1, true);
  assert.equal(doc.frames, 4);
  assert.ok(layer.cels[1], '복사해 끼운 프레임은 자기 그림을 갖는다');
}

/* ===== 합성 ===== */
const solid = (doc, layer, rgba) => {
  const cel = D.ensureCel(doc, layer, 0);
  for (let i = 0; i < cel.data.length; i += 4) {
    cel.data[i] = rgba[0]; cel.data[i + 1] = rgba[1]; cel.data[i + 2] = rgba[2]; cel.data[i + 3] = rgba[3];
  }
  return cel;
};
{
  const doc = D.createDoc(2, 2);
  const back = doc.layers[0];
  solid(doc, back, [255, 0, 0, 255]);
  const front = D.addLayer(doc, 'front');
  solid(doc, front, [0, 0, 255, 255]);

  let out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 4)], [0, 0, 255, 255], '위 레이어가 덮는다');

  front.opacity = 0.5;
  out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 4)], [128, 0, 128, 255], '반투명이면 절반씩 섞인다');

  front.opacity = 1;
  front.visible = false;
  out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 4)], [255, 0, 0, 255], '숨긴 레이어는 안 그린다');

  front.visible = true;
  front.blend = 'multiply';
  solid(doc, front, [128, 128, 128, 255]);
  out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 3)], [128, 0, 0], 'multiply = 곱하기');

  front.blend = 'screen';
  out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 3)], [255, 128, 128], 'screen = 밝게');

  front.blend = 'difference';
  out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 3)], [127, 128, 128], 'difference = 차이');
}

/* 레이어 마스크 · 클리핑 */
{
  const doc = D.createDoc(2, 1);
  const back = doc.layers[0];
  solid(doc, back, [0, 0, 0, 255]);
  const front = D.addLayer(doc, 'masked');
  solid(doc, front, [255, 255, 255, 255]);
  front.mask = new Uint8ClampedArray([255, 0]);
  const out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 4)], [255, 255, 255, 255], '마스크 255 = 그대로 보인다');
  assert.deepEqual([...out.data.slice(4, 8)], [0, 0, 0, 255], '마스크 0 = 가려진다');
}
{
  const doc = D.createDoc(2, 1);
  const base = doc.layers[0];
  const cel = D.ensureCel(doc, base, 0);
  cel.data.set([255, 0, 0, 255], 0);   /* 왼쪽만 있는 밑판 */
  cel.data.set([0, 0, 0, 0], 4);
  const clipped = D.addLayer(doc, 'clip');
  solid(doc, clipped, [0, 255, 0, 255]);
  clipped.clip = true;
  const out = C.composite(doc, 0);
  assert.deepEqual([...out.data.slice(0, 4)], [0, 255, 0, 255], '끼운 레이어는 밑판 위에 보인다');
  assert.equal(out.data[7], 0, '밑판 밖에는 안 나온다');
}

/* 어니언스킨 · 스프라이트시트 */
{
  const doc = D.createDoc(1, 1);
  D.setFrameCount(doc, 3);
  const layer = doc.layers[0];
  const a = D.ensureCel(doc, layer, 0); a.data.set([255, 0, 0, 255]);
  const b = D.ensureCel(doc, layer, 1); b.data.set([0, 0, 0, 0]);
  const plain = C.composite(doc, 1);
  assert.equal(plain.data[3], 0, '빈 프레임은 비어 있다');
  const onion = C.composite(doc, 1, undefined, { onionBefore: 1, onionOpacity: 0.5 });
  assert.equal(onion.data[3], 128, '앞 프레임이 옅게 깔린다');

  const sheet = C.spriteSheet(doc);
  assert.equal(sheet.w, 3, '프레임 수만큼 가로로 이어 붙인다');
  assert.equal(sheet.h, 1);
  assert.deepEqual([...sheet.data.slice(0, 4)], [255, 0, 0, 255]);
}

/* 아래로 합치기 */
{
  const doc = D.createDoc(1, 1);
  const back = doc.layers[0];
  solid(doc, back, [255, 0, 0, 255]);
  const front = D.addLayer(doc, 'front');
  solid(doc, front, [0, 0, 255, 255]);
  front.opacity = 0.5;
  assert.equal(D.mergeDown(doc, front.id, (d, f, only) => C.composite(d, f, only)), true);
  assert.equal(doc.layers.length, 1);
  assert.deepEqual([...doc.layers[0].cels[0].data], [128, 0, 128, 255], '합친 결과가 구워진다');
}

/* ===== 되돌리기 ===== */
{
  const doc = D.createDoc(4, 4);
  const layer = doc.layers[0];
  const cel = D.ensureCel(doc, layer, 0);
  const history = new H.History(50);

  const before = D.cloneSurface(cel);
  cel.data.set([9, 9, 9, 255], (1 * 4 + 1) * 4);
  const patch = H.pixelPatch(cel, before, 'brush');
  assert.ok(patch, '달라진 데가 있으면 커맨드가 나온다');
  history.push(patch);
  assert.equal(history.depth, 1);
  assert.equal(history.undoLabel, 'brush');

  history.undo();
  assert.equal(cel.data[(1 * 4 + 1) * 4], 0, '되돌리면 원래대로');
  history.redo();
  assert.equal(cel.data[(1 * 4 + 1) * 4], 9, '다시 하면 도로');

  assert.equal(H.pixelPatch(cel, D.cloneSurface(cel), 'noop'), null, '안 바뀐 획은 단계를 안 늘린다');

  /* 더러워진 사각형만 든다 — 점 하나면 4바이트. */
  const rect = H.dirtyRect(before, cel);
  assert.deepEqual([rect.x, rect.y, rect.w, rect.h], [1, 1, 1, 1]);
}
{
  /* 슬라이더처럼 이어지는 값은 한 단계로 묶는다. */
  const layer = { opacity: 1 };
  const history = new H.History(50);
  history.run(H.fieldChange(layer, 'opacity', 0.9, 'opacity', 'op'), 1000);
  history.run(H.fieldChange(layer, 'opacity', 0.4, 'opacity', 'op'), 1200);
  history.run(H.fieldChange(layer, 'opacity', 0.2, 'opacity', 'op'), 1400);
  assert.equal(layer.opacity, 0.2);
  assert.equal(history.depth, 1, '이어진 조정은 한 단계');
  history.undo();
  assert.equal(layer.opacity, 1, '묶인 조정은 처음 값으로 한 번에 되돌아간다');

  history.redo();
  assert.equal(layer.opacity, 0.2);
  history.run(H.fieldChange(layer, 'opacity', 0.1, 'opacity', 'op'), 9000);
  assert.equal(history.depth, 2, '한참 쉬었다 만지면 새 단계');
  assert.equal(history.canRedo, false, '새 동작은 앞으로가기를 버린다');
}
{
  /* 한계를 넘으면 오래된 것부터 버린다 — 메모리가 안 무한히 는다. */
  const target = { v: 0 };
  const history = new H.History(3);
  for (let i = 1; i <= 5; i += 1) history.run(H.fieldChange(target, 'v', i, 'set'), i * 5000);
  assert.equal(history.depth, 3);
}

console.log('[test-imageedit-doc] ✓ 레이어 · 셀 hold · 블렌드 12 · 마스크 · 클리핑 · 어니언 · 시트 · 커맨드 되돌리기');

/* ===== 부분 갱신 — 붓질 자리만 다시 섞는다 ===== */
{
  const doc = D.createDoc(4, 4);
  const back = doc.layers[0];
  solid(doc, back, [10, 20, 30, 255]);
  const flat = C.composite(doc, 0);
  /* 한 칸만 바꾼 뒤 그 칸만 다시 섞어도 같은 답이 나와야 한다. */
  const cel = D.celAt(back, 0);
  cel.data.set([200, 100, 50, 255], (1 * 4 + 2) * 4);
  C.composite(doc, 0, undefined, { rect: { x: 2, y: 1, w: 1, h: 1 }, into: flat });
  assert.deepEqual([...flat.data.slice((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4)], [200, 100, 50, 255], '그 자리는 새로 섞인다');
  assert.deepEqual([...flat.data.slice(0, 4)], [10, 20, 30, 255], '밖은 그대로 남는다');
  const full = C.composite(doc, 0);
  assert.deepEqual([...flat.data], [...full.data], '부분 갱신 결과 = 전체 합성 결과');

  /* 지운 자리가 옛 그림으로 남지 않는다. */
  cel.data.set([0, 0, 0, 0], (1 * 4 + 2) * 4);
  C.composite(doc, 0, undefined, { rect: { x: 2, y: 1, w: 1, h: 1 }, into: flat });
  assert.equal(flat.data[(1 * 4 + 2) * 4 + 3], 0, '지운 자리는 비워진다');

  /* 판 밖으로 나간 사각형은 잘린다(터지지 않는다). */
  C.composite(doc, 0, undefined, { rect: { x: 3, y: 3, w: 99, h: 99 }, into: flat });
}
console.log('[test-imageedit-doc] ✓ 부분 갱신(rect·into)');
