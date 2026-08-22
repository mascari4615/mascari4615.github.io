#!/usr/bin/env node
/**
 * audit-atlas-lane-bias — 지도가 뜻이 아니라 **출신**으로 갈리고 있는지 본다.
 *
 * 서로 다른 데서 온 글을 한 지도에 놓으면, 뜻이 아니라 「어디서 왔나」로 뭉치는 일이
 * 흔하다. 그림엔 덩어리가 예쁘게 갈리니 사람 눈으로는 못 알아챈다.
 *
 * 이게 무너지면 이 지도의 목적 하나가 통째로 사라진다 — 바깥에서 주운 것과 내가 쓴
 * 것이 **겹치는 자리**를 보려는 건데, 갈래끼리 뭉치면 겹칠 일이 없어진다.
 *
 * 재는 법: 덩어리마다 「한 갈래가 몇 %를 차지하나」. 한 갈래가 통째로 차지한 덩어리가
 * 많으면 뜻이 아니라 출신으로 갈린 것이다. 다만 갈래가 하나뿐인 자료도 있으므로,
 * **갈래가 둘 이상일 때만** 따진다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS)) {
  console.log('[lane-bias] 지도가 아직 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const lanes = new Set(atlas.docs.map((d) => d.lane));
if (lanes.size < 2) {
  console.log('[lane-bias] 갈래가 하나뿐 — 따질 것이 없다');
  process.exit(0);
}

/* 가장 성긴 층에서 본다. 촘촘한 층은 원래 잘게 갈리므로 한 갈래가 차지하기 쉽다. */
const names = atlas.levels?.[0]?.names || atlas.clusterNames || [];
const tally = new Map();
for (const d of atlas.docs) {
  const c = d.levels ? d.levels[0] : d.cluster;
  if (c == null) continue;
  const m = tally.get(c) || new Map();
  m.set(d.lane, (m.get(d.lane) || 0) + 1);
  tally.set(c, m);
}

const TOO_PURE = 0.9;          // 한 갈래가 90% 넘게 차지하면 「출신으로 갈렸다」
const SMALL = 20;              // 아주 작은 덩어리는 우연히 순수해질 수 있다 — 안 따진다
const rows = [];
for (const [c, m] of tally) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const top = Math.max(...m.values());
  const share = top / total;
  const who = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  rows.push({ c, name: names[c] || `덩어리 ${c}`, total, share, who });
}
rows.sort((a, b) => b.share - a.share);
for (const r of rows) {
  console.log(`[lane-bias] ${r.name.padEnd(18)} ${String(r.total).padStart(4)}개 · 한 갈래(${r.who}) ${(r.share * 100).toFixed(0)}%`);
}

const bad = rows.filter((r) => r.total >= SMALL && r.share > TOO_PURE);
const mean = rows.reduce((a, r) => a + r.share, 0) / rows.length;
console.log(`[lane-bias] 평균 순도 ${(mean * 100).toFixed(1)}% · 한 갈래가 ${TOO_PURE * 100}% 넘는 덩어리 ${bad.length}/${rows.length}`);

/* **개수가 아니라 평균으로 본다.** 개수는 경계에서 튄다 — 89%·86% 짜리가 54%·53% 로
   크게 좋아졌는데도 상위 둘이 90 을 넘겨 「나빠졌다」로 뒤집힌 적이 있다(2026-08-21).
   평균은 그런 뒤집힘이 없다. 몇 개쯤 순수한 건 자연스럽다 — 그 갈래에만 있는 주제가
   실제로 있기 때문이다. */
const TOO_PURE_MEAN = 0.8;
if (mean > TOO_PURE_MEAN) {
  console.log('[lane-bias] **지도가 뜻이 아니라 출신으로 갈리고 있다**');
  console.log(`  덩어리 하나를 한 갈래가 평균 ${(mean * 100).toFixed(1)}% 차지한다.`);
  for (const r of bad) console.log(`  - ${r.name}: ${r.who} 가 ${(r.share * 100).toFixed(0)}%`);
  console.log('  갈래별 평균을 빼는 보정을 켜거나, 짧은 글이 자기들끼리 뭉치는지 확인해라.');
  process.exit(1);
}
console.log('[lane-bias] 갈래가 덩어리를 가로채지 않는다');
