/**
 * 모양으로 배경 빼기. 알맹이 검사 (TASK-KL-238 / 14, 15, 16)
 *
 * 모델도 GPU 도 없이 잴 수 있는 것만 여기서 잠근다. 잠그는 것은 셋이다:
 * ① 모델이 어떤 모양으로 내주든 **우리 모양(RGBA)** 으로 편다. 판마다 다르고, 여기가 틀리면
 *    오류 없이 새까만 그림이 나온다.
 * ② 게이트가 보여 줄 **크기 숫자가 기기마다 맞다**. 대략 44MB 한 줄은 절반이 거짓말이다.
 * ③ 지우개(메우기)가 **한 방향으로 번지지 않는다**. 실제로 저지르기 쉬운 사고라 못 박는다.
 *
 * 사용: node scripts/test-cutout.mjs   (npm run test:cutout)
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

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutout-'));
const outfile = path.join(outDir, 'ai-cutout.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/ai-cutout.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent'
});
const C = await import(pathToFileURL(outfile).href);

const inpaintFile = path.join(outDir, 'inpaint.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/inpaint.ts')],
  outfile: inpaintFile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent'
});
const I = await import(pathToFileURL(inpaintFile).href);

// ── ① 받은 것을 우리 모양으로 ────────────────────────────────────────────────

/* 회색 한 겹은 **색이 아니라 마스크**다. 이걸 색으로 읽으면 검은 데가 검은 물체가 되어
   그림 전체가 새까맣게 나온다. 오류가 안 나서 원인을 못 찾는 종류의 사고다. */
const gray = C.toRgba(new Uint8ClampedArray([0, 128, 255, 255]), 2, 2, 1);
eq(gray.length, 16, '2×2 회색 한 겹 → RGBA 16바이트');
eq(gray[3], 0, '검은 데는 완전히 투명');
eq(gray[7], 128, '중간 회색은 반투명');
eq(gray[11], 255, '흰 데는 불투명');
eq(gray[0], 255, '마스크의 색깔 자리는 흰색으로 채운다 (검게 두면 테두리가 어두워진다)');

/* RGB 세 겹은 **불투명한 사진**이다. 알파를 0 으로 채우면 통째로 사라진다. */
const rgb = C.toRgba(new Uint8ClampedArray([10, 20, 30, 40, 50, 60]), 2, 1, 3);
eq(rgb[3], 255, 'RGB 는 불투명으로 채운다');
eq(rgb[4], 40, '두 번째 점의 빨강이 안 밀렸다');

/* 이미 RGBA 면 그대로 통과해야 한다. */
const rgba = C.toRgba(new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]), 2, 1, 4);
eq(rgba[3], 4, 'RGBA 는 알파를 그대로 둔다');
eq(rgba[7], 8, 'RGBA 두 번째 점도 그대로');

/* 자료가 모자라면 **조용히 0 으로 채우지 않는다**. 반쯤 채운 그림은 됐다로 보인다. */
let threw = false;
try {
  C.toRgba(new Uint8ClampedArray([1, 2]), 4, 4, 1);
} catch {
  threw = true;
}
check(threw, '그림 자료가 모자라면 던진다');

// ── ② 모델이 낸 것을 한 곳에서만 가른다 ──────────────────────────────────────

const one = { data: new Uint8ClampedArray([255, 0, 0, 255]), width: 2, height: 2, channels: 1 };
eq(C.normalize(one).width, 2, '한 장을 그대로 줘도 읽는다');
eq(C.normalize([one]).width, 2, '한 장짜리 배열로 줘도 읽는다');
/* `channels` 를 안 줄 수도 있다. 크기에서 되짚는다. */
eq(C.normalize({ data: new Uint8ClampedArray(16), width: 2, height: 2 }).rgba.length, 16, 'channels 없으면 되짚는다');
threw = false;
try {
  C.normalize(undefined);
} catch {
  threw = true;
}
check(threw, '못 알아볼 모양이면 던진다');

// ── ③ 색은 원본에서, 모양만 모델에서 ─────────────────────────────────────────

