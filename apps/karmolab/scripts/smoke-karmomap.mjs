/**
 * KarmoMap — 실제로 열리고 그려지는가 (TASK-KL-202)
 *
 * 왜 화면 검사인가: 2026-08-09 에 이 위젯은 **앱에서 열 수조차 없는 상태**로 20 커밋을 받았다.
 * `widgets-lazy-meta.ts` 에 항목이 없어 묶음 자체가 안 만들어졌는데, 타입체크도 묶음 정합 검사도
 * 그동안 전부 초록이었다 — 「없는 것」은 검사할 대상이 없기 때문이다. 그래서 띄워서 만져 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-karmomap.mjs
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const URL = `${process.env.URL || 'http://127.0.0.1:8813/apps/karmolab/index.html'}#karmomap`;
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

const step = async (name, fn) => {
  try { await fn(); console.log(`  OK   ${name}`); }
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
await step('캔버스가 쓸 만한 크기다', async () => {
  // ★ 자리가 잡힐 때까지 기다린다 — `.km-root` 가 나타난 **직후**에 재면 아직 배치 전이라
  //   117px 같은 값이 나온다(실측 2026-08-09: 같은 코드로 117 과 832 가 번갈아 나왔다).
  await page.waitForFunction(
    () => (document.querySelector('.km-canvas')?.getBoundingClientRect().height ?? 0) >= 320,
    null,
    { timeout: 8000 }
  );
});
await step('빈 곳 더블클릭 → 노드 생김', async () => {
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.waitForSelector('.ck-node', { timeout: 4000 });
});
await step('이름 입력이 노드에 반영', async () => {
  await page.fill('[data-km="edit-label"]', '욘');
  await page.waitForFunction(() => document.querySelector('.ck-node text')?.textContent === '욘', null, { timeout: 4000 });
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
await step('얼굴을 안 정해도 첫 글자가 보인다', async () => {
  await page.waitForFunction(() => {
    const g = document.querySelector('.ck-node');
    if (!g) return false;
    const label = g.querySelector('text');
    const first = (label?.textContent || '').trim().slice(0, 1);
    if (!first) return false;
    return [...g.querySelectorAll('text')].some((t) => t.textContent === first && t.getAttribute('text-anchor') === 'middle');
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
  await page.locator('[data-km="share"]').dispatchEvent('click');
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
  await page.locator('[data-km="storage"]').dispatchEvent('click');
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
    const idx = JSON.parse(localStorage.getItem('karmomap.index') || 'null');
    if (!idx) return false;
    return Boolean(localStorage.getItem('karmomap.prev.' + idx.activeId));
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
  await page.locator('[data-km="storage"]').dispatchEvent('click');
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
    const raw = localStorage.getItem(localStorage.getItem('karmomap.index')
      ? JSON.parse(localStorage.getItem('karmomap.index')).maps
        .find((m) => m.id === JSON.parse(localStorage.getItem('karmomap.index')).activeId)
        ? 'karmomap.map.' + JSON.parse(localStorage.getItem('karmomap.index')).activeId
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
  await page.locator('[data-km="tidy"]').dispatchEvent('click');
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
  await page.locator('[data-km="from-text"]').dispatchEvent('click');
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
  await page.locator('[data-km="many-close"]').dispatchEvent('click');
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
  await page.fill('[data-km="find"]', '');
  await page.selectOption('[data-km="degree"]', '');
});
await step('발표 장을 담고 순서를 바꾼다', async () => {
  // prompt 가 두 번 뜬다(제목·설명) — 상시 핸들러로 받아 넘긴다. once 로 걸면 클릭이 대화상자에 물려 멈춘다.
  let n = 0;
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '장 ' + n : ''); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').dispatchEvent('click');
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').dispatchEvent('click');
  await page.locator('[data-km="stage-add"]').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 2, null, { timeout: 5000 });
  const firstBefore = await page.locator('[data-km="stage-go"]').first().textContent();
  await page.locator('[data-km="stage-back"]').dispatchEvent('click');
  await page.waitForFunction((bb) => {
    const el = document.querySelector('[data-km="stage-go"]');
    return el && el.textContent !== bb;
  }, firstBefore, { timeout: 4000 });
  await page.locator('[data-km="stage-exit"]').dispatchEvent('click');
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });
  page.off('dialog', onDlg);
});
await step('발표 모드 진입 / 나가기', async () => {
  // 이 버튼은 눌리는 순간 툴바를 통째로 숨긴다 — 보통 click 은 「대상이 사라졌다」로 보고
  // 30초를 기다린다(제품이 아니라 검사 쪽 함정). 이벤트만 던진다.
  await page.locator(`[data-km="story"]`).dispatchEvent(`click`);
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator(`[data-km="stage-exit"]`).dispatchEvent(`click`);
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
  await page.waitForSelector('[data-km="sample"]', { timeout: 4000 });
  await page.click('[data-km="sample"]');
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
      await unlink.dispatchEvent('click');
      await page.waitForSelector('[data-km="edit-doc-share"]', { timeout: 4000 });
    }
  };

  await page.click('.ck-node');
  await page.waitForSelector('[data-km="edit-doc"]', { timeout: 4000 });
  await detachIfShared();
  await page.fill('[data-km="edit-doc"]', '이 세계의 마법은 대가를 요구한다');
  await page.locator('[data-km="edit-doc-share"]').dispatchEvent('click');
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
  await page.locator('[data-km="note-card"]').last().dispatchEvent('click');
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
  await page.fill('[data-km="edit-label"]', '칸주인');
  await page.fill('[data-km="fld-new"]', '출신');
  await page.locator('[data-km="fld-add"]').dispatchEvent('click');
  await page.waitForSelector('[data-km="fld-value"]', { timeout: 4000 });
  await page.locator('[data-km="fld-value"]').first().fill('마계');

  await page.mouse.dblclick(fbox.x + fbox.width * 0.35, fbox.y + fbox.height * 0.25);
  await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
  // 칸은 **카드에서 읽혀야** 값이 있다 — 패널을 열어야만 보이면 아무도 안 적는다.
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ck-node text')].some((t) => (t.textContent || '').startsWith('출신:')),
    null,
    { timeout: 4000 }
  );
  const opts = await page.locator('#km-fld-suggest option').evaluateAll((os) => os.map((o) => o.value));
  if (!opts.includes('출신')) throw new Error('같은 종류가 쓰는 칸이 후보로 안 뜬다: ' + opts.join('/'));

  // 칸에 적은 이름이 이 맵의 노드면 **선으로 올릴 수 있어야** 한다 — 글로만 남으면 그림에 안 나온다.
  // 노드를 다시 골라 오가면 어느 노드가 골렸는지에 기대게 된다 — **지금 고른 노드에서** 끝낸다.
  await page.fill('[data-km="edit-label"]', '마왕성');
  await page.fill('[data-km="fld-new"]', '소속');
  await page.locator('[data-km="fld-add"]').dispatchEvent('click');
  await page.waitForSelector('[data-km="fld-value"]', { timeout: 4000 });
  await page.locator('[data-km="fld-value"]').first().fill('칸주인');
  // 값은 **손을 뗄 때** 확정된다(타자 한 글자마다 패널을 다시 그리면 커서가 날아간다) —
  // 검사도 사람처럼 칸을 벗어나 준다.
  await page.locator('[data-km="fld-value"]').first().blur();
  const promote = page.locator('[data-km="fld-link"]');
  await promote.first().waitFor({ timeout: 4000 });
  const edgesBefore = await page.locator('.ck-edge').count();
  await promote.first().dispatchEvent('click');
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

  await page.locator('[data-km="f-reset"]').dispatchEvent('click');
  await page.waitForFunction((n) => document.querySelectorAll('.ck-node').length === n, before, { timeout: 4000 });
  await page.click('[data-km="tab"][data-key="node"]');
});
await step('고른 노드 옆 작은 도구 줄에서 쪽지를 바로 붙인다', async () => {
  // 옆 패널까지 가는 왕복이 리듬을 끊는다 — 고른 것 옆에서 바로 눌리는지, 그리고 **실제로 늘어나는지** 본다.
  const tbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(tbox.x + tbox.width * 0.7, tbox.y + tbox.height * 0.3);
  await page.waitForSelector('[data-km="mini"]:not(.hidden)', { timeout: 4000 });
  const before = await page.locator('.ck-node').count();
  await page.locator('[data-km="mini-note"]').dispatchEvent('click');
  await page.waitForFunction((n) => document.querySelectorAll('.ck-node').length === n + 1, before, { timeout: 4000 });
  // 쪽지는 그 노드를 **가리켜야** 한다(지시선이 하나 늘어난다).
  if (await page.locator('.ck-leader').count() === 0) throw new Error('쪽지가 아무것도 안 가리킨다');
});
await step('카드 모서리를 끌면 크기가 바뀌고, 이름을 고쳐도 되돌아가지 않는다', async () => {
  // 손으로 맞춘 판이 타자 한 번에 도로 튀는 것이 가장 짜증나는 일이다 — 그 되돌아감까지 검사한다.
  const rbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(rbox.x + rbox.width * 0.45, rbox.y + rbox.height * 0.8);
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
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '틀 장' : ''); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').dispatchEvent('click');
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 1, null, { timeout: 5000 });
  const dimmedBefore = await page.locator('.ck-node.is-dimmed').count();
  await page.locator('[data-km="stage-exit"]').dispatchEvent('click');
  await page.waitForSelector('.km-root:not(.is-presenting)', { timeout: 4000 });

  // 화면 한가운데(= 그 틀 안)에 새 인물을 놓는다.
  const sbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(sbox.x + sbox.width * 0.5, sbox.y + sbox.height * 0.5);
  await page.waitForSelector('[data-km="edit-label"]', { timeout: 4000 });
  await page.fill('[data-km="edit-label"]', '나중에온사람');

  await page.locator('[data-km="story"]').dispatchEvent('click');
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  // 새 인물이 장에 꼈으면 **흐려진 것 중에 없어야** 한다.
  const stillDim = await page.evaluate(() => [...document.querySelectorAll('.ck-node.is-dimmed')]
    .some((g) => (g.textContent || '').includes('나중에온사람')));
  if (stillDim) throw new Error('나중에 놓은 인물이 그 장에 안 꼈다');
  await page.locator('[data-km="stage-exit"]').dispatchEvent('click');
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
  const onDlg = (d) => { n += 1; d.accept(n % 2 === 1 ? '미끄럼 ' + n : ''); };
  page.on('dialog', onDlg);
  await page.locator('[data-km="story"]').dispatchEvent('click');
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.locator('[data-km="stage-add"]').dispatchEvent('click');
  await page.waitForTimeout(500);
  // 두 장이 **같은 자리**면 「화면이 그대로」가 당연하다 — 사이에 화면을 옮겨 서로 다른 장으로 만든다.
  const pbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.move(pbox.x + pbox.width * 0.7, pbox.y + pbox.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(pbox.x + pbox.width * 0.3, pbox.y + pbox.height * 0.35, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.locator('[data-km="stage-add"]').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('[data-km="stage-go"]').length >= 2, null, { timeout: 5000 });

  await page.locator('[data-km="stage-go"]').first().dispatchEvent('click');
  await page.waitForTimeout(500);
  const settled0 = await viewOf();
  await page.locator('[data-km="stage-go"]').last().dispatchEvent('click');
  await page.waitForTimeout(80);
  const mid = await viewOf();
  await page.waitForTimeout(700);
  const settled1 = await viewOf();
  page.off('dialog', onDlg);
  await page.locator('[data-km="stage-exit"]').dispatchEvent('click');
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
    page.locator('[data-km="svg"]').dispatchEvent('click'),
  ]);
  if (!dl.suggestedFilename().endsWith('.svg')) throw new Error('.svg 가 아니다');
  const text = await readFile(await dl.path(), 'utf8');
  if (!text.includes('<svg')) throw new Error('SVG 가 아니다');
  if (!/<text[\s>]/.test(text)) throw new Error('글자가 <text> 로 안 남았다');
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
  await page.locator('[data-km="lay-circle"]').dispatchEvent('click');
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
  await page.locator('[data-km="from-text"]').dispatchEvent('click');
  await page.waitForSelector('[data-km="text-src"]', { timeout: 4000 });
  const edgesBefore = await page.locator('.ck-edge').count();
  await page.fill('[data-km="text-src"]', ['화살표갑', '화살표을', '화살표갑 -> 화살표을 : 지킨다'].join(String.fromCharCode(10)));
  await page.locator('[data-km="text-go"]').dispatchEvent('click');
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
    page.locator('[data-km="mermaid"]').dispatchEvent('click'),
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
    await page.locator('[data-km="fld-add"]').dispatchEvent('click');
    await page.waitForSelector('[data-km="fld-value"]', { timeout: 4000 });
    await page.locator('[data-km="fld-value"]').first().fill(when);
    await page.locator('[data-km="fld-value"]').first().blur();
  };
  await put(0.6, '나중사람', '9화');
  await put(0.25, '먼저사람', '2화');

  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  await page.locator('[data-km="lay-time"]').dispatchEvent('click');
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
await step('종류마다 「틀 한 벌」이 칸 이름을 채워 준다', async () => {
  // 빈 칸에서 시작하면 무엇을 적을지 몰라 아무것도 안 적는다 — 틀이 실제로 **칸을 만들어야** 값이다.
  const tbox = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(tbox.x + tbox.width * 0.15, tbox.y + tbox.height * 0.6);
  await page.waitForSelector('[data-km="fld-new"]', { timeout: 4000 });
  const tplBtn = page.locator('[data-km="fld-template"]');
  if (await tplBtn.count() === 0) throw new Error('이 종류에 틀이 없다');
  const before = await page.locator('[data-km="fld-name"]').count();
  await tplBtn.dispatchEvent('click');
  await page.waitForFunction((n) => document.querySelectorAll('[data-km="fld-name"]').length > n, before, { timeout: 4000 });
  // 채운 뒤에는 그 버튼이 사라져야 한다(같은 칸을 두 번 권하면 목록이 지저분해진다).
  await page.waitForFunction(() => document.querySelectorAll('[data-km="fld-template"]').length === 0, null, { timeout: 4000 });
});
await step('공용 글 흩기 — 글이 사라지지 않고 자리마다 사본으로 남는다', async () => {
  // 「없애기」가 빈칸을 남기면 글이 증발한 것처럼 보인다. 그래서 흩은 **뒤에** 글자가 남아 있는지를 센다.
  await page.click('[data-km="tab"][data-key="notes"]');
  await page.waitForSelector('[data-km="note-split"]', { timeout: 4000 });
  const before = await page.locator('[data-km="note-title"]').count();
  await page.locator('[data-km="note-split"]').last().dispatchEvent('click');
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
    const lib = await page.evaluate(() => localStorage.getItem('karmomap.notes'));
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
    page.locator('[data-km="canvas-out"]').dispatchEvent('click'),
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

await browser.close();

console.log(errors.length ? `\nRESULT: FAIL (${errors.length})\n - ` + errors.join('\n - ') : '\nRESULT: PASS — 콘솔 에러 0');
process.exit(errors.length ? 1 : 0);
