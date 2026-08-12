/**
 * KarmoGraph — 실제로 열리고 그려지는가 (TASK-KL-202)
 *
 * 왜 화면 검사인가: 2026-08-09 에 이 위젯은 **앱에서 열 수조차 없는 상태**로 20 커밋을 받았다.
 * `widgets-lazy-meta.ts` 에 항목이 없어 묶음 자체가 안 만들어졌는데, 타입체크도 묶음 정합 검사도
 * 그동안 전부 초록이었다 — 「없는 것」은 검사할 대상이 없기 때문이다. 그래서 띄워서 만져 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-karmograph.mjs
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

/**
 * ❄ 기본은 **이 판 전용 얼린 서버**다 (2026-08-12).
 *
 * 개발 서버(8813)를 쓰면 세션 여럿이 같은 나무를 고치는 이 작업공간에서 **검사 도중 다시
 * 빌드**가 돈다. 같은 커밋으로 한 판은 통과, 다음 판은 6개 빨강이 났다. 흔들리는 게이트는
 * 빨강을 무시하게 만든다 — 그래서 검사는 제 서버를 띄우고, 한 번 읽은 파일을 판 내내 고정한다.
 * `URL=...` 을 주면 그쪽을 쓴다(배포된 사이트를 겨눌 때).
 */
const frozen = process.env.URL ? null : await serveRepo();
const URL = `${process.env.URL || `${frozen.base}/apps/karmolab/index.html`}#karmograph`;
const errors = [];
const browser = await chromium.launch();
const context0 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
 const page = await context0.newPage();
// 서비스 워커 404 는 이 검사의 대상이 아니다(개발 서버에는 sw 가 없다).
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('fetching the script')) return;
  // 로컬에서 띄우면 원격(yawnbot) 호출이 CORS 로 막힌다 — 이 검사의 대상이 아니다.
  if (/CORS|ERR_FAILED|Failed to load resource/i.test(m.text())) return;
  errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
// 저장본이 남아 있으면 결과가 달라진다 — 깨끗한 상태에서 시작.
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'domcontentloaded' });

/**
 * 어느 항목에서 멈췄나 — **멈춘 검사는 빨강도 초록도 아니라서 신호가 아니다.**
 * 이 검사가 CI 에서 20분 넘게 한 항목에 매달려 판정 없이 잘린 적이 있다(2026-08-12).
 * 항목마다 시간 상한을 두고, 넘으면 그 이름과 함께 빨강으로 끝낸다.
 */
