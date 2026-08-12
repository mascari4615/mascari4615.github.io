/**
 * 나눴다 합친 파일이 원본과 같은지 확인한다 (TASK-KL-088)
 *
 * 이 도구의 값어치는 오직 하나 — **합친 결과가 원본과 한 바이트도 다르지 않은 것**이다.
 * 한 조각이라도 어긋나면 파일은 나오지만 열리지 않는다. 크기가 같아도 내용이 밀려 있을 수 있어
 * 길이 비교로는 부족하다. 그래서 **검사값(SHA-256)** 으로 잰다.
 *
 * 순서가 뒤섞인 채 넣어도 되는지, 조각이 빠지면 미리 알려 주는지도 함께 본다.
 *
 * 사용: node scripts/test-filesplit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/filesplit.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['filesplit'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const digestOf = async (blob) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  // 규칙 있는 잡음 — 한 조각만 어긋나도 검사값이 달라진다
  const N = 700_000;
  const src = new Uint8Array(N);
  let s = 12345;
  for (let i = 0; i < N; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    src[i] = s & 0xff;
  }
  const original = new Blob([src]);
  const originalHash = await digestOf(original);

  // ① 나누기 — 내려받기를 가로채 조각을 모은다
  const pieces = [];
  const origCreate = URL.createObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (b) => {
    if (b instanceof Blob) pieces.push(b);
    return 'blob:fake';
  };
  HTMLAnchorElement.prototype.click = function () {
    pieces[pieces.length - 1] = Object.assign(pieces[pieces.length - 1], { __name: this.download });
  };

  host.querySelector('#fsModeSplit').click();
  const dt = new DataTransfer();
  dt.items.add(new File([original], 'sample.bin', { type: 'application/octet-stream' }));
  const input = await window.__karmoWaitIn(host, '#fsFile');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  // 조각 크기 선택지는 MB 단위라 시험에서는 가장 작은 값을 쓰되, 파일을 그보다 크게 만들 수 없으니
  // 선택지 값을 직접 낮춰 여러 조각이 나오게 한다 (도구가 읽는 그 값 그대로다)
  const sel = host.querySelector('#fsSize');
  sel.innerHTML = '<option value="0.2" selected>0.2MB</option>';
  sel.dispatchEvent(new Event('change'));

  host.querySelector('#fsRun').click();
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const k = () => {
      if (host.querySelector('#fsStatus').textContent.includes('나눴어요')) return res();
      if (Date.now() - t0 > 20000) return rej(new Error('나누기가 끝나지 않았다: ' + host.querySelector('#fsStatus').textContent));
      setTimeout(k, 80);
    };
    k();
  });
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;

  const parts = pieces.filter((p) => p.__name && p.__name.endsWith('.part'));
  if (parts.length < 2) return { ok: false, why: `조각이 ${parts.length}개뿐이다` };

  // ② 합치기 — 일부러 순서를 뒤섞어 넣는다
  host.querySelector('#fsModeJoin').click();
  const shuffled = parts.slice().reverse().map((b) => new File([b], b.__name, { type: 'application/octet-stream' }));
  const dt2 = new DataTransfer();
  shuffled.forEach((f) => dt2.items.add(f));
  const input2 = host.querySelector('#fsFile');
  input2.files = dt2.files;
  input2.dispatchEvent(new Event('change'));

  let joined = null;
  URL.createObjectURL = (b) => {
    if (b instanceof Blob && b.size > 1000) joined = b;
    return 'blob:fake';
  };
  HTMLAnchorElement.prototype.click = function () {};
  host.querySelector('#fsRun').click();
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const k = () => {
      if (host.querySelector('#fsStatus').textContent.includes('합쳐')) return res();
      if (Date.now() - t0 > 20000) return rej(new Error('합치기가 끝나지 않았다'));
      setTimeout(k, 80);
    };
    k();
  });
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;
  if (!joined) return { ok: false, why: '합친 파일을 얻지 못했다' };

  const joinedHash = await digestOf(joined);

  // ③ 조각이 빠지면 미리 알려 주는가
  const dt3 = new DataTransfer();
  shuffled.slice(1).forEach((f) => dt3.items.add(f));
  input2.files = dt3.files;
  input2.dispatchEvent(new Event('change'));
  const warned = host.querySelector('#fsStatus').className.includes('error');

  return {
    ok: joinedHash === originalHash && joined.size === original.size && warned,
    why: `조각 ${parts.length}개 · 크기 ${joined.size}/${original.size} · 검사값 ${joinedHash === originalHash ? '같음' : '다름'} · 조각 빠짐 경고 ${warned ? '함' : '안 함'}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-filesplit] 나누기·합치기가 원본을 지키지 못한다');
  process.exit(1);
}
console.log('[test-filesplit] 순서를 뒤섞어 합쳐도 원본과 완전히 같은 것까지 확인');
