#!/usr/bin/env node
/**
 * 캔버스를 **내 컴퓨터에서도** 실제로 띄워서 만져 본다 (2026-08-13)
 *
 * 왜: 이 검사(`smoke-karmograph.mjs`, 항목 60여 개)는 여는 절차가 워크플로에만 적혀 있었다 . 
 * 말 묶음 짓기 → 앱 짓기 → 서버 띄우기 → 위젯 묶음이 200 이 될 때까지 기다리기 → 검사.
 * 그래서 빨강 하나 볼 때마다 **밀고 20분을 기다렸다**. 절차를 여기 한 곳에 두고 워크플로도
 * 이 파일을 부른다. 두 곳에 적으면 갈라지고, 갈라진 값이 25판 연속 빨강이었던 전례가 있다.
 *
 * 사용: npm run verify:karmograph  [--skip-build]
 * exit: 0 = 초록 / 1 = 빨강 / 2 = 못 돌림(짓기, 서버가 안 섬)
 */
import { spawn, spawnSync } from 'node:child_process';

const PORT = Number(process.env.PORT || 8813);
const BUNDLE = `http://127.0.0.1:${PORT}/apps/karmolab/js/widgets/karmograph/karmograph.js`;
const URL = `http://127.0.0.1:${PORT}/apps/karmolab/index.html`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const skipBuild = process.argv.includes('--skip-build');

const run = (bin, args, env) =>
  spawnSync(bin === 'npm' ? npm : bin, args,
    { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } }).status ?? 1;

if (!skipBuild) {
  /* ★ **먼저 짓고, 그 다음에 띄운다.** 개발 서버는 짓는 도중에도 index.html 을 200 으로 주므로
     서버에 짓기를 맡기면 아직 없는 묶음을 열다가 항목이 줄줄이 빨개진다(2026-08-12 실측). */
  for (const step of [['npm', ['run', 'build:i18n']], ['node', ['build.mjs']]]) {
    if (run(step[0], step[1]) !== 0) {
      console.error('[verify:karmograph] 짓기에서 멈췄다. 뒤 검사는 없는 것을 보는 셈이라 안 돌린다.');
      process.exit(2);
    }
  }
}

const server = spawn(process.execPath, ['scripts/dev.mjs', String(PORT)], { stdio: 'ignore', detached: false });
const stop = () => { try { server.kill(); } catch { /* 이미 죽음 */ } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

/** index.html 이 아니라 **위젯 묶음**이 나올 때까지 본다. 그게 검사가 실제로 여는 것이다. */
const ready = await (async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BUNDLE);
      if (r.ok) { console.log(`[verify:karmograph] 위젯 묶음까지 준비됨 (${i}초)`); return true; }
    } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
})();

if (!ready) {
  console.error(`[verify:karmograph] 120초 안에 위젯 묶음이 안 나왔다. ${BUNDLE}`);
  stop();
  process.exit(2);
}

const code = run('node', ['scripts/smoke-karmograph.mjs'], { URL });
stop();
process.exit(code);
