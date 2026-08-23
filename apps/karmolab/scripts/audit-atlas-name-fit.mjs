#!/usr/bin/env node
/**
 * audit-atlas-name-fit — **이름이 그 무리와 어울리나** (TASK-KAR-233).
 *
 * 우리는 이름을 c-TF-IDF 로 뽑고 「글에 실제로 나오는 말인가」(98%)만 쟀다. 그런데
 * 글에 있는 말이어도 **그 무리를 대표하지 않을 수** 있다 — 그건 한 번도 안 쟀다.
 * 주제 이름 품질의 정본이 **응집도**(topic coherence, Röder 외 WSDM 2015)다.
 * 조합은 c_npmi: 미끄러지는 창 10 · 한 쌍씩 · NPMI · 평균.
 *
 * ★ **값 하나는 아무 뜻이 없다** — 말뭉치마다 눈금이 다르다. 그래서 같은 이름을
 * **남의 무리 글로도** 재서 견준다. 제 무리에서 더 높아야 그 이름이 제 무리 것이다.
 *
 * 이 자가 보는 것 넷 (합격선은 재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① **눈금** — 지어낸 자료에서 제 이름이 엉뚱한 이름보다 높다 (20쌍 중 18 이상)
 *  ② 실린 값이 **다시 재도 맞나**
 *  ③ **제 무리 값 > 남의 무리 값**인 이름이 80% 이상
 *  ④ 이름을 남의 무리 것으로 **바꿔치면 값이 떨어진다**
 *
 * ⚠ 둘 다 -1(어디서도 같이 안 나옴)이면 **못 잰 것**으로 빼 둔다 — 잴 수 없는 것을
 * 실패로 세면 그 자는 벌주는 자가 된다. 굽는 쪽도 같은 규칙이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);
/* ★ **가짜 지도로는 이 자를 못 댄다.** 조용히 통과시키지 않고 **왜 안 도는지 말한다** —
   건너뛴 검사는 통과한 검사가 아니다. 진짜로 구운 뒤 `npm run atlas` 에서 돈다. */
if (isFake(ATLAS)) { console.log('[name-fit] 가짜 지도다 — 이름이 그 무리 것인지는 진짜 굽기에서만 잰다'); process.exit(0); }

