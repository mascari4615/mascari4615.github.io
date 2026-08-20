#!/usr/bin/env node
/**
 * 아무도 안 부르는 위젯 폴더를 찾는다 — 「이름만 바꾸고 옛것을 안 지운」 자리.
 *
 * 왜 (2026-08-12 실측): `karmo-studio` → `흥`, `ditherdeck` → `먹` 으로 옮기면서 **새 폴더는
 * 커밋됐는데 옛 폴더 삭제는 안 올라갔다.** 저장소에도 배포에도 두 벌이 남았고, 참조가 0 인
 * 죽은 코드 30 파일이 실려 나갔다. 아무도 몰랐다 — 화면은 멀쩡했기 때문이다(새것이 그린다).
 *
 * 판정: `src/widgets/<이름>/` 폴더인데 그 폴더 **밖** 어디에서도 이름이 안 나오면 고아다.
 * (등록은 매니페스트·지연 메타·다른 위젯의 import 중 하나로 반드시 드러난다.)
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const widgetsDir = join(app, 'src', 'widgets');

/** 이름이 나올 수 있는 곳 — 위젯 폴더 자신은 뺀다. */
const SEARCH_ROOTS = [join(app, 'src'), join(app, 'scripts'), join(app, 'i18n'), join(app, 'index.html')];

function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) { yield path; return; }
  for (const e of readdirSync(path, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    yield* walk(join(path, e.name));
  }
}

const files = [];
for (const root of SEARCH_ROOTS) for (const f of walk(root)) files.push(f);

const folders = readdirSync(widgetsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

if (folders.length === 0) {
  console.error('[orphan-widgets] 폴더형 위젯이 0 개 — 통과가 아니라 실패다(경로가 바뀌었나).');
  process.exit(1);
}

/* 지어지는 목록 = build.mjs 가 쓰는 것과 **같은 함수**로 뽑는다(두 벌이면 갈라진다). */
const { discoverEntryPoints } = await import('./entry-points.mjs');
const entry = discoverEntryPoints(app);
const ENTRY_SET = new Set(
  (Array.isArray(entry) ? entry : (entry.entryPoints ?? [])).map((p) => String(p).split('\\').join('/')),
);
if (ENTRY_SET.size === 0) {
  console.error('[orphan-widgets] CANNOT-RUN: 지어지는 목록이 비었다 — entry-points 가 못 돌았다');
  process.exit(2);
}

const orphans = [];
for (const name of folders) {
  const folderPath = join(widgetsDir, name);
  let referenced = false;
  for (const f of files) {
    if (!relative(folderPath, f).startsWith('..')) continue;   // 자기 폴더 안은 안 센다
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }        // 바이너리
    if (text.includes(name)) { referenced = true; break; }
  }
  /* ★ **이름이 어디 나온다고 닿는 게 아니다** (2026-08-16).
     예전 판정은 「폴더 밖 어디에서든 이름이 나오면 고아 아님」이었다. 그래서
     `src/widgets/foundry/` 가 통과했다 — 같은 이름의 **다른 파일**(`src/lib/foundry.ts`)이
     있었기 때문이다. 정작 그 위젯은 등록도 빌드도 안 돼 있어서 `#foundry` 를 열면 아무것도
     안 뜬다(smoke-foundry 가 20초 기다리다 죽는다). 전 게이트는 초록이었다.
     그래서 **지어지는 목록**(build 가 실제로 쓰는 entry 집합)에 있는지로 판정한다. */
  /* 담는 폴더(`tools/`·`ref/` 처럼 여러 개를 품는 자리)도 있으므로, 그 폴더 **밑의 무엇이든**
     지어지면 닿는 것으로 본다. 하나도 안 지어지면 그 폴더는 화면에 못 나온다. */
  const builds = [...ENTRY_SET].some((e) => e.startsWith(`src/widgets/${name}/`) || e === `src/widgets/${name}.ts`);
  if (!referenced || !builds) orphans.push(name + (referenced && !builds ? ' (이름은 나오는데 **지어지지 않는다**)' : ''));
}

/* ★ 톱니 — 지금 안 지어지는 것 셋은 「지을지 지울지」가 사람 결정이라 여기서 못 정한다.
   기준선에 담고 **늘어날 때만** 빨갛다. 갚으면 저절로 줄어든다. 정본 = TASK-KL-319. */
const BASE_FILE = join(app, 'data/unbuilt-widgets.json');
const baseline = new Set(
  existsSync(BASE_FILE) ? (JSON.parse(readFileSync(BASE_FILE, 'utf8')).목록 ?? []) : [],
);
const namesOnly = orphans.map((o) => String(o).split(' ')[0]);
const grown = namesOnly.filter((n) => !baseline.has(n));
const repaid = [...baseline].filter((n) => !namesOnly.includes(n));
if (repaid.length > 0 || process.argv.includes('--write-baseline')) {
  writeFileSync(
    BASE_FILE,
    `${JSON.stringify({ 설명: '아직 안 지어지는 폴더형 위젯 — 늘면 빨강, 지으면(또는 지우면) 저절로 줄어든다', 목록: namesOnly, 갱신: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
  );
  if (repaid.length > 0) console.log(`[orphan-widgets] ${repaid.length}개 정리됨 — 기준선 ${baseline.size} → ${namesOnly.length}: ${repaid.join(', ')}`);
}

console.log(`[orphan-widgets] 폴더형 위젯 ${folders.length}개 검사 · 고아 ${orphans.length}개`);
for (const o of orphans) {
  console.error(`  ✗ src/widgets/${o}/ — 폴더 밖 어디서도 안 부른다. 옮기고 지우지 않았나?`);
}
if (grown.length > 0) {
  console.error(`[orphan-widgets] 새로 생긴 고아 ${grown.length}개 — ${grown.join(', ')}`);
  process.exit(1);
}
if (namesOnly.length > 0) console.log(`  (위 ${namesOnly.length}개는 기준선 — TASK-KL-319 에서 지을지 지울지 정한다)`);
process.exit(0);
