/**
 * 가리개가 정말 지우는지 확인한다 (TASK-KL-088)
 *
 * 이 도구의 약속은 「덮는 게 아니라 지운다」 하나다. 그런데 화면 위에 네모를 덮어 두기만 해도
 * 눈으로는 똑같이 보인다 — 내려받은 파일 안에 원본이 그대로 남아 있어도 아무도 모른다.
 * 그래서 눈이 아니라 **내보낸 파일의 점들**을 잰다.
 *
 *  ① 비밀 색으로 칠한 자리를 가린 뒤, 내보낸 그림에서 그 색이 한 점도 안 남았는지
 *  ② 가리지 않은 자리는 그대로인지 (엉뚱한 곳까지 지우면 그것도 사고다)
 *  ③ 모자이크도 마찬가지로 원래 색이 사라지는지
 *
 * 사용: node scripts/test-redact.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/redact.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['redact'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  // 비밀 색(왼쪽 위 60×60)과 그대로 남아야 할 색(오른쪽 아래)을 가진 그림을 만든다
  const SECRET = [255, 0, 128];
  const KEEP = [0, 200, 64];
  const src = document.createElement('canvas');
  src.width = 200; src.height = 200;
  const sc = src.getContext('2d');
  sc.fillStyle = '#ffffff'; sc.fillRect(0, 0, 200, 200);
  // 비밀은 글자처럼 얼룩덜룩하게 그린다. 단색 덩어리로 두면 모자이크가 평균을 내도 같은 색이라
  // 원래 아무것도 안 가려진다 — 그건 도구 잘못이 아니라 시험이 현실과 다른 것이다.
  sc.fillStyle = `rgb(${SECRET.join(',')})`;
  for (let y = 10; y < 70; y += 4) sc.fillRect(10, y, 60, 2);
  sc.fillStyle = `rgb(${KEEP.join(',')})`; sc.fillRect(130, 130, 50, 50);
  const blob = await new Promise((r) => src.toBlob(r, 'image/png'));
  const file = new File([blob], '캡처.png', { type: 'image/png' });

  // 파일 고르기 경로를 그대로 탄다
  const input = await window.__karmoWaitIn(host, '#rdFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 300));

  const canvas = host.querySelector('#rdCanvas');
  if (canvas.width !== 200) return { ok: false, why: `그림이 안 열렸다 (canvas ${canvas.width}px)` };

  // 비밀 자리를 덮도록 드래그한다 — 화면 좌표가 아니라 실제 포인터 이벤트로.
  // 자리는 **그때그때 다시 잰다**. 안내 문구가 바뀌면 화면이 밀려서, 미리 재 둔 자리는 어긋난다.
  // 처음에 미리 재 뒀다가 상자가 y −47 로 잡혀 도구를 의심했는데, 도구가 아니라 이 줄이 문제였다.
  const at = (ix, iy) => {
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (ix / canvas.width) * rect.width,
      clientY: rect.top + (iy / canvas.height) * rect.height
    };
  };
  const send = (type, pt) =>
    canvas.dispatchEvent(new PointerEvent(type, { ...pt, pointerId: 1, bubbles: true }));
  canvas.setPointerCapture = () => {};
  send('pointerdown', at(5, 5));
  send('pointermove', at(75, 75));
  send('pointerup', at(75, 75));

  // 내보내는 것과 같은 길로 점들을 읽는다
  const readPixels = () => {
    const c2 = document.createElement('canvas');
    c2.width = canvas.width; c2.height = canvas.height;
    c2.getContext('2d').drawImage(canvas, 0, 0);
    return c2.getContext('2d').getImageData(0, 0, c2.width, c2.height).data;
  };
  const near = (d, i, c) => Math.abs(d[i] - c[0]) < 12 && Math.abs(d[i + 1] - c[1]) < 12 && Math.abs(d[i + 2] - c[2]) < 12;
  const countOf = (d, c) => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (near(d, i, c)) n++;
    return n;
  };

  const afterFill = readPixels();
  const secretLeft = countOf(afterFill, SECRET);
  const keepLeft = countOf(afterFill, KEEP);
  const boxes = host.querySelector('#rdStats').textContent;

  // 모자이크로도 원래 색이 사라지는지
  host.querySelector('#rdModePixel').click();
  host.querySelector('#rdModeFill').click();
  host.querySelector('#rdReset').click();
  host.querySelector('#rdModePixel').click();
  send('pointerdown', at(5, 5));
  send('pointermove', at(75, 75));
  send('pointerup', at(75, 75));
  const secretAfterPixel = countOf(readPixels(), SECRET);

  // 그림 밖에서 끌기 시작하는 일은 흔하다 (가장자리에 붙은 것을 가릴 때).
  // 솔직히 적자면 이 줄은 도구의 클램프가 없어도 통과한다 — 회귀를 막는 검사가 아니라,
  // 밖에서 끌어도 가려지긴 한다는 것만 재는 줄이다. 클램프를 지우고 돌려서 확인했다.
  host.querySelector('#rdModeFill').click();
  host.querySelector('#rdReset').click();
  send('pointerdown', at(-40, -40));
  send('pointermove', at(75, 75));
  send('pointerup', at(75, 75));
  const secretAfterEdge = countOf(readPixels(), SECRET);

  return {
    ok:
      secretLeft === 0 && keepLeft === 2500 && secretAfterPixel === 0 &&
      secretAfterEdge === 0 && /1군데/.test(boxes),
    why:
      `검은칠 뒤 비밀색 ${secretLeft}점(0이어야 함) · 안 가린 색 ${keepLeft}점(2500이어야 함) · ` +
      `모자이크 뒤 ${secretAfterPixel}점 · 그림 밖에서 끌었을 때 ${secretAfterEdge}점 · ` +
      `가린 곳 표시 "${(boxes.match(/\d+군데/) || ['없음'])[0]}"`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-redact] 가린 자리가 파일에 남거나, 엉뚱한 곳까지 지웠다');
  process.exit(1);
}
console.log('[test-redact] 가린 점들이 내보낸 그림에 한 점도 안 남는 것까지 확인');
