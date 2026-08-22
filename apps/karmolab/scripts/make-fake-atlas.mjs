#!/usr/bin/env node
/**
 * 가짜 지도를 굽는다 — **자들이 CI 에서도 돌게** (TASK-KAR-233).
 *
 * 진짜 지도는 레포에 못 담는다(글 제목·경로가 다 들어 있다). 그래서 CI 에서 자 스물 중
 * 열아홉이 「지도가 없다」며 건너뛰었다. 재료가 없으면 자는 아무것도 안 잰다.
 *
 * 여기서 만드는 것은 **한 글자도 진짜가 아닌** 지도다 — 제목·경로·낱말을 지어내고,
 * 자리는 몇 개 무리로 흩뿌린다. 벡터도 같이 만들어 뜻을 재는 자들이 돌게 한다.
 * 진짜 지도가 있으면 자는 그걸 보고, 없을 때만 이것을 본다(`lib/atlas-file.mjs`).
 *
 * 씨앗을 박아 **매번 같은 가짜**가 나온다 — 판마다 다르면 자가 들쭉날쭉해진다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'memo-atlas-fake.json');
const OUT_CACHE = path.join(HERE, '..', 'data', 'memo-atlas-fake-cache.json');

let seed = 20260821;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const gauss = () => {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
};
const pick = (a) => a[Math.floor(rnd() * a.length)];

/* 지어낸 낱말들. 뜻이 없어야 한다 — 진짜 글에서 가져오면 그게 곧 유출이다. */
const HEAD = ['가랑', '노루', '두벌', '마름', '바지', '사슴', '아람', '자갈', '차돌', '파랑'];
const TAIL = ['나루', '더미', '무늬', '바람', '수레', '이끼', '자락', '터널', '허리', '고개'];
const LANES = ['갈래하나', '갈래둘', '갈래셋', '갈래넷'];
const GROUPS = 6;          // 무리 여섯 = 성긴 층과 같은 수
const PER = 80;            /* 무리마다 여든 글. **성기면 자가 못 잰다** — 156글로 만들었더니
                              「당기면 이름이 사라지나」 자가 「글 10개 넘는 자리를 못 찾았다」로
                              빨개졌다. 가짜도 재는 데 필요한 만큼은 촘촘해야 한다. */
const DIM = 24;            // 벡터 길이 — 진짜(384)보다 짧아도 재는 데는 충분하다

const docs = [];
const vectors = [];
for (let g = 0; g < GROUPS; g += 1) {
  /* 무리마다 자기 낱말 둘을 갖는다 — 이름 짓기·견주기 자가 「이 무리만 쓰는 말」을 찾을 수 있게. */
  const own = [`${HEAD[g]} ${TAIL[g]}`, `${HEAD[(g + 3) % HEAD.length]}터`];
  /* 무리를 고리로 놓되 반지름을 줄여 **가운데도 채운다** — 한가운데가 비면
     「Enter 로 가운데 글 고르기」가 아무것도 못 잡는다(자가 그걸 잡아냈다). */
  const cx = Math.cos((g / GROUPS) * Math.PI * 2) * (g % 2 ? 0.45 : 0.18);
  const cy = Math.sin((g / GROUPS) * Math.PI * 2) * (g % 2 ? 0.45 : 0.18);
  const base = Array.from({ length: DIM }, (_, i) => (i % GROUPS === g ? 1 : 0) + gauss() * 0.05);
  for (let k = 0; k < PER; k += 1) {
    const i = docs.length;
    const words = [own[0], own[k % 2], `${pick(HEAD)}${pick(TAIL)}`];
    const title = `${own[0]} ${k}번 — ${words[2]} 이야기`;
    /* 본문을 넉넉히 — 400자 밑이면 「얇은 글」로 걸러져 혼자 있는 글 자가 빨개진다. */
    const text = `${title}. ${own[0]} 를 ${own[1]} 로 옮기는 이야기. ${words[2]} 도 나온다. ${own[0]} 는 ${own[1]} 와 함께 쓰인다. `.repeat(9);
    const lane = LANES[(g + k) % LANES.length];
    docs.push({
      id: `fake/${lane}/${i}-${own[0].replace(' ', '-')}.md`,
      lane,
      title,
      status: '',
      done: k % 7 === 0,
      bytes: text.length,
      xy: [Number((cx + gauss() * 0.16).toFixed(4)), Number((cy + gauss() * 0.16).toFixed(4))],
      axis: [Number((cx * 0.8 + gauss() * 0.2).toFixed(4)), Number((cy * 0.8 + gauss() * 0.2).toFixed(4))],
      cluster: g,
      levels: [g, g, g],
      buried: k % 13 === 0,
      days: Math.floor(rnd() * 120),
      links: Math.floor(rnd() * 4),
      born: `2026-0${1 + (g % 8)}`,
      hash: crypto.createHash('sha1').update(`fake:${i}`).digest('hex').slice(0, 12),
      _text: text,
    });
    vectors.push(base.map((v) => v + gauss() * 0.25));
  }
}

