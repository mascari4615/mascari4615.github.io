#!/usr/bin/env node
/**
 * audit-atlas-gates-bite — **자가 진짜 무는지** 확인한다 (TASK-KAR-233).
 *
 * 자를 다섯 세웠다. 그런데 자가 초록인 것과 자가 **일을 하는 것**은 다르다 —
 * 아무것도 안 잡는 자도 늘 초록이다. 이번 작업에서만 손으로 일곱 번 확인했다
 * (자리 섞기 · 갈래 지도 흉내 · 지도 옛것 만들기 · 비공개 파일 담기 · 옛 모델 꽂기).
 * 매번 통했지만 **손일은 다음 사람이 안 한다.**
 *
 * 그래서 기계가 한다: 지도를 일부러 망가뜨려 넣고 자가 빨개지는지 본다.
 * 안 빨개지면 그 자에 구멍이 있는 것이다.
 *
 * ⚠ 원본은 반드시 되돌린다. 검사가 데이터를 망가뜨린 채 끝나면 그게 더 큰 사고다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다** — 망가뜨려 볼 자들이 가짜에선 여럿 쉬어서 물었는지 알 수 없다.
   조용히 통과하지 말고 왜 안 도는지 말한다. */
if (isFake(ATLAS)) {
  console.log('[atlas-gates-bite] 가짜 지도다 — 이 자는 진짜 굽기에서만 잰다 (망가뜨려 볼 자들이 가짜에선 여럿 쉬어서 물었는지 알 수 없다). 건너뜀');
  process.exit(0);
}

if (!fs.existsSync(ATLAS)) {
  console.log('[gates-bite] 지도가 아직 없다 — 검사 건너뜀');
  process.exit(0);
}

