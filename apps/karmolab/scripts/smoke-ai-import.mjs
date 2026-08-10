/**
 * 로컬 AI 엔진을 **브라우저가 실제로 데려올 수 있는가** (해자④)
 *
 * 우리 번들은 IIFE(고전 스크립트)다. 거기서 `import()` 가 도는지는 **이론이 아니라 사실**의
 * 문제다 — 안 돌면 로컬 AI 는 첫걸음도 못 뗀다. 그런데 단위 검사는 가짜 loader 를 넣으므로
 * 이 자리를 절대 안 본다(그쪽은 늘 초록이다).
 *
 * 그래서 진짜 브라우저에서 진짜 `import()` 를 시킨다. 다만 **망에는 안 나간다** —
 * `data:` 주소로 작은 모듈을 만들어 넣는다. 확인하려는 것은 「엔진이 좋은가」가 아니라
 * 「이 자리에서 데려오기가 되는가」이고, 그건 망 없이도 답이 나온다.
 *
 * 사용: node scripts/smoke-ai-import.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const req = createRequire(pathToFileURL(path.join(root, 'package.json')).href);
const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);

const built = await esbuild.build({
  stdin: {
    contents:
      "import { loadEngine, resetEngine, webgpuAvailable } from './src/lib/ai-engine';\n" +
      'window.__ai = { loadEngine, resetEngine, webgpuAvailable };',
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  logLevel: 'error'
});
const code = built.outputFiles[0].text;

const failures = [];
const check = (ok, why) => {
  process.stdout.write(ok ? '.' : 'x');
  if (ok === false) failures.push(why);
};

/* 번들에 CDN 주소가 **글자로** 남아야 한다 — 통째로 말려 들어가면 초기 번들이 9MB 가 된다. */
check(code.includes('cdn.jsdelivr.net'), '엔진 주소가 번들에 글자로 남아 있다 (안 말려 들어갔다)');
check(code.length < 20000, `이 조각이 작다 (${code.length}바이트) — 엔진이 딸려 오지 않았다`);

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[ai-import] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(String.fromCharCode(10))[0]);
  process.exit(1);
}
const page = await browser.newPage();
await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await page.goto('http://localhost/');
await page.addScriptTag({ content: code });

const result = await page.evaluate(async () => {
  const ai = window.__ai;
  if (!ai) return { missing: true };
  const fakeNav = { gpu: {} };
  ai.resetEngine();
  // 진짜 동적 import — 망에는 안 나가고 data: 로 만든 작은 모듈을 데려온다.
  let ok = null;
  let err = null;
  try {
    const mod = await ai.loadEngine((url) => import(/* webpackIgnore: true */ 'data:text/javascript,export const pipeline = () => 1;'), fakeNav);
    ok = typeof mod.pipeline === 'function';
  } catch (e) {
    err = String(e && e.message);
  }
  // GPU 없는 자리에서는 받으러 가지도 않아야 한다
  ai.resetEngine();
  let blocked = null;
  try {
    await ai.loadEngine(async () => ({ pipeline: () => 1 }), {});
  } catch (e) {
    blocked = String(e && e.message);
  }
  return { ok, err, blocked, gpuHere: ai.webgpuAvailable(navigator) };
});

await browser.close();

check(result.missing !== true, '번들이 창에 안 실렸다');
check(result.ok === true, `브라우저의 고전 스크립트에서 동적 import 가 돈다 (오류: ${result.err ?? '없음'})`);
check(typeof result.blocked === 'string' && result.blocked.includes('브라우저'), `GPU 없으면 받으러 가지 않는다: ${result.blocked}`);

process.stdout.write(String.fromCharCode(10));
if (failures.length > 0) {
  console.error(`[ai-import] ${failures.length}건 실패:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[ai-import] IIFE 번들에서 동적 import 가 실제로 돈다 · 엔진은 안 딸려 왔다 · GPU 없으면 안 받는다');
