import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
require('../dist/src/load-env.js');
const { chromium } = await import('playwright-core');
const { readTimelineCards, discoverBrowserPosts, readBrowserPost } = require('../dist/src/services/sources/codex-reset-browser.js');
const { ResetMonitor } = require('../dist/src/services/notifiers/codex-reset.js');
const { readExistingEdgeSession, parseEdgeDebugEndpoint } = require('../dist/src/services/sources/codex-reset-edge.js');
const author = 'thsottiaux';
const at = new Date().toISOString();
const url = id => `https://x.com/${author}/status/${id}`;
const card = (id, name = author, body = 'We have reset Codex usage.', pinned = false) => `<article data-testid="tweet" style="height:450px">
  ${pinned ? '<div data-testid="socialContext">Pinned</div>' : ''}
  <div data-testid="User-Name"><a href="/${name}">${name}</a><a href="/${name}/status/${id}"><time datetime="${at}">now</time></a></div>
  ${body ? `<div data-testid="tweetText" lang="en">${body}</div>` : ''}</article>`;
let browser;
const channel = process.env.YAWNBOT_CODEX_RESET_BROWSER === 'chromium' ? undefined : 'msedge';
try { browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true }); }
catch (error) { console.error(`CANNOT-RUN: ${channel || 'chromium'} 실행 실패: ${error.message.split('\n')[0]}`); process.exit(2); }
let passed = 0;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  let html = '';
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  html = card('101', 'other') + card('102') + card('99', author, 'older', true);
  await page.goto(`https://x.com/${author}/with_replies`);
  assert.deepEqual((await readTimelineCards(page, author)).map(c => [c.id, c.pinned]), [['102', false]]); passed++;

  const quote = '<div role="link"><div data-testid="User-Name"><a href="/other">other</a></div><div data-testid="tweetText">We will reset usage in 5 hours.</div><button>Show original</button><button data-testid="tweet-text-show-more-link">Show more</button></div>';
  html = card('103', author, 'We have reset Codex usage.').replace('</article>', quote + '</article>');
  const post = await readBrowserPost(page, { id: '103', url: url('103') }, author);
  assert.equal(post.text, 'We have reset Codex usage.'); passed++;
  html = card('104', author, '').replace('</article>', quote + '</article>');
  assert.equal((await readBrowserPost(page, { id: '104', url: url('104') }, author)).text, ''); passed++;

  html = card('105', author, '번역된 글').replace('</article>', '<button onclick="setTimeout(() => { document.querySelector(\'[data-testid=tweetText]\').textContent=\'We will reset Codex usage in 3 hours.\'; this.remove(); }, 100)">원본 보기</button></article>');
  const scheduled = await readBrowserPost(page, { id: '105', url: url('105') }, author);
  assert.equal(scheduled.text, 'We will reset Codex usage in 3 hours.'); passed++;
  html = card('106').replace('</article>', '<button data-testid="tweet-text-show-more-link">Show more</button></article>');
  await assert.rejects(readBrowserPost(page, { id: '106', url: url('106') }, author), /전체 원문/); passed++;
  html = card('107', 'other');
  await assert.rejects(readBrowserPost(page, { id: '107', url: url('107') }, author), /작성자/); passed++;

  html = card('999', author, 'pinned old announcement', true) + card('110') + card('109') + card('108') + card('107') + card('106') + card('105');
  const posts = await discoverBrowserPosts(page, author, '109');
  assert.deepEqual(posts.map(p => p.id).sort(), ['110', '999']); passed++;

  let saved = { author, seen: [], sent: [], signals: [], checkedAt: null };
  const store = { load: () => structuredClone(saved), save: value => { saved = structuredClone(value); } };
  let next = [post];
  const service = new ResetMonitor({ author, store, fetchPosts: async () => next });
  const sent = [];
  await service.refresh(); await service.deliver(async signal => sent.push(signal.post.id));
  next = [post, scheduled];
  await service.refresh(); await service.deliver(async signal => sent.push(signal.post.id));
  const restarted = new ResetMonitor({ author, store, fetchPosts: async () => [] });
  await restarted.refresh(); await restarted.deliver(async signal => sent.push(signal.post.id));
  assert.deepEqual(sent, ['103', '105']); passed++;
} finally { await browser.close(); }

const tempRoot = path.resolve(os.tmpdir());
const profile = fs.mkdtempSync(path.join(tempRoot, 'yawnbot-edge-fixture-'));
let existing;
try {
  existing = await chromium.launchPersistentContext(profile, {
    channel, headless: true, chromiumSandbox: true, args: ['--remote-debugging-port=0'],
  });
  await existing.route('**/*', route => route.abort());
  await existing.addCookies([
    { name: 'auth_token', value: 'fixture-only', domain: '.x.com', path: '/', httpOnly: true, secure: true },
    { name: 'private_other_site', value: 'must-not-export', domain: 'example.com', path: '/' },
  ]);
  const portFile = path.join(profile, 'DevToolsActivePort');
  const session = await readExistingEdgeSession(portFile);
  assert.deepEqual(session.cookies.map(cookie => cookie.name), ['auth_token']);
  assert.deepEqual(session.origins, []); passed++;
  assert.equal(existing.pages().length, 1);
  assert.equal(await existing.pages()[0].evaluate(() => location.href), 'about:blank');
  assert.equal((await existing.cookies('https://example.com')).length, 1); passed++;
  await existing.clearCookies({ name: 'auth_token' });
  await assert.rejects(readExistingEdgeSession(portFile), /먼저 X에 로그인/); passed++;
  assert.throws(() => parseEdgeDebugEndpoint('9222\nhttps://example.com'), /주소 확인 실패/);
  assert.throws(() => parseEdgeDebugEndpoint('65536\n/devtools/browser/abc'), /주소 확인 실패/); passed++;
} finally {
  await existing?.close();
  assert.equal(path.dirname(path.resolve(profile)), tempRoot);
  assert.ok(path.basename(profile).startsWith('yawnbot-edge-fixture-'));
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(`PASS: ${channel || 'chromium'} 실제 DOM + 수집/판정/중복 방지/기존 Edge 연결 ${passed}건. X 네트워크/Discord 발송 없는 fixture 검사`);
