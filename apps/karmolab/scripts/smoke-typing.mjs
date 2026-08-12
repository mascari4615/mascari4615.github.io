/**
 * 값을 넣으면 화면이 바뀌는지 — 손으로 적지 않고 넓게 본다 (TASK-KL-089)
 *
 * 왜 필요한가: 「값을 넣으면 답이 나오는지」를 보는 검사는 도구마다 기대값을 손으로 적어야 해서
 * 125개 중 32개만 보고 있었다. 도구는 계속 느는데 그 사이가 벌어진다 — 새 도구가 통째로
 * 망가져도 「화면이 보인다」만 통과하면 아무도 모른다.
 *
 * 여기서는 기대값을 적지 않는다. **첫 입력칸에 글자를 넣고, 그 칸 말고 다른 곳이 바뀌는가**만 본다.
 * 실제로 그렇게 반응하는 것이 확인된 도구만 `data/behavior-typing.json` 에 적어 두고 지킨다
 * (버튼을 눌러야 하거나 파일이 필요한 도구는 애초에 안 넣는다 — 넣으면 늘 빨간 검사가 된다).
 *
 * 목록에 없는 도구가 몇 개인지는 통과 줄에 함께 적는다 — 사이가 벌어지는 것을 보이게.
 *
 * 사용: node scripts/smoke-typing.mjs
 *       BASE=http://127.0.0.1:8801/apps/blog node scripts/smoke-typing.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const listPath = path.join(root, 'data/behavior-typing.json');
const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
/* 어떤 도구는 글자만으로 반응하고, 어떤 도구는 「만들기」 같은 버튼을 눌러야 반응한다.
 * 뒤엣것은 따로 적어 둔다 — 파일을 넣어야 하거나 누르면 파일이 내려받아지는 도구는 안 넣는다. */
const needsButton = new Set(list.needsButton || []);
/* 그림을 넣어야 반응하는 도구 — 저장소에 둔 작은 표본 그림을 넣어 본다. */
const needsFile = new Set(list.needsFile || []);
/* PDF 를 넣어야 반응하는 도구 — 표본 PDF 한 장(535바이트, 「KarmoLab」 한 줄)을 넣어 본다.
 * 아무 파일이나 받는 도구(압축·검사값·나누기)도 이 표본으로 함께 본다. */
const needsPdf = new Set(list.needsPdf || []);
const SAMPLE = path.join(root, 'data/samples/sample.png');
/* 소리를 넣어야 반응하는 도구 — 0.2초짜리 진짜 소리 파일(3KB)을 넣어 본다. */
const needsAudio = new Set(list.needsAudio || []);
const SAMPLE_PDF = path.join(root, 'data/samples/sample.pdf');
/* 영상을 넣어야 반응하는 도구 — 0.5초짜리 진짜 영상(767바이트)을 넣어 본다. */
const needsVideo = new Set(list.needsVideo || []);
/* 넣을 글자가 없고 버튼 하나가 전부인 도구 — 뽑기·만들기 계열. */
/* 키를 눌러야 반응하는 도구 — 넣을 칸도 버튼도 없고 키보드가 전부다. */
const keyOnly = new Set(list.keyOnly || []);
const clickOnly = new Map((list.clickOnly || []).map((e) => (Array.isArray(e) ? [e[0], e[1]] : [e, null])));
const SAMPLE_WAV = path.join(root, 'data/samples/sample.wav');
const SAMPLE_WEBM = path.join(root, 'data/samples/sample.webm');
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...list.tools, ...needsButton, ...needsFile, ...needsPdf, ...needsAudio, ...needsVideo, ...clickOnly.keys(), ...keyOnly];
const allTools = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools);

const LANES = 4;
const browser = await chromium.launch();
const failures = [];

/** 도구 화면의 모습을 한 줄로 — 글자 + 다른 칸의 값 + 그림판 내용. 넣은 칸 자신은 뺀다. */
function snapshot(toolId) {
  const el = document.getElementById('page-' + toolId);
  if (!el) return '';
  const others = [...el.querySelectorAll('input,textarea')]
    .filter((i) => !i.hasAttribute('data-probe'))
    .map((i) => i.value)
    .join('§');
  const imgs = el.querySelectorAll('img').length;
  const canvases = [...el.querySelectorAll('canvas')]
    .map((c) => {
      try {
        return c.toDataURL().length;
      } catch {
        return 0;
      }
    })
    .join(',');
  return `${el.innerText.replace(/\s+/g, ' ').trim()}|${others}|${canvases}|${imgs}`;
}