const STEP_LIMIT_MS = Number(process.env.STEP_LIMIT_MS || 90_000);
const withLimit = (name, fn) => Promise.race([
  fn(),
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${Math.round(STEP_LIMIT_MS / 1000)}초 안에 안 끝났다 — 여기서 멈춰 있었다`)),
    STEP_LIMIT_MS,
  ).unref?.()),
]);


/** 옆 패널의 **꾸미는 칸**(모양·얼굴·소속·붙이기)은 접혀 있다 — 필요한 걸음만 펼친다. */
const openMore = async (p) => {
  const btn = p.locator('[data-km="more-toggle"]');
  if (await btn.count() === 0) return;
  const label = (await btn.first().textContent()) || '';
  if (label.includes('더 보기') || label.includes('More')) await btn.first().click();
};
const step = async (name, fn) => {
  try { await withLimit(name, fn); console.log(`  OK   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name} — ${e.message.split(`\n`)[0]}`);
    errors.push(`${name}: ${e.message.split(`\n`)[0]}`);
    // 「왜 안 눌렸나」는 사후에 못 되살린다 — 그 자리에서 화면 상태를 한 줄 남긴다.
    const dump = await page.evaluate(() => {
      const el = document.querySelector(`[data-km="story"]`);
      const r = el && el.getBoundingClientRect();
      const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const tb = document.querySelector(`.km-toolbar`);
      return [`툴바=${tb ? Math.round(tb.getBoundingClientRect().height) : 0}px`,
        `발표버튼=${r ? Math.round(r.x) + `,` + Math.round(r.y) : `없음`}`,
        `그자리=${top ? top.tagName + `|` + String(top.getAttribute(`data-km`) || top.getAttribute(`class`) || ``).slice(0,28) : `-`}`,
        `서랍=${document.querySelector(`[data-km="drawer"]`).className}`,
        `발표중=${document.querySelector(`.km-root`).classList.contains(`is-presenting`)}`].join(` · `);
    }).catch((err) => `상태 못 읽음`);
    console.log(`       ↳ ${dump}`);
    /* ★ 넘어진 자리를 **치우고 다음으로 간다.** 한 항목이 페이지를 딴 데로 보내 놓고 죽으면
       (보기 전용 링크처럼 주소를 갈아타는 항목이 그렇다) 뒤 항목이 줄줄이 같이 빨개진다 —
       실측 2026-08-12: 한 번 미끄러지자 그 뒤 열 개가 「상태 못 읽음」으로 떨어졌다.
       빨강 하나가 열 개로 불어나면 **어디가 진짜인지**를 못 읽는다. */
    await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForSelector('.km-root', { timeout: 8000 }).catch(() => {});
  }
};

await step('위젯이 뜬다', async () => {
  await page.waitForSelector('.km-root', { timeout: 15000 });
});
await step('툴바 버튼 전부 있다', async () => {
  for (const k of ['maps', 'new-kind', 'undo', 'redo', 'bg', 'fit', 'story', 'png', 'export', 'import', 'clear']) {
    if (await page.locator(`[data-km="${k}"]`).count() === 0) throw new Error(`없음: ${k}`);
  }
});
await step('툴바가 한두 줄에 들어간다 (캔버스를 밀지 않는다)', async () => {
  // 셸 CSS 가 폼 요소를 통짜 너비로 깔면 항목이 한 줄에 하나씩 쌓여 세로 네 줄을 먹는다
  // (실서비스 화면에서 실제로 그랬다). 그만큼 그림이 밀린다.
  // ★ 옆 걸음(캔버스 크기)과 같은 이유로 **자리가 잡힐 때까지 기다린다**: 뜬 직후에는 셸 CSS 가
  //   아직 안 먹어 항목이 세로로 쌓여 있다(같은 코드로 45px 과 662px 이 번갈아 나왔다 — 실측).
  //   끝내 안 접히면 그때는 진짜 빨강이다.
  const settled = await page.waitForFunction(
    () => (document.querySelector('.km-toolbar')?.getBoundingClientRect().height ?? 999) <= 120,
    null, { timeout: 6000 },
  ).then(() => true).catch(() => false);
  const bar = await page.locator('.km-toolbar').boundingBox();
  if (!bar) throw new Error('툴바가 없다');
  if (!settled) throw new Error(`툴바가 ${Math.round(bar.height)}px — 6초가 지나도 여러 줄로 쌓여 있다`);
});
await step('캔버스가 쓸 만한 크기다', async () => {
  // ★ 자리가 잡힐 때까지 기다린다 — `.km-root` 가 나타난 **직후**에 재면 아직 배치 전이라
  //   117px 같은 값이 나온다(실측 2026-08-09: 같은 코드로 117 과 832 가 번갈아 나왔다).
  await page.waitForFunction(
    () => (document.querySelector('.km-canvas')?.getBoundingClientRect().height ?? 0) >= 320,
    null,
    { timeout: 8000 }
  );
});
await step('빈 판에서는 미니맵이 안 뜬다 (검은 상자로 보인다)', async () => {
  // 카드가 두엇뿐이면 미니맵은 길잡이가 아니라 화면 구석의 검은 상자다.
  const mini = page.locator('.km-canvas > svg').nth(1);
  if (await mini.count() > 0 && await mini.isVisible()) throw new Error('빈 판인데 미니맵이 떠 있다');
});
await step('빈 화면 안내가 가로로 읽힌다 (세로로 쪼개지지 않는다)', async () => {
  // 실서비스 첫 화면이 **한 글자씩 세로로** 쪼개져 있었다(안내 조각들이 flex 아이템이 됐다).
  // 글 상자가 카드 한 장보다 넓은지로 잡는다 — 눈으로만 보면 다음에 또 놓친다.
  const box = await page.locator('.km-empty-in').boundingBox();
  if (!box) throw new Error('빈 화면 안내가 없다');
  if (box.width < 240) throw new Error(`안내 글 상자가 너무 좁다(${Math.round(box.width)}px) — 세로로 쪼개진 것`);
  if (box.height > 400) throw new Error(`안내 글 상자가 너무 높다(${Math.round(box.height)}px) — 세로로 쪼개진 것`);
});
await step('빈 곳 더블클릭 → 노드 생김', async () => {
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.waitForSelector('.ck-node', { timeout: 4000 });
});
await step('저장되면 「저장됨」이 잠깐 뜬다', async () => {
  // 이 도구는 자동 저장인데 그 말을 아무 데서도 안 했다 — 처음 쓰는 사람은 「저장 버튼이 어디 있지?」로 불안해한다.
  await page.waitForSelector('[data-km="saved"]:not(.hidden)', { timeout: 4000 });
  // 늘 떠 있으면 잔소리가 된다 — 잠시 뒤 사라져야 한다.
  await page.waitForSelector('[data-km="saved"].hidden', { state: 'attached', timeout: 4000 });
});
await step('이름 입력이 노드에 반영', async () => {
  await page.fill('[data-km="edit-label"]', '욘');
  await page.waitForFunction(() => [...document.querySelectorAll('.ck-node text')]
    .some((t) => t.textContent === '욘'), null, { timeout: 4000 });
});
await step('두 번째 노드 + 손잡이 드래그로 선 잇기', async () => {
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await page.fill('[data-km="edit-label"]', '링');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 2, null, { timeout: 4000 });
  const first = page.locator('.ck-node').first();
  await first.hover();
  const h = await first.locator('.ck-link-handle').boundingBox();
  const target = await page.locator('.ck-node').nth(1).boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('.ck-edge', { timeout: 4000 });
});
await step('선 이름표가 보인다', async () => {
  await page.waitForSelector('.ck-edge-label', { timeout: 4000 });
});
await step('되돌리기 버튼이 살아난다', async () => {
  const disabled = await page.locator('[data-km="undo"]').isDisabled();
  if (disabled) throw new Error('undo 가 여전히 꺼져 있다');
});
await step('배경 무늬 전환', async () => {
  await page.click('[data-km="more"]');
  await page.selectOption('[data-km="bg"]', 'grid');
  const fill = await page.locator('.ck-bg').getAttribute('fill');
  if (!fill?.includes('grid')) throw new Error(`배경이 안 바뀜: ${fill}`);
  // 고르고 나면 서랍은 스스로 닫힌다 — 안 닫히면 그 아래 버튼이 통째로 죽으므로 여기서 못 박는다.
  await page.waitForSelector('[data-km="drawer"].hidden', { state: 'attached', timeout: 4000 });
});
await step('종류를 타이핑해 좁힐 수 있다', async () => {
  await page.locator('.ck-node').first().click({ position: { x: 12, y: 10 } });
  const before = await page.locator('[data-km="edit-kind"] option:not([hidden])').count();
  await page.fill('[data-km="kind-find"]', '카드');
  await page.waitForFunction((b) => {
    const sel = document.querySelector('[data-km="edit-kind"]');
    if (!sel) return false;
    const shown = [...sel.querySelectorAll('option')].filter((o) => !o.hidden).length;
    return shown > 0 && shown < b;
  }, before, { timeout: 4000 });
  await page.fill('[data-km="kind-find"]', '');
});
await step('종류 목록에 모든 갈래가 함께 보인다', async () => {
  await page.locator('.ck-node').first().click({ position: { x: 12, y: 10 } });
  const groups = await page.locator('[data-km="edit-kind"] optgroup').count();
  if (groups < 5) throw new Error('갈래 묶음이 ' + groups + '개뿐이다 — 전부 안 보인다');
  const opts = await page.locator('[data-km="edit-kind"] option').count();
  if (opts < 20) throw new Error('종류가 ' + opts + '개뿐이다');
});
await step('묶음 패널이 열리고 묶음이 생긴다', async () => {
  await page.click('[data-km="tab"][data-key="groups"]');
  await page.click('[data-km="group-add"]');
  await page.waitForSelector('.ck-group', { timeout: 4000 });
  await page.click('[data-km="group-close"]');
});
await step('묶음에 노드를 넣으면 감싸는 윤곽이 그려진다', async () => {
  // 멤버가 셋은 돼야 껍질이 면이 된다 — 둘 이하면 네모로 남는다(의도).
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await page.fill('[data-km="edit-label"]', '알리사');
  for (const id of ['node-1', 'node-2', 'node-3']) {
    await page.evaluate((nid) => {
      const el = document.querySelector(`.ck-node[data-id="${nid}"]`);
      el?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, id).catch(() => {});
  }
  // 패널에서 세 노드를 같은 묶음에 넣는다.
  for (const nid of ['node-1', 'node-2', 'node-3']) {
    const n = page.locator(`.ck-node[data-id="${nid}"]`);
    if (await n.count() === 0) continue;
    await n.click({ position: { x: 10, y: 10 } });
    await openMore(page);
    const boxes = page.locator('[data-km="in-group"]');
    if (await boxes.count() > 0) await boxes.first().check().catch(() => {});
  }
  await page.waitForFunction(
    () => document.querySelector('path.ck-group') !== null,
    null,
    { timeout: 5000 }
  );
});
await step('묶음을 잠그면 끌어도 안 움직인다', async () => {
  await page.click('[data-km="tab"][data-key="groups"]');
  const lock = page.locator('[data-km="group-lock"]').first();
  await lock.waitFor({ timeout: 4000 });
  await lock.click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-group-label')].some((t) => (t.textContent || '').startsWith('🔒')),
    null,
    { timeout: 4000 }
  );
  await lock.click();
  await page.click('[data-km="tab"][data-key="node"]');
});
await step('내 용어 패널에서 관계 종류 추가', async () => {
  await page.click('[data-km="tab"][data-key="terms"]');
  await page.click('[data-km="t-add-edge"]');
  await page.waitForSelector('[data-term-edge]', { timeout: 4000 });
  await page.click('[data-km="t-close"]');
});
await step('얼굴을 안 정한 카드는 **종류 그림**을 단다 (색만으로는 안 갈린다)', async () => {
  // 예전에는 이름 첫 글자를 넣었다. 그런데 이름은 **바로 옆에 글자로** 있고, 종류는 색 말고는
  // 어디에도 없었다 — 색맹·흑백 인쇄·작은 화면에서 인물·장소·사건이 전부 같아 보인다
  // (2026-08-12 사용자 검토). 그래서 동그라미는 「무엇인지」를 맡는다.
  await page.waitForFunction(() => {
    const g = document.querySelector('.ck-node');
    if (!g) return false;
    const mid = [...g.querySelectorAll('text')].find((t) => t.getAttribute('text-anchor') === 'middle');
    const name = (g.querySelector('text')?.textContent || '').trim();
    if (!mid) return false;
    const icon = (mid.textContent || '').trim();
    // 이름 첫 글자가 아니라 **그림**이어야 한다(이름이 「욘」이면 「욘」이 아니어야 한다).
    return Boolean(icon) && icon !== name.slice(0, 1);
  }, null, { timeout: 4000 });
});
await step('설명을 적으면 카드에 📄 가 붙는다', async () => {
  await page.locator('.ck-node').first().click({ position: { x: 12, y: 10 } });
  await page.fill('[data-km="edit-doc"]', '엘프 마녀. 게으르다고 말하지만 실은 혼자 남는 걸 무서워한다.');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => t.textContent === '📄'),
    null,
    { timeout: 4000 }
  );
});
await step('「많이 이어진 것을 크게」가 실제로 크게 만든다', async () => {
  const widthOf = async () => page.evaluate(() => {
    const el = document.querySelector('.ck-node .ck-node-bg');
    if (!el) return 0;
    return Math.round(el.getBoundingClientRect().width);
  });
  const before = await widthOf();
  await page.click('[data-km="tab"][data-key="filter"]');
  await page.locator('[data-km="f-degree"]').check();
  await page.waitForFunction(
    (w) => {
      const el = document.querySelector('.ck-node .ck-node-bg');
      return el ? Math.round(el.getBoundingClientRect().width) > w : false;
    },
    before,
    { timeout: 4000 }
  );
  await page.locator('[data-km="f-degree"]').uncheck();
  await page.click('[data-km="f-close"]');
});
await step('링크로 내보내고 그 링크로 다시 받는다', async () => {
  await context0.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const nodesBefore = await page.locator('.ck-node').count();
  // 클립보드가 막히면 제품이 prompt 로 보여 준다 — 그 글에서 주소를 건진다.
  let fromDialog = '';
  const onDialog = (d) => { fromDialog = d.defaultValue() || d.message(); d.dismiss().catch(() => {}); };
  page.on('dialog', onDialog);
  await page.click('[data-km="more"]');
  // 이 버튼은 눌리면 서랍을 닫는다 — 보통 click 은 「대상이 사라졌다」로 30초를 기다린다.
  await page.locator('[data-km="share"]').click();
  await page.waitForTimeout(1200);
  const url = fromDialog || (await page.evaluate(() => navigator.clipboard.readText().catch(() => '')));
  page.off('dialog', onDialog);
  if (!url || !String(url).includes('km=')) throw new Error('링크가 안 만들어졌다: ' + String(url).slice(0, 60));
  const p2 = await context0.newPage();
  await p2.goto(url, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.km-root', { timeout: 15000 });
  await p2.waitForFunction((c) => document.querySelectorAll('.ck-node').length === c, nodesBefore, { timeout: 8000 });
  await p2.close();
});
await step('저장 상태가 크기를 보여 주고 백업 파일을 만든다', async () => {
  await page.click('[data-km="more"]');
  await page.locator('[data-km="storage"]').click();
  await page.waitForSelector('[data-km="st-backup"]', { timeout: 4000 });
  const meter = await page.locator('.km-meter-fill').count();
  if (meter === 0) throw new Error('용량 막대가 없다');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('[data-km="st-backup"]'),
  ]);
  if (!dl.suggestedFilename().includes('backup')) throw new Error('백업 파일이 아니다');
  // 직전 판이 실제로 남는지 — 새로고침 뒤에도 한 판은 있어야 한다.
  // ★ 지금 맵에 **덮어쓰기를 한 번 일으킨 뒤** 본다. 갓 만든 맵은 덮어쓴 적이 없어 직전 판도 없다
  //   (검사는 사건을 기다리지 말고 일으켜야 한다).
  await page.locator(`.ck-node`).first().click({ position: { x: 12, y: 10 } });
  await page.fill(`[data-km="edit-label"]`, `직전판 확인`);
  await page.waitForTimeout(400);
  const hasPrev = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('karmograph.index') || 'null');
    if (!idx) return false;
    return Boolean(localStorage.getItem('karmograph.prev.' + idx.activeId));
  });
  if (!hasPrev) throw new Error('직전 판이 안 남았다');
  // 되돌리기까지 해 봐야 백업이 진짜다 — 만들기만 되는 백업은 반쪽이다.
  const saved = await dl.path();
  const mapsBefore = await page.locator('[data-km="maps"] option').count();
  await page.setInputFiles('[data-km="restore-file"]', saved);
  await page.waitForFunction(
    (c) => document.querySelectorAll('[data-km="maps"] option').length > c,
    mapsBefore,
    { timeout: 6000 }
  );
  await page.click('[data-km="more"]');
  await page.locator('[data-km="storage"]').click();
  await page.waitForSelector('[data-km="st-close"]', { timeout: 4000 });
  await page.click('[data-km="st-close"]');
});
await step('선을 눌러 관계 자체에 이야기를 적는다', async () => {
  await page.locator('.ck-edge-hit').first().click({ force: true });
  await page.waitForSelector('[data-km="ed-doc"]', { timeout: 4000 });
  await page.fill('[data-km="ed-doc"]', '어릴 때 같은 스승 밑에 있었다.');
  await page.fill('[data-km="ed-label"]', '옛 동문');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-edge-label text')].some((t) => t.textContent === '옛 동문'),
    null,
    { timeout: 4000 }
  );
  await page.click('[data-km="ed-close"]');
});
await step('키보드로 고르고 옮긴다', async () => {
  await page.locator('.ck-node').first().click({ position: { x: 12, y: 10 } });
  await page.locator('.km-canvas').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node.is-selected').length === 1, null, { timeout: 4000 });
  const before = await page.locator('.ck-node.is-selected').boundingBox();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift+ArrowRight');
  const after = await page.locator('.ck-node.is-selected').boundingBox();
  if (Math.round(after.x - before.x) < 40) throw new Error('방향키로 안 움직였다: ' + Math.round(after.x - before.x));
  await page.keyboard.press('Escape');
});
await step('옆 패널 탭으로 아홉 패널을 오간다', async () => {
  await page.waitForSelector('.km-tabs', { timeout: 4000 });
  for (const key of ['groups', 'terms', 'filter', 'sna', 'storage', 'help', 'node']) {
    await page.locator('[data-km="tab"][data-key="' + key + '"]').click();
    await page.waitForFunction(
      (k) => document.querySelector('[data-km="tab"][data-key="' + k + '"]')?.classList.contains('is-on') === true,
      key,
      { timeout: 4000 }
    );
  }
});
await step('도움말이 할 수 있는 일을 다 보여 준다', async () => {
  await page.click('[data-km="tab"][data-key="help"]');
  await page.waitForSelector('[data-km="help-close"]', { timeout: 4000 });
  const rows = await page.locator('.km-help-row').count();
  if (rows < 20) throw new Error(`도움말 줄이 ${rows}개뿐이다`);
  await page.click('[data-km="help-close"]');
});
await step('관계망 읽기가 순위를 낸다', async () => {
  await page.click('[data-km="tab"][data-key="sna"]');
  await page.waitForSelector('[data-km="sna-focus"]', { timeout: 4000 });
  const rows = await page.locator('[data-km="go-link"]').count();
  if (rows === 0) throw new Error('순위가 하나도 안 나왔다');
  await page.click('[data-km="sna-close"]');
});
await step('겹쳐 놓아도 「가지런히」 가 밀어 놓는다', async () => {
  // 두 노드를 일부러 같은 자리에 포갠다.
  const ids = await page.evaluate(() => {
    const raw = localStorage.getItem(localStorage.getItem('karmograph.index')
      ? JSON.parse(localStorage.getItem('karmograph.index')).maps
        .find((m) => m.id === JSON.parse(localStorage.getItem('karmograph.index')).activeId)
        ? 'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId
        : ''
      : '');
    return raw ? JSON.parse(raw).nodes.slice(0, 2).map((n) => n.id) : [];
  });
  if (ids.length < 2) throw new Error('노드가 둘은 있어야 한다');
  const boxA = await page.locator('.ck-node').first().boundingBox();
  const boxB = await page.locator('.ck-node').nth(1).boundingBox();
  // 두 번째를 첫 번째 위로 끌어다 포갠다.
  await page.mouse.move(boxB.x + 12, boxB.y + 10);
  await page.mouse.down();
  await page.mouse.move(boxA.x + 14, boxA.y + 12, { steps: 12 });
  await page.mouse.up();
  await page.click('[data-km="more"]');
  await page.locator('[data-km="tidy"]').click();
  await page.waitForFunction(() => {
    const els = [...document.querySelectorAll('.ck-node')].slice(0, 2);
    if (els.length < 2) return false;
    const [a, b] = els.map((e) => e.getBoundingClientRect());
    // 겹치지 않으면 통과.
    return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  }, null, { timeout: 5000 });
});
await step('꼬리표를 붙이고 그 꼬리표로 거른다', async () => {
  await page.locator('.ck-node').first().click({ position: { x: 12, y: 10 } });
  await page.fill('[data-km="edit-tags"]', '중요, 나중에');
  await page.locator('[data-km="edit-tags"]').blur();
  const before = await page.locator('.ck-node').count();
  await page.click('[data-km="tab"][data-key="filter"]');
  const tagBox = page.locator('[data-km="f-tag"]').first();
  await tagBox.waitFor({ timeout: 4000 });
  await tagBox.uncheck();
  await page.waitForFunction((c) => document.querySelectorAll('.ck-node').length === c - 1, before, { timeout: 4000 });
  await page.click('[data-km="f-reset"]');
  await page.click('[data-km="f-close"]');
});
await step('꼬리표를 타이핑하면 제안이 좁아지고 Enter 로 붙는다', async () => {
  await page.locator('.ck-node').first().click({ position: { x: 12, y: 10 } });
  await page.fill('[data-km="edit-tags"]', '');
  const chips = page.locator('[data-km="tag-add"]:not([hidden])');
  const all = await chips.count();
  if (all === 0) throw new Error('제안 칩이 없다');
  // 「중」처럼 **글자를 손으로 박으면** 그 글자를 품은 제안이 이 맵에 있어야만 통과한다 —
  // 앞 검사들이 고른 노드·꼬리표가 조금만 달라져도 헛 실패한다. 그래서 **지금 떠 있는 제안에서
  // 글자를 뽑아** 친다: 제안이 좁아지는지만 보면 되는 검사에 자료 의존을 섞지 않는다.
  const seed = await chips.first().textContent();
  const typed = (seed || '').trim().replace(/^[#+\s]*/, '').slice(0, 1);
  if (!typed) throw new Error('제안 칩에 글자가 없다');
  await page.locator('[data-km="edit-tags"]').type(typed);
  await page.waitForFunction((a) => {
    const vis = [...document.querySelectorAll('[data-km="tag-add"]')].filter((b) => !b.hidden).length;
    return vis > 0 && vis <= a;
  }, all, { timeout: 4000 });
  await page.locator('[data-km="edit-tags"]').press('Enter');
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-km="edit-tags"]');
    return v instanceof HTMLInputElement && v.value.trim().length > 1;
  }, null, { timeout: 4000 });
});
await step('꼬리표로 색 입히기가 실제로 색을 바꾼다', async () => {
  const strokeOf = () => page.evaluate(() => document.querySelector('.ck-node .ck-node-bg')?.getAttribute('stroke') || '');
  const before = await strokeOf();
  await page.click('[data-km="tab"][data-key="filter"]');
  await page.locator('[data-km="f-colortag"]').check();
  await page.waitForFunction((b) => {
    const v = document.querySelector('.ck-node .ck-node-bg')?.getAttribute('stroke') || '';
    return v !== b;
  }, before, { timeout: 4000 });
  await page.locator('[data-km="f-colortag"]').uncheck();
  await page.click('[data-km="f-close"]');
});
await step('설명 속 [[이름]] 이 다른 노드로 이어진다', async () => {
  const nodes = page.locator('.ck-node');
  const second = await nodes.nth(1).getAttribute('data-id');
  await nodes.nth(1).click({ position: { x: 12, y: 10 } });
  const otherName = await page.inputValue('[data-km="edit-label"]');
  await nodes.first().click({ position: { x: 12, y: 10 } });
  await page.fill('[data-km="edit-doc"]', '이 인물은 [[' + otherName + ']] 와 얽혀 있다.');
  await page.waitForSelector('[data-km="go-link"]', { timeout: 4000 });
  await page.click('[data-km="go-link"]');
  await page.waitForFunction((id) => {
    const el = document.querySelector('.ck-node.is-selected');
    return el && el.getAttribute('data-id') === id;
  }, second, { timeout: 4000 });
});
await step('글로 여러 노드를 한 번에 만든다', async () => {
  const before = await page.locator('.ck-node').count();
  await page.click('[data-km="more"]');
  await page.locator('[data-km="from-text"]').click();
  await page.fill(`[data-km="text-src"]`, [`뿌리`, `  가지1 : 낳음`, `  가지2 : 낳음`].join(String.fromCharCode(10)));
  await page.click('[data-km="text-go"]');
  await page.waitForFunction(
    (c) => document.querySelectorAll('.ck-node').length === c + 3,
    before,
    { timeout: 5000 }
  );
});
await step('Shift+드래그로 여럿 고르고 함께 옮긴다', async () => {
  const box = await page.locator('.km-canvas').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForSelector('[data-km="many-del"]', { timeout: 4000 });
  const picked = await page.locator('.ck-node.is-selected').count();
  if (picked < 2) throw new Error(`고른 것이 ${picked}개뿐이다`);
  // 고른 무리를 함께 끄는 것은 이 자리(묶음이 얽힌 상태)에서 재기가 불안정하다 —
  // 별도 단계에서 깨끗한 맵으로 잰다.
  // 고른 것 표 — 이름을 그 자리에서 고칠 수 있어야 한다.
  const rows = await page.locator('.km-trow').count();
  if (rows < 2) throw new Error('표에 줄이 ' + rows + '개뿐이다');
  await page.locator('[data-km="many-name"]').first().fill('표에서 고침');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => t.textContent === '표에서 고침'),
    null,
    { timeout: 4000 }
  );
  await page.locator('[data-km="many-close"]').click();
});
await step('선이 N개 이상인 것만 남기기', async () => {
  const before = await page.locator('.ck-node').count();
  await page.click('[data-km="tab"][data-key="filter"]');
  const sld = page.locator('[data-km="f-mindeg"]');
  await sld.waitFor({ timeout: 4000 });
  await sld.fill('3');
  await page.waitForFunction((b) => document.querySelectorAll('.ck-node').length < b, before, { timeout: 4000 });
  await page.click('[data-km="f-reset"]');
  await page.waitForFunction((b) => document.querySelectorAll('.ck-node').length === b, before, { timeout: 4000 });
  await page.click('[data-km="f-close"]');
});
await step('거르기로 노드 종류를 빼면 화면에서 사라진다', async () => {
  const before = await page.locator('.ck-node').count();
  await page.click('[data-km="tab"][data-key="filter"]');
  const boxes = page.locator('[data-km="f-node"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i += 1) await boxes.nth(i).uncheck();
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  await page.click('[data-km="f-reset"]');
  await page.waitForFunction(
    (c) => document.querySelectorAll('.ck-node').length === c,
    before,
    { timeout: 4000 }
  );
  await page.click('[data-km="f-close"]');
});
await step('찾기 → 포커스가 걸린다', async () => {
  // 노드 둘이 서로 이어져 있으므로 「1다리」로 보면 둘 다 포함된다 — 「고른 것만」으로 본다.
  await page.selectOption('[data-km="degree"]', '0');
  await page.fill('[data-km="find"]', '욘');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node.is-dimmed').length > 0, null, { timeout: 4000 });
  /* 찾은 수가 칸 옆에 뜬다 — 흐려지는 것만으로는 「없다」와 「아직 안 쳤다」가 구별되지 않는다.
     ★ 「숫자가 보인다」로 재면 안 된다. 이 자리의 판이 무엇이냐에 따라 「욘」이 0개일 수 있고,
     그때 표시는 「없음」이라 숫자가 없다 — 실제로 그걸로 두 판을 헛되이 빨갛게 만들었다.
     여기서 볼 것은 **글자를 치면 수가 뜬다**는 것 하나다. */
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-km="find-count"]');
    return el !== null && !el.classList.contains('hidden') && (el.textContent || '').length > 0;
  }, null, { timeout: 4000 });
  await page.fill('[data-km="find"]', '없을이름zzz');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-km="find-count"]');
    return el && el.classList.contains('is-none');
  }, null, { timeout: 4000 });
  /* 비우는 순서가 있다 — 「몇 다리까지」가 켜져 있는데 고른 카드가 없으면 그 자리에
     「카드를 하나 고르세요」가 들어앉는다(그것도 이 자리의 일이다). 둘 다 풀어야 사라진다. */
  await page.selectOption('[data-km="degree"]', '');
  await page.fill('[data-km="find"]', '');
  await page.waitForFunction(() => document.querySelector('[data-km="find-count"]')?.classList.contains('hidden'), null, { timeout: 4000 });
});
/* ★ 발표 줄 단추는 **진짜 클릭**으로 누른다(`dispatchEvent` X).
   `dispatchEvent` 는 「그 자리에 뭐가 덮여 있나」를 안 본다 — 그래서 캔버스 svg 가 발표 줄을
   통째로 덮고 있는데도 이 검사는 오래 초록이었다(실측 2026-08-12). 사람이 누를 수 있는지를
   재려면 사람이 누르는 길로 눌러야 한다. */
await step('발표 장을 담고 순서를 바꾼다', async () => {
  // prompt 가 두 번 뜬다(제목·설명) — 상시 핸들러로 받아 넘긴다. once 로 걸면 클릭이 대화상자에 물려 멈춘다.
  let n = 0;
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '장 ' + n : '').catch(() => {}); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').click();
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').click();
  await page.locator('[data-km="stage-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 2, null, { timeout: 5000 });
  const firstBefore = await page.locator('[data-km="stage-go"]').first().textContent();
  await page.locator('[data-km="stage-back"]').click();
  await page.waitForFunction((bb) => {
    const el = document.querySelector('[data-km="stage-go"]');
    return el && el.textContent !== bb;
  }, firstBefore, { timeout: 4000 });
  await page.locator('[data-km="stage-exit"]').click();
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });
  page.off('dialog', onDlg);
});
await step('발표 모드 진입 / 나가기', async () => {
  // 이 버튼은 눌리는 순간 툴바를 통째로 숨긴다 — 보통 click 은 「대상이 사라졌다」로 보고
  // 30초를 기다린다(제품이 아니라 검사 쪽 함정). 이벤트만 던진다.
  await page.locator(`[data-km="story"]`).click();
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator(`[data-km="stage-exit"]`).click();
  await page.waitForSelector(`.km-root:not(.is-presenting)`, { timeout: 4000 });
  if (await page.locator('.km-root.is-presenting').count()) throw new Error('나가기가 안 먹음');
});
await step('고른 무리는 함께 움직인다 (깨끗한 맵)', async () => {
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForSelector('.ck-node', { timeout: 4000 });
  await page.mouse.dblclick(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 2, null, { timeout: 4000 });
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const sel = page.locator('.ck-node.is-selected');
  if (await sel.count() !== 2) throw new Error(`고른 것이 ${await sel.count()}개`);
  const dragBox = await sel.first().boundingBox();
  const before = await sel.nth(1).boundingBox();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + 70, dragBox.y + dragBox.height / 2 + 50, { steps: 10 });
  await page.mouse.up();
  const after = await page.locator('.ck-node').nth(1).boundingBox();
  if (Math.abs(after.x - before.x) < 10 && Math.abs(after.y - before.y) < 10) {
    throw new Error('무리가 함께 안 움직였다');
  }
});
await step('빈 캔버스에서 예시를 넣으면 그림이 생긴다', async () => {
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  // 견본은 이제 **옆 패널의 갈래 카드**로 깐다 — 캔버스 위 큰 버튼은 「빈 곳 두 번 클릭」을 잡아먹는다.
  await page.click('[data-km="tab"][data-key="node"]');
  await page.waitForSelector('[data-km="intent"]', { timeout: 4000 });
  await page.locator('[data-km="intent"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length >= 5, null, { timeout: 5000 });
  if (await page.locator('.ck-edge').count() === 0) throw new Error('선이 하나도 안 생겼다');
});
await step('공용 글 — 승격하면 목록에 뜨고, 둘째 자리에 붙이면 2곳이 된다', async () => {
  // 글이 노드 안에 갇혀 있으면 같은 설정을 둘에게 붙일 수 없다. 승격 → 불러 쓰기까지가 한 몸이라
  // 검사도 한 몸으로 한다 — 승격만 되고 불러 쓰기가 안 되면 기능이 반쪽이다.
  // 앞선 회차가 남긴 맵을 그대로 물려받으므로 **이미 공용 글을 쓰는 상태**일 수 있다.
  // 그 자리에서 검사를 시작하면 「승격 버튼이 없다」로 헛 실패한다 — 먼저 떼어 내고 시작한다.
  const detachIfShared = async () => {
    const unlink = page.locator('[data-km="edit-doc-unlink"]');
    if (await unlink.count() > 0) {
      await unlink.click();
      await page.waitForSelector('[data-km="edit-doc-share"]', { timeout: 4000 });
    }
  };

  await page.click('.ck-node');
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  await detachIfShared();
  await page.fill('[data-km="edit-doc"]', '이 세계의 마법은 대가를 요구한다');
  await page.locator('[data-km="edit-doc-share"]').click();
  await page.waitForSelector('[data-km="edit-doc-unlink"]', { timeout: 4000 });

  await page.click('[data-km="tab"][data-key="notes"]');
  await page.waitForSelector('[data-km="note-title"]', { timeout: 4000 });
  // 방금 만든 글은 목록 **맨 끝**이다(뒤에 붙인다). 첫 줄을 보면 앞 회차 글을 볼 수 있다.
  const one = await page.locator('.km-group-count').last().textContent();
  if (!(one || '').includes('1곳')) throw new Error('승격한 글을 쓰는 곳이 1곳이 아니다: ' + one);

  // 둘째 노드에 같은 글을 붙인다.
  await page.click('[data-km="tab"][data-key="node"]');
  await page.locator('.ck-node').nth(1).click();
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  await detachIfShared();
  await page.waitForSelector('[data-km="edit-doc-use"]', { timeout: 4000 });
  const optId = await page.locator('[data-km="edit-doc-use"] option').last().getAttribute('value');
  await page.selectOption('[data-km="edit-doc-use"]', optId);
  await page.waitForSelector('[data-km="edit-doc-unlink"]', { timeout: 4000 });
  const shownText = await page.inputValue('[data-km="edit-doc"]');
  if (!shownText.trim()) throw new Error('불러 쓴 글이 안 보인다');

  await page.click('[data-km="tab"][data-key="notes"]');
  await page.waitForSelector('[data-km="note-title"]', { timeout: 4000 });
  const counts = await page.locator('.km-group-count').allTextContents();
  if (!counts.some((c) => c.includes('2곳'))) throw new Error('둘째 자리를 붙였는데 2곳짜리 글이 없다: ' + counts.join('/'));

  // 카드만 보고도 「나눠 쓰는 글」임을 알아야 한다 — 모르고 고치면 남의 카드가 바뀐다.
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').startsWith('🔗2')),
    null,
    { timeout: 4000 }
  );
  // 노드 패널 안에서 **바로** 쓰는 자리들이 펼쳐져야 한다 — 목록 패널까지 가야 하면 아무도 안 간다.
  await page.click('[data-km="tab"][data-key="node"]');
  await page.waitForSelector('[data-km="edit-doc-users"]', { timeout: 4000 });
  await page.locator('[data-km="edit-doc-users"] summary').click();
  const userRows = await page.locator('[data-km="edit-doc-users"] .km-link-row').count();
  if (userRows < 2) throw new Error('쓰는 자리 목록이 2줄 미만: ' + userRows);
  await page.click('[data-km="tab"][data-key="notes"]');
  await page.waitForSelector('[data-km="note-title"]', { timeout: 4000 });

  // 쓰는 자리를 한 화면에 모아 준다(둘 이상일 때만 눌린다).
  await page.locator('[data-km="note-show"]:not([disabled])').first().click();
  // 「모아 보기」의 증거 = **나머지가 흐려진다**. 노드 수만 세면 아무것도 안 해도 통과한다.
  await page.waitForFunction(
    () => {
      const all = [...document.querySelectorAll('.ck-node')];
      const dim = all.filter((g) => g.classList.contains('is-dimmed'));
      return dim.length > 0 && dim.length < all.length;
    },
    null,
    { timeout: 4000 }
  );
  await page.click('[data-km="tab"][data-key="node"]');
});
await step('공용 글을 캔버스에 쪽지로 놓으면 글이 그대로 보인다', async () => {
  // 쪽지는 사본이 아니라 창이다 — 놓자마자 카드 안에 글자가 있어야 하고, 쓰는 곳 수가 하나 는다.
  await page.click('[data-km="tab"][data-key="notes"]');
  await page.waitForSelector('[data-km="note-card"]', { timeout: 4000 });
  const beforeNodes = await page.locator('.ck-node').count();
  await page.locator('[data-km="note-card"]').last().click();
  await page.waitForFunction((n) => document.querySelectorAll('.ck-node').length === n + 1, beforeNodes, { timeout: 4000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').includes('대가를')),
    null,
    { timeout: 4000 }
  );
  await page.click('[data-km="tab"][data-key="notes"]');
  const counts = await page.locator('.km-group-count').allTextContents();
  if (!counts.some((c) => c.includes('3곳'))) throw new Error('쪽지를 놓았는데 쓰는 곳이 안 늘었다: ' + counts.join('/'));
  await page.click('[data-km="tab"][data-key="node"]');
});
await step('글 안에 다른 공용 글 끼워 넣기 — 쪽지에 원본 글자가 실린다', async () => {
  // 끼운 자리는 사본이 아니라 창이다. 표(`{{note:…}}`)가 그대로 보이면 실패 — 풀린 글자가 보여야 한다.
  await page.click('[data-km="tab"][data-key="node"]');
  // 앞 검사에서 공용 글을 **쓰고 있는** 노드를 고르면 끼울 후보가 자기 자신뿐이라 목록이 빈다
  // (자기를 자기 안에 끼우는 것은 고리다). 앞 검사들이 어느 노드에 무엇을 붙였는지에 기대지 말고
  // **빈 곳에 새 노드를 하나 만들어** 거기서 끼운다 — 자료 의존이 없으면 헛 실패도 없다.
  const ebox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(ebox.x + ebox.width * 0.25, ebox.y + ebox.height * 0.75);
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  await page.fill('[data-km="edit-doc"]', '이 인물은 규칙을 따른다: ');
  const embed = page.locator('[data-km="edit-doc-embed"]');
  if (await embed.count() === 0) throw new Error('끼워 넣을 공용 글이 없다');
  const noteId = await embed.locator('option').nth(1).getAttribute('value');
  await page.selectOption('[data-km="edit-doc-embed"]', noteId);
  await page.waitForFunction(
    () => (document.querySelector('[data-km="edit-doc"]')?.value || '').includes('{{note:'),
    null,
    { timeout: 4000 }
  );
  await openMore(page);
  await page.selectOption('[data-km="edit-shape"]', 'note');
  await page.waitForFunction(
    () => {
      const texts = [...document.querySelectorAll('.ck-node text')].map((t) => t.textContent || '').join(' ');
      return texts.includes('대가를') && !texts.includes('{{note:');
    },
    null,
    { timeout: 4000 }
  );

  // 실은 글은 **그 자리에서** 고쳐진다 — 원본을 찾아가야 하면 아무도 안 고친다.
  const inline = page.locator('[data-km="edit-doc-embedded"]').first();
  await inline.waitFor({ timeout: 4000 });
  await inline.fill('규칙이 바뀌었다: 대가는 두 배');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').includes('두 배')),
    null,
    { timeout: 4000 }
  );
});
await step('노드에 칸을 만들면 같은 종류의 다른 노드가 그 칸 이름을 후보로 받는다', async () => {
  // 스키마를 미리 짜게 하면 아무도 안 쓴다 — 쓰면서 자라는지를 본다(첫 노드에 칸 → 둘째에서 후보).
  const fbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(fbox.x + fbox.width * 0.2, fbox.y + fbox.height * 0.25);
  await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
  // 이 검사의 주제는 「**같은 종류**끼리 칸 이름을 물려받는가」다. 그런데 새 노드의 종류는 앞 검사가
  // 무엇을 깔았느냐에 따라 달라진다 — 그래서 두 노드 모두 **같은 종류로 못 박고** 시작한다.
  const pinKind = await page.evaluate(() => document.querySelector('[data-km="edit-kind"] option')?.value ?? '');
  if (pinKind) await page.selectOption('[data-km="edit-kind"]', pinKind);
  await page.fill('[data-km="edit-label"]', '칸주인');
  await page.fill('[data-km="fld-new"]', '출신');
  await page.locator('[data-km="fld-add"]').click();
  await page.waitForSelector('[data-km="fld-value"]', { timeout: 4000 });
  await page.locator('[data-km="fld-value"]').first().fill('마계');

  await page.mouse.dblclick(fbox.x + fbox.width * 0.62, fbox.y + fbox.height * 0.6);
  await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
  if (pinKind) await page.selectOption('[data-km="edit-kind"]', pinKind);
  // 칸은 **카드에서 읽혀야** 값이 있다 — 패널을 열어야만 보이면 아무도 안 적는다.
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').startsWith('출신:')),
    null,
    { timeout: 4000 }
  );
  const opts = await page.locator('#km-fld-suggest option').evaluateAll((os) => os.map((o) => o.value));
  if (!opts.includes('출신')) {
    const why = await page.evaluate(() => {
      const sel = document.querySelector('[data-km="edit-kind"]');
      return JSON.stringify({ kind: sel?.value, names: [...document.querySelectorAll('[data-km="fld-name"]')].map((i) => i.value) });
    });
    throw new Error('같은 종류가 쓰는 칸이 후보로 안 뜬다: ' + opts.join('/') + ' · ' + why);
  }

  // 칸에 적은 이름이 이 맵의 노드면 **선으로 올릴 수 있어야** 한다 — 글로만 남으면 그림에 안 나온다.
  // 노드를 다시 골라 오가면 어느 노드가 골렸는지에 기대게 된다 — **지금 고른 노드에서** 끝낸다.
  await page.fill('[data-km="edit-label"]', '마왕성');
  await page.fill('[data-km="fld-new"]', '소속');
  await page.locator('[data-km="fld-add"]').click();
  await page.waitForSelector('[data-km="fld-value"]', { timeout: 4000 });
  await page.locator('[data-km="fld-value"]').first().fill('칸주인');
  // 값은 **손을 뗄 때** 확정된다(타자 한 글자마다 패널을 다시 그리면 커서가 날아간다) —
  // 검사도 사람처럼 칸을 벗어나 준다.
  await page.locator('[data-km="fld-value"]').first().blur();
  const promote = page.locator('[data-km="fld-link"]');
  await promote.first().waitFor({ timeout: 4000 });
  const edgesBefore = await page.locator('.ck-edge').count();
  await promote.first().click();
  await page.waitForFunction((n) => document.querySelectorAll('.ck-edge').length > n, edgesBefore, { timeout: 4000 });
});
await step('칸으로 좁히면 그 칸을 적은 것만 남는다', async () => {
  // 앞 검사가 「출신: 마계」를 적어 뒀다. 좁히면 **적지 않은 노드들이 화면에서 빠져야** 한다.
  await page.click('[data-km="tab"][data-key="filter"]');
  await page.waitForSelector('[data-km="f-field"]', { timeout: 4000 });
  const before = await page.locator('.ck-node').count();
  await page.selectOption('[data-km="f-field"]', '출신');
  await page.waitForFunction((n) => document.querySelectorAll('.ck-node').length < n, before, { timeout: 4000 });
  const narrowed = await page.locator('.ck-node').count();
  if (narrowed === 0) throw new Error('칸을 적은 노드까지 사라졌다');
  // 칸 값으로 물들이면 **테두리 색이 실제로 바뀌어야** 한다(고른 것만으로는 아무 일도 안 일어날 수 있다).
  const strokeNow = () => page.evaluate(
    () => document.querySelector('.ck-node .ck-node-bg')?.getAttribute('stroke') || ''
  );
  const beforeColor = await strokeNow();
  await page.selectOption('[data-km="f-colorfield"]', '출신');
  await page.waitForFunction(
    (b) => (document.querySelector('.ck-node .ck-node-bg')?.getAttribute('stroke') || '') !== b,
    beforeColor,
    { timeout: 4000 }
  );

  await page.locator('[data-km="f-reset"]').click();
  await page.waitForFunction((n) => document.querySelectorAll('.ck-node').length === n, before, { timeout: 4000 });
  await page.click('[data-km="tab"][data-key="node"]');
});
await step('고른 노드 옆 작은 도구 줄에서 쪽지를 바로 붙인다', async () => {
  // 옆 패널까지 가는 왕복이 리듬을 끊는다 — 고른 것 옆에서 바로 눌리는지, 그리고 **실제로 늘어나는지** 본다.
  const tbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(tbox.x + tbox.width * 0.7, tbox.y + tbox.height * 0.3);
  await page.waitForSelector('[data-km="mini"]:not(.hidden)', { timeout: 4000 });
  const before = await page.locator('.ck-node').count();
  await page.locator('[data-km="mini-note"]').click();
  await page.waitForFunction((n) => document.querySelectorAll('.ck-node').length === n + 1, before, { timeout: 4000 });
  // 쪽지는 그 노드를 **가리켜야** 한다(지시선이 하나 늘어난다).
  if (await page.locator('.ck-leader').count() === 0) throw new Error('쪽지가 아무것도 안 가리킨다');
});
await step('카드 모서리를 끌면 크기가 바뀌고, 이름을 고쳐도 되돌아가지 않는다', async () => {
  // 손으로 맞춘 판이 타자 한 번에 도로 튀는 것이 가장 짜증나는 일이다 — 그 되돌아감까지 검사한다.
  const rbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(rbox.x + rbox.width * 0.45, rbox.y + rbox.height * 0.8);
  // 카드를 만들면 **그 자리에서 이름부터 받는다**(카드를 덮는다) — 넣고 닫아야 손잡이가 잡힌다.
  await page.waitForSelector('.km-inline', { timeout: 4000 });
  await page.keyboard.type('크기카드');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ck-size-handle', { timeout: 4000 });
  const grip = await page.locator('.ck-size-handle').first().boundingBox();
  const widthOf = () => page.evaluate(
    () => Number(document.querySelector('.ck-node.is-selected .ck-node-bg')?.getAttribute('width') || 0)
  );
  const before = await widthOf();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 90, grip.y + 30, { steps: 6 });
  await page.mouse.up();
  const after = await widthOf();
  if (!(after > before + 40)) throw new Error(`폭이 안 늘었다: ${before} → ${after}`);
  await page.fill('[data-km="edit-label"]', '길게길게길게이름');
  await page.waitForTimeout(300);
  const kept = await widthOf();
  if (Math.abs(kept - after) > 2) throw new Error(`손으로 정한 크기가 튀었다: ${after} → ${kept}`);
});
await step('틀로 담은 장은 나중에 놓은 인물도 함께 데려간다', async () => {
  // 장면을 노드 목록으로 굳히면 새 인물이 영영 안 낀다 — 그래서 **담은 뒤에** 하나 더 놓고 센다.
  let n = 0;
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '틀 장' : '').catch(() => {}); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').click();
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 1, null, { timeout: 5000 });
  const dimmedBefore = await page.locator('.ck-node.is-dimmed').count();
  await page.locator('[data-km="stage-exit"]').click();
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });

  // 화면 한가운데(= 그 틀 안)에 새 인물을 놓는다.
  const sbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(sbox.x + sbox.width * 0.5, sbox.y + sbox.height * 0.5);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '나중에온사람');

  await page.locator('[data-km="story"]').click();
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  // 새 인물이 장에 꼈으면 **흐려진 것 중에 없어야** 한다.
  const stillDim = await page.evaluate(() => [...document.querySelectorAll('.ck-node.is-dimmed')]
    .some((g) => (g.textContent || '').includes('나중에온사람')));
  if (stillDim) throw new Error('나중에 놓은 인물이 그 장에 안 꼈다');
  await page.locator('[data-km="stage-exit"]').click();
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });
  page.off('dialog', onDlg);
  if (dimmedBefore < 0) throw new Error('불가능');
});
await step('장을 넘기면 화면이 끊기지 않고 미끄러진다', async () => {
  // 「목적지에 닿았나」만 보면 점프도 통과한다 — **중간 프레임이 목적지와 다른지**를 봐야 미끄러짐이다.
  // 화면 자리 = 세계 레이어의 matrix. 빈 문자열이 나오면 잘못 짚은 것이므로 그대로 실패시킨다.
  const viewOf = async () => {
    const t = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.km-canvas svg g')]
        .find((el) => (el.getAttribute('transform') || '').startsWith('matrix('));
      return g ? g.getAttribute('transform') : '';
    });
    if (!t) throw new Error('세계 레이어 transform 을 못 찾았다');
    return t;
  };
  let n = 0;
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '미끄럼 ' + n : '').catch(() => {}); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').click();
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').click();
  await page.waitForTimeout(500);
  // 두 장이 **같은 자리**면 「화면이 그대로」가 당연하다 — 사이에 화면을 옮겨 서로 다른 장으로 만든다.
  const pbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.move(pbox.x + pbox.width * 0.7, pbox.y + pbox.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(pbox.x + pbox.width * 0.3, pbox.y + pbox.height * 0.35, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.locator('[data-km="stage-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 2, null, { timeout: 5000 });

  await page.locator('[data-km="stage-go"]').first().click();
  await page.waitForTimeout(500);
  const settled0 = await viewOf();
  await page.locator('[data-km="stage-go"]').last().click();
  await page.waitForTimeout(80);
  const mid = await viewOf();
  await page.waitForTimeout(700);
  const settled1 = await viewOf();
  page.off('dialog', onDlg);
  await page.locator('[data-km="stage-exit"]').click();
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });
  if (settled0 === settled1) throw new Error('장이 바뀌었는데 화면이 그대로다');
  if (mid === settled1) throw new Error('중간 프레임이 벌써 목적지다 — 미끄러진 게 아니라 점프');
});
await step('SVG 로 저장하면 글자가 글자로 남는다', async () => {
  // PNG 는 확대하면 뭉갠다. SVG 의 값은 **글자가 <text> 로 살아 있는 것** — 파일 속을 열어 본다.
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.locator('[data-km="svg"]').click(),
  ]);
  if (!dl.suggestedFilename().endsWith('.svg')) throw new Error('.svg 가 아니다');
  const text = await readFile(await dl.path(), 'utf8');
  if (!text.includes('<svg')) throw new Error('SVG 가 아니다');
  if (!/<text[\s>]/.test(text)) throw new Error('글자가 <text> 로 안 남았다');
  // 화면에만 있던 자국이 그림에 찍혀 나가면 안 된다. **낱말로 찾으면 안 된다** — 인라인 CSS 규칙에
  // 같은 이름이 적혀 있어 늘 걸린다(제품이 아니라 검사가 틀린 것). 진짜로 볼 것은 **요소의 class 값**.
  for (const junk of ['ck-link-handle', 'ck-size-handle', 'ck-edge-hit', 'ck-edge-grip', 'is-selected']) {
    if (new RegExp(`class="[^"]*\b${junk}\b`).test(text)) {
      throw new Error(`화면용 자국이 그림에 남았다: ${junk}`);
    }
  }
});
await step('둥글게 놓기 — 자리가 실제로 바뀌고 아무도 안 사라진다', async () => {
  // 배치는 「눌렀더니 아무 일도 안 남」이 흔한 자리다. 자리가 **바뀌었는지**와 **개수가 그대로인지** 둘 다 본다.
  const posOf = () => page.evaluate(() => [...document.querySelectorAll('.ck-node')]
    .map((g) => g.getAttribute('transform') || '').join('|'));
  const countOf = () => page.locator('.ck-node').count();
  const before = await posOf();
  const n0 = await countOf();
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  await page.locator('[data-km="lay-circle"]').click();
  await page.waitForFunction((b) => [...document.querySelectorAll('.ck-node')]
    .map((g) => g.getAttribute('transform') || '').join('|') !== b, before, { timeout: 4000 });
  if (await countOf() !== n0) throw new Error('둥글게 놓았더니 노드 수가 달라졌다');
  // 서랍을 열어 둔 채 끝내면 **다음 검사의 클릭을 가린다**(30초 대기로 나타난다).
  await page.keyboard.press('Escape');
  // `.hidden` 은 display:none 이라 **보이기**를 기다리면 영영 안 온다 — 붙어 있음(attached)으로 본다.
  await page.waitForSelector('[data-km="drawer"].hidden', { state: 'attached', timeout: 4000 });
});
await step('글로 만들기에서 화살표 줄이 옆으로 난 관계를 만든다', async () => {
  // 들여쓰기 트리로는 「A 가 B 를 지킨다」 같은 옆줄을 못 적는다 — 화살표 줄이 그 자리를 메운다.
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  await page.locator('[data-km="from-text"]').click();
  await page.waitForSelector('[data-km="text-src"]', { timeout: 4000 });
  const edgesBefore = await page.locator('.ck-edge').count();
  await page.fill('[data-km="text-src"]', ['화살표갑', '화살표을', '화살표갑 -> 화살표을 : 지킨다'].join(String.fromCharCode(10)));
  await page.locator('[data-km="text-go"]').click();
  await page.waitForFunction((n) => document.querySelectorAll('.ck-edge').length > n, edgesBefore, { timeout: 5000 });
  const labels = await page.evaluate(() => [...document.querySelectorAll('.ck-edge-label text')].map((t) => t.textContent).join('|'));
  if (!labels.includes('지킨다')) throw new Error('화살표 줄의 이름표가 안 붙었다: ' + labels);
});
await step('Mermaid 글로 저장하면 문서에 그대로 붙는 코드블록이 나온다', async () => {
  // 값은 「파일이 나왔다」가 아니라 **붙여 넣으면 그림이 되는가**다 — 코드블록·flowchart·선까지 본다.
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.locator('[data-km="mermaid"]').click(),
  ]);
  const text = await readFile(await dl.path(), 'utf8');
  if (!text.startsWith('```mermaid')) throw new Error('코드블록으로 안 감쌌다');
  if (!text.includes('flowchart LR')) throw new Error('flowchart 선언이 없다');
  if (!/-->|---/.test(text)) throw new Error('선이 하나도 안 적혔다');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-km="drawer"].hidden', { state: 'attached', timeout: 4000 });
});
await step('연표로 놓기 — 시점 순서대로 왼쪽에서 오른쪽으로 선다', async () => {
  // 「자리가 바뀌었다」만 보면 아무 배치나 통과한다 — **작은 값이 왼쪽인지**까지 본다.
  const box = await page.locator('.km-canvas').boundingBox();
  const put = async (fx, name, when) => {
    await page.mouse.dblclick(box.x + box.width * fx, box.y + box.height * 0.2);
    await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
    await page.fill('[data-km="edit-label"]', name);
    await page.fill('[data-km="fld-new"]', '첫 등장');
    await page.locator('[data-km="fld-add"]').click();
    await page.waitForSelector('[data-km="fld-value"]', { timeout: 4000 });
    await page.locator('[data-km="fld-value"]').first().fill(when);
    await page.locator('[data-km="fld-value"]').first().blur();
  };
  await put(0.6, '나중사람', '9화');
  await put(0.25, '먼저사람', '2화');

  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  await page.locator('[data-km="lay-time"]').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const xs = await page.evaluate(() => {
    const at = (name) => {
      const g = [...document.querySelectorAll('.ck-node')].find((el) => (el.textContent || '').includes(name));
      const m = /translate\(([-0-9.]+)/.exec(g?.getAttribute('transform') || '');
      return m ? Number(m[1]) : null;
    };
    return { early: at('먼저사람'), late: at('나중사람') };
  });
  if (xs.early === null || xs.late === null) throw new Error('노드를 못 찾았다: ' + JSON.stringify(xs));
  if (!(xs.early < xs.late)) throw new Error(`시점 순서가 안 맞다: ${xs.early} / ${xs.late}`);
});
await step('새 카드는 그 종류의 칸 이름을 이미 갖고 태어난다', async () => {
  // 빈 칸에서 시작하면 무엇을 적을지 몰라 아무것도 안 적는다. 전에는 「틀 채우기」 버튼을 눌러야 했다 —
  // 그 버튼을 찾는 사람은 없다. 이제 카드가 태어날 때 그 종류의 칸 이름이 **빈 채로** 함께 온다.
  const tbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(tbox.x + tbox.width * 0.15, tbox.y + tbox.height * 0.6);
  await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
  const names = await page.locator('[data-km="fld-name"]').evaluateAll((els) => els.map((e) => e.value));
  if (names.length === 0) throw new Error('새 카드에 칸 이름이 하나도 안 왔다');
  const values = await page.locator('[data-km="fld-value"]').evaluateAll((els) => els.map((e) => e.value));
  if (values.some((v) => v.trim())) throw new Error('값까지 채워 놨다 — 지우는 일부터 시키면 안 된다');
  // 이미 다 왔으므로 「틀 채우기」 버튼은 남아 있을 이유가 없다.
  if (await page.locator('[data-km="fld-template"]').count() !== 0) throw new Error('틀 버튼이 아직 남아 있다');
});
await step('공용 글 흩기 — 글이 사라지지 않고 자리마다 사본으로 남는다', async () => {
  // 「없애기」가 빈칸을 남기면 글이 증발한 것처럼 보인다. 그래서 흩은 **뒤에** 글자가 남아 있는지를 센다.
  await page.click('[data-km="tab"][data-key="notes"]');
  await page.waitForSelector('[data-km="note-split"]', { timeout: 4000 });
  const before = await page.locator('[data-km="note-title"]').count();
  await page.locator('[data-km="note-split"]').last().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-km="note-title"]').length === n - 1,
    before,
    { timeout: 4000 }
  );
  await page.click('[data-km="tab"][data-key="node"]');
  await page.locator('.ck-node').nth(1).click();
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  const kept = await page.inputValue('[data-km="edit-doc"]');
  if (!kept.trim()) throw new Error('흩었더니 글이 빈칸이 됐다');
  // 공용이 아니게 됐으므로 「같이 쓰기」 버튼이 돌아와 있어야 한다.
  await page.waitForSelector('[data-km="edit-doc-share"]', { timeout: 4000 });
});
await step('쪽지 모양 카드는 글이 카드 안에 보인다', async () => {
  // 쪽지에 글이 안 보이면 그냥 이름표다 — 카드 안 글자를 직접 센다(카드 크기만 보면 거짓 초록).
  await page.click('.ck-node');
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  await page.fill('[data-km="edit-doc"]', '마도서는 주인을 고른다');
  await openMore(page);
  await page.selectOption('[data-km="edit-shape"]', 'note');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').includes('마도서는')),
    null,
    { timeout: 4000 }
  );
});
await step('공용 글은 맵을 건너간다 — 새 맵에서도 고를 수 있다', async () => {
  // 맵마다 복붙하면 그 순간 갈라진다. 새 맵을 만들고 **다른 맵에서 쓰던 글**이 목록에 뜨는지 본다.
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  const nbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(nbox.x + nbox.width * 0.4, nbox.y + nbox.height * 0.4);
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  const group = page.locator('[data-km="edit-doc-use"] optgroup[label="다른 맵에서 쓰던 글"]');
  if (await group.count() === 0) {
    const lib = await page.evaluate(() => localStorage.getItem('karmograph.notes'));
    throw new Error('다른 맵 글 목록이 없다 — 창고: ' + String(lib).slice(0, 200));
  }
  const optId = await group.locator('option').first().getAttribute('value');
  await page.selectOption('[data-km="edit-doc-use"]', optId);
  await page.waitForSelector('[data-km="edit-doc-unlink"]', { timeout: 4000 });
  const text = await page.inputValue('[data-km="edit-doc"]');
  if (!text.trim()) throw new Error('건너온 글이 비어 있다');
});
await step('JSON Canvas 로 내보내면 남의 도구가 읽을 모양이 나온다', async () => {
  // 나갈 문이 없으면 이 도구를 그만 쓰는 날 그림도 같이 죽는다. 파일 이름만이 아니라 **속**을 본다.
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.locator('[data-km="canvas-out"]').click(),
  ]);
  if (!dl.suggestedFilename().endsWith('.canvas')) throw new Error('.canvas 가 아니다');
  const path = await dl.path();
  const text = await readFile(path, 'utf8');
  const data = JSON.parse(text);
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) throw new Error('노드가 비었다');
  if (!data.nodes.every((n) => typeof n.type === 'string' && typeof n.x === 'number')) {
    throw new Error('JSON Canvas 모양이 아니다');
  }
  if (!data.nodes.some((n) => (n.text || '').includes('#'))) throw new Error('이름이 글로 안 접혔다');
});
await step('첫 화면이 「무엇을 만들 건가요」 세 갈래를 크게 묻는다', async () => {
  // 기능 60개를 평평히 늘어놓으면 처음 여는 사람은 아무것도 못 고른다 — 문 세 개를 먼저 연다.
  // 카드는 **옆 패널**에 있다(캔버스에 얹으면 두 번 클릭 제스처와 싸운다). 판을 채우므로 맨 뒤에서 한다.
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  await page.click('[data-km="tab"][data-key="node"]');
  const cards = page.locator('[data-km="intent"]');
  if (await cards.count() < 3) throw new Error('갈래 카드가 셋보다 적다');
  // 빈 판에서는 **묻는 말이 맨 위**여야 한다. 「고르면 여기서 고칩니다」가 먼저 오면
  // 고를 것이 하나도 없는 사람에게 첫 할 일이 아래로 밀린다.
  const leadsWithQuestion = await page.evaluate(() => {
    const side = document.querySelector('.km-side');
    const q = side?.querySelector('label');
    const hint = side?.querySelector('.km-hint');
    if (!q || !hint) return false;
    return (q.textContent || '').includes('무엇을 만들')
      && (q.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  if (!leadsWithQuestion) throw new Error('빈 판인데 「무엇을 만들 건가요」가 맨 위가 아니다');
  // 첫 화면 안내는 **한 줄에 한 가지**여야 한다 — 문장이 중간에서 끊기면 읽다 멈춘다.
  const emptyLines = await page.evaluate(() =>
    (document.querySelector('.km-empty-in')?.innerHTML || '').split('<br>').map((x) => x.replace(/<[^>]*>/g, '').trim()));
  if (emptyLines.some((ln) => ln.length > 46)) throw new Error('첫 화면 안내 줄이 너무 길다: ' + emptyLines.join(' | '));
  const box = await cards.first().boundingBox();
  if (!box || box.width < 90 || box.height < 60) throw new Error('갈래 카드가 너무 작다 — 눌릴 자리가 아니다');
  await cards.first().click();
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length >= 3, null, { timeout: 5000 });
  if (await page.locator('.ck-edge').count() === 0) throw new Error('견본에 선이 하나도 없다');

  // 갈래를 고른 **뒤**가 진짜 막히는 자리 — 다음 걸음 안내가 떠야 하고, 한 번 닫으면 안 떠야 한다.
  await page.locator('.ck-node').first().click();
  await page.click('[data-km="tab"][data-key="node"]');
  await page.locator('.km-canvas').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(400);
  const tips = page.locator('[data-km="tips-off"]');
  if (await tips.count() === 0) throw new Error('견본을 깔았는데 다음 걸음 안내가 없다');
  await tips.first().click();
  await page.waitForTimeout(400);
  if (await page.locator('[data-km="tips-off"]').count() > 0) throw new Error('닫았는데 안내가 또 뜬다');

  // 견본만 깔면 「이제 뭘 적지?」가 남는다 — 그 갈래의 **칸 이름까지 비워서** 깔려 있어야 한다.
  await page.locator('.ck-node').first().click();
  await page.waitForSelector('[data-km="fld-name"]', { timeout: 4000 });
  const names = await page.locator('[data-km="fld-name"]').evaluateAll((els) => els.map((e) => e.value));
  if (names.length === 0) throw new Error('갈래를 골랐는데 칸 틀이 안 깔렸다');
});
await step('코멘트는 여러 개 쌓이고 카드에 개수가 뜬다', async () => {
  // 설명은 「무엇인가」, 코멘트는 「보다가 든 생각」 — 한 칸에 몰면 설명이 잡담으로 더러워진다.
  const cbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(cbox.x + cbox.width * 0.15, cbox.y + cbox.height * 0.8);
  await page.waitForSelector('[data-km="cmt-new"]', { timeout: 4000 });
  await page.fill('[data-km="cmt-new"]', '여기 이름이 어색해요');
  await page.locator('[data-km="cmt-add"]').click();
  await page.waitForSelector('[data-km="cmt-del"]', { timeout: 4000 });
  await page.fill('[data-km="cmt-new"]', '두 번째 생각');
  await page.locator('[data-km="cmt-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-km="cmt-del"]').length === 2, null, { timeout: 4000 });
  // 카드만 보고도 말이 오갔음을 알아야 한다.
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').startsWith('💬2')),
    null,
    { timeout: 4000 }
  );
});
await step('발표를 SVG 한 장으로 — 브라우저만 있으면 도는 파일이 나온다', async () => {
  // 발표는 대개 남의 기계에서 열린다. 파일 이름이 아니라 **속**을 본다: 장면 목록·조작 스크립트.
  let n = 0;
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '한 장 ' + n : '').catch(() => {}); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').click();
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 1, null, { timeout: 5000 });
  await page.locator('[data-km="stage-exit"]').click();
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });
  page.off('dialog', onDlg);

  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.locator('[data-km="svg-story"]').click(),
  ]);
  if (!dl.suggestedFilename().includes('presentation')) throw new Error('발표 파일 이름이 아니다');
  const text = await readFile(await dl.path(), 'utf8');
  if (!text.includes('km-stage')) throw new Error('장면 안내가 안 들어갔다');
  if (!text.includes('ArrowRight')) throw new Error('장을 넘길 길이 없다');
  if (!/"rect":\s*\{/.test(text)) throw new Error('장면 자리가 안 실렸다');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-km="drawer"].hidden', { state: 'attached', timeout: 4000 });
});
await step('보기 전용 링크 — 손잡이가 사라지고, 「내 것으로 복제」로 풀린다', async () => {
  // 남에게 보여 줄 때 대부분은 읽히기만 하면 된다. 편집 손잡이가 남아 있으면 받는 쪽이
  // 「고쳐도 되나」부터 헷갈리고, 고쳐 놓고 원본이 바뀐 줄 안다(사실은 자기 브라우저에만 남는다).
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  let link = '';
  page.once('dialog', (d) => { link = d.message() || ''; d.accept().catch(() => {}); });
  await page.locator('[data-km="share-view"]').click();
  await page.waitForTimeout(900);
  if (!link) link = await page.evaluate(() => navigator.clipboard?.readText?.() ?? '').catch(() => '');
  if (!link || !link.includes('kmv=1')) throw new Error('보기 전용 표시가 링크에 없다: ' + String(link).slice(0, 80));

  await page.goto(link.replace(/#.*$/, '') + '#karmograph', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.km-root.is-readonly', { timeout: 8000 });
  if (await page.locator('.ck-link-handle').count() > 0) {
    const visible = await page.locator('.ck-link-handle').first().isVisible();
    if (visible) throw new Error('보기 전용인데 선 뽑는 손잡이가 보인다');
  }
  // 보기 전용이라도 **코멘트만은** 남길 수 있어야 한다 — 그 말이 없으면 공유가 일방적인 그림 던지기가 된다.
  await page.locator('.ck-node').first().click();
  await page.waitForSelector('[data-km="cmt-new"]', { timeout: 4000 });
  if (await page.locator('[data-km="cmt-new"]').isDisabled()) throw new Error('보기 전용에서 코멘트까지 잠겼다');
  if (!(await page.locator('[data-km="edit-label"]').isDisabled())) throw new Error('보기 전용인데 이름 칸이 안 잠겼다');
  await page.fill('[data-km="cmt-new"]', '받은 사람이 남기는 말');
  await page.locator('[data-km="cmt-add"]').click();
  await page.waitForSelector('[data-km="cmt-del"]', { timeout: 4000 });

  // 되돌아가는 길이 반드시 있어야 한다 — 없으면 남의 그림을 이어 그릴 방법이 사라진다.
  await page.locator('[data-km="fork"]').click();
  await page.waitForSelector('.km-root:not(.is-readonly)', { timeout: 4000 });
});
await step('꾸미기 규칙 — 「이 칸이 이 값이면 이 색」이 실제로 먹는다', async () => {
  // 규칙을 적어 놓기만 하고 색이 안 바뀌면 그건 메모지 규칙이 아니다.
  // 새 맵에서 — 앞 검사가 깔아 둔 판 위에 찍으면 새 카드가 아니라 남의 카드를 고치게 된다
  // (툴바 높이가 바뀌면 같은 비율이 딴 자리를 가리키기도 한다).
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  await page.click('[data-km="tab"][data-key="node"]');
  const rbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(rbox.x + rbox.width * 0.75, rbox.y + rbox.height * 0.35);
  await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '규칙대상');
  await page.fill('[data-km="fld-new"]', '진영');
  await page.locator('[data-km="fld-add"]').click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-km="fld-name"]')].some((i) => i.value === '진영'),
    null, { timeout: 4000 });
  // 카드는 이제 그 종류의 칸을 이미 갖고 태어난다 — 「첫 칸」이 아니라 **이름으로** 찾아야 한다.
  const at = await page.evaluate(
    () => [...document.querySelectorAll('[data-km="fld-name"]')].findIndex((i) => i.value === '진영'));
  await page.locator('[data-km="fld-value"]').nth(at).fill('마왕성');
  await page.locator('[data-km="fld-value"]').nth(at).blur();

  const strokeOf = () => page.evaluate(() => {
    const g = [...document.querySelectorAll('.ck-node')].find((el) => (el.textContent || '').includes('규칙대상'));
    return g?.querySelector('.ck-node-bg')?.getAttribute('stroke') || '';
  });
  const before = await strokeOf();

  await page.click('[data-km="tab"][data-key="filter"]');
  await page.waitForSelector('[data-km="rule-add"]', { timeout: 4000 });
  await page.selectOption('[data-km="rule-on"]', 'field');
  await page.fill('[data-km="rule-key"]', '진영');
  await page.fill('[data-km="rule-value"]', '마왕성');
  await page.locator('[data-km="rule-color"]').evaluate((el) => {
    el.value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-km="rule-add"]').click();
  await page.waitForFunction((b) => {
    const g = [...document.querySelectorAll('.ck-node')].find((el) => (el.textContent || '').includes('규칙대상'));
    const now = g?.querySelector('.ck-node-bg')?.getAttribute('stroke') || '';
    return now !== b && now !== '';
  }, before, { timeout: 4000 });
  // 규칙을 지우면 원래대로 — 못 지우는 규칙은 사람이 안 만든다.
  await page.locator('[data-km="rule-del"]').first().click();
  await page.waitForTimeout(400);
  await page.click('[data-km="tab"][data-key="node"]');
});
await step('카드를 다른 카드 위에 떨어뜨리면 이어진다', async () => {
  // 선 도구를 따로 찾게 하면 처음 쓰는 사람은 관계를 못 만든다 — 겹쳐 놓기만 해도 이어져야 한다.
  // ★ **새 맵에서** 한다. 앞 검사들이 깔아 둔 판에서는 두 번 클릭이 기존 카드 위에 떨어져
  //   「새 카드」가 아니라 남의 카드 이름을 바꾸고, 그 둘이 이미 이어져 있으면 헛 실패한다.
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  const dbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(dbox.x + dbox.width * 0.3, dbox.y + dbox.height * 0.15);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '겹갑');
  await page.mouse.dblclick(dbox.x + dbox.width * 0.62, dbox.y + dbox.height * 0.15);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '겹을');
  await page.waitForTimeout(300);

  const boxOf = (name) => page.evaluate((n) => {
    const g = [...document.querySelectorAll('.ck-node')].find((el) => (el.textContent || '').includes(n));
    const r = g?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, name);
  const from = await boxOf('겹갑');
  const to = await boxOf('겹을');
  if (!from || !to) throw new Error('겹칠 카드를 못 찾았다');

  const edgesBefore = await page.locator('.ck-edge').count();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction((n) => document.querySelectorAll('.ck-edge').length > n, edgesBefore, { timeout: 4000 });
});
await step('카드 안으로 파고들면 그 이름의 판이 열린다', async () => {
  // 한 판에 다 그리면 곧 못 읽는다 — 카드 하나를 그 안의 판으로 열어 층을 나눈다.
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  const vbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(vbox.x + vbox.width * 0.35, vbox.y + vbox.height * 0.4);
  await page.waitForSelector('[data-km="node-dive"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '마왕성');
  const mapsBefore = await page.locator('[data-km="maps"] option').count();
  await page.locator('[data-km="node-dive"]').click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-km="maps"] option').length === n + 1, mapsBefore, { timeout: 4000 });
  // 그 판이 열려 있어야 한다(빈 판 + 이름이 카드 이름).
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  const current = await page.evaluate(() => {
    const sel = document.querySelector('[data-km="maps"]');
    return sel ? sel.options[sel.selectedIndex]?.textContent || '' : '';
  });
  if (!current.includes('마왕성')) throw new Error('파고든 판이 안 열렸다: ' + current);

  // 들어가는 길만 있고 나오는 길이 없으면 층이 미로가 된다 — ⤴ 로 그 카드로 돌아와야 한다.
  await page.waitForSelector('[data-km="map-up"]:not(.hidden)', { timeout: 4000 });
  await page.locator('[data-km="map-up"]').click();
  await page.waitForSelector('.ck-node.is-selected', { timeout: 6000 });
  const back = await page.evaluate(() => document.querySelector('.ck-node.is-selected')?.textContent || '');
  if (!back.includes('마왕성')) throw new Error('돌아왔는데 그 카드가 안 골라졌다: ' + back);
});
await step('본 — 한 벌을 떠서 다른 맵에 찍는다', async () => {
  // 같은 덩어리를 판마다 다시 그리면 모양도 이름도 조금씩 갈린다. 본은 **맵을 건너**야 값이 있다.
  const sbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(sbox.x + sbox.width * 0.2, sbox.y + sbox.height * 0.7);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '본갑');
  await page.mouse.dblclick(sbox.x + sbox.width * 0.42, sbox.y + sbox.height * 0.7);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '본을');

  // Shift+드래그로 둘을 고른다.
  await page.keyboard.down('Shift');
  await page.mouse.move(sbox.x + sbox.width * 0.12, sbox.y + sbox.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(sbox.x + sbox.width * 0.62, sbox.y + sbox.height * 0.85, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForSelector('[data-km="stamp-save"]', { timeout: 4000 });
  await page.fill('[data-km="stamp-name"]', '검사용 한 벌');
  await page.locator('[data-km="stamp-save"]').click();

  // 새 맵에서 찍는다 — 창고에 남아 있어야 한다.
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  await page.locator('[data-km="stamps"]').click();
  await page.waitForSelector('[data-km="stamp-put"]', { timeout: 4000 });
  // 본 이름만 보면 「그래서 뭐가 들었더라」가 남는다 — 든 카드 이름이 함께 보여야 고를 수 있다.
  const stampText = await page.evaluate(() => document.querySelector('.km-side')?.textContent || '');
  if (!stampText.includes('본갑')) throw new Error('본 목록에 든 카드 이름이 안 보인다');
  await page.locator('[data-km="stamp-put"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length >= 2, null, { timeout: 4000 });
  const names = await page.evaluate(() => [...document.querySelectorAll('.ck-node text')].map((t) => t.textContent).join('|'));
  if (!names.includes('본갑') || !names.includes('본을')) throw new Error('찍은 본에 이름이 안 따라왔다: ' + names);
});
await step('맵 새로 만들기 → 빈 캔버스', async () => {
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
});
await step('PNG 내보내기가 파일을 만든다', async () => {
  // 새 맵은 비어 있으니 먼저 맵을 되돌린다.
  const ids = await page.locator('[data-km="maps"] option').evaluateAll((os) => os.map((o) => o.value));
  await page.selectOption('[data-km="maps"]', ids[0]);
  await page.waitForSelector('.ck-node', { timeout: 4000 });
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('[data-km="png"]'),
  ]);
  if (!download.suggestedFilename().endsWith('.png')) throw new Error('png 아님');
});

