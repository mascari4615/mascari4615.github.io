#!/usr/bin/env node
/**
 * 열람 트리 → 금고 암호문 → rclone 원격.
 * 원본 경로는 env 만. 기본 로그는 개수. 이름 나열은 --verbose.
 *
 * FILES_VAULT_ROOT  FILES_VAULT_PASS  FILES_VAULT_REMOTE
 */
import { createVault, unlockVault } from './vault.mjs';
import { putFileFromPath } from './vault-node.mjs';
import { rcloneStore } from './store-rclone.mjs';
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

const primary = rcloneStore(remote);
const extra = extraRemote ? rcloneStore(extraRemote) : null;
const store = extra ? teeStore(primary, extra) : primary;
let session;
const hdr = await store.get('hdr');
if (hdr) session = await unlockVault(store, pass);
else session = await createVault(store, pass);

let n = 0;
for (const f of files) {
  await putFileFromPath(session, f.rel, f.abs);
  n += 1;
  if (verbose) console.log(f.rel);
  else if (n % 50 === 0 || n === files.length) console.log(`${n}/${files.length}`);
}
console.log(`올림 ${n}`);
