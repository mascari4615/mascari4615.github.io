// 핸드헬드 포즈 로그 판정기. 튄다 / 저 혼자 움직인다가 어느 단계에서 생기나.
//
//   node pose-analyze.mjs <HandheldLogs 폴더 또는 pose-*.csv>
//
// 세 단계를 같은 잣대로 잰다: raw(폰 원본), conv(좌표변환 후), shown(보간, 리센터 후).
// raw 에서 이미 튀면 ARCore/폰, shown 에서만 튀면 우리 코드다.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const arg = process.argv[2];
if (!arg) { console.error('사용: node pose-analyze.mjs <폴더 또는 pose-*.csv>'); process.exit(2); }

// ── 파일 고르기 (폴더면 가장 최근 것) ────────────────────────────────────────
let posePath;
if (statSync(arg).isDirectory()) {
  const files = readdirSync(arg).filter(f => f.startsWith('pose-') && f.endsWith('.csv')).sort();
  if (!files.length) { console.error(`❌ ${arg} 에 pose-*.csv 가 없다`); process.exit(2); }
  posePath = join(arg, files[files.length - 1]);
} else posePath = arg;
const shownPath = join(dirname(posePath), basename(posePath).replace(/^pose-/, 'shown-'));

// ★ 성한 줄만 쓴다 (2026-08-21). 기록을 닫기 전에 프로세스가 죽으면 **마지막 줄이 반쪽**으로
//   남는다. 그 한 줄의 NaN 이 Math.max 를 통째로 NaN 으로 만들고, NaN 비교는 전부 false 라
//   튐 0회로 읽힌다. 조용히 틀리는 부류다. 실측으로 그 일이 났다.
//   버린 줄 수는 **반드시 찍는다**. 말 없이 버리면 그게 다음 함정이 된다.
const readCsv = (p, label) => {
  const lines = readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const rows = [];
  let dropped = 0;
  for (const l of lines.slice(1)) {
    const c = l.split(',');
    if (c.length !== head.length) { dropped++; continue; }        // 잘린 줄
    const o = {};
    let ok = true;
    head.forEach((h, i) => {
      const v = c[i];
      if (v === '' || v === undefined) { o[h] = null; return; }   // 빈칸은 모름
      o[h] = /^-?[\d.]+$/.test(v) ? +v : v;
      if (typeof o[h] === 'number' && !Number.isFinite(o[h])) ok = false;
    });
    if (!ok) { dropped++; continue; }
    rows.push(o);
  }
  if (dropped) console.log(`  ⚠ ${label}: 성하지 않은 줄 ${dropped}개를 버렸다 (잘렸거나 숫자가 아니다)`);
  return rows;
};

const pose = readCsv(posePath, 'pose');
let shown = [];
try { shown = readCsv(shownPath, 'shown'); } catch { }

console.log(`포즈 ${pose.length}줄, 화면 ${shown.length}줄. ${basename(posePath)}`);
if (pose.length < 20) { console.error('❌ 표본이 너무 적다 (20줄 미만). 더 길게 기록해라'); process.exit(2); }

// ── 쿼터니언 도구 ────────────────────────────────────────────────────────────
const qNorm = q => { const n = Math.hypot(...q) || 1; return q.map(v => v / n); };
// 두 자세 사이 각도(도)
const qAngle = (a, b) => {
  a = qNorm(a); b = qNorm(b);
  let d = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  d = Math.min(1, d);
  return 2 * Math.acos(d) * 180 / Math.PI;
};
// 요/피치 (Unity 규약: Y 위, Z 앞). 짐벌 가설을 재려면 피치가 필요하다
const qToYawPitch = ([x, y, z, w]) => {
  const fx = 2*(x*z + w*y), fy = 2*(y*z - w*x), fz = 1 - 2*(x*x + y*y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -fy))) * 180 / Math.PI;
  const yaw = Math.atan2(fx, fz) * 180 / Math.PI;
  return { yaw, pitch };
};
const dAngle = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

