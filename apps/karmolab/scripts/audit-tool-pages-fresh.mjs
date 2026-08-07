/**
 * 도구 페이지가 셸과 갈라졌는지 본다 (TASK-KL-097)
 *
 * 도구 상세 127장 + 목록 한 장은 `index.html`(앱 셸)에서 **만들어진 것**이다. 단일 출처는
 * 이미 있다 — 문제는 셸을 고치고 다시 안 찍어도 아무도 안 잡는다는 것이었다. 실제로 오늘
 * 셸의 인트로 규칙과 브랜드 글자 규칙을 고쳤는데, 도구 페이지 127장에는 그것이 없었다.
 * 눈으로는 절대 안 보인다 — 페이지가 멀쩡히 열리기 때문이다.
 *
 * 흔한 방식은 「CI 에서 다시 만들고 `git diff --exit-code`」다. 여기서는 한 걸음 더 간다:
 * **임시 자리에 만들어 놓고 대조**한다. 이유 둘 —
 *   ① 작업 트리를 안 건드린다. 이 저장소는 여러 세션이 같은 트리를 공유해서, 검사가 파일을
 *      새로 쓰면 남의 작업과 섞인다.
 *   ② `git diff` 는 **남이 아직 안 올린 변경까지** 실패로 잡는다. 그건 이 검사가 볼 일이 아니다.
 *
 * 사용: node scripts/audit-tool-pages-fresh.mjs
 * 낡은 것이 있으면 무엇이 어떻게 다른지 적고 1 로 끝난다. 고치는 법은 `npm run gen:tool-pages`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const live = path.resolve(root, '../blog/karmolab/t');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-pages-'));
const out = path.join(tmp, 't');

if (!fs.existsSync(live)) {
  console.error('[audit-tool-pages] 만들어진 도구 페이지 폴더가 없다 — `npm run gen:tool-pages` 를 먼저 돌려라.');
  process.exit(1);
}

try {
  execFileSync(process.execPath, [path.join(root, 'scripts/gen-tool-pages.mjs'), '--out', out], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, KARMOLAB_GEN_NO_STATE: '1' },
  });
} catch (e) {
  console.error('[audit-tool-pages] 다시 만들어 보는 중 실패했다 — 그것부터 고쳐야 한다.');
  console.error(String(e.stderr || e.stdout || e.message).slice(0, 1200));
  process.exit(1);
}

/** 폴더 안의 파일을 상대 경로 → 내용으로 (줄 끝 차이는 무시 — 기계마다 다르다) */
function readAll(dir, base = dir, acc = new Map()) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) readAll(p, base, acc);
    else acc.set(path.relative(base, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8').split('\r\n').join('\n'));
  }
  return acc;
}

const fresh = readAll(out);
const disk = readAll(live);
const stale = [], missing = [], extra = [];

for (const [rel, content] of fresh) {
  if (!disk.has(rel)) missing.push(rel);
  else if (disk.get(rel) !== content) stale.push(rel);
}
for (const rel of disk.keys()) if (!fresh.has(rel)) extra.push(rel);

fs.rmSync(tmp, { recursive: true, force: true });

const total = stale.length + missing.length + extra.length;
if (!total) {
  console.log(`[audit-tool-pages] 도구 페이지 ${disk.size}개가 셸과 같다`);
  process.exit(0);
}

console.error(`[audit-tool-pages] 셸과 갈라진 것 ${total}개 — \`npm run gen:tool-pages\` 로 다시 찍어라\n`);
const show = (label, list) => {
  if (!list.length) return;
  console.error(`  ${label} ${list.length}개`);
  for (const rel of list.slice(0, 8)) console.error(`    · ${rel}`);
  if (list.length > 8) console.error(`    … 그 외 ${list.length - 8}개`);
};
show('낡음 (내용이 다르다)', stale);
show('없음 (안 찍혔다)', missing);
show('남음 (셸이 더 이상 안 만든다)', extra);

/* 무엇이 다른지 한 곳만 보여 준다 — 「낡았다」만 적으면 왜인지 몰라 다시 찍기만 반복한다. */
if (stale.length) {
  const rel = stale[0];
  const a = disk.get(rel).split('\n');
  const b = fresh.get(rel).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error(`\n  첫 차이 — ${rel} ${i + 1}번째 줄`);
      console.error(`    지금:  ${(a[i] ?? '(없음)').trim().slice(0, 110)}`);
      console.error(`    새로:  ${(b[i] ?? '(없음)').trim().slice(0, 110)}`);
      break;
    }
  }
}
process.exit(1);