/** 씨앗 고정 — 매번 같은 망가뜨림이어야 결과를 견줄 수 있다. */
let seed = 1234;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** 망가뜨림 하나 = [이름, 지도를 비트는 법, 이걸 잡아야 하는 자] */
const BITES = [
  ['자리를 마구 섞는다', (a) => {
    const xy = a.docs.filter((d) => d.xy).map((d) => d.xy);
    for (let i = xy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [xy[i], xy[j]] = [xy[j], xy[i]];
    }
    let k = 0;
    for (const d of a.docs) if (d.xy) d.xy = xy[k++];
  }, 'audit-atlas-trust.mjs'],

  ['갈래마다 자기 덩어리를 준다', (a) => {
    const lanes = [...new Set(a.docs.map((d) => d.lane))];
    for (const d of a.docs) {
      const c = lanes.indexOf(d.lane);
      d.levels = [c, c, c];
      d.cluster = c;
    }
    a.levels = a.levels.map(() => ({ k: lanes.length, names: lanes.map((x) => `덩어리 ${x}`) }));
  }, 'audit-atlas-lane-bias.mjs'],

  ['담긴 글 수를 옛것으로 만든다', (a) => { a.count = Math.floor(a.count * 0.5); }, 'audit-memo-atlas-fresh.mjs'],

  ['자리 잡힌 글을 반으로 줄인다', (a) => { a.embedded = Math.floor(a.count * 0.4); }, 'audit-memo-atlas-fresh.mjs'],

  ['칸 이름을 지운다', (a) => { a.tiles = []; }, 'audit-atlas-zoom-names.mjs'],

  ['닮은 글을 지운다', (a) => { for (const d of a.docs) delete d.near; }, 'audit-atlas-near.mjs'],

  ['닮은 글을 아무거나로 바꾼다', (a) => {
    const n = a.docs.length;
    for (const d of a.docs) d.near = Array.from({ length: 8 }, () => Math.floor(rnd() * n));
  }, 'audit-atlas-near.mjs'],

  ['믿음 점수를 지운다', (a) => { for (const d of a.docs) delete d.honest; }, 'audit-atlas-honesty.mjs'],

  ['믿음 점수를 섞는다', (a) => {
    const v = a.docs.map((d) => d.honest);
    for (let i = v.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; }
    a.docs.forEach((d, i) => { d.honest = v[i]; });
  }, 'audit-atlas-honesty.mjs'],

  ['렌즈를 표에서 제일 나쁜 것으로 적는다', (a) => {
    /* 그림은 그대로 두고 **어떤 렌즈로 훑었다고 적는지**만 바꾼다 — 자가 표에 같은 규칙을
       다시 걸어 「더 나은 렌즈가 있는데 안 골랐다」로 잡아야 한다. 값은 표에서 파생시킨다. */
    const sk = a.skeleton;
    if (!sk || !Array.isArray(sk.lensTable) || !sk.lensTable.length) return;
    const worst = [...sk.lensTable].sort((x, y) => (y.spread - x.spread) || (y.off - x.off) || (x.n - y.n))[0];
    if (sk.params && worst) sk.params.lens = worst.lens;
  }, 'audit-atlas-skeleton-stable.mjs'],

  ['뼈대 손잡이를 벼랑으로 옮긴다', (a) => {
    /* **자가 쓸어 보는 그리드 밖으로** 밀어낸다(9~16). 안에 있는 값을 박아 두면
       어느 날 그게 마침 제일 안정한 자리가 되어 망가뜨림이 무효가 된다 — 18 로 박아
       뒀다가 실제로 그랬다(2026-08-21, 값 박기 사고 세 번째). */
    if (a.skeleton && a.skeleton.params) a.skeleton.params.bins = 3;
  }, 'audit-atlas-skeleton-stable.mjs'],

  ['흔들림 폭을 거짓으로 적는다', (a) => {
    /* **박아 둔 값 대신 지금 값에서 옮긴다.** [1,1] 로 박아 뒀더니 어느 날 실제 폭이
       [1,1] 이 되어 망가뜨림이 아무것도 안 하는 게 됐다(2026-08-21). 상대로 옮기면
       무슨 값이든 반드시 달라진다. */
    const w = a.skeleton && a.skeleton.wobble;
    if (w && Array.isArray(w.comp)) w.comp = [w.comp[0] + 1, w.comp[1] + 2];
  }, 'audit-atlas-skeleton-stable.mjs'],

  ['만나는 자리 점수를 지운다', (a) => { for (const d of a.docs) delete d.mix; }, 'audit-atlas-mix.mjs'],

  ['갈래를 갈래끼리만 이웃으로 준다', (a) => {
    /* 같은 갈래끼리만 이웃이 되게 바꾼다 = 갈래마다 섬에 앉은 지도 흉내. */
    const byLane = new Map();
    a.docs.forEach((d, i) => {
      if (!byLane.has(d.lane)) byLane.set(d.lane, []);
      byLane.get(d.lane).push(i);
    });
    for (const d of a.docs) {
      const pool = byLane.get(d.lane) || [];
      d.near = pool.slice(0, 8);
      d.mix = 1;
    }
  }, 'audit-atlas-mix.mjs'],

  ['혼자 있는 글 표시를 지운다', (a) => {
    for (const d of a.docs) delete d.lonely;
    if (a.lonelyStat) a.lonelyStat.marked = 0;
  }, 'audit-atlas-lonely.mjs'],

  ['얇은 글을 혼자 있는 글로 만든다', (a) => {
    /* 재료가 없어서 혼자인 글을 뜻으로 혼자인 척 세운다 — 자가 이걸 걸러야 한다.
       **문턱을 박아 두지 않는다.** 200자로 박았더니 그런 글이 하나도 없어 아무것도
       안 하는 망가뜨림이 됐다(2026-08-21). 지도에 실린 문턱을 그대로 쓴다. */
    const min = (a.lonelyStat && a.lonelyStat.minBytes) || 400;
    const thin = a.docs.filter((d) => (d.bytes || 0) < min).slice(0, 5);
    for (const d of thin) { d.lonely = true; d.alone = 9; }
    if (a.lonelyStat) a.lonelyStat.marked += thin.length;
  }, 'audit-atlas-lonely.mjs'],

  ['뼈대 마디 자리를 섞어 실타래로 만든다', (a) => {
    if (!a.skeleton || !a.skeleton.nodes) return;
    const xy = a.skeleton.nodes.map((n) => n.xy);
    for (let i = xy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [xy[i], xy[j]] = [xy[j], xy[i]];
    }
    a.skeleton.nodes.forEach((n, i) => { n.xy = xy[i]; });
  }, 'audit-atlas-skeleton-stable.mjs'],

  ['지도가 통째로 딴 그림이 됐다고 적는다', (a) => {
    if (a.align) a.align.drift = a.align.drift + 1;
  }, 'audit-memo-atlas-fresh.mjs'],

  ['덩어리 이름을 지어낸 말로 바꾼다', (a) => {
    /* 낱말 둘을 억지로 붙이던 옛 방식 흉내 — 글에 없는 말이 된다. */
    for (const lv of a.levels || []) {
      lv.names = lv.names.map((n, i) => `zzq${i} ${String(n).split(' ')[0]}`);
    }
  }, 'audit-atlas-names.mjs'],

  ['덩어리마다 쓰는 말을 똑같이 만든다', (a) => {
    /* 견주기가 「이쪽만 쓰는 말」이라며 아무 말이나 내놓게 만든다 — 자가 잡아야 한다.
       흔해서 어느 덩어리에나 나오는 말을 쓴다. */
    for (const lv of a.levels || []) {
      if (!Array.isArray(lv.words)) continue;
      lv.words = lv.words.map((_, i) => (i % 2 === 0
        ? ['지도', '글', '자리', '이름']
        : ['자리', '이름', '지도', '글']));
    }
  }, 'audit-atlas-compare.mjs'],

  ['층마다 잰 값을 부풀린다', (a) => {
    /* **박아 두지 않는다** — 지금 값에서 옮긴다. 무슨 값이든 반드시 달라진다.
       자가 곳간 벡터로 다시 재므로, 실린 값만 부풀리면 어긋난다. */
    for (const lv of a.levels || []) if (lv.sil != null) lv.sil = lv.sil * 3 + 0.1;
  }, 'audit-atlas-cluster-real.mjs'],

  ['갈래를 스물로 늘린다', (a) => {
    /* 색 여덟·모양 예닐곱이라 짝이 반드시 겹친다 — 채널 예산 자가 잡아야 한다.
       이름은 지금 갈래에서 파생시킨다(박아 두지 않는다). */
    const base = a.lanes.slice();
    while (a.lanes.length < 20) a.lanes.push(`${base[a.lanes.length % base.length]}-${a.lanes.length}`);
  }, 'audit-atlas-channels.mjs'],

  ['조각 판단을 뒤집어 적는다', (a) => {
    /* 막대는 그대로 두고 **판단만** 뒤집는다 — 자가 같은 규칙(낙차)을 다시 걸어 잡아야 한다. */
    if (a.h0) { a.h0.clear = !a.h0.clear; a.h0.pieces = a.h0.clear ? (a.h0.long || 1) + 1 : null; }
  }, 'audit-atlas-h0.mjs'],

  ['자리 손잡이를 표에서 나쁜 자리로 적는다', (a) => {
    /* 표는 그대로 두고 **골랐다고 적은 값만** 옮긴다 — 자가 같은 규칙(채움 80% 문턱 안에서
       이웃 최고)을 다시 걸어 「더 나은 자리가 있는데 안 골랐다」로 잡아야 한다. */
    const u2 = a.umap;
    if (!u2 || !Array.isArray(u2.table) || !u2.table.length) return;
    const worst = [...u2.table].sort((x, y) => (x.trust + x.cont) - (y.trust + y.cont))[0];
    u2.nn = worst.nn; u2.md = worst.md; u2.trust = worst.trust; u2.cont = worst.cont; u2.fill = worst.fill;
  }, 'audit-atlas-umap.mjs'],

  ['층을 서로 가로지르게 뒤섞는다', (a) => {
    /* 자리·이름은 그대로 두고 **촘촘한 층의 무리 번호만** 남의 것과 바꾼다 — 그러면
       촘촘한 무리가 성긴 무리를 가로지른다(단조성이 깨진다). 자가 수로 잡아야 한다. */
    const li = (a.levels || []).length - 1;
    if (li < 1) return;
    const hit = a.docs.filter((d) => Array.isArray(d.levels) && d.levels[li] != null).slice(0, 200);
    for (let i = 0; i < hit.length; i += 2) {
      const t = hit[i].levels[li];
      hit[i].levels[li] = hit[(i + 1) % hit.length].levels[li];
      hit[(i + 1) % hit.length].levels[li] = t;
    }
  }, 'audit-atlas-zoom.mjs'],

  ['이상치에 덜 흔들리는 답을 지운다', (a) => {
    /* 막대는 그대로고 **DTM 쪽 답만** 사라진다 — 순수 거리 하나로만 답하던 옛 상태다. */
    if (a.h0) delete a.h0.dtm;
  }, 'audit-atlas-h0.mjs'],

  ['DTM 이 갈린다고 거짓으로 적는다', (a) => {
    /* 낙차는 그대로 두고 **센 수만** 올린다 — 자가 다시 세서 잡아야 한다. */
    if (a.h0 && a.h0.dtm) a.h0.dtm.split = a.h0.dtm.rows.length;
  }, 'audit-atlas-h0.mjs'],

  ['붓스트랩 띠를 지운다', (a) => {
    /* 막대는 그대로고 **문턱을 잰 결과만** 사라진다 — 문턱이 다시 지어낸 값이 된다. */
    if (a.h0) delete a.h0.boot;
  }, 'audit-atlas-h0.mjs'],

  ['띠를 좁혀 없는 조각을 만든다', (a) => {
    /* 띠를 아주 좁게 적으면 잡음 낙차도 「갈림」이 된다 — 자가 다시 걸어 잡아야 한다. */
    if (a.h0 && a.h0.boot) { a.h0.boot.c = 0.0001; a.h0.boot.band = 0.0002; }
  }, 'audit-atlas-h0.mjs'],

  ['다른 자리잡기 방식을 표에서 지운다', (a) => {
    /* 손잡이만 쓸어 보고 **다른 방식은 안 견줬던** 옛 상태로 되돌린다. */
    if (a.umap && Array.isArray(a.umap.table)) a.umap.table = a.umap.table.filter((t) => !t.way || t.way === 'UMAP');
  }, 'audit-atlas-umap.mjs'],

  ['이름 재 본 표를 지운다', (a) => {
    /* 「다른 방식으로도 재 봤다」는 표가 사라지면 판단을 다시 세울 수가 없다. */
    for (const L of a.levels || []) delete L.nameMmr;
  }, 'audit-atlas-name-fit.mjs'],

  ['표는 나쁜데 바꿨다고 적는다', (a) => {
    /* 표대로면 안 바꿔야 하는데 바꿨다고 적으면 — 자를 세워 놓고 결과를 안 따른 것이다. */
    for (const L of a.levels || []) if (L.nameMmr) { L.nameMmr.picked = 0.4; L.nameWay = '임베딩+MMR λ0.4'; }
  }, 'audit-atlas-name-fit.mjs'],

  ['안 갈리는 까닭을 지운다', (a) => {
    /* 수는 그대로고 **까닭만** 사라진다 — 「안 갈린다」만 남아 고칠 수가 없다. */
    for (const L of a.levels || []) delete L.why;
  }, 'audit-atlas-cluster-real.mjs'],

  ['안 갈리는 까닭을 엉뚱하게 적는다', (a) => {
    /* 요인 수는 그대로 두고 **이름만** 바꾼다 — 자가 수로 다시 세워 잡아야 한다. */
    for (const L of a.levels || []) if (L.why) L.why.why = '늘어짐';
  }, 'audit-atlas-cluster-real.mjs'],

  ['허브 잰 것을 지운다', (a) => {
    /* 이웃 목록은 그대로고 **몇 편이 그 자리를 먹는지만** 사라진다. */
    delete a.hub;
  }, 'audit-atlas-hub.mjs'],

  ['가장 나은 처방을 엉뚱하게 적는다', (a) => {
    /* 표는 그대로 두고 **골랐다고 적은 것만** 바꾼다 — 자가 표에서 다시 세워 잡아야 한다. */
    for (const r of (a.hub && a.hub.rows) || []) r.best = '공유 이웃';
  }, 'audit-atlas-hub.mjs'],

  ['허브 평균을 엉뚱하게 적는다', (a) => {
    /* 이웃 자리 총합은 n×k 라 평균 N_k 는 **반드시 k** 다 — 아니면 셈이 틀렸다는 신호. */
    for (const r of (a.hub && a.hub.rows) || []) r.raw.mean = 1;
  }, 'audit-atlas-hub.mjs'],

  ['거짓 이웃을 지운다', (a) => {
    /* 찢김은 그대로 두고 **나머지 반쪽만** 없앤다 — 어긋남을 반쪽만 재던 옛 상태다. */
    delete a.warp;
    for (const d of a.docs) { delete d.fake; delete d.fakeOf; }
  }, 'audit-atlas-warp.mjs'],

  ['어긋남을 작게 적는다', (a) => {
    /* 글마다의 수는 그대로 두고 **요약만** 좋게 적는다 — 자가 다시 재서 잡아야 한다. */
    if (a.warp) { a.warp.fakeMean = 0.05; a.warp.tearMean = 0.05; }
  }, 'audit-atlas-warp.mjs'],

  ['흔든 판을 지운다', (a) => {
    /* 살아남은 비율(수)은 그대로고 **그림째 남긴 판만** 사라진다 — 흔들림을 글로만 적게 된다. */
    if (a.skeleton) delete a.skeleton.hops;
  }, 'audit-atlas-hops.mjs'],

  ['흔든 판을 전부 같게 만든다', (a) => {
    /* 판은 있는데 다 똑같으면 흔든 게 아니다 — 자가 「흔들기가 안 흔든다」로 잡아야 한다. */
    const h = a.skeleton && a.skeleton.hops;
    if (Array.isArray(h) && h.length) for (let i = 1; i < h.length; i += 1) h[i] = JSON.parse(JSON.stringify(h[0]));
  }, 'audit-atlas-hops.mjs'],

  ['고리를 지운다', (a) => {
    /* 마디·이음은 그대로고 **고리만** 사라진다 — H0 만 재던 옛 상태로 돌아간다. */
    if (a.skeleton) delete a.skeleton.h1;
  }, 'audit-atlas-loops.mjs'],

  ['고리 대조군을 지운다', (a) => {
    /* 「고리 9개」만 남고 「섞으면 21개」가 사라지면 그건 발견처럼 읽힌다. */
    const h = a.skeleton && a.skeleton.h1;
    if (h) delete h.rand;
  }, 'audit-atlas-loops.mjs'],

  ['고리를 없는 이음으로 잇는다', (a) => {
    /* 고리 하나의 마디 하나를 남으로 바꾼다 — 닫힌 길이 아니게 된다. */
    const h = a.skeleton && a.skeleton.h1;
    if (!h || !h.loops || !h.loops.length) return;
    const V = a.skeleton.nodes.length;
    h.loops[0] = h.loops[0].slice();
    h.loops[0][1] = (h.loops[0][1] + Math.floor(V / 2)) % V;
  }, 'audit-atlas-loops.mjs'],

  ['써 보는 잣대를 지운다', (a) => {
    /* 나눔은 그대로고 **써 본 결과만** 사라진다 — 「나눔이 좋은가」만 남는다. */
    delete a.prox;
  }, 'audit-atlas-prox.mjs'],

  ['써 보는 잣대 대조군을 성한 값으로 적는다', (a) => {
    /* 배정을 섞어도 잘 가려낸 척 — 그러면 「찍기와 못 가른다」가 된다. */
    for (const r of (a.prox && a.prox.rows) || []) r.randAuc = r.auc;
  }, 'audit-atlas-prox.mjs'],

  ['가장 나쁜 무리를 평균보다 좋게 적는다', (a) => {
    /* 앞뒤가 안 맞는 수 — 가장 나쁜 것이 평균보다 좋을 수는 없다. */
    for (const r of (a.prox && a.prox.rows) || []) r.worst = Math.min(1, r.auc + 0.05);
  }, 'audit-atlas-prox.mjs'],

  ['바깥 잣대를 지운다', (a) => {
    /* 나눔·라벨은 그대로고 **바깥에 물어본 결과만** 사라진다 — 자가 전부 안쪽이 된다. */
    delete a.external;
  }, 'audit-atlas-external.mjs'],

  ['바깥 잣대를 좋게 적는다', (a) => {
    /* 글의 층·갈래는 그대로 두고 **적어 둔 수만** 올린다 — 자가 다시 재서 잡아야 한다. */
    for (const r of (a.external && a.external.rows) || []) { r.ari = 0.95; r.harmonic = 0.95; r.nmi = 0.95; }
  }, 'audit-atlas-external.mjs'],

  ['바깥 잣대 대조군을 성한 값으로 적는다', (a) => {
    /* 라벨을 섞어도 잘 맞은 척 — 그러면 「우연과 못 가른다」가 된다. */
    for (const r of (a.external && a.external.rows) || []) { r.randAri = r.ari; }
  }, 'audit-atlas-external.mjs'],

  ['침입자 시험을 지운다', (a) => {
    /* 이름·낱말은 그대로고 **읽히는지 잰 것만** 사라진다 — 「나눔이 좋은가」만 남는다. */
    delete a.intrusion;
  }, 'audit-atlas-intrusion.mjs'],

  ['침입자 맞춘 비율을 부풀린다', (a) => {
    /* 판 수로 나올 수 없는 수를 적는다 — 자가 격자로 잡아야 한다. */
    if (a.intrusion) a.intrusion.mp = 0.9137;
  }, 'audit-atlas-intrusion.mjs'],

  ['침입자 대조군을 성한 값으로 적는다', (a) => {
    /* 아무 무리에 대고 물어도 잘 맞힌 척 — 그러면 「무리와 상관없이 풀린다」가 된다. */
    if (a.intrusion) a.intrusion.randMp = a.intrusion.mp;
  }, 'audit-atlas-intrusion.mjs'],

  ['눈금 사다리를 지운다', (a) => {
    /* 마디·이음은 그대로고 **여러 눈금에서 본 답만** 사라진다 — 눈금 하나로 그린 한 장면이 된다. */
    if (a.skeleton) delete a.skeleton.tower;
  }, 'audit-atlas-mapper-tower.mjs'],

  ['사다리 막대를 조각 수와 어긋나게 적는다', (a) => {
    /* 가장 성긴 눈금까지 산 막대를 하나 지운다 — 자가 「거기 조각이 몇 개인데 막대는 몇 개냐」로
       잡아야 한다. 조각 수 표는 그대로 둔다. */
    const tw = a.skeleton && a.skeleton.tower;
    if (!tw || !tw.bars || !tw.counts) return;
    const coarse = tw.counts[0].bins;
    const at = tw.bars.findIndex((b) => b.from === coarse);
    if (at >= 0) tw.bars.splice(at, 1);
  }, 'audit-atlas-mapper-tower.mjs'],

  ['자리를 다시 잡은 걸 숨긴다', (a) => {
    /* 자리는 옮겨 놓고 **옮겼다는 사실만** 지운다 — 화면이 입을 다물게 된다.
       그러면 사람이 뼈대와 뜻자리를 같은 지도로 읽는다. */
    const d = a.skeleton && a.skeleton.draw;
    if (d && d.anchored) d.anchored.used = false;
  }, 'audit-atlas-skeleton-drawing.mjs'],

  ['stress 가 늘어난 판이 있었다고 적는다', (a) => {
    /* 단조 수렴이 깨졌다고 적으면 자가 잡아야 한다 — 셈이 틀렸다는 신호다. */
    const d = a.skeleton && a.skeleton.draw;
    if (d && d.anchored && d.anchored.used) d.anchored.rose = 3;
  }, 'audit-atlas-skeleton-drawing.mjs'],

  ['그림 자 셋을 지운다', (a) => {
    /* 마디·이음은 그대로고 **잰 값만** 사라진다 — 얽힘 하나로 그림을 판정하던 옛 상태다. */
    if (a.skeleton) delete a.skeleton.draw;
  }, 'audit-atlas-skeleton-drawing.mjs'],

  ['그린 거리 어긋남을 좋게 적는다', (a) => {
    /* 그림은 안 건드리고 **적어 둔 수만** 낮춘다 — 자가 따로 셈해 잡아야 한다. */
    if (a.skeleton && a.skeleton.draw) a.skeleton.draw.stress = 0.01;
  }, 'audit-atlas-skeleton-drawing.mjs'],

  ['렌즈 표에서 stress·이웃 지킴을 뺀다', (a) => {
    /* 얽힘만 남기면 「얽힘 하나로 렌즈를 골랐다」가 된다 — 자가 그걸 잡아야 한다. */
    for (const t of (a.skeleton && a.skeleton.lensTable) || []) { delete t.stress; delete t.np; delete t.rank; }
  }, 'audit-atlas-skeleton-drawing.mjs'],

  ['마디가 다 살아남은 척한다', (a) => {
    /* 흔들어 본 결과만 지운다 — 마디·이음은 그대로다. 자가 **다시 재서** 잡아야 한다
       (「스무 판 다 버텼다」는 우리 지도에서 43개 중 4개뿐이다). */
    const cf = a.skeleton && a.skeleton.confidence;
    if (!cf) return;
    cf.survival = cf.survival.map(() => 1);
    cf.full = cf.survival.length; cf.shaky = 0; cf.min = 1; cf.mean = 1;
    a.skeleton.nodes.forEach((n) => { n.keep = 1; });
  }, 'audit-atlas-skeleton-confidence.mjs'],

  ['바탕값을 지운다', (a) => {
    /* 「마구 섞은 지도도 이만큼 남는다」를 빼면 살아남은 비율은 단단한 뼈대로 읽힌다.
       숫자를 고치는 게 아니라 **말을 안 하게** 만드는 망가뜨림이다. */
    const cf = a.skeleton && a.skeleton.confidence;
    if (cf) delete cf.baseline;
  }, 'audit-atlas-skeleton-confidence.mjs'],

  ['같은 마디 문턱을 0.5 로 박는다', (a) => {
    /* 곡선은 그대로 두고 **골랐다고 적은 문턱만** 옮긴다 — 자가 같은 규칙(차가 가장 큰 자리)을
       다시 걸어 「박아 뒀다」로 잡아야 한다. */
    const cf = a.skeleton && a.skeleton.confidence;
    if (cf) cf.same = 0.5;
  }, 'audit-atlas-skeleton-confidence.mjs'],

  ['생일을 한 달로 몰아 준다', (a) => {
    /* 모든 글이 같은 달에 태어난 척하면 궤적은 점 하나가 된다 — 「이을 달이 둘도 안 된다」로
       걸려야 한다. 달 이름은 지도에 있는 것에서 가져온다(박아 두지 않는다). */
    const one = (a.months && a.months[a.months.length - 1]) || null;
    if (!one) return;
    for (const d of a.docs) if (d.born) d.born = one;
    a.months = [one];
  }, 'audit-atlas-trail.mjs'],

  ['둘레가 통짜가 되게 이웃을 부풀린다', (a) => {
    /* 닮은 글을 여덟이 아니라 예순으로 만들면 두 칸 만에 지도의 태반이 잡힌다 —
       그때 「둘레」는 이름만 둘레다. 수는 지금 값에서 키운다(박아 두지 않는다). */
    const wide = Math.min(60, Math.max(20, (a.docs[0]?.near?.length || 8) * 8));
    const n = a.docs.length;
    a.docs.forEach((d, i) => { d.near = Array.from({ length: wide }, (_, k) => (i * 7 + k * 11) % n); });
  }, 'audit-atlas-ego.mjs'],

  ['겹침 요약을 지운다', (a) => { delete a.twins; }, 'audit-atlas-twins.mjs'],

  ['겹침 문턱을 곡선 밖으로 옮긴다', (a) => {
    /* 곡선은 그대로 두고 문턱만 옮긴다 — 자가 같은 규칙을 다시 걸어 잡아야 한다.
       값은 곡선의 맨 위(제일 빡빡한 자리)로 — 지금 값에서 파생시켜 박아 두지 않는다. */
    if (a.twins && Array.isArray(a.twins.curve) && a.twins.curve.length) a.twins.at = a.twins.curve[0].t;
  }, 'audit-atlas-twins.mjs'],

  ['이름 적합도를 지운다', (a) => { for (const lv of a.levels || []) delete lv.fit; }, 'audit-atlas-name-fit.mjs'],

  ['이름 적합도를 뒤집어 적는다', (a) => {
    /* 값은 그대로 두고 **제 무리/남의 무리만 맞바꾼다** — 자가 다시 재면 판정이 안 맞는다. */
    for (const lv of a.levels || []) {
      for (const f of (lv.fit && lv.fit.names) || []) {
        if (!f || f.own == null || f.other == null) continue;
        const t = f.own; f.own = f.other; f.other = t;
      }
    }
  }, 'audit-atlas-name-fit.mjs'],

  ['뭉친 자리를 통째로 지운다', (a) => { delete a.dense; }, 'audit-atlas-dense.mjs'],

  ['허허벌판 수를 거짓으로 적는다', (a) => {
    /* 화면은 이 수를 그대로 읽으므로 화면만 봐선 안 걸린다 — 붙은 글 수와 **합**이
       안 맞는 것으로 걸려야 한다. 값은 지금 값에서 옮긴다(박아 두지 않는다). */
    if (a.dense) a.dense.noise += 777;
  }, 'audit-atlas-dense.mjs'],

  ['봉우리가 아닌 손잡이를 골랐다고 적는다', (a) => {
    /* 곡선은 그대로 두고 **고른 값만** 봉우리 아닌 곳으로 옮긴다. */
    if (!a.dense || !Array.isArray(a.dense.curve)) return;
    const ok = a.dense.curve.filter((c) => c.dbcv != null);
    if (!ok.length) return;
    a.dense.dbcv = Math.min(...ok.map((c) => c.dbcv));
  }, 'audit-atlas-dense.mjs'],

  ['밀도로 잰 값을 부풀린다', (a) => {
    /* 지금 값에서 옮긴다 — 자가 곳간 벡터로 전수로 다시 재므로 반드시 어긋난다. */
    for (const lv of a.levels || []) if (lv.dbcv != null) lv.dbcv = lv.dbcv + 1.1;
  }, 'audit-atlas-dbcv.mjs'],

  ['밀도로 잰 값을 지운다', (a) => {
    /* 자 하나만 남으면 「무리가 없다」와 「이 자로는 못 잰다」를 못 가른다. */
    for (const lv of a.levels || []) delete lv.dbcv;
  }, 'audit-atlas-dbcv.mjs'],

  ['어느 모델이 그렸는지를 지운다', (a) => {
    /* 이게 없으면 재는 쪽이 곳간에 같이 사는 **옛 모델 벡터**를 집어 든다 —
       실제로 그래서 「안 맞는다」고 했다(2026-08-21). 지도는 자기를 그린 손을 적어야 한다. */
    delete a.model;
  }, 'audit-atlas-cluster-real.mjs'],

  ['고른 근거를 반대로 적는다', (a) => {
    /* 곡선은 그대로 두고 **판단만** 뒤집는다 — 자가 곡선에 같은 규칙을 다시 걸어
       「봉우리가 안 뚜렷한데 뚜렷하다고 적혀 있다」를 잡아야 한다. */
    if (a.coarse) a.coarse.clear = !a.coarse.clear;
  }, 'audit-atlas-cluster-real.mjs'],

  ['점을 다섯 배로 늘린다', (a) => {
    /* 글이 늘어난 날을 흉내 낸다 — 그리기 예산 자가 그때를 짚어 줘야 한다.
       자리 번호(near·levels)는 안 건드린다. 그리기 값만 보는 자라 그것으로 충분하다. */
    const base = a.docs.slice(0, 1500);
    for (let k = 0; k < 4; k += 1) {
      for (const d of base) a.docs.push({ ...d, id: `dup${k}/${d.id}` });
    }
    a.count = a.docs.length;
    a.embedded = a.docs.length;
  }, 'audit-atlas-draw-budget.mjs'],

  ['잣대 중복 표를 지운다', (a) => {
    delete a.zoo;
  }, 'audit-atlas-zoo.mjs'],

  ['잣대가 다 따로 논다고 우긴다', (a) => {
    /* ★ 이 자의 심장 — 겹치는 쌍을 지우고 「전부 독립」이라 적으면 같은 말을 여러 번 하며
       여러 잣대를 댄 척하게 된다. 행렬은 그대로라 표와 행렬이 어긋난다. */
    if (a.zoo) { a.zoo.dup = []; a.zoo.eff = a.zoo.real; }
  }, 'audit-atlas-zoo.mjs'],

  ['심은 쌍둥이가 갈렸는데 셈이 선다고 적는다', (a) => {
    if (a.zoo) { a.zoo.twin.same = false; a.zoo.sane = true; }
  }, 'audit-atlas-zoo.mjs'],

  ['상호작용 DOI 표를 지운다', (a) => {
    delete a.taskDoi;
  }, 'audit-atlas-taskdoi.mjs'],

  ['지도가 보탠다고 우긴다', (a) => {
    /* ★ 이 자의 심장 — 지도가 안 보탠다는 결론을 뒤집으면 지도가 한 일이 없는데 있는 척한다. */
    if (a.taskDoi) a.taskDoi.mapAdds = !a.taskDoi.mapAdds;
  }, 'audit-atlas-taskdoi.mjs'],

  ['일괄 커밋을 안 걸렀다고 적는다', (a) => {
    if (a.taskDoi) { a.taskDoi.dropped = 0; a.taskDoi.droppedFiles = 0; }
  }, 'audit-atlas-taskdoi.mjs'],

  ['쓰이는가 표를 지운다', (a) => {
    delete a.revisit;
  }, 'audit-atlas-revisit.mjs'],

  ['같은 때 신호를 예측인 척한다', (a) => {
    /* ★ 이 자의 심장 — 이웃이 같은 시기에 움직인 걸로 80% 를 맞히는 건 예측이 아니라 번짐이다.
       그걸 앞 때 성적 자리에 놓으면 「일깨움에 쓸 만하다」로 뒤집힌다. */
    if (a.revisit) a.revisit.strict = a.revisit.ours;
  }, 'audit-atlas-revisit.mjs'],

  ['나이별 재방문율을 지운다', (a) => {
    if (a.revisit) a.revisit.ages = [];
  }, 'audit-atlas-revisit.mjs'],

  ['확률이 잘 맞는 척한다', (a) => {
    /* ★ 「우리 확률이 늘 같은 확률보다 낫다」고 적어 두면, 그럴듯한 수를 화면에 붙이게 된다.
       설득력은 오르고 효과는 안 오르는 바로 그 자리다. */
    if (a.suggest && a.suggest.calib) a.suggest.calib.better = !a.suggest.calib.better;
  }, 'audit-atlas-suggest.mjs'],

  ['보정 대조군을 지운다', (a) => {
    if (a.suggest && a.suggest.calib) delete a.suggest.calib.flat;
  }, 'audit-atlas-suggest.mjs'],

  ['이어야 할 둘 표를 지운다', (a) => {
    delete a.suggest;
  }, 'audit-atlas-suggest.mjs'],

  ['후보 수를 숨긴다', (a) => {
    /* ★ 이 자의 심장 — 후보가 186만 쌍인 걸 안 적으면 「찾았다」가 발견처럼 읽힌다. */
    if (a.suggest) delete a.suggest.pairsAll;
  }, 'audit-atlas-suggest.mjs'],

  ['아무 순서도 잘 맞히는 척한다', (a) => {
    if (a.suggest) a.suggest.rand.map = a.suggest.real.map;
  }, 'audit-atlas-suggest.mjs'],

  ['새 관심사 표를 지운다', (a) => {
    delete a.novelty;
  }, 'audit-atlas-novelty.mjs'],

  ['달을 섞어도 뭉치는 척한다', (a) => {
    /* ★ 이 자의 심장 — 대조군이 1 에서 벗어나면 이웃이 아니라 딴 것을 재고 있는 것이다. */
    if (a.novelty) a.novelty.shuffled.lift = a.novelty.real.lift;
  }, 'audit-atlas-novelty.mjs'],

  ['달을 모르는 글 수를 지운다', (a) => {
    /* 셈에서 뺀 것을 숨기면 뭉침이 저절로 부푼 것처럼 읽힌다. */
    if (a.novelty) delete a.novelty.unknown;
  }, 'audit-atlas-novelty.mjs'],

  ['공유용 일반화 표를 지운다', (a) => {
    delete a.share;
  }, 'audit-atlas-share.mjs'],

  ['값어치 쪽 우연 수준을 지운다', (a) => {
    /* ★ 이 자의 심장 — 굵게 뭉갤수록 「닮은 글이 곁에」는 저절로 오른다.
       우연을 지우면 그 저절로가 이득처럼 읽힌다. */
    if (a.share) for (const r of a.share.rows) delete r.randNear;
  }, 'audit-atlas-share.mjs'],

  ['못 만들었는데 만들었다고 적는다 (남 줄 판)', (a) => {
    if (a.share) a.share.usable = !a.share.usable;
  }, 'audit-atlas-share.mjs'],

  ['공개 위험을 지운다', (a) => {
    /* 지우면 「가리면 안전하다」는 착각이 그대로 남는다. */
    delete a.leak;
  }, 'audit-atlas-leak.mjs'],

  ['이웃을 섞어도 잘 맞히는 척한다', (a) => {
    /* ★ 이 자의 심장 — 대조군이 진짜만큼 맞히면 이웃을 안 보고 있다는 뜻이다. */
    if (a.leak) a.leak.shuffledRate = a.leak.rate;
  }, 'audit-atlas-leak.mjs'],

  ['좌표만 줬을 때를 지운다', (a) => {
    /* 이게 없으면 「이웃 목록만 빼면 된다」를 반증 못 한다. */
    if (a.leak) delete a.leak.xyRate;
  }, 'audit-atlas-leak.mjs'],

  ['자리 정렬 표를 지운다', (a) => {
    delete a.seriation;
  }, 'audit-atlas-seriation.mjs'],

  ['섞은 자료에서도 얻는다는 걸 숨긴다', (a) => {
    /* ★ 이게 이 자의 심장 — 정렬은 아무 자료에서도 얼마쯤 얻는다(우리 14%).
       그걸 0 으로 적으면 35% 가 전부 자료의 것처럼 읽힌다. */
    if (a.seriation) a.seriation.shufGain = 0;
  }, 'audit-atlas-seriation.mjs'],

  ['마구 정렬이 이미 좋다고 적는다', (a) => {
    /* 아무 순서나 놓으면 어긋남이 0.5 여야 한다 — 아니면 셈이 틀린 것이다. */
    if (a.seriation) { const r = a.seriation.ours.find((x) => x.way === '마구'); if (r) r.ar = 0.1; }
  }, 'audit-atlas-seriation.mjs'],

  ['나무 같은 정도를 지운다', (a) => {
    /* 지우면 「굽은 2차원으로 도망갈 수 있나」를 다시 안 묻게 된다. */
    delete a.delta;
  }, 'audit-atlas-delta.mjs'],

  ['같은 축 수 잡음 기준선을 뺀다', (a) => {
    /* ★ 이게 이 자의 심장 — 거리 집중 때문에 δ 가 작아지는 것을 못 가르게 된다. */
    if (a.delta) { a.delta.calibration = a.delta.calibration.filter((c) => !c.matched); }
  }, 'audit-atlas-delta.mjs'],

  ['나무 눈금을 망가뜨린다', (a) => {
    /* 나무는 정의상 0-쌍곡이다 — 0 이 아니면 셈이 틀린 것이다. */
    if (a.delta) { const t = a.delta.calibration.find((c) => c.shape === '나무'); if (t) t.relMean = 0.5; }
  }, 'audit-atlas-delta.mjs'],

  ['고유차원을 지운다', (a) => {
    /* 지우면 「2차원에 담기나」를 다시 안 묻게 된다 — 다른 결론 넷의 원인이 사라진다. */
    delete a.idim;
  }, 'audit-atlas-idim.mjs'],

  ['섞은 대조군이 안 오르게 만든다', (a) => {
    /* 축을 섞어도 차원이 그대로면 이 자는 구조를 안 보고 있는 것이다. */
    if (a.idim) { a.idim.shuffled = JSON.parse(JSON.stringify(a.idim.ours)); }
  }, 'audit-atlas-idim.mjs'],

  ['역수평균 보정을 안 한 척한다', (a) => {
    /* 보정 없는 값이 보정한 값보다 낮으면 보정이 뒤집힌 것이다. */
    if (a.idim) a.idim.ours.naive = 1;
  }, 'audit-atlas-idim.mjs'],

  ['초기값 배관이 안 도는 척한다', (a) => {
    /* ★ 이게 이 자의 심장이다 — 초기 자리를 넣어도 판이 안 바뀌면 사다리 표는 전부 헛것.
       `u.embedding` 재대입이 조용히 무시되던 그 자리를 흉내 낸다. */
    if (a.initLadder && a.initLadder.plumbing) a.initLadder.plumbing.differs = false;
  }, 'audit-atlas-init.mjs'],

  ['졌는데 바꿨다고 적는다 (초기값)', (a) => {
    if (a.initLadder) a.initLadder.used = !a.initLadder.used;
  }, 'audit-atlas-init.mjs'],

  ['초기값 사다리를 한 조건으로 줄인다', (a) => {
    /* 한 조건만 재고 「이게 낫다」 하면 사다리가 아니다. */
    if (a.initLadder) a.initLadder.table = a.initLadder.table.slice(0, 1);
  }, 'audit-atlas-init.mjs'],

  ['씨앗 떨림을 지운다', (a) => {
    /* 지우면 자 전부가 도로 씨앗 하나 위 점추정이 된다 — 그걸 아무도 모르면 안 된다. */
    delete a.wobble;
  }, 'audit-atlas-wobble.mjs'],

  ['떨림을 좋게 적는다', (a) => {
    /* 판마다 흔들리는 건 그대로고 **요약만** 좋게 적는다 — 이웃 유지율을 우연 수준으로
       떨어뜨려도 자가 「이웃마저 난수다」로 잡아야 한다. */
    if (a.wobble) { a.wobble.ratio = 0.01; a.wobble.keep = a.wobble.nullKeep; }
  }, 'audit-atlas-wobble.mjs'],

  ['판을 늘려도 안 모이게 만든다', (a) => {
    /* 합의 지도가 안 모이면 「가운데 자리」라는 게 없는 것이다. */
    if (a.wobble && a.wobble.at) a.wobble.at = a.wobble.at.map((c) => ({ ...c, gap: 0.2 }));
  }, 'audit-atlas-wobble.mjs'],

  ['졌는데 이겼다고 적는다 (관심도)', (a) => {
    /* 수는 그대로 두고 **판정만** 뒤집는다 — 「재 봤고 졌다」를 「쓴다」로 바꾸면
       다음 사람이 표를 안 보고 그 말만 믿는다. 자가 수와 대조해서 잡아야 한다. */
    if (a.doi) { a.doi.used = !a.doi.used; }
  }, 'audit-atlas-doi.mjs'],

  ['관심도 표를 지운다', (a) => {
    /* 진 실험의 표를 지우면 다음 사람이 같은 것을 또 해 본다. */
    delete a.doi;
  }, 'audit-atlas-doi.mjs'],

  ['갈린다는 p 값만 지운다', (a) => {
    /* 문턱을 손으로 고른 자(실루엣·DBCV)는 그대로 두고 **p 값만** 없앤다 —
       「구획이지 무리가 아니다」의 근거가 도로 문턱뿐인 상태로 돌아간다. */
    for (const l of a.levels || []) delete l.dip;
  }, 'audit-atlas-dip.mjs'],

  ['대조군이 진짜 방향만큼 갈린다고 적는다', (a) => {
    /* 값은 그대로고 **아무 방향 대조군만** 부풀린다 — 그러면 「갈린다」는 방향 고르기의
       산물이라는 뜻이다. 자가 그걸 말해야 한다. */
    for (const l of a.levels || []) if (l.dip) l.dip.randSplit = l.dip.split;
  }, 'audit-atlas-dip.mjs'],

  ['점을 고르게 흩는다 (지형을 평평하게)', (a) => {
    /* 자리를 **섞는 것**으로는 지형이 안 흔들린다 — 점 무더기 모양이 그대로라서다.
       그래서 아예 **고르게 흩는다**: 봉우리가 사라지고 높낮이가 0 에 붙어야 한다.
       등고선이 자료가 아니라 알고리즘의 무늬라면 이래도 멀쩡히 그려질 것이다. */
    for (const d of a.docs) if (d.xy) d.xy = [rnd(), rnd()];
  }, 'audit-atlas-terrain.mjs'],
];