/* 모델은 대개 고정 크기로 본다. 모델이 낸 그림을 그대로 쓰면 **줄어든 사진**을 저장하게 된다. */
const source = new Uint8ClampedArray([9, 9, 9, 255, 8, 8, 8, 255]);
const merged = C.applyAlpha(source, new Uint8Array([0, 200]));
eq(merged[0], 9, '원본 색이 살아 있다');
eq(merged[3], 0, '첫 점은 모델이 지웠다');
eq(merged[7], 200, '둘째 점은 반쯤 남았다');
eq(source[3], 255, '원본을 건드리지 않는다 (한 벌 떠서 돌려준다)');
threw = false;
try {
  C.applyAlpha(source, new Uint8Array([1]));
} catch {
  threw = true;
}
check(threw, '가린 자리와 크기가 다르면 던진다');

eq(C.alphaOf(merged).length, 2, '알파 한 겹만 뽑아낸다');
eq(C.alphaOf(merged)[1], 200, '뽑아낸 알파 값이 맞다');

// ── ④ 안 됐다를 갈라서 말한다 ─────────────────────────────────────────────

/* 아무것도 못 찾은 것과 아무것도 안 지운 것은 **고치는 방법이 정반대**다. */
eq(C.keptRatio(new Uint8Array([0, 0, 0, 0])), 0, '아무것도 못 찾으면 0');
eq(C.keptRatio(new Uint8Array([255, 255])), 1, '아무것도 안 지웠으면 1');
eq(C.keptRatio(new Uint8Array([])), 0, '빈 것은 0 (나누기 0 으로 NaN 을 내지 않는다)');

// ── ④-2 크기가 안 맞으면 옮긴다 ──────────────────────────────────────────────

/* 크기가 같으면 그대로지만 **한 벌 떠서** 준다. 원본을 나중에 고치면 알파까지 같이 변한다. */
const same = new Uint8Array([1, 2, 3, 4]);
const copied = C.resampleAlpha(same, 2, 2, 2, 2);
eq(copied[0], 1, '같은 크기면 값이 그대로');
same[0] = 99;
eq(copied[0], 1, '원본과 이어져 있지 않다 (한 벌 떴다)');

/* 두 배로 늘리면 각 점이 넉 점이 된다. 가까운 점을 그대로 집는다(섞지 않는다). */
const big = C.resampleAlpha(new Uint8Array([0, 255, 255, 0]), 2, 2, 4, 4);
eq(big.length, 16, '4×4 로 늘어난다');
eq(big[0], 0, '왼쪽 위는 0 그대로');
eq(big[2], 255, '오른쪽 위는 255 그대로');
check(!Array.from(big).some((v) => v !== 0 && v !== 255), '중간값을 만들지 않는다 (테두리에 띠가 안 생긴다)');

/* 줄일 때도 자리를 안 넘긴다. 넘기면 알파가 밀려 사람 옆에 유령이 생긴다. */
const small = C.resampleAlpha(new Uint8Array([0, 0, 255, 255]), 4, 1, 2, 1);
eq(small[0], 0, '앞쪽은 앞쪽에서');
eq(small[1], 255, '뒤쪽은 뒤쪽에서');

// ── ⑤ 여백 자르기 ────────────────────────────────────────────────────────────

const box = C.trimBox(new Uint8Array([0, 0, 0, 0, 0, 255, 0, 0, 0]), 3, 3);
eq(box.x, 2, '남은 것의 왼쪽 끝');
eq(box.y, 1, '남은 것의 위쪽 끝');
eq(box.width, 1, '한 점이면 폭 1 (0 이 아니다)');
/* ★ 아무것도 안 남았을 때 0×0 을 돌려주면 캔버스가 사라진다. 오류 없이 없어지는 사고다. */
eq(C.trimBox(new Uint8Array(9), 3, 3), null, '아무것도 안 남으면 null 이지 0×0 이 아니다');

// ── ⑥ 기기마다 다른 숫자를 그대로 말한다 ─────────────────────────────────────

