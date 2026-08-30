/**
 * 지금 저 하늘. 화면 없이 잴 수 있는 것 (TASK-KL-336 / 흡혈 원장 21).
 *
 * 셋을 잠근다:
 * ① **같은 하늘인가**. 여기가 헐거우면 지구를 조금 돌릴 때마다 바깥 서버를 때리고,
 *    너무 빡빡하면 다른 하늘을 옛 목록으로 그린다. 날짜변경선이 특히 잘 깨진다.
 * ② **모르는 것을 아는 척 안 하나**. 0노트, 0도(북)로 채우면 온 하늘이 북쪽을 향한다.
 * ③ **가장 가까운 한 대**. 극지방에서 경도 보정을 빼먹으면 엉뚱한 기체가 잡힌다.
 *
 * 사용: node scripts/test-air.mjs   (npm run test:air)
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
const eq = (got, want, why) => check(got === want, `${why}. 기대 ${want}, 나온 것 ${got}`);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-'));
const outfile = path.join(outDir, 'air.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'src/widgets/bluemarble/air.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent'
});
const A = await import(pathToFileURL(outfile).href);

// ── ① 같은 하늘인가 ──────────────────────────────────────────────────────────

check(A.sameSky({ lat: 37.4, lon: 127.1 }, { lat: 37.49, lon: 126.9 }), '한 도시 안은 같은 하늘');
check(!A.sameSky({ lat: 37.5, lon: 127 }, { lat: 40.5, lon: 127 }), '3도 떨어지면 다른 하늘');
check(!A.sameSky({ lat: 37.5, lon: 127 }, { lat: 37.5, lon: 131 }), '경도로 4도 떨어져도 다른 하늘');

/* ★ 날짜변경선. 179.6°E 와 180°W 는 **같은 자리**다. 그냥 빼면 359.6 도 차이로 읽혀
   지구본을 그 위로 돌릴 때마다 새로 묻게 된다. */
check(A.sameSky({ lat: 0, lon: 179.7 }, { lat: 0, lon: -180 }), '날짜변경선 양쪽은 같은 하늘');
check(A.sameSky({ lat: 0, lon: -179.7 }, { lat: 0, lon: 180 }), '반대로 넘어가도 같은 하늘');

/* 뒷단 곳간 눈금(1°)과 **같은 눈금**이라야 뜻이 있다. 다르면 우리는 새로 묻는데
   저쪽은 옛것을 준다. 눈금을 바꾸면 여기서 걸린다. */
check(!A.sameSky({ lat: 0, lon: 0 }, { lat: 0, lon: 1.2 }), '눈금 한 칸을 넘으면 다른 하늘');

// ── ② 모르는 것을 아는 척 안 한다 ────────────────────────────────────────────

const flying = { hex: 'a1', label: 'KAL123', lat: 37, lon: 127, altFt: 35000, onGround: false, trackDeg: 90, speedKt: 480 };
const parked = { hex: 'a2', label: 'HL9426', lat: 37, lon: 127, altFt: null, onGround: true, trackDeg: null, speedKt: null };
const unknown = { hex: 'a3', label: 'X', lat: 37, lon: 127, altFt: null, onGround: false, trackDeg: null, speedKt: null };

check(A.heightSay(flying).includes('10.7'), `35000피트 ≈ 10.7km (나온 것 ${A.heightSay(flying)})`);
check(A.heightSay(parked).includes('땅'), '땅에 선 기체는 땅이라고 말한다');
check(!A.heightSay(unknown).includes('0'), `고도를 모르면 0 이라고 하지 않는다 (나온 것 ${A.heightSay(unknown)})`);

/* ★ 속도를 모르면 **안 적는다**. 0km/h 로 난다는 거짓말이다. */
check(!A.planeSay(unknown).includes('km/h'), `속도를 모르면 속도 줄이 없다 (나온 것 ${A.planeSay(unknown)})`);
check(!A.planeSay(parked).includes('km/h'), '땅에 선 기체에 속도를 안 붙인다');
check(A.planeSay(flying).includes('KAL123'), '이름이 맨 앞에 온다');
check(A.planeSay(flying).includes('889'), `480노트 ≈ 889km/h (나온 것 ${A.planeSay(flying)})`);

// ── ③ 가장 가까운 한 대 ──────────────────────────────────────────────────────

const list = [
  { ...flying, hex: 'near', lat: 37.05, lon: 127.05 },
  { ...flying, hex: 'far', lat: 40, lon: 130 }
];
eq(A.nearestPlane(list, 37, 127, 1)?.hex, 'near', '가까운 쪽이 잡힌다');
eq(A.nearestPlane(list, 37, 127, 0.01), null, '범위를 좁히면 아무것도 안 잡힌다 (0.01도 ≈ 1km)');
eq(A.nearestPlane([], 37, 127, 5), null, '빈 하늘에서는 null');

/* ★ 극지방. 경도 1도는 위도 80도에서 약 19km 다(적도의 1/5.7). 보정을 빼먹으면
   경도로 멀리 떨어진 기체가 가깝다고 잡힌다. */
const polar = [
  { ...flying, hex: 'lat', lat: 80.4, lon: 0 },
  { ...flying, hex: 'lon', lat: 80, lon: 1.5 }
];
eq(A.nearestPlane(polar, 80, 0, 5)?.hex, 'lon', '북위 80도에서는 경도 1.5도가 위도 0.4도보다 가깝다');

/* 날짜변경선 너머도 이웃이다. 안 접으면 지구 반대편으로 읽는다. */
const dateline = [{ ...flying, hex: 'over', lat: 0, lon: -179.5 }];
eq(A.nearestPlane(dateline, 0, 179.5, 2)?.hex, 'over', '날짜변경선 너머 1도는 이웃이다');

// ── ④ 손잡이 숫자 ────────────────────────────────────────────────────────────

check(A.LOOK_NM <= 250, '원천 상한(250해리)을 안 넘는다. 넘기면 400 이 온다');
check(A.REFRESH_MS >= 10000, '10초보다 자주 묻지 않는다 (남의 서버다)');

// ── 마무리 ───────────────────────────────────────────────────────────────────
fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-air] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[test-air] 지금 저 하늘. 검사 전부 통과');
