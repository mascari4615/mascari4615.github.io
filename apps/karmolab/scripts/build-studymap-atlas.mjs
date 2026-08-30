#!/usr/bin/env node
/**
 * build-studymap-atlas. 스터디 맵의 **자리를 뜻에서 굽는다**.
 *
 * 왜: 지도의 자리가 아무 뜻도 없었다. 1층 갈래 성좌의 선은 사람이 정한 것이 아니라
 * 칸의 선수관계에서 우연히 파생된 것이고(`track.prereq` = 0건, 41갈래에 선 100개),
 * 층 안 순서는 부모 x 평균 한 번뿐이라 옆에 붙은 두 갈래가 서로 아무 관계도 아니었다.
 * 그래서 가까이 있다가 거짓말이었다.
 *
 * 하는 일: 강의 본문을 로컬 임베딩으로 재고 → 갈래는 2차원 자리, 칸은 층 안 순서(1차원)로 굽는다.
 * 굽기는 **여기서만** 돈다. 웹은 구운 표(`data/studymap-atlas.json`)만 받는다 . 
 * 브라우저에서 모델을 돌리지 않는다(그러면 아무도 못 쓴다).
 *
 * 쓰기:
 *   node scripts/build-studymap-atlas.mjs          # 바뀐 강의만 다시 재고 굽는다
 *   node scripts/build-studymap-atlas.mjs --check  # 굽지 않고 지금 표가 성한지만
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LOCAL_MODEL, embedAll, removeSharedBias } from '@karmo/meaning';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MAP = path.join(ROOT, 'data/studymap.json');
const LESSONS = path.join(ROOT, 'data/lessons/ko');
const OUT = path.join(ROOT, 'data/studymap-atlas.json');
/** 곳간은 부른 쪽이 소유한다. 꾸러미는 파일을 안 만든다. 안 담는다(굽는 사람 것). */
const CACHE = path.join(ROOT, 'tmp/studymap-atlas-cache.json');
const checkOnly = process.argv.includes('--check');

const read = (p, dflt = null) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return dflt;
  }
};

/** 묶음 이름 — 사람이 적는 자리. 없으면 이름 없이 굽는다. */
const clusterNames = read(path.join(ROOT, 'data/studymap-clusters.json'), { names: [] });
const map = read(MAP);
const tracks = map?.tracks || map;
if (!Array.isArray(tracks) || !tracks.length) {
  console.log('[studymap-atlas] 못 돌림. data/studymap.json 을 못 읽었다');
  process.exit(2);
}

/** 칸 하나가 무엇을 말하는 글인가. 제목, 갈래, 단계에 강의 본문을 붙인다. 데모 코드는 뺀다(뜻이 아니라 문법이다). */
function textOf(track, stage, node) {
  const lesson = read(path.join(LESSONS, `${node.id}.json`));
  const body = (lesson?.parts || [])
    .flatMap((p) => [p.title, ...(p.blocks || []).filter((b) => b.type === 'p' || b.type === 'h').map((b) => b.text)])
    .filter(Boolean)
    .join('\n');
  return [track.title, stage.title, node.title, node.why, node.check, body].filter(Boolean).join('\n').slice(0, 4000);
}

const items = [];
for (const tr of tracks) {
  for (const st of tr.stages) {
    for (const n of st.nodes) {
      const text = textOf(tr, st, n);
      items.push({
        id: n.id,
        trackId: tr.id,
        text,
        hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 16),
      });
    }
  }
}

if (checkOnly) {
  const cur = read(OUT);
  if (!cur) {
    console.log('[studymap-atlas] 못 돌림. 구운 표가 없다 (`node scripts/build-studymap-atlas.mjs` 먼저)');
    process.exit(2);
  }
  const missTrack = tracks.filter((t) => !cur.tracks?.[t.id]).map((t) => t.id);
  const stale = items.filter((d) => cur.hashes?.[d.id] && cur.hashes[d.id] !== d.hash).map((d) => d.id);
  const bad = [
    missTrack.length ? `자리 없는 갈래 ${missTrack.length} (${missTrack.slice(0, 3).join(', ')})` : '',
    stale.length ? `강의가 바뀐 뒤 안 구운 칸 ${stale.length} (${stale.slice(0, 3).join(', ')})` : '',
  ].filter(Boolean);
  if (bad.length) {
    console.log('[studymap-atlas] 빨강. ' + bad.join(', '));
    process.exit(1);
  }
  console.log(`[studymap-atlas] OK. 갈래 ${tracks.length} 자리 있음, 강의 ${items.length}편과 같은 판 (${cur.tier})`);
  process.exit(0);
}

