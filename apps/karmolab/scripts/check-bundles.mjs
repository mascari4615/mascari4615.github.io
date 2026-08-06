/**
 * 묶음 위젯 정합 검사 (TASK-KL-088)
 *
 * 여러 도구를 탭으로 묶은 위젯은 손으로 두 곳을 맞춰야 한다 — 탭 목록(부분 id)과
 * 불러올 스크립트 목록. 하나라도 빠지면 **화면이 조용히 빈다** (탭은 보이는데 내용이 없다).
 * 조용한 실패라 사람 눈으로는 늦게 발견되므로 빌드에서 막는다.
 *
 * 검사:
 *  1. 묶음이 부르는 부분 id 가 매니페스트에 있는가
 *  2. 부분이 hidden 인가 (아니면 사이드바에 두 번 뜬다)
 *  3. 부분의 스크립트가 묶음의 lazyScriptPaths 에 있는가
 *  4. 부분이 두 묶음에 겹쳐 들어가 있지 않은가
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// 줄끝이 CRLF 인 파일이 섞여 있어 정규식이 조용히 빗나간다 — 읽는 자리에서 통일한다.
const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').split(CRLF).join(LF);

/** widgets-lazy-meta.ts 를 항목 단위로 쪼개 id → { hidden, paths } 로 만든다. */
function parseManifest() {
  const src = read('src/widgets-lazy-meta.ts');
  const out = {};
  // 최상위 항목은 두 칸 들여쓴 `{` 로 시작해 두 칸 들여쓴 `}` 로 끝난다.
  const blocks = src.split(/\n  \{\n/).slice(1);
  for (const block of blocks) {
    const id = block.match(/^\s*id: '([^']+)'/m)?.[1];
    if (!id) continue;
    const pathsRaw = block.match(/lazyScriptPaths: \[([^\]]*)\]/s)?.[1] || '';
    out[id] = {
      hidden: /\n\s*hidden: true/.test(block),
      bundle: block.match(/\n\s*bundle: '([^']+)'/)?.[1] || null,
      paths: [...pathsRaw.matchAll(/'([^']+)'/g)].map((m) => m[1])
    };
  }
  return out;
}

/** 묶음 위젯 소스에서 [부분 id, 라벨] 목록을 읽는다. */
function parseBundle(file) {
  const src = read(file);
  const partsRaw = src.match(/const (?:PARTS|TABS): Array<\[string, string\]> = \[([\s\S]*?)\n  \];/)?.[1];
  if (!partsRaw) return null;
  return [...partsRaw.matchAll(/\['([^']+)', '[^']*'\]/g)].map((m) => m[1]);
}

const manifest = parseManifest();
const bundleFiles = fs
  .readdirSync(path.join(root, 'src/widgets/tools'))
  .map((f) => `src/widgets/tools/${f}`)
  .concat(fs.readdirSync(path.join(root, 'src/widgets/ref')).map((f) => `src/widgets/ref/${f}`))
  .filter((f) => f.endsWith('.ts'));

const failures = [];
const seenPart = {};
let bundleCount = 0;

for (const file of bundleFiles) {
  const parts = parseBundle(file);
  if (!parts || parts.length < 2) continue; // 묶음이 아니다
  const bundleId = path.basename(file, '.ts');
  if (!manifest[bundleId]) continue; // 매니페스트에 없는 파일 (부분 위젯 등)
  bundleCount++;
  const declared = manifest[bundleId].paths;

  for (const part of parts) {
    if (!manifest[part]) {
      failures.push(`${bundleId}: 탭 '${part}' 가 매니페스트에 없다`);
      continue;
    }
    if (manifest[part].bundle !== bundleId) {
      failures.push(`${bundleId}: 부분 '${part}' 의 매니페스트 bundle 이 '${manifest[part].bundle}' 다 — 이름으로 불렀을 때 엉뚱한 곳으로 간다`);
    }
    if (!manifest[part].hidden) {
      failures.push(`${bundleId}: 부분 '${part}' 가 hidden 이 아니다 — 사이드바에 두 번 뜬다`);
    }
    // 부분이 필요로 하는 스크립트가 묶음의 목록에 전부 들어 있어야 한다.
    for (const need of manifest[part].paths) {
      if (!declared.includes(need)) {
        failures.push(`${bundleId}: '${part}' 가 필요한 스크립트 '${need}' 가 lazyScriptPaths 에 없다 — 탭이 빈 채로 열린다`);
      }
    }
    if (seenPart[part]) {
      failures.push(`'${part}' 가 두 묶음에 들어 있다 (${seenPart[part]}, ${bundleId})`);
    } else {
      seenPart[part] = bundleId;
    }
  }
  // 묶음 자신의 스크립트도 목록 끝에 있어야 로드된다.
  if (!declared.includes(file.replace('src/widgets/', '').replace('.ts', ''))) {
    failures.push(`${bundleId}: 자기 스크립트가 lazyScriptPaths 에 없다`);
  }
}

if (failures.length) {
  console.error(`[check-bundles] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[check-bundles] 묶음 ${bundleCount}개 · 부분 ${Object.keys(seenPart).length}개 정합 OK`);
