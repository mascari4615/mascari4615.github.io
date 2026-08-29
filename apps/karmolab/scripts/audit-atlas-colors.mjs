#!/usr/bin/env node
/**
 * audit-atlas-colors. **색약이 있어도 갈리나, 바탕에서 보이나** (TASK-KAR-233).
 *
 * 위젯 주석에 색약이 있어도 갈리는 검증된 여덟 색(Wong)이라 적어 두고,
 * **우리 바탕, 우리 조합으로는 한 번도 안 쟀다.** 재 보니 주장은 사실이었는데
 * **여유가 얇았다**. 파랑이 바탕과 3.57:1(바닥 3:1), 청색맹에서 초록↔파랑 ΔE 10.2(바닥 10).
 * 색 하나만 손대도, 바탕만 조금 밝혀도 조용히 깨진다. 그래서 자로 박는다.
 *
 * 기준 둘:
 *  - **WCAG 1.4.11**. 그림 요소는 옆 색과 3:1 이상.
 *  - **Viénot 1999**. 적, 녹, 청색맹을 선형 RGB 행렬로 흉내 내는 표준(Brettel 1997 계열).
 *    흉내 낸 뒤에도 색끼리 ΔE 10 이상이어야 확실히 다른 색이다.
 *
 * ⚠ **색을 여기 베껴 두지 않는다.** 위젯 소스에서 읽는다. 베껴 두면 소스가 바뀔 때
 *    자만 옛 색을 보고 초록을 준다(자가 위젯 식을 베끼면 같이 틀린다는 앞의 교훈과 같다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'widgets', 'memo-atlas.ts');
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(SRC)) {
  console.log('[colors] 위젯 소스가 없다. 검사 건너뜀');
  process.exit(0);
}
const src = fs.readFileSync(SRC, 'utf8');

/** 소스에서 팔레트를 읽는다. 못 읽으면 **그것부터 실패다**. 못 재는 자는 자가 아니다. */
function readPalette() {
  const m = src.match(/const CLUSTER_COLORS = \[([\s\S]*?)\n {2}\];/);
  if (!m) return null;
  const out = [];
  for (const row of m[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)) {
    out.push([Number(row[1]), Number(row[2]), Number(row[3])]);
  }
  return out.length ? out : null;
}
/** 바탕은 그러데이션이라 두 끝을 다 본다. 밝은 쪽에서 안 보이면 안 보이는 것이다. */
function readBackground() {
  const m = src.match(/background:radial-gradient\([^)]*?(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\)/);
  if (!m) return null;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return [hex(m[1]), hex(m[2])];
}

const palette = readPalette();
const bgs = readBackground();
if (!palette || !bgs) {
  console.log('[colors] **소스에서 색을 못 읽었다**. 자가 옛 색을 보고 초록을 줄 뻔했다');
  console.log('  CLUSTER_COLORS 나 .atlas-canvas 바탕 표기가 바뀌었는지 봐라.');
  process.exit(1);
}

/* 지도는 가장 성긴 층 수만큼만 색을 쓴다. 안 쓰는 색까지 따지면 헛되이 빨개진다. */
let used = 6;
try {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  used = Math.min(palette.length, atlas.levels?.[0]?.names?.length || 6);
} catch { /* 지도가 없으면 여섯으로 본다 */ }
const colors = palette.slice(0, used);

const srgb = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const l1 = lum(a); const l2 = lum(b);
  const hi = Math.max(l1, l2); const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
};

const MATS = {
  '적색맹': [[0.11238, 0.88762, 0], [0.07276, 0.92724, 0], [0.00399, -0.00399, 1]],
  '녹색맹': [[0.29275, 0.70725, 0], [0.34557, 0.65443, 0], [-0.02174, 0.02174, 1]],
  '청색맹': [[1, 0.14461, -0.14461], [0, 0.85924, 0.14076], [0, 0.85924, 0.14076]],
};
const toSrgb = (c) => c.map((v) => {
  const x = Math.max(0, Math.min(1, v));
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
});
const apply = (m, c) => {
  const l = c.map(srgb);
  return toSrgb(m.map((row) => row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
};
/* 색이 갈리나 = CIE76 색차. 2.3 이 겨우 눈치챔, 10 이면 확실히 다른 색. */
const toXyz = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map(srgb);
  return [R * 0.4124 + G * 0.3576 + B * 0.1805, R * 0.2126 + G * 0.7152 + B * 0.0722, R * 0.0193 + G * 0.1192 + B * 0.9505];
};
const fx = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const toLab = (c) => {
  const [X, Y, Z] = toXyz(c);
  const x = fx(X / 0.9505); const y = fx(Y); const z = fx(Z / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const dE = (a, b) => {
  const A = toLab(a); const B = toLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

const MIN_CONTRAST = 3;     // WCAG 1.4.11
const MIN_DE = 10;          // 확실히 다른 색
const problems = [];

let worstContrast = Infinity; let worstColor = -1;
for (let i = 0; i < colors.length; i += 1) {
  const r = Math.min(...bgs.map((b) => ratio(colors[i], b)));
  if (r < worstContrast) { worstContrast = r; worstColor = i; }
  if (r < MIN_CONTRAST) problems.push(`${i}번 색이 바탕과 ${r.toFixed(2)}:1. ${MIN_CONTRAST}:1 미달`);
}
console.log(`[colors] 쓰는 색 ${colors.length}가지, 바탕과 가장 안 갈리는 것 ${worstColor}번 ${worstContrast.toFixed(2)}:1 (바닥 ${MIN_CONTRAST}:1)`);

function worstPair(list) {
  let worst = Infinity; let pair = '';
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const d = dE(list[i], list[j]);
      if (d < worst) { worst = d; pair = `${i}↔${j}`; }
    }
  }
  return { worst, pair };
}
const plain = worstPair(colors);
console.log(`[colors] 보통 눈. 가장 붙은 짝 ${plain.pair} ΔE ${plain.worst.toFixed(1)}`);
for (const [kind, m] of Object.entries(MATS)) {
  const { worst, pair } = worstPair(colors.map((c) => apply(m, c)));
  console.log(`[colors] ${kind}. 가장 붙은 짝 ${pair} ΔE ${worst.toFixed(1)} (바닥 ${MIN_DE})`);
  if (worst < MIN_DE) problems.push(`${kind}에서 ${pair} 이 ΔE ${worst.toFixed(1)}. ${MIN_DE} 미달, 두 덩어리가 같은 색으로 보인다`);
}

if (problems.length) {
  console.log('[colors] **색이 제 몫을 못 한다**');
  for (const p of problems) console.log('  - ' + p);
  console.log('  CLUSTER_COLORS 를 Wong 팔레트 안에서 고르고, 바탕을 밝히지 마라.');
  process.exit(1);
}
console.log('[colors] 바탕에서도 보이고, 세 가지 색약에서도 갈린다');
