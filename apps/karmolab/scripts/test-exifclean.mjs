/**
 * 사진 정보 읽기·지우기가 진짜로 도는지 확인한다 (TASK-KL-088)
 *
 * 이 도구에서 가장 나쁜 실패는 **위치가 들어 있는데 「없다」고 말하는 것**이다.
 * 사용자는 안심하고 사진을 올린다. 오류도 안 나고 파일도 멀쩡히 나온다.
 *
 * 그래서 좌표를 아는 사진을 직접 만들어 넣고 ① 그 좌표를 읽어 내는지
 * ② 지운 뒤 정말 사라졌는지 ③ **그림 데이터가 그대로인지**(화질 손상 없음)를 잰다.
 *
 * 사용: node scripts/test-exifclean.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** 좌표가 든 JPEG 을 만든다 — 최소한의 EXIF(APP1)를 손으로 엮는다. */
function buildJpegWithGps(baseJpeg, lat, lon) {
  const be = (n, size) => {
    const b = [];
    for (let i = size - 1; i >= 0; i--) b.push((n >> (i * 8)) & 0xff);
    return b;
  };
  const dms = (v) => {
    const d = Math.floor(v);
    const m = Math.floor((v - d) * 60);
    const s = Math.round((v - d - m / 60) * 3600 * 100);
    return [...be(d, 4), ...be(1, 4), ...be(m, 4), ...be(1, 4), ...be(s, 4), ...be(100, 4)];
  };

  // TIFF(빅엔디안) + IFD0(1개: GPS 포인터) + GPS IFD(4개) + 값 영역
  const tiff = [];
  tiff.push(0x4d, 0x4d, 0x00, 0x2a, ...be(8, 4)); // MM, 42, IFD0 = 8
  tiff.push(...be(1, 2)); // IFD0 항목 1개
  tiff.push(...be(0x8825, 2), ...be(4, 2), ...be(1, 4), ...be(26, 4)); // GPS IFD 위치
  tiff.push(...be(0, 4)); // 다음 IFD 없음
  // GPS IFD @26
  const gpsStart = 26;
  const valueStart = gpsStart + 2 + 4 * 12 + 4; // 항목 4개
  const latVals = dms(Math.abs(lat));
  const lonVals = dms(Math.abs(lon));
  tiff.push(...be(4, 2));
  tiff.push(...be(0x0001, 2), ...be(2, 2), ...be(2, 4), lat >= 0 ? 0x4e : 0x53, 0x00, 0x00, 0x00); // N/S
  tiff.push(...be(0x0002, 2), ...be(5, 2), ...be(3, 4), ...be(valueStart, 4));
  tiff.push(...be(0x0003, 2), ...be(2, 2), ...be(2, 4), lon >= 0 ? 0x45 : 0x57, 0x00, 0x00, 0x00); // E/W
  tiff.push(...be(0x0004, 2), ...be(5, 2), ...be(3, 4), ...be(valueStart + 24, 4));
  tiff.push(...be(0, 4));
  tiff.push(...latVals, ...lonVals);

  const app1Body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0" + TIFF
  const app1 = [0xff, 0xe1, ...be(app1Body.length + 2, 2), ...app1Body];

  const out = new Uint8Array(2 + app1.length + (baseJpeg.length - 2));
  out.set([0xff, 0xd8], 0);
  out.set(app1, 2);
  out.set(baseJpeg.subarray(2), 2 + app1.length);
  return out;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/exifclean.js') });

// 바탕이 될 평범한 JPEG 을 브라우저에서 만들고, node 쪽에서 좌표를 심는다
const baseB64 = await page.evaluate(async () => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 48;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3388cc';
  ctx.fillRect(0, 0, 64, 48);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
  const buf = new Uint8Array(await blob.arrayBuffer());
  return btoa(String.fromCharCode(...buf));
});
const base = Uint8Array.from(atob(baseB64), (c) => c.charCodeAt(0));
const withGps = buildJpegWithGps(base, 37.566535, 126.977969); // 서울시청
const withGpsB64 = Buffer.from(withGps).toString('base64');

const result = await page.evaluate(async (b64) => {
  const tool = window.__reg['exifclean'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = new File([bytes], 'gps.jpg', { type: 'image/jpeg' });

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  const input = await window.__karmoWaitIn(host, '#exFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  await new Promise((res, rej) => {
    const t0 = Date.now();
    const k = () => {
      if (host.querySelector('#exList').textContent.trim()) return res();
      if (Date.now() - t0 > 8000) return rej(new Error('사진을 읽지 못했다'));
      setTimeout(k, 60);
    };
    k();
  });

  const shown = host.querySelector('#exList').textContent;
  const foundGps = shown.includes('37.5665') && shown.includes('126.9779');

  // 지운 결과를 가로채 확인
  let cleaned = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { if (b && b.type === 'image/jpeg') cleaned = b; return orig(b); };
  host.querySelector('#exRun').click();
  URL.createObjectURL = orig;
  if (!cleaned) return { ok: false, why: '지운 파일을 얻지 못했다' };

  const outBytes = new Uint8Array(await cleaned.arrayBuffer());
  // APP1(0xFFE1) 이 남아 있으면 안 된다
  let hasApp1 = false;
  for (let i = 2; i < outBytes.length - 1; ) {
    if (outBytes[i] !== 0xff) break;
    const marker = outBytes[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xe1) hasApp1 = true;
    i += 2 + ((outBytes[i + 2] << 8) | outBytes[i + 3]);
  }

  // 그림이 그대로인지 — 다시 열어 색을 본다
  const px = await new Promise((r) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0);
      const d = c.getImageData(10, 10, 1, 1).data;
      r([img.naturalWidth, d[0], d[1], d[2]]);
    };
    img.onerror = () => r([0, 0, 0, 0]);
    img.src = URL.createObjectURL(cleaned);
  });
  const sameImage = px[0] === 64 && Math.abs(px[1] - 0x33) < 12 && Math.abs(px[2] - 0x88) < 12 && Math.abs(px[3] - 0xcc) < 12;

  return {
    ok: foundGps && !hasApp1 && sameImage,
    why: `좌표 읽음=${foundGps} · 지운 뒤 정보구획 남음=${hasApp1} · 그림 그대로=${sameImage} (${px.join(',')})`
  };
}, withGpsB64);

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-exifclean] 사진 정보 읽기·지우기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-exifclean] 좌표를 읽고, 지우고, 그림은 그대로인 것까지 확인');
