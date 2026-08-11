/**
 * 브라우저와 Node 가 **같은 답**을 내는지 맞춰 본다 (TASK-KL-205 / S1)
 *
 * 왜 있나: 해시는 알맹이가 직접 계산하지 않는다. 계산기를 밖에서 받고, 브라우저는 CryptoJS 를,
 * Node 는 `node:crypto` 를 준다. 손이 둘이면 **답이 갈릴 수 있다** — 그런데 갈려도 양쪽 다
 * 그럴듯한 16진수라 눈으로는 못 잡는다. 「AI 가 해시를 지어낸다」와 같은 종류의 사고다.
 *
 * 그래서 같은 글자를 양쪽에 넣고 **글자 하나까지 대조**한다. 여기가 빨간데 배포하면,
 * 사이트가 내놓는 체크섬과 사람들이 `sha256sum` 으로 얻는 값이 달라진다.
 *
 * `test-core.mjs` 는 Node 쪽만 본다. 여기서만 두 손이 만난다.
 *
 * 사용: node scripts/smoke-core-parity.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const failures = [];
const check = (ok, why) => {
  process.stdout.write(ok ? '.' : 'x');
  if (ok === false) failures.push(why);
};

const NODE_ALGO = { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512', RIPEMD160: 'ripemd160' };
// 한글·이모지를 넣는 이유: CryptoJS 는 기본이 Latin1 이라, UTF-8 로 안 다루면 여기서만 갈린다.
const SAMPLES = ['KarmoLab', '안녕하세요', '🦴 뼈', ''];

/*
 * 이 검사는 **배포 길목**에 있다(build 사슬, `node build.mjs` 뒤). 그래서 시작하기 전에
 * 「돌릴 수 있는 자리인가」를 먼저 가른다 — 못 돌린 것을 제품 고장으로 말하면 배포가 통째로
 * 서고, 로그를 끝까지 읽어야 이유를 안다(2026-08-08 에 세 판 그렇게 섰다).
 *
 * ① 볼 대상(번들)이 아직 없으면 = 아직 안 찍은 것. 건너뛴다(exit 0).
 *    build 사슬에서는 앞 단계가 찍고 오므로, 여기 걸린다는 건 「순서가 틀렸다」는 뜻이다.
 * ② 브라우저가 없으면 = 진짜로 못 잰다. 빨갛게 내되 **왜인지 한 줄로** 말한다(exit 1).
 *    러너에 브라우저 까는 것은 워크플로가 하는 일이라, 조용히 통과시키면 그날부터 안 재고 초록이다.
 */
const NEEDED = ['js/vendor/crypto-js.min.js', 'js/widgets/tools/hashgen.js', 'js/widgets/tools/passgen.js'];
const missing = NEEDED.filter((rel) => fs.existsSync(path.join(root, rel)) === false);
if (missing.length > 0) {
  console.log(`[smoke-core-parity] CANNOT-RUN(건너뜀) — 볼 번들이 아직 없다: ${missing.join(' · ')}`);
  console.log('  `node build.mjs` 뒤에 돌려라 (build 사슬에서는 자동으로 그 순서다).');
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[smoke-core-parity] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split('\n')[0]);
  process.exit(1);
}
const page = await browser.newPage();
await page.route('**/*', (route) => {
  // JSON(번역 파일) 요청이면 빈 껍데기 JSON을 줘서 에러를 막는다.
  if (route.request().url().endsWith('.json')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, mountTool() { return true; } };
  window.Mdd = { linePreset() {} };
  // i18n 무한 대기를 뚫기 위한 가짜 번역 객체 주입
  window.i18next = { t: (k) => k, loadNamespaces: async () => {} };
  window.i18n = { t: (k) => k, loadNamespace: async () => {} };
  window.loadNamespace = async () => {};
  window.t = (k) => k;
});
await page.addScriptTag({ content: read('js/vendor/crypto-js.min.js') });
await page.addScriptTag({ content: read('js/widgets/tools/hashgen.js') });

