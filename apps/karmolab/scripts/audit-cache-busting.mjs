/**
 * 저장해 둔 파일을 방문마다 다시 받게 만드는 주소가 있는지 본다 (TASK-KL-088)
 *
 * 우리가 직접 담아 둔 파일(vendor/ 아래 등)은 우리가 바꿀 때만 바뀐다. 그런데 주소 뒤에
 * `?v=` + 지금 시각을 붙이면 매번 새 주소가 되어, 브라우저가 저장해 둔 것을 못 쓰고 다시 받는다.
 * 눈에는 똑같이 보여서 아무도 모른 채 회선만 쓴다 — 그래서 코드로 잡는다.
 *
 * 사용: node scripts/audit-cache-busting.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bad = [];

/** 주소를 만드는 자리에서 지금 시각을 쓰는 곳 — `'?v=' + Date.now()` 꼴 */
const PATTERN = /\?(?:v|t|_|cb)=['"`]?\s*\+?\s*(?:Date\.now\(\)|new Date\(\)|Math\.random\(\))/;

function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'vendor') continue;
      scan(p);
      continue;
    }
    if (!/\.(ts|js|mjs|html)$/.test(e.name)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) bad.push([path.relative(root, p), i + 1, line.trim().slice(0, 100)]);
    });
  }
}

scan(path.join(root, 'src'));

if (bad.length) {
  console.error('[audit-cache-busting] 방문마다 다시 받게 만드는 주소가 있다:\n');
  for (const [f, ln, src] of bad) console.error(`  ${f}:${ln}\n    ${src}`);
  console.error('\n  → 우리가 담아 둔 파일이면 시각을 떼라. 정말 매번 새로 받아야 하는 것만 남길 것.');
  process.exit(1);
}
console.log('[audit-cache-busting] 매번 다시 받게 만드는 주소 없음');
