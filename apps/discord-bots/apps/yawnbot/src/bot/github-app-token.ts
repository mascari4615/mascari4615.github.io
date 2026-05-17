// GitHub App installation 토큰 런타임 발급+캐시 (KAR-018-Y, 사용자 결정
// 2026-05-18 "GitHub App 토큰 재사용"). 워커 agentic claude 의 github.io
// push / gh pr create 자격. App 토큰 = repo-scoped·만료 1h → 24/7 봇은
// *런타임 재발급* 필수(deploy-time mint 불가). resolve-merge-token
// (auto-merge/graduate)과 동일 App(GH_APP_ID/GH_APP_PRIVATE_KEY) 재사용 —
// 그 App 이 github.io PR 머지 중 = contents+PR write 보유 확정.
//
// 새 dep 0: Node crypto 로 RS256 JWT 직접 서명. 순수(buildAppJwt 구조·
// 만료판정) 전수검증, HTTP 교환은 IO.
import { createSign } from 'crypto';

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * App JWT (RS256). iss=appId, iat=-60s(클럭 스큐), exp=+9분(<10분 한도).
 * 순수(now·키 주입) — 구조 전수검증 가능.
 */
export function buildAppJwt(
  appId: string,
  privateKeyPem: string,
  now: number = Date.now(),
): string {
  const iat = Math.floor(now / 1000) - 60;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const sig = b64url(signer.sign(privateKeyPem));
  return `${header}.${payload}.${sig}`;
}

interface CachedToken {
  token: string;
  expMs: number;
}
let cached: CachedToken | null = null;

/** 캐시 유효? 만료 5분 전부터 stale (재발급 여유). 순수. */
export function isTokenFresh(
  c: CachedToken | null,
  now: number = Date.now(),
): boolean {
  return !!c && c.expMs - now > 5 * 60 * 1000;
}

async function ghApi(
  path: string,
  jwtOrToken: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<any> {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwtOrToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yawnbot-kar-018-y',
    },
  });
  if (!r.ok) {
    throw new Error(
      `GitHub App API ${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`,
    );
  }
  return r.json();
}

/**
 * installation 토큰 (App→JWT→installation→access_token). 캐시(만료
 * 5분 전 재발급). App secret 미설정/실패 = null → caller 가 GH_TOKEN
 * 폴백(additive — prod 무중단). 단발 실패는 throw 안 함(null 반환).
 */
export async function getInstallationToken(
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const appId = env.GH_APP_ID?.trim();
  const pem = env.GH_APP_PRIVATE_KEY?.trim();
  if (!appId || !pem) return null;
  if (isTokenFresh(cached)) return cached!.token;
  try {
    const key = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
    const jwt = buildAppJwt(appId, key);
    const insts = (await ghApi('/app/installations', jwt)) as Array<{
      id: number;
    }>;
    if (!Array.isArray(insts) || insts.length === 0) return null;
    // 단일 소유자 App = 설치 1개(첫). 다중이면 첫 = github.io 소유 계정.
    const instId = insts[0].id;
    const tok = (await ghApi(
      `/app/installations/${instId}/access_tokens`,
      jwt,
      'POST',
    )) as { token: string; expires_at: string };
    if (!tok?.token) return null;
    cached = {
      token: tok.token,
      expMs: Date.parse(tok.expires_at) || Date.now() + 55 * 60 * 1000,
    };
    return cached.token;
  } catch {
    return null; // 폴백 경로 (caller 가 GH_TOKEN)
  }
}

/** 테스트 전용 — 캐시 리셋. */
export function resetTokenCache(): void {
  cached = null;
}