// ★ `build()` 는 **더 이상 동기가 아니다** (2026-08-10). i18n 갈래(loadNamespace)가 들어오면서
//   말 묶음을 받아 온 **뒤에** 그린다. 이 검사는 그리자마자 `#hgInput` 을 찾았고, 그래서
//   `Cannot set properties of null` 로 5판 연속 빨갰다 — 제품이 깨진 게 아니라 **검사의 전제**가 낡았다.
//   고치는 방법은 sleep 이 아니라 **그려질 때까지 기다리기**다(느린 러너에서 또 깨지지 않게).
//   안 나타나면 조용히 멈추지 않고 그 사실을 말하고 죽는다.
const browserHashes = await page.evaluate(async (samples) => {
  const tool = window.__reg['hashgen'];
  if (!tool) return { missing: true };
  const waitFor = async (host, sel, ms = 5000) => {
    const until = Date.now() + ms;
    for (;;) {
      const el = host.querySelector(sel);
      if (el) return el;
      if (Date.now() > until) return null;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const out = {};
  for (const sample of samples) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    tool.tabs[0].build(host);
    const input = await waitFor(host, '#hgInput');
    if (!input) return { timedOut: true, sample };
    input.value = sample;
    input.dispatchEvent(new Event('input'));
    // 그리기가 입력 이벤트에 이어 붙는 경우도 있어 한 줄이 생길 때까지 기다린다.
    await waitFor(host, '.hg-row');
    out[sample] = [...host.querySelectorAll('.hg-row')].map((r) => [
      r.querySelector('.tool-list-key').textContent,
      r.dataset.hash
    ]);
    host.remove();
  }
  return out;
}, SAMPLES);

check(browserHashes.missing !== true, 'hashgen 위젯이 등록되지 않았다');
check(browserHashes.timedOut !== true,
  `hashgen 이 5초 안에 안 그려졌다 (표본 ${browserHashes.sample}) — build() 가 기다리는 것(i18n 말 묶음)이 안 온다`);

const LABEL_TO_ALGO = {
  MD5: 'MD5',
  'SHA-1': 'SHA1',
  'SHA-256': 'SHA256',
  'SHA-512': 'SHA512',
  'SHA3-512': 'SHA3_512',
  'Keccak-512': 'KECCAK512',
  'RIPEMD-160': 'RIPEMD160'
};

for (const sample of SAMPLES) {
  const rows = browserHashes[sample] ?? [];
  check(rows.length === 7, `「${sample || '(빈 글자)'}」 에서 7줄이 나와야 하는데 ${rows.length}줄`);
  for (const [label, browserHex] of rows) {
    const algo = LABEL_TO_ALGO[label];
    check(algo !== undefined, `모르는 이름이 나왔다: ${label} — 이름을 바꿨으면 이 표도 같이 고쳐라`);
    if (algo === undefined) continue;

    // SHA3-512 는 우리가 직접 쓴 코드가 낸다(`core/sha3.ts`). 브라우저에 제대로 실려 나갔는지
    // 여기서 OpenSSL 과 맞춰 본다 — 알맹이만 맞고 번들에 안 실리는 경우를 잡는 자리다.
    if (algo === 'SHA3_512') {
      const nodeSha3 = sample === '' ? '' : crypto.createHash('sha3-512').update(sample, 'utf8').digest('hex');
      check(browserHex === nodeSha3, `「${sample || '(빈 글자)'}」 SHA3-512 — 브라우저 ${browserHex || '(없음)'} ≠ OpenSSL ${nodeSha3 || '(없음)'}`);
      continue;
    }

    // Keccak-512 는 Node 에 없다(OpenSSL 이 안 내준다). 그래서 값을 못 맞춰 본다 —
    // 대신 **SHA-3 과 달라야 한다**는 사실을 잠근다. 어느 날 한쪽이 조용히 표준으로 바뀌면
    // (또는 이름만 SHA-3 으로 되돌아가면) 여기서 빨개진다. 그냥 건너뛰면 그걸 놓친다.
    if (algo === 'KECCAK512') {
      if (sample === '') {
        check(browserHex === '', 'Keccak-512 — 빈 글자는 빈 값');
        continue;
      }
      const sha3 = crypto.createHash('sha3-512').update(sample, 'utf8').digest('hex');
      check(browserHex.length === 128, `Keccak-512 길이가 128자여야 하는데 ${browserHex.length}자`);
      check(
        browserHex !== sha3,
        `「${sample}」 Keccak-512 가 표준 SHA-3 값과 같아졌다 — 진짜 SHA-3 이 되었다면 이름을 SHA-3 으로 되돌려라`
      );
      continue;
    }

    const nodeHex = sample === '' ? '' : crypto.createHash(NODE_ALGO[algo]).update(sample, 'utf8').digest('hex');
    check(
      browserHex === nodeHex,
      `「${sample || '(빈 글자)'}」 ${label} — 브라우저 ${browserHex || '(없음)'} ≠ Node ${nodeHex || '(없음)'}`
    );
  }
}

/*
 * ── passgen — 화면이 정말 알맹이로 재는가 (TASK-KL-205)
 *
 * 화면 위젯이 세기를 **자기 식으로** 재고 있었다: 글자 종류 풀^길이에서 약점 하나당 12비트.
 * 그 방식은 `Password1!` 을 통과시키고 긴 낱말묶음을 떨어뜨린다 — MCP 쪽 알맹이와 정확히
 * 반대 판정이다. 「사이트는 강하다는데 에이전트는 약하다더라」가 실제로 가능했다.
 *
 * 그래서 위젯을 알맹이에 붙였다. 여기서 두 가지를 잰다:
 *   ① 알맹이가 **브라우저에서도** Node 와 같은 값을 내는가 (같은 소스를 양쪽으로 말아 대조)
 *   ② 화면에 실려 나가는 **위젯 번들 안에 그 알맹이가 실제로 들어 있는가**
 *      — ② 가 없으면 「알맹이는 맞는데 화면은 옛 계산을 쓰는」 상태를 못 잡는다(타입 검사 통과함).
 */
{
  const esbuild = await import('esbuild');
  const built = await esbuild.build({
    entryPoints: [path.join(root, 'src/core/passgen.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__passgen',
    target: ['es2020'],
    logLevel: 'error'
  });
  await page.addScriptTag({ content: built.outputFiles[0].text });

  /* Node 쪽도 같은 소스에서 만든다 — 손으로 옮겨 적으면 그 순간 세 번째 사본이 생긴다. */
  const nodeOut = path.join(os.tmpdir(), `karmolab-parity-passgen-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(root, 'src/core/passgen.ts')],
    bundle: true,
    outfile: nodeOut,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'error'
  });
  const nodeCore = await import(pathToFileURL(nodeOut).href);

  const PWS = ['Password1!', 'correcthorsebatterystaple', 'qwerty123', 'x9#Lq2!vBn', 'abcd1234', 'P@ssw0rd', '한글비밀번호1'];
  for (const pw of PWS) {
    const fromBrowser = await page.evaluate((v) => {
      const r = window.__passgen.analyze(v);
      return { bits: r.bits, kinds: r.chunks.map((c) => c.kind).join(',') };
    }, pw);
    const r = nodeCore.analyze(pw);
    check(
      Math.abs(fromBrowser.bits - r.bits) < 1e-9,
      `passgen 「${pw}」 — 브라우저 ${fromBrowser.bits} ≠ Node ${r.bits}`
    );
    check(
      fromBrowser.kinds === r.chunks.map((c) => c.kind).join(','),
      `passgen 「${pw}」 — 뜯어본 이유가 다르다 (${fromBrowser.kinds} ≠ ${r.chunks.map((c) => c.kind).join(',')})`
    );
  }

  /* 이 도구가 있는 이유 자체가 양쪽에서 같이 성립해야 한다. */
  const weak = await page.evaluate(() => window.__passgen.analyze('Password1!').bits);
  const strong = await page.evaluate(() => window.__passgen.analyze('correcthorsebatterystaple').bits);
  check(strong > weak, `브라우저에서도 낱말묶음(${strong})이 Password1!(${weak})보다 세야 한다`);

  /*
   * ② 화면에 나가는 번들이 정말 이 알맹이를 물고 있나.
   * `naiveBits` 는 알맹이에만 있는 **객체 속성 이름**이라 esbuild 가 안 바꾼다. 위젯이 알맹이를
   * 아예 안 부르게 되면(= 옛 계산으로 되돌아가면) 번들에서 사라진다.
   *
   * ※ 「옛 계산이 남아 있나」를 `pool += 26` 같은 **변수 이름**으로 찾아보려 했는데 안 된다 —
   *   지역 변수는 압축하며 이름이 바뀐다. 실제로 되돌려 놓고 시험해 보니 안 물었다. 못 무는
   *   검사는 없느니만 못하므로(초록이 거짓 안심을 준다) 빼고, 무는 것만 남겼다.
   */
  const widgetBundle = read('js/widgets/tools/passgen.js');
  check(widgetBundle.includes('naiveBits'), '위젯 번들에 알맹이가 없다 — 화면이 알맹이를 안 쓴다');
}

await browser.close();
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[smoke-core-parity] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `[smoke-core-parity] ${SAMPLES.length}표본 — 공용 5종 + 우리가 직접 쓴 SHA3-512 가 브라우저↔OpenSSL 일치, ` +
    'Keccak-512 는 SHA-3 과 다름 · passgen 은 브라우저↔Node 같은 값이고 위젯 번들이 그 알맹이를 물고 있음'
);