const original = fs.readFileSync(ATLAS, 'utf8');
const results = [];

/* **살림 사본.** 이 검사는 지도를 일부러 망가뜨린다 — 도중에 죽으면(사람이 Ctrl-C 를
   누르거나 시간 제한에 잘리면) 망가진 채로 남는다. finally 는 그럴 때 안 돈다.
   그래서 망가뜨리기 전에 사본을 남기고, 다음 판이 시작할 때 사본이 있으면 먼저 되돌린다.
   실제로 한 번 잘렸고, 그 다음 판이 「성한 지도에서도 빨갛다」로 헛돌았다(2026-08-21). */
const SAFE = path.join(HERE, '..', 'data', '.memo-atlas-bite-backup.json');
if (fs.existsSync(SAFE)) {
  console.log('[gates-bite] 지난 판이 도중에 죽었다 — 사본으로 되돌린다');
  fs.copyFileSync(SAFE, ATLAS);
  fs.unlinkSync(SAFE);
}

function runGate(file, atlasFile = null) {
  const env = atlasFile ? { ...process.env, ATLAS_FILE: atlasFile } : process.env;
  const r = spawnSync(process.execPath, [path.join(HERE, file)], { encoding: 'utf8', env });
  return r.status !== 0;   // 빨개졌나
}

