/**
 * 선택영역 검사 (TASK-KL-240)
 *
 * 선택은 도구가 아니라 **바탕**이다 — 붓·채우기가 이걸 곱해서 쓴다. 그래서 여기서는
 * 「고르는 것」만이 아니라 「고른 밖으로 안 새는 것」까지 본다.
 * 사용: node scripts/test-meok-selection.mjs
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

const source = fs.readFileSync(path.join(dir, 'selection.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/\bdocument\.|\bwindow\.|\bToolbox\b/.test(source), 'selection.ts 가 브라우저를 부른다');

const D = load('doc');
const S = load('selection');
const B = load('brush');
const P = load('pixel');

const at = (selection, x, y) => selection.mask[y * selection.w + x];

/* ===== 고르기 ===== */
{
  const selection = S.createSelection(8, 8);
  assert.equal(S.isEmpty(selection), true, '처음엔 아무것도 안 고른 상태 = 판 전체가 대상');

  S.selectRect(selection, { x: 2, y: 2, w: 3, h: 3 });
  assert.equal(at(selection, 2, 2), 255);
  assert.equal(at(selection, 4, 4), 255);
  assert.equal(at(selection, 5, 5), 0, '사각형 밖은 안 골린다');
  assert.deepEqual(
    [selection.bounds.x, selection.bounds.y, selection.bounds.w, selection.bounds.h],
    [2, 2, 3, 3], '고른 자리의 테두리를 안다'
  );

  S.selectRect(selection, { x: 4, y: 4, w: 2, h: 2 }, 'add');
  assert.equal(at(selection, 5, 5), 255, '더하기');
  S.selectRect(selection, { x: 2, y: 2, w: 1, h: 1 }, 'subtract');
  assert.equal(at(selection, 2, 2), 0, '빼기');
  S.selectRect(selection, { x: 4, y: 4, w: 4, h: 4 }, 'intersect');
  assert.equal(at(selection, 3, 3), 0, '교집합 — 겹치는 데만 남는다');
  assert.equal(at(selection, 5, 5), 255);

  S.invert(selection);
  assert.equal(at(selection, 5, 5), 0, '뒤집기');
  assert.equal(at(selection, 0, 0), 255);

  S.selectNone(selection);
  assert.equal(S.isEmpty(selection), true, '풀면 다시 판 전체가 대상');
  S.selectAll(selection);
  assert.equal(at(selection, 7, 7), 255);
}

/* 타원 · 올가미 */
{
  const selection = S.createSelection(9, 9);
  S.selectEllipse(selection, { x: 0, y: 0, w: 9, h: 9 });
  assert.equal(at(selection, 4, 4), 255, '한가운데는 안에 든다');
  assert.equal(at(selection, 0, 0), 0, '모서리는 빠진다');
}
{
  const selection = S.createSelection(10, 10);
  S.selectPolygon(selection, [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 8 }, { x: 1, y: 8 }]);
  assert.equal(at(selection, 4, 4), 255, '다각형 안');
  assert.equal(at(selection, 9, 9), 0, '다각형 밖');
  const before = selection.mask.slice();
  S.selectPolygon(selection, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  assert.deepEqual([...selection.mask], [...before], '점 두 개짜리 실수 클릭은 선택을 안 날린다');
}

/* 마술봉 — 비슷한 색만 */
{
  const surface = D.createSurface(4, 1, [0, 0, 0, 255]);
  surface.data.set([250, 250, 250, 255], 8);   /* 세 번째 칸만 흰색 */
  const selection = S.createSelection(4, 1);
  S.magicWand(selection, surface, 0, 0, 0.05);
  assert.equal(at(selection, 0, 0), 255);
  assert.equal(at(selection, 2, 0), 0, '색이 다른 칸은 안 골린다');
  assert.equal(at(selection, 3, 0), 0, '이어져 있지 않으면 못 넘어간다');
  S.magicWand(selection, surface, 0, 0, 0.05, false);
  assert.equal(at(selection, 3, 0), 255, '이어짐 무시하면 같은 색 전부');
}

/* 부드러운 가장자리 */
{
  const selection = S.createSelection(16, 16);
  S.selectRect(selection, { x: 4, y: 4, w: 8, h: 8 });
  S.feather(selection, 2);
  assert.ok(at(selection, 8, 8) > 200, '한가운데는 그대로 고른 상태');
  const edge = at(selection, 4, 8);
  assert.ok(edge > 0 && edge < 255, '가장자리는 중간값이 된다 (' + edge + ')');
  assert.ok(at(selection, 2, 8) > 0, '바깥으로 조금 번진다');
}

/* ===== 고른 밖으로 안 샌다 ===== */
{
  const surface = D.createSurface(32, 32);
  const selection = S.createSelection(32, 32);
  S.selectRect(selection, { x: 0, y: 0, w: 16, h: 32 });   /* 왼쪽 절반만 */
  const stroke = new B.Stroke(surface, { ...B.defaultBrush(), size: 20, hardness: 1, smoothing: 0, color: [0, 0, 0] }, selection.mask);
  stroke.begin({ x: 16, y: 16 });   /* 경계 위에 큰 붓 */
  stroke.end();
  assert.ok(surface.data[(16 * 32 + 10) * 4 + 3] > 200, '고른 쪽에는 그려진다');
  assert.equal(surface.data[(16 * 32 + 20) * 4 + 3], 0, '고른 밖으로는 한 점도 안 샌다');
}
{
  const surface = D.createSurface(8, 1, [0, 0, 0, 255]);
  const selection = S.createSelection(8, 1);
  S.selectRect(selection, { x: 0, y: 0, w: 4, h: 1 });
  const changed = P.floodFill(surface, 0, 0, [255, 0, 0, 255], { selection: selection.mask });
  assert.equal(changed, 4, '채우기도 고른 자리에서 멈춘다');
  assert.equal(surface.data[4 * 4], 0, '밖은 그대로');
}

/* 오려 내기 · 지우기 */
{
  const surface = D.createSurface(4, 1, [9, 9, 9, 255]);
  const selection = S.createSelection(4, 1);
  S.selectRect(selection, { x: 1, y: 0, w: 2, h: 1 });
  S.clearOutside(surface, selection);
  assert.equal(surface.data[3], 0, '고른 밖이 지워진다');
  assert.equal(surface.data[1 * 4 + 3], 255, '고른 안은 남는다');

  const other = D.createSurface(4, 1, [9, 9, 9, 255]);
  S.clearInside(other, selection);
  assert.equal(other.data[1 * 4 + 3], 0, '고른 안이 지워진다');
  assert.equal(other.data[3], 255, '밖은 남는다');

  const all = D.createSurface(4, 1, [9, 9, 9, 255]);
  S.clearInside(all, S.createSelection(4, 1));
  assert.equal(all.data[3], 0, '아무것도 안 골랐으면 판 전체를 지운다');
}

/* 테두리 점선용 경계 */
{
  const selection = S.createSelection(6, 6);
  S.selectRect(selection, { x: 2, y: 2, w: 2, h: 2 });
  const edges = S.edgePixels(selection);
  assert.equal(edges.length, 4, '2×2 는 네 칸 모두 경계');
  assert.equal(S.edgePixels(S.createSelection(4, 4)).length, 0, '아무것도 안 골랐으면 테두리도 없다');
}

console.log('[test-meok-selection] ✓ 사각/타원/올가미/마술봉 · 더하기·빼기·교집합·뒤집기 · feather · 붓·채우기가 밖으로 안 샘 · 오려내기');