/** 코사인으로 닮은 글 여덟 — 진짜 굽기와 같은 방식. */
const norm = vectors.map((v) => {
  const s = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / s);
});
docs.forEach((d, i) => {
  const near = norm.map((v, j) => [j, v.reduce((a, b, t) => a + b * norm[i][t], 0)])
    .filter(([j]) => j !== i)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([j]) => j);
  d.near = near;
  /* 이웃 갈래의 유효 개수(iLISI) — 만나는 자리 자가 쓰는 값. */
  const c = new Map();
  for (const j of near) c.set(docs[j].lane, (c.get(docs[j].lane) || 0) + 1);
  let s = 0;
  for (const v of c.values()) s += (v / near.length) ** 2;
  d.mix = Number((1 / s).toFixed(2));
});

/* 지도에서도 가까운 이웃이 몇인가(믿음도). 화면 이웃 24 안에 드는 수. */
docs.forEach((d, i) => {
  const near2d = docs.map((o, j) => [j, Math.hypot(d.xy[0] - o.xy[0], d.xy[1] - o.xy[1])])
    .filter(([j]) => j !== i)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 24)
    .map(([j]) => j);
  const set = new Set(near2d);
  d.honest = d.near.filter((j) => set.has(j)).length;
});

/* 어디에도 안 붙는 글 — 위 2%. 값은 대충이어도 자가 보는 규칙(문턱 위/아래)만 맞으면 된다. */
const alone = docs.map((d, i) => [i, 1 + rnd() * 0.9]);
alone.sort((a, b) => b[1] - a[1]);
const cut = alone[Math.max(0, Math.floor(docs.length * 0.02) - 1)][1];
for (const [i, v] of alone) {
  docs[i].alone = Number(v.toFixed(2));
  if (v >= cut) docs[i].lonely = true;
}

/* 층 셋 — 성긴 층이 무리 그대로, 촘촘한 층은 반씩 쪼갠다. */
function namesFor(k) {
  return Array.from({ length: k }, (_, i) => `${HEAD[i % HEAD.length]} ${TAIL[i % TAIL.length]}`);
}
function wordsFor(k) {
  return Array.from({ length: k }, (_, i) => [
    `${HEAD[i % HEAD.length]} ${TAIL[i % TAIL.length]}`,
    `${HEAD[(i + 2) % HEAD.length]}터`,
    `${TAIL[(i + 4) % TAIL.length]}길`,
  ]);
}
const levels = [
  { k: GROUPS, names: namesFor(GROUPS), words: wordsFor(GROUPS) },
  { k: GROUPS * 2, names: namesFor(GROUPS * 2), words: wordsFor(GROUPS * 2) },
  { k: GROUPS * 2, names: namesFor(GROUPS * 2), words: wordsFor(GROUPS * 2) },
];
docs.forEach((d, i) => { d.levels = [d.cluster, d.cluster * 2 + (i % 2), d.cluster * 2 + (i % 2)]; });

/* 서로 부르는 짝 — 같은 무리 안에서 몇 개. */
const edges = [];
for (let i = 0; i < docs.length; i += 5) {
  const j = (i + 1) % docs.length;
  if (docs[i].cluster === docs[j].cluster) edges.push([i, j]);
}