await step('「이 카드로 오는 링크」로 열면 그 카드가 골라져 있다', async () => {
  // 큰 그림을 보내면 받는 쪽은 어디를 보라는 건지 모른다 — 링크가 그 자리까지 데려가야 한다.
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
  const abox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(abox.x + abox.width * 0.3, abox.y + abox.height * 0.3);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '가리킨카드');
  // 링크는 **만들자마자 골라져 있는 그 카드**로 뽑는다 — 다시 고르러 가면 「어느 카드가 골렸나」에
  // 기대게 되고, 그 기대가 틀리면 검사가 엉뚱한 카드를 가리킨다(실제로 그렇게 한 번 틀렸다).
  await page.waitForSelector('[data-km="node-link"]', { timeout: 4000 });
  let link = '';
  page.once('dialog', (d) => { link = d.message() || ''; d.accept().catch(() => {}); });
  await page.locator('[data-km="node-link"]').click();
  await page.waitForTimeout(900);
  if (!link) link = await page.evaluate(() => navigator.clipboard?.readText?.() ?? '').catch(() => '');
  if (!link.includes('kmnode=')) throw new Error('링크에 카드 표시가 없다: ' + String(link).slice(0, 60));

  await page.goto(link.replace(/#.*$/, '') + '#karmograph', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ck-node.is-selected', { timeout: 8000 });
  const picked = await page.evaluate(() => document.querySelector('.ck-node.is-selected')?.textContent || '');
  if (!picked.includes('가리킨카드')) throw new Error('링크가 가리킨 카드가 안 골라졌다: ' + picked);
  // 둘째 카드는 링크를 뽑은 **뒤에** 놓는다(가리킨 카드가 화면에서 혼자가 아니어야 「맞춰 보기」가 뜻이 산다).
  // 보기 전용으로 열리므로 이어 그리려면 복제 — 다음 검사들을 위해 풀어 둔다.
  const fork = page.locator('[data-km="fork"]');
  if (await fork.count() > 0) await fork.click();
  await page.waitForSelector('.km-root:not(.is-readonly)', { timeout: 4000 });
});
await step('「전체 보기」를 누르면 카드가 한 장도 화면 밖에 안 남는다', async () => {
  // 예전엔 왼쪽 위에 붙였다 — 판이 옆으로 넓으면 배율이 가로에 걸려 세로가 남고, 그 남은
  // 자리가 전부 아래에 뭉쳤다(실측 2026-08-12, 40장짜리 판: 그림이 화면 위쪽 40% 에만 몰렸다).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  // 옆으로 넓은 판을 하나 심는다 — 세로가 남는 상황을 만들어야 이 검사가 뜻이 있다.
  // ★ **먼저 저장본을 비운다.** 남아 있던 판(닻·흘러가는 카드 포함)이 섞이면 판 전체 범위가
  //   엉뚱하게 커져 배율이 최저치(0.1)로 눌린다 — 그러면 이 검사가 딴 것을 재게 된다.
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      id: 'w' + i, label: '가' + i, kind: 'character', x: 100 + i * 260, y: 100 + (i % 2) * 90, w: 180, h: 44,
    }));
    const spec = { version: 1, _meta: {}, groups: [], nodes, edges: [], ephemeral_anchors: [], _edge_kinds: {} };
    const idx = JSON.parse(localStorage.getItem('karmograph.index') || 'null');
    const id = idx?.activeId || 'wide';
    localStorage.setItem('karmograph.map.' + id, JSON.stringify(spec));
    if (!idx) localStorage.setItem('karmograph.index', JSON.stringify({ activeId: id, maps: [{ id, name: '넓은 판' }] }));
  });
  await m.reload({ waitUntil: 'domcontentloaded' });
  // ★ **딱 12장이 될 때까지** 기다린다. 「하나라도 보이면」으로 두면 견본이 함께 깔린 판을
  //    재다가 엉뚱한 수치가 나온다(실측: 배율이 최저치로 눌려 위 38·아래 744 로 읽혔다).
  await m.waitForFunction(() => document.querySelectorAll('.ck-node').length === 12, null, { timeout: 8000 });
  await m.click('[data-km="fit"]');
  await m.waitForTimeout(500);

  const gap = await m.evaluate(() => {
    const c = document.querySelector('.km-canvas').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.ck-node')].map((n) => n.getBoundingClientRect());
    const top = Math.min(...boxes.map((b) => b.top)) - c.top;
    const bottom = c.bottom - Math.max(...boxes.map((b) => b.bottom));
    const g = [...document.querySelectorAll('.km-canvas svg g')]
      .find((el) => (el.getAttribute('transform') || '').startsWith('matrix('));
    return { top: Math.round(top), bottom: Math.round(bottom), h: Math.round(c.height),
      n: boxes.length, m: g?.getAttribute('transform') };
  });
  /* ★ 여기서는 **다 보이는가**만 본다. 「가운데인가」는 셈(`cameraForRect`)의 몫이라
     `test-karmograph-core.mjs` 에서 못 박았다 — 화면 쪽에서 가운데를 재려 했더니 다른 검사들이
     남긴 상태에 따라 판 전체 범위가 달라져(배율이 최저치로 눌렸다) 재는 것이 흔들렸다.
     흔들리는 검사는 빨강이 나도 못 믿는다(2026-08-12). */
  if (gap.top < -2 || gap.bottom < -2) {
    throw new Error(`「전체 보기」인데 카드가 화면 밖으로 나갔다 — 위 ${gap.top}px · 아래 ${gap.bottom}px `
      + `(판 ${gap.h}px · 카드 ${gap.n}장 · ${gap.m})`);
  }
  await ctx.close();
});