const cache = read(CACHE, {});
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
const t0 = Date.now();
/* 연장은 **부른 쪽이** 건넨다. 꾸러미는 무엇으로 재는지 모른다(계약). */
const loadRunner = () => import('@huggingface/transformers');
const got = await embedAll(items, {
  model: LOCAL_MODEL,
  cache,
  loadRunner,
  onLoad: (p) => {
    if (p?.status === 'progress' && p.progress) process.stdout.write(`
[studymap-atlas] 모델 받는 중 ${Math.round(p.progress)}%   `);
  },
  onProgress: (a, b) => process.stdout.write(`\r[studymap-atlas] 뜻을 재는 중 ${a}/${b}`),
  onFlush: (c) => fs.writeFileSync(CACHE, JSON.stringify(c)),
});
if (got.todo) process.stdout.write('\n');
const vectors = removeSharedBias(got.vectors).vectors ?? got.vectors;
if (vectors.some((v) => !v)) {
  console.log('[studymap-atlas] 못 돌림. 벡터가 빈 칸이 있다 (모델을 못 받았을 수 있다)');
  process.exit(2);
}

/**
 * 주성분 두 축. 41개, 311개 규모에서는 이걸로 충분하고, 무엇보다 **같은 입력이면 같은 그림**이다.
 * (UMAP 류는 씨앗을 타서 굽을 때마다 지도가 흔들린다. 지도가 흔들리면 사람이 자리를 못 외운다.)
 */
function pca(rows, k = 2) {
  const n = rows.length;
  const dim = rows[0].length;
  const mean = new Float64Array(dim);
  for (const v of rows) for (let i = 0; i < dim; i += 1) mean[i] += v[i];
  for (let i = 0; i < dim; i += 1) mean[i] /= n;
  const X = rows.map((v) => Float64Array.from(v, (x, i) => x - mean[i]));
  const axes = [];
  for (let a = 0; a < k; a += 1) {
    let w = Float64Array.from({ length: dim }, (_, i) => Math.sin((i + 1) * (a + 1) * 0.7));
    for (let it = 0; it < 64; it += 1) {
      const next = new Float64Array(dim);
      for (const x of X) {
        let d = 0;
        for (let i = 0; i < dim; i += 1) d += x[i] * w[i];
        for (let i = 0; i < dim; i += 1) next[i] += d * x[i];
      }
      for (const prev of axes) {
        let d = 0;
        for (let i = 0; i < dim; i += 1) d += next[i] * prev[i];
        for (let i = 0; i < dim; i += 1) next[i] -= d * prev[i];
      }
      let norm = 0;
      for (let i = 0; i < dim; i += 1) norm += next[i] * next[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i += 1) next[i] /= norm;
      w = next;
    }
    axes.push(w);
  }
  return X.map((x) => axes.map((w) => {
    let d = 0;
    for (let i = 0; i < dim; i += 1) d += x[i] * w[i];
    return d;
  }));
}

/**
 * 주성분 두 축은 **가장 큰 방향**을 잡을 뿐, 누가 누구 옆인가를 지키지는 않는다
 * (41갈래 실측: 그림의 이웃 다섯 중 진짜 이웃은 2.8개). 그래서 주성분을 출발점으로 두고
 * **거리를 직접 맞춘다**(SMACOF). 씨앗을 안 쓰므로 같은 입력이면 언제나 같은 그림이다.
 */