async function checkOne(page, id) {
  await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'networkidle', timeout: 40000 });
  /* ★ 고정 700ms 로는 부족하다 (2026-08-12). 위젯은 말 묶음(i18n)을 받아 온 **뒤에** 그린다 —
   *   느린 판에서는 그 사이에 재게 되고, 그러면 「글자를 넣을 칸이 없다」로 제품을 탓하게 된다.
   *   그려질 때까지 기다린다(그래도 안 그려지면 그건 진짜 고장이라 아래 검사가 잡는다). */
  await page
    .waitForFunction((toolId) => {
      const el = document.getElementById('page-' + toolId);
      return !!el && el.children.length > 0;
    }, id, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  if (needsFile.has(id) || needsPdf.has(id) || needsAudio.has(id) || needsVideo.has(id)) {
    const hasFileInput = await page.evaluate((toolId) => {
      const el = document.getElementById('page-' + toolId);
      const f = el && el.querySelector('input[type=file]');
      if (!f) return false;
      f.setAttribute('data-probe-file', '1');
      return true;
    }, id);
    if (!hasFileInput) {
      failures.push(`${id}: 파일을 넣을 자리가 없다 — 화면이 안 그려졌을 수 있다`);
      process.stdout.write('x');
      return;
    }
    const beforeFile = await page.evaluate(snapshot, id);
    await page.setInputFiles('[data-probe-file]', needsVideo.has(id) ? SAMPLE_WEBM : needsAudio.has(id) ? SAMPLE_WAV : needsPdf.has(id) ? SAMPLE_PDF : SAMPLE);
    await page.waitForTimeout(needsVideo.has(id) ? 3000 : needsAudio.has(id) ? 2500 : 1800);
    const afterFile = await page.evaluate(snapshot, id);
    if (beforeFile === afterFile) {
      failures.push(`${id}: 파일을 넣어도 화면이 그대로다`);
      process.stdout.write('x');
    } else {
      process.stdout.write('.');
    }
    return;
  }

  /* 「한 번 누르면 끝」 도구 (TASK-KL-089).
   * 뽑기·만들기 도구는 넣을 글자가 아예 없다 — 버튼 하나가 전부다. 이 검사는 늘 글자부터
   * 넣으려 해서 그런 도구를 볼 수가 없었고, 그래서 넷이 통째로 아무 검사도 안 받고 있었다.
   * 넣을 것 없이 그냥 눌러 보고, 화면이 바뀌는지만 본다. */
  if (keyOnly.has(id)) {
    const was = await page.evaluate(snapshot, id);
    await page.keyboard.press('KeyA');
    await page.waitForTimeout(900);
    if (was === (await page.evaluate(snapshot, id))) {
      failures.push(`${id}: 키를 눌러도 화면이 그대로다`);
      process.stdout.write('x');
    } else {
      process.stdout.write('.');
    }
    return;
  }

  if (clickOnly.has(id)) {
    /* 누를 버튼을 이름으로 짚을 수 있게 한다 — 첫 버튼이 늘 그 도구의 버튼은 아니다.
     * 실제로 비밀번호 도구는 앞의 둘이 **탭**이라, 첫 버튼을 누르면 아무 일도 안 일어났다. */
    const has = await page.evaluate(
      ([toolId, label]) => {
        const el = document.getElementById('page-' + toolId);
        if (!el) return false;
        const vis = [...el.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height > 0);
        const btn = label ? vis.find((b) => b.textContent.trim() === label) : vis[0];
        if (!btn) return false;
        btn.setAttribute('data-probe-btn', '1');
        return true;
      },
      [id, clickOnly.get(id)]
    );
    if (!has) {
      failures.push(`${id}: 누를 버튼이 없다 — 화면이 안 그려졌을 수 있다`);
      process.stdout.write('x');
      return;
    }
    const was = await page.evaluate(snapshot, id);
    await page.click('[data-probe-btn]');
    await page.waitForTimeout(1200);
    if (was === (await page.evaluate(snapshot, id))) {
      failures.push(`${id}: 버튼을 눌러도 화면이 그대로다`);
      process.stdout.write('x');
    } else {
      process.stdout.write('.');
    }
    return;
  }

  const target = await page.evaluate((toolId) => {
    const el = document.getElementById('page-' + toolId);
    if (!el) return null;
    const vis = (e) => e.getBoundingClientRect().height > 0;
    /* 날짜 칸도 본다 (TASK-KL-089).
     * 예전에는 글자·숫자 칸만 찾아서, 날짜만 받는 도구는 「넣을 칸이 없다」로 지나쳤다 —
     * 생일·영업일 도구가 그래서 아무 검사도 안 받고 있었다. */
    const inp = [...el.querySelectorAll('input[type=text],input[type=number],input[type=date],input:not([type]),textarea')].filter(vis)[0];
    if (!inp) return null;
    inp.setAttribute('data-probe', '1');
    const btn = [...el.querySelectorAll('button')].filter(vis)[0];
    if (btn) btn.setAttribute('data-probe-btn', '1');
    return { type: inp.type || 'text', hasButton: !!btn };
  }, id);
  if (!target) {
    failures.push(`${id}: 글자를 넣을 칸이 없다 — 화면이 안 그려졌을 수 있다`);
    process.stdout.write('x');
    return;
  }
  const before = await page.evaluate(snapshot, id);
  await page.fill('[data-probe]', target.type === 'number' ? '37' : target.type === 'date' ? '1990-05-15' : '테스트 abc 123');
  /* 비밀번호 칸이 따로 있으면 그것도 채운다 (TASK-KL-089).
   * 암호 도구는 평문 말고 열쇠가 하나 더 필요하다. 비워 두고 누르면 **아무 말 없이**
   * 아무 일도 안 일어나서, 검사에는 「고장」으로 보였다(도구는 멀쩡했다). */
  await page.evaluate((toolId) => {
    const el = document.getElementById('page-' + toolId);
    for (const pw of el.querySelectorAll('input[type=password]')) {
      if (pw.value || pw.getBoundingClientRect().height === 0) continue;
      pw.value = 'karmolab-test-1234';
      pw.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, id);
  await page.waitForTimeout(needsButton.has(id) ? 300 : 900);
  if (needsButton.has(id)) {
    if (!target.hasButton) {
      failures.push(`${id}: 눌러야 할 버튼이 없다 — 화면이 바뀌었을 수 있다`);
      process.stdout.write('x');
      return;
    }
    await page.click('[data-probe-btn]');
    await page.waitForTimeout(1000);
  }
  const after = await page.evaluate(snapshot, id);
  if (before === after) {
    failures.push(`${id}: ${needsButton.has(id) ? '글자를 넣고 버튼을 눌러도' : '글자를 넣어도'} 화면이 그대로다`);
    process.stdout.write('x');
  } else {
    process.stdout.write('.');
  }
}

const queue = [...ids];
await Promise.all(
  Array.from({ length: Math.min(LANES, queue.length) }, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      try {
        await checkOne(page, id);
      } catch (e) {
        failures.push(`${id}: 여는 중 실패 — ${String(e.message).slice(0, 60)}`);
        process.stdout.write('x');
      }
    }
    await page.close();
  })
);
process.stdout.write('\n');
await browser.close();

