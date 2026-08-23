#!/usr/bin/env node
/**
 * smoke-atlas-3d — **돌려 보기 장이 진짜 브라우저에서 뜨나** (change.motion-3d-cores).
 *
 * 이 장은 위젯 번들 밖에 있어서 위젯 자들이 못 본다. 그래서 따로 잰다 —
 * 「파일이 있다」가 아니라 **점이 실제로 그려지고 돌아가는가**를 본다.
 *
 * 재는 것 넷:
 *  ① 지도를 읽고 점을 세운다 (`__atlas3d.docs` 가 실제 글 수와 같다)
 *  ② 캔버스에 **뭔가 그려진다** (검은 화면이 아니다 — 색 있는 화소가 있다)
 *  ③ **돌린다** — 궤도를 움직이면 화면이 달라진다
 *  ④ 화면이 **제 한계를 말한다** (찢김·밀도·비공개)
 *
 * 지도가 없으면 CANNOT-RUN(2) — 통과가 아니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const REPO = path.resolve(KARMOLAB, '..', '..');
const PAGE = path.join(KARMOLAB, 'tools', 'atlas-3d', 'index.html');
const ATLAS = process.env.ATLAS_FILE || path.join(KARMOLAB, 'data', 'memo-atlas.json');

if (!fs.existsSync(PAGE)) { console.log('[atlas-3d] 장이 없다'); process.exit(1); }
if (!fs.existsSync(ATLAS)) {
  console.log('[atlas-3d] CANNOT-RUN — 구운 지도가 없다 (node scripts/build-memo-atlas.mjs)');
  process.exit(2);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[atlas-3d] CANNOT-RUN — playwright 가 없다');
  process.exit(2);
}

/* 저장소를 그대로 주는 작은 서버 — importmap 이 `/packages/...` 를 부르므로 뿌리가 저장소여야 한다. */
/* `.wasm` 은 타입을 제대로 줘야 한다 — 아니면 브라우저가 흘려 컴파일을 포기하고 느린 길로 샌다
   (실측: 「Incorrect response MIME type」 뒤에 ArrayBuffer 로 되돌아간다). */
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const full = path.join(REPO, rel);
  if (!full.startsWith(REPO) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
  /* 배포와 **같은 모양**으로 준다 — Jekyll 앞머리는 떼고 낸다. 안 떼면 브라우저가 그 줄을
     본문으로 읽고 `<head>` 를 닫아 버려, 시험만 빨개지고 배포는 멀쩡한 헛수고가 난다. */
  res.end(ext === '.html' ? stripFrontMatter(fs.readFileSync(full, 'utf8')) : fs.readFileSync(full));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const bad = [];
const browser = await chromium.launch({
  args: [
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    /* 카메라가 없는 기계에서도 손 경로가 켜지는지 보려면 **가짜 카메라**가 필요하다. */
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  ],
});
const page = await (await browser.newContext({ viewport: { width: 900, height: 640 } })).newPage();
const errors = [];
/* 손 인식 연장은 **알림을 error 자리로 뱉는다**(TensorFlow 계열 관례) — 그건 사고가 아니다.
   여기서 거르지 않으면 「INFO: …」 한 줄에 자가 빨개진다(2026-08-23 실측). */
const NOISE = /^INFO:|XNNPACK|Created TensorFlow|GL Driver Message|Context (Lost|Restored)/;
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()); });

await page.goto(`${base}/apps/karmolab/tools/atlas-3d/index.html`);
await page.waitForFunction(() => window.__atlas3d || document.querySelector('.miss'), undefined, { timeout: 30000 })
  .catch(() => {});

