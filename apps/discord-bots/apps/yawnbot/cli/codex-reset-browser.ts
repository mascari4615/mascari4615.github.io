import '../src/load-env';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { browserSessionPath, createBrowserResetSource, ResetBrowserError, saveBrowserSession } from '../src/services/sources/codex-reset-browser';
import { classifyResetPost, DEFAULT_RESET_AUTHOR } from '../src/services/sources/codex-reset';
import { buildResetEmbed } from '../src/services/notifiers/codex-reset';
import { readExistingEdgeSession } from '../src/services/sources/codex-reset-edge';

async function main(): Promise<void> {
  const author = process.env.YAWNBOT_CODEX_RESET_AUTHOR?.trim() || DEFAULT_RESET_AUTHOR;
  if (process.argv.includes('--check')) {
    const posts = await createBrowserResetSource(author)();
    const signals = posts.map(classifyResetPost).filter(Boolean);
    console.log(JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), posts: posts.length,
      signals: signals.slice(-3).map(s => ({ url: s.post.url, ...buildResetEmbed(s).toJSON() })) }, null, 2));
    return;
  }
  const file = browserSessionPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const sid = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).match(/S-1-5-[\d-]+/)?.[0];
    if (!sid) throw new Error('현재 Windows 계정 확인 실패');
    execFileSync('icacls.exe', [path.dirname(file), '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true, stdio: 'ignore' });
  }
  if (process.argv.includes('--from-edge')) {
    console.log('기존 Edge에 연결합니다. 브라우저에 연결 허용 요청이 뜨면 확인하세요.');
    saveBrowserSession(await readExistingEdgeSession(), file);
    console.log('기존 Edge의 X 로그인 저장됨. 창과 탭은 유지. 원격 디버깅은 이제 꺼도 됩니다. npm run codex:check로 실제 수집을 확인하세요.');
    return;
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: false, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    console.log('열린 Edge에서 X에 로그인하세요. 확인 후 로그인 상태를 이 노트북에 저장하고 창을 닫습니다. 제한 시간 10분.');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(url => url.hostname === 'x.com' && url.pathname === '/home', { timeout: 600_000 });
    await page.goto(`https://x.com/${author}/with_replies`, { waitUntil: 'domcontentloaded' });
    await page.locator('article[data-testid="tweet"]').first().waitFor({ timeout: 30_000 });
    const state = await context.storageState();
    if (!state.cookies.some(c => c.name === 'auth_token')) throw new Error('X 로그인 확인 실패');
    saveBrowserSession(state, file);
    console.log('X 로그인 저장됨. 서버의 다음 수집 주기부터 사용. npm run codex:check로 발송 없이 확인 가능.');
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error instanceof ResetBrowserError ? error.message : 'X 로그인/확인 실패. 기존 인증 보존. Edge와 로그인 상태를 확인한 뒤 다시 실행하세요.'); process.exitCode = 2; });
