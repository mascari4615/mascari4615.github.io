/**
 * Drive 전송 한 장만 왕복하고 지운다. 열람 트리 원본은 안 읽는다.
 * 기본 원격: gdrive:karm-files-vault-probe
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createVault, getFile } from '../src/vault.mjs';
import { putFileFromPath } from '../src/vault-node.mjs';
import { rcloneStore } from '../src/store-rclone.mjs';

const remote = process.env.FILES_VAULT_PROBE_REMOTE || 'gdrive:karm-files-vault-probe';
const pass = 'probe-pass-not-a-secret';
const root = await mkdtemp(join(tmpdir(), 'files-vault-probe-'));
const abs = join(root, 'probe.txt');
await writeFile(abs, 'vault-probe-ok');

try {
  const store = rcloneStore(remote);
  const session = await createVault(store, pass, { iterations: 8_000 });
  await putFileFromPath(session, 'probe.txt', abs, { chunkSize: 8 });
  const got = await getFile(session, 'probe.txt');
  if (new TextDecoder().decode(got.bytes) !== 'vault-probe-ok') {
    throw new Error('roundtrip');
  }
  const listing = await new Promise((resolve, reject) => {
    const child = spawn('rclone', ['lsf', remote, '-R'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('close', (code) => {
      const text = Buffer.concat(out).toString();
      if (code !== 0) reject(new Error(Buffer.concat(err).toString() || String(code)));
      else resolve(text);
    });
  });
  if (listing.includes('probe.txt')) throw new Error('plaintext name on remote');
  console.log('probe-ok');
  console.log(listing.trim());
} finally {
  await rm(root, { recursive: true, force: true });
  await new Promise((resolve, reject) => {
    const child = spawn('rclone', ['purge', remote], { stdio: 'inherit' });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`purge ${code}`))));
  });
}
