import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const suppliedBase = process.argv.find((arg) => /^https?:/.test(arg));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'about-review-'));
const server = suppliedBase ? null : await serveRepo();
const base = suppliedBase || server.base;
let browser;
const errors = [];
try {
    if (!suppliedBase) {
        execFileSync(process.execPath, [path.join(app, 'scripts/gen-post-pages.mjs'), '--out', path.join(out, 'pages')], {
            cwd:app, stdio:'pipe', windowsHide:true
        });
        assert.equal(fs.existsSync(path.join(out, 'pages/works/index.html')), false);
    }
    browser = await chromium.launch(process.env.CI
        ? { headless:true }
        : { channel:'msedge', headless:false });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    if (!suppliedBase) {
        const html = fs.readFileSync(path.join(out, 'pages/about/index.html'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
        await page.route(new URL('/about/', base).href, (route) => route.fulfill({ contentType:'text/html', body:html }));
    }
    if (process.argv.includes('--mutation')) {
        await page.route('**/data/works.json', async (route) => {
            const response = await route.fetch();
            const data = await response.json();
            data.works.pop();
            await route.fulfill({ response, json:data });
        });
    }
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(new URL('/about/', base).href);
    await page.locator('.ab .wk-tile').first().waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ab-profile')).position === 'sticky');
    assert.equal(await page.locator('.sidebar-now .nav-item-text').innerText(), '소개');
    if (suppliedBase) assert.equal((await page.request.get(new URL('/works/', base).href)).status(), 404);
    const data = await (await page.request.get(new URL('/apps/karmolab/data/works.json', base).href)).json();
    assert.equal(await page.locator('.wk-tile, .wk-now a').count(), data.works.length);
    assert.equal(await page.locator('.wk-tail li').count(), data.minor.length);
    await page.screenshot({ path: path.join(out, 'desktop-shelf.png') });
    const geometry = await page.locator('.ab').evaluate((el) => {
        const box = el.getBoundingClientRect();
        const left = el.querySelector('.ab-profile').getBoundingClientRect();
        const right = el.querySelector('.ab-works').getBoundingClientRect();
        return { width:box.width, profile:left.width, profileCss:getComputedStyle(el.querySelector('.ab-profile')).width,
            works:right.width, gap:right.left-left.right };
    });
    console.log(JSON.stringify({ geometry, works:data.works.length, minor:data.minor.length, out }));
    assert.ok(geometry.width > 1000, 'Desktop uses the available content width');
    assert.equal(geometry.profileCss, '300px');
    await page.locator('[data-view="map"]').click();
    const events = page.locator('.wk-track button');
    assert.equal(await events.count(), data.works.length);
    for (let i = 0; i < await events.count(); i++) {
        const event = events.nth(i);
        const title = await event.getAttribute('aria-label');
        await event.click();
        assert.ok(title.startsWith((await page.locator('.wk-pick h3').innerText()).replace(' ↗', '')));
    }
    await page.locator('[data-view="map"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'desktop-timeline.png') });
    await page.getByRole('searchbox').fill('Witch Mendokusai');
    assert.equal(await events.count(), 1);
    await page.locator('[data-view="shelf"]').click();
    assert.equal(await page.locator('.wk-tile, .wk-now a').count(), 1);
    await page.getByRole('searchbox').fill('no-match-54d7');
    assert.equal(await page.locator('.wk-empty').count(), 1);
    await page.getByRole('searchbox').fill('');
    assert.equal(await page.locator('.wk-tile, .wk-now a').count(), data.works.length);
    await page.setViewportSize({ width:390, height:844 });
    await page.reload();
    await page.locator('.ab .wk-tile').first().waitFor();
    await page.waitForFunction(() => {
        const heading = document.querySelector('.ab h1').getBoundingClientRect();
        const image = document.querySelector('.ab-profile img').getBoundingClientRect();
        return heading.top >= 0 && heading.bottom < innerHeight && image.width <= 64;
    });
    await page.screenshot({ path:path.join(out, 'mobile-shelf.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.ab-resume > summary').click();
    assert.ok(await page.locator('.ab-resume .ab-section').first().isVisible());
    await page.locator('.ab-resume > summary').click();
    await page.locator('[data-view="map"]').click();
    await page.locator('.wk-track button').first().click();
    assert.ok(await page.locator('.wk-pick h3 a').isVisible());
    await page.locator('[data-view="map"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path:path.join(out, 'mobile-timeline.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(`PASS: desktop/mobile, ${data.works.length} event selections, search, view switch, removed route, sidebar title, no page errors`);
} finally {
    await browser?.close();
    server?.close();
}
