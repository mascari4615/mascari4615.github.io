/**
 * PC 올리기 — 파일을 청크 단위로 읽어 바로 store.put 한다.
 * 디스크에 암호문 통째 사본을 만들지 않는다. 해시는 node:crypto (브라우저 올리기 없음).
 */
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { CHUNK, commitFile, newBlobId, normalizePath, putChunk } from './vault.mjs';

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
    });
  } finally {
    await fh.close();
  }
}