const pct = (arr, p) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(s.length*p))]; };

// ── 단계별 각속도 ────────────────────────────────────────────────────────────
// ★ 튄다= **바로 직전 흐름과의 불연속**이다 (2026-08-21 다시 세움).
//   전역 중앙값 대비로 재면 폰이 얼마나 가만히 있었나가 판정을 지배한다. 실측:
//     8350줄(대부분 정지): 중앙값 0.07도/초 -> 문턱 1.4 -> 튐 956회(손떨림까지 셌다)
//     1008줄(계속 움직임): 중앙값 37도/초  -> 문턱 742 -> 튐 0회(진짜 튐도 놓쳤다)
//   같은 기계, 같은 현상인데 정반대다. 그래서 **주변(±window) 중앙값**과 견준다.
//
//   바닥도 깐다. 주변이 완전히 정지면 주변 중앙값이 0 이 되어 아무 흔들림이나 배수를 넘는다.
//   절대 문턱은 원칙적으로 금지지만, domain-wm § 관문 2 는 (c) 사람이 느끼는 선을
//   예외로 둔다. 뷰파인더에서 **한 프레임에 2° 이상 튀면 눈에 보인다**. 그 선을 쓴다.
const VISIBLE_STEP_DEG = 2;      // 한 프레임에 이만큼 뛰면 사람이 알아본다
const LOCAL_WINDOW = 30;         // 주변 ±30 표본 (60Hz 면 약 ±0.5초)

function localMedian(arr, i, w) {
  const a = arr.slice(Math.max(0, i - w), Math.min(arr.length, i + w + 1)).filter(Number.isFinite);
  if (!a.length) return 0;
  a.sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function stage(rows, name, qk, pk, tk = 't_ms') {
  const out = { name, rate: [], step: [], yawRate: [], gap: [], samples: rows.length };
  for (let i = 1; i < rows.length; i++) {
    const dt = (rows[i][tk] - rows[i-1][tk]) / 1000;
    if (dt <= 0 || dt > 0.5) continue;
    const qa = qk.map(k => rows[i-1][k]), qb = qk.map(k => rows[i][k]);
    out.rate.push(qAngle(qa, qb) / dt);
    out.step.push(qAngle(qa, qb));   // 한 걸음 각도. 사람 눈에 보이는 건 이것이다
    out.yawRate.push(Math.abs(dAngle(qToYawPitch(qNorm(qb)).yaw, qToYawPitch(qNorm(qa)).yaw)) / dt);
    if (pk) {
      const pa = pk.map(k => rows[i-1][k]), pb = pk.map(k => rows[i][k]);
      out.gap.push(Math.hypot(pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]) / dt);
    }
    out.dt = dt;
  }
  return out;
}

const raw   = stage(pose, 'raw   (폰 원본)',      ['raw_qx','raw_qy','raw_qz','raw_qw'],    ['raw_px','raw_py','raw_pz']);
const conv  = stage(pose, 'conv  (좌표변환 후)',  ['conv_qx','conv_qy','conv_qz','conv_qw'],['conv_px','conv_py','conv_pz']);
const shownStage   = shown.length ? stage(shown, 'shown (보간, 리센터 후)',
                ['shown_qx','shown_qy','shown_qz','shown_qw'], ['shown_px','shown_py','shown_pz']) : null;

console.log('\n── 각속도 (도/초) ─────────────────────────────────────────');
console.log('단계                     중앙값   p95     p99     최대     ┃ 요만');
for (const s of [raw, conv, shownStage].filter(Boolean)) {
  const r = s.rate, y = s.yawRate;
  console.log(`${s.name.padEnd(22)} ${pct(r,.5).toFixed(1).padStart(7)} ${pct(r,.95).toFixed(1).padStart(7)} ` +
              `${pct(r,.99).toFixed(1).padStart(7)} ${Math.max(...r).toFixed(1).padStart(8)}  ┃ ` +
              `p99 ${pct(y,.99).toFixed(1)} 최대 ${Math.max(...y).toFixed(1)}`);
}

