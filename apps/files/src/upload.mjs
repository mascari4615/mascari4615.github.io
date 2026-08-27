#!/usr/bin/env node
/**
 * 열람 트리 → 금고 암호문 → rclone 원격.
 * 원본 경로는 env 만. 기본 로그는 개수. 이름 나열은 --verbose.
 *
 * FILES_VAULT_ROOT  FILES_VAULT_PASS  FILES_VAULT_REMOTE
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVault, flushIndex, listFiles, unlockVault } from './vault.mjs';
import { putFileFromPath, sha256File } from './vault-node.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { teeStore } from './store-tee.mjs';
import { walkFiles } from './walk.mjs';
import { mirrorable } from './mirror-policy.mjs';
import { loadFilesEnv } from './env-file.mjs';

await loadFilesEnv();

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`없음: ${name}`);
    process.exit(2);
  }
  return v;
}

const root = need('FILES_VAULT_ROOT');
const pass = need('FILES_VAULT_PASS');
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const extraRemote = process.env.FILES_VAULT_R2 || '';
const dry = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? '' : process.argv[onlyAt + 1];
if (onlyAt !== -1 && (!only || only.split(/[\\/]/).some((part) => !part || part === '.' || part === '..'))) {
  throw new Error('--only 는 금고 뿌리 아래의 상대 폴더 하나여야 함');
}

// 우선 올릴 폴더도 원격에서는 원래 상대 경로를 지킨다.
const scanRoot = only ? join(root, ...only.split(/[\\/]/)) : root;
const scanned = await walkFiles(scanRoot);
const files = only
  ? scanned.map((file) => ({ ...file, rel: only.replaceAll('\\\\', '/') + '/' + file.rel }))
  : scanned;
console.log(`파일 ${files.length}개`);
if (dry) {
  if (verbose) for (const f of files) console.log(f.rel);
  process.exit(0);
}

/* 데몬은 remote 를 안 가린다 — rc 한 판에 여러 원격을 태운다.
   예전엔 열람 저장이 켜지면 데몬을 아예 안 띄웠는데, 그러면 청크마다 rclone 프로세스를
   새로 띄워 몇 배로 느려진다. 열람 저장을 켠 값을 속도로 치를 이유가 없다. */
const daemon = await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = extraRemote ? rcloneStore(extraRemote, { rcUrl, delayMs: rcUrl ? 0 : 400 }) : null;
const mirrored = extra ? teeStore(primary, extra) : primary;
const store = mirrored;
let session;
const hdr = await store.get('hdr');
if (hdr) session = await unlockVault(store, pass);
else session = await createVault(store, pass);
session.deferIndex = true;
console.log('금고 염');

/* 진행 상태를 **정해진 자리**에 적는다.
   왜: 터미널에서 띄우면 로그 자리는 띄운 쪽이 정한다 — 그러면 데스크톱 앱이 그 로그를 못 찾아
   「진행 수치는 안 보입니다」가 된다(2026-08-27 조수님이 그 화면을 봤다). 누가 띄우든
   같은 자리에 적으면 앱이 읽는다. 여기 적는 것은 **집계 수치뿐** — 경로·파일 이름은 안 적는다. */
const progressPath = new URL('../.upload-progress.json', import.meta.url);
async function writeProgress(stage, total, done, uploaded, skipped) {
  const body = JSON.stringify({
    stage,
    total,
    done,
    uploaded,
    skipped,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  });
  try {
    await writeFile(progressPath, body);
  } catch {
    /* 상태를 못 적는다고 올리기를 멈출 이유는 없다 */
  }
}
await writeProgress('index', files.length, 0, 0, 0);

const have = new Map((await listFiles(session)).map((f) => [f.path, f.sha256]));
let n = 0;
let skipped = 0;
try {
  for (const f of files) {
    const rel = f.rel.replaceAll('\\', '/');
    const known = have.get(rel);
    if (known) {
      const digest = await sha256File(f.abs);
      if (known === digest) {
        skipped += 1;
        continue;
      }
    }
    // 청크를 쓰는 자리는 session.store 다 — 파일마다 갈아끼워 R2 로 갈 것만 보낸다.
    session.store = mirrorable(rel) ? mirrored : primary;
    await putFileFromPath(session, rel, f.abs, { chunkSize: 8 * 1024 * 1024 });
    session.store = mirrored;
    n += 1;
    if ((n + skipped) % 10 === 0) await flushIndex(session);
    if (verbose) console.log(rel);
    else if ((n + skipped) % 10 === 0 || n + skipped === files.length) {
      console.log(`${n + skipped}/${files.length} 올림 ${n} 건너뜀 ${skipped}`);
    }
    if ((n + skipped) % 10 === 0 || n + skipped === files.length) {
      await writeProgress('upload', files.length, n + skipped, n, skipped);
    }
  }
  await flushIndex(session);
  await writeProgress('done', files.length, n + skipped, n, skipped);
} finally {
  await flushIndex(session);
  daemon?.stop();
}
console.log(`올림 ${n} 건너뜀 ${skipped}`);
