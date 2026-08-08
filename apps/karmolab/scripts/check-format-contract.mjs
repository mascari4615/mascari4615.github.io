/**
 * 형식 규약 게이트 (TASK-KL-191 축6) — 「무엇을 받고 무엇을 내놓나」는 **한 군데에만** 적힌다.
 *
 * 왜 필요한가 (실측):
 *   `exifclean` 은 등록 메타에 `accepts: ['image/jpeg']` 라고 적어 두고, 코드에서는
 *   `onHandoff(['image/*'], …)` 로 아무 그림이나 받고 있었다. 둘이 갈라져도 아무도 안 아프다 —
 *   「이어서」 줄은 메타를 보고 고르고, 실제로 받는 것은 코드가 정하니까. 손으로 두 벌 적은
 *   표는 반드시 샌다. 그래서 코드에서 형식 배열을 없애고 **도구 이름만** 대게 했다.
 *
 * 이 게이트가 막는 것:
 *   ① 결과를 내놓으면서(`offerNext`) `produces` 를 안 적은 도구
 *   ② 받으면서(`onHandoff`) `accepts` 를 안 적은 도구
 *   ③ `onHandoff` 에 형식 배열을 **다시** 손으로 적는 것 (드리프트가 돌아오는 길)
 *   ④ 남의 이름을 대는 것 — `onHandoff('pdfcrop')` 인데 파일은 `pdfsign.ts`
 *   ⑤ `offerNext({ from })` 이 자기 이름이 아닌 것 (규약 감사가 엉뚱한 도구를 가리킨다)
 *
 * 못 막는 것: 적힌 **값**이 맞는지. 그건 정적으로 못 본다 — 실물이 지나가는 자리
 * (`toolbox.ts` 의 `offerNext`)에서 선언과 다른 형식이 나오면 그 자리에서 경고한다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const META = path.join(ROOT, 'src/widgets-lazy-meta.ts');
const TOOLS_DIR = path.join(ROOT, 'src/widgets/tools');

/** 메타에서 `id` 별 `accepts`/`produces` 선언 여부를 읽는다 (블록 단위 — 정규식 하나로 전체를 훑으면 이웃 도구 것을 집는다). */
function readDeclarations(source) {
  const out = new Map();
  const idRe = /^\s{4}id: '([a-z0-9-]+)',?$/gm;
  const marks = [...source.matchAll(idRe)];
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : source.length;
    const block = source.slice(start, end);
    out.set(marks[i][1], {
      accepts: /^\s*accepts: \[/m.test(block),
      produces: /^\s*produces: \[/m.test(block),
    });
  }
  return out;
}

const meta = readDeclarations(fs.readFileSync(META, 'utf-8'));
const problems = [];
let producers = 0;
let consumers = 0;

for (const file of fs.readdirSync(TOOLS_DIR).sort()) {
  if (!file.endsWith('.ts')) continue;
  const id = file.replace(/\.ts$/, '');
  const source = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8');
  const declared = meta.get(id);

  // ③ 형식 배열을 코드에 다시 적는 길을 막는다
  if (/onHandoff\?*\.?\(\s*\[/.test(source)) {
    problems.push(`${file}: onHandoff 에 형식 배열을 적었다 — 도구 이름 '${id}' 만 대라 (형식은 메타가 정본)`);
    continue;
  }

  const handoff = source.match(/onHandoff\?*\.?\(\s*'([a-z0-9-]+)'/);
  if (handoff) {
    consumers += 1;
    if (handoff[1] !== id) {
      problems.push(`${file}: onHandoff('${handoff[1]}') — 이 파일의 도구는 '${id}' 다`);
    } else if (!declared) {
      problems.push(`${file}: 등록 메타에 '${id}' 가 없다`);
    } else if (!declared.accepts) {
      problems.push(`${file}: 받는데(onHandoff) 메타에 accepts 선언이 없다`);
    }
  }

  const offers = [...source.matchAll(/offerNext\?*\.?\([^)]*from:\s*'([a-z0-9-]+)'/g)];
  if (offers.length) {
    producers += 1;
    for (const offer of offers) {
      if (offer[1] !== id) problems.push(`${file}: offerNext({ from: '${offer[1]}' }) — 이 파일의 도구는 '${id}' 다`);
    }
    if (!declared) problems.push(`${file}: 등록 메타에 '${id}' 가 없다`);
    else if (!declared.produces) problems.push(`${file}: 결과를 내놓는데(offerNext) 메타에 produces 선언이 없다`);
  }
}

/* 게이트가 **0건을 통과로 보고** 하면 그건 게이트가 아니라 장식이다.
 * 찾은 것이 하나도 없다 = 정규식이 낡았거나 파일을 못 찾은 것이다. */
if (producers === 0 || consumers === 0) {
  console.error(`❌ 형식 규약: 검사 대상을 못 찾았다 (내놓는 도구 ${producers} · 받는 도구 ${consumers}) — 게이트가 낡았다`);
  process.exit(1);
}

if (problems.length) {
  console.error('❌ 형식 규약 어긋남:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}

console.log(`✅ 형식 규약: 내놓는 도구 ${producers}개 · 받는 도구 ${consumers}개 — 선언이 전부 메타 한 군데에 있다`);
