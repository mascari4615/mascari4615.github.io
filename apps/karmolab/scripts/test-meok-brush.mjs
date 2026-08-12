/**
 * 이미지 편집기 붓·픽셀 검사 (TASK-KL-240)
 *
 * 붓에서 눈으로 잡기 어려운 것 둘을 여기서 잠근다:
 *  ① 반투명 붓으로 천천히 그어도 **한 겹**이어야 한다(도장 겹침이 안 진해진다)
 *  ② 빠르게 그어도 점선이 안 된다(도장 사이가 채워진다)
 * 사용: node scripts/test-meok-brush.mjs
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

for (const file of ['brush', 'pixel']) {
  const source = fs.readFileSync(path.join(dir, file + '.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\bdocument\.|\bwindow\.|\bToolbox\b/.test(source), file + '.ts 가 브라우저를 부른다');
}

const D = load('doc');
const C = load('composite');
const B = load('brush');
const P = load('pixel');

const alphaAt = (surface, x, y) => surface.data[(y * surface.w + x) * 4 + 3];

/* ===== 붓 — 한 획은 한 겹 ===== */
{
  const surface = D.createSurface(64, 64);
  const settings = { ...B.defaultBrush(), size: 12, hardness: 1, opacity: 0.5, spacing: 0.05, smoothing: 0, color: [255, 0, 0] };
  const stroke = new B.Stroke(surface, settings);
  stroke.begin({ x: 10, y: 32 });
  /* 아주 촘촘히 — 도장이 수십 번 겹친다. */
  for (let x = 10; x <= 50; x += 0.5) stroke.move({ x, y: 32 });
  stroke.end();
  const a = alphaAt(surface, 30, 32);
  assert.equal(a, 128, '반투명 붓을 천천히 그어도 한 겹(도장 겹침이 안 쌓인다) — 실제 ' + a);
}

/* 빠르게 그어도 점선이 안 된다 */
{
  const surface = D.createSurface(64, 8);
  const stroke = new B.Stroke(surface, { ...B.defaultBrush(), size: 4, hardness: 1, smoothing: 0, color: [0, 0, 0] });
  stroke.begin({ x: 2, y: 4 });
  stroke.move({ x: 60, y: 4 });   /* 한 번에 58px 점프 */
  stroke.end();
  let gaps = 0;
  for (let x = 3; x <= 58; x += 1) if (alphaAt(surface, x, 4) === 0) gaps += 1;
  assert.equal(gaps, 0, '도장 사이가 채워진다 (빈 칸 ' + gaps + ')');
}

/* 지우개는 색이 아니라 알파를 깎는다 */
{
  const surface = D.createSurface(16, 16, [10, 20, 30, 255]);
  const stroke = new B.Stroke(surface, { ...B.defaultBrush(), size: 6, hardness: 1, mode: 'erase', smoothing: 0 });
  stroke.begin({ x: 8, y: 8 });
  stroke.end();
  assert.equal(alphaAt(surface, 8, 8), 0, '지운 자리는 비었다');
  assert.equal(surface.data[(8 * 16 + 8) * 4], 10, '색은 그대로 둔다');
  assert.equal(alphaAt(surface, 0, 0), 255, '붓 밖은 안 건드린다');
}

/* 흐름(flow) — 한 번 지나면 옅고, 여러 획이면 진해진다 */
{
  const settings = { ...B.defaultBrush(), size: 8, hardness: 1, flow: 0.25, opacity: 1, smoothing: 0, color: [0, 0, 0], pressureFlow: 0 };
  const surface = D.createSurface(16, 16);
  const first = new B.Stroke(surface, settings);
  first.begin({ x: 8, y: 8 }); first.end();
  const once = alphaAt(surface, 8, 8);
  assert.equal(once, 64, '한 도장은 흐름만큼만 — 실제 ' + once);
  const second = new B.Stroke(surface, settings);
  second.begin({ x: 8, y: 8 }); second.end();
  assert.ok(alphaAt(surface, 8, 8) > once, '획을 또 그으면 진해진다');
}

/* 필압 — 약하게 누르면 가늘다 */
{
  const settings = { ...B.defaultBrush(), size: 20, hardness: 1, smoothing: 0, pressureSize: 1, pressureFlow: 0, color: [0, 0, 0] };
  const soft = D.createSurface(40, 40);
  const softStroke = new B.Stroke(soft, settings);
  softStroke.begin({ x: 20, y: 20, pressure: 0.2 }); softStroke.end();
  const hard = D.createSurface(40, 40);
  const hardStroke = new B.Stroke(hard, settings);
  hardStroke.begin({ x: 20, y: 20, pressure: 1 }); hardStroke.end();
  const width = (s) => { let n = 0; for (let x = 0; x < 40; x += 1) if (alphaAt(s, x, 20) > 0) n += 1; return n; };
  assert.ok(width(soft) < width(hard) / 2, '약한 필압이 눈에 띄게 가늘다 (' + width(soft) + ' vs ' + width(hard) + ')');
}

/* 픽셀 모드 — 격자 칸에 딱 붙고 흐린 가장자리가 없다 */
{
  const surface = D.createSurface(32, 32);
  const stroke = new B.Stroke(surface, { ...B.defaultBrush(), pixel: true, grid: 8, size: 8, smoothing: 0, color: [0, 0, 0] });
  stroke.begin({ x: 11, y: 3 });   /* 칸 (1,0) 안 */
  stroke.end();
  assert.equal(alphaAt(surface, 8, 0), 255, '칸 왼쪽 위가 꽉 찬다');
  assert.equal(alphaAt(surface, 15, 7), 255, '칸 오른쪽 아래까지 찬다');
  assert.equal(alphaAt(surface, 16, 0), 0, '옆 칸으로 안 샌다');
  assert.equal(alphaAt(surface, 7, 0), 0, '반쪽 칸이 없다');
}

