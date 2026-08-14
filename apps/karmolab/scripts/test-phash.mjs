/**
 * 지각 해시 — **밝기가 밀려도 같은 사진으로 나오는가** (TASK-KL-238 / 46 tineye).
 *
 * 이 도구의 값어치는 하나다: 파일이 달라져도(재압축·크기 변경·노출 차이) **눈에 같은 사진**을
 * 같다고 말하는 것. 그래서 여기서 크게 지키는 것은 「같은 것을 같다고 하는가」와
 * 「다른 것을 다르다고 하는가」 둘이고, 못 재는 것(뒤집기·회전)은 *다르게 나온다고* 못 박는다.
 *
 * 사용: node scripts/test-phash.mjs   (npm run test:phash)
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
  const entry = path.join(os.tmpdir(), `phash-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/phash.ts'))};\n`);
  const out = path.join(os.tmpdir(), `phash-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const P = await load();
const N = P.HASH_W * P.HASH_H;

/** 왼→오로 밝아지는 그림 하나. 실제 사진의 가장 흔한 성질(한쪽이 밝다)을 흉내낸다. */
const gradient = () => Array.from({ length: N }, (_, i) => (i % P.HASH_W) * 25);
/** 씨앗 있는 무작위 — 같은 판을 두 번 돌려도 같은 답이 나와야 한다(들쭉날쭉한 검사 X). */
function noise(seed) {
  let s = seed;
  return Array.from({ length: N }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 255;
  });
}

const g = gradient();
const h = P.dhash(g);

check(h.length === 16, `64비트 = 16자리여야 한다 (나온 것 ${h.length})`);
check(/^[0-9a-f]+$/.test(h), '16진수 소문자로만');
check(P.dhash(g) === h, '같은 그림은 늘 같은 해시 (들쭉날쭉하면 못 쓴다)');
check(P.hamming(h, h) === 0, '자기 자신과는 0비트 차이');

/* ★ 이 도구의 핵심. 노출이 통째로 밝아져도(전 칸 +40) **같은 사진**이어야 한다 —
 *   파일 해시가 못 하는 바로 그 일이다. */
const brighter = g.map((v) => Math.min(255, v + 40));
check(P.dhash(brighter) === h, '전체가 밝아져도 같은 해시 (노출 차이는 다른 사진이 아니다)');

/* 대비가 커져도(×1.5) 이웃끼리의 대소는 그대로다. */
const contrast = g.map((v) => Math.min(255, v * 1.5));
check(P.dhash(contrast) === h, '대비가 세져도 같은 해시');

/* 재압축 흉내 — 칸마다 ±3 흔들었을 때 「거의 같음」 안에 들어와야 한다. */
const jitter = g.map((v, i) => v + ((i % 3) - 1) * 3);
const dJitter = P.hamming(h, P.dhash(jitter));
check(dJitter <= 5, `살짝 흔들린 사진은 5비트 안 (나온 것 ${dJitter})`);
check(P.verdict(dJitter) === 'same' || P.verdict(dJitter) === 'likely', '살짝 흔들림 = 같음/거의 같음');

/* 아예 다른 그림은 멀어야 한다. */
const dOther = P.hamming(h, P.dhash(noise(7)));
check(dOther > 10, `다른 사진은 10비트 초과여야 한다 (나온 것 ${dOther})`);
check(P.verdict(dOther) === 'different', '다른 사진 = 다름');

/* ★ 못 하는 것도 못 한다고 나와야 한다 — 좌우 뒤집기는 *다른 사진*으로 잡힌다.
 *   여기서 「같다」가 나오면 화면의 설명(뒤집기는 못 잡는다)이 거짓말이 된다. */
const flipped = [];
for (let y = 0; y < P.HASH_H; y++) {
  for (let x = 0; x < P.HASH_W; x++) flipped.push(g[y * P.HASH_W + (P.HASH_W - 1 - x)]);
}
check(P.hamming(h, P.dhash(flipped)) > 10, '좌우 뒤집기는 다른 사진으로 나온다 (한계를 그대로 지킨다)');

/* 판정 눈금 */
check(P.verdict(0) === 'same', '0비트 = 같음');
check(P.verdict(5) === 'likely', '5비트 = 거의 같음');
check(P.verdict(10) === 'maybe', '10비트 = 비슷함');
check(P.verdict(11) === 'different', '11비트 = 다름');
check(P.similarity(0) === 100, '0비트 = 100%');
check(P.similarity(P.HASH_BITS) === 0, '전부 다르면 0%');

/* 잘못된 입력은 조용히 넘어가면 안 된다 — 0 으로 채우면 모든 사진이 비슷해진다. */
let threw = false;
try { P.dhash([1, 2, 3]); } catch { threw = true; }
check(threw, '격자 크기가 틀리면 던진다');
threw = false;
try { P.hamming('abcd', 'abcdef'); } catch { threw = true; }
check(threw, '길이가 다른 해시는 던진다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n지각 해시 — ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('지각 해시 — 전부 통과');