if (!fs.existsSync(ATLAS)) {
  console.log('[name-fit] 지도가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bad = [];

/* 굽는 쪽 함수를 빌려 오면 「자기가 자기를 확인」이다 — 여기서 따로 구현한다. 정의는 같게. */
const WIN = 10;
const EPS = 1e-12;
const SPLIT = /[^0-9A-Za-z가-힣\s]+/;
const wordsIn = (s) => String(s).split(/\s+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));

function stats(texts, vocab) {
  const single = new Map(); const pair = new Map();
  let windows = 0;
  for (const t of texts) {
    const toks = [];
    for (const run of String(t).split(SPLIT)) {
      for (const w of run.split(/\s+/)) if (w.length >= 2 && !/^\d+$/.test(w)) toks.push(w);
    }
    if (!toks.length) continue;
    const last = Math.max(1, toks.length - WIN + 1);
    for (let i = 0; i < last; i += 1) {
      const seen = new Set();
      for (let j = i; j < Math.min(i + WIN, toks.length); j += 1) if (vocab.has(toks[j])) seen.add(toks[j]);
      windows += 1;
      const arr = [...seen];
      for (const w of arr) single.set(w, (single.get(w) || 0) + 1);
      for (let a = 0; a < arr.length; a += 1) {
        for (let b = a + 1; b < arr.length; b += 1) {
          const k = arr[a] < arr[b] ? `${arr[a]}|${arr[b]}` : `${arr[b]}|${arr[a]}`;
          pair.set(k, (pair.get(k) || 0) + 1);
        }
      }
    }
  }
  return { windows: windows || 1, single, pair };
}

function npmi(st, a, b) {
  if (a === b) return null;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  const pa = (st.single.get(a) || 0) / st.windows;
  const pb = (st.single.get(b) || 0) / st.windows;
  if (!pa || !pb) return null;
  const pab = (st.pair.get(k) || 0) / st.windows;
  if (!pab) return -1;
  return Math.log((pab + EPS) / (pa * pb)) / -Math.log(pab + EPS);
}

function fitOf(texts, nameWords, topWords) {
  const st = stats(texts, new Set([...nameWords, ...topWords]));
  const vals = [];
  for (const a of nameWords) for (const b of topWords) { const v = npmi(st, a, b); if (v != null) vals.push(v); }
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
}

// ── ① 눈금 (지어낸 자료 — 지도가 없어도 돈다) ─────────────────────────
{
  let seed = 5;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  /* 무리마다 제 말주머니를 준다. 「제 이름」은 그 주머니 말, 「엉뚱한 이름」은 남의 주머니 말. */
  const BAGS = [
    ['빌드', '배포', '파이프라인', '캐시', '아티팩트'],
    ['고양이', '사료', '털', '병원', '산책'],
    ['환율', '금리', '채권', '증시', '배당'],
    ['렌더', '셰이더', '텍스처', '메시', '프레임'],
  ];
  let win = 0; let total = 0;
  for (let g = 0; g < BAGS.length; g += 1) {
    const bag = BAGS[g];
    const texts = [];
    for (let d = 0; d < 40; d += 1) {
      const w = [];
      for (let i = 0; i < 120; i += 1) w.push(bag[Math.floor(rnd() * bag.length)]);
      texts.push(w.join(' '));
    }
    const top = bag.slice(1);
    for (let o = 0; o < BAGS.length; o += 1) {
      if (o === g) continue;
      total += 1;
      const mineName = [bag[0]];
      const wrongName = [BAGS[o][0]];
      const a = fitOf(texts, mineName, top);
      const b = fitOf(texts, wrongName, top);
      if (a != null && (b == null || a > b)) win += 1;
    }
  }
  console.log(`  ① 눈금 — 제 이름이 엉뚱한 이름보다 높다 ${win}/${total}쌍`);
  if (win < Math.ceil(total * 0.9)) bad.push(`지어낸 자료에서도 제 이름을 못 고른다 (${win}/${total})`);
}

// ── ②③④ 실린 값 (진짜 글 몸통으로 다시 잰다) ────────────────────────
/* **제목만으로는 못 잰다.** 처음엔 지도에 실린 제목으로 다시 재려 했는데, 창 10 낱말
   안에 이름 말과 대표어가 같이 들 일이 거의 없어 전부 -1 이 나왔다 — 「다시 재기」가
   아무것도 안 하는 안전장치였다(이 세션에서 네 번째로 잡은 no-op). 굽는 쪽과 같은
   재료(글 몸통)를 쓴다. */
const levels = atlas.levels || [];
const withFit = levels.filter((lv) => lv.fit && lv.fit.judged);
if (!withFit.length) {
  if (isFake(ATLAS)) {
    console.log('[name-fit] 가짜 지도다 — 이름 적합도는 진짜 굽기에서만 나온다. ②③④ 건너뜀');
  } else {
    bad.push('진짜 지도인데 **이름 적합도가 안 실려 있다** (levels[].fit)');
  }
} else if (isFake(ATLAS)) {
  console.log('[name-fit] 가짜 지도다 — ②③④ 건너뜀');
} else {
  const { collect, attachLinkBodies } = await import(new URL('./build-memo-atlas.mjs', import.meta.url).href);
  const docs = collect();
  /* **굽는 쪽과 같은 재료여야 한다.** 북마크 글은 본문이 링크뿐이라, 굽기가 미리 펼쳐 둔
     본문(`.link-bodies.json`)을 붙인다. 그걸 안 붙이고 재면 같은 이름인데 값이 딴판이다 —
     실제로 「bookmark」 무리에서 -0.543 vs -0.270 으로 갈렸고, 그걸 「실린 값이 틀렸다」로
     읽을 뻔했다. 재는 쪽도 같은 손질을 하고 시작한다(셈은 여전히 여기서 따로 한다). */
  attachLinkBodies(docs);
  const body = new Map(docs.map((d) => [d.id, `${d.title} ${d.text}`]));
  const textsOf = (docs) => docs.map((d) => body.get(d.id)).filter(Boolean);

  /* 층 합산 판정용 — 표본이 작아 혼자서는 검정력이 없는 층이 여기로 미뤄진다. */
  const pooled = { better: 0, judged: 0, defer: [] };
  levels.forEach((lv, li) => {
    const f = lv.fit;
    if (!f || !f.judged) return;
    const groups = Array.from({ length: lv.k }, () => []);
    for (const d of atlas.docs) {
      const c = Array.isArray(d.levels) ? d.levels[li] : null;
      if (c != null && c >= 0 && c < lv.k) groups[c].push(d);
    }
    /* ★ **비긴 것을 어긋남으로 세지 않는다** (2026-08-23). 제 무리와 남의 무리 값이 거의 같으면
       (여기선 0.01 안) 어느 쪽이 높다는 말 자체가 뜻이 없다 — 뽑는 표본이 한 편만 달라도 뒤집힌다.
       실제로 층 30 에서 값 차이 0.005 짜리 하나가 뒤집혀 「자료를 안 따른다」로 빨개졌다.
       비긴 것은 **비겼다고 세고**, 판정이 갈리는 것만 어긋남으로 센다. */
    const TIE = 0.01;
    let same = 0; let judged = 0; let gap = 0; let ties = 0;
    f.names.forEach((one, ci) => {
      if (!one || one.own == null || one.other == null) return;
      const nameWords = wordsIn(one.name);
      const topWords = [...new Set((lv.words?.[ci] || []).flatMap(wordsIn))].filter((w) => !nameWords.includes(w)).slice(0, 10);
      const mine = textsOf(groups[ci]);
      if (!nameWords.length || topWords.length < 2 || mine.length < 3) return;
      /* **남의 무리를 굽는 쪽과 같은 차례로 뽑는다.** 처음엔 지도 순서대로 뽑았더니
         고르는 글이 달라져 아슬아슬한 이름 둘의 판정이 뒤집혔다(값 차이는 0.000).
         자료가 아니라 **뽑는 차례**가 만든 차이였다 — 규칙을 같게 두고 셈만 따로 한다. */
      /* ★ **남의 무리는 지도가 실어 보낸 그 글로** 잰다 (`otherIds`). 자가 제 나름대로 다시
         뽑으면 자료가 아니라 **뽑기가 만든 차이**를 재게 된다 — 실측으로 남의 무리 값이
         0.842 vs 0.476 로 갈렸다(2026-08-23). 실루엣이 `silOn` 을 싣는 것과 같은 까닭.
         옛 지도(그 목록이 없는 판)는 예전처럼 스스로 뽑되, 그렇게 잰 것은 판정에서 뺀다. */
      const rest = groups.filter((_, j) => j !== ci).flat();
      const byId2 = new Map(rest.map((d) => [d.id, d]));
      const listed = Array.isArray(one.otherIds) && one.otherIds.length
        ? one.otherIds.map((id) => byId2.get(id)).filter(Boolean)
        : null;
      const step = Math.max(1, Math.floor(rest.length / groups[ci].length));
      const theirs = textsOf(listed || rest.filter((_, k) => k % step === 0).slice(0, groups[ci].length));
      if (theirs.length < 3) return;
      const a = fitOf(mine, nameWords, topWords);
      const b = fitOf(theirs, nameWords, topWords);
      if (a == null || b == null) return;
      gap = Math.max(gap, Math.abs(a - one.own), listed ? Math.abs(b - one.other) : 0);
      /* 목록 없는 옛 지도는 남의 무리를 스스로 뽑은 것이라 판정을 견줄 수 없다 — 세지 않는다. */
      if (!listed) { ties += 1; return; }
      if (Math.abs(a - b) < TIE || Math.abs(one.own - one.other) < TIE) { ties += 1; return; }
      judged += 1;
      if ((a > b) === (one.own > one.other)) same += 1;
      else console.log(`     ↳ 층 ${lv.k} 「${one.name}」 — 실린 값 ${one.own.toFixed(3)}/${one.other.toFixed(3)}`
        + ` · 다시 재니 ${a.toFixed(3)}/${b.toFixed(3)}`);
    });
    const rate = f.better / f.judged;
    console.log(`  ② 층 ${lv.k} — 제 무리에서 더 높은 이름 ${f.better}/${f.judged} (${Math.round(rate * 100)}%)`
      + ` · 평균 ${f.mean}`
      + (judged ? ` · 다시 재도 같은 판정 ${same}/${judged} (값 차이 최대 ${gap.toFixed(3)}`
        + `${ties ? ` · 비긴 것 ${ties}개는 뺐다` : ''})` : ` · **다시 못 쟀다**${ties ? ` (전부 비겼다 ${ties}개)` : ''}`));
    /**
     * ★ 문턱 0.8 은 **박아 둔 상수**였다. 층 14 는 이름이 열넷뿐이라 한 개가 7%다 —
     * 11/14(78.6%)가 12/14(85.7%)로 바뀌는 것이 「근거가 선다/안 선다」를 갈랐고,
     * 글이 늘자 그 한 개에 밀려 빨개졌다. 이제 **우연 수준(찍기 50%)에 대고 이항검정**한다:
     * 이름이 제 무리와 남의 무리 중 아무 쪽에나 더 맞을 확률이 반반일 때, 이만큼 맞을
     * 확률이 얼마인가. 자료가 늘어도 자가 같이 움직인다.
     */
    const binomP = (k, n) => {
      if (!n) return 1;
      let acc = 0; let c = 1;
      for (let i = 0; i <= n; i += 1) {
        if (i >= k) acc += c;
        c = (c * (n - i)) / (i + 1);
      }
      return acc / 2 ** n;
    };
    const p = binomP(f.better, f.judged);
    console.log(`  ② 층 ${lv.k} — 찍기(50%)에 대고 재면 p ${p.toFixed(4)}`
      + ` (${f.better}/${f.judged} · 0.05 밑이면 우연이 아니다)`);
    /**
     * ★ 같은 병의 반대쪽 끝 — 층에 이름이 6개뿐이면 p<0.05 는 **6/6(무결점)만** 통과한다
     * (5/6 의 최선이 p 0.109). 그건 「찍기를 이긴다」가 아니라 「한 번도 틀리지 마라」다.
     * 코퍼스가 1918→749 로 줄며 실제로 걸렸다. 하나 틀려도 p<0.05 가 **수학적으로 불가능한
     * 층**(judged ≤ 7)은 층 혼자 판정하지 않고 **전 층 합산 이항검정**으로 미룬다 —
     * 방향(>50%)은 층에서 확인하고, 우연 여부는 표본이 서는 자리에서 묻는다.
     */
    if (p >= 0.05) {
      const powerless = binomP(f.judged - 1, f.judged) >= 0.05;
      if (powerless && rate > 0.5) pooled.defer.push({ k: lv.k, better: f.better, judged: f.judged, p });
      else bad.push(`층 ${lv.k} — 이름이 제 무리에 더 맞는 것이 ${f.better}/${f.judged} 라 **찍기와 못 가른다** (p ${p.toFixed(3)})`);
    }
    pooled.better += f.better; pooled.judged += f.judged;
    if (!judged) {
      bad.push(`층 ${lv.k} — 실린 값을 하나도 다시 못 쟀다 (재료가 안 맞는다)`);
    } else {
      if (same < judged) bad.push(`층 ${lv.k} — 다시 재니 판정이 ${same}/${judged} 만 같다 (실린 값이 자료를 안 따른다)`);
      if (gap > 0.05) bad.push(`층 ${lv.k} — 실린 값과 다시 잰 값이 ${gap.toFixed(3)} 벌어진다`);
    }
  });
  /* 미뤄진 층의 합산 판정 — 모든 층을 합친 이항검정이 서면 그 층도 우연이 아니라고 본다. */
  if (pooled.defer.length) {
    const binomP = (k, n) => {
      if (!n) return 1;
      let acc = 0; let c = 1;
      for (let i = 0; i <= n; i += 1) {
        if (i >= k) acc += c;
        c = (c * (n - i)) / (i + 1);
      }
      return acc / 2 ** n;
    };
    const p = binomP(pooled.better, pooled.judged);
    console.log(`  ② 합산 — 층 ${pooled.defer.map((d) => d.k).join(',')} 는 표본이 작아(하나 틀려도 p≥0.05)`
      + ` 전 층 합산으로 판정: ${pooled.better}/${pooled.judged} · p ${p.toFixed(6)}`);
    if (p >= 0.05) {
      for (const d of pooled.defer) {
        bad.push(`층 ${d.k} — ${d.better}/${d.judged} 이고 합산(${pooled.better}/${pooled.judged}, p ${p.toFixed(3)})도 못 가른다`);
      }
    }
  }

  /* ④ **이름을 옆 무리 것으로 바꿔치면 떨어져야 한다.** 안 떨어지면 이 자는 이름을 안 보고 있다.
     견줌이 공평하도록 대표어에서 **두 이름의 말을 다 뺀다**(자기 이름이 대표어에 들어 있으면
     그것만으로 이기는데, 그건 이름을 잰 게 아니다). */
  /* **층 하나로는 표본이 모자란다** — 성긴 층(6개)에서는 걸어 볼 수 있는 무리가 둘뿐이었다.
     층 전부를 돈다. 「몇 번 걸어 봤나」도 같이 적는다(적으면 그것 자체가 실패다). */
  let dropped = 0; let tried = 0;
  for (const lv of withFit) {
  const li = levels.indexOf(lv);
  const groups = Array.from({ length: lv.k }, () => []);
  for (const d of atlas.docs) {
    const c = Array.isArray(d.levels) ? d.levels[li] : null;
    if (c != null && c >= 0 && c < lv.k) groups[c].push(d);
  }
  for (let ci = 0; ci < lv.k; ci += 1) {
    const other = (ci + 1) % lv.k;
    const mineName = wordsIn(lv.names[ci] || '');
    const swapName = wordsIn(lv.names[other] || '');
    const topWords = [...new Set((lv.words?.[ci] || []).flatMap(wordsIn))]
      .filter((w) => !mineName.includes(w) && !swapName.includes(w)).slice(0, 10);
    const mine = textsOf(groups[ci]);
    if (!mineName.length || !swapName.length || mine.length < 3 || topWords.length < 2) continue;
    const a = fitOf(mine, mineName, topWords);
    const b = fitOf(mine, swapName, topWords);
    if (a == null || b == null || (a === -1 && b === -1)) continue;
    tried += 1;
    if (a > b) dropped += 1;
    else if (process.env.FITDBG) console.log(`     [바꿔치기 실패] 층${lv.k} 「${lv.names[ci]}」(${a.toFixed(3)}) ← 「${lv.names[other]}」(${b.toFixed(3)}) · 대표어 ${topWords.slice(0,4).join(',')}`);
  }
  }
  console.log(`  ④ 이름을 옆 무리 것으로 바꿔치니 값이 떨어진 무리 ${dropped}/${tried}`);
  if (tried < 3) {
    bad.push(`바꿔치기를 ${tried}번밖에 못 걸었다 — 이 자는 아무것도 안 확인한 것이다`);
  } else if (dropped / tried < 0.7) {
    bad.push(`이름을 바꿔쳐도 값이 안 떨어진다 (${dropped}/${tried}) — 이 자는 이름을 안 보고 있다`);
  }
}

// ── ⑤ 이름을 **다른 방식으로도 재 봤나**, 그리고 **결과를 따랐나** ─────────
/* 이름을 임베딩 닮음+MMR 로도 골라 보고(KeyBERT 식), **적합도가 오를 때만** 바꾸기로 했다.
   그 판단을 **표시로 믿지 않는다** — 표를 실어 두고 자가 **다시 세운다**.
   (실측: 어느 λ 에서도 적합도가 떨어졌다 → 안 바꿨다. 그게 맞는 판단인지 여기서 건다.) */
for (const L of atlas.levels || []) {
  const m = L.nameMmr;
  if (!m) { bad.push(`층 ${L.k} — 이름을 다른 방식으로 재 본 표가 없다 (nameMmr)`); continue; }
  const better = m.rows.filter((r) => r.dup === 0 && r.mean != null && m.base.mean != null
    && r.mean > m.base.mean && r.better >= m.base.better);
  const want = better.length ? better.slice().sort((a, b) => b.mean - a.mean)[0].lam : null;
  console.log(`  ⑤ 층 ${L.k} — 지금 ${m.base.mean} · 다른 방식 ${m.rows.map((r) => r.mean).join(' ')}`
    + ` → 골랐어야 할 것 ${want === null ? '없음(안 바꾸는 게 맞다)' : `λ${want}`} · 실제 ${m.picked === null ? '안 바꿈' : `λ${m.picked}`}`);
  if (want !== m.picked) {
    bad.push(`층 ${L.k} — 표대로면 ${want === null ? '안 바꿔야' : `λ${want} 를 써야`} 하는데`
      + ` ${m.picked === null ? '안 바꿨다' : `λ${m.picked} 를 썼다`}`);
  }
  if (m.picked !== null && !String(L.nameWay || '').includes('MMR')) {
    bad.push(`층 ${L.k} — λ${m.picked} 를 썼다면서 이름 짓는 법을 「${L.nameWay}」 라 적었다`);
  }
}

if (bad.length) {
  console.log('[name-fit] **이름이 그 무리 것이라는 근거가 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  이름 뽑는 손(c-TF-IDF)이나 재는 창(10낱말)을 봐라.');
  process.exit(1);
}
console.log('[name-fit] 이름이 남의 무리보다 제 무리에서 더 잘 맞는다 (응집도 c_npmi 로 견줌)');
