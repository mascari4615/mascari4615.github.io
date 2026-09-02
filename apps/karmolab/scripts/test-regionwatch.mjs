/**
 * 화면 영역 지켜보기 알맹이 시험. 브라우저 없이 Node 에서 판정 로직 실행
 *
 * - 닮은 정도, 줄인 크기
 * - 같아지면/달라지면 상태 기계: 들어가는 순간 한 번, 빠지면 다시 무장, rearm 안에는 침묵
 * - 숫자 읽기: 글자 -> 초, 카운트다운 상태 기계(연속 확인, 새 카운트다운, 숫자 사라짐)
 * - 이진화: 어두운 바탕 뒤집기, 밝은 바탕 유지
 *
 * 사용: node scripts/test-regionwatch.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: ${got} 가 나왔다 (기대 ${want})`);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl-rw-'));
const outfile = path.join(outDir, 'regionwatch-core.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'src/widgets/tools/shared/regionwatch-core.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent'
});
const core = await import(pathToFileURL(outfile).href);

/* 금지어. 알맹이가 화면을 만지면 Node 시험 자체가 거짓 */
const src = fs.readFileSync(path.join(root, 'src/widgets/tools/shared/regionwatch-core.ts'), 'utf8');
for (const word of ['document', 'window', 'Toolbox', 'localStorage', 'navigator']) {
  check(!new RegExp(`\\b${word}\\b(?!\\s*금지)`).test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), `알맹이가 ${word} 를 쓴다`);
}

/* ── 닮은 정도 ── */
const px = (rgb, n) => {
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) a.set([...rgb, 255], i * 4);
  return a;
};
eq(core.similarity(px([10, 20, 30], 16), px([10, 20, 30], 16)), 1, '같은 그림');
eq(core.similarity(px([0, 0, 0], 16), px([255, 255, 255], 16)), 0, '정반대 그림');
check(Math.abs(core.similarity(px([0, 0, 0], 16), px([51, 51, 51], 16)) - 0.8) < 1e-9, '20% 차이는 0.8');
eq(core.similarity(new Uint8ClampedArray(0), px([0, 0, 0], 4)), 0, '빈 그림은 0');

/* ── 줄인 크기 ── */
check(core.smallSize({ x: 0, y: 0, w: 400, h: 100 }).join('x') === '40x10', '긴 변 40, 비율 유지');
check(core.smallSize({ x: 0, y: 0, w: 3, h: 400 }).join('x') === '1x40', '가는 영역도 최소 1');
check(core.smallSize({ x: 0, y: 0, w: 20, h: 20 }).join('x') === '40x40', '작은 영역은 키운다');

/* ── 같아지면 / 달라지면 ── */
{
  const cfg = { mode: 'match', threshold: 0.9, rearm: 5 };
  let st = { wasHit: false, firedAt: -1e9 };
  let r = core.decideEdge(st, 0.5, cfg, 1000);
  check(!r.fire && !r.hit, 'match: 문턱 아래는 조용');
  r = core.decideEdge(r.state, 0.95, cfg, 2000);
  check(r.fire && r.hit, 'match: 문턱을 넘는 순간 울린다');
  r = core.decideEdge(r.state, 0.97, cfg, 2500);
  check(!r.fire, 'match: 계속 넘어 있으면 다시 안 울린다');
  r = core.decideEdge(r.state, 0.4, cfg, 3000);
  check(!r.fire && !r.hit, 'match: 빠지면 조용, 다시 무장');
  r = core.decideEdge(r.state, 0.95, cfg, 4000);
  check(!r.fire && r.hit, 'match: rearm 5초 안에 다시 들어오면 침묵');
  r = core.decideEdge(r.state, 0.4, cfg, 4500);
  r = core.decideEdge(r.state, 0.95, cfg, 8000);
  check(r.fire, 'match: rearm 지나서 들어오면 울린다');

  const chg = { mode: 'change', threshold: 0.9, rearm: 0 };
  st = { wasHit: false, firedAt: -1e9 };
  r = core.decideEdge(st, 0.99, chg, 0);
  check(!r.fire, 'change: 같으면 조용');
  r = core.decideEdge(r.state, 0.6, chg, 100);
  check(r.fire, 'change: 달라지는 순간 울린다');
  r = core.decideEdge(r.state, 0.99, chg, 200);
  r = core.decideEdge(r.state, 0.6, chg, 300);
  check(r.fire, 'change: rearm 0 이면 바로 다시 울린다');
}

