/**
 * 도구를 하나 더할 때 같이 채워야 하는 것들이 채워졌는지 (TASK-KL-089)
 *
 * 도구가 늘 때마다 세 가지가 따라와야 한다. 안 채우면 그 도구만 조용히 손해를 본다.
 *   - 공유 카드     없으면 링크를 공유했을 때 그 도구만 공용 그림이 나간다
 *   - 자리 높이     없으면 어림값으로 비우므로 밀림이 조금 남는다
 *   - 달리 부르는 이름  없으면 영문으로 찾는 사람에게 안 걸린다
 *
 * 이걸 보는 검사는 이미 있지만 전부 **서버를 띄우고 브라우저를 열어야** 해서 몇 분이 걸리고,
 * 배포가 끝난 뒤에야 돈다. 이 검사는 파일만 읽으므로 어디서든 즉시 돈다 — 도구를 더한 사람이
 * 그 자리에서 알 수 있다.
 *
 * 채우는 법: `npm run sync:tools` (카드·높이·페이지를 한 번에) + 이름은 data/tool-aliases.json 에 한 줄.
 *
 * 사용: node scripts/audit-tool-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const tools = Object.keys(read('data/tools-seo.json').tools);
const aliases = fs.existsSync(path.join(root, 'data/tool-aliases.json')) ? read('data/tool-aliases.json').aliases || {} : {};
const heights = fs.existsSync(path.join(root, 'data/tool-heights.json')) ? read('data/tool-heights.json') : {};

const missing = { 카드: [], 자리: [], 이름: [] };
for (const id of tools) {
  if (!fs.existsSync(path.join(root, `img/og/${id}.jpg`))) missing['카드'].push(id);
  const h = heights[id];
  if (!h?.narrow || !h?.wide) missing['자리'].push(id);
  if (!aliases[id]) missing['이름'].push(id);
}

/* 반대 방향도 본다 — 없어진 도구의 기록이 남아 있으면 쓰레기가 쌓이고,
 * 「몇 개 채워졌나」 같은 숫자가 조용히 틀어진다. */
const known = new Set(tools);
const stale = [
  ...Object.keys(aliases).filter((id) => !known.has(id)).map((id) => `이름(${id})`),
  ...Object.keys(heights).filter((id) => !known.has(id)).map((id) => `자리(${id})`)
];

const problems = [];

/*
 * ★ 반대 방향 하나 더 — **알맹이는 있는데 tools-seo 에 없는 도구** (2026-08-10, 두 번 밟았다).
 *
 * `tools-seo.json` 이 도구 페이지·마크다운 쌍둥이·검색 유입·주소(`/karmolab/t/<id>/`)를 만든다.
 * 알맹이(`src/core/<id>.ts`)가 있다는 건 **주소로 부를 수 있다**는 뜻인데, 여기 없으면 그 주소가
 * 아예 안 생긴다 — 위젯은 있고 **들어갈 문이 없는** 상태다. 빌드도 타입 검사도 전부 초록이라
 * 아무 데서도 안 걸린다. `chain` 을 그렇게 내보냈다가 다음 회차에 발견했다.
 *
 * 기준을 「등록된 위젯 전부」로 잡으면 안 된다 — settings·status 처럼 **페이지가 없어야 맞는**
 * 화면이 32개 걸려서 아무도 못 고치는 빨간불이 된다(실제로 그렇게 써 보고 되돌렸다).
 * 알맹이 유무가 정확한 신호다.
 */
{
  const coreDir = path.join(root, 'src/core');
  if (fs.existsSync(coreDir)) {
    const withCore = fs
      .readdirSync(coreDir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /export const spec/.test(fs.readFileSync(path.join(coreDir, f), 'utf8')))
      .map((f) => path.basename(f, '.ts'));
    const orphans = withCore.filter((id) => known.has(id) === false);
    if (orphans.length > 0) {
      problems.push(
        `알맹이는 있는데 tools-seo 에 없다 ${orphans.length}개 — ${orphans.join(', ')}` +
          ' (도구 페이지·쌍둥이·주소가 안 생긴다)'
      );
    }
  }
}


