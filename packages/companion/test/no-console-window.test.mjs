import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 프로세스를 띄울 때 **검은 콘솔 창이 튀어나오면 안 된다.**
 *
 * 조수님: 「node.exe 터미널 창 계속 중간에 떠서 불편한데.」 윈도우에서는 창 숨김을 안 걸면
 * 프로세스마다 콘솔 창이 뜬다. 곁에 두는 존재가 화면 한가운데에 검은 창을 띄우면 그걸로 끝이다.
 *
 * 새 자리가 생길 때마다 사람이 기억해서 붙일 수는 없으므로 기계가 센다.
 */
const gather = (place, toStore = []) => {
  for (const name of readdirSync(place)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(place, name);
    if (statSync(path).isDirectory()) gather(path, toStore);
    else if (/\.(ts|mjs)$/.test(name)) toStore.push(path);
  }
  return toStore;
};

test('프로세스를 띄우는 자리마다 창 숨김이 걸려 있다', () => {
  const gaps = [];
  for (const path2 of [...gather(join(root, 'src')), ...gather(join(root, 'scripts')), ...gather(join(root, 'demo'))]) {
    const content = readFileSync(path2, 'utf8');
    // 프로세스를 띄우는 부름만 본다 — 정규식 exec 같은 건 아니다.
    for (const m of content.matchAll(/\b(spawn|execFile)\s*\(/g)) {
      const after = content.slice(m.index, m.index + 700);
      const end = after.indexOf(');');
      if ((end === -1 ? after : after.slice(0, end)).includes('windowsHide') === false) {
        gaps.push(`${path2.slice(root.length + 1)} :: ${after.slice(0, 60).replace(/\s+/g, ' ')}`);
      }
    }
  }
  assert.deepEqual(gaps, [], `창 숨김이 빠졌다 — 여기서 검은 창이 뜬다:\n${gaps.join('\n')}`);
});
