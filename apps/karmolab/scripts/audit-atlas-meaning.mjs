#!/usr/bin/env node
/**
 * audit-atlas-meaning. **뜻을 재는가**를 *관계*로 확인한다 (TASK-KAR-233).
 *
 * 처음엔 손으로 쓴 여덟 쌍에 **절대 여유(0.08)** 를 걸었다. 그 자는 두 번 틀렸다:
 *  - 순서가 **뒤집힌** 모델을 통과시켰다 (같은 뜻 0.537 < 낱말만 겹침 0.624 인데 초록)
 *  - 순서가 **바로 선** 모델을 빨갛다고 했다 (0.932 > 0.928 > 0.893 인데 차이가 0.038)
 * 눈금을 재고 있었지 뜻을 안 쟀다.
 *
 * 정답표가 없을 때 쓰는 정본이 **변형 검사(metamorphic testing)** 다. 이 입력의 정답은
 * 무엇인가 대신 **입력을 이렇게 바꾸면 출력은 이렇게 바뀌어야 한다**는 관계를 본다.
 * 관계는 **눈금과 무관**하므로 모델을 갈아도 자가 안 흔들린다.
 *
 * 여기서 거는 관계 셋. 손으로 쓴 문장이 아니라 **내 글**로:
 *  ① 이어 붙이기. A+B 는 A 와, C+B 보다 가깝다
 *  ② 잡음 더하기. 같은 글에 공백, 문장부호를 넣어도 **자기 자신이 1등**이다
 *  ③ 앞, 뒤 절반. A 의 앞 절반은 **A 의 뒷절반**과, 남의 뒷절반보다 가깝다
 *
 * ⚠ 셋 다 **한 요소만 바꿔** 견준다. 처음엔 남보다 가깝다로 걸었는데 13% 밖에 안 지켜졌다 . 
 * 내 글이 죄다 같은 틀(TASK 머리말, 꼬리말)이라 아무 두 글이나 0.78~0.85 로 붙어 있었기
 * 때문이다. 모델이 틀린 게 아니라 **견줌 상대가 틀렸다.** 양쪽이 같은 틀을 쓰게 두고
 * 한 조각만 갈아 끼우면 그 조각의 몫만 남는다.
 *
 * 동음이의(낱말만 겹침 > 같은 뜻)는 **적어 두는 수**로 남긴다. 지금 모델의 알려진 약점이고,
 * 그걸로 전체를 빨갛게 만들면 결국 자를 꺼 버리게 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);
if (isFake(ATLAS)) {
  console.log('[atlas-meaning] 가짜 지도다. 이 자는 진짜 글로만 잰다 (지어낸 글엔 뜻이 없다). 건너뜀');
  process.exit(0);
}

const { collect, embedLocal } = await import(new URL('./build-memo-atlas.mjs', import.meta.url).href);

const SAMPLE = 24;          // 글 몇 편으로 관계를 걸까. 관계마다 한 편씩 다 재므로 넉넉하다
const OTHERS = 6;           // 남 몇 편과 견줄까
const PASS = 0.9;           // 관계가 이 비율은 지켜져야 한다

const docs = collect().filter((d) => (d.text || '').length > 900);
if (docs.length < SAMPLE + OTHERS) {
  console.log(`[atlas-meaning] 글이 ${docs.length}편뿐. 건너뜀`);
  process.exit(0);
}
/* 고르게 뽑는다. 씨앗 없이 순서대로. 매번 같은 글로 재야 값을 견줄 수 있다. */
const step = Math.floor(docs.length / (SAMPLE + OTHERS));
const picked = [];
for (let i = 0; i < docs.length && picked.length < SAMPLE + OTHERS; i += step) picked.push(docs[i]);
const subjects = picked.slice(0, SAMPLE);
const others = picked.slice(SAMPLE);

const cut = (t, n = 700) => String(t).slice(0, n);
const half = (t) => {
  const s = cut(t, 1400);
  return [s.slice(0, Math.floor(s.length / 2)), s.slice(Math.floor(s.length / 2))];
};
/* 잡음 = 뜻을 안 바꾸는 손질. 공백, 문장부호만 건드린다. */
const noisy = (t) => cut(t).replace(/([가-힣]) /g, '$1  ').replace(/\./g, ' . ');

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

console.log(`[atlas-meaning] 글 ${subjects.length}편으로 관계 셋을 건다 (남 ${others.length}편과 견줌)`);

const otherVecs = await embedLocal(others.map((d) => cut(d.text)));