await step('여럿 골라 나란히 놓기 — 왼쪽 맞춤이 실제로 한 줄로 세운다', async () => {
  /* 셈(`tidy.ts`)은 알맹이 시험이 본다. 여기서 볼 것은 **그 셈이 화면에 이어져 있나**다 —
     단추는 있는데 아무 일도 안 일어나는 부류가 제일 오래 안 들킨다. */
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => {
    const nodes = [
      { id: 'q1', label: '가', kind: 'character', x: 120, y: 100, w: 160, h: 44 },
      { id: 'q2', label: '나', kind: 'character', x: 320, y: 240, w: 160, h: 44 },
      { id: 'q3', label: '다', kind: 'character', x: 220, y: 380, w: 160, h: 44 },
    ];
    const spec = { version: 1, _meta: {}, groups: [], nodes, edges: [], ephemeral_anchors: [], _edge_kinds: {} };
    const idx = JSON.parse(localStorage.getItem('karmograph.index') || 'null');
    const id = idx?.activeId || 'align';
    localStorage.setItem('karmograph.map.' + id, JSON.stringify(spec));
    if (!idx) localStorage.setItem('karmograph.index', JSON.stringify({ activeId: id, maps: [{ id, name: '맞춤 판' }] }));
  });
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForFunction(() => document.querySelectorAll('.ck-node').length === 3, null, { timeout: 8000 });

  /* Ctrl+A 로도 전부 골라져야 한다 — 넓은 판에서 Shift+드래그 하나뿐이면 고르는 것부터 일이다. */
  await m.locator('.km-canvas').click({ position: { x: 24, y: 24 } });
  await m.keyboard.press('Control+a');
  await m.waitForTimeout(400);
  if (await m.locator('.ck-node.is-selected').count() !== 3) throw new Error('Ctrl+A 로 전부 안 골라진다');

  const cv = await m.locator('.km-canvas').boundingBox();
  await m.keyboard.down('Shift');
  await m.mouse.move(cv.x + 12, cv.y + 12);
  await m.mouse.down();
  await m.mouse.move(cv.x + cv.width - 12, cv.y + cv.height - 12, { steps: 8 });
  await m.mouse.up();
  await m.keyboard.up('Shift');
  await m.waitForSelector('[data-km="al"][data-how="left"]', { timeout: 4000 });

  await m.locator('[data-km="al"][data-how="left"]').click();
  await m.waitForTimeout(600);
  const xs = await m.evaluate(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId
  )).nodes.map((n) => n.x));
  if (new Set(xs).size !== 1) throw new Error('왼쪽 맞춤을 눌렀는데 x 가 안 맞는다: ' + xs.join(','));
  if (xs[0] !== 120) throw new Error('가장 왼쪽(120)이 기준이어야 한다: ' + xs[0]);
  await ctx.close();
});

