/**
 * 페이지가 부르는 파일이 실제로 만들어졌는가 (TASK-KL-098)
 *
 * 왜 있나: 2026-08-07, 다른 작업과 합쳐지는 과정에서 `build.mjs` 의 항목 두 개가 **조용히
 * 사라졌다**. 소스는 멀쩡했고, 타입 검사도 통과했고, 배포도 초록불이었다. 그런데 페이지가
 * 부르는 파일이 아예 안 만들어져 404 가 됐고 — **실서비스의 로그인이 통째로 죽어 있었다.**
 * 아무 검사도 이걸 못 잡았다. 화면을 열어 봐야만 알 수 있었다.
 *
 * 보는 것 하나: HTML 이 `<script src="/apps/karmolab/js/…">` 로 부르는 파일이 빌드 뒤에
 * 디스크에 있는가. 없으면 그 자리에서 배포를 세운다.
 *
 * **반드시 `node build.mjs` 뒤에 돌려야 한다** — 앞에 두면 늘 실패한다.
 *
 * 사용: node scripts/audit-page-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 검사할 HTML — 이 앱이 내보내는 페이지 전부. */
function htmlPages() {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 2) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'js' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.html')) found.push(full);
    }
  };
  walk(root, 0);
  return found;
}

const SRC_RE = /<script[^>]+src=["'](\/apps\/karmolab\/js\/[^"']+\.js)["']/g;

const missing = [];
let checked = 0;

for (const page of htmlPages()) {
  const html = fs.readFileSync(page, 'utf8');
  for (const match of html.matchAll(SRC_RE)) {
    const url = match[1];
    const file = path.join(root, url.replace('/apps/karmolab/', ''));
    checked += 1;
    if (!fs.existsSync(file)) {
      missing.push(`${path.relative(root, page)} → ${url}`);
    }
  }
}

if (missing.length) {
  console.error(`[audit-page-scripts] 페이지가 부르는데 만들어지지 않은 파일 ${missing.length}개 — 그 화면은 죽는다`);
  for (const line of missing) console.error(`  - ${line}`);
  console.error('  고치는 법: build.mjs 에 그 소스의 항목이 있는지 보세요 (합쳐지며 사라졌을 수 있습니다).');
  process.exit(1);
}

console.log(`[audit-page-scripts] 페이지가 부르는 파일 ${checked}개 전부 만들어져 있다`);