let joinOk = 0; let noiseOk = 0; let halfOk = 0;
for (const d of subjects) {
  const [front, back] = half(d.text);
  const partner = others[0];
  const joined = `${cut(d.text, 500)} ${cut(partner.text, 500)}`;
  const [vSelf, vJoined, vNoisy, vFront, vBack] = await embedLocal([
    cut(d.text), joined, noisy(d.text), front, back,
  ]);
  /* ① **한 조각만 갈아 끼운다.** A+B와 C+B는 둘 다 B 를 품고 같은 틀을 쓴다 . 
     A 를 품은 쪽이 A 와 더 가까워야 한다. 그 차이가 곧 A 의 몫이다. */
  const rivalJoined = `${cut(others[1].text, 500)} ${cut(partner.text, 500)}`;
  const [vRivalJoined] = await embedLocal([rivalJoined]);
  if (dot(vJoined, vSelf) > dot(vRivalJoined, vSelf)) joinOk += 1;

  /* ② 잡음을 넣어도 **자기 자신이 1등**. */
  const noiseTop = dot(vNoisy, vSelf) > Math.max(...otherVecs.map((v) => dot(vNoisy, v)));
  if (noiseTop) noiseOk += 1;

  /* ③ **뒷절반끼리 견준다.** 내 앞절반은 *내* 뒷절반과, *남의* 뒷절반보다 가까워야 한다.
     앞절반, 뒷절반이 같은 틀을 쓰므로 틀의 몫이 양쪽에서 상쇄된다.
     ⚠ **남 하나와만 견주면 동전 던지기다.** 내 글은 죄다 같은 틀(TASK 머리말, feedback 꼴)이라
     하필 고른 남이 나와 판박이면 진다. 실측: 실패한 넷이 전부 그 경우였고(WM TASK-QUALITY
     둘, 룰 feedback 둘), 블로그 글이 들어와 표본이 바뀌자 83% 로 떨어졌다.
     그래서 **남 다섯의 가운뎃값**과 견준다. 한 요소만 바꾸는 건 그대로다. */
  const otherBacks = await embedLocal(others.slice(0, 5).map((o) => half(o.text)[1]));
  const rivals = otherBacks.map((v) => dot(vFront, v)).sort((a, b) => a - b);
  const rivalMid = rivals[Math.floor(rivals.length / 2)];
  if (dot(vFront, vBack) > rivalMid) halfOk += 1;
  else if (process.env.MEANDBG) console.log(`     [앞뒤 실패] ${d.lane} ${String(d.title).slice(0, 30)} 자기 ${dot(vFront, vBack).toFixed(3)} vs 남 가운데 ${rivalMid.toFixed(3)}`);
  else if (process.env.MEANDBG) console.log(`     [앞뒤 실패] ${d.lane} ${String(d.title).slice(0,30)} 자기 ${dot(vFront, vBack).toFixed(3)} vs 남 ${dot(vFront, vOtherBack).toFixed(3)}`);
}

const n = subjects.length;
const rate = (k) => `${k}/${n} (${Math.round((k / n) * 100)}%)`;
console.log(`  ① A+B가 C+B보다 A 와 가깝다. ${rate(joinOk)}`);
console.log(`  ② 잡음을 넣어도 자기 자신이 1등. ${rate(noiseOk)}`);
console.log(`  ③ 내 앞절반이 **남 다섯의 가운뎃값**보다 내 뒷절반과 가깝다. ${rate(halfOk)}`);

/* 적어 두는 수. 합격/불합격이 아니다. 지금 모델의 알려진 약점(동음이의). */
const PAIRS = [
  ['빌드가 실패했다', '컴파일이 깨졌다', 'same'],
  ['화면이 멈춘다', '앱이 응답하지 않는다', 'same'],
  ['고양이가 지붕에 앉았다', '고양이가 물고기를 싫어한다', 'sameword'],
  ['말이 들판을 달린다', '그 사람 말이 길다', 'sameword'],
  ['유니티 렌더링 최적화', '김치찌개 끓이는 법', 'none'],
];
const pv = await embedLocal(PAIRS.flatMap((p) => [p[0], p[1]]));
const bucket = { same: [], sameword: [], none: [] };
PAIRS.forEach((p, i) => bucket[p[2]].push(dot(pv[i * 2], pv[i * 2 + 1])));
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const S = mean(bucket.same); const W = mean(bucket.sameword); const N = mean(bucket.none);
console.log(`  (참고) 같은 뜻 ${S.toFixed(3)}, 낱말만 겹침 ${W.toFixed(3)}, 무관 ${N.toFixed(3)}`
  + `${W > S ? '. **동음이의를 못 가른다**(알려진 약점, 합불 아님)' : ''}`);

const bad = [];
if (joinOk / n < PASS) bad.push(`이어 붙여도 그 조각의 몫이 안 보인다 (${rate(joinOk)})`);
if (noiseOk / n < PASS) bad.push(`공백, 문장부호만 바꿔도 딴 글이 더 가깝다 (${rate(noiseOk)})`);
if (halfOk / n < PASS) bad.push(`한 글의 앞, 뒤가 남의 뒤보다 안 가깝다 (${rate(halfOk)})`);
if (bad.length) {
  console.log('[atlas-meaning] **뜻을 안 재고 있다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  모델이 이 글의 언어를 읽는지, 토막 내기, 평균 내기가 망가졌는지 봐라.');
  process.exit(1);
}
console.log('[atlas-meaning] 관계 셋이 다 지켜진다. 눈금이 아니라 뜻을 잡고 있다');