// ── 튐 판정. 중앙값 대비 몇 배인가 (절대 ms/도 문턱을 안 쓴다) ──────────────
// ── 튐 판정. 주변 흐름과의 불연속 ──────────────────────────────────────────
// ★ 전역 중앙값 대비는 **폰이 얼마나 가만히 있었나**에 지배된다 (2026-08-21 실측):
//     8350줄(대부분 정지): 중앙값 0.07도/초 -> 문턱 1.4 -> 튐 956회 (손떨림까지 셌다)
//     1008줄(계속 움직임): 중앙값 37도/초  -> 문턱 742 -> 튐 0회 (진짜 튐도 놓쳤다)
//   같은 기계, 같은 현상인데 정반대다. 그래서 **주변(±window) 중앙값**과 견준다 . 
//   튄다는 전역 평균과의 차가 아니라 **바로 직전 흐름과의 불연속**이기 때문이다.
console.log('\n── 튐 (주변 흐름 대비 불연속, 사람이 보는 크기) ──────────');
console.log(`   기준: 주변 ±${LOCAL_WINDOW}표본 중앙값의 8배 초과 **이면서** 한 걸음 ${VISIBLE_STEP_DEG}° 이상`);
let verdict = [];
for (const s of [raw, conv, shownStage].filter(Boolean)) {
  const spikes = [];
  for (let i = 0; i < s.rate.length; i++) {
    const v = s.rate[i], step = s.step[i];
    if (!Number.isFinite(v) || !Number.isFinite(step)) continue;
    if (step < VISIBLE_STEP_DEG) continue;              // 사람이 못 보는 크기는 튐이 아니다
    const lm = localMedian(s.rate, i, LOCAL_WINDOW);
    if (v > Math.max(lm * 8, 1e-6)) spikes.push(step);
  }
  const worst = spikes.length ? Math.max(...spikes) : 0;
  console.log(`${s.name.padEnd(22)} ${String(spikes.length).padStart(4)}회 / ${s.rate.length}표본, 가장 큰 걸음 ${worst.toFixed(1)}°`);
  verdict.push({ name: s.name, spikes: spikes.length, ratio: worst });
}

const rawSpike = verdict[0].spikes, shownSpike = verdict[2]?.spikes ?? 0;
console.log('');
if (rawSpike > 0)
  console.log(`▶ 판정: **폰 원본에서 이미 튄다** (${rawSpike}회). ARCore VIO 쪽. 우리 코드 문제가 아니다.\n` +
              `  다음: 리로컬라이즈 완충(각속도 상한, 이상치 버리기)을 우리 쪽에 둘지 결정.`);
else if (shownSpike > 0)
  console.log(`▶ 판정: **원본은 매끄러운데 보간, 리센터 뒤에서 튄다** (${shownSpike}회). 우리 코드다.\n` +
              `  다음: 리센터 yaw 보정(eulerAngles)의 짐벌을 의심. 아래 피치 상관을 볼 것.`);
else
  console.log('▶ 판정: 이 기록에는 튐이 없다. 증상이 난 구간을 다시 기록해라 (짧게, 튄 직후 정지).');