/**
 * **판마다 제 사본을 보게 하고 넷씩 동시에 돌린다.**
 *
 * 예전엔 진짜 지도 파일 하나를 망가뜨렸다 되돌렸다 하며 **한 판씩** 돌았다. 자가 서른여섯이
 * 되자 그 한 판이 20분을 넘겼고, 그동안 다른 일을 못 했다(같은 파일을 쓰니 겹쳐 돌릴 수도 없다 —
 * 겹쳐 돌렸다가 서로의 망가뜨림을 성한 지도로 읽는 사고도 냈다).
 * 이제 사본을 만들어 `ATLAS_FILE` 로 가리키게 하므로, 진짜 지도는 **손도 안 대고** 넷씩 동시에 돈다.
 */
async function runMany(jobs, lanes = 4) {
  const out = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= jobs.length) return;
      out[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, worker));
  return out;
}

function restore() {
  fs.writeFileSync(ATLAS, original);
  if (fs.existsSync(SAFE)) fs.unlinkSync(SAFE);
}

/* 먼저 성한 상태에서 초록인지 본다 — 원래 빨간 자는 무는 게 아니라 고장이다.
   **망가뜨리기 전에** 끝낸다. 여기서 죽어도 지도는 손 안 댄 상태다. */
const gates = [...new Set(BITES.map(([, , g]) => g))];
const pre = await runMany(gates.map((gate) => async () => [gate, runGate(gate)]));
const broken = pre.filter(([, red]) => red);
if (broken.length) {
  for (const [gate] of broken) console.log(`[gates-bite] ${gate} 가 성한 지도에서도 빨갛다 — 무는 게 아니라 고장이다`);
  process.exit(1);
}

