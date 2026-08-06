/**
 * 직접 짠 GIF 압축이 진짜 열리는 파일을 만드는지 확인 (TASK-KL-088)
 *
 * GIF 를 쓰는 코드는 눈으로 봐서는 맞는지 알 수 없다 — 비트 하나만 틀려도 파일이 통째로 안 열린다.
 * 그런데 우리 코드는 아무 오류 없이 그 잘못된 파일을 만들어 낸다(무음 실패).
 * 그래서 **브라우저에게 직접 열게 시키고, 픽셀을 읽어** 맞는지 본다.
 * 브라우저가 못 열면 이미지 크기가 0 이 되므로 그것으로 갈린다.
 *
 * 사용: node scripts/test-gif.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const encoder = fs.readFileSync(path.join(root, 'js/widgets/tools/gifenc.js'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: encoder });

const result = await page.evaluate(async () => {
  const gif = window.KarmoGif;
  if (!gif) return { ok: false, why: 'KarmoGif 가 붙지 않았다' };

  const solid = (w, h, r, g, b) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    return d;
  };

  const open = (blob) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });

  const read = (img) => {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    return [d[0], d[1], d[2]];
  };

  const cases = [];

  // ① 단색 두 장 — 가장 기본. 첫 장의 색이 그대로 나와야 한다.
  {
    const w = 16, h = 16;
    const blob = gif.encode({
      width: w, height: h,
      frames: [
        { data: solid(w, h, 220, 30, 40), delayMs: 100 },
        { data: solid(w, h, 30, 60, 220), delayMs: 100 }
      ],
      maxColors: 64
    });
    const img = await open(blob);
    if (!img) cases.push({ name: '단색 2장', ok: false, why: '브라우저가 파일을 못 열었다' });
    else {
      const [r, g, b] = read(img);
      const near = Math.abs(r - 220) < 24 && Math.abs(g - 30) < 24 && Math.abs(b - 40) < 24;
      cases.push({
        name: '단색 2장',
        ok: img.naturalWidth === w && img.naturalHeight === h && near,
        why: `크기 ${img.naturalWidth}x${img.naturalHeight}, 첫 픽셀 ${r},${g},${b} (기대 220,30,40)`,
        bytes: blob.size
      });
    }
  }

  // ② 그라데이션 — 색 줄이기와 오차 확산이 도는 길. 평균색이 원본과 가까워야 한다.
  {
    const w = 64, h = 32;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        d[i] = Math.round((x / (w - 1)) * 255);
        d[i + 1] = Math.round((y / (h - 1)) * 255);
        d[i + 2] = 128;
        d[i + 3] = 255;
      }
    }
    const blob = gif.encode({ width: w, height: h, frames: [{ data: d, delayMs: 100 }], maxColors: 128 });
    const img = await open(blob);
    if (!img) cases.push({ name: '그라데이션', ok: false, why: '브라우저가 파일을 못 열었다' });
    else {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const got = ctx.getImageData(0, 0, w, h).data;
      let diff = 0;
      for (let i = 0; i < w * h; i++) {
        diff += Math.abs(got[i * 4] - d[i * 4]) + Math.abs(got[i * 4 + 1] - d[i * 4 + 1]) + Math.abs(got[i * 4 + 2] - d[i * 4 + 2]);
      }
      const avg = diff / (w * h * 3);
      cases.push({
        name: '그라데이션',
        ok: img.naturalWidth === w && avg < 12,
        why: `픽셀당 평균 오차 ${avg.toFixed(1)} (12 미만이어야 함)`,
        bytes: blob.size
      });
    }
  }

  // ③ 안 변한 픽셀 건너뛰기가 실제로 도는지.
  //    잣대를 「한 장 대비 얼마나 늘었나」로 잡으면 안 된다 — 작은 그림은 머리말이 대부분이라
  //    무슨 짓을 해도 통과하거나 무슨 짓을 해도 실패한다(실제로 그렇게 짰다가 헛걸음했다).
  //    올바른 비교는 **같은 장 한 번 더** 와 **다른 장 한 번 더** 다. 건너뛰기가 돌면 앞이 훨씬 싸다.
  {
    //    단색으로 재면 안 된다 — 어차피 압축이 다 먹어 차이가 몇 바이트에 그친다(실측 6B).
    //    잡음 화면이라야 「한 장 더 그리는 값」이 커져서 건너뛰기가 도는지 드러난다.
    const w = 64, h = 64;
    const noise = (seed) => {
      const d = new Uint8ClampedArray(w * h * 4);
      let s = seed;
      for (let i = 0; i < w * h; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        d[i * 4] = s & 0xff;
        d[i * 4 + 1] = (s >> 8) & 0xff;
        d[i * 4 + 2] = (s >> 16) & 0xff;
        d[i * 4 + 3] = 255;
      }
      return d;
    };
    const one = noise(7);
    const other = noise(99);
    const same = gif.encode({
      width: w, height: h,
      frames: [{ data: one, delayMs: 100 }, { data: one.slice(), delayMs: 100 }],
      maxColors: 32
    });
    const diff = gif.encode({
      width: w, height: h,
      frames: [{ data: one, delayMs: 100 }, { data: other, delayMs: 100 }],
      maxColors: 32
    });
    const img = await open(same);
    cases.push({
      name: '안 변한 화면 건너뛰기',
      ok: !!img && same.size < diff.size * 0.7,
      why: `같은 장 반복 ${same.size}B < 다른 장 ${diff.size}B 의 70% 여야 함`
    });
  }

  return { ok: cases.every((c) => c.ok), cases };
});

await browser.close();

if (!result.ok && !result.cases) {
  console.error('[test-gif] ' + result.why);
  process.exit(1);
}
for (const c of result.cases) {
  console.log(`${c.ok ? '  OK' : '  X '} ${c.name} — ${c.why}${c.bytes ? ` · ${c.bytes}B` : ''}`);
}
if (!result.ok) {
  console.error('[test-gif] GIF 압축이 잘못된 파일을 만든다');
  process.exit(1);
}
console.log('[test-gif] 브라우저가 세 경우 모두 열고 픽셀도 맞다');
