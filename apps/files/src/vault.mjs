/**
 * Files 클라우드 v1. 청크 AES-GCM + 암호화 목록.
 *
 * 왜 위젯 crypto.ts 를 안 쓰나: 그쪽은 CryptoJS AES-CBC 텍스트 메모다. 인증 태그가 없고
 * 파일, 이름을 담는 규격이 아니다. 연산은 WebCrypto 만 (알고리즘 자작 금지).
 *
 * 저장 키에는 평문 경로를 넣지 않는다. 이름, 목록은 idx 암호문 안에만 있다.
 */
const MAGIC = new TextEncoder().encode('KARMVLT1');
const KDF_PBKDF2 = 1;
const HEADER_LEN = 30;
const IV_LEN = 12;
const SALT_LEN = 16;
const ID_LEN = 16;
const CHUNK = 1024 * 1024;
const PROD_ITERATIONS = 600_000;
const AAD_INDEX = new TextEncoder().encode('karmvlt:index:1');

export class VaultError extends Error {}
export class VaultUnlockError extends VaultError {}
export class VaultCorruptError extends VaultError {}
export class VaultPathError extends VaultError {}

export { CHUNK, PROD_ITERATIONS };

export function memoryStore() {
  const m = new Map();
  return {
    async put(key, bytes) {
      m.set(key, bytes.slice());
    },
    async get(key) {
      const v = m.get(key);
      return v ? v.slice() : null;
    },
    snapshot() {
      return m;
    },
  };
}

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

function readU32be(bytes, off) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(off);
}

export function hex(bytes) {
  return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function normalizePath(path) {
  if (typeof path !== 'string' || path === '') throw new VaultPathError('empty');
  if (path.includes('\0') || path.includes('\\')) throw new VaultPathError('bad char');
  const parts = path.split('/').filter((p) => p !== '');
  if (parts.length === 0) throw new VaultPathError('empty');
  if (parts.some((p) => p === '.' || p === '..')) throw new VaultPathError('dot');
  return parts.join('/');
}

async function deriveKey(passphrase, salt, iterations) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, plain, aad) {
  const iv = randomBytes(IV_LEN);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plain),
  );
  const out = new Uint8Array(IV_LEN + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_LEN);
  return out;
}

async function open(key, packed, aad) {
  if (!packed || packed.length < IV_LEN + 16) throw new VaultCorruptError('short');
  const iv = packed.subarray(0, IV_LEN);
  const ct = packed.subarray(IV_LEN);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ct),
    );
  } catch {
    throw new VaultCorruptError('auth');
  }
}

function aadChunk(id, n) {
  return new TextEncoder().encode(`karmvlt:chunk:${id}:${n}`);
}

async function sha256Hex(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function encodeIndex(index) {
  return new TextEncoder().encode(JSON.stringify(index));
}

function decodeIndex(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new VaultCorruptError('index json');
  }
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.files)) {
    throw new VaultCorruptError('index shape');
  }
  return parsed;
}

async function writeIndex(session, index) {
  const packed = await seal(session.key, encodeIndex(index), AAD_INDEX);
  await session.store.put('idx', packed);
}

async function readIndex(session) {
  const packed = await session.store.get('idx');
  if (!packed) throw new VaultCorruptError('no index');
  return decodeIndex(await open(session.key, packed, AAD_INDEX));
}

async function loadIndex(session) {
  if (session.index) return session.index;
  session.index = await readIndex(session);
  return session.index;
}

async function persistIndex(session, index) {
  session.index = index;
  if (session.deferIndex) {
    session.indexDirty = true;
    return;
  }
  await writeIndex(session, index);
  session.indexDirty = false;
}

/** deferIndex 일 때 암호문 목록을 원격에 한 번 쓴다. */
export async function flushIndex(session) {
  if (!session.deferIndex || !session.indexDirty || !session.index) return;
  await writeIndex(session, session.index);
  session.indexDirty = false;
}

function packHeader({ kdf, iterations, salt }) {
  const h = new Uint8Array(HEADER_LEN);
  h.set(MAGIC, 0);
  h[8] = kdf;
  h[9] = 0;
  h.set(u32be(iterations), 10);
  h.set(salt, 14);
  return h;
}

function unpackHeader(bytes) {
  if (!bytes || bytes.length !== HEADER_LEN) throw new VaultUnlockError('header');
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new VaultUnlockError('magic');
  }
  const kdf = bytes[8];
  if (kdf !== KDF_PBKDF2) throw new VaultUnlockError('kdf');
  const iterations = readU32be(bytes, 10);
  if (iterations < 1) throw new VaultUnlockError('iter');
  const salt = bytes.subarray(14, 14 + SALT_LEN);
  return { kdf, iterations, salt };
}

export async function createVault(store, passphrase, opts = {}) {
  const iterations = opts.iterations ?? PROD_ITERATIONS;
  const salt = randomBytes(SALT_LEN);
  await store.put('hdr', packHeader({ kdf: KDF_PBKDF2, iterations, salt }));
  const key = await deriveKey(passphrase, salt, iterations);
  const session = { store, key, iterations, index: { v: 1, files: [] } };
  await writeIndex(session, session.index);
  return session;
}

