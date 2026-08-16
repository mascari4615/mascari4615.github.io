#!/usr/bin/env node
/**
 * 남의 코드가 **설치만 해도 도는** 자리를 지킨다 (2026-08-16)
 *
 * 왜 지금: 2026 에 npm 공급망 공격이 연달아 났고(3월 axios, 6월 Mastra), 그 통로가 전부
 * `postinstall` 이었다 — `npm install` 만 해도 남의 코드가 내 기계에서 돈다. npm v12 는
 * 아예 기본으로 막는 쪽으로 바뀌었다. 우리는 아직 그 전이므로 **직접 본다.**
 *
 * 지금 우리 자리(실측): 꾸러미 46개 중 설치 스크립트가 있는 것은 **esbuild 하나**다
 * (플랫폼 실행파일을 받아 오는 정당한 용도). 그러니 「전부 끄기」가 아니라
 * **「하나라도 늘면 사람이 본다」** 가 맞는 문지기다.
 *
 * 보는 것 둘:
 *   ① 설치 스크립트를 가진 꾸러미가 허용 목록 밖에 있나 (새로 생기면 빨강)
 *   ② 알려진 취약점 — prod 의존만, high/critical (dev 는 사용자 기계에 안 나간다)
 *
 * exit 0 = 통과 · 1 = 새 설치 스크립트/취약점 · 2 = 못 쟀다(설치 안 됨·네트워크 없음)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NM = path.join(root, 'node_modules');
const ALLOW = path.join(root, 'data', 'install-scripts-allow.json');

if (fs.existsSync(NM) === false) {
  console.error('[deps] 못 쟀다 — node_modules 가 없다 (npm ci 먼저).');
  process.exit(2);
}

/* ① 설치 스크립트 */
const found = [];
for (const entry of fs.readdirSync(NM)) {
  const names = entry.startsWith('@')
    ? fs.readdirSync(path.join(NM, entry)).map((x) => `${entry}/${x}`)
    : [entry];
  for (const name of names) {
    const pj = path.join(NM, name, 'package.json');
    if (fs.existsSync(pj) === false) continue;
    try {
      const s = JSON.parse(fs.readFileSync(pj, 'utf8')).scripts || {};
      if (s.preinstall || s.install || s.postinstall) found.push(name);
    } catch { /* 읽을 수 없는 것은 셀 수 없다 */ }
  }
}
found.sort();

if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(ALLOW), { recursive: true });
  fs.writeFileSync(ALLOW, JSON.stringify(found, null, 1) + '\n', 'utf8');
  console.log(`[deps] 허용 목록을 다시 적었다 — 설치 스크립트 ${found.length}개`);
  process.exit(0);
}

let allow;
try { allow = JSON.parse(fs.readFileSync(ALLOW, 'utf8')); }
catch {
  console.error(`[deps] 못 쟀다 — 허용 목록이 없다 (${path.relative(root, ALLOW)}). 처음이면 --bless.`);
  process.exit(2);
}

const 새것 = found.filter((n) => allow.includes(n) === false);
if (새것.length > 0) {
  console.error(`[deps] **설치만 해도 도는 코드가 늘었다** ${새것.length}개:`);
  for (const n of 새것) console.error(`  - ${n}`);
  console.error('  이게 정말 필요한 꾸러미인지 보고, 맞으면: npm run audit:deps -- --bless');
  process.exit(1);
}

/* ② 알려진 취약점 — prod 만 */
let audit;
try {
  /* 윈도에서 `npm` 은 `.cmd` 다 — 최신 node 는 셸 없이 `.cmd` 를 못 띄운다(EINVAL).
     그런데 그 실패가 위 catch 에서 「네트워크?」로 보였다: **첫 판이 그렇게 오진했다.**
     실패 이유를 안 보면 무엇이든 「네트워크」가 된다. */
  /* 셸을 태우지 않는다 — 인자가 그대로 이어 붙어 위험하다고 node 가 경고한다(DEP0190).
     npm 은 결국 node 스크립트이므로 **지금 이 node 로 직접** 부른다. 셸도 `.cmd` 도 안 낀다. */
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const args = fs.existsSync(npmCli)
    ? [npmCli, 'audit', '--omit=dev', '--json']
    : null;
  if (args === null) throw new Error(`npm-cli.js 를 못 찾았다 (${npmCli})`);
  audit = JSON.parse(execFileSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024,
  }));
} catch (e) {
  /* npm audit 은 취약점이 있으면 **비0 으로 끝낸다** — 그때도 stdout 에 결과가 있다. */
  try { audit = JSON.parse(String(e.stdout || '')); }
  catch {
    console.error(`[deps] 못 쟀다 — npm audit 을 못 돌렸다: ${String(e.message || e).split('\n')[0]}. 통과가 아니다.`);
    process.exit(2);
  }
}
const v = audit?.metadata?.vulnerabilities ?? {};
const 심각 = (v.high ?? 0) + (v.critical ?? 0);
if (심각 > 0) {
  console.error(`[deps] prod 의존에 심각한 취약점 ${심각}개 (high ${v.high ?? 0} · critical ${v.critical ?? 0})`);
  console.error('  보기: npm audit --omit=dev   ·  고치기: npm audit fix (판올림이 필요하면 손으로)');
  process.exit(1);
}

console.log(`[deps] 설치 스크립트 ${found.length}개(전부 허용됨) · prod 취약점 high/critical 0`);