await step('큰 판에서도 끄는 손이 무겁지 않다 (300장)', async () => {
  /* ★ **페이지 안에서** 잰다. 예전에 Playwright 로 마우스를 움직여 재 봤더니 600장에서
     42ms/걸음이 나왔는데, 그 대부분이 브라우저 왕복이었다 — 같은 판을 안에서 재면 0.84ms 다
     (실측 2026-08-12). 재는 자리가 틀리면 없는 병목을 쫓는다.
     여기서 지키려는 것: 카드가 늘 때 끌기 비용이 **터지지 않는다**(O(n²) 방지). */
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => {
    const N = 300;
    const nodes = Array.from({ length: N }, (_, i) => ({
      id: 'p' + i, label: '인물' + i, kind: 'character',
      x: 80 + (i % 20) * 230, y: 80 + Math.floor(i / 20) * 140, w: 180, h: 44,
    }));
    const edges = [];
    for (let i = 1; i < N; i += 1) edges.push({ id: 'pe' + i, from: 'p' + (i % 23), to: 'p' + i, kind: 'relates' });
    const spec = { version: 1, _meta: {}, groups: [], nodes, edges, ephemeral_anchors: [], _edge_kinds: {} };
    const idx = JSON.parse(localStorage.getItem('karmograph.index') || 'null');
    const id = idx?.activeId || 'perf';
    localStorage.setItem('karmograph.map.' + id, JSON.stringify(spec));
    if (!idx) localStorage.setItem('karmograph.index', JSON.stringify({ activeId: id, maps: [{ id, name: '큰 판' }] }));
  });
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForFunction(() => document.querySelectorAll('.ck-node').length === 300, null, { timeout: 20000 });

  const per = await m.evaluate(() => {
    const node = document.querySelector('.ck-node');
    const r = node.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: cx, clientY: cy, pointerId: 1, button: 0, buttons: 1, isPrimary: true }));
    const t0 = performance.now();
    for (let i = 1; i <= 30; i += 1) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: cx + i * 4, clientY: cy + i * 2, pointerId: 1, buttons: 1, isPrimary: true }));
    }
    const took = performance.now() - t0;
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, clientX: cx + 120, clientY: cy + 60, pointerId: 1, isPrimary: true }));
    return took / 30;
  });
  // 로컬 실측 0.3~0.9ms. CI 기계는 느리므로 넉넉히 — 잡으려는 것은 「몇 배로 터졌나」다.
  if (per > 5) throw new Error(`300장에서 끌기 한 번에 ${per.toFixed(2)}ms — 너무 무겁다(상한 5ms)`);
  await ctx.close();
});

