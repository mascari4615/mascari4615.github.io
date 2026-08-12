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
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
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
  if (!referenced) orphans.push(name);
}

console.log(`[orphan-widgets] 폴더형 위젯 ${folders.length}개 검사 · 고아 ${orphans.length}개`);
for (const o of orphans) {
  console.error(`  ✗ src/widgets/${o}/ — 폴더 밖 어디서도 안 부른다. 옮기고 지우지 않았나?`);
}
process.exit(orphans.length > 0 ? 1 : 0);
