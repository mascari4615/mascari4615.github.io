import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

const server = await smokeBase();
const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: 'block' });

await context.addInitScript(() => {
  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  const listeners = [];
  const captureOf = (options) => typeof options === 'boolean' ? options : !!options?.capture;
  const tracked = (target) => target === window || target === document;

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (tracked(this) && listener) {
      const capture = captureOf(options);
      if (!listeners.some((row) => row.target === this && row.type === type && row.listener === listener && row.capture === capture)) {
        const row = { target: this, type, listener, capture };
        listeners.push(row);
        const signal = typeof options === 'object' ? options?.signal : null;
        signal?.addEventListener('abort', () => {
          const at = listeners.indexOf(row);
          if (at >= 0) listeners.splice(at, 1);
        }, { once: true });
      }
    }
    return nativeAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (tracked(this) && listener) {
      const capture = captureOf(options);
      const at = listeners.findIndex((row) => row.target === this && row.type === type && row.listener === listener && row.capture === capture);
      if (at >= 0) listeners.splice(at, 1);
    }
    return nativeRemove.call(this, type, listener, options);
  };

  const NativeObserver = window.MutationObserver;
  const observers = new Map();
  window.MutationObserver = class extends NativeObserver {
    observe(...args) {
      if (!observers.has(this)) observers.set(this, new Error().stack?.split('\n').slice(2, 5).join(' | ') ?? 'unknown');
      return super.observe(...args);
    }
    disconnect() {
      observers.delete(this);
      return super.disconnect();
    }
  };
  window.__arcadeLifecycle = {
    snapshot: () => {
      const observerOrigins = [...observers.values()];
      return {
        listeners: listeners.length,
        observers: observers.size,
        arcadeObservers: observerOrigins.filter((origin) => origin.includes('/widgets/arcade/arcade.js')).length,
        observerOrigins
      };
    }
  };
});

const page = await context.newPage();
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`  [${ok ? 'O' : 'X'}] ${name}${ok || !detail ? '' : `. ${detail}`}`);
  if (!ok) failures.push(name);
};

try {
  await page.route('**/__dev', (route) => route.abort());
  await page.goto(`${server.base}/apps/karmolab/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('karmolab.arcade.dim', '2d'));
  const baseline = await page.evaluate(() => window.__arcadeLifecycle.snapshot());

  await page.evaluate(() => Toolbox.switchPage('arcade'));
  await page.waitForSelector('[data-obj="gomoku"]', { timeout: 60000 });
  const mounted = await page.evaluate(() => window.__arcadeLifecycle.snapshot());
  check('전역 리스너를 실제로 건다', mounted.listeners > baseline.listeners, JSON.stringify({ baseline, mounted }));
  check('무대 감시자를 실제로 건다', mounted.arcadeObservers > baseline.arcadeObservers, JSON.stringify({ baseline, mounted }));

  await page.click('[data-obj="gomoku"]');
  await page.click('[data-tutor="gomoku"]');
  await page.waitForSelector('#acLesson:not([hidden])', { timeout: 30000 });
  const answers = [109, 124, 110, 113, 112, 112, 114];
  for (let i = 0; i < answers.length; i += 1) {
    await page.click(`[data-c="${answers[i]}"]`);
    if (i < answers.length - 1) {
      await page.waitForFunction((n) => document.querySelector('#acLessonNo')?.textContent?.startsWith(`${n} /`), i + 2, { timeout: 5000 });
    } else {
      await page.waitForFunction(() => document.querySelector('#acLesson')?.hidden === true, null, { timeout: 5000 });
    }
  }
  if (await page.locator('#acMenu').isVisible()) await page.click('#acMenu');
  await page.click('#acQuit');
  await page.waitForTimeout(1300);
  const stayed = await page.evaluate(() => ({
    lobby: document.querySelector('#acLobby')?.style.display !== 'none',
    play: document.querySelector('#acPlay')?.style.display !== 'none'
  }));
  check('배우기를 마치고 나가도 로비에 머문다', stayed.lobby && !stayed.play, JSON.stringify(stayed));

  await page.evaluate(() => Toolbox.switchPage('home'));
  await page.waitForTimeout(100);
  const warm = await page.evaluate(() => window.__arcadeLifecycle.snapshot());
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  await page.waitForSelector('[data-obj="gomoku"]', { timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('home'));
  await page.waitForTimeout(100);
  const disposed = await page.evaluate(() => window.__arcadeLifecycle.snapshot());
  check('다시 열어도 전역 리스너가 쌓이지 않는다', disposed.listeners === warm.listeners, JSON.stringify({ warm, disposed }));
  check('다시 열어도 무대 감시자가 쌓이지 않는다', disposed.arcadeObservers === warm.arcadeObservers, JSON.stringify({ warm, disposed }));
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`[arcade-lifecycle] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('[arcade-lifecycle] 통과. 지연 시작 취소, 전역 리스너와 무대 감시자 회수');