function mds(rows, init, rounds = 300) {
  const n = rows.length;
  const dim = rows[0].length;
  const cos = (a, b) => {
    let s = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < dim; i += 1) {
      s += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return s / (Math.sqrt(na * nb) || 1);
  };
  /* 목표 거리 = 뜻의 각도. 코사인이 1 이면 0, -1 이면 2. 사람이 보는 멀다와 순서가 같다. */
  const D = [];
  for (let i = 0; i < n; i += 1) {
    D.push(new Float64Array(n));
    for (let j = 0; j < n; j += 1) D[i][j] = i === j ? 0 : 1 - cos(rows[i], rows[j]);
  }
  let Y = init.map((p) => [p[0], p[1]]);
  /* 출발 자리의 크기를 목표 거리에 맞춘다. 안 맞추면 첫 걸음이 지도를 통째로 접는다. */
  let sy = 0;
  let sd = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      sy += Math.hypot(Y[i][0] - Y[j][0], Y[i][1] - Y[j][1]);
      sd += D[i][j];
    }
  }
  const k = sy > 1e-9 ? sd / sy : 1;
  Y = Y.map((p) => [p[0] * k, p[1] * k]);
  for (let r = 0; r < rounds; r += 1) {
    const next = Y.map(() => [0, 0]);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const dx = Y[i][0] - Y[j][0];
        const dy = Y[i][1] - Y[j][1];
        const d = Math.hypot(dx, dy) || 1e-9;
        const w = D[i][j] / d;
        next[i][0] += Y[j][0] + w * dx;
        next[i][1] += Y[j][1] + w * dy;
      }
      next[i][0] /= n - 1;
      next[i][1] /= n - 1;
    }
    Y = next;
  }
  return Y;
}

/** 0..1 로 편다. 화면 크기는 위젯이 정한다. 한 점뿐이면 가운데. */
function spread(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  return values.map((v) => (span > 1e-9 ? (v - lo) / span : 0.5));
}

const vecOf = new Map(items.map((d, i) => [d.id, vectors[i]]));

/* 갈래의 뜻 = 그 갈래 칸들의 평균. 칸 하나로 갈래를 대표시키면 큰 갈래가 억울하다. */
const trackVec = tracks.map((tr) => {
  const rows = tr.stages.flatMap((st) => st.nodes.map((n) => vecOf.get(n.id))).filter(Boolean);
  const dim = rows[0].length;
  const acc = new Float64Array(dim);
  for (const v of rows) for (let i = 0; i < dim; i += 1) acc[i] += v[i];
  return Array.from(acc, (x) => x / rows.length);
});
const tp = mds(trackVec, pca(trackVec, 2));
const tx = spread(tp.map((p) => p[0]));
const ty = spread(tp.map((p) => p[1]));

const outTracks = {};
tracks.forEach((tr, i) => {
  outTracks[tr.id] = [Number(tx[i].toFixed(4)), Number(ty[i].toFixed(4))];
});

/* 칸 자리는 **안 굽는다.** 갈래 안에서는 단계와 차례를 사람이 이미 적어 뒀고, 그 차례가 뜻보다 옳다
   (뜻으로 정렬해 보니 HTML 이 맨 오른쪽으로 갔다. 사이드바 목록과 지도가 다른 말을 했다).
   칸의 뜻은 갈래의 자리를 정하는 데만 쓴다. */

/**
 * 이웃 묶음. 자리만 있으면 왜 여기 있나가 안 보인다. 가까운 갈래를 묶고 이름을 붙인다.
 *
 * 묶는 자리 = **화면에 보이는 그 자리**(구운 2차원). 뜻 공간에서 묶고 화면은 따로 그리면
 * 같은 색인데 멀리 있는 것이 생겨 지도가 또 거짓말을 한다.
 *
 * 이름은 **지어내지 않는다**: 그 묶음의 갈래, 칸 제목에서 **거기서만 많이 나오는 말**을 뽑는다.
 * 한가운데 갈래 이름을 쓰면 거짓말이 된다. 웹, Git, 보안이 든 묶음이 DevOps 둘레가 됐다(실측).
 * (memo 지형도는 AI 가 이름을 붙이지만 거기엔 진짜 내 글에서 나온 말인가를 재는 자가 있다.
 *  여기엔 그 자가 없으니, 애초에 남의 말을 안 쓰고 제 제목에서만 고른다.)
 */