/* 내 컴퓨터의 도구 페이지가 **지금 빌드로 찍힌 것인지** (TASK-KL-089).
 * 다른 사람이 앱을 다시 빌드하면 내가 찍어 둔 페이지는 그 순간 낡는다. 열어 보면 도구가
 * 안 뜨는데, 겉으로는 「그 도구가 깨졌다」처럼 보인다 — 실제로 없는 결함을 한참 쫓았다.
 * 페이지에 박아 둔 빌드 지문과 지금 빌드를 견줘, 다르면 다시 찍으라고 알린다.
 * (배포는 늘 새로 찍으므로 이 문제가 없다. 그래서 로컬에 사본이 있을 때만 본다.) */
{
  const sample = path.join(root, '../blog/karmolab/t/loan/index.html');
  const built = path.join(root, 'js/widgets-lazy-meta.js');
  if (fs.existsSync(sample) && fs.existsSync(built)) {
    let h = 0;
    const src = fs.readFileSync(built, 'utf8');
    for (let i = 0; i < src.length; i++) h = (Math.imul(31, h) + src.charCodeAt(i)) | 0;
    const now = (h >>> 0).toString(36);
    const stamped = (fs.readFileSync(sample, 'utf8').match(/KARMOLAB_BUILD_PRINT="([a-z0-9]+)"/) || [])[1];
    if (stamped && stamped !== now) {
      problems.push(
        `내 컴퓨터의 도구 페이지가 낡았다 (찍힌 빌드 ${stamped} ≠ 지금 ${now}) — \`npm run gen:tool-pages\` 로 다시 찍어라`
      );
    }
  }
}
/* 목록 페이지에 「마지막으로 바뀐 날」이 적혀 있는가 (TASK-KL-089).
 * 실제 사이트의 사이트맵을 받아 보니 도구 125장에는 그 날짜가 있는데 목록만 빠져 있었다.
 * 검색엔진은 그 값으로 다시 올 때를 정하므로, 도구를 새로 얹어도 목록을 늦게 다시 본다. */
{
  const hub = path.join(root, '../blog/karmolab/t/index.html');
  if (fs.existsSync(hub)) {
    const head = fs.readFileSync(hub, 'utf8').slice(0, 200);
    if (!/last_modified_at:\s*\d{4}-\d{2}-\d{2}/.test(head)) {
      problems.push('목록 페이지에 마지막으로 바뀐 날이 없다 — 사이트맵에서도 빠져 검색엔진이 늦게 다시 온다');
    }
  }
}

/* 없는 도구 주소로 온 사람을 건질 때 쓰는 작은 목록이 성한가 (TASK-KL-089).
 * 도구가 이름을 바꾸거나 사라지면 예전 링크가 전부 「없는 쪽」으로 간다. 거기서 비슷한 도구를
 * 찾아 주려고 이름만 담은 목록을 함께 찍는데, 이게 조용히 안 찍히면 건지기가 죽는다 —
 * 화면에는 아무 티가 안 난다. 파일이 있는지, 읽히는지, 도구 수와 맞는지 본다. */
{
  const f = path.join(root, '../blog/karmolab/t/tools.json');
  if (fs.existsSync(f)) {
    const raw = fs.readFileSync(f, 'utf8').replace(/^---[\s\S]*?---\n/, '');
    let rows = null;
    try {
      rows = JSON.parse(raw);
    } catch {
      problems.push('건지기 목록(tools.json)이 깨졌다 — 없는 주소로 온 사람을 못 건진다');
    }
    if (rows && rows.length !== tools.length) {
      problems.push(`건지기 목록에 ${rows.length}개뿐 — 도구는 ${tools.length}개다`);
    }
  }
}

for (const [what, list] of Object.entries(missing)) {
  if (list.length) problems.push(`${what} 없음 ${list.length}개 — ${list.slice(0, 10).join(', ')}${list.length > 10 ? ' …' : ''}`);
}
if (stale.length) problems.push(`없어진 도구의 기록이 남아 있다 ${stale.length}건 — ${stale.slice(0, 8).join(', ')}`);

if (problems.length) {
  console.error(`[audit-tool-data] 도구 ${tools.length}개 중 덜 채워진 것이 있다`);
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → `npm run sync:tools` 로 카드·자리를 채우고, 이름은 data/tool-aliases.json 에 한 줄 넣어라');
  process.exit(1);
}
console.log(`[audit-tool-data] 도구 ${tools.length}개 모두 공유 카드·자리 높이·달리 부르는 이름을 갖췄다`);
