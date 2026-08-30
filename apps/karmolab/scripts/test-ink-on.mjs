/**
 * 글자색 고르기. **전 색을 훑어** 기준을 넘는지 본다 (2026-08-13)
 *
 * 왜 있나: 무작위 뽑기의 색 카드는 바탕이 매번 다르다. 그래서 화면 대비 검사는 그 판에
 * 우연히 뽑힌 색만 본다. 실제로 202개 화면 OK가 나온 판 바로 다음에 어두운 색이 뽑혀
 * 빨개졌다. **우연히 통과하는 검사**는 지키는 게 아니다. 여기서는 색 공간을 훑어 최악을 잰다.
 *
 * 사용: node scripts/test-ink-on.mjs   (npm run test:ink)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kl-ink-')), 'ink.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/ink-on.ts')],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { inkOn, parseHex, contrastRatio } = await import(pathToFileURL(out).href);

/** 화면 대비 검사와 같은 기준 (smoke-contrast.mjs). */
const MIN = 2.2;
const hex = (n) => '#' + n.toString(16).padStart(2, '0');

let worst = { ratio: 99, hex: null, kind: null };
for (let r = 0; r < 256; r += 3) {
  for (let g = 0; g < 256; g += 3) {
    for (let b = 0; b < 256; b += 3) {
      const h = '#' + hex(r).slice(1) + hex(g).slice(1) + hex(b).slice(1);
      const got = inkOn(h);
      if (got.ratio < worst.ratio) worst = { ratio: got.ratio, hex: h, kind: got.kind };
    }
  }
}

const fails = [];
if (worst.ratio < MIN) fails.push(`최악 대비 ${worst.ratio.toFixed(2)} < 기준 ${MIN}. ${worst.hex} (${worst.kind})`);

/* 이 자리를 실제로 무너뜨렸던 색들은 이름을 걸어 둔다. 다시 문턱 방식으로 돌아가면 여기서 선다. */
for (const [h, why] of [['#00ff00', '순수 초록. 체감 밝기 문턱(0.6)을 못 넘어 흰 글자가 되던 색'],
                        ['#3534a5', '어두운 남색. 아랫줄이 검정 고정이라 안 보이던 색 (실측 1.79)']]) {
  const got = inkOn(h);
  if (got.ratio < MIN) fails.push(`${h} 대비 ${got.ratio.toFixed(2)}. ${why}`);
}

/* 셈 자체가 맞는지 한 번 (흰 바탕 위 검정 = 21). */
const sanity = contrastRatio(parseHex('#ffffff'), parseHex('#000000'));
if (Math.abs(sanity - 21) > 0.1) fails.push(`흰 바탕 위 검정 대비가 ${sanity.toFixed(2)}. 셈이 틀렸다`);

if (fails.length) {
  console.error('[test-ink-on] 빨강 ' + fails.length + '건');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log(`[test-ink-on] 색 공간 전수. 최악 대비 ${worst.ratio.toFixed(2)} (기준 ${MIN}), ${worst.hex} 에서 ${worst.kind} 글자`);