// ── 짐벌 가설: 튐이 피치 ±90° 근처에 몰리나 ─────────────────────────────────
if (shown.length) {
  const rows = shown;
  const hits = [];
  for (let i = 1; i < rows.length; i++) {
    const dt = (rows[i].t_ms - rows[i-1].t_ms) / 1000;
    if (dt <= 0 || dt > 0.5) continue;
    const qa = qNorm(['shown_qx','shown_qy','shown_qz','shown_qw'].map(k => rows[i-1][k]));
    const qb = qNorm(['shown_qx','shown_qy','shown_qz','shown_qw'].map(k => rows[i][k]));
    hits.push({ rate: qAngle(qa, qb) / dt, pitch: Math.abs(qToYawPitch(qb).pitch) });
  }
  const med = pct(hits.map(h => h.rate), .5) || 1e-6;
  const spikes = hits.filter(h => h.rate > med * 20);
  if (spikes.length) {
    const near = spikes.filter(h => h.pitch > 60).length;
    console.log('\n── 짐벌 가설 (리센터 yaw 보정이 eulerAngles 를 쓴다) ───────');
    console.log(`튄 순간 ${spikes.length}회 중 피치 |60°| 초과가 ${near}회 (${(near*100/spikes.length).toFixed(0)}%)`);
    const base = hits.filter(h => h.pitch > 60).length / hits.length;
    console.log(`전체 표본 중 피치 |60°| 초과는 ${(base*100).toFixed(0)}%`);

    // 대조군이 없으면 판정하지 않는다. 전부 가파르거나 전부 완만하면 이 잣대는
    // 같은 값을 낼 수밖에 없다. 그때 기각이라 적으면 거짓 초록이다.
    if (base > 0.9 || base < 0.02)
      console.log(`  → CANNOT-RUN: 대조군이 없다 (전체의 ${(base*100).toFixed(0)}% 가 이미 그 구간).\n` +
                  `    가파른 자세와 완만한 자세를 **둘 다** 담아 다시 기록해라.`);
    else if (spikes.length < 5)
      console.log(`  → CANNOT-RUN: 튄 순간이 ${spikes.length}회뿐이라 비율을 못 믿는다 (5회 이상 필요).`);
    else if (near / spikes.length > base * 2)
      console.log('  → 튐이 가파른 피치에 몰린다 = **짐벌 가설 지지**');
    else
      console.log('  → 피치와 상관 없다 = 짐벌 가설 기각, 다른 원인을 봐라');
  }
}

