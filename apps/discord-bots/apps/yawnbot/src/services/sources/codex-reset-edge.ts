import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { ResetBrowserError } from './codex-reset-browser';

export function edgeDebugPortFile(): string {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) {
    throw new ResetBrowserError('unavailable', '기존 Edge 연결은 노트북 Windows 사용자 세션에서 실행하세요.');
  }
  return path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'DevToolsActivePort');
}

export function parseEdgeDebugEndpoint(contents: string): string {
  const [portText, socketPath] = contents.trim().split(/\r?\n/);
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535
    || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(socketPath || '')) {
    throw new ResetBrowserError('unavailable', 'Edge 연결 주소 확인 실패. 원격 디버깅을 다시 켜세요.');
  }
  return `ws://127.0.0.1:${port}${socketPath}`;
}

// 기존 프로필 파일의 인증값을 읽지 않고, 사용자가 허용한 로컬 Edge 연결에서 X 쿠키만 요청.
export async function readExistingEdgeSession(portFile = edgeDebugPortFile()): Promise<Awaited<ReturnType<BrowserContext['storageState']>>> {
  if (!fs.existsSync(portFile)) {
    throw new ResetBrowserError('unavailable', '기존 Edge에서 edge://inspect의 Remote debugging 허용 후 다시 실행하세요.');
  }
  const endpoint = parseEdgeDebugEndpoint(fs.readFileSync(portFile, 'utf8'));
  let browser;
  try { browser = await chromium.connectOverCDP(endpoint, { timeout: 60_000 }); }
  catch { throw new ResetBrowserError('unavailable', '기존 Edge 연결 실패. 원격 디버깅과 브라우저의 연결 허용 요청을 확인하세요.'); }
  let ownPage: Page | undefined;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new ResetBrowserError('unavailable', '기존 Edge 프로필 연결 실패.');
    ownPage = await context.newPage();
    const connection = await context.newCDPSession(ownPage);
    // context.cookies는 내부에서 전체 저장소를 읽고 거르므로 URL 한정 CDP 요청 사용.
    const result = await connection.send('Network.getCookies', { urls: ['https://x.com/', 'https://twitter.com/'] });
    const cookies = result.cookies.filter(cookie => !cookie.partitionKey).map(cookie => ({
      name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
      expires: cookie.expires, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite || 'Lax' as const,
    }));
    if (!cookies.some(cookie => cookie.name === 'auth_token' && /(^|\.)x\.com$/.test(cookie.domain)
      && (cookie.expires === -1 || cookie.expires > Date.now() / 1000))) {
      throw new ResetBrowserError('login-required', '연결한 기존 Edge 프로필에서 먼저 X에 로그인하세요.');
    }
    return { cookies, origins: [] };
  } finally {
    await ownPage?.close().catch(() => {});
    // connectOverCDP로 연결한 Browser.close는 연결만 해제. 사용자 창과 탭은 유지.
    await browser.close();
  }
}
