// 핸드헬드 포즈 로그 판정기 — 「튄다 / 저 혼자 움직인다」가 어느 단계에서 생기나.
//
//   node pose-analyze.mjs <HandheldLogs 폴더 또는 pose-*.csv>
//
// 세 단계를 같은 잣대로 잰다: raw(폰 원본) · conv(좌표변환 후) · shown(보간·리센터 후).
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

const readCsv = p => {
  const lines = readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const c = l.split(','), o = {};
    head.forEach((h, i) => { const v = c[i]; o[h] = /^-?[\d.]+$/.test(v) ? +v : v; });
    return o;
  });
};

const pose = readCsv(posePath);
let shown = [];
try { shown = readCsv(shownPath); } catch { }

console.log(`포즈 ${pose.length}줄 · 화면 ${shown.length}줄 — ${basename(posePath)}`);
if (pose.length < 20) { console.error('❌ 표본이 너무 적다 (20줄 미만) — 더 길게 기록해라'); process.exit(2); }

// ── 쿼터니언 도구 ────────────────────────────────────────────────────────────
const qNorm = q => { const n = Math.hypot(...q) || 1; return q.map(v => v / n); };
// 두 자세 사이 각도(도)
const qAngle = (a, b) => {
  a = qNorm(a); b = qNorm(b);
  let d = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  d = Math.min(1, d);
  return 2 * Math.acos(d) * 180 / Math.PI;
};
// 요/피치 (Unity 규약: Y 위, Z 앞) — 짐벌 가설을 재려면 피치가 필요하다
const qToYawPitch = ([x, y, z, w]) => {
  const fx = 2*(x*z + w*y), fy = 2*(y*z - w*x), fz = 1 - 2*(x*x + y*y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -fy))) * 180 / Math.PI;
  const yaw = Math.atan2(fx, fz) * 180 / Math.PI;
  return { yaw, pitch };
};
const dAngle = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

const pct = (arr, p) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(s.length*p))]; };

// ── 단계별 각속도 ────────────────────────────────────────────────────────────
function stage(rows, name, qk, pk, tk = 't_ms') {
  const out = { name, rate: [], yawRate: [], gap: [], samples: rows.length };
  for (let i = 1; i < rows.length; i++) {
    const dt = (rows[i][tk] - rows[i-1][tk]) / 1000;
    if (dt <= 0 || dt > 0.5) continue;
    const qa = qk.map(k => rows[i-1][k]), qb = qk.map(k => rows[i][k]);
    out.rate.push(qAngle(qa, qb) / dt);
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
const shw   = shown.length ? stage(shown, 'shown (보간·리센터 후)',
                ['shown_qx','shown_qy','shown_qz','shown_qw'], ['shown_px','shown_py','shown_pz']) : null;

console.log('\n── 각속도 (도/초) ─────────────────────────────────────────');
console.log('단계                     중앙값   p95     p99     최대     ┃ 요만');
for (const s of [raw, conv, shw].filter(Boolean)) {
  const r = s.rate, y = s.yawRate;
  console.log(`${s.name.padEnd(22)} ${pct(r,.5).toFixed(1).padStart(7)} ${pct(r,.95).toFixed(1).padStart(7)} ` +
              `${pct(r,.99).toFixed(1).padStart(7)} ${Math.max(...r).toFixed(1).padStart(8)}  ┃ ` +
              `p99 ${pct(y,.99).toFixed(1)} 최대 ${Math.max(...y).toFixed(1)}`);
}

// ── 튐 판정 — 중앙값 대비 몇 배인가 (절대 ms/도 문턱을 안 쓴다) ──────────────
console.log('\n── 튐 (중앙값 대비 20배 넘는 순간) ────────────────────────');
let verdict = [];
for (const s of [raw, conv, shw].filter(Boolean)) {
  const med = pct(s.rate, .5) || 1e-6;
  const spikes = s.rate.filter(v => v > med * 20);
  const worst = Math.max(...s.rate) / med;
  console.log(`${s.name.padEnd(22)} ${String(spikes.length).padStart(4)}회 / ${s.rate.length}표본 · 최악 ${worst.toFixed(0)}배`);
  verdict.push({ name: s.name, spikes: spikes.length, ratio: worst });
}

const rawSpike = verdict[0].spikes, shownSpike = verdict[2]?.spikes ?? 0;
console.log('');
if (rawSpike > 0)
  console.log(`▶ 판정: **폰 원본에서 이미 튄다** (${rawSpike}회) — ARCore VIO 쪽. 우리 코드 문제가 아니다.\n` +
              `  다음: 리로컬라이즈 완충(각속도 상한·이상치 버리기)을 우리 쪽에 둘지 결정.`);
else if (shownSpike > 0)
  console.log(`▶ 판정: **원본은 매끄러운데 보간·리센터 뒤에서 튄다** (${shownSpike}회) — 우리 코드다.\n` +
              `  다음: 리센터 yaw 보정(eulerAngles)의 짐벌을 의심. 아래 피치 상관을 볼 것.`);
else
  console.log('▶ 판정: 이 기록에는 튐이 없다 — 증상이 난 구간을 다시 기록해라 (짧게, 튄 직후 정지).');

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

    // 대조군이 없으면 판정하지 않는다 — 전부 가파르거나 전부 완만하면 이 잣대는
    // 같은 값을 낼 수밖에 없다. 그때 「기각」이라 적으면 거짓 초록이다.
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

// ── 자발 이동: 스틱 0 · 폰 정지인데 카메라가 움직이나 ───────────────────────
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
    console.log('\n── 자발 이동 (스틱 0 · 폰 정지 구간) ──────────────────────');
    console.log(`  → CANNOT-RUN: 잴 구간이 ${still.length}개뿐이다. 스틱에서 손을 떼고 ` +
                `폰을 내려놓은 채 몇 초 기록해야 잰다.`);
  } else {
    const total = still.reduce((a, b) => a + b, 0);
    console.log('\n── 자발 이동 (스틱 0 · 폰 정지 구간) ──────────────────────');
    console.log(`표본 ${still.length} · 누적 ${total.toFixed(4)}m · 한 걸음 최대 ${Math.max(...still).toFixed(5)}m`);
    console.log(total > 0.05
      ? '  → 아무도 안 미는데 카메라가 흐른다 = **자발 이동 재현됨**'
      : '  → 이 구간에서는 안 흐른다 (보간 잔여 수렴 수준)');
  }
}