/* 스포이드 */
{
  const surface = D.createSurface(4, 4, [1, 2, 3, 255]);
  assert.deepEqual([...B.pickColor(surface, 1, 1)], [1, 2, 3, 255]);
  assert.equal(B.pickColor(surface, 9, 9), null, '판 밖은 null');
}

/* ===== 채우기 ===== */
{
  const surface = D.createSurface(8, 8, [255, 255, 255, 255]);
  /* 가운데 세로 벽 */
  for (let y = 0; y < 8; y += 1) {
    const i = (y * 8 + 4) * 4;
    surface.data[i] = 0; surface.data[i + 1] = 0; surface.data[i + 2] = 0;
  }
  const changed = P.floodFill(surface, 1, 1, [255, 0, 0, 255]);
  assert.equal(changed, 32, '벽 왼쪽만 칠한다 (4×8)');
  assert.equal(surface.data[(0 * 8 + 5) * 4], 255, '벽 너머는 안 샌다');
  assert.equal(P.floodFill(surface, 1, 1, [255, 0, 0, 255]), 0, '같은 색 다시 칠하면 0 — 되돌리기 단계 안 늘림');
}
{
  /* 이어져 있지 않아도 같은 색 전부 */
  const surface = D.createSurface(4, 1, [0, 0, 0, 255]);
  surface.data.set([9, 9, 9, 255], 4);
  const changed = P.floodFill(surface, 0, 0, [1, 1, 1, 255], { contiguous: false });
  assert.equal(changed, 3, '떨어져 있어도 같은 색은 다 칠한다');
}

/* ===== 옛 Ditherdeck 파일이 그대로 열린다 ===== */
{
  const project = {
    name: 'old sprite',
    size: 8,
    fps: 6,
    palette: ['#ff4f88', '#18222d'],
    frames: [
      Array.from({ length: 64 }, (_x, i) => (i === 0 ? '#ff4f88' : '')),
      Array.from({ length: 64 }, (_x, i) => (i === 63 ? '#18222d' : ''))
    ]
  };
  assert.equal(P.isDitherdeckProject(project), true);
  const doc = P.docFromDitherdeck(project, 4);
  assert.equal(doc.w, 32, '8칸 × 4배 = 32px');
  assert.equal(doc.frames, 2, '프레임 두 장이 그대로');
  assert.equal(doc.grid, 4);
  assert.equal(doc.fps, 6);
  assert.deepEqual([...doc.layers[0].cels[0].data.slice(0, 4)], [255, 79, 136, 255], '첫 칸 색이 산다');
  assert.equal(doc.layers[0].cels[0].data[(3 * 32 + 3) * 4 + 3], 255, '한 칸이 4×4 로 커진다');
  assert.equal(doc.layers[0].cels[1].data[3], 0, '둘째 프레임은 첫 칸이 비었다');

  /* 왕복 — 옛 도구로도 계속 열린다 */
  const back = P.ditherdeckFromDoc(doc, (d, f) => C.composite(d, f));
  assert.equal(back.size, 8);
  assert.equal(back.frames.length, 2);
  assert.equal(back.frames[0][0], '#ff4f88', '색이 왕복해도 같다');
  assert.equal(back.frames[0][1], '', '빈 칸은 빈 채로');
  assert.equal(back.frames[1][63], '#18222d');
}

/* 색 읽기 · 팔레트 뽑기 */
{
  assert.deepEqual([...P.parseHex('#f0a')], [255, 0, 170, 255]);
  assert.deepEqual([...P.parseHex('#12345678')], [18, 52, 86, 120]);
  assert.equal(P.parseHex('테스트 abc'), null, '색이 아닌 글자는 null');
  assert.equal(P.toHex(255, 0, 170), '#ff00aa');

  const surface = D.createSurface(4, 1, [10, 20, 30, 255]);
  surface.data.set([200, 100, 50, 255], 0);
  const palette = P.extractPalette(surface);
  assert.equal(palette[0], '#0a141e', '많이 쓴 색이 먼저');
  assert.equal(palette.length, 2);
}

/* 새 픽셀 문서 · 칸 칠하기 */
{
  const doc = P.createPixelDoc(16, 8, 'sprite');
  assert.equal(doc.w, 128);
  assert.equal(doc.grid, 8);
  const cel = D.ensureCel(doc, doc.layers[0], 0);
  P.setCell(cel, doc, 2, 3, [1, 2, 3, 255]);
  assert.equal(cel.data[((3 * 8) * 128 + 2 * 8) * 4], 1, '칸 왼쪽 위');
  assert.equal(cel.data[((3 * 8 + 7) * 128 + 2 * 8 + 7) * 4 + 3], 255, '칸 오른쪽 아래');
  assert.equal(cel.data[((3 * 8) * 128 + 3 * 8) * 4 + 3], 0, '옆 칸은 안 건드린다');
}

console.log('[test-meok-brush] ✓ 한 획 한 겹 · 빈틈 없음 · 지우개 · 흐름 · 필압 · 픽셀 격자 · 채우기 · ditherdeck 왕복');