const got = await page.evaluate(() => (window.__atlas3d ? { ...window.__atlas3d, orbit: undefined } : null));
if (!got) {
  const miss = await page.evaluate(() => document.querySelector('.miss')?.textContent || '');
  bad.push(`장이 안 떴다 — ${miss ? `「지도가 없다」 화면: ${miss.slice(0, 60)}` : '아무 것도 안 나왔다'}`);
} else {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const want = atlas.docs.filter((d) => Array.isArray(d.xy)).length;
  console.log(`  ① 점 ${got.docs}개 · 갈래 ${got.lanes}개 (지도에는 자리 잡힌 글 ${want}편)`);
  if (got.docs !== want) bad.push(`점 ${got.docs}개인데 지도에는 ${want}편이다`);

  /* ② 검은 화면이 아닌가 — 화소를 직접 센다. 「캔버스가 있다」는 그려졌다는 뜻이 아니다. */
  /* ★ **첫 판이 그려질 때까지 기다린다.** 셰이더 링크는 조금 늦어서, 뜨자마자 재면 아직
     아무것도 안 그려져 있다 — 그걸 「검은 화면」으로 읽고 헛빨강을 냈다(2026-08-23). */
  await page.waitForFunction(() => window.__atlas3d.frames() > 3, undefined, { timeout: 15000 })
    .catch(() => bad.push('그리기 바퀴가 안 돈다 (frames 가 안 는다)'));
  /* 판이 돌아도 **셰이더 링크는 더 늦다** — 그동안은 그린 것이 비어 있다. 정해진 시간을 자는 대신
     「화소가 설 때까지」 기다린다(못 서면 그건 진짜 빨강이다). */
  await page.waitForFunction(() => window.__atlas3d.lit().lit > 500, undefined, { timeout: 20000 })
    .catch(() => {});
  const shot1 = await page.screenshot();
  /* 그린 **그 자리에서** 센다 (장이 준 손). 밖에서 새 컨텍스트를 열면 늘 0 이 나온다. */
  const px = await page.evaluate(() => window.__atlas3d.lit());
  const share = px.lit / px.of;
  console.log(`  ② 바탕보다 밝은 화소 ${px.lit}개 / ${px.of} (${(share * 100).toFixed(1)}%)`);
  if (px.lit < 500) bad.push(`그려진 화소가 ${px.lit}개뿐 — 검은 화면이다`);
  /* ★ **너무 많아도 빨강**이다 — 점 하나가 300px 로 떠서 화면을 통째로 덮은 적이 있다(2026-08-23).
     그때도 「그려졌다」는 통과였다. 점 그림은 성겨야 한다. */
  if (share > 0.6) bad.push(`화면의 ${(share * 100).toFixed(0)}% 가 칠해졌다 — 점이 너무 크다(덮어 버린다)`);

  /* ③ 돌린다 — 궤도를 움직이고 화면이 달라지는지. */
  await page.evaluate(() => {
    window.__atlas3d.orbit.rotate(220, 60);
    for (let i = 0; i < 90; i += 1) window.__atlas3d.orbit.update(1 / 60);
  });
  await page.waitForTimeout(200);
  const shot2 = await page.screenshot();
  const same = Buffer.compare(shot1, shot2) === 0;
  console.log(`  ③ 돌린 뒤 화면이 ${same ? '**그대로다**' : '달라졌다'}`);
  if (same) bad.push('돌렸는데 화면이 그대로다 — 궤도가 카메라에 안 붙었다');

  /* ④ **조작이 KarmoPose 를 거치나** — 궤도를 직접 부르는 게 아니라 판(frame)을 먹여서 본다.
     안 거치면 그 꾸러미는 이름만 있는 죽은 인터페이스다. */
  const moved = await page.evaluate(() => {
    const g = window.__atlas3d;
    const before = g.orbit.state.want.yaw;
    const f = (x, grip) => ({ t: performance.now(), ok: true, kind: 'pointer', point: [x, 0.5], depth: 0.5, grip, buttons: grip, raw: null });
    g.gestures.push(f(0.5, 1));      // 쥐고
    g.gestures.push(f(0.7, 1));      // 끌고
    g.gestures.push(f(0.7, 0));      // 놓는다
    return { before, after: g.orbit.state.want.yaw };
  });
  const turned = Math.abs(moved.after - moved.before);
  console.log(`  ④ 포즈 판을 먹이니 방위가 ${turned.toFixed(3)} 만큼 돌았다`);
  if (!(turned > 0.01)) bad.push('포즈 판을 먹여도 안 돌아간다 — 조작이 KarmoPose 를 안 거친다');

  /* ⑤ **손 조작 단추** — 연장이 있으면 진짜로 켜지나, 없으면 그렇게 말하나.
     (카메라는 headless 에 없으니 가짜 카메라로 띄운다 — 켜지는 길이 살아 있는지만 본다.) */
  const hasHand = fs.existsSync(path.join(KARMOLAB, '.handsrc', 'hand_landmarker.task'));
  await page.evaluate(() => document.getElementById('handBtn').click());
  await page.waitForFunction(() => {
    const say = document.getElementById('handSay').textContent;
    return window.__atlas3d.handOn() || say.includes('못 켰다');
  }, undefined, { timeout: 60000 }).catch(() => {});
  const hand = await page.evaluate(() => ({
    on: window.__atlas3d.handOn(),
    say: document.getElementById('handSay').textContent.slice(0, 90),
    sources: window.__atlas3d.pose.sources.map((s) => s.kind),
  }));
  console.log(`  ⑤ 손 조작 — 연장 ${hasHand ? '있음' : '없음'} · 켜짐 ${hand.on} · 소스 [${hand.sources}]`);
  console.log(`     ↳ 「${hand.say}」`);
  if (!hasHand && hand.on) bad.push('연장이 없는데 켜졌다고 한다');
  if (!hasHand && !/못 켰다|fetch:hand/.test(hand.say)) bad.push('연장이 없는데 왜 안 되는지 안 적는다');
  if (hasHand && !hand.sources.includes('hand')) bad.push('연장이 있는데 손 소스가 안 붙었다');
  if (hasHand && !hand.on && !/카메라|Permission|getUserMedia|not/i.test(hand.say)) {
    bad.push(`연장이 있는데 못 켜고 까닭도 안 적는다: ${hand.say}`);
  }

  /* ⑥ 제 한계를 말하나. */
  const text = await page.evaluate(() => document.body.innerText);
  for (const [what, re] of [['찢김', /찢김/], ['밀도', /밀도/], ['조작법', /끌면 돌고/]]) {
    if (!re.test(text)) bad.push(`화면이 **${what}**을 안 적는다`);
  }
}

if (errors.length) bad.push(`화면에서 던진 것: ${errors.slice(0, 2).join(' | ')}`);
await browser.close();
server.close();

if (bad.length) {
  console.log('[atlas-3d] **돌려 보기 장이 제대로 안 뜬다**');
  for (const b of bad) console.log('  - ' + b);
  process.exit(1);
}
console.log('[atlas-3d] 진짜 브라우저에서 점이 서고, 돌아가고, 제 한계를 적는다');
