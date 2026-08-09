/**
 * KarmoMap — 실제로 열리고 그려지는가 (TASK-KL-202)
 *
 * 왜 화면 검사인가: 2026-08-09 에 이 위젯은 **앱에서 열 수조차 없는 상태**로 20 커밋을 받았다.
 * `widgets-lazy-meta.ts` 에 항목이 없어 묶음 자체가 안 만들어졌는데, 타입체크도 묶음 정합 검사도
 * 그동안 전부 초록이었다 — 「없는 것」은 검사할 대상이 없기 때문이다. 그래서 띄워서 만져 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-karmomap.mjs
 */
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
  for (const k of ['maps', 'pack', 'new-kind', 'groups', 'terms', 'undo', 'redo', 'bg', 'fit', 'story', 'png', 'export', 'import', 'clear']) {
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
await step('어휘 팩 전환 (관계도)', async () => {
  await page.selectOption('[data-km="pack"]', 'relation');
  const opts = await page.locator('[data-km="new-kind"] option').allTextContents();
  if (!opts.join(' ').includes('인물')) throw new Error(`팩이 안 바뀜: ${opts.join('/')}`);
});
await step('묶음 패널이 열리고 묶음이 생긴다', async () => {
  await page.click('[data-km="groups"]');
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
await step('내 용어 패널에서 관계 종류 추가', async () => {
  await page.click('[data-km="terms"]');
  await page.click('[data-km="t-add-edge"]');
  await page.waitForSelector('[data-term-edge]', { timeout: 4000 });
  await page.click('[data-km="t-close"]');
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
  await page.click('[data-km="filter"]');
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
  await page.click('[data-km="help"]');
  await page.waitForSelector('[data-km="help-close"]', { timeout: 4000 });
  const rows = await page.locator('.km-help-row').count();
  if (rows < 20) throw new Error(`도움말 줄이 ${rows}개뿐이다`);
  await page.click('[data-km="help-close"]');
});
await step('관계망 읽기가 순위를 낸다', async () => {
  await page.click('[data-km="sna"]');
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
  await page.click('[data-km="tidy"]');
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
  await page.click('[data-km="filter"]');
  const tagBox = page.locator('[data-km="f-tag"]').first();
  await tagBox.waitFor({ timeout: 4000 });
  await tagBox.uncheck();
  await page.waitForFunction((c) => document.querySelectorAll('.ck-node').length === c - 1, before, { timeout: 4000 });
  await page.click('[data-km="f-reset"]');
  await page.click('[data-km="f-close"]');
});
await step('꼬리표로 색 입히기가 실제로 색을 바꾼다', async () => {
  const strokeOf = () => page.evaluate(() => document.querySelector('.ck-node .ck-node-bg')?.getAttribute('stroke') || '');
  const before = await strokeOf();
  await page.click('[data-km="filter"]');
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
  await page.click('[data-km="from-text"]');
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
  await page.click('[data-km="many-close"]');
});
await step('거르기로 노드 종류를 빼면 화면에서 사라진다', async () => {
  const before = await page.locator('.ck-node').count();
  await page.click('[data-km="filter"]');
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