function cluster(rows, k) {
  const n = rows.length;
  const dim = rows[0].length;
  const d2 = (a, b) => {
    let t = 0;
    for (let i = 0; i < dim; i += 1) {
      const q = a[i] - b[i];
      t += q * q;
    }
    return t;
  };
  /* 씨앗을 안 쓴다. 첫 축으로 줄 세워 **고르게** 집는다. 같은 입력이면 같은 묶음이고,
     가장 먼 점으로 집으면 외톨이가 중심이 되어 한 묶음에 절반이 몰린다(실측: 41 중 20). */
  const order = rows.map((_, i) => i).sort((a, b) => rows[a][0] - rows[b][0] || a - b);
  const centers = Array.from({ length: k }, (_, j) => rows[order[Math.floor(((j + 0.5) * n) / k)]].slice());
  let of = new Array(n).fill(0);
  for (let it = 0; it < 60; it += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, j) => {
        const d = d2(rows[i], c);
        if (d < bd) {
          bd = d;
          bi = j;
        }
      });
      if (of[i] !== bi) moved = true;
      of[i] = bi;
    }
    for (let j = 0; j < k; j += 1) {
      const mine = rows.filter((_, i) => of[i] === j);
      if (!mine.length) continue;
      const acc = new Float64Array(dim);
      for (const v of mine) for (let i = 0; i < dim; i += 1) acc[i] += v[i];
      for (let i = 0; i < dim; i += 1) centers[j][i] = acc[i] / mine.length;
    }
    if (!moved) break;
  }
  return { of, centers, d2 };
}

/**
 * 묶음에 **이름을 안 붙인다**. 두 번 해 보고 접었다.
 *  ① 한가운데 갈래 이름: 웹, Git, 보안이 든 묶음이 DevOps 둘레가 됐다. 거짓말이다.
 *  ② 제목에서 유난히 잦은 말(tf-idf): 것을, 라이선스 내보낸다, 무엇으로가 나왔다. 헛말이다.
 * 검증할 수 없는 이름은 안 붙이는 편이 낫다. 묶음은 **색으로만** 이 근처는 한 동네를 말하고,
 * 무엇인지는 그 안의 갈래 이름들이 직접 말한다(이미 화면에 다 적혀 있다).
 * 이름이 필요해지면 사람이 붙여라. 그때 이 자리에 표를 하나 두면 된다.
 */

/* 41갈래에 6묶음. 한 묶음이 대여섯이라야 이 근처는 이런 것이 눈에 들어온다. */
const K = Math.max(2, Math.min(8, Math.round(tracks.length / 7)));
const cl = cluster(tracks.map((tr) => outTracks[tr.id]), K);
const clusters = [];
for (let j = 0; j < K; j += 1) {
  const members = tracks.filter((_, i) => cl.of[i] === j);
  if (!members.length) continue;
  /* 이름은 사람이 적은 표에서 가져온다 — anchor 갈래가 든 묶음이 그 이름을 갖는다.
     묶음 번호는 다시 구울 때 바뀌지만 anchor 는 안 바뀌므로, 이름이 엉뚱한 데 붙지 않는다.
     이름이 없는 묶음은 색으로만 남는다(없는 이름을 지어내지 않는다). */
  const ids = new Set(members.map((tr) => tr.id));
  const named = (clusterNames.names || []).find((n) => ids.has(n.anchor));
  clusters.push({
    id: `c${j}`,
    label: named?.label || '',
    members: members.map((tr) => tr.id),
  });
}

const hashes = {};
for (const d of items) hashes[d.id] = d.hash;

fs.writeFileSync(
  OUT,
  `${JSON.stringify({
    tier: got.tier,
    baked: new Date().toISOString().slice(0, 10),
    tracks: outTracks,
    clusters,
    hashes,
  }, null, 0)}\n`,
);
console.log(
  `[studymap-atlas] 구웠다. 갈래 ${tracks.length} 자리 (칸 ${items.length} 편의 뜻으로), 이웃 묶음 ${clusters.length}, 새로 잰 것 ${got.todo}, ${((Date.now() - t0) / 1000).toFixed(0)}초 → data/studymap-atlas.json`,
);
