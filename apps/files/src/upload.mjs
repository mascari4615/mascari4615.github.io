#!/usr/bin/env node
/**
 * 열람 트리 → 금고 암호문 → rclone 원격.
 * 원본 경로는 env 만. 기본 로그는 개수. 이름 나열은 --verbose.
 *
 * FILES_VAULT_ROOT  FILES_VAULT_PASS  FILES_VAULT_REMOTE
 */
import { createVault, flushIndex, listFiles, unlockVault } from './vault.mjs';
import { putFileFromPath, sha256File } from './vault-node.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { teeStore } from './store-tee.mjs';
import { walkFiles } from './walk.mjs';
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

const files = await walkFiles(root);
console.log(`파일 ${files.length}개`);
if (dry) {
  if (verbose) for (const f of files) console.log(f.rel);
  process.exit(0);
}

const daemon = extraRemote ? null : await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = extraRemote ? rcloneStore(extraRemote) : null;
const store = extra ? teeStore(primary, extra) : primary;
let session;
const hdr = await store.get('hdr');
if (hdr) session = await unlockVault(store, pass);
else session = await createVault(store, pass);
session.deferIndex = true;
console.log('금고 염');

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
    await putFileFromPath(session, rel, f.abs, { chunkSize: 8 * 1024 * 1024 });
    n += 1;
    if ((n + skipped) % 10 === 0) await flushIndex(session);
    if (verbose) console.log(rel);
    else if ((n + skipped) % 10 === 0 || n + skipped === files.length) {
      console.log(`${n + skipped}/${files.length} 올림 ${n} 건너뜀 ${skipped}`);
    }
  }
  await flushIndex(session);
} finally {
  await flushIndex(session);
  daemon?.stop();
}
console.log(`올림 ${n} 건너뜀 ${skipped}`);
