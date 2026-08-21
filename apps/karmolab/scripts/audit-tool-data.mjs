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
import { withoutRetired, RETIRED_OPERATION_IDS } from './lib/retired-operations.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

/* ★ **접은 도구는 이 검사의 대상이 아니다** (2026-08-14). 작업대로 합쳐진 열여섯은 낱개 장이
   넘김판이라 공유 카드도 자리 높이도 안 만든다 — 그런데 여기서 세고 있었다. 초록이었던 건
   **옛 카드 파일이 지워지지 않고 남아 있어서**다(사람은 「138개 다 갖췄다」로 읽는다).
   목록 정본 = `lib/retired-operations.mjs`. */
const all = Object.keys(read('data/tools-seo.json').tools);
const tools = withoutRetired(all);
const aliases = fs.existsSync(path.join(root, 'data/tool-aliases.json')) ? read('data/tool-aliases.json').aliases || {} : {};
const heights = fs.existsSync(path.join(root, 'data/tool-heights.json')) ? read('data/tool-heights.json') : {};

/** 알맹이는 있는데 상세 페이지 정보(tools-seo)가 없는 도구 — 아래에서 **래칫**으로 본다. */
let seoOrphans = [];
const missing = { card: [], slot: [], 이름: [] };
for (const id of tools) {
  if (!fs.existsSync(path.join(root, `img/og/${id}.jpg`))) missing['card'].push(id);
  const h = heights[id];
  if (!h?.narrow || !h?.wide) missing['slot'].push(id);
  if (!aliases[id]) missing['이름'].push(id);
}

/* 반대 방향도 본다 — 없어진 도구의 기록이 남아 있으면 쓰레기가 쌓이고,
 * 「몇 개 채워졌나」 같은 숫자가 조용히 틀어진다. */
/* ★ **찾는 이름은 도구 페이지가 있는 것에만 붙는 게 아니다** (2026-08-12).
 *   여기서 「없어진 도구」를 `tools-seo.json`(= 페이지가 있는 도구)만으로 판정했더니,
 *   페이지 없이 화면으로만 사는 것들(perf·plaza·docs·localai·randomgen…)에 붙은 이름 48건이
 *   통째로 「쓰레기」로 잡혔다 — 정작 그 이름들은 팔레트가 쓰는 **살아 있는 데이터**다.
 *   그 빨강 때문에 진짜 쓰레기(존재하지 않는 id)가 묻혔다. 기준을 **등록된 위젯 전부**로 넓힌다. */
const widgetIds = (() => {
  const metaPath = path.join(root, 'src/widgets-lazy-meta.ts');
  if (!fs.existsSync(metaPath)) return new Set();
  return new Set([...fs.readFileSync(metaPath, 'utf8').matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]));
})();
/* 「이 이름을 아는가」는 **접은 것까지 포함**이다 — 접은 도구도 tools-seo 에 남아 있고
   (넘김판·건지기 목록이 그걸 쓴다), 알맹이(src/core)도 살아 있다(작업대의 조작이 되었다).
   여기서 빼면 멀쩡한 알맹이 넷이 「명부에 없다」로 잡힌다.
   카드·자리 검사만 지금 도구(tools)로 한다. */
const known = new Set(all);
const alive = new Set([...known, ...widgetIds]);
const stale = [
  ...Object.keys(aliases).filter((id) => !alive.has(id)).map((id) => `이름(${id})`),
  ...Object.keys(heights).filter((id) => !alive.has(id)).map((id) => `자리(${id})`)
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
      /* 스스로 「화면 없음」이라 밝힌 것은 뺀다 — 예외의 이유는 그 파일 안에 적혀 있다. */
      .filter((f) => /export const SCREENLESS/.test(fs.readFileSync(path.join(coreDir, f), 'utf8')) === false)
      .map((f) => path.basename(f, '.ts'));
    /* ★ **접은 도구는 페이지가 없어야 맞다** (2026-08-16). 알맹이 파일은 남아 있어도
       그 도구는 다른 도구 안의 「할 일」로 흡수됐다 — 주소를 다시 만들면 오히려 갈라진다.
       실측: 32개라던 목록에 접은 것 5개(configconv·jqplay·prettyall·sqlfmt·xmlfmt)가 섞여 있었다.
       접은 목록의 정본은 `lib/retired-operations.mjs` 한 곳이다 — 여기에 다시 적지 않는다. */
    seoOrphans = withoutRetired(withCore.filter((id) => known.has(id) === false));
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
    /* 건지기 목록에는 **접은 도구도 남긴다** — 그 주소로 오는 사람에게 이름이라도 찾아 주려고
       일부러 남긴 것이다(`gen-tool-pages.mjs` 주석). 그러니 여기 수는 「지금 도구 + 접은 것」이다.
       그걸 모르고 도구 수와만 견주면, 일부러 남긴 것을 「모자란다」고 잡는다. */
    const expectedCount = tools.length + [...RETIRED_OPERATION_IDS].filter((id) => all.includes(id)).length;
    if (rows && rows.length !== expectedCount) {
      problems.push(`건지기 목록에 ${rows.length}개뿐 — 도구 ${tools.length} + 접은 것까지 ${expectedCount}개여야 한다`);
    }
  }
}

