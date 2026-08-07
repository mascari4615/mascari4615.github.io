/**
 * 후원·제휴 자리가 규칙대로 뜨는지 (TASK-KL-089)
 *
 * 왜 있나: 이 자리는 평소 **비어 있어서 코드가 한 번도 안 돈다.** 그런데 채우는 순간이 하필
 * 돈이 걸린 순간이다 — 그때 처음 굴러가서 도구 위를 가리거나, 후원임을 안 밝히거나, 한 장에
 * 둘씩 뜨면 늦다. 그래서 검사가 **스스로 가짜 자리를 하나 넣어** 매번 실제로 굴려 본다.
 *
 * 지키는 규칙 (data/sponsor.json 머리말의 약속과 같다):
 *   ① 도구 본체 위에 놓지 않는다 — 설명 블록 안, 다 쓰고 읽는 자리
 *   ② 한 장에 하나
 *   ③ 후원·광고임을 글로 밝힌다
 *   ④ 바깥 링크는 rel="sponsored" 를 단다 (검색엔진에 광고 링크임을 알린다)
 *   ⑤ 좁은 화면에서 옆으로 넘치지 않는다
 *
 * 하는 일: 가짜 자리를 켠 채로 페이지를 다시 찍고 → 브라우저로 확인 → 원래대로 다시 찍는다.
 * (도구 페이지는 빌드 산출물이라 다시 찍어도 잃을 것이 없다.)
 *
 * 사용: BASE=... node scripts/audit-sponsor-slot.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blogRoot = path.dirname(path.dirname(root));
const SAMPLE = 'loan';

/**
 * **자기가 찍은 것을 본다** (TASK-KL-106).
 *
 * 예전에는 가짜 자리를 내 컴퓨터에 찍어 놓고 확인은 실사이트를 봤다. 실사이트에는 그 가짜가
 * 있을 리 없으니 늘 「자리 자체가 죽었다」로 빨갰다 — 자리는 멀쩡한데. 검사가 스스로 일으킨
 * 사건을 다른 데서 찾고 있었던 셈이다. 그래서 주소를 밖에서 못 바꾸게 했다: 이 검사는
 * 방금 찍은 그 파일만 본다.
 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serveBuilt() {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    // 배포된 주소 모양(`/karmolab/t/…`)과 디스크 모양이 다르다 — 여기서 이어 준다.
    if (url.startsWith('/karmolab/t/')) url = '/apps/blog/karmolab/t/' + url.slice('/karmolab/t/'.length);
    if (url.endsWith('/')) url += 'index.html';
    const file = path.join(blogRoot, url.replace(/^\//, ''));
    if (!file.startsWith(blogRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = fs.readFileSync(file);
    const ext = path.extname(file);
    // Jekyll 앞머리는 배포 때 걷힌다 — 여기서도 걷어야 같은 화면이 된다.
    if (ext === '.html') body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
  });
  return server;
}

const rebuild = (preview) =>
  execFileSync(process.execPath, ['scripts/gen-tool-pages.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: preview ? { ...process.env, KARMOLAB_SPONSOR_PREVIEW: '1' } : { ...process.env, KARMOLAB_SPONSOR_PREVIEW: '' }
  });

const problems = [];
let browser;
let server;
try {
  rebuild(true);
  server = serveBuilt();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' })).newPage();
  await page.goto(`${BASE}/karmolab/t/${SAMPLE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const seen = await page.evaluate((toolId) => {
    const slots = [...document.querySelectorAll('.tool-sponsor')];
    if (!slots.length) return { 없음: true };
    const s = slots[0];
    const tool = document.getElementById('page-' + toolId) || document.getElementById('tool-pages');
    const a = s.querySelector('a');
    return {
      개수: slots.length,
      도구보다아래: tool ? s.getBoundingClientRect().top > tool.getBoundingClientRect().top : false,
      설명블록안: !!s.closest('.tool-seo'),
      밝힘: (s.querySelector('.tool-sponsor-label')?.textContent || '').trim(),
      rel: a ? a.getAttribute('rel') || '' : null,
      넘침: s.scrollWidth > s.clientWidth + 2,
      보임: s.getBoundingClientRect().height > 0
    };
  }, SAMPLE);

  if (seen.없음) problems.push('가짜 자리를 켰는데 화면에 안 뜬다 — 자리 자체가 죽었다');
  else {
    if (seen.개수 !== 1) problems.push(`한 장에 ${seen.개수}개가 떴다 — 하나여야 한다`);
    if (!seen.도구보다아래) problems.push('도구 본체 위에 떴다 — 도구를 쓰러 온 사람을 가린다');
    if (!seen.설명블록안) problems.push('설명 블록 밖에 떴다 — 다 쓰고 읽는 자리에만 놓기로 했다');
    if (!seen.밝힘) problems.push('후원·광고임을 밝히는 글이 없다');
    if (seen.rel !== null && !/sponsored/.test(seen.rel)) problems.push(`바깥 링크에 sponsored 표시가 없다 (rel="${seen.rel}")`);
    if (seen.넘침) problems.push('좁은 화면에서 옆으로 넘친다');
    if (!seen.보임) problems.push('자리가 만들어졌는데 보이지 않는다');
  }
} finally {
  if (browser) await browser.close();
  if (server) server.close();
  rebuild(false); // 가짜 자리를 지운 상태로 되돌린다
}

if (problems.length) {
  console.error(`[audit-sponsor-slot] 후원 자리 규칙 위반 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('[audit-sponsor-slot] 후원 자리 — 도구 아래·설명 안·한 장에 하나·밝힘·sponsored·안 넘침 전부 OK');
