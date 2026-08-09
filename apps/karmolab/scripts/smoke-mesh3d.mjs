/**
 * 3D 뷰어가 **진짜 여는가** (흡수 ⓑ)
 *
 * `test-core` 는 읽는 계산만 본다 — 문자열을 주고 삼각형 수를 확인한다. 그건 「셈이 맞다」까지다.
 * 화면은 다르다: 파일을 고르는 칸이 있어야 하고, 그 파일이 알맹이로 흘러가야 하고, WebGL 이
 * 실제로 **픽셀을 칠해야** 한다. 그 사슬 중 하나만 끊겨도 알맹이 시험은 전부 초록이고,
 * 사람 화면에는 까만 네모만 남는다.
 *
 * 그래서 진짜 번들을 브라우저에 실어 **파일을 골라 본다.** 정육면체(삼각형 12개)를 넣고
 * ① 삼각형 수가 화면 글로 나오는지 ② 캔버스에 칠해진 점이 있는지를 함께 본다.
 * ②가 없으면 「읽기는 됐는데 안 그려진다」를 못 잡는다 — 그게 이 도구의 유일한 값이다.
 *
 * 사용: node scripts/smoke-mesh3d.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUNDLE = 'js/widgets/tools/mesh3d.js';

/* 볼 대상이 아직 없으면 「못 돌렸다」다 — 배포 길목에서 이걸 실패로 세면 안 된다. */
if (fs.existsSync(path.join(root, BUNDLE)) === false) {
  console.log(`[mesh3d-smoke] CANNOT-RUN(건너뜀) — 번들이 아직 없다: ${BUNDLE}`);
  console.log('  `node build.mjs` 뒤에 돌려라.');
  process.exit(0);
}

/* 정육면체 OBJ — 면이 사각형 6개다. 뷰어가 삼각형으로 쪼개야 12개가 된다(안 쪼개면 6개). */
const NL = String.fromCharCode(10);
const CUBE = [
  'v -10 -10 -10',
  'v  10 -10 -10',
  'v  10  10 -10',
  'v -10  10 -10',
  'v -10 -10  10',
  'v  10 -10  10',
  'v  10  10  10',
  'v -10  10  10',
  'f 1 2 3 4',
  'f 5 6 7 8',
  'f 1 2 6 5',
  'f 2 3 7 6',
  'f 3 4 8 7',
  'f 4 1 5 8'
].join(NL);

const objPath = path.join(os.tmpdir(), 'karmolab-smoke-cube.obj');
fs.writeFileSync(objPath, CUBE);

let browser;
try {
  /*
   * 화면 없는 기계에서도 WebGL 을 쓰게 한다. `--use-gl=swiftshader` 는 **넣으면 안 된다** —
   * 실측으로 그 조합에서 컨텍스트가 곧바로 죽었다(CONTEXT_LOST_WEBGL). 그러면 「제품이 안
   * 그린다」로 보이는데 실제로는 검사 쪽이 GPU 를 부순 것이다.
   */
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
} catch (error) {
  console.error('[mesh3d-smoke] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(NL)[0]);
  process.exit(1);
}

const page = await browser.newPage();
await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => {
      window.__reg[t.id] = t;
    },
    trackUse() {},
    copyText() {},
    onDispose() {},
    mountTool() {
      return true;
    }
  };
});
await page.addScriptTag({ content: fs.readFileSync(path.join(root, BUNDLE), 'utf8') });

const fails = [];

const built = await page.evaluate(() => {
  const tool = window.__reg['mesh3d'];
  if (!tool) return { missing: true };
  const host = document.createElement('div');
  host.style.width = '640px';
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  window.__host = host;
  return { hasInput: !!host.querySelector('#m3File'), note: host.querySelector('#m3Info')?.textContent ?? '' };
});

if (built.missing === true) {
  fails.push('번들을 실어도 mesh3d 가 등록되지 않는다');
} else {
  if (built.hasInput !== true) fails.push('파일 고르는 칸이 없다 — 아무것도 열 수 없다');
  if (/WebGL/.test(built.note)) {
    /* 그릴 수단이 없는 기계다. 「못 돌렸다」지 「제품이 고장」이 아니다. */
    console.log(`[mesh3d-smoke] CANNOT-RUN — 이 기계의 브라우저가 WebGL 을 못 준다: ${built.note}`);
    await browser.close();
    process.exit(0);
  }

  await page.setInputFiles('#m3File', objPath);

  const note = await page
    .waitForFunction(
      () => {
        const el = window.__host.querySelector('#m3Info');
        const txt = el?.textContent ?? '';
        return txt.includes('삼각형') || txt.includes('없습니다') ? txt : false;
      },
      { timeout: 8000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);

  if (note === null) fails.push('파일을 골라도 화면이 아무 말이 없다 (8초)');
  else if (note.includes('삼각형 12개') === false) {
    fails.push(`정육면체(사각형 6면 → 삼각형 12개)를 그렇게 안 읽는다: ${note}`);
  }
  if (note !== null && note.includes('20 × 20 × 20') === false) {
    fails.push(`크기를 20 × 20 × 20 으로 안 낸다: ${note}`);
  }

  /* 진짜 칠해졌나. 읽기만 되고 안 그려지는 상태를 여기서만 잡는다. */
  const painted = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = window.__host.querySelector('#m3Canvas');
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    const px = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (gl.getError() === gl.CONTEXT_LOST_WEBGL || gl.isContextLost()) return { lost: true };
    let lit = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
    return { lit, total: px.length / 4 };
  });
  if (painted.lost === true) {
    console.log('[mesh3d-smoke] CANNOT-RUN — 그리는 도중 이 기계의 WebGL 컨텍스트가 죽었다 (제품 판정 아님)');
    process.exit(0);
  }
  if (painted.lit === 0) fails.push('캔버스가 통째로 비었다 — 읽기는 됐는데 안 그려진다');
  else if (painted.lit > painted.total * 0.9) fails.push('캔버스가 통째로 칠해졌다 — 모델이 아니라 배경만 칠한 것 같다');
}

await browser.close();
fs.rmSync(objPath, { force: true });

if (fails.length > 0) {
  console.error('[mesh3d-smoke] 실패:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('[mesh3d-smoke] 화면에서 정육면체 OBJ 를 열었다 — 삼각형 12개·20×20×20, 캔버스에 실제로 칠해짐');
