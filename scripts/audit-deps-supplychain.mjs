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
const ALLOW = path.join(root, 'data', 'install-scripts-allow.json');

/* ★ **작업 공간이 하나가 아니다** (2026-08-16). 처음엔 karmolab 안에만 세웠는데, 재 보니
   yawnbot 쪽이 훨씬 넓었다 — 꾸러미 292개 중 설치 스크립트 4개(karmolab 은 46 중 1).
   게다가 그쪽은 **노트북 prod 로 나간다.** 좁은 곳만 지키는 문지기는 지키는 척이다.
   목록을 두 벌로 만들지 않으려고 검사를 저장소 자리로 올렸다. */
const WORKSPACES = ['apps/karmolab', 'apps/discord-bots'];

function scanInstallScripts(ws) {
  const NM = path.join(root, ws, 'node_modules');
  if (fs.existsSync(NM) === false) return null;   // 안 깔린 곳은 「못 쟀다」
  const out = [];
  for (const entry of fs.readdirSync(NM)) {
    const names = entry.startsWith('@')
      ? fs.readdirSync(path.join(NM, entry)).map((x) => `${entry}/${x}`)
      : [entry];
    for (const name of names) {
      const pj = path.join(NM, name, 'package.json');
      if (fs.existsSync(pj) === false) continue;
      try {
        const sc = JSON.parse(fs.readFileSync(pj, 'utf8')).scripts || {};
        if (sc.preinstall || sc.install || sc.postinstall) out.push(name);
      } catch { /* 읽을 수 없는 것은 셀 수 없다 */ }
    }
  }
  return out.sort();
}

const found = {};
const unmeasured = [];
for (const ws of WORKSPACES) {
  const r = scanInstallScripts(ws);
  if (r === null) { unmeasured.push(ws); continue; }
  found[ws] = r;
}
if (Object.keys(found).length === 0) {
  console.error(`[deps] 못 쟀다 — 어느 작업 공간에도 node_modules 가 없다 (${unmeasured.join(', ')}).`);
  process.exit(2);
}

const BLESS = process.argv.includes('--bless');

let allow;
try { allow = JSON.parse(fs.readFileSync(ALLOW, 'utf8')); }
catch {
  if (BLESS === false) {
    console.error(`[deps] 못 쟀다 — 허용 목록이 없다 (${path.relative(root, ALLOW)}). 처음이면 --bless.`);
    process.exit(2);
  }
  allow = {};
}

const fresh = [];
for (const [ws, names] of Object.entries(found)) {
  const ok = allow[ws] ?? [];
  for (const n of names) if (ok.includes(n) === false) fresh.push(`${ws}: ${n}`);
}
if (fresh.length > 0 && BLESS === false) {
  console.error(`[deps] **설치만 해도 도는 코드가 늘었다** ${fresh.length}개:`);
  for (const n of fresh) console.error(`  - ${n}`);
  console.error('  이게 정말 필요한 꾸러미인지 보고, 맞으면: node scripts/audit-deps-supplychain.mjs --bless');
  process.exit(1);
}

/* ② 알려진 취약점 — prod 만, 작업 공간마다 */
/* 윈도에서 `npm` 은 `.cmd` 라 최신 node 가 셸 없이 못 띄운다(EINVAL) — 그 실패가 한때
   「네트워크?」로 보였다. 셸도 안 태운다(DEP0190). npm 은 결국 node 스크립트이므로
   **지금 이 node 로 직접** 부른다. */
/* ★ **npm 이 어디 있는지는 기계마다 다르다** (2026-08-16, 실측). 여기서는 `node` 옆의
   `node_modules/npm` 한 자리만 봤다 — 그건 **윈도우 배치**다. 리눅스(그리고 GitHub 러너)는
   `<prefix>/bin/node` 와 `<prefix>/lib/node_modules/npm` 으로 갈라져 있다. 그래서 이 검사는
   **CI 에서 한 번도 안 돌았다**: 매 판 「못 쟀다」로 조용히 넘어갔고, 그동안 설치 스크립트가
   늘어도·취약점이 늘어도 아무도 못 막았다(그러라고 만든 검사인데). 아는 자리를 차례로 본다. */
