#!/usr/bin/env node
/**
 * 이미 Drive 에 올라간 그림, 글을 열람 저장(R2)에도 채운다.
 *
 * 왜 필요한가: 전송기는 Drive 에 같은 sha256 이 있으면 건너뛴다로 이어올리기를 한다.
 * 그래서 열람 저장을 **나중에** 켜면, 그 전에 올라간 것들은 영원히 R2 로 안 간다
 * (2026-08-27 실측: 그림, 글 2,069개 중 489개가 그 구멍에 있었다).
 *
 * 하는 일 = 청크를 **그대로 옮기는 것**뿐이다. 복호도 재암호화도 없다 . 
 * 같은 키에 같은 암호문이 놓여야 화면이 그걸 연다.
 *
 * 쓰기: node src/mirror-backfill.mjs [--dry-run]
 */
import { loadFilesEnv } from './env-file.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { fileChunkKeys, listFiles, thumbKeys, unlockVault } from './vault.mjs';
import { mirrorable } from './mirror-policy.mjs';
import { budgetLine, capFromEnv, makeBudget, measureRemote } from './mirror-budget.mjs';

await loadFilesEnv();

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`없음: ${name}`);
    process.exit(2);
  }
  return v;
}

const pass = need('FILES_VAULT_PASS');
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const extraRemote = need('FILES_VAULT_R2');
const dry = process.argv.includes('--dry-run');

const daemon = await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = rcloneStore(extraRemote, { rcUrl, delayMs: rcUrl ? 0 : 400 });

const session = await unlockVault(primary, pass);
console.log('클라우드 염');

const all = await fileChunkKeys(session);
/* 영상은 크기로 가르므로(mirror-policy) 색인에서 크기를 붙여 온다 — 청크 키 목록에는 없다. */
const sizeOf = new Map((await listFiles(session)).map((f) => [f.path, f.size]));
const targets = all.filter((f) => mirrorable(f.path, sizeOf.get(f.path)));
/* 미리보기는 **크기 판단 밖**이다. 원본을 안 올리는 큰 영상도 칸은 보여야 하고,
   한 장이 수십 KB 라 값이 거의 안 든다 */
const thumbs = (await thumbKeys(session)).map((t) => ({ path: t.path, keys: [t.key] }));
targets.push(...thumbs);
console.log(`열람 저장 대상 ${targets.length}개 (미리보기 ${thumbs.length}개 포함) / 전체 ${all.length}개`);

/* 이미 R2 에 있는 키는 **목록 한 번**으로 안다.
   키마다 존재를 물으면 rclone 을 그만큼 새로 띄운다. 539개 파일에서 몇 분이 지나도
   한 건도 못 옮겼다 (2026-08-27). 목록은 한 판이면 끝난다. */
const { execFile } = await import('node:child_process');
const have = await new Promise((resolve) => {
  execFile(
    'rclone',
    ['lsf', '-R', '--files-only', extraRemote],
    { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    (err, stdout) => {
      if (err) return resolve(new Set());
      const keys = String(stdout).split(String.fromCharCode(10));
      resolve(new Set(keys.map((k) => k.trim()).filter(Boolean)));
    },
  );
});
console.log(`열람 저장에 이미 ${have.size}개`);

/* 값 상한. 여기가 R2 를 제일 크게 불리는 자리다.
   넘으면 옮기기를 멈춘다. 정본(Drive)은 이미 다 들어 있으므로 잃는 것은 없다. */
const capGb = capFromEnv();
const startBytes = await measureRemote(extraRemote);
const budget = startBytes === null ? null : makeBudget(startBytes, capGb);
console.log('열람 저장', budget ? budgetLine(budget.state()) : '총량을 못 쟀다. 상한 검사 생략');

let stoppedByBudget = false;
let copied = 0;
let already = 0;
let failed = 0;

// hdr, idx 가 없으면 화면이 클라우드 자체를 못 연다. 먼저 보장한다.
for (const key of ['hdr', 'idx']) {
  if (have.has(key)) {
    already += 1;
    continue;
  }
  const bytes = await primary.get(key);
  if (!bytes) continue;
  if (!dry) await extra.put(key, bytes);
  copied += 1;
}

for (const f of targets) {
  if (stoppedByBudget) break;
  for (const key of f.keys) {
    try {
      if (have.has(key)) {
        already += 1;
        continue;
      }
      const bytes = await primary.get(key);
      if (!bytes) {
        failed += 1;
        continue;
      }
      if (budget && !budget.allow(bytes.length)) {
        console.log(`멈춤. 열람 저장 ${budgetLine(budget.state())}`);
        stoppedByBudget = true;
        break;
      }
      if (!dry) await extra.put(key, bytes);
      copied += 1;
    } catch {
      failed += 1;
    }
    if ((copied + already + failed) % 50 === 0) {
      console.log(`옮김 ${copied}, 이미 있음 ${already}, 못 옮김 ${failed}`);
    }
  }
}

const tail = stoppedByBudget ? ' (값 상한에 걸려 멈춤)' : dry ? ' (연습)' : '';
console.log(`끝. 옮김 ${copied}, 이미 있음 ${already}, 못 옮김 ${failed}${tail}`);
await daemon?.stop?.();
