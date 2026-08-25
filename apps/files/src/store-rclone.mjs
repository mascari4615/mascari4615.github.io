/**
 * rclone 전송 저장소. restic 저장소 형식을 쓰지 않는다 — 우리 금고 키만 올린다.
 * 기본 원격 이름은 env. 여기 원본 폴더 경로를 적지 않는다.
 * 실업로드는 rclone rcd 한 프로세스(pacer). 테스트는 run() 모의.
 */
import { spawn } from 'node:child_process';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRateLimit(err) {
  const s = String(err && err.message ? err.message : err);
  return s.includes('RATE_LIMIT') || s.includes('rateLimitExceeded') || s.includes('Quota exceeded');
}

export function isMissing(err) {
  if (isRateLimit(err)) return false;
  const s = String(err && err.message ? err.message : err).toLowerCase();
  return (
    s.includes('not found') ||
    s.includes('missing') ||
    s.includes('404') ||
    s.includes('object not found') ||
    s.includes('directory not found')
  );
}

async function withRetry(fn, tries = 8, retryBaseMs = 15_000) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRateLimit(e) || i === tries - 1) throw e;
      const wait = Math.min(180_000, retryBaseMs * 2 ** i);
      console.error(`대기 ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
  throw last;
}

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

async function rcPut(url, fs, remote, bytes) {
  const slash = String(remote).lastIndexOf('/');
  const dir = slash === -1 ? '' : remote.slice(0, slash);
  const name = slash === -1 ? remote : remote.slice(slash + 1);
  if (!name) throw new Error('remote name');
  const form = new FormData();
  form.append('file', new Blob([bytes]), name);
  const r = await fetch(
    `${url}/operations/uploadfile?fs=${encodeURIComponent(fs)}&remote=${encodeURIComponent(dir)}`,
    { method: 'POST', body: form },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(text || `rc ${r.status}`);
}

async function rcAlive(url) {
  const r = await fetch(`${url}/core/version`, { method: 'POST' });
  return r.ok;
}

export async function startRcloneDaemon(opts = {}) {
  const port = opts.port ?? 5572;
  const url = `http://127.0.0.1:${port}`;
  try {
    if (await rcAlive(url)) return { url, stop() {} };
  } catch {
    /* not running */
  }
  const child = spawn(
    'rclone',
    [
      'rcd',
      '--rc-addr',
      `127.0.0.1:${port}`,
      '--rc-no-auth',
      '--tpslimit',
      '8',
      '--tpslimit-burst',
      '16',
      '--drive-pacer-min-sleep',
      '10ms',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) break;
    try {
      if (await rcAlive(url)) {
        return {
          url,
          stop() {
            child.kill();
          },
        };
      }
    } catch {
      /* wait */
    }
    await sleep(150);
  }
  try {
    if (await rcAlive(url)) return { url, stop() {} };
  } catch {
    /* still down */
  }
  child.kill();
  throw new Error('rclone rcd');
}

export function rcloneStore(prefix, opts = {}) {
  const base = String(prefix || '').replace(/\/+$/, '');
  if (!base || !base.includes(':')) throw new Error('remote prefix');
  const run = opts.run ?? defaultRun;
  const rcUrl = opts.rcUrl;
  const retryBaseMs = opts.retryBaseMs ?? 15_000;
  const tries = opts.tries ?? 8;
  return {
    async put(key, bytes) {
      if (rcUrl) {
        await withRetry(() => rcPut(rcUrl, base, key, Buffer.from(bytes)), tries, retryBaseMs);
      } else {
        await withRetry(() => run(['rcat', `${base}/${key}`], Buffer.from(bytes)), tries, retryBaseMs);
      }
      const delay = opts.delayMs ?? 0;
      if (delay) await sleep(delay);
    },
    async get(key) {
      try {
        const buf = await withRetry(() => run(['cat', `${base}/${key}`]), tries, retryBaseMs);
        return new Uint8Array(buf);
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
  };
}
