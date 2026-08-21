#!/usr/bin/env node
/**
 * 옛말을 얼마나 잘 불러오나 — **점수판**.
 *
 * TASK-KAR-236 § 재는 판. 지금까지 회상은 「되는 것 같다/안 되는 것 같다」로만 말했다.
 * 105·106·107·110·111회차가 전부 회상 재료를 손댔는데, 그게 나아졌는지 **숫자가 없었다.**
 *
 * 밖에서는 이걸 LoCoMo·LongMemEval 로 잰다(원장 2026-08-21). 그건 영어 판이라 그대로
 * 못 쓴다. 그래서 **우리 판**을 둔다 — 짝 하나는 「옛날에 오간 말」과 「나중에 그걸 가리키는
 * 물음」이고, 물음에는 **옛말의 낱말이 되도록 안 겹치게** 넣었다. 낱말이 겹치면 낱말 회상만으로
 * 맞으니 잰 값이 부풀려진다.
 *
 * 쓰는 법:
 *   node scripts/measure-recall.mjs            낱말 회상만 (빠르다)
 *   node scripts/measure-recall.mjs --meaning  뜻 색인까지 (모델을 띄우느라 수십 초)
 */
import { recallFrom, meaningMemory, measureWithSmallModel } from '../dist/index.js';

/** [옛말(조수님), 나중 물음, 겹치는 낱말이 있나] */
const pairs = [
  ['마라탕 같은 거 진짜 못 먹어', '자극적인 거 싫다고 했던 게 뭐였더라', false],
  ['커피는 하루 세 잔은 마셔', '카페인 얼마나 마신다고 했지', false],
  ['오늘 회의가 세 개나 있었어', '회의 몇 개라 그랬지', true],
  ['유니티로 게임 만들고 있어', '유니티 얘기 언제 했더라', true],
  ['밤에 작업하는 게 편해', '주로 언제 일한다고 했더라', false],
  ['발표 준비를 많이 했는데 떨렸어', '발표 얘기 다시 생각난다', true],
  ['고양이 알레르기가 있어', '고양이 얘기 했었나', true],
  ['노트북이 자꾸 뜨거워져', '노트북 문제 얘기했던 거', true],
  ['다음 주에 이사 가', '이사 언제라고 했지', true],
  ['운동은 잘 안 하게 되더라', '운동 얘기 나왔었나', true],
];

const rows = [];
let at = Date.now() - 30 * 24 * 3600_000;
for (const [old] of pairs) {
  rows.push({ role: 'sensed', channel: 'web', text: old, at });
  at += 3600_000;
}
// 사이사이 잡담을 섞는다 — 진짜 대화는 찾을 것만 들어 있지 않다.
for (let i = 0; i < 40; i += 1) {
  rows.push({ role: 'sensed', channel: 'web', text: `그냥 잡담 ${i} 오늘 날씨 얘기`, at: (at += 60_000) });
}

/** 낱말이 든 줄을 돌려준다 — 진짜 기억이 하는 것과 같은 얕은 찾기. */
const search = (word, limit) => rows.filter((r) => r.text.includes(word)).slice(0, limit);
const recall = recallFrom(search);

let hit = 0;
let hitWhenNoOverlap = 0;
let noOverlap = 0;
const misses = [];
for (const [old, question, overlaps] of pairs) {
  const found = recall({ text: question }, []);
  const ok = found.some((line) => line.includes(old));
  if (ok) hit += 1;
  if (overlaps === false) {
    noOverlap += 1;
    if (ok) hitWhenNoOverlap += 1;
    else misses.push(question);
  } else if (ok === false) {
    misses.push(question);
  }
}

/* 뜻 회상까지 재려면 모델을 띄워야 한다 — 수십 초 걸리므로 물어볼 때만 켠다.
   94회차에 넣은 그 장치가 「낱말이 안 겹치는」 자리를 얼마나 메우는지가 이 판의 핵심이다. */
const withMeaning = process.argv.includes('--meaning');
let meaningHit = 0;
/** 낱말로도 뜻으로도 못 찾은 물음 — 둘을 합쳐야 진짜 체감이다. */
const stillMissing = [];
const meaningFound = [];
if (withMeaning) {
  const meaning = new meaningMemory({
    measure: measureWithSmallModel({ log: (m) => console.log(`[뜻] ${m}`) }),
    log: (m) => console.log(`[뜻] ${m}`),
  });
  /* **점수판은 기다린다.** 뜻 재는 자리는 「기다리게 하지 않는다」가 설계라(94회차)
     준비 전에는 조용히 아무것도 안 담는다. 대화에서는 그게 맞지만 재는 자리에서는
     안 기다리면 **0점이 나오고 그걸 실력으로 착각한다** (116회차에 실제로 그랬다). */
  const until = Date.now() + 180_000;
  let stored = 0;
  while (stored === 0 && Date.now() < until) {
    stored = await meaning.store(rows);
    if (stored === 0) await new Promise((done) => setTimeout(done, 2000));
  }
  console.log(`[뜻] 담긴 줄 ${stored}`);
  for (const [old, question, overlaps] of pairs) {
    if (overlaps !== false) continue;
    const found2 = await meaning.find(question, { count: 3, toDrop: new Set() });
    const ok2 = found2.some((row) => row.text.includes(old));
    if (ok2) { meaningHit += 1; meaningFound.push(question); }
  }
}

const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
console.log(`[회상] 전체 ${hit}/${pairs.length} (${pct(hit, pairs.length)})`);
console.log(`[회상] 낱말이 안 겹치는 것만 ${hitWhenNoOverlap}/${noOverlap} (${pct(hitWhenNoOverlap, noOverlap)})`);
if (misses.length > 0) console.log(`[회상] 못 찾은 물음:\n${misses.map((m) => `  - ${m}`).join('\n')}`);
if (withMeaning) {
  console.log(`[회상] 뜻으로 찾기 — 낱말이 안 겹치는 것 ${meaningHit}/${noOverlap} (${pct(meaningHit, noOverlap)})`);
  /* 둘 중 하나라도 찾으면 사람은 「기억한다」고 느낀다 — 그게 체감치다. */
  const both = new Set([...meaningFound, ...pairs.filter(([, q, o]) => o === false && misses.includes(q) === false).map(([, q]) => q)]);
  console.log(`[회상] 낱말·뜻 **합쳐서** — 낱말이 안 겹치는 것 ${both.size}/${noOverlap} (${pct(both.size, noOverlap)})`);
  const left = pairs.filter(([, q, o]) => o === false && both.has(q) === false).map(([, q]) => q);
  if (left.length > 0) console.log(`[회상] 둘 다 못 찾은 것:
${left.map((m) => `  - ${m}`).join('\n')}`);
} else {
  console.log('[회상] 뜻 색인은 안 켰다 — 낱말 회상만 잰 값이다 (--meaning 으로 켠다).');
}
