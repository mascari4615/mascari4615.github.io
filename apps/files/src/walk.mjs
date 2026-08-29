/**
 * 올리기 대상 나열. 절대경로는 호출 쪽이 넘긴 뿌리만. 저장소에 뿌리를 적지 않는다.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SKIP = new Set(['.git', 'node_modules']);

export async function walkFiles(root) {
  const out = [];
  async function rec(dir) {
    let names;
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = await stat(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) await rec(abs);
      else if (st.isFile()) {
        const rel = relative(root, abs).split('\\').join('/');
        /* 크기도 담는다 — 영상은 크기로 열람 저장 여부가 갈린다(mirror-policy).
           `stat` 은 이미 했으므로 값이 공짜다. */
        out.push({ abs, rel, size: st.size });
      }
    }
  }
  await rec(root);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}