const person = C.CUTOUT_MODELS.person;
const anything = C.CUTOUT_MODELS.anything;
check(person.fp16Mb < anything.fp16Mb, '사람 쪽이 더 가볍다 (기본값이 되는 이유)');
check(person.commercial === true, '기본 겹은 상업적으로 써도 되는 라이선스');
check(anything.commercial === false, '무거운 겹은 비상업이라고 들고 있다 (화면이 그걸 적는다)');
eq(C.sizeMbFor(person, true), person.fp16Mb, 'WebGPU 면 fp16 크기를 말한다');
eq(C.sizeMbFor(person, false), person.q8Mb, 'WebGPU 없으면 q8 크기를 말한다');
check(C.sizeMbFor(anything, true) !== C.sizeMbFor(anything, false), '두 자리의 숫자가 실제로 다르다');
eq(C.dtypeFor(true), 'fp16', 'WebGPU 는 fp16');
eq(C.dtypeFor(false), 'q8', 'wasm 은 q8');

// ── ⑥-2 영상은 몇 판이나 돌게 되나 (원장 16) ────────────────────────────────

eq(C.planFrames(30, 6, 12).count, 72, '6초 × 12장 = 72판');
eq(C.planFrames(30, 6, 12).seconds, 6, '판 수와 길이가 어긋나지 않는다');
/* 남은 길이보다 길게 달라고 해도 남은 만큼만. 없는 장면을 돌리면 마지막 장이 반복된다. */
eq(C.planFrames(2, 10, 12).count, 24, '남은 2초만 돌린다');
/* ★ 상한이 없으면 3분짜리를 넣은 사람이 브라우저를 잃는다. 느리다가 아니라 망가졌다다. */
eq(C.planFrames(600, 600, 24, 150).count, 150, '상한을 넘지 않는다');
check(C.planFrames(600, 600, 24, 150).seconds < 600, '상한에 걸리면 길이도 같이 줄어 말이 맞는다');
/* ★ 0장을 주면 부르는 쪽이 빈 결과를 됐다로 보고 저장까지 한다. */
eq(C.planFrames(0, 6, 12).count, 1, '남은 게 없어도 최소 한 장');
eq(C.planFrames(30, 6, 0).count, 6, '초당 장 수가 0 이면 1장/초로 본다 (나누기 0 이 안 난다)');

// ── ⑦ 지우개. 한 방향으로 번지지 않는다 ─────────────────────────────────────

/* 3×3 가운데만 구멍. 사방이 같은 색이면 가운데도 그 색이 되어야 한다. */
const flat = new Uint8ClampedArray(9 * 4);
for (let i = 0; i < 9; i++) {
  flat[i * 4] = 100;
  flat[i * 4 + 1] = 150;
  flat[i * 4 + 2] = 200;
  flat[i * 4 + 3] = 255;
}
const hole = new Uint8Array(9);
hole[4] = 1;
const filled = I.inpaint(flat, hole, 3, 3);
eq(filled[4 * 4], 100, '구멍이 주변 색으로 메워진다');
eq(filled[4 * 4 + 3], 255, '메운 자리는 불투명하다');
eq(filled[0], 100, '구멍 아닌 자리는 안 건드린다');

/*
 * ★ 가장 저지르기 쉬운 사고: 고르면서 바로 쓰면 **방금 메운 색이 옆 자리의 재료**가 되어
 * 왼쪽 위 색 하나가 구멍 전체를 물들인다. 왼쪽이 검고 오른쪽이 흰 그림의 가운데 세로줄을
 * 뚫어 두고, 메운 자리가 양쪽 색을 **둘 다** 물려받는지 본다.
 */
const W = 5;
const H = 3;
const split = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const v = x < 2 ? 0 : 255;
    split[i] = split[i + 1] = split[i + 2] = v;
    split[i + 3] = 255;
  }
}
const slit = new Uint8Array(W * H);
for (let y = 0; y < H; y++) slit[y * W + 2] = 1;
const mended = I.inpaint(split, slit, W, H);
const mid = mended[(1 * W + 2) * 4];
check(mid > 0 && mid < 255, `가운데는 양쪽 색을 둘 다 물려받아야 한다 (나온 것 ${mid})`);

/* 사방이 전부 구멍이면 **영영 안 끝나지 않는다**. 판 수를 잘라 두었으니 돌아와야 한다. */
const allHole = new Uint8Array(9).fill(1);
const stuck = I.inpaint(flat, allHole, 3, 3, 2);
eq(stuck.length, flat.length, '전부 구멍이어도 같은 크기로 돌아온다 (멈추지 않는다)');

// ── 마무리 ───────────────────────────────────────────────────────────────────
fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-cutout] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[test-cutout] 모양으로 배경 빼기. 검사 전부 통과');
