/**
 * 놀이 카드가 **어디로도 안 가는지** 본다 (데일리 ⓐⓑ 곁가지)
 *
 * 놀이 목록(`apps/play/games.json`)의 카드마다 주소가 하나씩 붙어 있는데, **그 주소가 실제로
 * 있는지는 아무도 안 봤다.** 소개 글이 있는지는 생성기가 보고(둘이 갈리면 멈춘다), 화면이
 * 그려지는지도 검사가 본다. 그런데 카드를 눌렀을 때 404 가 나는 것은 아무도 안 잡는다 —
 * 새 놀이를 넣고 주소를 오타 내거나, 도구 장 이름을 바꾸면 그 순간 조용히 끊긴다.
 *
 * 어디까지 보나: **찍어 낸 장이 있는지**까지다(`apps/blog/…/index.html`). 라이브까지는 안 본다 —
 * 남의 망을 우리 빨강으로 세면 안 되고, 그건 `check:live-tools` 가 따로 한다.
 *
 * 사용: node scripts/audit-play-urls.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const blogRoot = path.join(repoRoot, 'apps/blog');

const roster = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/play/games.json'), 'utf8')).games;

/* 장이 아직 안 찍혔으면 「못 돌렸다」다 — 빌드 전에 부르면 전부 빨개진다. */
if (fs.existsSync(path.join(blogRoot, 'karmolab/t')) === false) {
  console.log('[play-urls] CANNOT-RUN(건너뜀) — 도구 장이 아직 안 찍혔다. `npm run gen:tool-pages` 뒤에 돌려라.');
  process.exit(0);
}

/*
 * 장이 파일로 있는 것만이 전부가 아니다 — Jekyll 앞머리에 `permalink:` 를 적어 만드는 장도 있다
 * (`/daily/` 가 그렇다: `apps/blog/_tabs/daily.md`). 그걸 모르고 파일만 찾다가 멀쩡한 주소를
 * 「없다」고 잡을 뻔했다 — 막는 자리가 정상 경로를 헐뜯으면 사람이 검사를 꺼 버린다.
 */
const declared = new Set();
const walk = (dir, depth) => {
  if (depth > 4) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'assets') continue;
    const at = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(at, depth + 1);
      continue;
    }
    if (/\.(md|html)$/.test(e.name) === false) continue;
    const head = fs.readFileSync(at, 'utf8').slice(0, 800);
    const m = /^permalink:\s*(\S+)\s*$/m.exec(head);
    if (m !== null) declared.add(m[1].replace(/^['"]|['"]$/g, ''));
  }
};
walk(blogRoot, 0);

const problems = [];
for (const g of roster) {
  /* `#` 뒤는 화면 안에서 여는 이름이라 파일이 아니다 — 앞의 장만 본다. */
  const url = String(g.url ?? '').split('#')[0];
  if (url === '') {
    problems.push(`${g.id}: 주소가 없다`);
    continue;
  }
  if (url.startsWith('/') === false) {
    problems.push(`${g.id}: 주소가 /로 시작하지 않는다 (${g.url})`);
    continue;
  }
  if (declared.has(url)) continue; // 앞머리로 선언된 장

  /*
   * 통짜 앱 하나가 주소 한 칸을 통째로 갖는 것도 있다 — `/daily/` = `apps/daily/` 가 배포 때
   * 그 자리로 옮겨진다(소스에 permalink 가 없다). **한 칸짜리 주소일 때만** 이 규칙을 쓴다.
   * 안 그러면 `/karmolab/t/오타/` 도 `apps/karmolab` 이 있다는 이유로 통과해 버린다.
   */
  const seg = url.split('/').filter((x) => x !== '');
  if (seg.length === 1 && fs.existsSync(path.join(repoRoot, 'apps', seg[0]))) continue;
  const asDir = path.join(blogRoot, url, 'index.html');
  const asFile = path.join(blogRoot, url.replace(/\/$/, '') + '.html');
  if (fs.existsSync(asDir) === false && fs.existsSync(asFile) === false) {
    problems.push(`${g.id}: 그 주소에 장이 없다 — ${g.url}`);
  }
}

if (problems.length > 0) {
  console.error(`[play-urls] 놀이 카드 ${problems.length}개가 어디로도 안 간다 (${roster.length}개 중):`);
  for (const p of problems) console.error('  - ' + p);
  console.error('  카드를 누른 사람만 404 를 본다 — 우리는 목록에서 눌러 보지 않으면 모른다.');
  process.exit(1);
}
console.log(`[play-urls] 놀이 카드 ${roster.length}개 전부 갈 곳이 있다`);