/* 칸 이름 — 4x4·8x8 격자에 몇 칸. */
function tilesFor(side) {
  const cells = new Map();
  docs.forEach((d) => {
    const i = Math.min(side - 1, Math.max(0, Math.floor(((d.xy[0] + 1) / 2) * side)));
    const j = Math.min(side - 1, Math.max(0, Math.floor(((d.xy[1] + 1) / 2) * side)));
    const key = `${i},${j}`;
    if (!cells.has(key)) cells.set(key, { i, j, n: 0, c: d.cluster });
    cells.get(key).n += 1;
  });
  /* 칸 이름은 **글이 있는 칸마다** 붙인다 — 3개 밑을 버렸더니 8칸 격자에서 이름 없는
     자리가 15% 나와 「당기면 어디인지 아나」 자가 빨개졌다. 가짜는 자를 통과시키려는 게
     아니라 **자가 돌게 하려는 것**이니, 진짜에서 나오는 조건을 흉내 낸다. */
  return [...cells.values()].filter((c) => c.n >= 1).map((c, idx) => ({
    i: c.i, j: c.j, n: c.n, name: `${HEAD[idx % HEAD.length]}${TAIL[(idx + 1) % TAIL.length]}`,
  }));
}

/* 뼈대 — 마디를 x 순서로 놓아 이음이 안 엇갈리게. */
const nodes = [];
for (let b = 0; b < 8; b += 1) {
  const x = -0.8 + (b / 7) * 1.6;
  nodes.push({ xy: [Number(x.toFixed(4)), Number((Math.sin(b) * 0.3).toFixed(4))], n: 12, lane: LANES[b % LANES.length] });
}
const links = nodes.slice(1).map((_, i) => [i, i + 1, 3]);

const out = {
  fakeNote: '이 파일은 지어낸 지도다 — 진짜 글은 한 줄도 없다. 자들이 CI 에서도 돌게 하려고 둔다.',
  builtFrom: 'fake',
  count: docs.length,
  embedded: docs.length,
  lanes: [...new Set(docs.map((d) => d.lane))],
  clusterNames: levels[levels.length - 1].names,
  edges,
  buried: docs.filter((d) => d.buried).length,
  months: [...new Set(docs.map((d) => d.born))].sort(),
  holes: [{ a: levels[0].names[0], b: levels[0].names[1], size: [PER, PER] }],
  skeleton: { nodes, links, params: { bins: 8, overlap: 0.3, min: 3 }, comp: 1, wobble: { comp: [1, 1], off: 0 } },
  levels: levels.map((l) => ({ k: l.k, names: l.names, words: l.words })),
  tiles: [4, 8].map((side) => ({ side, cells: tilesFor(side) })),
  align: { shared: docs.length, drift: 0 },
  mixStat: {
    mean: Number((docs.reduce((a, d) => a + d.mix, 0) / docs.length).toFixed(2)),
    alone: docs.filter((d) => d.mix < 1.01).length,
    meet: docs.filter((d) => d.mix >= 1.5).length,
    counted: docs.length,
  },
  lonelyStat: {
    marked: docs.filter((d) => d.lonely).length,
    cut: Number(cut.toFixed(2)),
    candidates: docs.length,
    overlapBuried: docs.filter((d) => d.lonely && d.buried).length,
    k: 20,
    minBytes: 400,
  },
  docs: docs.map(({ _text, ...rest }) => rest),
};

const cache = {};
docs.forEach((d, i) => { cache[`local:fake-model:${d.hash}`] = norm[i].map((v) => Number(v.toFixed(5))); });

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync(OUT_CACHE, JSON.stringify(cache));
console.log(`[fake] 가짜 지도 ${docs.length}글 · 무리 ${GROUPS} · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
console.log(`[fake] 가짜 벡터 ${Object.keys(cache).length}개 · ${(fs.statSync(OUT_CACHE).size / 1024).toFixed(0)}KB`);
console.log('[fake] 진짜 지도가 있으면 자는 그걸 본다 — 이건 없을 때만 쓰인다');
