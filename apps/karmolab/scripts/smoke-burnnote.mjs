/**
 * 사라지는 쪽지 — 만들고, 열고, **두 번째엔 없는가** (TASK-KL-251).
 *
 * 알맹이 검사가 자물쇠를, 서버 검사가 곳간을 지킨다면 이쪽은 **셋이 이어지는지**를 본다.
 * 진짜 서버 대신 여기서 가짜 곳간을 세워 왕복시킨다 — 배포된 서버에 기대면 그 서버가
 * 잠깐 흔들릴 때 이 검사가 거짓말을 한다.
 *
 * 이 도구의 약속도 함께 잰다: **열쇠가 서버로 안 간다.**
 *
 * 사용: node scripts/smoke-burnnote.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/* ── 가짜 곳간 — 서버가 하는 일을 그대로(맡기고, 한 번 내주고, 지운다) ── */
const vault = new Map();
/** 서버가 실제로 본 것 — 열쇠가 여기 섞여 들어오면 약속이 깨진 것이다. */
const sawOnServer = [];
let served = 0;

await page.route('**/kl/note', async (route) => {
  const req = route.request();
  if (req.method() !== 'POST') return route.fallback();
  const raw = req.postData() || '';
  sawOnServer.push(req.url() + ' ' + raw);
  const { body } = JSON.parse(raw);
  const id = 'test-' + (vault.size + 1);
  vault.set(id, body);
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id }) });
});

await page.route('**/kl/note/*', async (route) => {
  const url = route.request().url();
  sawOnServer.push(url);
  const id = url.split('/').pop().split('#')[0].split('?')[0];
  const got = vault.get(id);
  if (!got) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"gone"}' });
  vault.delete(id); // 읽기가 곧 지우기
  served += 1;
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ body: got, at: Date.now() }) });
});

const SECRET = '비밀번호는 hunter2 입니다 🔐';

await page.goto(`${BASE}#burnnote`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#bnText', { timeout: 20000 });

/* ① 만들면 링크가 나온다 */
await page.fill('#bnText', SECRET);
await page.click('#bnMake');
await page.waitForSelector('#bnResult:visible', { timeout: 10000 });
const link = await page.inputValue('#bnLink');
check(link.includes('#n='), `링크가 만들어져야 한다 (지금 「${link.slice(0, 40)}」)`);
check(link.includes('/karmolab/t/burnnote/'), '링크는 도구 상세 주소를 쓴다 — 해시는 이 앱에서 「어느 도구」를 뜻한다');

/* ② 서버에 올라간 것에 원문이 없다 */
const stored = [...vault.values()][0] || '';
check(!stored.includes('hunter2'), '서버에 올라간 덩어리에 원문이 비치면 안 된다');
check(stored.length > 20, '올라간 것은 잠긴 덩어리다');

/* ③ 열쇠는 서버로 안 간다 — 이 도구의 약속 */
const key = link.split('.').pop();
check(key.length > 20, '링크 뒤쪽에 열쇠가 실려 있다');
const leaked = sawOnServer.filter((rec) => rec.includes(key));
check(leaked.length === 0, `열쇠가 서버로 가면 안 된다 (샌 곳: ${leaked.slice(0, 1)})`);

/* ④ 그 링크로 들어가면 여는 화면이 뜬다 */
/* 도구 상세 페이지(`/karmolab/t/burnnote/`)는 **배포 때 찍히고 저장소엔 없다**. 그 페이지가
   하는 일은 하나 — 「이 도구로 열어라」를 심는 것(`KARMOLAB_ENTRY_TOOL`)이고 열쇠는 해시에
   그대로 남는다. 검사는 그 진입을 똑같이 흉내 낸다. */
await page.addInitScript(() => {
  window.KARMOLAB_ENTRY_TOOL = 'burnnote';
});
const openUrl = `${BASE}` + link.slice(link.indexOf('#'));
/* 같은 문서에서 **해시만** 바뀌면 브라우저는 새로 열지 않는다 — 위젯도 다시 안 지어진다.
   받은 사람은 늘 새 창에서 여는 것이므로, 빈 곳을 한 번 거쳐 그 상황을 만든다. */
const freshOpen = async (url) => {
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
};
await freshOpen(openUrl);
await page.waitForSelector('#bnRead:visible', { timeout: 15000 });
check(!(await page.locator('#bnWrite').isVisible()), '받은 사람에게는 쓰는 화면이 아니라 여는 화면');
check(await page.locator('#bnOpen').isVisible(), '「열기」 단추가 있다');
check((await page.locator('#bnGot').isVisible()) === false, '누르기 전에는 내용이 안 보인다');

/* ⑤ 열면 원문이 나온다 */
await page.click('#bnOpen');
await page.waitForSelector('#bnGot:visible', { timeout: 15000 });
const got = await page.inputValue('#bnGot');
check(got === SECRET, `열면 원문 그대로 (지금 「${got.slice(0, 20)}」)`);
check(served === 1, '서버에서 딱 한 번 꺼냈다');

/* ⑥ 두 번째엔 없다 — 이 도구의 전부 */
await freshOpen(openUrl);
await page.waitForSelector('#bnOpen', { timeout: 15000 });
await page.click('#bnOpen');
await page.waitForTimeout(900);
const status = await page.locator('#bnStatus').innerText();
check(/이미 열렸거나|사라진|gone/i.test(status), `두 번째는 없어야 한다 (지금 「${status}」)`);
check((await page.locator('#bnGot').isVisible()) === false, '두 번째에는 내용이 안 보인다');

/* ⑦ 열쇠가 틀리면 조용히 넘어가지 않는다 */
vault.set('test-9', stored);
const badUrl = `${BASE}#n=test-9.` + link.split('.').pop().slice(0, -3) + 'AAA';
await freshOpen(badUrl);
await page.waitForSelector('#bnOpen', { timeout: 15000 });
await page.click('#bnOpen');
await page.waitForTimeout(900);
const bad = await page.locator('#bnStatus').innerText();
check(/열쇠|맞지|key/i.test(bad), `틀린 열쇠는 그렇다고 말해야 한다 (지금 「${bad}」)`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-burnnote] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-burnnote] 전부 통과');