if (failures.length) {
  console.error(`[smoke-typing] 값을 넣어도 반응이 없는 도구 ${failures.length}개 / ${ids.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
/* 아직 아무 검사도 안 보는 도구를 **세지 말고 이름을 대라** (TASK-KL-089).
 * 예전에는 「전체 - 여기서 본 것 - 32」로 숫자만 냈다. 그 32 는 답을 맞춰 보는 다른 검사가
 * 보던 개수를 손으로 적어 둔 것이라, 그쪽이 늘거나 줄면 이 숫자가 조용히 틀린다 —
 * 실제로 그쪽은 33 개였다. 숫자만 있으면 무엇이 빠졌는지도 알 수 없어 채울 수가 없다.
 * 그래서 다른 검사의 목록을 직접 읽어 빼고, 남은 것의 이름을 적는다. */
const answersPath = path.join(root, 'scripts/smoke-tool-behavior.mjs');
const answersIds = fs.existsSync(answersPath)
  ? [...fs.readFileSync(answersPath, 'utf8').matchAll(/^\s*\['([a-z0-9-]+)',/gm)].map((m) => m[1])
  : [];
/* 이미 알고 있는 고장 — 고칠 사람이 따로 있어 여기서는 못 고친다 (TASK-KL-089).
 * 통과/실패로 세면 게이트가 늘 빨개서 아무도 안 보게 되고, 빼고 조용히 두면 잊힌다.
 * 그래서 매번 눈에 띄게 찍기만 한다. 고쳐지면 이 줄을 지우고 검사 목록에 넣어라. */
for (const [id, why] of Object.entries(list.knownBroken || {})) {
  console.log(`  [알려진 고장] ${id} — ${why}`);
}
const seen = new Set([...ids, ...answersIds]);
/* 볼 수 없는 데는 이유가 있는 도구 — 사유를 적어 두고 「안 보는 목록」에서 뺀다.
 * 묶음 페이지는 낱개 도구로 이미 보고 있고, 보여 주기만 하는 도구·기기가 필요한 도구는
 * 이 방식으로 볼 수가 없다. 사유 없이 목록에만 남겨 두면 매번 같은 이름을 다시 들여다보게 된다. */
const exempt = list.exempt || {};
const blind = allTools.filter((id) => !seen.has(id) && !exempt[id] && !(list.knownBroken || {})[id]);
console.log(
  `[smoke-typing] ${ids.length}개 도구가 값을 넣으면 화면이 바뀐다(글자·버튼·파일)` +
    (blind.length ? ` · 아직 아무 검사도 안 보는 도구 ${blind.length}개: ${blind.join(', ')}` : ' · 안 보는 도구 0')
);
