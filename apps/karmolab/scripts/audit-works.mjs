/**
 * **작업물 목록이 조용히 썩는 것**을 막는다 (change.blog-surfaces-as-widgets ②).
 *
 * 이 목록은 사람이 손으로 쌓아 온 것이라, 깨져도 아무도 안 알려 줬다. 실제로 있었던 일:
 *   - 컷오버 때 따옴표 붙은 url, 바깥 링크를 파서가 흘려 카드 3장이 **말없이** 사라졌다
 *   - 때가 `2411~`, `2311, 2411.`, `Last Update : 250511.` 처럼 제각각이라 정렬이 안 됐다
 *   - 카드가 가리키는 글이 사라져도 그 자리는 그냥 빠질 뿐, 티가 안 났다
 *
 * 그래서 배포 산출(`data/works.json`)을 놓고 넷을 센다:
 *   ① 때(`at`)가 없는 항목       . 정렬, 연도 묶음에서 통째로 빠진다
 *   ② 갈래(`field`)가 없는 항목     . 지도에서 설 자리가 없다 (소속은 비어도 된다)
 *   ③ 안쪽 링크인데 그 장이 안 찍힌 것. 누르면 404
 *   ④ 소품 목록이 통째로 비었을 때 . 목록 글의 적는 꼴이 바뀐 것이다
 *
 * ①③④ 는 막고, ② 는 사람이 채워야 하는 값이라 세어서 알리기만 한다.
 * 사용: node scripts/audit-works.mjs   (npm run audit:works)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(APP_ROOT, 'data', 'works.json');
const PAGES = path.join(APP_ROOT, 'content', 'pages', 'posts');

if (!fs.existsSync(DATA)) {
    console.log('[audit-works] 못 돌림. data/works.json 이 없다 (`npm run gen:post-pages` 먼저)');
    process.exit(0);
}

const { works = [], minor = [] } = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const noWhen = works.filter((w) => !w.at);
/* 갈래(field)는 **반드시** 있어야 한다. 지도의 자리가 그것으로 정해진다.
   소속(org)은 안 적을 수 있다(왁타 밖 의뢰 등). 그건 빠진 게 아니라 그렇게 정한 것이다. */
const noField = works.filter((w) => !w.field);
const noOrg = works.filter((w) => w.org === '미정');
const dead = fs.existsSync(PAGES)
    ? works.filter((w) => w.slug && !fs.existsSync(path.join(PAGES, w.slug, 'index.html')))
    : [];

console.log(`[audit-works] 작업물 ${works.length}건, 소품 ${minor.length}건`);
const fail = [];
if (noWhen.length) fail.push(`때가 없는 항목 ${noWhen.length}건: ${noWhen.map((w) => w.title).join(', ')}`);
if (noField.length) fail.push(`갈래가 없는 항목 ${noField.length}건: ${noField.map((w) => w.title).join(', ')}`);
if (dead.length) fail.push(`가리키는 장이 없는 항목 ${dead.length}건: ${dead.map((w) => w.slug).join(', ')}`);
if (works.length && !minor.length) fail.push('소품 목록이 0건. 목록 글의 적는 꼴이 바뀌었을 수 있다');

if (noOrg.length) {
    console.log(`  ⚠ 소속이 미정인 것 ${noOrg.length}건. 글 frontmatter 의 \`work.org\` 를 채우거나 지워라`);
    for (const w of noOrg) console.log(`      ${w.slug ?? w.url}. ${w.title}`);
}
if (fail.length) {
    for (const line of fail) console.error(`  ✗ ${line}`);
    process.exit(1);
}
console.log('  ✓ 때, 링크, 소품 이상 없음');
