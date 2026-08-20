/**
 * 「있어야 하는 것」이 **원본에** 있는가 — 밀기 전에 본다 (2026-08-17).
 *
 * 왜 생겼나: 첫 화면의 인라인 손잡이를 걷어내며 `Toolbox.switchPage('plaza')` 를 없앴는데,
 * 광장 입구를 지키던 검사는 **그 글자**를 찾고 있었다. 로컬 게이트는 전부 초록이었고,
 * 빨강은 **배포 뒤 라이브 점검**에서야 떴다 — 15분 뒤, 다른 사람 눈에 먼저.
 *
 * 짝 검사(`audit-live-essentials.mjs`)는 **실주소**를 본다. 그건 그것대로 필요하다
 * (내 컴퓨터에는 있는데 배포에는 없는 사고를 그 검사가 잡아 왔다). 이 검사는 그 목록을
 * **그대로 빌려** 구운 파일에서 먼저 본다 — 같은 목록, 두 자리에서 두 번.
 *
 * 목록은 짝 검사가 갖고 있고 여기서는 빌려만 쓴다(두 벌이면 갈라진다).
 * 구운 결과가 없는 항목(놀이 장·블로그 첫 장 등)은 **건너뛴 수로 적는다** — 건너뜀은 통과가 아니다.
 *
 * 나가는 값: 0 = 본 것이 다 있다 / 1 = 빠진 것이 있다 / 2 = 못 돌림(안 구웠다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WANT } from './lib/live-essentials.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appsRoot = path.dirname(appRoot);

/** 사이트 주소 → **저장소 안의 원본**. 못 옮기는 주소는 null(건너뜀).
 *
 *  ★ `apps/blog/karmolab/**` 는 보지 않는다 — 그건 **배포 때 다시 찍히는 사본**이라
 *  내 컴퓨터에서는 늘 낡아 있다(붙이자마자 그 낡은 사본 때문에 거짓 빨강을 한 번 봤다).
 *  찍히는 장(도구 상세·놀이 장)은 실주소 짝 검사가 본다. 여기서는 **원본이 있는 것만** 본다. */
function sourceSites(url2) {
  const done = (p) => (p.endsWith('/') ? `${p}index.html` : p);
  if (url2.startsWith('/apps/karmolab/')) return path.join(appsRoot, done(url2).slice('/apps/'.length));
  if (url2 === '/karmolab/') return path.join(appRoot, 'index.html');
  /* ★ 찍힌 장(도구 상세·놀이)은 **갓 찍었을 때만** 본다 (2026-08-17). 늘 보면 낡은 사본 때문에
     거짓 빨강이 나고, 아예 안 보면 여섯 가지밖에 못 본다. 껍데기보다 새것이면 그건 지금 것이다. */
  if (url2.startsWith('/karmolab/')) {
    const emitted = path.join(appsRoot, 'blog', done(url2).slice(1));
    if (!fs.existsSync(emitted)) return null;
    const shell = path.join(appRoot, 'index.html');
    if (fs.statSync(emitted).mtimeMs < fs.statSync(shell).mtimeMs) return null; // 낡았다 → 건너뜀
    return emitted;
  }
  return null;
}

const omitted = [];
const skipped = [];
let seen = 0;

for (const [what, where, toFind, why] of WANT) {
  const hits = sourceSites(where);
  if (!hits || !fs.existsSync(hits)) { skipped.push(`${what} (${where})`); continue; }
  const text = fs.readFileSync(hits, 'utf8');
  seen += 1;
  if (!toFind.test(text)) omitted.push(`${what} 이(가) 원본에 없다 — ${why} (${where})`);
}

if (seen === 0) {
  console.error('[shell-essentials] CANNOT-RUN: 원본을 하나도 못 찾았다 — 경로가 옮겨졌는지 볼 것.');
  console.error('[shell-essentials]   이건 「다 있다」가 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}

console.log(`[shell-essentials] 원본에서 ${seen}가지 확인 · 건너뜀 ${skipped.length}가지 · 빠진 것 ${omitted.length}건`);
for (const s of skipped) console.log(`  · 건너뜀 — ${s}`);
if (omitted.length) {
  for (const m of omitted) console.error('  - ' + m);
  console.error('[shell-essentials] ❌ 밀기 전에 잡았다 — 배포하면 사람이 먼저 본다.');
  process.exit(1);
}
console.log('[shell-essentials] OK — 본 것은 전부 제자리에 있다.');
