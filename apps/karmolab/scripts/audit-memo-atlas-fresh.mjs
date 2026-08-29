#!/usr/bin/env node
/**
 * audit-memo-atlas-fresh. 지형도가 조용히 옛것이 되지 않게 막는다 (TASK-KAR-233).
 *
 * 이 프로젝트는 같은 죽음을 두 번 겪었다. 외장 뇌 캡처는 코드도 살아 있고 배포도
 * 돼 있었는데 석 달간 0건이었다. 돌았나와 실제로 들어왔나는 다른 질문이고,
 * 그 틈에서 조용히 죽는다.
 *
 * 그래서 두 가지를 본다:
 *   ① 구운 지 얼마나 됐나
 *   ② **지금 memo 에 있는 글 수와 지도에 담긴 수가 벌어지지 않았나**
 * 둘째가 핵심이다. 파일 날짜가 최근이어도 내용이 옛것이면 똑같이 거짓말이다.
 *
 * 문턱은 넉넉히 잡는다. 빡빡하게 잡으면 사소한 지연으로 헛울리고, 헛울리는 검사는
 * 곧 무시당해서 없는 것과 같아진다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';
import { collect } from './build-memo-atlas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다**. 지금 memo 와 견줘야 한다.
   그럴 땐 조용히 통과하지 말고 왜 안 도는지 말한다(건너뛴 검사는 통과한 검사가 아니다). */
if (isFake(ATLAS)) {
  console.log('[memo-atlas-fresh] 가짜 지도다. 이 자는 진짜 굽기에서만 잰다 (지금 memo 와 견줘야 한다). 건너뜀');
  process.exit(0);
}

const MAX_AGE_DAYS = 30;      // 한 달 넘게 안 구웠으면 알린다
const MAX_DRIFT = 0.15;       // 글 수가 15% 넘게 벌어지면 알린다

const problems = [];

if (!fs.existsSync(ATLAS)) {
  console.log('[atlas-fresh] 지도가 아직 없다. 굽기 전이라 검사 건너뜀');
  process.exit(0);
}

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const ageDays = Math.floor((Date.now() - fs.statSync(ATLAS).mtimeMs) / 86400000);
if (ageDays > MAX_AGE_DAYS) {
  problems.push(`구운 지 ${ageDays}일 됐다 (${MAX_AGE_DAYS}일 넘음)`);
}

let live = null;
try {
  live = collect().length;
} catch (e) {
  console.log(`[atlas-fresh] 지금 글 수를 못 셌다 (${e.message}). 날짜만 보고 넘어간다`);
}

if (live != null) {
  const inMap = atlas.count || 0;
  const drift = inMap ? Math.abs(live - inMap) / Math.max(live, inMap) : 1;
  if (drift > MAX_DRIFT) {
    problems.push(`지도에 담긴 글 ${inMap}개, 지금 글 ${live}개. ${(drift * 100).toFixed(0)}% 벌어졌다`);
  }
  console.log(`[atlas-fresh] 구운 지 ${ageDays}일, 지도 ${inMap}개 / 지금 ${live}개`);
} else {
  console.log(`[atlas-fresh] 구운 지 ${ageDays}일, 지도 ${atlas.count}개`);
}

/* 자리를 못 잡은 글이 많으면 지도가 반쪽이다. 그것도 조용한 고장이다. */
if (atlas.count && atlas.embedded != null && atlas.embedded < atlas.count * 0.9) {
  problems.push(`자리 잡힌 글이 ${atlas.embedded}/${atlas.count} 뿐. 지도가 반쪽이다`);
}

/* **판마다 기어가지 않나.** 지도를 외우려면 어제 여기 있던 게 오늘도 여기 있어야 한다.
   굽는 자리에서 옛 그림에 포갠 뒤 얼마나 움직였는지 싣는다. 글이 안 바뀌었으면 0 이다
   (2026-08-21: 테두리로 접는 짓을 그만두기 전엔 안 바뀌어도 0.018 씩 기어갔다).
   글이 많이 바뀐 날은 자연히 커지므로 문턱은 넉넉히 둔다. 잡으려는 건 통째로 딴 그림이다. */
const CREEP = 0.15;
/* **글이 새로 들어온 판은 자연히 크게 움직인다**. 자리 잡기가 비선형이라 포개기로도
   못 되돌린다(실측: 글 5편 들어오니 0.33, 같은 글로 다시 구우면 0.000).
   그 둘을 안 가르면 이 자는 새 글이 들어올 때마다 빨개져서 결국 꺼진다.
   **느슨하게 하되 왜 느슨한지 말한다**. 조용히 봐주는 건 안 재는 것과 같다. */
const CREEP_NEW = 0.5;
if (atlas.align && atlas.align.drift != null) {
  const fresh = atlas.align.fresh ?? null;
  /* **손잡이를 바꾼 판은 자리가 통째로 다시 잡힌다**. 포개기로도 못 되돌린다.
     그건 조용히 기어간 게 아니라 우리가 바꾼 것이다. 그 판만 느슨하게 보되
     **무엇이 바뀌었는지 말한다**(조용히 봐주면 안 재는 것과 같다). */
  const knobs = atlas.align.knobsChanged ? atlas.align : null;
  const line = (fresh || knobs) ? CREEP_NEW : CREEP;
  console.log(`[atlas-fresh] 지난 판에서 옮겨 앉은 정도 ${atlas.align.drift} (겹치는 글 ${atlas.align.shared}개`
    + (fresh == null ? ', 새 글 몇인지 안 실림' : `, 새 글 ${fresh}개`) + ')'
    + (fresh ? `. 새 글이 들어온 판이라 문턱을 ${line} 로 둔다` : '')
    + (knobs ? `. 자리잡기 손잡이를 ${knobs.before} → ${knobs.knobs} 로 바꾼 판이라 문턱을 ${line} 로 둔다` : ''));
  if (atlas.align.drift > line) {
    problems.push(`지도가 지난 판과 ${atlas.align.drift} 어긋난다 (문턱 ${line}). 어제 외운 자리가 사라졌다`);
  }
}

if (problems.length) {
  console.log('[atlas-fresh] **지형도가 옛것이다**');
  for (const p of problems) console.log(`  - ${p}`);
  console.log('  다시 구워라: node scripts/build-memo-atlas.mjs');
  process.exit(1);
}

console.log('[atlas-fresh] 지형도가 지금 글을 담고 있다');
