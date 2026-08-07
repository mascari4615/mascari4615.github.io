import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const 뿌리 = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 프로세스를 띄울 때 **검은 콘솔 창이 튀어나오면 안 된다.**
 *
 * 조수님: 「node.exe 터미널 창 계속 중간에 떠서 불편한데.」 윈도우에서는 창 숨김을 안 걸면
 * 프로세스마다 콘솔 창이 뜬다. 곁에 두는 존재가 화면 한가운데에 검은 창을 띄우면 그걸로 끝이다.
 *
 * 새 자리가 생길 때마다 사람이 기억해서 붙일 수는 없으므로 기계가 센다.
 */
const 모으기 = (곳, 담을것 = []) => {
  for (const 이름 of readdirSync(곳)) {
    if (이름 === 'node_modules' || 이름 === 'dist' || 이름.startsWith('.')) continue;
    const 길 = join(곳, 이름);
    if (statSync(길).isDirectory()) 모으기(길, 담을것);
    else if (/\.(ts|mjs)$/.test(이름)) 담을것.push(길);
  }
  return 담을것;
};

test('프로세스를 띄우는 자리마다 창 숨김이 걸려 있다', () => {
  const 빠진곳 = [];
  for (const 길 of [...모으기(join(뿌리, 'src')), ...모으기(join(뿌리, 'scripts')), ...모으기(join(뿌리, 'demo'))]) {
    const 글 = readFileSync(길, 'utf8');
    // 프로세스를 띄우는 부름만 본다 — 정규식 exec 같은 건 아니다.
    for (const m of 글.matchAll(/\b(spawn|execFile)\s*\(/g)) {
      const 뒤 = 글.slice(m.index, m.index + 700);
      const 끝 = 뒤.indexOf(');');
      if ((끝 === -1 ? 뒤 : 뒤.slice(0, 끝)).includes('windowsHide') === false) {
        빠진곳.push(`${길.slice(뿌리.length + 1)} :: ${뒤.slice(0, 60).replace(/\s+/g, ' ')}`);
      }
    }
  }
  assert.deepEqual(빠진곳, [], `창 숨김이 빠졌다 — 여기서 검은 창이 뜬다:\n${빠진곳.join('\n')}`);
});