/* ── 글자 -> 초 ── */
for (const [text, want] of [
  ['12', 12],
  [' 7 ', 7],
  ['1:05', 65],
  ['12s', 12],
  ['0', 0],
  ['3.9', 3],
  ['', null],
  ['ab', null],
  ['l2', 12],
  ['O5', 5],
  ['10:00', 600]
]) {
  eq(core.parseSeconds(text), want, `parseSeconds(${JSON.stringify(text)})`);
}

/* ── 카운트다운 ── */
{
  const cfg = { lead: 5, rearm: 3 };
  let st = { last: null, streak: 0, firedAt: -1e9, done: false };
  const fires = [];
  const feed = (secs, now) => {
    const r = core.decideCount(st, secs, cfg, now);
    st = r.state;
    if (r.fire) fires.push(secs);
  };
  let t = 0;
  for (const s of [30, 20, 10, 8, 6]) feed(s, (t += 1000));
  eq(fires.length, 0, '문턱 위에서는 조용');
  feed(5, (t += 1000));
  eq(fires.length, 0, '문턱 아래 첫 읽기는 확인 대기 (오독 대비)');
  feed(4, (t += 1000));
  eq(fires.join(','), '4', '두 번째 읽기에서 울린다');
  for (const s of [3, 2, 1, 0]) feed(s, (t += 1000));
  eq(fires.length, 1, '같은 카운트다운에서는 한 번만');
  feed(null, (t += 1000));
  check(st.last === null && !st.done, '숫자가 사라지면 푼다');
  for (const s of [30, 5, 4]) feed(s, (t += 1000));
  eq(fires.length, 2, '다음 카운트다운에서 다시 울린다');

  /* 오독 한 번은 무시 */
  st = { last: null, streak: 0, firedAt: -1e9, done: false };
  fires.length = 0;
  for (const s of [30, 3, 29, 28]) feed(s, (t += 1000));
  eq(fires.length, 0, '중간에 3 이 한 번 잘못 읽혀도 안 울린다');

  /* 새 카운트다운이 숫자 사라짐 없이 바로 시작 */
  st = { last: null, streak: 0, firedAt: -1e9, done: false };
  fires.length = 0;
  for (const s of [6, 5, 4, 3, 40, 5, 4]) feed(s, (t += 1000));
  eq(fires.length, 2, '값이 크게 뛰면 새 카운트다운으로 보고 다시 울린다');

  /* rearm */
  st = { last: null, streak: 0, firedAt: -1e9, done: false };
  fires.length = 0;
  feed(5, 100);
  feed(4, 200);
  feed(null, 300);
  feed(5, 400);
  feed(4, 500);
  eq(fires.length, 1, 'rearm 3초 안의 두 번째는 침묵');
  feed(null, 600);
  feed(5, 5000);
  feed(4, 5100);
  eq(fires.length, 2, 'rearm 지나면 울린다');

  /* confirm 1 */
  st = { last: null, streak: 0, firedAt: -1e9, done: false };
  const r1 = core.decideCount(st, 2, { lead: 5, rearm: 0, confirm: 1 }, 0);
  check(r1.fire, 'confirm 1 이면 첫 읽기에 울린다');
}

/* ── 이진화 ── */
{
  const dark = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 16; i++) dark.set(i < 4 ? [240, 240, 240, 255] : [20, 20, 20, 255], i * 4);
  const r = core.binarize(dark);
  check(r.inverted, '어두운 바탕은 뒤집는다');
  eq(dark[0], 0, '뒤집힌 뒤 밝은 글자는 검정 잉크');
  eq(dark[8 * 4], 255, '뒤집힌 뒤 어두운 바탕은 흰색');
  const light = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 16; i++) light.set(i < 4 ? [10, 10, 10, 255] : [230, 230, 230, 255], i * 4);
  const r2 = core.binarize(light);
  check(!r2.inverted, '밝은 바탕은 그대로');
  eq(light[0], 0, '검은 글자는 검정');
  eq(light[8 * 4], 255, '밝은 바탕은 흰색');
  const flat = new Uint8ClampedArray(8 * 4).fill(100);
  core.binarize(flat);
  check(flat[3] === 255, '한 색뿐이어도 터지지 않는다');
}

fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-regionwatch] 실패 ${failures.length}건`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[test-regionwatch] 전부 통과');
