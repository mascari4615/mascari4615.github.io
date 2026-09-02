/**
 * 화면 영역 지켜보기의 숫자 읽기를 **실제 화면 한 장**으로 측정
 *
 * 화면 사진(PNG)과 숫자가 있는 영역들을 주면, 도구가 쓰는 길 그대로(캔버스 스트림, 이진화, tesseract)
 * 몇 초 동안 읽어 무엇이 읽혔는지 출력. 대시보드, 진행 막대, 시계 등 어떤 화면이든 같은 길
 *
 * 사용: node scripts/measure-regionwatch-ocr.mjs <png> <x,y,w,h[:기대값]> [<x,y,w,h[:기대값]> ...] [--seconds 6]
 *   예: node scripts/measure-regionwatch-ocr.mjs shot.png 1200,880,28,18:12 1240,880,28,18:7
 * 기대값을 적으면 맞힌 비율까지 집계. 사진은 저장소에 넣지 않음
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const args = process.argv.slice(2);
const png = args[0];
if (!png || !fs.existsSync(png)) {
  console.error('사용: node scripts/measure-regionwatch-ocr.mjs <png> <x,y,w,h[:기대값]> ...');
  process.exit(2);
}
const secondsIdx = args.indexOf('--seconds');
const SECONDS = secondsIdx >= 0 ? Number(args[secondsIdx + 1]) || 6 : 6;
const rects = args
  .slice(1)
  .filter((a, i) => !a.startsWith('--') && (secondsIdx < 0 || i + 1 !== secondsIdx + 1))
  .map((a) => {
    const [box, want] = a.split(':');
    const [x, y, w, h] = box.split(',').map(Number);
    return { x, y, w, h, want: want === undefined ? null : Number(want) };
  });
if (!rects.length) {
  console.error('영역이 없다. x,y,w,h 를 하나 이상');
  process.exit(2);
}

const dataUrl = 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.addInitScript(
  ({ dataUrl, rects }) => {
    const stage = document.createElement('canvas');
    const g = stage.getContext('2d');
    const img = new Image();
    const ready = new Promise((resolve) => {
      img.onload = () => {
        stage.width = img.naturalWidth;
        stage.height = img.naturalHeight;
        g.drawImage(img, 0, 0);
        setInterval(() => g.drawImage(img, 0, 0), 200);
        resolve();
      };
    });
    img.src = dataUrl;
    window.__reads = [];
    window.addEventListener('regionwatch:read', (e) => window.__reads.push(e.detail));
    /* 사진이 다 뜬 뒤에 스트림 생성. 0x0 캔버스의 스트림은 프레임 없음 */
    navigator.mediaDevices.getDisplayMedia = async () => {
      await ready;
      return stage.captureStream(5);
    };
    const slot = (i, r) => ({ name: 'r' + (i + 1), enabled: true, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, ref: null, thumb: '', mode: 'count', threshold: 0.9, lead: 5, sound: 'ping', rearm: 1, randomDelay: false });
    const slots = rects.slice(0, 6).map((r, i) => slot(i, r));
    while (slots.length < 6) slots.push({ ...slot(slots.length, { x: 0, y: 0, w: 4, h: 4 }), enabled: false, rect: null });
    localStorage.setItem('regionwatch.v1', JSON.stringify({ sw: 0, sh: 0, volume: 0, notify: false, slots }));
  },
  { dataUrl, rects }
);
await page.goto(`${BASE}#regionwatch`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#rwStart', { timeout: 20000 });
await page.click('#rwStart');
await page.waitForFunction(() => /준비됨|ready|完了|실패|fail/i.test(document.querySelector('#rwStatus')?.textContent || ''), null, { timeout: 90000 });
const status = await page.textContent('#rwStatus');
if (/실패|fail/i.test(status || '')) {
  console.error('숫자 읽기 준비 실패: ' + status);
  process.exit(1);
}
await page.waitForTimeout(SECONDS * 1000);
const reads = await page.evaluate(() => window.__reads);
const size = await page.textContent('.rw-slot[data-i="0"] [data-act="pick"]');
console.log(`화면 유입: 영역 1 표시 ${size}`);
await browser.close();
frozen?.close();

let hit = 0;
let total = 0;
rects.forEach((r, i) => {
  const mine = reads.filter((x) => x.slot === i);
  const texts = mine.map((x) => (x.text || '-').replace(/\s+/g, ' '));
  const secs = mine.map((x) => x.secs);
  const ok = r.want === null ? null : secs.filter((s) => s === r.want).length;
  if (r.want !== null) {
    hit += ok;
    total += mine.length;
  }
  console.log(`영역 ${i + 1} (${r.x},${r.y} ${r.w}x${r.h})${r.want === null ? '' : ` 기대 ${r.want}`}: 읽기 ${mine.length}회 ${r.want === null ? '' : `맞힘 ${ok}`}  -> ${texts.join(' | ')}`);
});
if (total) console.log(`맞힌 비율 ${hit}/${total} = ${Math.round((100 * hit) / total)}%`);
console.log(`[measure-regionwatch-ocr] ${path.basename(png)} 끝`);
