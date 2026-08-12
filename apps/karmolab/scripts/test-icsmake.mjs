/**
 * 일정 파일이 규칙대로 만들어지는지 확인한다 (TASK-KL-088)
 *
 * .ics 는 어긋나도 눈에 안 보인다 — 달력 앱이 조용히 거부하거나, 더 나쁘게는 **9시간 어긋난
 * 시각으로 들어간다.** 그래서 파일 내용을 글자 그대로 잰다.
 *
 *  ① 한국 시간 19:00 이 파일에는 UTC 10:00 으로 적히는가 (여기가 가장 잘 나는 사고다)
 *  ② 줄바꿈이 CRLF 인가 (LF 만 쓰면 거부하는 달력 앱이 있다)
 *  ③ 쉼표·세미콜론이 든 제목이 이스케이프되는가 (안 하면 파일 통째로 거부된다)
 *  ④ 종일 일정의 끝 날짜가 하루 뒤로 적히는가 (안 그러면 그 날이 빠진다)
 *  ⑤ 끝이 시작보다 빠르면 만들지 않고 말해 주는가
 *
 * 사용: node scripts/test-icsmake.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/icsmake.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['icsmake'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  const set = (id, v) => {
    const el = host.querySelector(id);
    if (el.type === 'checkbox') el.checked = v;
    else el.value = v;
    el.dispatchEvent(new Event('change'));
    el.dispatchEvent(new Event('input'));
  };
  const text = () => host.querySelector('#icOut').value;

  // ① 시간대 — 한국 19:00 = UTC 10:00
  set('#icTitle', '스터디');
  set('#icStart', '2026-09-01T19:00');
  set('#icEnd', '2026-09-01T21:00');
  const tz = text();
  const tzOk = tz.includes('DTSTART:20260901T100000Z') && tz.includes('DTEND:20260901T120000Z');

  // ② 줄바꿈
  // 텍스트 상자의 value 는 줄바꿈을 바꿔 버린다 — CRLF 는 내려받는 파일에서 재야 한다
  let saved = '';
  {
    let blob = null;
    const origUrl = URL.createObjectURL;
    URL.createObjectURL = (b) => { blob = b; return origUrl(b); };
    const origCreate = document.createElement.bind(document);
    document.createElement = (t) => { const el = origCreate(t); if (t === 'a') el.click = () => {}; return el; };
    host.querySelector('#icSave').click();
    URL.createObjectURL = origUrl;
    document.createElement = origCreate;
    saved = blob ? await blob.text() : '';
  }
  const crlfOk = saved.includes('\r\n') && !/[^\r]\n/.test(saved);

  // ③ 이스케이프
  set('#icTitle', '모임, 3회차; 준비물');
  // 역슬래시는 두 번 적어야 한 번으로 남는다 (처음에 한 번만 적어 헛짚었다)
  const escOk = text().includes('SUMMARY:모임\\, 3회차\\; 준비물');

  // ④ 종일 — 끝 날짜는 하루 뒤
  set('#icTitle', '워크숍');
  set('#icAllDay', true);
  set('#icStart', '2026-09-01T00:00');
  set('#icEnd', '2026-09-03T00:00');
  const day = text();
  const dayOk = day.includes('DTSTART;VALUE=DATE:20260901') && day.includes('DTEND;VALUE=DATE:20260904');

  // ⑤ 거꾸로 된 시각
  set('#icAllDay', false);
  set('#icStart', '2026-09-01T21:00');
  set('#icEnd', '2026-09-01T19:00');
  const backOk = text() === '' && /빠르거나 같아요/.test(host.querySelector('#icStatus').textContent);

  return {
    ok: tzOk && crlfOk && escOk && dayOk && backOk,
    why:
      `한국 19시 → UTC 10시 ${tzOk ? '✓' : '✗'} · CRLF ${crlfOk ? '✓' : '✗'} · ` +
      `쉼표·세미콜론 처리 ${escOk ? '✓' : '✗'} · 종일 끝날짜 +1일 ${dayOk ? '✓' : '✗'} · ` +
      `거꾸로면 안 만듦 ${backOk ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-icsmake] 일정 파일이 규칙에 안 맞는다 — 달력 앱이 거부하거나 시각이 어긋난다');
  process.exit(1);
}
console.log('[test-icsmake] 시간대·줄바꿈·이스케이프·종일 처리까지 확인');
