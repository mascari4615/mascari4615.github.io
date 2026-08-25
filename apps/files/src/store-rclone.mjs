/**
 * rclone 전송 저장소. restic 저장소 형식을 쓰지 않는다 — 우리 금고 키만 올린다.
 * 기본 원격 이름은 env. 여기 원본 폴더 경로를 적지 않는다.
 */
import { spawn } from 'node:child_process';

function defaultRun(args, stdinBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn('rclone', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString();
      if (code !== 0) reject(new Error(stderr || `rclone ${code}`));
      else resolve(Buffer.concat(out));
    });
    if (stdinBytes && stdinBytes.length) child.stdin.write(stdinBytes);
    child.stdin.end();
  });
}

export function rcloneStore(prefix, opts = {}) {
  const base = String(prefix || '').replace(/\/+$/, '');
  if (!base || !base.includes(':')) throw new Error('remote prefix');
  const run = opts.run ?? defaultRun;
  return {
    async put(key, bytes) {
      await run(['rcat', `${base}/${key}`], Buffer.from(bytes));
    },
    async get(key) {
      try {
        const buf = await run(['cat', `${base}/${key}`]);
        return new Uint8Array(buf);
      } catch {
        return null;
      }
    },
  };
}
