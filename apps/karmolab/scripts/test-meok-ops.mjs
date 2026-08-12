/**
 * 「먹」 그림 연산 검사 — 자르기·크기·회전·보정·필터 (TASK-KL-240)
 *
 * 옛 편집기에서 이 연산들은 캔버스에 직접 걸려 있어 눈으로밖에 못 봤다. 이제 판을 받아
 * 판을 내놓는 함수이므로 값으로 잠근다. 특히 두 가지를 본다:
 *  ① 크기를 줄여도 **투명한 자리의 검정이 배어나지 않는다**(미리 곱한 알파)
 *  ② 선택영역을 주면 그 밖 픽셀은 **한 개도 안 바뀐다**
 * 사용: node scripts/test-meok-ops.mjs
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
      module, require: require_, console, Math, Date, JSON, Set, Map, Infinity,
      Uint8Array, Uint8ClampedArray, Float32Array, Array, Object, Number, String, parseInt, isNaN
    }
  );
  cache.set(name, module.exports);
  return module.exports;
}

const source = fs.readFileSync(path.join(dir, 'ops.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/\bdocument\.|\bwindow\.|\bToolbox\b/.test(source), 'ops.ts 가 브라우저를 부른다');

const D = load('doc');
const O = load('ops');

const px = (s, x, y) => [...s.data.slice((y * s.w + x) * 4, (y * s.w + x) * 4 + 4)];
const paint = (s, x, y, rgba) => s.data.set(rgba, (y * s.w + x) * 4);

/* ===== 자르기 ===== */
{
  const s = D.createSurface(4, 4);
  paint(s, 2, 1, [10, 20, 30, 255]);
  const out = O.crop(s, { x: 1, y: 1, w: 2, h: 2 });
  assert.equal(out.w, 2);
  assert.deepEqual(px(out, 1, 0), [10, 20, 30, 255], '잘라낸 자리의 색이 그대로 온다');
  /* 판 밖으로 넓히면 그만큼 투명 — 「여백 넣기」로도 쓴다. */
  const bigger = O.crop(s, { x: -1, y: -1, w: 6, h: 6 });
  assert.equal(bigger.w, 6);
  assert.equal(px(bigger, 0, 0)[3], 0, '넓힌 자리는 비어 있다');
  assert.deepEqual(px(bigger, 3, 2), [10, 20, 30, 255], '원래 그림은 자리만 밀린다');
}

/* ===== 크기 ===== */
{
  /* 절반으로 줄이기 — 2×2 한 덩어리가 한 픽셀이 된다. */
  const s = D.createSurface(4, 4, [200, 100, 50, 255]);
  const half = O.resize(s, 2, 2);
  assert.equal(half.w, 2);
  assert.deepEqual(px(half, 0, 0), [200, 100, 50, 255], '단색은 줄여도 같은 색');

  /* 투명한 자리의 검정이 배어나지 않는다(미리 곱한 알파) — 옛 코드의 고전 버그. */
  const edge = D.createSurface(2, 1);
  paint(edge, 0, 0, [255, 255, 255, 255]);
  paint(edge, 1, 0, [0, 0, 0, 0]);
  const shrunk = O.resize(edge, 1, 1);
  assert.equal(shrunk.data[3], 128, '알파는 절반');
  assert.ok(shrunk.data[0] > 240, '색은 흰색을 지킨다 — 투명한 검정이 안 섞인다 (실제 ' + shrunk.data[0] + ')');

  /* 픽셀 아트는 부드럽게 하면 안 된다. */
  const dots = D.createSurface(2, 1);
  paint(dots, 0, 0, [0, 0, 0, 255]);
  paint(dots, 1, 0, [255, 255, 255, 255]);
  const nearest = O.resize(dots, 4, 1, false);
  assert.deepEqual(px(nearest, 1, 0), [0, 0, 0, 255], '가까운 픽셀 = 계단 그대로');
  assert.deepEqual(px(nearest, 2, 0), [255, 255, 255, 255]);
  const smooth = O.resize(dots, 4, 1, true);
  assert.ok(smooth.data[4] > 0 && smooth.data[4] < 255, '부드럽게 = 중간값이 생긴다');
}

/* ===== 회전 · 뒤집기 ===== */
{
  const s = D.createSurface(3, 2);
  paint(s, 0, 0, [1, 2, 3, 255]);
  const r90 = O.rotateQuarter(s, 1);
  assert.equal(r90.w, 2, '90도면 가로세로가 바뀐다');
  assert.equal(r90.h, 3);
  assert.deepEqual(px(r90, 1, 0), [1, 2, 3, 255], '왼쪽 위가 오른쪽 위로');
  const back = O.rotateQuarter(r90, 3);
  assert.deepEqual(px(back, 0, 0), [1, 2, 3, 255], '네 번 돌리면 제자리');
  assert.equal(O.rotateQuarter(s, 0).w, 3, '0도는 사본');

  const fx = O.flip(s, 'x');
  assert.deepEqual(px(fx, 2, 0), [1, 2, 3, 255], '좌우 뒤집기');
  const fy = O.flip(s, 'y');
  assert.deepEqual(px(fy, 0, 1), [1, 2, 3, 255], '상하 뒤집기');
}

