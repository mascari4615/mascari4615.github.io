#!/usr/bin/env node
/**
 * audit-atlas-lonely. **어디에도 안 붙는 글이 새 렌즈인가** (TASK-KAR-233).
 *
 * 렌즈를 하나 더 다는 건 쉽다. 어려운 건 **그게 이미 있는 렌즈와 다른 걸 비추는지**다.
 * 우리는 이미 묻힌 글(시간 기준)을 갖고 있다. 새 렌즈가 같은 글을 다시 비추면
 * 단추만 하나 늘고 보는 사람은 헷갈린다.
 *
 * 그리고 처음 돌렸을 때 실제로 그랬다. 상위 12개 중 6개가 **링크뿐인 글**이었다.
 * 재료가 없으니 당연히 혼자 떨어진다. 그건 본문이 없다를 다시 찾아낸 것이다.
 *
 * 그래서 셋을 본다:
 *  ① 뽑힌 글에 **본문 얇은 글이 끼지 않았나** (그러면 뜻이 아니라 길이를 잰 것이다)
 *  ② 묻힌 글과 **너무 겹치지 않나** (겹치면 새 렌즈가 아니다)
 *  ③ 실린 값이 다시 재도 맞나
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS)) {
  console.log('[lonely] 지도가 아직 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const st = atlas.lonelyStat;
const docs = atlas.docs || [];
const lonely = docs.filter((d) => d.lonely);

if (!st) {
  console.log('[lonely] 요약이 안 실려 있다. 굽는 쪽에서 안 돌았나');
  process.exit(1);
}
/* 렌즈 접음. 굽는 쪽이 묻힌 글과 겹친다(문턱 1/3)로 표시를 거둔 상태. 그게 바로
   이 자가 요구하는 대응이다. 수가 정말 문턱 위인지, 표시가 정말 걷혔는지만 확인한다. */
if (st.folded) {
  const F = st.folded;
  if (!(F.marked > 0 && F.overlapBuried / F.marked > 1 / 3)) {
    console.log(`[lonely] **접었다는데 수는 문턱 아래다** (겹침 ${F.overlapBuried}/${F.marked})`);
    process.exit(1);
  }
  if (lonely.length) {
    console.log(`[lonely] **접었다면서 표시가 ${lonely.length}개 남아 있다**`);
    process.exit(1);
  }
  console.log(`[lonely] 렌즈 접음. 묻힌 글과 ${F.overlapBuried}/${F.marked} 겹쳐 새 렌즈가 아니었다 (표시 0개)`);
  process.exit(0);
}
console.log(`[lonely] 혼자 있는 글 ${lonely.length}개 (후보 ${st.candidates}, 문턱 ${st.cut}, 이웃 ${st.k})`);
if (!lonely.length) {
  console.log('[lonely] **하나도 안 뽑혔다**. 단추를 켜도 아무것도 안 나온다');
  process.exit(1);
}
if (lonely.length !== st.marked) {
  console.log(`[lonely] **요약(${st.marked})과 실제(${lonely.length})가 다르다**`);
  process.exit(1);
}

/* ① 본문 얇은 글이 끼면 그건 뜻이 아니라 길이를 잰 것이다. */
const thin = lonely.filter((d) => (d.bytes || 0) < st.minBytes);
console.log(`[lonely] 본문 ${st.minBytes}자 미만인 글이 낀 것 ${thin.length}개`);
if (thin.length) {
  console.log('[lonely] **재료가 얇아서 혼자인 글이 끼었다**');
  for (const d of thin.slice(0, 5)) console.log(`  - ${d.bytes}자, ${String(d.title).slice(0, 40)}`);
  console.log('  LONELY_MIN_BYTES 로 거르는 자리가 빠졌는지 봐라.');
  process.exit(1);
}

/* ② 시간 기준(묻힌 글)과 얼마나 겹치나. 겹침이 크면 새 렌즈가 아니다. */
const both = lonely.filter((d) => d.buried).length;
const share = both / lonely.length;
console.log(`[lonely] 묻힌 글과 겹치는 것 ${both}/${lonely.length} (${(share * 100).toFixed(0)}%)`);
const TOO_SAME = 1 / 3;
if (share > TOO_SAME) {
  console.log('[lonely] **묻힌 글과 거의 같은 것을 비추고 있다**. 렌즈가 하나 늘 이유가 없다');
  process.exit(1);
}

/* ③ 값이 순서를 지키나. 뽑힌 글은 모두 문턱 위여야 하고, 안 뽑힌 글은 아래여야 한다. */
const wrongIn = lonely.filter((d) => (d.alone ?? 0) < st.cut).length;
const wrongOut = docs.filter((d) => !d.lonely && d.alone != null && d.alone > st.cut).length;
if (wrongIn || wrongOut) {
  console.log('[lonely] **문턱과 표시가 어긋난다**');
  console.log(`  문턱 아래인데 뽑힌 글 ${wrongIn}개, 문턱 위인데 안 뽑힌 글 ${wrongOut}개`);
  process.exit(1);
}
console.log('[lonely] 얇은 글이 아니라 뜻으로 혼자인 글을 비추고 있다');