await step('보이는 단추는 전부 **실제로 눌리는 자리**에 있다', async () => {
  /* 발표 줄 사고(캔버스가 단추를 덮고 있는데 검사는 초록)를 한 번 더 당하지 않으려고,
     상태마다 보이는 단추를 훑어 **그 한가운데를 찍으면 그 단추가 잡히는지** 본다.
     항목마다 눌러 보는 검사와 다르다 — 이건 「덮였나」만 싼값에 전수로 본다. */
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-root', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-root', { timeout: 8000 });

  const covered = async (label) => m.evaluate((where) => {
    const bad = [];
    for (const el of document.querySelectorAll('.km-root button, .km-root [data-km="tab"]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;                       // 안 보이는 것은 건너뛴다
      if (el.closest('.hidden')) continue;                              // 접혀 있는 묶음 안도 건너뛴다
      /* 제 안에서 구르는 상자(서랍·옆 패널) 안에서 **스크롤 밖으로 나간 것**은 건너뛴다 —
         그건 덮인 게 아니라 굴려서 보는 것이다(굴리면 눌린다). */
      let box = el.parentElement;
      let clipped = false;
      while (box && box !== document.body) {
        const ov = getComputedStyle(box).overflowY;
        if (ov === 'auto' || ov === 'scroll') {
          const br = box.getBoundingClientRect();
          const cy2 = r.y + r.height / 2;
          if (cy2 < br.top || cy2 > br.bottom) clipped = true;
          break;
        }
        box = box.parentElement;
      }
      if (clipped) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && (top === el || el.contains(top) || top.contains(el))) continue;
      bad.push(`${where}:${el.dataset.km || (el.textContent || '').trim().slice(0, 8)}`
        + `←${top ? (top.tagName + '.' + String(top.getAttribute('class') || '').slice(0, 14)) : '없음'}`);
    }
    return bad;
  }, label);

  // 첫 그림이 자리를 잡기 전에 재면 아직 안 놓인 것들이 「덮였다」로 나온다.
  await m.waitForTimeout(900);
  const found = [];
  found.push(...await covered('첫화면'));
  const intent = await m.$('.km-intent button');
  if (intent) { await intent.click(); await m.waitForTimeout(900); }
  found.push(...await covered('견본'));
  await m.locator('.ck-node').first().click();
  await m.waitForTimeout(400);
  found.push(...await covered('고른뒤'));
  await m.locator('[data-km="more"]').click();
  await m.waitForTimeout(300);
  found.push(...await covered('서랍'));
  await m.keyboard.press('Escape');
  await m.locator('[data-km="story"]').click();
  await m.waitForTimeout(600);
  found.push(...await covered('발표'));

  if (found.length > 0) throw new Error('덮여서 못 누르는 단추: ' + found.slice(0, 6).join(' · '));
  await ctx.close();
});

await step('카드를 두 번 누르면 이름을 그 자리에서 고친다 (Enter 저장 · Esc 되돌리기)', async () => {
  // 옆 패널까지 가야 이름을 고칠 수 있으면 보는 자리와 고치는 자리가 갈린다 (TASK-KL-235).
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();
  await m.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await m.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await m.fill('[data-km="edit-label"]', '고칠카드');
  await m.waitForFunction(() => [...document.querySelectorAll('.ck-node text')]
    .some((t) => (t.textContent || '').includes('고칠카드')), null, { timeout: 4000 });

  const labels = () => m.evaluate(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId)).nodes.map((n) => n.label));

  await m.locator('.ck-node').first().dblclick();
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.press('Control+a');
  await m.keyboard.type('그자리이름');
  await m.keyboard.press('Enter');
  await m.waitForTimeout(500);
  if (!(await labels()).includes('그자리이름')) throw new Error('그 자리에서 고친 이름이 저장본에 없다');
  if (await m.locator('.km-inline').count() !== 0) throw new Error('Enter 를 눌렀는데 편집칸이 안 닫힌다');

  await m.locator('.ck-node').first().dblclick();
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.press('Control+a');
  await m.keyboard.type('버릴이름');
  await m.keyboard.press('Escape');
  await m.waitForTimeout(400);
  const after = await labels();
  if (after.includes('버릴이름')) throw new Error('Esc 로 되돌렸는데 저장됐다: ' + after.join(','));
  if (!after.includes('그자리이름')) throw new Error('Esc 가 원래 이름까지 지웠다: ' + after.join(','));
  await ctx.close();
});