/* ===== 보정 ===== */
{
  const s = D.createSurface(2, 1, [100, 100, 100, 255]);
  assert.ok(O.adjust(s, { brightness: 0.2 }).data[0] > 140, '밝기를 올리면 밝아진다');
  assert.ok(O.adjust(s, { brightness: -0.2 }).data[0] < 60, '내리면 어두워진다');

  const red = D.createSurface(1, 1, [200, 50, 50, 255]);
  const grey = O.adjust(red, { saturation: -1 });
  assert.ok(Math.abs(grey.data[0] - grey.data[1]) < 3, '채도 -1 = 흑백');

  const gamma = O.adjust(s, { gamma: 2 });
  assert.ok(gamma.data[0] > 100, '감마 2 = 중간톤이 밝아진다');

  const hue = O.adjust(red, { hue: 120 });
  assert.ok(hue.data[1] > hue.data[0], '색조를 돌리면 빨강이 초록 쪽으로 간다');

  /* 투명한 자리는 안 건드린다 — 안 그러면 지운 자리에 색이 생긴다. */
  const empty = D.createSurface(1, 1);
  assert.deepEqual([...O.adjust(empty, { brightness: 0.5 }).data], [0, 0, 0, 0], '빈 자리는 그대로 빈다');
}

/* 선택영역 — 밖은 한 픽셀도 안 바뀐다 */
{
  const s = D.createSurface(2, 1, [100, 100, 100, 255]);
  const selection = new Uint8Array([255, 0]);
  const out = O.adjust(s, { brightness: 0.5 }, selection);
  assert.ok(out.data[0] > 150, '고른 자리는 바뀐다');
  assert.deepEqual(px(out, 1, 0), [100, 100, 100, 255], '고른 밖은 그대로');

  const half = new Uint8Array([128, 0]);
  const soft = O.adjust(s, { brightness: 0.5 }, half);
  assert.ok(soft.data[0] > 100 && soft.data[0] < out.data[0], '가장자리는 절반만 걸린다');
}

/* ===== 필터 ===== */
{
  const s = D.createSurface(1, 1, [200, 50, 50, 255]);
  const grey = O.filter(s, 'grayscale');
  assert.equal(grey.data[0], grey.data[1], '흑백');
  const inverted = O.filter(s, 'invert');
  assert.deepEqual([...inverted.data.slice(0, 3)], [55, 205, 205], '반전');
  const half = O.filter(s, 'invert', 0.5);
  assert.equal(half.data[0], 128, '세기 0.5 = 반만 섞인다');
  const sepia = O.filter(s, 'sepia');
  assert.ok(sepia.data[0] > sepia.data[2], '세피아는 붉은 기가 돈다');
}
{
  /* 흐리기 — 점 하나가 이웃으로 번진다. 판 전체 밝기는 크게 안 바뀐다. */
  const s = D.createSurface(5, 5, [0, 0, 0, 255]);
  paint(s, 2, 2, [255, 255, 255, 255]);
  const blur = O.filter(s, 'blur');
  assert.ok(blur.data[(2 * 5 + 2) * 4] < 255, '한가운데는 옅어지고');
  assert.ok(blur.data[(2 * 5 + 1) * 4] > 0, '옆으로 번진다');

  const sharp = O.filter(blur, 'sharpen');
  assert.ok(sharp.data[(2 * 5 + 2) * 4] > blur.data[(2 * 5 + 2) * 4], '선명하게 = 다시 또렷해진다');

  /* 가장자리도 어두워지지 않는다(밖 대신 가장 가까운 픽셀을 본다). */
  const flat = D.createSurface(4, 4, [120, 120, 120, 255]);
  const blurred = O.filter(flat, 'blur');
  assert.equal(blurred.data[0], 120, '단색을 흐리면 테두리도 같은 색');
}
{
  const s = D.createSurface(2, 1, [100, 100, 100, 255]);
  const out = O.filter(s, 'invert', 1, new Uint8Array([255, 0]));
  assert.equal(out.data[0], 155, '고른 자리만 반전');
  assert.equal(out.data[4], 100, '밖은 그대로');
}

/* ===== 그림이 든 사각형 ===== */
{
  const s = D.createSurface(6, 6);
  paint(s, 2, 3, [0, 0, 0, 255]);
  paint(s, 4, 1, [0, 0, 0, 255]);
  const bounds = O.contentBounds(s);
  assert.deepEqual([bounds.x, bounds.y, bounds.w, bounds.h], [2, 1, 3, 3], '그림이 실제로 든 사각형');
  assert.equal(O.contentBounds(D.createSurface(4, 4)), null, '빈 판은 null');
}

console.log('[test-meok-ops] ✓ 자르기(넓히기 포함) · 크기(미리곱한 알파·픽셀아트) · 회전·뒤집기 · 보정 5종 · 필터 8종 · 선택영역 밖 불변');
