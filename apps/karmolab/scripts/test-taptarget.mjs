/**
 * 체크 상자를 손가락으로 누를 수 있는지 확인한다 (TASK-KL-088)
 *
 * 체크 상자는 그 자체가 13px 이다. 감싼 이름표가 자라 주지 않으면 누를 곳이 22px 밖에 안 되고,
 * 폰에서 자꾸 빗나간다. 눈으로는 멀쩡해 보여서 아무도 신고하지 않는 종류의 문제다.
 *
 * 도구마다 인라인 스타일로 짜여 있어 공용 CSS 한 곳에서 잡았는데, 그 규칙이 실제로 먹는지는
 * 재 봐야 안다 — 인라인 스타일이 이기면 아무 일도 안 일어난다.
 *
 * 사용: node scripts/test-taptarget.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* 실제로 22px 이었던 넉 장 + 대조로 잘 되던 것 하나.
   ★ `textdiff`·`textredact` 는 「텍스트 도구」 작업대(`text`)로 합쳐졌다 — 그 이름으로는 위젯이
   등록되지 않으므로(실측: 「textdiff 위젯이 등록되지 않았다」) 그 조작이 사는 작업대를 잰다. */
const TOOLS = ['text', 'uuidgen', 'hashgen', 'asciiart'];

/* ★ **지어진 것을 보는 검사다** (2026-08-17). 여기서 읽는 `js/widgets/**` 는 빌드 산출물이라
   깨끗한 사본(밀 커밋만 풀어 놓은 자리)에는 없다. 없는 것을 읽다 ENOENT 로 죽으면
   「누를 자리가 작다」가 아니라 **검사가 깨진 것처럼** 보인다 — 실제로 push 관문이 그렇게 섰다.
   못 볼 상황은 못 본다고 말한다(rc 2 = 통과로 세지 않는다). 지으려면 `node build.mjs`. */
/* ★ **도구 이름이 곧 파일 이름은 아니다** (2026-08-17, CI 로그로 알아냈다). textdiff·textredact 는
   「텍스트 도구」 작업대로 합쳐진 숨은 도구라 제 파일이 없다(메타의 bundle 이 text 다).
   그런데 여기서는 <이름>.js 만 찾아 「없다」고 하고 **늘 못 돌림으로 끝났다** — CI 에서 이 검사는
   한 번도 안 돌았다. 내 자리에서는 옛 빌드가 남긴 textdiff.js 때문에 초록으로 보였다(더 나쁘다).
   지어진 메타에서 그 도구가 어느 묶음인지 읽어 그 파일을 본다. */
const 메타경로 = path.join(root, 'js/widgets-lazy-meta.js');
const 메타 = fs.existsSync(메타경로) ? fs.readFileSync(메타경로, 'utf8') : '';
const 묶음 = (id) => {
  const m = new RegExp('id:"' + id + '",[^}]*?bundle:"([^"]+)"').exec(메타);
  return m ? m[1] : id;
};
const 자리 = (이름) => ['js/widgets/tools/' + 이름 + '.js', 'js/widgets/' + 이름 + '.js']
  .find((rel) => fs.existsSync(path.join(root, rel))) || null;
const 읽을자리 = (id) => 자리(id) || 자리(묶음(id));
{
  const 없는것 = 메타 ? TOOLS.filter((id) => !읽을자리(id)) : TOOLS;
  if (없는것.length) {
    console.log(`[test-taptarget] 못 돌림 — 지어진 도구 파일이 없다 (${없는것.join(', ')}). 통과로 세지 않는다 — 먼저 \`node build.mjs\`.`);
    process.exit(2);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 800 } }); // 폰 폭
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.addStyleTag({ content: read('css/tools.css') });
await page.evaluate(() => {
  window.__reg = {};
  // 도구들이 부르는 말풍선 — 여기서는 아무 일도 안 하면 된다
  window.Mdd = { linePreset() {}, line() {}, say() {} };
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {}, copyText() {}, showToast() {}, mountTool() { return true; },
    ensureScript: async () => {}
  };
});
for (const id of TOOLS) {
  /* 위 고르기와 **같은 규칙**으로 읽는다 — 앞에서만 고치고 여기서 옛 이름을 읽으면 ENOENT 로 죽는다. */
  await page.addScriptTag({ content: read(읽을자리(id)) });
}

const out = await page.evaluate(async (tools) => {
  const small = [];
  let checked = 0;
  for (const id of tools) {
    const tool = window.__reg[id];
    if (!tool) return { ok: false, why: `${id} 위젯이 등록되지 않았다` };
    const host = document.createElement('div');
    host.className = 'tool-page';
    document.body.appendChild(host);
    try {
      tool.tabs[0].build(host);
      /* 그려질 때까지 기다린다 — 안 그러면 잰 것이 0 개인 채 「작은 게 없다」로 통과해 버린다
         (실제로는 「안 봤다」다). 도구마다 말 묶음을 받아 온 뒤에 그린다. */
      await window.__karmoWaitDrawn(host);
    } catch (e) { return { ok: false, why: id + " 화면을 못 만들었다: " + e.message }; }
    for (const el of host.querySelectorAll('input[type=checkbox], input[type=radio]')) {
      const box = (el.closest('label') || el).getBoundingClientRect();
      if (!box.width) continue;
      checked++;
      if (Math.min(box.width, box.height) < 32) {
        small.push(`${id} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
  }
  return {
    ok: checked > 0 && small.length === 0,
    why: checked === 0 ? '잰 것이 하나도 없다 — 검사가 헛돌고 있다: ' + small.join(' / ') : `${checked}개 잼 · 32px 미만 ${small.length ? small.join(' , ') : '없음'}`
  };
}, TOOLS);

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-taptarget] 체크 상자를 누를 곳이 손가락보다 작다');
  process.exit(1);
}
console.log('[test-taptarget] 폰 폭에서 체크 상자 누를 곳이 모두 32px 이상인 것까지 확인');