const npmCli = [
  process.env.npm_execpath,                                                       // npm 이 부른 경우 제일 정확하다
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),      // 윈도우
  path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // 리눅스·맥
].find((c) => typeof c === 'string' && c.endsWith('npm-cli.js') && fs.existsSync(c));
if (!npmCli) {
  console.error('[deps] 못 쟀다 — npm-cli.js 를 어디서도 못 찾았다 (본 자리: node 옆 · <prefix>/lib · npm_execpath). 통과가 아니다.');
  process.exit(2);
}
const currentVulns = {};
for (const ws of Object.keys(found)) {
  let audit;
  try {
    audit = JSON.parse(execFileSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], {
      cwd: path.join(root, ws), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (e) {
    /* npm audit 은 취약점이 있으면 **비0 으로 끝낸다** — 그때도 stdout 에 결과가 있다. */
    try { audit = JSON.parse(String(e.stdout || '')); }
    catch {
      console.error(`[deps] 못 쟀다 — ${ws} 에서 npm audit 을 못 돌렸다: ${String(e.message || e).split('\n')[0]}. 통과가 아니다.`);
      process.exit(2);
    }
  }
  const v = audit?.metadata?.vulnerabilities ?? {};
  currentVulns[ws] = { high: v.high ?? 0, critical: v.critical ?? 0 };
}

/* ★ **0 을 당장 요구하지 않는다** (2026-08-16). 켜 보니 yawnbot 쪽에 이미 high 7 · critical 1 이
   있었다 — 대부분 `@discordjs/opus → node-pre-gyp → tar` 한 줄기이고 **고칠 판이 아직 없다**
   (`fixAvailable: false`). 그걸 이유로 게이트를 안 켜면 그 사이 **새로 생기는 것**도 못 막는다.
   지금 수를 기준선으로 적고 **늘면 빨강**. 기준선은 오직 내려가야 한다. */
const baselineVulns = allow.__vulnerabilities ?? {};
const grown = [];
for (const [ws, cur] of Object.entries(currentVulns)) {
  const base = baselineVulns[ws] ?? { high: 0, critical: 0 };
  if (cur.high > base.high || cur.critical > base.critical) {
    grown.push(`${ws}: high ${base.high}→${cur.high} · critical ${base.critical}→${cur.critical}`);
  }
}
if (grown.length > 0 && BLESS === false) {
  console.error('[deps] prod 의존의 심각한 취약점이 **늘었다**:');
  for (const l of grown) console.error(`  - ${l}`);
  console.error('  보기: (해당 폴더에서) npm audit --omit=dev  ·  고치기: npm audit fix');
  process.exit(1);
}
const remainingDebt = Object.entries(currentVulns)
  .filter(([, c]) => c.high + c.critical > 0)
  .map(([ws, c]) => `${ws} high ${c.high}/critical ${c.critical}`);

if (BLESS) {
  /* 허용 목록과 취약점 기준선을 **한 파일**에 둔다 — 두 파일이면 한쪽만 갱신된다.
     둘 다 「지금 이 순간」을 적어야 뜻이 맞으므로, 두 검사를 다 돌린 뒤 여기서 쓴다. */
  fs.mkdirSync(path.dirname(ALLOW), { recursive: true });
  fs.writeFileSync(ALLOW, JSON.stringify({ ...found, __vulnerabilities: currentVulns }, null, 1) + '\n', 'utf8');
  const n = Object.values(found).reduce((a, x) => a + x.length, 0);
  console.log(`[deps] 기준선을 다시 적었다 — 작업 공간 ${Object.keys(found).length}곳 · 설치 스크립트 ${n}개 · 취약점 ${JSON.stringify(currentVulns)}`);
  process.exit(0);
}

const total = Object.values(found).reduce((a, x) => a + x.length, 0);
const unmeasuredText = unmeasured.length ? ` · 못 잰 곳 ${unmeasured.join(', ')}(설치 안 됨)` : '';
const debtText = remainingDebt.length ? ` · 남은 빚 ${remainingDebt.join(' / ')}` : ' · prod 취약점 0';
console.log(`[deps] 작업 공간 ${Object.keys(found).length}곳 · 설치 스크립트 ${total}개(전부 허용됨)${debtText}${unmeasuredText}`);