/* ★ **자리표시자가 남아 있는가** (TASK-KL-311).
 *
 * `npm run new:tool` 이 새 도구의 여섯 자리를 한 번에 만든다 — 그중 사람이 정해야 하는 글
 * (상세 페이지 설명·달리 부르는 이름)은 `TODO:` 로 채워 둔다. 빈 칸으로 두면 다른 검사가
 * 「없다」고 세우겠지만, 채워는 두고 안 고치면 **아무 데서도 안 걸린 채 검색 결과에 그대로
 * 나간다** — 자리표시자가 사람 눈에 닿는 것이 빈 칸보다 나쁘다. 그래서 여기서 센다. */
{
  const todo = [];
  for (const [id, entry] of Object.entries(read('data/tools-seo.json').tools)) {
    if (JSON.stringify(entry).includes('TODO:')) todo.push(`설명(${id})`);
  }
  for (const [id, words] of Object.entries(aliases)) {
    if (String(words).includes('TODO:')) todo.push(`이름(${id})`);
  }
  if (todo.length) {
    problems.push(
      `아직 자리표시자다 ${todo.length}건 — ${todo.slice(0, 8).join(', ')}` +
        ' (new:tool 이 만든 TODO: 를 진짜 글로 바꿔라 — 그대로 두면 검색 결과에 나간다)'
    );
  }
}

for (const [what, list] of Object.entries(missing)) {
  if (list.length) problems.push(`${what} 없음 ${list.length}개 — ${list.slice(0, 10).join(', ')}${list.length > 10 ? ' …' : ''}`);
}
if (stale.length) problems.push(`없어진 도구의 기록이 남아 있다 ${stale.length}건 — ${stale.slice(0, 8).join(', ')}`);

/* ★ **래칫** (2026-08-16, TASK-KAR-219). 여기는 여태 「하나라도 없으면 빨강」이었다.
   그런데 상세 페이지 정보는 사람이 쓰는 글(설명·순서·자주 묻는 것)이라 한 번에 못 채운다 —
   그래서 **37개가 밀린 채 몇 달 빨갰고**, 늘 빨간 검사는 막는 자리에 못 넣는다. 그 사이
   새 도구가 상세 페이지 없이 들어와도 아무도 못 막았다(그렇게 37까지 불었다).
   톱니는 **조이는 쪽으로만** 돈다: 지금 밀린 수를 기준선으로 박고 **늘면 빨강**.
   갚으면 기준선이 저절로 줄어든다(여기서 다시 써 준다). 목록은 늘 그대로 보여 준다 —
   기준선은 「안 보이게 하는 장치」가 아니라 「안 늘게 하는 장치」다. */
const BASELINE = path.join(root, 'data/tool-data-baseline.json');
const baselineData = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : { note: '상세 페이지 정보가 아직 없는 도구 — 늘면 빨강, 갚으면 저절로 줄어든다', 목록: [] };
const old = new Set(baselineData.목록 || []);
const newlyGrown = seoOrphans.filter((id) => old.has(id) === false);
const repaid = [...old].filter((id) => seoOrphans.includes(id) === false);

if (seoOrphans.length > 0) {
  console.log(`[audit-tool-data] 상세 페이지 정보가 없는 도구 ${seoOrphans.length}개 — ${seoOrphans.join(', ')}`);
  console.log('  (그 도구는 상세 페이지·주소가 안 생긴다 — `data/tools-seo.json` 에 설명·순서·자주 묻는 것을 적어라)');
}
if (repaid.length > 0 || process.argv.includes('--write-baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ ...baselineData, 갱신: new Date().toISOString().slice(0, 10), 목록: seoOrphans }, null, 2)}\n`, 'utf8');
  if (repaid.length > 0) console.log(`[audit-tool-data] ${repaid.length}개를 갚았다 — 기준선을 ${old.size} → ${seoOrphans.length} 로 조인다: ${repaid.join(', ')}`);
}
if (newlyGrown.length > 0 && process.argv.includes('--write-baseline') === false) {
  problems.push(
    `상세 페이지 정보 없이 새로 들어온 도구 ${newlyGrown.length}개 — ${newlyGrown.join(', ')}` +
      ' (기준선에 없던 것이다. 도구를 만들면 `data/tools-seo.json` 도 같은 판에 채워라)'
  );
}

if (problems.length) {
  console.error(`[audit-tool-data] 도구 ${tools.length}개 중 덜 채워진 것이 있다`);
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → `npm run sync:tools` 로 카드·자리를 채우고, 이름은 data/tool-aliases.json 에 한 줄 넣어라');
  process.exit(1);
}
console.log(`[audit-tool-data] 도구 ${tools.length}개 모두 공유 카드·자리 높이·달리 부르는 이름을 갖췄다`);
