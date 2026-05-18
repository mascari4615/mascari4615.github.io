#!/usr/bin/env node
/**
 * TASK-KAR-MEMOSYNC part4 — 헤드리스 재현·증명 (실 서비스 코드 경로).
 *
 * 황금의 정신 하드게이트: "봇이 스스로 주기·이벤트 전 memo 동기" 가
 * deploy "Sync prod memo" 스텝과 *동일하게* 동작하는지 추측 X, 결정적
 * 재현 루프로 실증. 실 네트워크/시크릿 0 — 로컬 bare repo + clone 으로
 * 본 서비스의 syncMemoOnce / runMemoSyncTick / ensureFresh 를 그대로 구동.
 *
 * dist 빌드를 import (실 출시 코드 경로 — 테스트 mock 아님). GitRunner 만
 * 로컬 bare repo 용으로 주입(실 createGitRunner 는 authUrl fetch — 로컬엔
 * 토큰 무의미하므로 fetch 만 로컬 remote 로 치환, *나머지 시퀀스는 동일*:
 * planMemoSync→skip 판정→reset --hard FETCH_HEAD, 전부 실 git).
 *
 * 시나리오:
 *  (a) origin 새 커밋 → 인터벌 sync(runMemoSyncTick) → prod == origin
 *  (b) skip-if-unchanged: 변경 없으면 reset 호출 0 (deploy 스텝과 동일 판정)
 *  (c) untracked 런타임 생존: part2 정합 — reset --hard 가 안 건드림
 *  (d) pre-tick staleness hook: ensureFresh(maxAge) — 최근=skip / 오래됨=sync
 *  (e) fetch 실패 → tick unhealthy + 상태 전이 alert (silent 금지, part1)
 *
 * PASS 기준: a~e 전부 충족해야 exit 0.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist', 'src', 'services', 'memo-sync.js');
if (!existsSync(DIST)) {
  console.error(`[FAIL] dist 빌드 없음: ${DIST}\n  먼저 \`npm run build\` 필요.`);
  process.exit(2);
}
const mod = await import(pathToFileURL(DIST).href);
const { syncMemoOnce, runMemoSyncTick, startMemoSync, stopMemoSync, getActiveMemoSyncHandle } = mod;

const WORK = mkdtempSync(path.join(tmpdir(), 'memosync-p4-'));
process.on('exit', () => { try { rmSync(WORK, { recursive: true, force: true }); } catch {} });

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  PASS — ${m}`); pass++; };
const ng = (m) => { console.log(`  FAIL — ${m}`); fail++; };

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8' }).trim();

const GI = [
  'characters/.active.json',
  'characters/*/relationship.json',
  'characters/*/memory/mood.json',
].join('\n');

// ── origin bare + 작업 clone (part2 untrack 적용 = 런타임 gitignore) ──
const origin = path.join(WORK, 'o.git');
git(WORK, 'init', '-q', '--bare', '-b', 'main', origin);
const seed = path.join(WORK, 'seed');
mkdirSync(seed);
git(seed, 'init', '-q', '-b', 'main', '.');
git(seed, 'config', 'user.email', 't@t');
git(seed, 'config', 'user.name', 't');
git(seed, 'config', 'core.autocrlf', 'false');
mkdirSync(path.join(seed, 'characters', 'yawn', 'memory'), { recursive: true });
writeFileSync(path.join(seed, '.gitignore'), GI + '\n');
writeFileSync(path.join(seed, 'TASK-QUEUE.md'), 'seed canon v1\n');
writeFileSync(path.join(seed, 'characters', 'yawn', 'card.md'), 'canon card (정의)\n');
git(seed, 'add', '.gitignore', 'TASK-QUEUE.md', 'characters/yawn/card.md');
git(seed, 'commit', '-qm', 'seed');
git(seed, 'push', '-q', origin, 'main');

const clone = path.join(WORK, 'prod');
git(WORK, 'clone', '-q', origin, clone);
git(clone, 'config', 'user.email', 't@t');
git(clone, 'config', 'user.name', 't');
git(clone, 'config', 'core.autocrlf', 'false');

// 봇 런타임 mutate (서비스 initialize self-heal 동형) — gitignored 경로
mkdirSync(path.join(clone, 'characters', 'yawn', 'memory'), { recursive: true });
writeFileSync(path.join(clone, 'characters', '.active.json'), '{"default":"yawn"}\n');
writeFileSync(path.join(clone, 'characters', 'yawn', 'relationship.json'), '{"conversationCount":42}\n');
writeFileSync(path.join(clone, 'characters', 'yawn', 'memory', 'mood.json'), '{"mood":"행복"}\n');

const CFG = { token: 'unused-local', memoRepoPath: clone, repoSlug: 'local/repo', branch: 'main' };
const silent = { log: () => {}, warn: () => {}, error: () => {} };

// 로컬 bare repo 용 GitRunner — fetch 만 로컬 remote 로 치환.
// headSha/fetchHeadSha/resetHard = 실 createGitRunner 와 *완전 동일* git 호출.
let fetchCalls = 0, resetCalls = 0;
const localGit = {
  async fetch(cfg) { fetchCalls++; git(cfg.memoRepoPath, 'fetch', '-q', origin, cfg.branch); },
  async headSha(cfg) { return git(cfg.memoRepoPath, 'rev-parse', 'HEAD'); },
  async fetchHeadSha(cfg) { return git(cfg.memoRepoPath, 'rev-parse', 'FETCH_HEAD'); },
  async resetHard(cfg) { resetCalls++; git(cfg.memoRepoPath, 'reset', '--hard', '-q', 'FETCH_HEAD'); },
};