// ── 망 지터: 튐이 늦게 도착한 순간과 겹치나 ─────────────────────────────
// 이게 WebRTC 로 갈지 말지를 가른다. 포즈와 뷰파인더가 WS 하나를 같이 타므로,
// 영상이 업링크를 채우는 순간 포즈가 그 뒤에 줄 선다는 가설이 있다.
// 재는 법: jitter_ms = (우리 시계 도착 간격) - (폰 시계 송신 간격).
//   두 시계의 원점, 걸음이 달라도 *간격끼리* 빼면 그 차이는 사라진다.
//   폰이 균일하게 보냈는데 도착이 들쭉날쭉하면 여기에만 남는다.
{
  const hasJitter = pose.length && pose[0].jitter_ms !== undefined;
  console.log('\n── 망 지터 (도착 간격 - 폰 송신 간격) ─────────────────────');
  if (!hasJitter) {
    console.log('  → CANNOT-RUN: 이 기록에 jitter_ms 칸이 없다 (옛 판으로 찍은 로그다).');
  } else {
    const j = pose.map(r => r.jitter_ms).filter(v => typeof v === 'number' && Number.isFinite(v));
    if (j.length < 20) {
      console.log(`  → CANNOT-RUN: 잴 줄이 ${j.length}개뿐이다 (20 이상 필요).`);
    } else {
      const absJ = j.map(Math.abs);
      const med = pct(absJ, .5) || 1e-6;
      const p95 = pct(absJ, .95);
      const rtt = pose.map(r => r.rtt_ms).filter(v => typeof v === 'number' && Number.isFinite(v));
      console.log(`표본 ${j.length}, 지터 중앙값 ${med.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`
        + (rtt.length ? `, RTT 중앙값 ${pct(rtt, .5).toFixed(0)}ms (표본 ${rtt.length})` : ', RTT 못 쟀다'));

      // 늦게 온 순간 = 지터가 중앙값의 여러 배. 절대 ms 문턱은 쓰지 않는다(기계를 탄다).
      // 대조가 있나부터 본다. 두 가지가 판정을 못 하게 만든다:
      //   ⓐ 지터가 아예 없다 → 잴 것이 없다
      //   ⓑ 통째로 늦다 → **중앙값도 같이 올라가** 아무것도 문턱을 못 넘는다.
      //      그러면 늦음 0회로 읽히는데 사실은 고르게 늦다다.
      // 절대 ms 는 안 쓴다. ⓑ 는 퍼짐(p95/중앙값)으로 가른다. 고르면 1 에 가깝다.
      //
      // 문턱도 중앙값 하나에만 기대지 않는다. 대부분이 깨끗하면 중앙값이 0 이 되어
      // `중앙값×8` 이 0 이 되고, 그러면 아주 작은 흔들림까지 늦음이 된다.
      // 그래서 위쪽 꼬리(p95)의 절반도 같이 문턱으로 쓴다. 둘 중 큰 것.
      // ★ 꼬리는 p95 가 아니라 **최댓값**으로 본다 (2026-08-21, 합성 로그로 확인).
      //   우리가 찾는 튐은 드물다. 400줄에 7번이면 1.75% 라 p95 는 아직 0 이다.
      //   p95 로 문턱을 세우면 지터가 아예 없다로 읽혀 판정 자체가 사라진다.
      //   최댓값은 이상치 하나에 흔들리지만, 아래 5회 이상 조건이 그걸 받친다.
      const maxJ = Math.max(...absJ);
      const spread = med > 0 ? maxJ / med : Infinity;
      const lateCut = Math.max(med * 8, maxJ * 0.5);

      const lateIdx = new Set();
      pose.forEach((r) => { if (Math.abs(r.jitter_ms) > lateCut) lateIdx.add(r.seq); });
      const base = lateIdx.size / j.length;

      if (maxJ === 0) {
        console.log('  → CANNOT-RUN: 이 기록엔 지터가 아예 없다 (최대 0ms). 잴 것이 없다.');
      } else if (spread < 2) {
        console.log(`  → CANNOT-RUN: 지터에 대조가 없다 (최대/중앙값 = ${spread.toFixed(1)}).`
          + ' 고르게 늦은 기록이라 이 순간만 늦었다를 가릴 수 없다.');
      } else if (lateIdx.size < 5) {
        console.log(`  → CANNOT-RUN: 늦게 온 순간이 ${lateIdx.size}회뿐이라 상관을 못 믿는다 (5회 이상 필요).`);
      } else if (base > 0.9) {
        console.log(`  → CANNOT-RUN: 대조군이 없다 (${(base*100).toFixed(0)}% 가 이미 늦음).`
          + ' 망이 통째로 나쁜 기록이라 이 잣대로는 못 가른다.');
      } else if (!shown.length) {
        console.log(`늦게 온 순간 ${lateIdx.size}회 (전체의 ${(base*100).toFixed(0)}%)`);
        console.log('  → shown 로그가 없어 튐과의 상관은 못 본다.');
      } else {
        // shown 에서 튄 순간을 같은 방식(중앙값 대비)으로 뽑고, 그 seq 가 늦게 온 seq 와 겹치나 본다.
        // ★ 각속도(°/s)가 아니라 **한 걸음의 각도(°)** 로 센다 (2026-08-21).
        //   늦게 온 순간은 dt 가 커지므로 속도로 재면 분모가 커져 값이 눌린다 . 
        //   하필 우리가 찾는 늦으면서 튄 순간이 스스로 숨는다. 합성 로그로 확인:
        //   답을 아는 망탓 벌이 속도 기준에서는 튐 0회로 나왔다.
        //   사람 눈에 보이는 것도 속도가 아니라 **한 프레임에 얼마나 뛰었나** 다.
        const step = [];
        for (let i = 1; i < shown.length; i++) {
          const dt = (shown[i].t_ms - shown[i-1].t_ms) / 1000;
          if (dt <= 0 || dt > 0.5) continue;
          const qa = qNorm(['shown_qx','shown_qy','shown_qz','shown_qw'].map(k => shown[i-1][k]));
          const qb = qNorm(['shown_qx','shown_qy','shown_qz','shown_qw'].map(k => shown[i][k]));
          step.push({ seq: shown[i].seq, v: qAngle(qa, qb) });
        }
        const rmed = pct(step.map(r => r.v), .5) || 1e-6;
        const spikes = step.filter(r => r.v > rmed * 20);
        if (spikes.length < 5) {
          console.log(`늦게 온 순간 ${lateIdx.size}회 (전체의 ${(base*100).toFixed(0)}%)`);
          console.log(`  → CANNOT-RUN: 튄 순간이 ${spikes.length}회뿐이라 상관을 못 믿는다 (5회 이상 필요).`);
        } else {
          const hit = spikes.filter(sp => lateIdx.has(sp.seq)).length;
          const share = hit / spikes.length;
          console.log(`늦게 온 순간 ${lateIdx.size}회 (전체의 ${(base*100).toFixed(0)}%)`);
          console.log(`튄 순간 ${spikes.length}회 중 ${hit}회가 늦게 온 순간과 겹친다 (${(share*100).toFixed(0)}%)`);
          console.log(`대조: 아무 순간이나 늦을 확률은 ${(base*100).toFixed(0)}%`);
          if (share > base * 2)
            console.log('  → 튐이 늦게 온 순간에 몰린다 = **망 탓 지지**. 다음 = WebRTC 로 포즈를 영상과 분리.');
          else
            console.log('  → 겹치지 않는다 = 망 탓 기각. 튐의 원인은 다른 데 있다(위 단계별 판정을 봐라).');
        }
      }
    }
  }
}