export async function unlockVault(store, passphrase) {
  const header = unpackHeader(await store.get('hdr'));
  const key = await deriveKey(passphrase, header.salt, header.iterations);
  const session = { store, key, iterations: header.iterations };
  try {
    session.index = await readIndex(session);
  } catch {
    throw new VaultUnlockError('index');
  }
  return session;
}

export function newBlobId() {
  return hex(randomBytes(ID_LEN));
}

/** 청크 하나 암호해서 바로 store 에 넣는다. 호출 쪽이 암호문 배열을 모으지 않게 길이만 돌려준다. */
export async function putChunk(session, id, n, part) {
  if (!(part instanceof Uint8Array)) throw new VaultPathError('bytes');
  const sealed = await seal(session.key, part, aadChunk(id, n));
  await session.store.put(`c/${id}/${n}`, sealed);
  return sealed.length;
}

export async function commitFile(session, rec) {
  const norm = normalizePath(rec.path);
  const index = await loadIndex(session);
  index.files = index.files.filter((f) => f.path !== norm);
  index.files.push({
    id: rec.id,
    path: norm,
    size: rec.size,
    chunks: rec.chunks,
    sha256: rec.sha256,
  });
  await persistIndex(session, index);
  return { id: rec.id, sha256: rec.sha256, chunks: rec.chunks };
}

export async function putFile(session, path, bytes, opts = {}) {
  const chunkSize = opts.chunkSize ?? CHUNK;
  if (!(bytes instanceof Uint8Array)) throw new VaultPathError('bytes');
  const id = newBlobId();
  const n = bytes.length === 0 ? 0 : Math.ceil(bytes.length / chunkSize);
  for (let i = 0; i < n; i++) {
    const part = bytes.subarray(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize));
    await putChunk(session, id, i, part);
  }
  const digest = await sha256Hex(bytes);
  return commitFile(session, {
    id,
    path,
    size: bytes.length,
    chunks: n,
    sha256: digest,
  });
}

/** 파일별 청크 키. 열람 저장에 **암호문을 그대로 옮길 때**만 쓴다. 복호가 필요 없는 일이다. */
export async function fileChunkKeys(session) {
  const index = await loadIndex(session);
  return index.files.map((f) => ({
    path: f.path,
    keys: Array.from({ length: f.chunks }, (_, i) => `c/${f.id}/${i}`),
  }));
}

export async function listFiles(session) {
  const index = await loadIndex(session);
  return index.files.map((f) => ({
    path: f.path,
    size: f.size,
    chunks: f.chunks,
    sha256: f.sha256,
  }));
}

export async function getFile(session, path) {
  const norm = normalizePath(path);
  const index = await loadIndex(session);
  const entry = index.files.find((f) => f.path === norm);
  if (!entry) return null;
  const parts = [];
  let total = 0;
  for (let i = 0; i < entry.chunks; i++) {
    const packed = await session.store.get(`c/${entry.id}/${i}`);
    if (!packed) throw new VaultCorruptError('missing chunk');
    const part = await open(session.key, packed, aadChunk(entry.id, i));
    parts.push(part);
    total += part.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  if (out.length !== entry.size) throw new VaultCorruptError('size');
  const digest = await sha256Hex(out);
  if (digest !== entry.sha256) throw new VaultCorruptError('hash');
  return { bytes: out, entry };
}

/** 브라우저, 원격 읽기 전용. 올리기는 PC rclone. */
export function fetchStore(base, fetchFn = globalThis.fetch) {
  const prefix = String(base).replace(/\/+$/, '');
  return {
    async get(key) {
      const r = await fetchFn(`${prefix}/${key}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('get ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    },
    async put() {
      throw new Error('read-only');
    },
  };
}

export function listDir(files, dir) {
  const trimmed = (dir || '').replace(/^\/+|\/+$/g, '');
  const prefix = trimmed ? trimmed + '/' : '';
  const folders = new Set();
  const rows = [];
  for (const f of files) {
    if (prefix) {
      if (f.path === trimmed) continue;
      if (!f.path.startsWith(prefix)) continue;
      const rest = f.path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) rows.push(f);
      else folders.add(rest.slice(0, slash));
    } else {
      const slash = f.path.indexOf('/');
      if (slash === -1) rows.push(f);
      else folders.add(f.path.slice(0, slash));
    }
  }
  return {
    dir: trimmed,
    folders: [...folders].sort(),
    files: rows.slice().sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function previewKind(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogv'].includes(ext)) return 'video';
  if (['txt', 'md', 'json', 'csv'].includes(ext)) return 'text';
  return 'file';
}

export function mimeFor(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    txt: 'text/plain',
    md: 'text/plain',
    json: 'application/json',
    csv: 'text/csv',
  };
  return map[ext] || 'application/octet-stream';
}