function pushNewCanon(msg) {
  const pd = path.join(WORK, 'pusher-' + Date.now());
  git(WORK, 'clone', '-q', origin, pd);
  git(pd, 'config', 'user.email', 't@t');
  git(pd, 'config', 'user.name', 't');
  writeFileSync(path.join(pd, 'TASK-QUEUE.md'), msg + '\n');
  git(pd, 'add', 'TASK-QUEUE.md');
  git(pd, 'commit', '-qm', 'feat: ' + msg);
  git(pd, 'push', '-q', 'origin', 'main');
}

// ── (a) origin 새 커밋 → 인터벌 sync(runMemoSyncTick) → prod == origin ──
pushNewCanon('canon v2 — wm-worker inactive 적용');
const beforeLocal = git(clone, 'rev-parse', 'HEAD');
const r1 = await runMemoSyncTick(CFG, null, { git: localGit, logger: silent });
const afterLocal = git(clone, 'rev-parse', 'HEAD');
const originHead = git(origin, 'rev-parse', 'main');
if (r1.healthy && afterLocal !== beforeLocal && afterLocal === originHead) {
  ok(`(a) 인터벌 sync(runMemoSyncTick) → prod HEAD ${afterLocal.slice(0, 7)} == origin (정본 도달)`);
} else {
  ng(`(a) sync 후 prod != origin (healthy=${r1.healthy} after=${afterLocal.slice(0, 7)} origin=${originHead.slice(0, 7)})`);
}

// ── (c) untracked 런타임 생존 (part2 정합 — reset --hard 가 안 건드림) ──
const mood = readFileSync(path.join(clone, 'characters', 'yawn', 'memory', 'mood.json'), 'utf-8');
const rel = readFileSync(path.join(clone, 'characters', 'yawn', 'relationship.json'), 'utf-8');
if (mood.includes('행복') && rel.includes('42')) {
  ok('(c) reset --hard 후 untracked 런타임(mood/relationship) 값 보존 → part2 정합');
} else {
  ng(`(c) 런타임 파괴됨 (mood=${mood.trim()} rel=${rel.trim()})`);
}

// ── (b) skip-if-unchanged: 변경 없으면 reset 호출 0 ──
const resetBefore = resetCalls;
const reason = await syncMemoOnce(CFG, localGit, silent);
if (resetCalls === resetBefore && /최신/.test(reason)) {
  ok(`(b) 변경 없음 → reset 호출 0 (skip-if-unchanged, "${reason}") = deploy 스텝 동일 판정`);
} else {
  ng(`(b) 무변경인데 reset 호출됨 (resetCalls ${resetBefore}→${resetCalls}, reason="${reason}")`);
}

// ── (d) pre-tick staleness hook: startMemoSync().ensureFresh ──
stopMemoSync();
const handle = startMemoSync({
  token: 'tok', memoRepoPath: clone, repoSlug: 'local/repo', branch: 'main',
  intervalMin: 60, git: localGit, logger: silent,
});
// 즉시 1회 tick 대기 (lastSync 갱신)
await handle.tickNow();
const fAfterBoot = fetchCalls;
// 막 sync 했으니 maxAge 큰 값이면 skip
await handle.ensureFresh(5 * 60 * 1000);
const fNoStale = fetchCalls;
// maxAge=0 → 무조건 stale → 1회 추가 sync
await handle.ensureFresh(0);
const fStale = fetchCalls;
if (fNoStale === fAfterBoot && fStale === fAfterBoot + 1) {
  ok(`(d) ensureFresh: 최근=skip(fetch ${fAfterBoot}→${fNoStale}) / stale=1회 sync(→${fStale}) = pre-tick 가드 동작`);
} else {
  ng(`(d) ensureFresh 비정상 (boot=${fAfterBoot} noStale=${fNoStale} stale=${fStale})`);
}
if (getActiveMemoSyncHandle() === handle) {
  ok('(d2) getActiveMemoSyncHandle = 활성 핸들 노출 (agent-cadence pre-tick hook 도달 경로)');
} else {
  ng('(d2) getActiveMemoSyncHandle 미노출 → pre-tick hook graceful no-op 로 죽음');
}
stopMemoSync();
if (getActiveMemoSyncHandle() === null) {
  ok('(d3) stopMemoSync → 핸들 null (shutdown 정합)');
} else {
  ng('(d3) stop 후에도 핸들 잔존');
}

// ── (e) fetch 실패 → tick unhealthy + 상태 전이 alert (silent 금지) ──
const failGit = {
  async fetch() { throw new Error('인증 fetch 실패 (토큰 만료 의심)'); },
  async headSha() { return 'x'; },
  async fetchHeadSha() { return 'y'; },
  async resetHard() {},
};
let alerted = null;
const rFail = await runMemoSyncTick(CFG, true, {
  git: failGit, logger: silent, alert: (e) => { alerted = e; },
});
if (rFail.healthy === false && alerted && alerted.healthy === false && /실패/.test(alerted.reason)) {
  ok(`(e) fetch 실패 → unhealthy + 상태 전이 alert ("${alerted.reason.slice(0, 40)}…") = silent 금지(part1) 정합`);
} else {
  ng(`(e) 실패가 silent (healthy=${rFail.healthy} alert=${JSON.stringify(alerted)})`);
}

console.log(`\n=== 결과: PASS=${pass} FAIL=${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
