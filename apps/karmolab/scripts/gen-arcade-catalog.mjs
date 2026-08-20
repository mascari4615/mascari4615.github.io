#!/usr/bin/env node
/**
 * 오락실 명패 굽기 — 로비가 **게임 코드 없이** 목록을 그릴 수 있게 (TASK-KL-242 쪼개기)
 *
 * 왜: 로비만 열어도 게임 51개가 통째로 딸려 왔다(`arcade.js` gzip 94.5KB, 천장 64KB).
 * 로비가 진짜 필요한 건 이름표뿐이다 — 그림·갈래·자리 수·실시간 여부. 규칙과 화면은
 * **누를 때** 조각으로 받는다(`arcade/games/<조각>.js`).
 *
 * 정본은 그대로 `catalog.ts` 한 곳이다. 이 파일은 거기서 **파생**만 한다:
 *   · `src/widgets/arcade/catalog-meta.generated.ts` — 로비가 읽는 명패 51줄
 *   · 각 줄의 `chunk` = 그 게임 조각 파일 이름 (`build.mjs` 가 그 이름으로 굽는다)
 *
 * 자리 수·실시간 여부는 **규칙 파일 안에** 있어서 글자로 못 읽는다 — 그래서 카탈로그를
 * 한 번 **묶어서 돌려** 진짜 값을 꺼낸다(추측한 값을 적으면 언젠가 갈라진다).
 *
 * 사용: node scripts/gen-arcade-catalog.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(root, 'src/widgets/arcade/catalog.ts');
const src = readFileSync(catalogPath, 'utf8');

/* ① 이름 → 파일 (import 줄) */
const modOf = new Map();
for (const m of src.matchAll(/import\s*\{\s*([\w$]+)\s*\}\s*from\s*'\.\/games\/([\w-]+)'/g)) {
  modOf.set(m[1], m[2]);
}

/* ② 줄 차례대로 규칙·화면이 어느 파일에서 왔나 */
const body = src.slice(src.indexOf('export const CATALOG'));
const rows = [...body.matchAll(/\{\s*def:\s*([\w$]+),\s*view:\s*([\w$]+),/g)].map((m) => ({
  defMod: modOf.get(m[1]),
  viewMod: modOf.get(m[2]),
  defVar: m[1],
  viewVar: m[2]
}));
const orphans = rows.filter((r) => !r.defMod || !r.viewMod);
if (orphans.length) {
  console.error('[gen-arcade-catalog] 어느 파일에서 온 건지 못 찾은 줄이 있다:');
  orphans.forEach((r) => console.error(`  - def:${r.defVar} view:${r.viewVar}`));
  process.exit(1);
}

/* ③ 진짜 값(id·자리 수·실시간)은 돌려서 꺼낸다 */
const tmp = mkdtempSync(join(tmpdir(), 'kl-arcade-'));
let CATALOG;
try {
  const out = join(tmp, 'catalog.mjs');
  await esbuild.build({
    entryPoints: [catalogPath],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node18'],
    logLevel: 'silent'
  });
  ({ CATALOG } = await import(pathToFileURL(out).href));
} finally {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp 다 */ }
}

if (!Array.isArray(CATALOG) || CATALOG.length !== rows.length) {
  console.error(`[gen-arcade-catalog] 글자로 읽은 줄 ${rows.length}개와 돌려서 나온 줄 ${CATALOG?.length}개가 다르다`);
  process.exit(1);
}

const meta = CATALOG.map((e, i) => ({
  id: e.def.id,
  icon: e.icon,
  kind: e.kind,
  seats: [e.def.seats[0], e.def.seats[1]],
  realtime: e.def.realtime === true,
  chunk: rows[i].defMod,
  view: rows[i].viewMod,
  defVar: rows[i].defVar,
  viewVar: rows[i].viewVar
}));

const overlap = meta.map((m) => m.chunk).filter((c, i, a) => a.indexOf(c) !== i);
if (overlap.length) {
  console.error('[gen-arcade-catalog] 조각 이름이 겹친다: ' + [...new Set(overlap)].join(', '));
  process.exit(1);
}

const q = (s) => "'" + String(s) + "'";
const NL = '\n';
const lines = meta
  .map(
    (m) =>
      `  { id: ${q(m.id)}, icon: ${q(m.icon)}, kind: ${q(m.kind)}` +
      `, seats: [${m.seats[0]}, ${m.seats[1]}], realtime: ${m.realtime}, chunk: ${q(m.chunk)} }`
  )
  .join(',' + NL);

const ts =
  `/* `.trim() +
  `* **구운 파일이다 — 손으로 고치지 마라.** 정본 = \`catalog.ts\`, 굽는 놈 = \`scripts/gen-arcade-catalog.mjs\`.` + NL +
  ` *` + NL +
  ` * 로비가 목록을 그리는 데 필요한 것만 담았다(그림·갈래·자리 수·실시간 여부).` + NL +
  ` * 규칙과 화면은 여기 없다 — 누를 때 \`arcade/games/<chunk>.js\` 로 받는다.` + NL +
  ` */` + NL +
  `import type { Kind } from './meta';` + NL + NL +
  `export interface GameCard {` + NL +
  `  id: string;` + NL +
  `  icon: string;` + NL +
  `  kind: Kind;` + NL +
  `  seats: [min: number, max: number];` + NL +
  `  realtime: boolean;` + NL +
  `  /** 이 게임 조각 파일 이름 — \`arcade/games/<chunk>.js\` */` + NL +
  `  chunk: string;` + NL +
  `}` + NL + NL +
  `export const CARDS: GameCard[] = [` + NL +
  lines + NL +
  `];` + NL + NL +
  `export const cardById = (id: string): GameCard | undefined => CARDS.find((c) => c.id === id);` + NL;

writeFileSync(join(root, 'src/widgets/arcade/catalog-meta.generated.ts'), '/*' + ts.slice(2), 'utf8');
/* 조각 굽기가 읽는 표 — 이름 → 규칙 파일 · 화면 파일 */
writeFileSync(
  join(root, 'src/widgets/arcade/chunks.generated.json'),
  JSON.stringify(meta.map((m) => ({ id: m.id, chunk: m.chunk, view: m.view, defVar: m.defVar, viewVar: m.viewVar })), null, 2) + NL,
  'utf8'
);
console.log(`[gen-arcade-catalog] 명패 ${meta.length}개 → catalog-meta.generated.ts · 조각 표 ${meta.length}개`);
