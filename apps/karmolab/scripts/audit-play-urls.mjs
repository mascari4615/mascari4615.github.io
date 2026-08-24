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

/*
 * 놀이 판을 찍는 쪽(`apps/play/scripts/build.mjs`)은 주소마다 **그걸 내주는 파일**을 WHERE 에
 * 적어 두라고 요구하고, 안 적혀 있으면 멈춘다. 그 멈춤이 배포에서 처음 보이면 이미 늦다 —
 * 실측으로 배포 세 판이 그렇게 빨갰다(2026-08-10). 그래서 여기서 같은 것을 먼저 묻는다.
 */
const hubBuild = fs.readFileSync(path.join(repoRoot, 'apps/play/scripts/build.mjs'), 'utf8');

/*
 * 장이 아직 안 찍혔으면 **장이 있는지**만 못 묻는다 — 그 부분만 건너뛴다.
 * 통째로 건너뛰면 아래 WHERE 검사까지 같이 죽어서, 정작 배포를 세우는 것을 못 잡는다
 * (실측: 그렇게 만들어 놨다가 배포 세 판을 빨갛게 냈다)。
 */
const pagesReady = fs.existsSync(path.join(blogRoot, 'karmolab/t'));
if (pagesReady === false) {
  console.log('[play-urls] 도구 장이 아직 안 찍혔다 — 장이 있는지는 건너뛰고 WHERE 만 본다.');
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
  if (hubBuild.includes(`'${g.url}'`) === false) {
    problems.push(`${g.id}: 놀이 판 생성기의 WHERE 에 「${g.url}」 가 없다 — 배포가 여기서 멈춘다`);
  }

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
  if (pagesReady === false) continue; // 여기부터는 찍힌 장이 있어야 물을 수 있다
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
