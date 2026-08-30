/**
 * PC 올리기. 파일을 청크 단위로 읽어 바로 store.put 한다.
 * 디스크에 암호문 통째 사본을 만들지 않는다. 해시는 node:crypto (브라우저 올리기 없음).
 */
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { HEAD_BYTES, exifTakenAt, hasExif } from './exif.mjs';
import { CHUNK, commitFile, newBlobId, normalizePath, putChunk } from './vault.mjs';

export async function sha256File(absPath) {
  const hash = createHash('sha256');
  const fh = await open(absPath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let off = 0;
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, off);
      if (bytesRead === 0) break;
      hash.update(buf.subarray(0, bytesRead));
      off += bytesRead;
    }
    return hash.digest('hex');
  } finally {
    await fh.close();
  }
}

/**
 * 찍은 날. JPEG 앞부분만 읽는다. 못 찾으면 0.
 * 사진의 디스크 수정 시각은 옮긴 날로 덮이는 일이 잦아 이 값을 따로 본다.
 */
export async function takenAtOf(absPath, rel) {
  if (!hasExif(rel)) return 0;
  try {
    const fh = await open(absPath, 'r');
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
      return exifTakenAt(Uint8Array.from(buf.subarray(0, bytesRead)));
    } finally {
      await fh.close();
    }
  } catch {
    return 0;
  }
}

export async function putFileFromPath(session, vaultPath, absPath, opts = {}) {
  const chunkSize = opts.chunkSize ?? CHUNK;
  const norm = normalizePath(vaultPath);
  const fh = await open(absPath, 'r');
  try {
    const id = newBlobId();
    const hash = createHash('sha256');
    let n = 0;
    let size = 0;
    const buf = Buffer.alloc(chunkSize);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, chunkSize, size);
      if (bytesRead === 0) break;
      const part = Uint8Array.from(buf.subarray(0, bytesRead));
      hash.update(part);
      await putChunk(session, id, n, part);
      n += 1;
      size += bytesRead;
    }
    return commitFile(session, {
      id,
      path: norm,
      size,
      chunks: n,
      sha256: hash.digest('hex'),
      mtime: opts.mtime ?? 0,
      shot: opts.shot ?? 0,
    });
  } finally {
    await fh.close();
  }
}