await step('카드를 끌면 이웃 카드의 줄에 붙고, 맞춘 줄이 뜬다', async () => {
  // 격자(8px)는 「대충 맞음」까지다. 폭이 제각각이면 가운데는 격자 위에 없어 영원히 안 맞는다 (TASK-KL-237).
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();
  // 카드를 만들면 이름칸이 **다음 프레임에** 카드를 덮으며 뜬다 — 뜬 것을 보고 닫아야 한다
  // (바로 Escape 를 치면 아직 없어서 그대로 남고, 그 뒤 누르기가 전부 그 칸에 먹힌다).
  const shutInline = async () => {
    await m.waitForSelector('.km-inline', { timeout: 4000 }).catch(() => {});
    await m.keyboard.press('Escape');
    await m.waitForFunction(() => !document.querySelector('.km-inline'), null, { timeout: 4000 }).catch(() => {});
  };
  await m.mouse.dblclick(box.x + box.width * 0.35, box.y + box.height * 0.3);
  await shutInline();
  await m.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.85);
  // 두 번 누르기의 첫 눌림이 「고른 것 풀기」로 먹히는 판이 있다 — 한 번은 다시 눌러 본다.
  const two = () => m.locator('.ck-node').count().then((n) => n >= 2);
  // 판 아래쪽에 만들면 카드가 화면 맨 밑(떠 있는 것들 아래)으로 가 안 잡힌다 — 위쪽에 만든다.
  await m.mouse.dblclick(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await shutInline();
  await m.waitForTimeout(400);
  // 두 번 누르기의 첫 눌림이 「고른 것 풀기」로 먹히는 판이 있다 — 다시 누르면 **이름칸도 다시 뜬다**.
  if (!(await two())) { await m.mouse.dblclick(box.x + box.width * 0.55, box.y + box.height * 0.45); await shutInline(); }
  try {
    await m.waitForFunction(() => document.querySelectorAll('.ck-node').length >= 2, null, { timeout: 4000 });
  } catch {
    const why = await m.evaluate(() => ({
      nodes: document.querySelectorAll('.ck-node').length,
      focus: document.activeElement?.tagName + '|' + (document.activeElement?.dataset?.km ?? ''),
      inline: document.querySelectorAll('.km-inline').length,
      overlay: (document.elementFromPoint(innerWidth * 0.4, innerHeight * 0.6)?.className ?? '') + '',
    }));
    throw new Error('둘째 카드가 안 생겼다: ' + JSON.stringify(why));
  }

  const coords = () => m.evaluate(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId))
    .nodes.map((n) => n.x));

  const [x0, x1] = await coords();
  // 카드를 만들면 옆 패널이 열리며 **판이 좁아진다** — 자리를 재고 바로 안 누르면 그 사이에 어긋난다.
  await m.waitForTimeout(700);
  const second = (await m.locator('.ck-node').nth(1).boundingBox());
  const first = (await m.locator('.ck-node').first().boundingBox());
  // 누르는 자리는 **카드 한가운데** — 모서리 근처는 판이 조금만 움직여도 빗나간다.
  // 옆 패널이 열리고 닫히는 동안 판 너비가 바뀌므로, **잡기 직전에 다시 재고** 확인한다.
  let second2 = second;
  let grab = { x: 0, y: 0 };
  let onNode = false;
  for (let i = 0; i < 3 && !onNode; i += 1) {
    second2 = await m.locator('.ck-node').nth(1).boundingBox();
    grab = { x: second2.x + second2.width / 2, y: second2.y + second2.height / 2 };
    onNode = await m.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('.ck-node')), [grab.x, grab.y]);
    if (!onNode) await m.waitForTimeout(400);
  }
  if (!onNode) {
    const why = await m.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      const cv = document.querySelector('.km-canvas').getBoundingClientRect();
      return {
        at: el ? el.tagName + '|' + String(el.getAttribute('class') || el.getAttribute('data-km') || '').slice(0, 24) : 'none',
        point: [Math.round(x), Math.round(y)],
        canvas: [Math.round(cv.x), Math.round(cv.y), Math.round(cv.width), Math.round(cv.height)],
        inline: document.querySelectorAll('.km-inline').length,
        nodes: [...document.querySelectorAll('.ck-node')].map((n) => {
          const b = n.getBoundingClientRect();
          return [Math.round(b.x), Math.round(b.y), Math.round(b.width)];
        }),
      };
    }, [grab.x, grab.y]);
    throw new Error('세 번 다시 재도 카드 위가 아니다: ' + JSON.stringify(why));
  }
  // 둘째 카드를 첫째 카드의 왼쪽 줄 **근처**(몇 px 어긋나게)로 끈다 — 붙어야 정확히 같은 줄이 된다.
  const offBy = 5;
  await m.mouse.move(grab.x, grab.y);
  await m.mouse.down();
  await m.mouse.move(grab.x + (first.x - second2.x) + offBy, grab.y, { steps: 10 });
  // 줄은 **다음 프레임**에 그려진다(프레임당 한 번만 다시 그린다) — 바로 세면 0 이 나온다.
  // ★ `waitForSelector` 의 「보인다」로 세면 안 된다: 세로선은 **폭이 0** 이라 안 보이는 것으로 친다(실측).
  const guides = await m.waitForFunction(() => document.querySelectorAll('.ck-guide').length,
    null, { timeout: 2000 }).then(() => 1).catch(() => 0);
  await m.mouse.up();
  await m.waitForTimeout(500);

  if (guides < 1) {
    const st = await m.evaluate(() => ({
      nodes: [...document.querySelectorAll('.ck-node')].map((g) => g.getAttribute('transform')),
      groupLayerKids: document.querySelector('.ck-groups')?.childElementCount ?? -1,
    }));
    throw new Error('끄는 동안 맞춤 줄이 안 뜬다: ' + JSON.stringify(st));
  }
  const after = await coords();
  if (after[1] !== after[0]) throw new Error(`줄에 안 붙었다: ${after[0]} vs ${after[1]} (끌기 전 ${x0}/${x1})`);
  if (await m.locator('.ck-guide').count() !== 0) throw new Error('손을 뗐는데 맞춤 줄이 남아 있다');
  await ctx.close();
});

await step('카드 크기가 자리와 같은 격자에 붙는다 (Alt = 자유)', async () => {
  // 자리는 8px 에 붙는데 크기만 1px 자유면 오른쪽 줄이 매번 어긋난다 (TASK-KL-236).
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();
  // 판 아래쪽에 만들면 손잡이가 화면 맨 밑(떠 있는 것들 아래)으로 가 안 잡힌다 — 가운데 위쪽에 만든다.
  await m.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.3);
  // 카드를 만들면 **그 자리에서 이름부터 받는다** — 그 칸이 카드를 덮으므로 이름을 넣고 닫는다.
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.type('크기잴카드');
  await m.keyboard.press('Enter');
  await m.waitForFunction(() => !document.querySelector('.km-inline'), null, { timeout: 4000 });
  await m.locator('.ck-node').first().click();
  const grip = () => m.waitForSelector('.ck-size-handle', { state: 'attached', timeout: 2500 });
  await grip().catch(async () => { await m.locator('.ck-node').first().click(); await grip(); });

  const sizes = () => m.evaluate(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId))
    .nodes.map((n) => [n.w, n.h]));

  const drag = async (dx, dy, alt) => {
    await m.waitForTimeout(250);   // 갓 그려진 손잡이는 자리를 한 번 더 잡는다
    const grip = await m.locator('.ck-size-handle').first().boundingBox();
    await m.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await m.mouse.down();
    if (alt) await m.keyboard.down('Alt');
    await m.mouse.move(grip.x + grip.width / 2 + dx, grip.y + grip.height / 2 + dy, { steps: 8 });
    await m.mouse.up();
    if (alt) await m.keyboard.up('Alt');
    await m.waitForTimeout(400);
  };

  /** 저장은 조금 늦게 떨어진다 — 「바뀔 때까지」 본다(고정 대기는 판마다 다른 답을 낸다). */
  const widthChangedFrom = async (w0) => m.waitForFunction((prev) => {
    const idx = JSON.parse(localStorage.getItem('karmograph.index'));
    return JSON.parse(localStorage.getItem('karmograph.map.' + idx.activeId)).nodes[0].w !== prev;
  }, w0, { timeout: 3000 }).then(() => true).catch(() => false);

  const before = (await sizes())[0][0];
  await drag(37, 21, false);
  // 손잡이를 못 잡았는데 「격자에 안 붙었다」로 읽으면 엉뚱한 데를 판다 — 갈라서 말한다.
  if (!(await widthChangedFrom(before))) {
    const g = await m.locator('.ck-size-handle').first().boundingBox().catch(() => null);
    const at = g ? await m.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.tagName + '|' + el.getAttribute('class') : 'none';
    }, [g.x + g.width / 2, g.y + g.height / 2]) : '손잡이없음';
    const live = await m.evaluate(() => document.querySelector('.ck-node rect')?.getAttribute('width'));
    throw new Error(`크기가 안 바뀌었다 (저장 ${before} · 화면 ${live} · 손잡이 ${JSON.stringify(g)} · 그 자리엔 ${at})`);
  }
  const [w1, h1] = (await sizes())[0];
  if (w1 % 8 !== 0 || h1 % 8 !== 0) throw new Error(`크기가 격자에 안 붙었다: ${w1}x${h1}`);

  await drag(11, 0, true);   // Alt = 격자 무시 — 8의 배수에서 벗어날 수 있어야 한다
  await widthChangedFrom(w1);
  const [w2] = (await sizes())[0];
  if (w2 === w1) throw new Error('Alt 로 끌었는데 크기가 그대로다');
  if (w2 % 8 === 0) throw new Error(`Alt 인데도 격자에 붙었다: ${w2}`);
  await ctx.close();
});

await step('되돌리기 구멍 감사 — 고친 것마다 Ctrl+Z 로 원래대로 (크기·자리·이름·나란히)', async () => {
  // 「고칠 수 있다」와 「되돌릴 수 있다」는 따로 논다. 새 편집 기능을 넣을 때마다 되돌리기에
  // 걸었는지 **한자리에서 전수로** 본다 — 항목이 늘면 여기 한 줄만 는다.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });

  const box = await m.locator('.km-canvas').boundingBox();
  for (const [fx, fy] of [[0.3, 0.3], [0.6, 0.65]]) {
    await m.mouse.dblclick(box.x + box.width * fx, box.y + box.height * fy);
    await m.waitForTimeout(500);
    await m.keyboard.press('Escape');
    await m.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.15);
  }
  await m.waitForFunction(() => document.querySelectorAll('.ck-node').length >= 2, null, { timeout: 6000 });

  /** 저장본의 알맹이 — 자리·크기·이름만 본다(고른 카드 같은 화면 상태는 되돌리기 대상이 아니다). */
  const shot = () => m.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId))
    .nodes.map((n) => [n.id, n.x, n.y, n.w, n.h, n.label])));

  const holes = [];
  const round = async (name, act) => {
    const before = await shot();
    await act();
    await m.waitForTimeout(700);
    if (await shot() === before) { holes.push(name + ': 고쳐지지도 않았다'); return; }
    await m.keyboard.press('Control+z');
    await m.waitForTimeout(700);
    if (await shot() !== before) holes.push(name + ': Ctrl+Z 로 안 돌아온다');
  };

  await round('크기', async () => {
    await m.locator('.ck-node').first().click();
    await m.waitForSelector('.ck-size-handle', { timeout: 4000 });
    const grip = await m.locator('.ck-size-handle').first().boundingBox();
    await m.mouse.move(grip.x + 5, grip.y + 5);
    await m.mouse.down();
    await m.mouse.move(grip.x + 85, grip.y + 45, { steps: 6 });
    await m.mouse.up();
  });

  await round('자리', async () => {
    const n = await m.locator('.ck-node').first().boundingBox();
    await m.mouse.move(n.x + 25, n.y + 12);
    await m.mouse.down();
    await m.mouse.move(n.x + 25, n.y + 170, { steps: 8 });
    await m.mouse.up();
  });

  await round('이름', async () => {
    await m.locator('.ck-node').first().dblclick();
    await m.waitForSelector('.km-inline', { timeout: 4000 });
    await m.keyboard.press('Control+a');
    await m.keyboard.type('되돌릴이름');
    await m.keyboard.press('Enter');
  });

  await round('나란히 놓기', async () => {
    await m.locator('.km-canvas').click({ position: { x: 8, y: 8 } });
    await m.keyboard.press('Control+a');
    await m.waitForSelector('[data-km="al"]', { timeout: 4000 });
    await m.locator('[data-km="al"][data-how="left"]').click();
  });

  if (holes.length > 0) throw new Error('되돌리기 구멍: ' + holes.join(' · '));
  await ctx.close();
});

await step('카드를 만들면 **그 자리에서 바로** 이름을 친다 (옆 패널 안 봐도 된다)', async () => {
  // 처음 쓰는 사람 검토에서 나온 자리(2026-08-12): 두 번 눌러 만든 카드가 **빈 상자**로 남았다.
  // 포커스는 옆 패널 이름칸에 있었는데 눈은 판을 보고 있었기 때문이다.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });

  const box = await m.locator('.km-canvas').boundingBox();
  await m.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.4);
  // 만들자마자 **카드 위에** 이름칸이 떠 있어야 한다 — 옆 패널은 안 건드린다.
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.type('바로친이름');
  await m.keyboard.press('Enter');
  await m.waitForFunction(() => [...document.querySelectorAll('.ck-node text')]
    .some((t) => (t.textContent || '').includes('바로친이름')), null, { timeout: 4000 });
  const saved = await m.evaluate(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId)).nodes[0].label);
  if (saved !== '바로친이름') throw new Error(`저장본 이름이 다르다: ${JSON.stringify(saved)}`);

  // 그리고 **포커스가 판으로 돌아와야** 한다 — 안 그러면 `?`(도움말)가 이름에 「?」로 박힌다(실측).
  await m.keyboard.press('?');
  await m.waitForSelector('[data-km="help-close"]', { timeout: 4000 });
  const stillName = await m.evaluate(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId)).nodes[0].label);
  if (stillName !== '바로친이름') throw new Error(`? 가 이름에 박혔다: ${JSON.stringify(stillName)}`);
  await ctx.close();
});