/* 사본을 담을 자리. 진짜 지도는 이제 **안 건드린다** — 그래서 살림 사본도 필요 없다. */
const TMP = path.join(HERE, '..', 'data', '.bite');
fs.mkdirSync(TMP, { recursive: true });
try {
  const runs = await runMany(BITES.map(([label, bite, gate], i) => async () => {
    const a = JSON.parse(original);
    bite(a);
    const file = path.join(TMP, `m${i}.json`);
    fs.writeFileSync(file, JSON.stringify(a));
    const bit = runGate(gate, file);
    fs.unlinkSync(file);
    return [gate, label, bit];
  }));
  for (const [gate, label, bit] of runs) {
    results.push([gate, label, bit]);
    console.log(`  ${bit ? '○' : '×'} ${label} → ${path.basename(gate)} ${bit ? '가 잡았다' : '가 못 잡았다'}`);
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* 지울 게 없으면 그만 */ }
  restore();
}

const missed = results.filter(([, , bit]) => !bit);
console.log(`[gates-bite] 망가뜨림 ${results.length}가지 · 잡힌 것 ${results.length - missed.length}`);
if (missed.length) {
  console.log('[gates-bite] **자에 구멍이 있다** — 망가뜨렸는데 안 빨개진다');
  for (const [gate, label] of missed) console.log(`  - ${label} 를 ${path.basename(gate)} 가 놓친다`);
  process.exit(1);
}
console.log('[gates-bite] 자가 다 문다 — 망가뜨리면 전부 빨개진다');
