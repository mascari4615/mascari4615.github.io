/**
 * 미리 그린 화면에 **손이 달리는지** (TASK-KL-135)
 *
 * 도구 상세 페이지는 두 번 그려진다 — 빌드 때 떠 둔 그림이 HTML 로 먼저 오고, 위젯이 도착하면
 * 그 자리를 제 화면으로 갈아 끼운다. 갈아 끼우기가 안 일어나면 그 도구는 **보이는데 죽어 있다**:
 * 단추를 눌러도 아무 일이 안 나고, 적은 글은 아무 데도 안 간다. 화면은 멀쩡해 보이므로
 * 다른 검사(도구 129개·설명 읽힘·화면 스캔)는 전부 통과한다 — 실제로 그랬다.
 *
 * 여기서 보는 신호는 손이다: 미리 그린 그림은 HTML 을 떠 온 것이라 어떤 단추에도 `onclick` 이
 * 없다. 위젯이 만든 화면에는 붙어 있다.
 *
 * 사용: node scripts/smoke-hydration.mjs [도구id ...]
 *       BASE=http://127.0.0.1:8801/apps/blog node scripts/smoke-hydration.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const 기다림 = 15000;

/* 갈래를 섞는다 — 계산기·글·그림·파일·놀이. 한 갈래만 보면 그 갈래만 지킨다. */
const 기본 = ['loan', 'timecapsule', 'charcount', 'qrgen', 'imgresize', 'pdfdiff', 'ghosttype', 'worldclock'];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : 기본;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const 죽은것 = [];
let 미리그림 = 0;

for (const id of ids) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (res && res.status() !== 200) {
      죽은것.push(`${id}: http ${res.status()}`);
      await page.close();
      continue;
    }
    if (await page.evaluate(() => document.documentElement.innerHTML.includes('KARMOLAB_PRERENDERED'))) 미리그림++;

    const 살았나 = await page
      .waitForFunction(
        (toolId) => {
          const p = document.getElementById('page-' + toolId);
          if (!p) return false;
          const 단추 = [...p.querySelectorAll('button')];
          return 단추.length ? 단추.some((b) => typeof b.onclick === 'function') : null;
        },
        id,
        { timeout: 기다림 }
      )
      .then((h) => h.jsonValue())
      .catch(() => false);

    /* 단추가 없는 도구는 이 신호로 못 본다 — 「통과」로 세지 않고 그렇게 말한다. */
    if (살았나 === null) process.stdout.write('-');
    else if (살았나) process.stdout.write('.');
    else {
      죽은것.push(`${id}: ${기다림 / 1000}초가 지나도 단추에 손이 안 달렸다 (미리 그린 그림 그대로)`);
      process.stdout.write('x');
    }
  } catch (e) {
    죽은것.push(`${id}: 여는 중 실패 — ${String(e.message).slice(0, 60)}`);
    process.stdout.write('x');
  }
  await page.close();
}
process.stdout.write('\n');
await browser.close();

if (죽은것.length) {
  console.error(`[smoke-hydration] 보이는데 죽어 있는 도구 ${죽은것.length}건 / ${ids.length}`);
  죽은것.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-hydration] 도구 ${ids.length}장 전부 손이 달린다 (그 중 미리 그려 온 것 ${미리그림}장)`);
