/**
 * 재료 여덟 화면을 **실서비스 주소로** 한 번에 잰다 (TASK-KL-296).
 *
 * 화면 검사들은 여태 **내 자리에서 띄운 판**만 봤다. 그런데 사람이 쓰는 건 배포된 판이다 —
 * 빌드가 안 나갔거나, 캐시가 옛것을 물고 있거나, 배포 길에서 파일이 빠져도 로컬은 초록이다.
 * 그래서 같은 검사를 `URL=` 로 실주소에 겨눠 한 번에 돌린다.
 *
 * **빨강이 곧 고장은 아니다**: 방금 올린 판이 아직 안 나갔을 수도 있다(이 저장소는 세션이
 * 여럿이라 배포가 서로 밀린다). 그래서 실패한 검사의 이름과 사유를 그대로 보여 주고,
 * 「배포가 늦은 것인지」는 사람이 가르게 한다. 게이트에는 **안 넣는다** — 배포 시점에 따라
 * 빨개지는 검사를 막는 자리에 두면 아무도 안 믿게 된다.
 *
 * 사용: node scripts/smoke-materials-live.mjs [주소]
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIVE = process.argv[2] || process.env.KL_LIVE_URL || 'https://mascari4615.github.io/apps/karmolab/index.html';

const MATERIALS = [
  ['PDF', 'smoke-pdf-shell.mjs'],
  ['이미지', 'smoke-image-shell.mjs'],
  ['글', 'smoke-text-shell.mjs'],
  ['데이터', 'smoke-data-shell.mjs'],
  ['수·돈', 'smoke-calc-shell.mjs'],
  ['때', 'smoke-time-shell.mjs'],
  ['영상', 'smoke-video-shell.mjs'],
  ['소리', 'smoke-sound-shell.mjs']
];

const run = (file) =>
  new Promise((res) => {
    const p = spawn(process.execPath, [path.join(root, 'scripts', file)], {
      cwd: root,
      env: { ...process.env, URL: LIVE },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => res({ code, out }));
  });

console.log(`[live] ${LIVE}`);
const bad = [];
for (const [name, file] of MATERIALS) {
  const { code, out } = await run(file);
  const why = (out.match(/^ {2}- .*$/gm) || []).slice(0, 2).map((s) => s.trim());
  console.log(`  ${code === 0 ? '✓' : '✗'} ${name}${code === 0 ? '' : ' — ' + why.join(' · ')}`);
  if (code !== 0) bad.push(name);
}

if (bad.length) {
  console.error(`[live] 빨강 ${bad.length}개: ${bad.join(', ')}`);
  console.error('  ※ 방금 올린 판이 아직 안 나갔을 수 있다 — 배포가 끝난 뒤 한 번 더 돌려 보고 판정하라.');
  process.exit(1);
}
console.log(`[live] 재료 ${MATERIALS.length}개 전부 실서비스에서 통과`);
