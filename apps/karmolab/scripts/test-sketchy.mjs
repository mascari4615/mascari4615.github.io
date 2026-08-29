/**
 * 손그림 질감. **화면이 춤추지 않는가** (TASK-KL-238 / 18 excalidraw).
 *
 * 삐뚤빼뚤은 예쁘라고 넣는 것이지만, 매번 새로 흔들리면 **끌 때마다 상자가 살아 움직인다** . 
 * 어지럽고, 같은 그림을 두 번 저장하면 다른 그림이 나온다. 그래서 여기서 가장 크게 지키는 것은
 * 같은 씨앗 = 같은 획이다. 그다음이 상자 크기가 안 변한다(선 잇는 셈법이 상자만 본다).
 *
 * 사용: node scripts/test-sketchy.mjs   (npm run test:sketchy)
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

async function load() {
  const stamp = Date.now();
  const entry = path.join(os.tmpdir(), `sketchy-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/karmograph/sketchy.ts'))};\n`);
  const out = path.join(os.tmpdir(), `sketchy-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const S = await load();

/** path 의 좌표들 */
const pts = (d) =>
  d
    .replace(/[MLZ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => pair.split(',').map(Number));

/* ★ 같은 씨앗이면 늘 같은 획. 이게 깨지면 화면이 춤춘다 */
check(S.sketchyRect(200, 80, 7) === S.sketchyRect(200, 80, 7), '같은 씨앗 = 같은 네모');
check(S.sketchyEllipse(120, 60, 3) === S.sketchyEllipse(120, 60, 3), '같은 씨앗 = 같은 동그라미');
check(S.sketchyRect(200, 80, 7) !== S.sketchyRect(200, 80, 8), '씨앗이 다르면 다르게 흔들린다');
check(S.seedFrom('node-a') === S.seedFrom('node-a'), '같은 이름 = 같은 씨앗');
check(S.seedFrom('node-a') !== S.seedFrom('node-b'), '다른 이름 = 다른 씨앗');

/* 상자 크기가 안 변한다 (흔들림 한도 안) */
{
  const p = pts(S.sketchyRect(200, 80, 11));
  const xs = p.map(([x]) => x);
  const ys = p.map(([, y]) => y);
  const pad = S.AMP + 0.2;
  check(Math.min(...xs) >= -pad && Math.max(...xs) <= 200 + pad, '네모가 상자 밖으로 안 나간다 (가로)');
  check(Math.min(...ys) >= -pad && Math.max(...ys) <= 80 + pad, '네모가 상자 밖으로 안 나간다 (세로)');
  check(p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), '좌표에 NaN 이 없다');
}

/* 모서리는 거의 제자리. 안 그러면 상자가 안 닫혀 보인다 */
{
  const p = pts(S.sketchyRect(200, 80, 5));
  const [x0, y0] = p[0];
  check(Math.abs(x0) <= S.AMP * 0.5 && Math.abs(y0) <= S.AMP * 0.5, '시작 모서리는 거의 제자리');
}

/* 두 겹으로 긋는다 (손그림은 한 번에 안 끝난다) */
check((S.sketchyRect(200, 80, 5).match(/Z/g) || []).length === 2, '네모는 두 겹');
check((S.sketchyEllipse(100, 100, 5).match(/Z/g) || []).length === 2, '동그라미는 두 겹');

/* 잇는 선. 한 겹이고, 양 끝이 제자리 근처 */
{
  const g = { p1: { x: 0, y: 0 }, c1: { x: 50, y: 0 }, c2: { x: 50, y: 100 }, p2: { x: 100, y: 100 } };
  const d = S.sketchyCubic(g, 9);
  const p = pts(d);
  check(!d.includes('Z'), '잇는 선은 안 닫는다');
  check(Math.hypot(p[0][0], p[0][1]) <= S.AMP, '선의 시작이 제자리 근처');
  const last = p[p.length - 1];
  check(Math.hypot(last[0] - 100, last[1] - 100) <= S.AMP, '선의 끝이 제자리 근처 (화살촉이 빗나가면 안 된다)');
  check(p.length >= 6, '굽은 선을 여러 점으로 훑는다');
  check(S.sketchyCubic(g, 9) === S.sketchyCubic(g, 9), '잇는 선도 씨앗이 같으면 같다');
}

/* 켜고 끄기 */
check(S.sketchyOn() === false, '처음엔 꺼져 있다 (예전 그대로 자로 잰 도형)');
S.setSketchy(true);
check(S.sketchyOn() === true, '켜진다');
S.setSketchy(false);
check(S.sketchyOn() === false, '꺼진다');

/* 아주 작은 도형도 안 터진다 */
check(pts(S.sketchyRect(1, 1, 2)).length > 0, '1×1 도 그린다');
check(pts(S.sketchyEllipse(2, 2, 2)).length > 0, '아주 작은 동그라미도 그린다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n손그림. ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('손그림. 전부 통과');