await step('옆 패널이 첫 카드부터 다 펼쳐지지 않는다 (꾸미는 칸은 접혀 있다)', async () => {
  // 사용자 검토(2026-08-12): 한 줄 적으려는데 칸 열다섯이 한꺼번에 열렸다.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();
  await m.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.type('첫카드');
  await m.keyboard.press('Enter');
  await m.waitForTimeout(400);

  // 접혀 있을 때: 꾸미는 칸은 **아예 없다**(감춘 것이 아니라 안 그린다 — 덮인 단추를 안 만든다).
  if (await m.locator('[data-km="edit-shape"]').count() !== 0) throw new Error('모양 칸이 처음부터 펼쳐져 있다');
  const fields = await m.locator('.km-side .km-field').count();
  if (fields > 7) throw new Error(`첫 카드인데 칸이 ${fields}개 열려 있다`);

  // 펼치면 나온다. 그리고 실제로 **먹는다**(그리기만 하고 안 붙은 배선은 없는 것과 같다).
  await m.locator('[data-km="more-toggle"]').click();
  await m.waitForSelector('[data-km="edit-shape"]', { timeout: 4000 });
  await m.selectOption('[data-km="edit-shape"]', 'note');
  await m.waitForFunction(() => JSON.parse(localStorage.getItem(
    'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId))
    .nodes[0].shape === 'note', null, { timeout: 4000 });

  // 꾸며 둔 카드는 다음에 열 때 **펼쳐진 채**여야 한다 — 접힌 자리에 내가 한 것이 숨으면 잃어버린 것이다.
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.locator('.ck-node').first().click();
  await m.waitForSelector('[data-km="edit-shape"]', { timeout: 4000 });
  await ctx.close();
});

await step('처음 저장될 때 **어디에** 저장됐는지 말해 준다', async () => {
  // 사용자 검토(2026-08-12): 「저장됨」만 떠서, 방문기록을 지우면 사라진다는 걸 모른 채 쓰게 된다.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();
  await m.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.type('저장확인');
  await m.keyboard.press('Enter');
  const said = await m.waitForFunction(() => {
    const el = document.querySelector('[data-km="saved"]');
    return el && !el.classList.contains('hidden') ? el.textContent : null;
  }, null, { timeout: 4000 }).then((h) => h.jsonValue()).catch(() => '');
  if (!/브라우저|browser|ブラウザ/.test(String(said))) throw new Error(`저장 표시가 자리를 안 말한다: ${said}`);
  await ctx.close();
});

await step('첫 카드를 만든 뒤에도 **다음 걸음**이 한 줄 남는다 (다 익히면 사라진다)', async () => {
  // 사용자 검토(2026-08-12): 빈 판에는 안내가 있는데 카드를 하나 만드는 순간 통째로 사라졌다.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();

  const make = async (fx, fy, name) => {
    await m.mouse.dblclick(box.x + box.width * fx, box.y + box.height * fy);
    await m.waitForSelector('.km-inline', { timeout: 4000 });
    await m.keyboard.type(name);
    await m.keyboard.press('Enter');
    await m.waitForFunction(() => !document.querySelector('.km-inline'), null, { timeout: 4000 });
  };

  await make(0.3, 0.25, '가');
  await m.waitForSelector('.km-next', { state: 'attached', timeout: 4000 });
  const one = await m.locator('.km-next').textContent();
  if (!/하나 더|more card|もう1枚/.test(one)) throw new Error(`첫 장 다음 안내가 이상하다: ${one}`);

  await make(0.62, 0.55, '나');
  await m.waitForFunction(() => /이어|connect|つない/.test(document.querySelector('.km-next')?.textContent || ''),
    null, { timeout: 4000 });

  // 선을 그으면 **스스로 사라진다** — 다 배운 사람에게 계속 남으면 그건 잔소리다.
  await m.evaluate(() => {
    const key = 'karmograph.map.' + JSON.parse(localStorage.getItem('karmograph.index')).activeId;
    const spec = JSON.parse(localStorage.getItem(key));
    spec.edges.push({ id: 'edge-1', from: spec.nodes[0].id, to: spec.nodes[1].id, kind: spec.edges[0]?.kind || '' });
    localStorage.setItem(key, JSON.stringify(spec));
  });
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.waitForTimeout(900);
  if (await m.locator('.km-next').count() !== 0) throw new Error('선을 이었는데도 다음 걸음 안내가 남아 있다');
  await ctx.close();
});

await step('되돌리기 단추가 **무엇을** 되돌리는지 말하고, 판 이름은 이름 옆에서 바꾼다', async () => {
  // 사용자 검토(2026-08-12): 화살표만 있으면 무엇이 되돌아가는지 모른 채 눌러야 한다 — 그래서 안 누른다.
  // 판 이름 바꾸기는 ⋯ 서랍 안에만 있어 이름을 보면서는 못 찾았다.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const m = await ctx.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  const box = await m.locator('.km-canvas').boundingBox();
  await m.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await m.waitForSelector('.km-inline', { timeout: 4000 });
  await m.keyboard.type('되돌릴카드');
  await m.keyboard.press('Enter');
  await m.waitForFunction(() => {
    const el = document.querySelector('[data-km="undo"]');
    return el && !el.disabled && /:/.test(el.title || '');
  }, null, { timeout: 5000 });
  const tip = await m.locator('[data-km="undo"]').getAttribute('title');
  if (!/이름|만들기|고침|rename|add|edit/.test(String(tip))) throw new Error(`되돌리기 단추가 대상을 안 말한다: ${tip}`);

  // 판 이름 바꾸기 — 이름 옆 ✎ 가 서랍의 그것과 **같은 길**이어야 한다.
  m.once('dialog', (d) => d.accept('바뀐 판 이름'));
  await m.locator('[data-km="map-rename2"]').click();
  await m.waitForFunction(() => [...document.querySelectorAll('[data-km="maps"] option')]
    .some((o) => o.textContent.includes('바뀐 판 이름')), null, { timeout: 4000 });
  await ctx.close();
});

// ── 폰 화면 ──────────────────────────────────────────────────────────────────
// 관계도는 **보는 일**이 폰에서 훨씬 많다(링크 받아 열기). 그런데 지금까지 폰 크기는 한 번도 안 봤다.
await step('폰 첫 화면 — 안내가 시트에 안 잘리고, 툴바에 「더 있다」 표시가 뜬다', async () => {
  // 사용자 검토(2026-08-12): 폰 첫 화면에서 안내 넉 줄이 아래 시트와 겹쳐 문장 중간에서 끊겼고,
  // 툴바는 옆으로 밀리는데 **밀린다는 표시가 없었다**(스크롤막대는 폰에서 안 보인다).
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await ph.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.evaluate(() => localStorage.clear());
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.waitForTimeout(1200);

  const gap = await m.evaluate(() => {
    const hint = document.querySelector('.km-empty-in');
    const sheet = document.querySelector('.km-side');
    if (!hint || !sheet) return null;
    return Math.round(sheet.getBoundingClientRect().top - hint.getBoundingClientRect().bottom);
  });
  if (gap === null) throw new Error('첫 화면 안내나 시트를 못 찾았다');
  if (gap < 0) throw new Error(`첫 화면 안내가 시트에 ${-gap}px 잘린다`);

  const bar = await m.evaluate(() => {
    const el = document.querySelector('.km-toolbar');
    return { over: el.scrollWidth - el.clientWidth, fade: el.classList.contains('km-more-right') };
  });
  if (bar.over > 4 && !bar.fade) throw new Error(`툴바가 ${bar.over}px 더 있는데 표시가 없다`);
  await ph.close();
});
await step('폰 크기에서 캔버스가 화면 절반 이상이고, 옆 패널은 아래 시트로 뜬다', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await phone.newPage();
  await m.goto(URL, { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.km-canvas', { timeout: 8000 });
  await m.waitForTimeout(700);

  const canvas = await m.locator('.km-canvas').boundingBox();
  if (!canvas || canvas.height < 300) throw new Error(`폰에서 캔버스가 ${Math.round(canvas?.height ?? 0)}px — 그림이 손바닥만 하다`);

  /* 시트는 기본으로 **접혀** 있어야 한다 — 그림부터 보여야 하니까.
     ★ 단 **빈 판은 예외**다. 폰에서 갈래 고르기(무엇을 만들 건가요)가 접힌 시트 안에 있어서
     첫 화면에서 아예 안 보였다(실측 2026-08-12). 덮을 그림도 없으니 그때는 올려 둔다. */
  const emptyBoard = await m.evaluate(() => document.querySelectorAll('.ck-node').length === 0);
  const side = await m.locator('.km-side').boundingBox();
  const down = side.y > canvas.y + canvas.height * 0.6;
  if (emptyBoard) {
    if (down) throw new Error('빈 판인데 갈래 고르기가 접힌 시트 안에 숨어 있다');
    const pick = await m.locator('.km-intent button').first().boundingBox();
    if (!pick) throw new Error('빈 판인데 갈래 고르기 단추가 없다');
    const covered = await m.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? !el.closest('.km-side') : true;
    }, { x: pick.x + pick.width / 2, y: pick.y + pick.height / 2 });
    if (covered) throw new Error('갈래 고르기 단추가 다른 것에 가려 안 눌린다');
    // 재 보고 나서 원래대로 접어 둔다 — 아래 검사들은 접힌 상태를 전제로 한다.
    await m.locator('[data-km="sheet-grip"]').click();
    await m.waitForTimeout(320);
  } else if (!down) {
    throw new Error('옆 패널이 폰에서 접혀 있지 않다');
  }


  // 두 손가락 확대 — 폰에서 관계도를 읽는 가장 기본 동작인데 여태 한 번도 안 재 봤다.
  // Playwright 에는 핀치 도우미가 없어 **CDP 로 손가락 두 개를 직접 그린다**.
  const cdp = await phone.newCDPSession(m);
  const scaleOf = () => m.evaluate(() => {
    const g = [...document.querySelectorAll('.km-canvas svg g')]
      .find((el) => (el.getAttribute('transform') || '').startsWith('matrix('));
    const mm = /matrix\(([-0-9.]+)/.exec(g?.getAttribute('transform') || '');
    return mm ? Number(mm[1]) : 0;
  });
  const zoom0 = await scaleOf();
  const cxp = canvas.x + canvas.width / 2;
  const cyp = canvas.y + canvas.height / 2;
  const two = (d) => [
    { x: cxp - d, y: cyp, id: 1 },
    { x: cxp + d, y: cyp, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two(40) });
  for (const d of [60, 90, 120, 150]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(d) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await m.waitForTimeout(400);
  const zoom1 = await scaleOf();
  if (!(zoom1 > zoom0 * 1.15)) throw new Error(`두 손가락으로 벌려도 안 커진다: ${zoom0} → ${zoom1}`);

  // 손잡이로 올라온다 — 폰에서 시트를 여는 유일한 자리.
  // 툴바가 여러 줄로 부풀면 그림이 그만큼 밀린다 — **한 줄**이어야 한다(높이로 잡는다).
  const bar = await m.locator('.km-toolbar').boundingBox();
  if (bar.height > 130) throw new Error(`폰에서 툴바가 ${Math.round(bar.height)}px — 여러 줄로 부풀었다`);

  // 위젯 몸통이 화면보다 길면 **접힌 시트의 손잡이가 화면 밖**이라, 옆 패널을 여는 유일한 길이 스크롤 뒤에 숨는다.
  const fits = await m.evaluate(() => {
    const g = document.querySelector('[data-km="sheet-grip"]')?.getBoundingClientRect();
    return { bottom: Math.round(g?.bottom ?? 0), win: window.innerHeight };
  });
  if (fits.bottom > fits.win) throw new Error(`접힌 시트 손잡이가 화면 밖이다: ${fits.bottom} > ${fits.win}`);

  // 손가락에는 손가락 크기를 준다 — 애플 44pt · 머티리얼 48dp. 34px 짜리 아이콘은 옆 것이 눌린다.
  const tooSmall = await m.evaluate(() => [...document.querySelectorAll('.km-toolbar .btn, [data-km="sheet-grip"]')]
    .map((el) => ({ km: el.dataset.km || (el.textContent || '').trim().slice(0, 6), r: el.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0 && (x.r.height < 44 || x.r.width < 44))
    .map((x) => `${x.km}(${Math.round(x.r.width)}x${Math.round(x.r.height)})`));
  if (tooSmall.length > 0) throw new Error('폰에서 손가락보다 작은 단추: ' + tooSmall.join(' '));

  // 손가락으로 눌러 고를 수 있어야 한다(마우스 클릭만 되는 도구는 폰에서 죽은 도구다).
  // 새 컨텍스트라 판이 비어 있다 — **먼저 하나 만든다**(빈 판에서 「고르기」를 재면 늘 통과한다).
  // 폰에서 노드를 만드는 길은 **빈 곳 두 번 두드리기**다(툴바에 만들기 버튼은 없다).
  const cx = canvas.x + canvas.width * 0.5;
  const cy = canvas.y + canvas.height * 0.45;
  await m.touchscreen.tap(cx, cy);
  await m.touchscreen.tap(cx, cy);
  await m.waitForTimeout(500);
  if (await m.locator('.ck-node').count() === 0) {
    // 두드리기로 안 생기면 손가락만 쓰는 사람은 **노드를 못 만든다** — 그 자체가 결함이다.
    throw new Error('폰에서 빈 곳을 두 번 두드려도 노드가 안 생긴다');
  }
  const first = await m.locator('.ck-node').first().boundingBox();
  if (first) {
    await m.touchscreen.tap(first.x + first.width / 2, first.y + first.height / 2);
    await m.waitForTimeout(400);
    if (await m.locator('.ck-node.is-selected').count() === 0) throw new Error('손가락으로 눌렀는데 안 골라진다');
  }

  // 노드를 고르면 시트가 **저절로** 올라온다(그게 설계다) — 그러니 먼저 내려놓고 손잡이를 잰다.
  if (await m.evaluate(() => document.querySelector('.km-root')?.classList.contains('is-sheet-up') === true)) {
    await m.locator('[data-km="sheet-grip"]').click();
    await m.waitForTimeout(300);
  }
  const down2 = await m.locator('.km-side').boundingBox();

  await m.locator('[data-km="sheet-grip"]').click();
  await m.waitForTimeout(320);
  const up = await m.locator('.km-side').boundingBox();
  if (!(up.y < down2.y - 40)) throw new Error('손잡이를 눌러도 시트가 안 올라온다');

  // ★ 올라온 시트가 **그림을 통째로 덮으면 안 된다.** 시트 높이를 화면(vh) 기준으로 잡았더니
  //    위젯이 화면보다 짧은 폰에서 시트가 위젯보다 커져, 카드를 고른 순간 그림이 한 조각도
  //    안 보였다(실측 2026-08-12). 올라온 상태에서도 그림이 최소 3분의 1은 남아야 한다.
  // 자리는 **지금** 다시 잰다 — 위에서 잡아 둔 값은 그 사이 스크롤·확대로 낡는다.
  const bodyBox = await m.locator('.km-body').boundingBox();
  const seen = Math.max(0, up.y - bodyBox.y);
  if (seen < bodyBox.height * 0.33) {
    throw new Error(`시트가 올라오면 그림이 ${Math.round(seen)}px 밖에 안 남는다(몸통 ${Math.round(bodyBox.height)}px)`);
  }

  // ★ 고른 카드가 시트에 **가려지면 안 된다.** 폰에서는 카드를 고르면 시트가 저절로 올라오는데,
  //    아래쪽 카드를 고르면 그 카드가 통째로 덮였다(실측 2026-08-12). 방금 고른 것이 안 보이면
  //    고친 결과도 안 보인다 — 가려진 만큼 판이 위로 밀려야 한다.
  if (await m.evaluate(() => document.querySelector('.km-root')?.classList.contains('is-sheet-up') === true)) {
    await m.locator('[data-km="sheet-grip"]').click();   // 일단 내려놓고
    await m.waitForTimeout(300);
  }
  const low = await m.locator('.km-canvas').boundingBox();
  await m.touchscreen.tap(low.x + low.width * 0.5, low.y + low.height * 0.78);
  await m.touchscreen.tap(low.x + low.width * 0.5, low.y + low.height * 0.78);
  await m.waitForTimeout(900);
  const cover = await m.evaluate(() => {
    const n = document.querySelector('.ck-node.is-selected') || document.querySelector('.ck-node');
    const s = document.querySelector('.km-side');
    if (!n) return null;
    const nr = n.getBoundingClientRect(); const sr = s.getBoundingClientRect();
    return { bottom: Math.round(nr.bottom), sheetTop: Math.round(sr.top) };
  });
  if (cover && cover.bottom > cover.sheetTop + 4) {
    throw new Error(`고른 카드가 시트에 가려졌다 — 카드 아래끝 ${cover.bottom} · 시트 위끝 ${cover.sheetTop}`);
  }
  await m.locator('[data-km="sheet-grip"]').click();
  await m.waitForTimeout(300);

  // 빈 곳을 누르면 다시 내려간다 — 손잡이를 찾아 누르게 하면 한 동작이 두 동작이 된다.
  const nowBox = await m.locator('.km-canvas').boundingBox();
  await m.touchscreen.tap(nowBox.x + nowBox.width * 0.12, nowBox.y + nowBox.height * 0.12);
  await m.waitForTimeout(350);
  const down3 = await m.locator('.km-side').boundingBox();
  if (!(down3.y > up.y + 40)) throw new Error('빈 곳을 눌러도 시트가 안 내려간다');
  await phone.close();
});

await browser.close();
if (frozen) {
  // 그래도 흔들렸다면 **누가 흔들었는지**를 남긴다 — 「이상하다」로 끝나지 않게.
  const moved = frozen.drift();
  if (moved.length) console.log(`  ⚠ 판 도중 옆에서 바뀐 파일 ${moved.length}개 (내준 건 처음 읽은 것): ${moved.slice(0, 5).join(' · ')}`);
  frozen.close();
}

console.log(errors.length ? `\nRESULT: FAIL (${errors.length})\n - ` + errors.join('\n - ') : '\nRESULT: PASS — 콘솔 에러 0');
process.exit(errors.length ? 1 : 0);
