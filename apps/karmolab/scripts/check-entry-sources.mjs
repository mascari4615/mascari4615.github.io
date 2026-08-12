#!/usr/bin/env node
/**
 * 화면이 부르는데 **소스가 없는 파일**을 push 전에 잡는다 (2026-08-12)
 *
 * 왜 있나: 오늘 하루에만 다섯 번 같은 사고가 났다 — `widgets-meta-rest` · `smoke-meong` ·
 * `heung.ts` · `meong.ts` · `WorldKeyStore` 의 짝. 전부 **부르는 쪽만 올라가고 불리는 쪽이
 * 안 올라간** 상태다. 내 기계에는 파일이 있으니 로컬은 멀쩡하고, 새 체크아웃(CI)만 죽는다.
 * 그 사이 배포가 서고, 고친 화면이 사람에게 안 나간다.
 *
 * `build.mjs` 가 이미 같은 검사를 하지만 그건 **배포 몇 분 뒤**에 말해 준다. 여기선 1초다.
 * 보는 것은 두 가지:
 *   ① 셸이 부르는 `js/<이름>.js` 의 소스(`src/<이름>.ts`)가 저장소에 있나
 *   ② 위젯 메타의 `lazyScriptPaths` 가 가리키는 소스가 저장소에 있나
 *
 * ★ **디스크가 아니라 저장소를 본다** (`git ls-files`). 디스크에 있는데 안 올린 것이 바로
 *   이 사고의 모양이라, 디스크로 재면 영원히 초록이다.
 *
 * 사용: node scripts/check-entry-sources.mjs
 * exit: 0 = 다 있다 / 1 = 없는 것이 있다 / 2 = 검사 자체를 못 돌렸다
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverEntryPoints } from './entry-points.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPECIAL = new Set(['src/mdd.ts', 'src/gemini.ts', 'src/toolbox.ts', 'src/sw.ts']);

let tracked;
try {
  tracked = new Set(
    /* ★ **인덱스가 아니라 커밋을 본다** (2026-08-12). `git ls-files` 는 지금 인덱스를 읽는데,
     *   세션이 여럿인 이 저장소에서는 남이 편집 중인 파일이 인덱스에 「삭제」로 잠깐 박혀 있다 —
     *   그 순간을 재면 멀쩡히 올라가 있는 파일을 「없다」고 말한다(실측: 남의 작업 중 위젯).
     *   push 로 나갈 것은 **커밋(HEAD)** 이므로 그것을 본다. */
    execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
} catch (error) {
  console.error(`[entry-sources] CANNOT-RUN — git ls-files 를 못 돌렸다: ${String(error.message).split('\n')[0]}`);
  process.exit(2);
}

if (tracked.size < 50) {
  console.error(`[entry-sources] CANNOT-RUN — src 아래 올라간 파일이 ${tracked.size}개뿐이다. 경로 확인.`);
  process.exit(2);
}

const missing = [];

/* ① 셸이 부르는 것 */
const { entryPoints } = discoverEntryPoints(root, SPECIAL);
for (const rel of entryPoints) {
  if (!tracked.has(rel)) missing.push(`${rel} (셸이 부른다)`);
}

/* ② 위젯 메타가 가리키는 것 — `lazyScriptPaths: ['heung/heung', …]` */
const metaPath = path.join(root, 'src/widgets-lazy-meta.ts');
if (fs.existsSync(metaPath)) {
  const meta = fs.readFileSync(metaPath, 'utf8');
  for (const m of meta.matchAll(/lazyScriptPaths:\s*\[([^\]]*)\]/g)) {
    for (const p of m[1].matchAll(/'([^']+)'/g)) {
      const raw = p[1];
      /* 형식이 다른 앞머리는 각자 자리에서 산다 — 여기서는 위젯 소스만 본다. */
      if (raw.startsWith('vendor/') || raw.startsWith('root/') || raw.startsWith('world/')) continue;
      const rel = `src/widgets/${raw}.ts`;
      if (!tracked.has(rel)) missing.push(`${rel} (위젯 메타가 부른다)`);
    }
  }
}

if (missing.length) {
  console.error('[entry-sources] 부르는데 **저장소에 없는** 소스:');
  for (const line of [...new Set(missing)]) console.error(`  - ${line}`);
  console.error('  내 기계에는 있어도 안 올렸으면 없는 것이다 — `git add` 하고 같이 올려라.');
  process.exit(1);
}

console.log(`[entry-sources] OK — 부르는 소스 ${entryPoints.length}개 모두 저장소에 있다`);