// ── 자발 이동: 스틱 0, 폰 정지인데 카메라가 움직이나 ───────────────────────
if (shown.length) {
  const still = [];
  for (let i = 1; i < shown.length; i++) {
    const s = shown[i];
    const stickZero = Math.abs(s.stick_lx) + Math.abs(s.stick_ly) + Math.abs(s.stick_rx) + Math.abs(s.stick_ry) < 1e-4;
    if (!stickZero || s.recentered === 1) continue;
    // 같은 순번 구간에서 폰 원본이 거의 안 움직였나
    const p = pose.find(r => r.seq === s.seq), q = pose.find(r => r.seq === s.seq - 1);
    if (!p || !q) continue;
    const phoneMove = Math.hypot(p.raw_px - q.raw_px, p.raw_py - q.raw_py, p.raw_pz - q.raw_pz);
    if (phoneMove > 0.002) continue;                    // 폰이 실제로 움직였으면 제외
    const camMove = Math.hypot(s.cam_x - shown[i-1].cam_x, s.cam_y - shown[i-1].cam_y, s.cam_z - shown[i-1].cam_z);
    still.push(camMove);
  }
  if (still.length <= 10) {
    console.log('\n── 자발 이동 (스틱 0, 폰 정지 구간) ──────────────────────');
    console.log(`  → CANNOT-RUN: 잴 구간이 ${still.length}개뿐이다. 스틱에서 손을 떼고 ` +
                `폰을 내려놓은 채 몇 초 기록해야 잰다.`);
  } else {
    const total = still.reduce((a, b) => a + b, 0);
    console.log('\n── 자발 이동 (스틱 0, 폰 정지 구간) ──────────────────────');
    console.log(`표본 ${still.length}, 누적 ${total.toFixed(4)}m, 한 걸음 최대 ${Math.max(...still).toFixed(5)}m`);
    console.log(total > 0.05
      ? '  → 아무도 안 미는데 카메라가 흐른다 = **자발 이동 재현됨**'
      : '  → 이 구간에서는 안 흐른다 (보간 잔여 수렴 수준)');
  }
}
