/**
 * 위젯 하나를 브라우저에 태워 보는 검사들의 **공용 바닥** (2026-08-12)
 *
 * 왜 있나: 도구 검사 서른 몇 개가 똑같은 자물쇠를 각자 손으로 깎아 놓았다 —
 * 「모든 요청에 빈 문서를 돌려주고, 위젯 번들만 script 로 넣는다」. 그 모양은 위젯이
 * **동기로 그리던 시절**엔 맞았다. 지금은 아니다: `build()` 는 말 묶음(i18n)을 받아 온
 * 뒤에 그리고, 그 loader 는 묶음이 `window.__KARMO_I18N` 에 실렸는지까지 확인한 다음
 * 안 실렸으면 일부러 reject 한다(조용한 누락 금지).
 *
 * 그래서 빈 문서를 돌려주면 그리기가 영영 안 일어나고, 검사는 `#어떤칸` 이 null 이라
 * 「Cannot set properties of null」로 죽는다 — 제품 고장이 아니라 **검사가 굶긴 것**이다.
 * 실제로 그 모양으로 `test-video2gif` · `test-videotrim` 이 배포 관문을 세웠다.
 *
 * 고치는 자리를 서른 몇 군데 두지 않는다. 여기 한 곳이다.
 *
 *   import { serveAppAssets } from './lib/widget-harness.mjs';
 *   await serveAppAssets(page, root);   // root = apps/karmolab
 */
import fs from 'node:fs';
import path from 'node:path';

const BLANK_PAGE = '<!doctype html><meta charset="utf-8"><title>t</title>';

/**
 * `/apps/karmolab/**` 요청은 디스크의 진짜 산출물로, 나머지는 빈 문서로 답한다.
 * 언어도 못 박는다 — 러너 브라우저 취향(영어)에 따라 받아오는 묶음이 바뀌면 검사가 흔들린다.
 */
export async function serveAppAssets(page, root, options = {}) {
  const locale = options.locale || 'ko';

  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^\/apps\/karmolab\//, '');
    const onDisk = rel !== url.pathname ? path.join(root, rel) : null;
    if (onDisk && fs.existsSync(onDisk) && fs.statSync(onDisk).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: contentTypeOf(rel),
        body: fs.readFileSync(onDisk)
      });
    }
    if (url.pathname.endsWith('.json')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: BLANK_PAGE });
  });

  await page.addInitScript((code) => {
    window.__KARMO_LOCALE = code;

    /* `build()` 가 말 묶음을 받아 온 **뒤에** 그리므로, 그려질 때까지 기다린다(sleep 아님).
       안 나타나면 조용히 멈추지 않고 그 사실을 말하고 죽는다 — 검사가 굶었는지 제품이
       깨졌는지는 그 한 줄로 갈린다. */
    window.__karmoWaitIn = async (host, selector, ms = 8000) => {
      const until = Date.now() + ms;
      for (;;) {
        const found = host.querySelector(selector);
        if (found) return found;
        if (Date.now() > until) {
          throw new Error(`${selector} 이 ${ms}ms 안에 안 그려졌다 — build() 가 기다리는 말 묶음이 안 온다`);
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    };
  }, locale);
}

function contentTypeOf(rel) {
  if (rel.endsWith('.js') || rel.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (rel.endsWith('.json')) return 'application/json; charset=utf-8';
  if (rel.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * `build()` 가 말 묶음을 받아 온 **뒤에** 그리므로, 그려질 때까지 기다린다(sleep 아님).
 * 안 나타나면 조용히 멈추지 않고 그 사실을 말하고 죽는다.
 */
export const waitForSelectorIn = `
  async function waitForSelectorIn(host, selector, ms = 8000) {
    const until = Date.now() + ms;
    for (;;) {
      const found = host.querySelector(selector);
      if (found) return found;
      if (Date.now() > until) throw new Error(selector + ' 이 ' + ms + 'ms 안에 안 그려졌다 — build() 가 기다리는 말 묶음이 안 온다');
      await new Promise((r) => setTimeout(r, 25));
    }
  }
`;
