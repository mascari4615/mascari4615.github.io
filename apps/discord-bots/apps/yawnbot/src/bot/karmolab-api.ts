/**
 * KarmoLab 계정 API (TASK-KL-098 Cycle 1) — yawnbot Express 위에 얹는다.
 *
 * 왜 여기인가: 노트북에서 24/7 도는 Express 가 이미 있고 `yawnbot.mascari4615.com` 으로
 * 밖에 열려 있다. 계정 하나 때문에 새 서버·새 요금제를 들이는 것보다, 살아 있는 것 위에
 * 얹는 쪽이 근본이다.
 *
 * 도메인이 다르다 (`blog.mascari4615.com` → `yawnbot.mascari4615.com`). 그래서:
 *  - 쿠키는 `SameSite=None; Secure` 여야 브라우저가 보낸다 (둘 다 https 라 성립).
 *  - CORS 를 직접 답한다. 아무 데나 열지 않고 **아는 출처만** 허용한다.
 *
 * 새 패키지는 안 쓴다 (cors·cookie-parser 미도입) — 쿠키 한 줄 읽고 헤더 세 줄 다는 일에
 * 의존성을 늘리지 않는다.
 */
import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  getKarmolabAccountStore,
  emptyRecords,
  // 이름 바꾸기 라우트가 쓴다. 이 줄이 빠져 있어서 봇이 통째로 컴파일이 안 됐다 —
  // 내가 KL-112 에서 훅만 골라 담다가 라우트는 담고 이 한 줄을 빠뜨린 탓이다.
  DISPLAY_NAME_MAX,
  type Account,
  type AccountRecords,
  type KarmolabAccountStore,
  // 기기 이름표·보안 기록 (TASK-KL-152 C6·C7)
  deviceLabel,
} from '../services/karmolab-accounts';
import {
  getKarmolabTraceStore,
  KarmolabTraceStore,
  isValidToolId,
  isPostSort,
  isValidGalleryId,
  slugifyGalleryId,
  maxLenFor,
  dailyLimitFor,
  GALLERY_LABEL_MAX,
  GALLERY_DESC_MAX,
  GALLERY_DAILY_LIMIT,
  TAG_MAX_COUNT,
  TAG_MAX_LEN,
  TITLE_MAX_LEN,
  REPLY_MAX_LEN,
} from '../services/karmolab-traces';
import { getKarmolabNotificationStore, type KarmolabNotificationStore } from '../services/karmolab-notifications';
import { getKarmolabPlayStore, playGame, isValidVariant, type KarmolabPlayStore } from '../services/karmolab-plays';
import { getKarmolabPackStore, PackError, type KarmolabPackStore } from '../services/karmolab-packs';
import { WELLS, WellStore, wellById, wellOfTheDay, kstDay as wellKstDay } from '../services/karmolab-wells';
import { SteamLibrary, LibraryError } from '../services/karmolab-steam-library';
import { backupInfo, triggerBackupNow } from '../services/karmolab-backup';
import { saveImage, readImage, UPLOAD_MAX_BYTES } from '../services/karmolab-uploads';
import { classifyVisitor } from '../services/karmolab-visitor-kind';
import { getKarmolabRoomStore, colorFor, type RoomEvent } from '../services/karmolab-rooms';
import { getKarmolabFlowStore } from '../services/karmolab-flows';
import { missionState, missionsOfWeek } from '../services/karmolab-missions';
import {
  verifyRegistration,
  verifyAssertion,
  bufToB64url,
  RP_ID,
  RP_NAME,
  CHALLENGE_TTL_MS,
} from '../services/karmolab-passkey';
import {
  getKarmolabChatStore,
  TEXT_MAX as CHAT_TEXT_MAX,
  type ChatEvent,
  type KarmolabChatStore,
} from '../services/karmolab-chat';

/** 쿠키 이름. 짧고 우리 것임이 드러나게. */
const SESSION_COOKIE = 'kl_session';

/**
 * 이 API 를 부를 수 있는 출처.
 * 로컬 개발 주소를 같이 두는 이유: 배포해야만 로그인을 시험할 수 있으면 확인 루프가 죽는다.
 */
const ALLOWED_ORIGINS = new Set([
  'https://blog.mascari4615.com',
  // KarmoLab 핫리로드 개발 서버 (KL-100, `cd apps/karmolab && npm run dev`).
  // 이게 없으면 개발 중에는 로그인·커뮤니티가 통째로 막힌다 (브라우저가 요청을 버린다).
  'http://localhost:8813',
  'http://127.0.0.1:8813',
  // 정적으로 띄워 볼 때 쓰던 자리 (python -m http.server 8899).
  'http://localhost:8899',
  'http://127.0.0.1:8899',
  'http://localhost:4000',
]);

/** 로그인 후 되돌아갈 수 있는 곳 — 열린 리디렉트(아무 주소로나 튕겨 보내기)를 막는다. */
function safeReturnUrl(raw: unknown): string {
  const fallback = 'https://blog.mascari4615.com/karmolab/';
  const value = typeof raw === 'string' ? raw : '';
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return ALLOWED_ORIGINS.has(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(maxAgeMs / 1000)}; Path=/; HttpOnly; Secure; SameSite=None`,
  );
}

function clearSessionCookie(res: Response): void {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`);
}

/** 들어온 몸통을 기록 모양으로 다듬는다 — 남이 아무거나 보낼 수 있는 자리다. */
function sanitizeRecords(raw: unknown): AccountRecords {
  const out = emptyRecords();
  if (!raw || typeof raw !== 'object') return out;
  const body = raw as Record<string, unknown>;

  const asIdList = (value: unknown): string[] =>
    Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64))].slice(0, 500)
      : [];

  out.achievements = asIdList(body.achievements);
  out.badges = asIdList(body.badges);

  if (body.progress && typeof body.progress === 'object') {
    for (const [key, value] of Object.entries(body.progress as Record<string, unknown>)) {
      if (key.length > 64) continue;
      const n = Number(value);
      // 음수·NaN·무한대는 기록이 아니다. 위쪽 한계는 두지 않는다 — 쓰다듬기 50만 회가 실제 목표다.
      if (!Number.isFinite(n) || n < 0) continue;
      out.progress[key] = Math.floor(n);
      if (Object.keys(out.progress).length >= 200) break;
    }
  }

  if (body.streaks && typeof body.streaks === 'object') {
    for (const [key, value] of Object.entries(body.streaks as Record<string, unknown>)) {
      if (key.length > 64 || !value || typeof value !== 'object') continue;
      const s = value as Record<string, unknown>;
      const current = Number(s.current);
      const longest = Number(s.longest);
      const last = typeof s.lastActivityDate === 'string' ? s.lastActivityDate.slice(0, 10) : null;
      out.streaks[key] = {
        current: Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0,
        longest: Number.isFinite(longest) && longest >= 0 ? Math.floor(longest) : 0,
        lastActivityDate: last && /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null,
      };
      if (Object.keys(out.streaks).length >= 100) break;
    }
  }

  return out;
}

/**
 * 로그인 왕복에 쓰는 일회용 표.
 * 왜 필요한가: 이게 없으면 남이 만든 링크로 사람을 로그인 흐름에 밀어 넣을 수 있다(CSRF).
 * 메모리에만 둔다 — 봇이 재시작하면 진행 중이던 로그인만 한 번 실패하고, 다시 누르면 된다.
 */
const pendingLogins = new Map<string, { returnUrl: string; expiresAt: number }>();
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

/** 프로필 그림을 잠깐 들고 있는 자리 — 같은 그림을 매번 디스코드에서 다시 받지 않으려고. */
const avatarCache = new Map<string, { body: Buffer; contentType: string; expiresAt: number }>();
const AVATAR_TTL_MS = 60 * 60 * 1000;

function issueLoginState(returnUrl: string): string {
  const now = Date.now();
  for (const [key, value] of pendingLogins) {
    if (value.expiresAt <= now) pendingLogins.delete(key);
  }
  const state = crypto.randomBytes(16).toString('base64url');
  pendingLogins.set(state, { returnUrl, expiresAt: now + LOGIN_STATE_TTL_MS });
  return state;
}

function consumeLoginState(state: unknown): string | null {
  if (typeof state !== 'string') return null;
  const entry = pendingLogins.get(state);
  if (!entry) return null;
  pendingLogins.delete(state);
  if (entry.expiresAt <= Date.now()) return null;
  return entry.returnUrl;
}

function discordAvatarUrl(user: { id: string; avatar: string | null }): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
}

/** OAuth 설정이 다 있는가. 없으면 라우트는 살아 있되 「아직 안 켰다」고 정직하게 답한다. */
export function karmolabOauthConfig(env: NodeJS.ProcessEnv = process.env): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  ready: boolean;
} {
  const clientId = String(env.CLIENT_ID ?? '').trim();
  const clientSecret = String(env.DISCORD_CLIENT_SECRET ?? '').trim();
  const redirectUri = String(
    env.KARMOLAB_OAUTH_REDIRECT_URI ?? 'https://yawnbot.mascari4615.com/kl/auth/discord/callback',
  ).trim();
  return { clientId, clientSecret, redirectUri, ready: Boolean(clientId && clientSecret && redirectUri) };
}

/**
 * 이 사람이 주인인가 — 요청에 답을 달거나 상태를 바꿀 수 있는 사람.
 * 봇이 이미 쓰는 `ADMIN_IDS`(디스코드 id 목록)를 그대로 본다. 새 설정을 만들지 않는다.
 */
function isAdminAccount(account: Account | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const discordId = account?.identities.discord?.discordId;
  if (!discordId) return false;
  return String(env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(discordId);
}

/**
 * 방문자를 가리키는 열쇠를 만든다 — 주소는 저장하지 않고 섞어서만 쓴다.
 * cloudflared 를 거쳐 오므로 원래 주소는 `x-forwarded-for` 의 맨 앞에 있다.
 */
/**
 * 표 원장이 던진 거절을 답으로 옮긴다 (TASK-KL-150).
 *
 * 왜 한자리인가: 「안 됩니다」만 돌려주면 스프레드시트에서 긁어 온 사람은 뭐가 문제인지
 * 영영 모른다. 이유(code)와 기준(detail)을 **항상 같이** 실어 보낸다.
 */
function sendPackError(res: Response, error: unknown): void {
  if (error instanceof PackError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'not_owner' ? 403 : 400;
    res.status(status).json({ error: error.code, ...(error.detail ?? {}) });
    return;
  }
  console.error('[karmolab-api] 표 처리 중 알 수 없는 실패:', error);
  res.status(500).json({ error: 'server_error' });
}

function visitorKeyFor(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? '').split(',')[0];
  const ip = (first || req.socket.remoteAddress || 'unknown').trim();
  return KarmolabTraceStore.visitorKey(ip, String(req.headers['user-agent'] ?? ''));
}

/**
 * @param store 시험에서 임시 저장소를 넣기 위한 자리. 안 주면 실제 저장소를 쓴다.
 *   (이게 없으면 라우트를 HTTP 로 찔러 보는 시험이 운영 데이터 파일을 건드린다.)
 */
export function registerKarmolabApi(
  app: Application,
  store: KarmolabAccountStore = getKarmolabAccountStore(),
  traces: KarmolabTraceStore = getKarmolabTraceStore(),
  notes: KarmolabNotificationStore = getKarmolabNotificationStore(),
  plays: KarmolabPlayStore = getKarmolabPlayStore(),
  chat: KarmolabChatStore = getKarmolabChatStore(),
  packs: KarmolabPackStore = getKarmolabPackStore(),
  wells: WellStore = new WellStore(),
  library: SteamLibrary = new SteamLibrary(),
): void {

  /**
   * 「이 글을 남기는 사람은 누구인가」 — 실명과 익명을 **한 자리에서** 가른다 (TASK-KL-157).
   *
   * 왜 필요한가: 채팅은 익명으로 즉시 말할 수 있는데 커뮤니티는 서른여덟 자리에서 로그인을
   * 요구했다. 채팅으로 들어온 사람이 글은 못 쓰는 턱이 생겼고, 그 턱에서 사람이 끊긴다.
   *
   * 익명이어도 서버는 **누구의 글인지 안다** — 안 그러면 지울 수도, 하루 상한을 셀 수도 없다.
   *  - 로그인한 채로 익명 = 글쓴이 열쇠는 **진짜 계정**. 내일도 내가 지운다. 표시만 이름표.
   *  - 로그인 없이 익명 = 오늘 열쇠에 묶는다. **하루가 지나면 내 글이 아니게 된다** —
   *    그게 익명의 값이다(추적할 것을 안 남긴다). 대신 채팅과 같은 재갈·봇 차단이 걸린다.
   */
  /* 판별 유니온(`{ok:true}|{ok:false}`)으로 쓰면 이 패키지에서는 안 좁혀진다 —
   * `strictNullChecks` 가 꺼져 있어서 컴파일러가 갈래를 못 가른다. 그래서 한 모양으로 둔다. */
  interface Writer {
    /** 막혔으면 그 까닭. null 이면 통과다. */
    error: string | null;
    status: number;
    accountId: string;
    handle: string;
    anon: { name: string; color: string } | null;
  }

  /** 이 사람의 오늘 이름표 (보여 주기용). 채팅에서 보이는 것과 같은 값이다. */
  function anonFaceFor(req: Request): { name: string; color: string } {
    const identity = chat.identityFor(visitorKeyFor(req));
    return { name: identity.name, color: identity.color };
  }

  function writerFor(req: Request, account: Account | null, wantsAnon: boolean): Writer {
    const blocked = (status: number, error: string): Writer => ({ error, status, accountId: '', handle: '', anon: null });
    if (!wantsAnon) {
      if (!account) return blocked(401, 'not_signed_in');
      return { error: null, status: 200, accountId: account.id, handle: account.handle, anon: null };
    }
    // 봇이 익명 문을 통해 글을 쏟아붓지 못하게. 채팅과 같은 기준을 쓴다.
    if (classifyVisitor(req.headers['user-agent']) !== 'human') return blocked(403, 'not_human');
    const identity = chat.identityFor(visitorKeyFor(req));
    // 채팅에서 재갈이 물린 사람은 글로도 못 돈다 — 안 그러면 재갈이 우회로를 갖는다.
    if (chat.isMuted(identity.who)) return blocked(403, 'muted');
    return {
      error: null,
      status: 200,
      accountId: account ? account.id : `anon:${identity.key}`,
      handle: account ? account.handle : '',
      anon: { name: identity.name, color: identity.color },
    };
  }

  // ── CORS — 아는 출처에만, 쿠키를 실어 보낼 수 있게 ──────────────────────────
  app.use('/kl', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    // 출처마다 답이 다르므로 중간 캐시가 한 출처의 답을 다른 출처에 주면 안 된다.
    res.setHeader('Vary', 'Origin');

    /* 요청마다 짧은 번호를 붙인다 (TASK-KL-098).
     *
     * 「안 돼요」라는 말만으로는 아무도 못 고친다. 화면에 이 번호가 보이면 사용자가 그것만
     * 알려 줘도 로그에서 그 요청 하나를 바로 집을 수 있다. 브라우저가 이 헤더를 읽을 수 있게
     * 내보낼 헤더 목록에도 적는다 — 안 적으면 CORS 가 가려서 화면이 못 읽는다. */
    const requestId = crypto.randomBytes(4).toString('hex');
    res.setHeader('X-KL-Request-Id', requestId);
    res.setHeader('Access-Control-Expose-Headers', 'X-KL-Request-Id');
    // 실패한 답에는 몸통에도 넣어 준다 (헤더를 못 보는 자리에서도 쓰이게).
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
        if (res.statusCode >= 400 && body && typeof body === 'object') {
            (body as Record<string, unknown>).requestId = requestId;
            console.warn(`[karmolab-api] ${res.statusCode} ${req.method} ${req.path} rid=${requestId}`, body);
        }
        return originalJson(body);
    };
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  /** 브라우저가 「계정 기능이 지금 되나」를 물어보는 자리. 서버가 죽으면 이 요청이 실패하고, 브라우저는 조용히 예전처럼 동작한다. */
  app.get('/kl/health', (_req: Request, res: Response) => {
    const config = karmolabOauthConfig();
    // 「살아 있나」만으로는 부족하다 — 백업이 언제 돌았는지 안 보이면 안 도는 것을 모른다.
    res.json({
      ok: true,
      login: config.ready ? 'discord' : 'disabled',
      ...store.stats(),
      backup: backupInfo(),
      pulse: traces.pulse(),
      visits: traces.visitStats(),
    });
  });

  app.get('/kl/auth/discord', (req: Request, res: Response) => {
    const config = karmolabOauthConfig();
    const returnUrl = safeReturnUrl(req.query.return);
    if (!config.ready) {
      // 「눌렀는데 아무 일도 안 남」이 제일 나쁘다. 왜 안 되는지 눈에 보이게 되돌려 보낸다.
      res.redirect(`${returnUrl}${returnUrl.includes('?') ? '&' : '?'}kl_login=unconfigured`);
      return;
    }
    const state = issueLoginState(returnUrl);
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    // identify 만 받는다. 이메일·서버 목록은 필요 없고, 안 받는 것이 제일 확실한 보호다.
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', state);
    // `prompt=none` 은 안 쓴다. 이미 허락한 사람의 클릭 한 번을 줄여 주지만, **한 번도 허락한
    // 적 없는 사람**에게 어떻게 도는지는 디스코드 문서가 말하지 않는다 (오류로 튕기는지 화면을
    // 띄우는지). 잘못 짚으면 신규 로그인이 전부 깨진다 — 얻는 것(클릭 1회)보다 잃는 것이 크다.
    res.redirect(url.toString());
  });

  app.get('/kl/auth/discord/callback', async (req: Request, res: Response) => {
    const config = karmolabOauthConfig();
    const returnUrl = consumeLoginState(req.query.state);
    if (!returnUrl) {
      res.status(400).type('text/html; charset=utf-8').send('<h1>로그인 요청이 만료됐어요</h1><p>처음부터 다시 눌러 주세요.</p>');
      return;
    }
    const sep = returnUrl.includes('?') ? '&' : '?';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || !config.ready) {
      res.redirect(`${returnUrl}${sep}kl_login=failed`);
      return;
    }

    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        console.error('[karmolab-api] 디스코드 토큰 교환 실패:', tokenRes.status, await tokenRes.text());
        res.redirect(`${returnUrl}${sep}kl_login=failed`);
        return;
      }
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) {
        res.redirect(`${returnUrl}${sep}kl_login=failed`);
        return;
      }

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!userRes.ok) {
        console.error('[karmolab-api] 디스코드 사용자 조회 실패:', userRes.status);
        res.redirect(`${returnUrl}${sep}kl_login=failed`);
        return;
      }
      const user = (await userRes.json()) as {
        id: string;
        username: string;
        global_name?: string | null;
        avatar: string | null;
      };

      const account = store.upsertFromDiscord({
        discordId: user.id,
        username: user.username,
        displayName: user.global_name || user.username,
        avatarUrl: discordAvatarUrl(user),
      });
      const device = deviceLabel(req.headers['user-agent']);
      const session = store.createSession(account.id, device);
      store.noteEvent(account.id, 'login', { device, detail: '디스코드' });
      setSessionCookie(res, session.token, session.expiresAt - Date.now());
      res.redirect(`${returnUrl}${sep}kl_login=ok`);
    } catch (error) {
      console.error('[karmolab-api] 로그인 처리 중 오류:', error);
      res.redirect(`${returnUrl}${sep}kl_login=failed`);
    }
  });

  app.post('/kl/auth/logout', (req: Request, res: Response) => {
    const leaving = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (leaving) store.noteEvent(leaving.id, 'logout', { device: deviceLabel(req.headers['user-agent']) });
    store.destroySession(readCookie(req, SESSION_COOKIE));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  /** 지금 누구로 로그인돼 있나 + 서버에 있는 내 기록. 로그인 안 했으면 200 에 `account: null`. */
  app.get('/kl/me', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.json({ account: null });
      return;
    }
    res.json({
      account: {
        handle: account.handle,
        displayName: account.displayName,
        // 내 화면에서도 디스코드 주소를 안 쓴다 — 화면에 박힌 주소는 그대로 복사돼 남에게 간다.
        avatarPath: account.avatarUrl ? `/kl/u/${encodeURIComponent(account.handle)}/avatar` : null,
        joinedAt: account.createdAt,
        profileUrl: `https://blog.mascari4615.com/karmolab/u/?h=${encodeURIComponent(account.handle)}`,
      },
      records: account.records,
      recordsUpdatedAt: account.recordsUpdatedAt,
    });
  });

  /**
   * 브라우저에 쌓인 기록을 올린다. 서버가 가진 것과 **합쳐서** 돌려준다 (덮어쓰기 X).
   * 그래서 이 호출은 몇 번을 다시 보내도 결과가 같다 — 실패 후 재시도가 안전하다.
   */
  app.put('/kl/me/records', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const merged = store.mergeRecordsForAccount(account.id, sanitizeRecords(req.body));
    res.json({ records: merged });
  });

  /**
   * 보이는 이름 바꾸기.
   *
   * 계정의 정본은 우리 쪽이고 디스코드는 들어오는 문 하나다 — 문에 적힌 이름을 평생 달고
   * 다닐 이유가 없다. 주소(handle)는 안 바꾼다: 남이 걸어 둔 링크가 깨진다.
   */
  app.patch('/kl/me', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const previous = account.displayName;
    const updated = store.setDisplayName(account.id, (req.body ?? {}).displayName);
    if (updated) store.noteEvent(account.id, 'name-changed', { detail: `${previous} → ${updated.displayName}` });
    if (!updated) {
      res.status(400).json({ error: 'bad_name', maxLength: DISPLAY_NAME_MAX });
      return;
    }
    res.json({ account: store.publicProfile(updated) });
  });

  /**
   * 복구 코드 새로 만들기 — **원문은 이 답에서 딱 한 번만** 나온다.
   * 들어오는 문이 디스코드 하나뿐이면 그 문이 잠기는 날 계정을 통째로 잃는다.
   */
  app.post('/kl/me/recovery-codes', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const codes = store.issueRecoveryCodes(account.id);
    res.json({ codes, note: '지금 한 번만 보입니다. 안전한 곳에 옮겨 적어 두세요.' });
  });

  /** 남은 복구 코드 장 수 (원문은 안 준다 — 서버도 모른다). */
  app.get('/kl/me/recovery-codes', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ left: store.recoveryCodesLeft(account.id) });
  });

  /** 복구 코드로 들어온다. 디스코드 없이 계정을 되찾는 유일한 길이다. */
  app.post('/kl/auth/recovery', (req: Request, res: Response) => {
    const account = store.consumeRecoveryCode((req.body ?? {}).code);
    if (!account) {
      // 왜 틀렸는지(없는 코드인지 이미 쓴 코드인지) 안 알려 준다 — 알려 주면 찍어 보는 데 쓰인다.
      res.status(401).json({ error: 'bad_code' });
      return;
    }
    const device = deviceLabel(req.headers['user-agent']);
    const { token, expiresAt } = store.createSession(account.id, device);
    store.noteEvent(account.id, 'recovery-used', { device });
    setSessionCookie(res, token, expiresAt - Date.now());
    res.json({ account: store.publicProfile(account), left: store.recoveryCodesLeft(account.id) });
  });

  /** 다른 기기에서 쓸 짧은 로그인 코드 (지금 로그인한 기기에서 만든다). */
  app.post('/kl/me/link-code', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json(store.issueLinkCode(account.id));
  });

  /** 그 코드로 이 기기에 로그인한다. */
  app.post('/kl/auth/link', (req: Request, res: Response) => {
    const account = store.consumeLinkCode((req.body ?? {}).code);
    if (!account) {
      res.status(401).json({ error: 'bad_code' });
      return;
    }
    const device = deviceLabel(req.headers['user-agent']);
    const { token, expiresAt } = store.createSession(account.id, device);
    store.noteEvent(account.id, 'link-used', { device });
    setSessionCookie(res, token, expiresAt - Date.now());
    res.json({ account: store.publicProfile(account) });
  });

  /**
   * 내 발자국 (TASK-KL-152 C1) — 잔디·돌아보기가 읽는 자리.
   *
   * 지어낸 수는 하나도 없다. 로그인한 뒤에 실제로 열린 것만 들어 있고, 없으면 빈 채로 답한다
   * (없는 것을 0 이 아니라 「아직 없다」로 보여 줄 수 있게 날짜 칸 자체가 비어 나간다).
   */
  app.get('/kl/me/activity', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ activity: store.footprintFor(account.id) });
  });

  /**
   * 프로필 꾸미기 (TASK-KL-152 C5) — 한 줄 소개 · 대표 도구.
   * 자유 HTML 은 안 받는다: 글 한 줄과 우리 도구 id 뿐이라 남의 화면에 무엇이 그려질지 우리가 안다.
   */
  app.patch('/kl/me/card', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const card = store.setCard(account.id, req.body);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ card });
  });

  /**
   * 로그인 하나만 끊는다 (TASK-KL-152 C6).
   *
   * 「이 기기만 빼고 전부」로는 못 하는 일이 있다 — 집 컴퓨터는 두고 카페에서 켠 것만 끄고 싶을 때.
   * 목록에 나가는 것은 **토큰이 아니라 섞은 이름표**다. 토큰을 화면에 내보내면 그게 곧 열쇠가 된다.
   */
  app.post('/kl/me/sessions/:id/revoke', (req: Request, res: Response) => {
    const token = readCookie(req, SESSION_COOKIE);
    const account = store.accountForSession(token);
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const revoked = store.revokeSession(account.id, String(req.params.id ?? ''));
    if (revoked) store.noteEvent(account.id, 'sessions-revoked', { detail: '한 곳' });
    res.json({ revoked });
  });

  /**
   * 보안 기록 (TASK-KL-152 C7) — 「내 계정에 무슨 일이 있었나」.
   * 남이 내 계정에 들어와도 알 방법이 지금까지 하나도 없었다.
   */
  app.get('/kl/me/security', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ events: store.eventsFor(account.id) });
  });

  /**
   * 따라가기 (TASK-KL-152 C8).
   *
   * 프로필이 「명함」에서 「사람」이 되는 자리다 — 따라가면 그 사람이 남긴 것이 내 피드로 온다.
   * 알림은 안 보낸다: 누가 나를 따라갔다는 것으로 종이 울리면 그 종은 곧 꺼진다.
   */
  app.post('/kl/u/:handle/follow', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const handle = String(req.params.handle ?? '');
    const on = (req.body ?? {}).on !== false;
    // 막은·막힌 사이는 따라갈 수 없다 (TASK-KL-156 D2). 막혔다는 사실 자체는 안 알린다 —
    // 「막혔음」이라고 답하면 그것이 곧 통보가 된다. 그냥 안 되는 것으로 답한다.
    if (store.isBlockedBy(handle, account.handle) || store.blockedBy(account.id).includes(handle.toLowerCase())) {
      res.status(400).json({ error: 'cannot_follow' });
      return;
    }
    const following = store.setFollowing(account.id, handle, on);
    if (!following) {
      res.status(400).json({ error: 'cannot_follow' });
      return;
    }
    res.json({ following: store.isFollowing(account.id, handle), count: store.followerCount(handle) });
  });

  /**
   * 내 피드 — 내가 따라가는 사람들이 남긴 것.
   *
   * 아무도 안 따라가면 **빈 목록이 아니라 「아직 없다」**를 뜻한다. 부르는 쪽이 그 둘을
   * 구별할 수 있게 따라가는 수를 같이 보낸다.
   */
  app.get('/kl/me/feed', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const muted = new Set(store.blockedBy(account.id));
    const handles = store.followingOf(account.id).filter((handle) => !muted.has(handle));
    const posts = handles
      .flatMap((handle) => traces.postsBy(handle, account.id).map((post) => ({ ...post, handle })))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20);
    res.json({ following: handles.length, posts });
  });

  /**
   * 프로필 카드 그림 (TASK-KL-152 C8).
   *
   * SVG 로 만든다 — 그림 라이브러리를 새로 들이지 않고, 글자가 또렷하며, 몇 KB 다.
   * 값은 전부 실측이고 없는 값은 칸 자체를 안 그린다.
   */
  app.get('/kl/u/:handle/card.svg', (req: Request, res: Response) => {
    const account = store.byHandle(String(req.params.handle ?? ''));
    if (!account) {
      res.status(404).send('not found');
      return;
    }
    const visible = store.visibilityFor(account.id);
    if (!visible.profile) {
      res.status(403).send('private');
      return;
    }
    const activity = store.footprintFor(account.id);
    const esc = (value: string): string =>
      String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const stats: [string, string][] = [];
    if (visible.achievements) stats.push([String((account.records?.achievements ?? []).length), '도전과제']);
    if (visible.badges) stats.push([String((account.records?.badges ?? []).length), '뱃지']);
    if (visible.activity) stats.push([String(activity.streak.longest), '최장 연속']);
    stats.push([String(store.followerCount(account.handle)), '팔로워']);

    const card = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">',
      '<rect width="1200" height="630" fill="#0f0f12"/>',
      '<rect x="1" y="1" width="1198" height="628" fill="none" stroke="#2a2a33" stroke-width="2"/>',
      `<text x="80" y="230" fill="#f4f4f6" font-family="sans-serif" font-size="72" font-weight="700">${esc(account.displayName)}</text>`,
      `<text x="80" y="290" fill="#a78bfa" font-family="sans-serif" font-size="34">@${esc(account.handle)}</text>`,
      account.card?.bio
        ? `<text x="80" y="350" fill="#b8b8c4" font-family="sans-serif" font-size="30">${esc(account.card.bio)}</text>`
        : '',
      ...stats.map(
        ([value, label], index) =>
          `<g transform="translate(${80 + index * 270}, 440)">` +
          `<text fill="#f4f4f6" font-family="sans-serif" font-size="56" font-weight="700">${esc(value)}</text>` +
          `<text y="42" fill="#8a8a99" font-family="sans-serif" font-size="26">${esc(label)}</text></g>`,
      ),
      '<text x="80" y="580" fill="#8a8a99" font-family="sans-serif" font-size="26">KarmoLab</text>',
      '</svg>',
    ].join('');

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    // 몇 분은 그대로 써도 된다 — 이 그림은 초 단위로 달라지는 것이 아니다.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(card);
  });

  /**
   * 명예의 전당 (TASK-KL-156 D4) — 연속·다녀간 날 상위.
   *
   * 프로필이나 발자국을 가린 사람은 애초에 안 들어간다. 가렸는데 순위표에 이름이 뜨면
   * 그건 가린 것이 아니다.
   */
  app.get('/kl/stats/leaders', (_req: Request, res: Response) => {
    res.json({ leaders: store.leaders() });
  });

  /**
   * 도전과제 희귀도 (TASK-KL-156 D1) — 전체 중 몇 %가 가졌나.
   *
   * 공개 값이다(누가 가졌는지는 안 나가고, 몇 명인지만 나간다). 계정이 적으면 비율 대신
   * 「아직 셀 수 없음」을 뜻하는 `enough:false` 로 답한다 — 셋 중 하나를 33%라고 말하면 착시다.
   */
  app.get('/kl/stats/achievements', (_req: Request, res: Response) => {
    res.json(store.achievementRarity());
  });

  /**
   * 막기·풀기 (TASK-KL-156 D2).
   *
   * 막으면 양쪽 팔로우가 함께 끊긴다 — 안 그러면 막아 놓고도 그쪽 피드에는 내 글이 계속 간다.
   * 막았다는 사실은 상대에게 안 알린다.
   */
  app.post('/kl/u/:handle/block', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const handle = String(req.params.handle ?? '');
    const on = (req.body ?? {}).on !== false;
    const blocked = store.setBlocked(account.id, handle, on);
    if (!blocked) {
      res.status(400).json({ error: 'cannot_block' });
      return;
    }
    res.json({ blocked: blocked.includes(handle.toLowerCase()), list: blocked });
  });

  /** 내가 막은 사람 목록. */
  app.get('/kl/me/blocked', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ blocked: store.blockedBy(account.id) });
  });

  /**
   * 주간 발자국 DM 켜고 끄기 (TASK-KL-156 D6).
   * 부르지도 않았는데 말 거는 일이라 기본은 꺼짐이고, 끄는 길이 켜는 자리와 같은 곳에 있다.
   */
  app.patch('/kl/me/weekly', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const on = store.setWeeklyDm(account.id, (req.body ?? {}).on !== false);
    res.json({ weekly: on, hasDiscord: !!account.identities?.discord });
  });

  /** 지금 켜져 있나. */
  app.get('/kl/me/weekly', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ weekly: store.weeklyDmOn(account.id), hasDiscord: !!account.identities?.discord });
  });

  /**
   * 프로필 공유 주소 (TASK-KL-156 D9) — `https://yawnbot.mascari4615.com/kl/u/:handle/card`.
   *
   * 왜 서버가 HTML 을 내보내나: 지금 프로필은 `/karmolab/u/?h=…` 라 **크롤러가 사람마다 다른
   * 미리보기 그림을 못 읽는다**(정적 파일 한 장이라 og 태그가 모두 같다). 카드 그림은 이미
   * 서버에 있는데 아무도 못 보는 상태였다.
   *
   * 사람은 이 주소를 열면 곧바로 원래 프로필로 간다. 크롤러는 여기서 og 태그만 읽고 떠난다.
   */
  app.get('/kl/u/:handle/card', (req: Request, res: Response) => {
    const handle = String(req.params.handle ?? '');
    const account = store.byHandle(handle);
    if (!account) {
      res.status(404).send('not found');
      return;
    }
    const visible = store.visibilityFor(account.id);
    if (!visible.profile) {
      res.status(403).send('private');
      return;
    }
    const esc = (value: string): string =>
      String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const target = `https://blog.mascari4615.com/karmolab/u/?h=${encodeURIComponent(account.handle)}`;
    const image = `https://yawnbot.mascari4615.com/kl/u/${encodeURIComponent(account.handle)}/card.svg`;
    const title = `${account.displayName} (@${account.handle}) — KarmoLab`;
    const description = account.card?.bio || 'KarmoLab 에서 이어 온 기록.';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      [
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(description)}">`,
        '<meta property="og:type" content="profile">',
        `<meta property="og:title" content="${esc(title)}">`,
        `<meta property="og:description" content="${esc(description)}">`,
        `<meta property="og:image" content="${esc(image)}">`,
        `<meta property="og:url" content="${esc(target)}">`,
        '<meta name="twitter:card" content="summary_large_image">',
        `<meta name="twitter:image" content="${esc(image)}">`,
        // 사람은 바로 넘어간다. 크롤러는 위 태그만 읽고 떠난다.
        `<meta http-equiv="refresh" content="0; url=${esc(target)}">`,
        `<link rel="canonical" href="${esc(target)}">`,
        `</head><body><p><a href="${esc(target)}">${esc(account.displayName)} 님의 프로필로 이동합니다.</a></p></body></html>`,
      ].join(''),
    );
  });

  /**
   * 계정 합치기 (TASK-KL-156 D8).
   *
   * 지금 로그인한 계정이 **받는 쪽**이고, 합칠 계정은 그 계정의 복구 코드로 증명한다 —
   * 남의 계정을 흡수할 수 없어야 하므로 「그 계정에 들어갈 수 있는 사람」만 합칠 수 있다.
   * 되돌릴 수 없다.
   */
  app.post('/kl/me/merge', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    // 합칠 쪽의 복구 코드. 이것이 곧 「그 계정이 내 것이다」의 증명이다.
    const other = store.consumeRecoveryCode((req.body ?? {}).code);
    if (!other) {
      res.status(401).json({ error: 'bad_code' });
      return;
    }
    if (other.id === account.id) {
      res.status(400).json({ error: 'same_account' });
      return;
    }
    const merged = store.mergeAccounts(account.id, other.id);
    if (!merged) {
      res.status(400).json({ error: 'cannot_merge' });
      return;
    }
    res.json({ account: store.publicProfile(merged), mergedHandle: other.handle });
  });

  /**
   * 보관 안내 (TASK-KL-156 D10).
   * 지우지 않는다 — 「얼마나 안 왔는지」를 본인이 볼 수 있게 하는 것까지다.
   */
  app.get('/kl/me/retention', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({
      idleDays: store.idleDaysOf(account.id),
      // 규칙은 코드와 화면이 **같은 말**을 해야 한다. 그래서 숫자를 서버가 내보낸다.
      policy: { dormantAfterDays: 365, deletesAutomatically: false },
    });
  });

  /**
   * 알림 한 통 — **받기로 한 사람에게만** (TASK-KL-175 E1).
   *
   * 끈 갈래는 쌓지도 않는다. 쌓아 두고 화면에서만 숨기면 「안 읽음 12」 같은 수가 계속 붙고,
   * 그 수를 없애려고 사람은 결국 종을 통째로 끈다.
   *
   * 거르는 자리를 여기 하나로 둔다 — 부르는 곳마다 검사를 적으면 한 곳은 반드시 빠뜨린다.
   */
  function notifyIfWanted(input: Parameters<typeof notes.notify>[0]): void {
    if (!store.wantsNotification(input.accountId, input.source)) return;
    notes.notify(input);
  }

  /**
   * 팔로잉·팔로워 목록 (TASK-KL-175 E5).
   * 로그인 없이도 볼 수 있다 — 프로필과 같은 성질의 공개 정보다. 맞팔 표시만 보는 사람에 따라 다르다.
   */
  app.get('/kl/u/:handle/follows', (req: Request, res: Response) => {
    const viewer = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const handle = String(req.params.handle ?? '');
    const target = store.byHandle(handle);
    if (!target) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!store.visibilityFor(target.id).profile && viewer?.id !== target.id) {
      res.status(403).json({ error: 'profile_private' });
      return;
    }
    res.json({
      following: store.followList(handle, 'following', viewer?.id ?? null),
      followers: store.followList(handle, 'followers', viewer?.id ?? null),
    });
  });

  /* ── 작업실 (TASK-KL-182 F3·F4) ──────────────────────────────────
   *
   * 프로필은 「무엇을 했나」까지 왔는데 **무엇을 만들었나**가 없었다. 도구로 만든 결과를
   * 걸면 프로필이 명함에서 작업실이 된다. 그림은 이미 있는 업로드 자리를 쓴다.
   */
  app.get('/kl/me/works', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ works: store.worksOf(account.id) });
  });

  app.post('/kl/me/works', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const works = store.addWork(account.id, { id: String(body.id ?? ''), title: body.title, toolId: body.toolId });
    if (!works) {
      res.status(400).json({ error: 'bad_work' });
      return;
    }
    res.json({ works });
  });

  app.delete('/kl/me/works/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ works: store.removeWork(account.id, String(req.params.id ?? '')) });
  });

  /** 남의 작업실 — 로그인 없이 볼 수 있다(프로필과 같은 성질). */
  app.get('/kl/u/:handle/works', (req: Request, res: Response) => {
    const works = store.publicWorks(String(req.params.handle ?? ''));
    res.json({ works: works ?? [] });
  });

  /**
   * 이번 주 미션 (TASK-KL-182 F1).
   *
   * 저장하는 것이 없다 — 미션 목록은 주 이름에서 계산되고 진행도는 발자국에서 그때그때 센다.
   * 두 벌로 적어 두면 갈라지고, 갈라진 순간 숫자가 거짓이 된다.
   */
  app.get('/kl/me/missions', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json(missionState(store, account.id));
  });

  /**
   * 시즌 순위 (TASK-KL-182 F2) — 판마다 메달을 주고 메달 수로 줄 세운다.
   * 점수를 섞지 않는다: 단위가 다른 수를 더하면 그 합은 아무 뜻이 없다.
   */
  app.get('/kl/play/season', (_req: Request, res: Response) => {
    res.json({ ranking: plays.seasonRanking() });
  });

  /** 이번 주 미션은 **모두에게 같다** — 로그인 없이도 무엇이 걸렸는지 볼 수 있어야 이야기가 된다. */
  app.get('/kl/missions', (_req: Request, res: Response) => {
    res.json({ missions: missionsOfWeek() });
  });

  /* ── 도구 흐름 (TASK-KL-181) ──────────────────────────────────────
   *
   * 저장하는 것은 **순서뿐**이다. 파일도 결과도 서버에 안 올라온다 — 우리 도구는 전부
   * 브라우저 안에서 돌고, 흐름은 그 순서를 적어 둔 종이 한 장이다.
   *
   * 보는 것은 로그인 없이. 만들고 고치는 것만 로그인 — 주소를 받은 사람이 못 열면
   * 「남에게 준다」가 성립하지 않는다.
   */
  const flows = getKarmolabFlowStore();

  app.get('/kl/flows', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    res.json({ flows: flows.list(), mine: account ? flows.byOwner(account.handle) : [] });
  });

  app.get('/kl/flows/:id', (req: Request, res: Response) => {
    const flow = flows.get(String(req.params.id ?? ''));
    if (!flow) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ flow });
  });

  app.post('/kl/flows', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const flow = flows.create(account.handle, { title: body.title, steps: body.steps });
    if (!flow) {
      // 왜 안 됐는지 말해 준다 — 조용히 실패하면 사람은 고장으로 읽는다.
      res.status(400).json({ error: 'bad_flow', titleMax: 40, stepMax: 8, perOwner: 30 });
      return;
    }
    res.json({ flow });
  });

  app.put('/kl/flows/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const flow = flows.update(String(req.params.id ?? ''), account.handle, req.body ?? {});
    if (!flow) {
      res.status(403).json({ error: 'not_owner' });
      return;
    }
    res.json({ flow });
  });

  app.delete('/kl/flows/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ removed: flows.remove(String(req.params.id ?? ''), account.handle) });
  });

  /** 남의 흐름을 내 것으로 담는다 (원본은 그대로). */
  app.post('/kl/flows/:id/fork', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const flow = flows.fork(String(req.params.id ?? ''), account.handle);
    if (!flow) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ flow });
  });

  /** 한 번 돌았다 — 이 수만이 「쓸모 있는 흐름」을 가려낸다. 로그인 없이도 센다. */
  app.post('/kl/flows/:id/run', (req: Request, res: Response) => {
    res.json({ runs: flows.noteRun(String(req.params.id ?? '')) });
  });

  /* ── 같이 쓰기 (TASK-KL-180) ──────────────────────────────────────
   *
   * 방 id = 지금 보고 있는 화면 id (도구든 게임이든 같다). 아무것도 저장하지 않는다 —
   * 지나간 커서 좌표는 값이 0 이다.
   *
   * 로그인은 필요 없다. 익명도 같이 쓸 수 있어야 「지금 여기 사람이 있다」가 성립한다.
   */
  const rooms = getKarmolabRoomStore();

  /** 방 id 로 받아들일 모양 — 주소에 그대로 들어가므로 좁게 잡는다. */
  function roomIdOf(raw: unknown): string | null {
    const id = String(raw ?? '');
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? id : null;
  }

  /** 이 창 하나의 이름표. 같은 사람이 창을 둘 열면 둘 다 보이는 게 맞다. */
  function memberIdOf(req: Request, tab: unknown): string {
    const safeTab = String(tab ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'tab';
    return `${visitorKeyFor(req)}:${safeTab}`;
  }

  app.get('/kl/room/:id/stream', (req: Request, res: Response) => {
    const roomId = roomIdOf(req.params.id);
    if (!roomId) {
      res.status(400).json({ error: 'bad_room' });
      return;
    }
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const id = memberIdOf(req, req.query.tab);
    const name = account?.displayName || chat.identityFor(visitorKeyFor(req)).name;
    const me = rooms.join(roomId, { id, name, handle: account?.handle ?? null, visitorKey: visitorKeyFor(req) });
    if (!me) {
      res.status(429).json({ error: 'too_many_tabs' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    req.socket.setNoDelay(true);

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // 붙자마자 그릴 것을 준다 — 나와 지금 있는 사람들.
    send('hello', { me, members: rooms.members(roomId).filter((m) => m.id !== id) });

    const unsubscribe = rooms.subscribe(roomId, (event: RoomEvent) => {
      // 내 커서는 내 화면이 이미 그리고 있다. 되돌려 보내면 두 개로 보인다.
      if ('id' in event && event.id === id) return;
      if (event.type === 'join' && event.member.id === id) return;
      send(event.type, event);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

    const close = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      rooms.leave(roomId, id);
      res.end();
    };
    req.on('close', close);
    res.on('error', close);
  });

  /** 커서가 움직였다. 저장하지 않고 그 방 사람들에게 흘려보내기만 한다. */
  app.post('/kl/room/:id/move', (req: Request, res: Response) => {
    const roomId = roomIdOf(req.params.id);
    if (!roomId) {
      res.status(400).json({ error: 'bad_room' });
      return;
    }
    const body = req.body ?? {};
    const moved = rooms.move(roomId, memberIdOf(req, body.tab), body.x, body.y, body.active !== false);
    res.json({ moved });
  });

  /** 어느 화면에 몇 명이 같이 있나 — 광장에 낼 수 있는 값. */
  app.get('/kl/rooms', (_req: Request, res: Response) => {
    res.json({ rooms: rooms.snapshot() });
  });

  /** 내가 받을 알림 갈래 (TASK-KL-175 E1). */
  app.get('/kl/me/notify-prefs', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ prefs: store.notifyPrefsOf(account.id) });
  });

  app.patch('/kl/me/notify-prefs', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const prefs = store.setNotifyPrefs(account.id, req.body);
    if (!prefs) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ prefs });
  });

  /* ── 패스키 (TASK-KL-156 D7) ──────────────────────────────────────
   *
   * 들어오는 문이 디스코드 하나뿐이면 그 문이 잠기는 날 계정을 잃는다. 패스키는 기기가 열쇠라
   * 외부 등록도 secret 도 필요 없다 — 도메인만 있으면 된다.
   *
   * 도전값은 **메모리에만, 몇 분만** 산다. 한 번 쓰면 버린다(같은 답을 두 번 못 쓰게).
   */
  const passkeyChallenges = new Map<string, { challenge: string; expiresAt: number }>();

  function issueChallenge(key: string): string {
    const challenge = bufToB64url(crypto.randomBytes(32));
    passkeyChallenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    return challenge;
  }

  function takeChallenge(key: string): string | null {
    const found = passkeyChallenges.get(key);
    passkeyChallenges.delete(key);
    if (!found || found.expiresAt <= Date.now()) return null;
    return found.challenge;
  }

  /** 등록 시작 — 로그인한 사람만. 이미 있는 열쇠는 제외해 같은 기기를 두 번 담지 않는다. */
  app.post('/kl/me/passkeys/challenge', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({
      challenge: issueChallenge(`reg:${account.id}`),
      rp: { id: RP_ID, name: RP_NAME },
      user: { id: bufToB64url(Buffer.from(account.id)), name: account.handle, displayName: account.displayName },
      exclude: store.passkeysOf(account.id).map((key) => key.id),
    });
  });

  /** 등록 마무리 — 브라우저가 만든 것을 확인하고 담는다. */
  app.post('/kl/me/passkeys', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const challenge = takeChallenge(`reg:${account.id}`);
    if (!challenge) {
      res.status(400).json({ error: 'challenge_expired' });
      return;
    }
    const body = req.body ?? {};
    try {
      const passkey = verifyRegistration({
        challenge,
        clientDataJSON: String(body.clientDataJSON ?? ''),
        attestationObject: String(body.attestationObject ?? ''),
        label: String(body.label ?? deviceLabel(req.headers['user-agent'])),
      });
      if (!store.addPasskey(account.id, passkey)) {
        res.status(409).json({ error: 'already_registered' });
        return;
      }
      store.noteEvent(account.id, 'login', { device: passkey.label, detail: '패스키 등록' });
      res.json({ passkeys: store.passkeysOf(account.id) });
    } catch (error) {
      // 왜 틀렸는지 자세히 알려 주지 않는다 — 찍어 보는 데 쓰인다.
      console.warn('[karmolab-api] 패스키 등록 실패:', error instanceof Error ? error.message : error);
      res.status(400).json({ error: 'bad_passkey' });
    }
  });

  /** 내 패스키 목록 (공개키는 안 나간다). */
  app.get('/kl/me/passkeys', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ passkeys: store.passkeysOf(account.id) });
  });

  /** 패스키 지우기. 마지막 하나여도 막지 않는다 — 디스코드와 복구 코드가 남아 있다. */
  app.delete('/kl/me/passkeys/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const removed = store.removePasskey(account.id, String(req.params.id ?? ''));
    res.json({ removed, passkeys: store.passkeysOf(account.id) });
  });

  /** 로그인 시작 — 로그인 전이라 도전값은 쿠키 없이 브라우저가 그대로 돌려준다. */
  app.post('/kl/auth/passkey/challenge', (_req: Request, res: Response) => {
    const key = crypto.randomUUID();
    res.json({ key, challenge: issueChallenge(`auth:${key}`), rpId: RP_ID });
  });

  /**
   * 패스키로 로그인.
   * 누구인지 미리 안 물어도 된다 — 자격증명 id 하나로 계정을 찾는다.
   */
  app.post('/kl/auth/passkey', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const challenge = takeChallenge(`auth:${String(body.key ?? '')}`);
    if (!challenge) {
      res.status(400).json({ error: 'challenge_expired' });
      return;
    }
    const found = store.accountForPasskey(String(body.id ?? ''));
    if (!found) {
      res.status(401).json({ error: 'bad_passkey' });
      return;
    }
    try {
      const signCount = verifyAssertion({
        challenge,
        clientDataJSON: String(body.clientDataJSON ?? ''),
        authenticatorData: String(body.authenticatorData ?? ''),
        signature: String(body.signature ?? ''),
        passkey: found.passkey,
      });
      store.notePasskeyUse(found.account.id, found.passkey.id, signCount);
      const device = deviceLabel(req.headers['user-agent']);
      const { token, expiresAt } = store.createSession(found.account.id, device);
      store.noteEvent(found.account.id, 'login', { device, detail: '패스키' });
      setSessionCookie(res, token, expiresAt - Date.now());
      res.json({ account: store.publicProfile(found.account) });
    } catch (error) {
      console.warn('[karmolab-api] 패스키 로그인 실패:', error instanceof Error ? error.message : error);
      res.status(401).json({ error: 'bad_passkey' });
    }
  });

  /** 내 공개 범위 (TASK-KL-152 C4). */
  app.get('/kl/me/visibility', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ visibility: store.visibilityFor(account.id) });
  });

  /** 공개 범위 바꾸기 — 보낸 칸만 바뀐다. */
  app.patch('/kl/me/visibility', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const visibility = store.setVisibility(account.id, req.body);
    if (visibility) {
      const off = Object.entries(visibility).filter(([, on]) => !on).map(([key]) => key);
      store.noteEvent(account.id, 'visibility-changed', { detail: off.length ? `가림: ${off.join(', ')}` : '전부 공개' });
    }
    if (!visibility) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ visibility });
  });

  /** 지금 살아 있는 내 로그인들. 「어디서 로그인돼 있나」를 볼 수 있어야 끊을 수도 있다. */
  app.get('/kl/me/sessions', (req: Request, res: Response) => {
    const token = readCookie(req, SESSION_COOKIE);
    const account = store.accountForSession(token);
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ sessions: store.sessionsFor(account.id, token) });
  });

  /** 지금 쓰는 것만 남기고 나머지 로그인을 끊는다 (기기를 잃어버렸을 때의 유일한 수단). */
  app.post('/kl/me/sessions/revoke-others', (req: Request, res: Response) => {
    const token = readCookie(req, SESSION_COOKIE);
    const account = store.accountForSession(token);
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ revoked: store.revokeOtherSessions(account.id, token) });
  });

  /**
   * 내 것 전부 내려받기.
   *
   * 「기록이 남는다」는 약속은, 그 기록을 **가지고 나갈 수 있을 때** 비로소 약속이 된다.
   * 못 가지고 나가는 기록은 맡긴 것이 아니라 잡힌 것이다.
   */
  app.get('/kl/me/export', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const activity = traces.activityOf(account.handle);
    res.setHeader('Content-Disposition', `attachment; filename="karmolab-${account.handle}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      account: {
        handle: account.handle,
        displayName: account.displayName,
        joinedAt: account.createdAt,
        // 디스코드 id 는 안 넣는다 — 이 파일이 남에게 넘어가도 계정이 드러나면 안 된다.
        loginMethods: Object.keys(account.identities),
      },
      records: account.records,
      community: activity,
    });
  });

  /**
   * 계정 지우기. **되돌릴 수 없다.**
   *
   * 계정·기록·로그인은 사라진다. 이미 남긴 글은 남기되 **누가 썼는지를 지운다** —
   * 답글이 달린 글을 통째로 지우면 남의 답글이 뜻을 잃는다. 대화는 혼자 만든 것이 아니다.
   * 그 사실을 부르는 쪽(화면)에서 먼저 밝히고 확인을 받는다.
   */
  app.delete('/kl/me', (req: Request, res: Response) => {
    const token = readCookie(req, SESSION_COOKIE);
    const account = store.accountForSession(token);
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const touched = traces.forgetAuthor(account.id);
    traces.flush();
    store.deleteAccount(account.id);
    clearSessionCookie(res);
    res.json({ ok: true, postsKept: touched });
  });

  // ── 흔적 원장 (Cycle 2) — 남의 자국이 보이는 자리 ────────────────────────
  //
  // 여기 숫자는 전부 실제로 일어난 일이다. 초반에는 작을 것이고, 작은 게 맞다.
  // 지어낸 수를 넣는 순간 이 자리 전체가 못 믿을 것이 된다.

  /**
   * 도구가 열렸다. 로그인과 무관하다 — 그냥 지나간 사람의 자국도 사이트의 자국이다.
   *
   * **사람만 센다 (TASK-KL-112).** 바로 아래 방문 세는 자리는 처음부터 봇을 가려냈는데
   * 여기만 안 가려냈다. 그래서 같은 하루에 「다녀간 사람 17」 과 「도구 열림 5,545」 라는
   * 말이 안 되는 두 수가 나란히 떴다. 우리 점검이 도구 전체를 한 바퀴 돌 때마다 138개가
   * 통째로 +1 되고 있었던 것이다 — 실제로 도구 130개가 **똑같이 48번**이었다.
   *
   * 그 수는 첫 화면에 「이번 주에 많이 쓴 도구」로 공개된다. 로봇이 만든 순위를 사람에게
   * 보여 주면 그건 자랑이 아니라 거짓말이다. 방문 쪽과 같은 잣대를 쓴다.
   */
  app.post('/kl/trace/tool', (req: Request, res: Response) => {
    const toolId = (req.body ?? {}).toolId;
    if (!isValidToolId(toolId)) {
      res.status(400).json({ error: 'bad_tool_id' });
      return;
    }
    const kind = classifyVisitor(req.headers['user-agent']);
    if (kind !== 'human') {
      res.json({ counted: false, kind });
      return;
    }
    const counted = traces.recordToolOpen(toolId, visitorKeyFor(req));
    // 로그인했으면 **내 것으로도** 적는다 (TASK-KL-152 C1). 익명 집계는 그대로 — 두 벌은 쓰임이 다르다.
    const sessionToken = readCookie(req, SESSION_COOKIE);
    const account = store.accountForSession(sessionToken);
    if (account) {
      store.noteFootprint(account.id, { toolId });
      // 이 로그인이 아직 쓰이고 있다는 표시 (TASK-KL-152 C6). 하루 한 번만 저장된다.
      store.touchSession(sessionToken);
    }
    res.json({ counted, kind });
  });

  /**
   * 누가 사이트에 왔다 — 도구를 열든 안 열든. 첫 화면만 보고 나간 사람도 다녀간 사람이다.
   * 로그인과 무관하고, 주소는 저장하지 않는다 (되돌릴 수 없게 섞은 열쇠만 오늘치).
   */
  app.post('/kl/trace/visit', (req: Request, res: Response) => {
    // 누가 왔는지 가려서 센다 — 검색봇·AI 를 사람으로 세면 공개해 놓은 수가 거짓말이 된다.
    // 버리지는 않는다. 종류별로 나눠서 그대로 공개한다.
    const kind = classifyVisitor(req.headers['user-agent']);
    const counted = traces.recordVisit(visitorKeyFor(req), kind);
    /* 도구를 안 연 날도 **온 날이다** (TASK-KL-152 C1). 도구 연 것만 세면 「그냥 둘러본 날」이
     * 잔디에서 빈칸이 되고, 연속 기록이 사실과 다르게 끊긴다. */
    if (kind === 'human') {
      const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
      if (account) store.noteFootprint(account.id, {});
    }
    res.json({ counted, kind });
  });

  /**
   * 「지금 보고 있어요」 — 몇 분에 한 번씩 알려 온다.
   *
   * 저장하지 않는다. 사람만 센다 (봇은 화면을 보고 있는 게 아니다).
   */
  app.post('/kl/presence', (req: Request, res: Response) => {
    const kind = classifyVisitor(req.headers['user-agent']);
    // 로그인한 사람은 계정에도 시각을 적는다 (TASK-KL-156 D5) — 프로필의 「지금 접속 중」이
    // 이 값 하나로 판정된다. 본인이 켜 두지 않았으면 그 값은 남에게 안 나간다.
    if (kind === 'human') {
      const viewer = store.accountForSession(readCookie(req, SESSION_COOKIE));
      if (viewer) store.touchPresence(viewer.id);
    }
    const online =
      kind === 'human' ? traces.touchPresence(visitorKeyFor(req)) : traces.presenceCount();
    res.json({ online });
  });

  /**
   * 주간 결산 — 「이번 주 KarmoLab」. 통계 페이지에 함께 붙는다.
   * 새로 저장하는 값은 없다. 이미 세고 있는 것에서 그때그때 계산한다.
   */
  app.get('/kl/recap', (_req: Request, res: Response) => {
    res.json({ recap: traces.weeklyRecap() });
  });

  /** 공개 집계 — 어느 도구가 실제로 쓰이는가. 한 번도 안 열린 도구는 아예 안 나온다. */
  app.get('/kl/tools/stats', (_req: Request, res: Response) => {
    res.json({ tools: traces.toolStats(), pulse: traces.pulse(), visits: traces.visitStats() });
  });

  // ── 놀이 기록 (TASK-KL-148) ────────────────────────────────────────────────
  //
  // 한 판이 끝나면 남는 자리. **순위 방향은 서버만 안다** — 반응속도는 작을수록, 연승은
  // 클수록 좋다. 화면은 자기 숫자를 그리기만 한다(두 곳에 적으면 그날부터 갈라진다).
  //
  // 로그인해야 서버에 남는다. 안 한 사람도 놀이는 그대로 되고(이 브라우저 최고만 뜬다),
  // 서버가 죽어도 마찬가지다 — 놀이 여섯의 생사를 노트북 한 대에 걸지 않는다.

  /** 겨룰 수 있는 놀이와 그 규칙 + 지금까지 몇 명이 겨뤘나. */
  app.get('/kl/play/games', (_req: Request, res: Response) => {
    res.json({ games: plays.stats() });
  });

  /** 한 판 결과. 로그인 안 했으면 401 — 화면은 그걸 받고 로컬 최고만 보여 준다. */
  app.post('/kl/play', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const spec = playGame(body.game);
    if (!spec) {
      res.status(400).json({ error: 'unknown_game' });
      return;
    }
    // 사람이 만든 판인지부터. 여기서 안 거르면 순위판 1등이 로봇이 된다.
    if (classifyVisitor(req.headers['user-agent']) !== 'human') {
      res.json({ counted: false });
      return;
    }
    // 표가 갈리는 놀이(높은 쪽 고르기)는 어느 표로 놀았는지가 있어야 순위가 성립한다 —
    // 없으면 쉬운 표를 고른 사람이 1등이 된다.
    const variant = typeof body.variant === 'string' ? body.variant : null;
    const outcome = plays.record(spec.id, account.handle, Number(body.score), new Date(), variant);
    if (!outcome) {
      res.status(400).json({
        error: spec.variants && !isValidVariant(variant) ? 'bad_variant' : 'bad_score',
        min: spec.min,
        max: spec.max,
        unit: spec.unit,
      });
      return;
    }
    res.json({ counted: true, outcome, board: plays.board(spec.id, 'all', 5, new Date(), outcome.variant) });
  });

  /** 순위판 — 역대(all) 또는 오늘(day). 아무도 안 논 놀이는 빈 목록이다(0 을 꾸며 내지 않는다). */
  app.get('/kl/play/board', (req: Request, res: Response) => {
    const spec = playGame(req.query.game);
    if (!spec) {
      res.status(400).json({ error: 'unknown_game' });
      return;
    }
    const period = req.query.period === 'day' ? 'day' : 'all';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const variant = typeof req.query.variant === 'string' ? req.query.variant : null;
    if (spec.variants && !isValidVariant(variant)) {
      res.status(400).json({ error: 'bad_variant' });
      return;
    }
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    res.json({
      game: spec.id,
      variant: spec.variants ? variant : null,
      label: spec.label,
      unit: spec.unit,
      better: spec.better,
      period,
      entries: plays.board(spec.id, period, limit, new Date(), variant),
      // 내가 순위 밖이어도 내 자리는 알려 준다 — 없으면 「나는 어디쯤인가」를 영영 모른다.
      // 핸들을 같이 주는 이유: 순위판에서 **내 줄에 색을 넣으려면** 어느 줄이 나인지 알아야 한다.
      me: account
        ? (() => {
            const found = plays
              .me(account.handle)
              .find((m) => m.game === spec.id && m.variant === (spec.variants ? variant : null));
            return found ? { handle: account.handle, ...found } : null;
          })()
        : null,
      signedIn: Boolean(account),
    });
  });

  // ── 사람이 만든 표 (TASK-KL-150 · 게임 커스텀/UGC) ─────────────────────────
  //
  // 표가 주소를 갖는 순간 셋이 한꺼번에 풀린다: 남에게 주기 · 고치면 남도 갱신 · 같은 표로
  // 논 사람끼리 겨루기(`pack:<id>` 를 놀이 기록 원장의 표 이름으로 그대로 넘긴다).

  /** 표 하나를 그대로 — 놀이가 이걸 받아 판을 짠다. 열린 횟수도 여기서 센다. */
  app.get('/kl/packs/:id', (req: Request, res: Response) => {
    const pack = packs.get(req.params.id);
    if (!pack) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    // 로봇이 긁어 간 것을 「열렸다」로 세면 인기 순위가 거짓말이 된다.
    if (classifyVisitor(req.headers['user-agent']) === 'human') packs.noteOpen(pack.id, visitorKeyFor(req));
    res.json({ pack });
  });

  /**
   * 월드컵 한 판의 결과 (TASK-KL-151) — 항목별 「마주쳤나 / 골라졌나」.
   *
   * 로그인은 안 받는다: 이건 **표의 통계**지 사람의 기록이 아니다. 대신 사람만 세고,
   * 같은 사람이 한 표에 연달아 보내는 것은 10분 안에는 안 센다.
   */
  app.post('/kl/packs/:id/tournament', (req: Request, res: Response) => {
    const pack = packs.get(req.params.id);
    if (!pack) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (classifyVisitor(req.headers['user-agent']) !== 'human') {
      res.json({ counted: 0 });
      return;
    }
    const body = req.body ?? {};
    const counted = packs.recordTournament(
      pack.id,
      Array.isArray(body.matches) ? body.matches : [],
      body.champion,
      visitorKeyFor(req),
    );
    res.json({ counted, tally: packs.tally(pack.id, 20) });
  });

  /** 표의 항목 순위 — 실제로 붙어 본 항목만. 아직 아무도 안 돌렸으면 빈 목록. */
  app.get('/kl/packs/:id/tally', (req: Request, res: Response) => {
    const pack = packs.get(req.params.id);
    if (!pack) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ tally: packs.tally(pack.id, Math.min(100, Math.max(1, Number(req.query.limit) || 20))) });
  });

  /**
   * 표 목록. 놀이가 「내가 걸 수 있는 표만」 달라고 할 수 있다 —
   * 못 거는 표가 목록에 서면 눌러 보고서야 안 된다는 걸 알게 된다.
   */
  app.get('/kl/packs', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const mine = req.query.mine === '1';
    if (mine && !account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({
      packs: packs.list({
        sort: req.query.sort === 'new' ? 'new' : 'popular',
        owner: mine ? account!.handle : undefined,
        needsNumber: req.query.needs === 'number',
        needsImage: req.query.needs === 'image',
        query: typeof req.query.q === 'string' ? req.query.q : undefined,
        limit: Number(req.query.limit) || undefined,
      }),
      signedIn: Boolean(account),
      // 전체 규모는 `total` 안에 넣는다. 펼쳐서 넣으면 `packs`(목록)를 `packs`(개수)가
      // 덮어써서 목록이 통째로 숫자가 된다 — 화면은 빈 목록으로 보이고 오류는 안 난다.
      total: packs.stats(),
    });
  });

  /**
   * 바깥에서 길어 오는 표 — 어떤 우물이 있나 (TASK-KL-153).
   *
   * 목록과 표를 나눈 이유: 화면이 「고를 것」을 보여 주는 데 100개짜리 표 다섯 벌이 필요하지
   * 않다. 고른 다음에만 길어 온다.
   *
   * 오늘의 표도 여기서 말한다 — 화면이 날짜 계산을 따로 하면 서버와 하루가 어긋난다.
   */
  app.get('/kl/wells', (_req: Request, res: Response) => {
    const today = wellOfTheDay(wellKstDay());
    res.json({
      day: wellKstDay(),
      today: today.id,
      wells: WELLS.map((well) => ({
        id: well.id,
        title: well.title,
        emoji: well.emoji,
        desc: well.desc,
        // 이미 길어 둔 표면 몇 개짜리인지 바로 말해 준다 — 안 길어 왔으면 굳이 지금 가지 않는다.
        items: wells.peek(well.id)?.items.length ?? null,
      })),
    });
  });

  /**
   * 표 한 벌. **로그인이 필요 없다** — 남의 공개 숫자를 옮겨 주는 일이고, 놀이는 로그인 없이도 된다.
   *
   * 바깥이 죽으면 지난 표를 `stale: true` 와 함께 준다. 화면은 그걸 보고 「몇 시 기준」만 다르게
   * 적으면 된다 — 놀이는 그대로 굴러간다.
   */
  app.get('/kl/wells/pack', async (req: Request, res: Response) => {
    // `today` 로 부르면 오늘의 표 — 화면이 날짜를 따로 세지 않게.
    const asked = req.query.well === 'today' ? wellOfTheDay(wellKstDay()).id : req.query.well;
    const well = wellById(asked);
    if (!well) {
      res.status(400).json({ error: 'unknown_well', wells: WELLS.map((w) => w.id) });
      return;
    }
    try {
      const pack = await wells.get(well);
      // 브라우저·터널이 한 번 더 안 나가게. 서버 캐시(6h)와 어긋나도 손해가 없는 숫자다.
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json({ pack });
    } catch {
      // 한 번도 못 길어 왔다 — 없는 표를 지어내지 않는다.
      res.status(503).json({ error: 'well_unavailable' });
    }
  });

  /**
   * 내 스팀 서재 → 표 (TASK-KL-153 C).
   *
   * 우물과 자리를 나눈 이유: 우물은 모두에게 같은 표라 캐시가 하나면 되지만, 서재는 사람마다
   * 다르다. 같은 자리에 끼우면 한 사람의 서재가 캐시에 눌러앉아 남에게 나간다.
   *
   * 열쇠가 없으면 **이 길만** 닫힌다(501) — 우물 다섯은 그대로 돈다. 「고장」이 아니라
   * 「아직 안 켰다」로 말한다.
   */
  app.get('/kl/steam/library', async (req: Request, res: Response) => {
    const who = typeof req.query.who === 'string' ? req.query.who : '';
    try {
      const pack = await library.pack(who);
      res.json({ pack });
    } catch (err) {
      const code = err instanceof LibraryError ? err.code : 'failed';
      // 열쇠 없음만 501(아직 안 켠 기능), 나머지는 사람이 고칠 수 있는 400 이다.
      res.status(code === 'no_key' ? 501 : 400).json({ error: code });
    }
  });

  /** 표를 올린다 — 로그인해야 한다. 남의 표를 고치는 게 아니라 **이어받을** 때도 여기로 온다. */
  app.post('/kl/packs', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const forkOf = typeof body.forkOf === 'string' ? body.forkOf : null;
    try {
      res.json({ pack: packs.create(account.handle, body, forkOf) });
    } catch (error) {
      sendPackError(res, error);
    }
  });

  /** 고친다 — 주인만. */
  app.put('/kl/packs/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    try {
      res.json({ pack: packs.update(account.handle, String(req.params.id), req.body ?? {}) });
    } catch (error) {
      sendPackError(res, error);
    }
  });

  /** 내린다 — 주인이거나 주인장. 순위 기록은 안 지운다(그 사람들이 실제로 논 것이다). */
  app.delete('/kl/packs/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    try {
      const gone = packs.remove(account.handle, String(req.params.id), isAdminAccount(account));
      if (!gone) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      sendPackError(res, error);
    }
  });

  /**
   * 방금 무슨 일이 있었나 (TASK-KL-151 ③) — 최근 판 · 새로 올라온 표.
   *
   * 광장이 숫자만 보여 주고 있었다. 숫자는 「사람이 있다」를 말하지만 **누가 방금 뭘 했는지**는
   * 말하지 못한다. 원장에 이미 쌓고 있는 것을 그대로 내보낸다 — 새로 세는 값 0.
   *
   * 아직 아무 일도 없었으면 빈 목록이다. 0 을 꾸며 내지 않는다.
   */
  app.get('/kl/feed', (req: Request, res: Response) => {
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 10));
    res.json({
      plays: plays.recent(limit).map((p) => ({
        game: p.game,
        variant: p.variant,
        handle: p.handle,
        score: p.score,
        at: p.at,
        best: p.best,
      })),
      games: plays.stats().filter((g) => g.plays > 0),
      packs: packs.list({ sort: 'new', limit: 5 }),
    });
  });

  /** 내 전 종목 최고. 논 적 없는 종목은 안 나온다. */
  app.get('/kl/play/me', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    res.json({ handle: account.handle, records: plays.me(account.handle) });
  });

  /** 어떤 갤러리가 있고, 각 갤러리가 얼마나 살아 있나 (글 수 · 마지막 글 · 마지막 시각). */
  app.get('/kl/boards', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const summaries = traces.boardSummaries();
    res.json({
      boards: traces.galleries().map((g) => {
        const found = summaries[g.id] ?? { count: 0, lastTitle: null, lastAt: null };
        return {
          ...g,
          count: found.count,
          lastTitle: found.lastTitle,
          lastAt: found.lastAt,
          // 지울 수 있는 사람에게만 지우기 단추를 보여 주려고 (막는 것은 아래 라우트가 한다).
          canDelete:
            !g.builtin &&
            found.count === 0 &&
            Boolean(account) &&
            (isAdminAccount(account) || g.createdByHandle === account?.handle),
        };
      }),
      signedIn: Boolean(account),
      labelMaxLength: GALLERY_LABEL_MAX,
      descMaxLength: GALLERY_DESC_MAX,
    });
  });

  /** 갤러리를 만든다 — 로그인한 사람이면 누구나. */
  app.post('/kl/boards', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const label = String(body.label ?? '').trim();
    const desc = String(body.desc ?? '').trim();
    // 주소를 안 적었으면 이름에서 만들어 본다 (한글 이름이면 못 만드니 그때만 직접 받는다).
    const id = String(body.id ?? '').trim() || slugifyGalleryId(label);

    if (label.length < 1 || label.length > GALLERY_LABEL_MAX) {
      res.status(400).json({ error: 'bad_label', maxLength: GALLERY_LABEL_MAX });
      return;
    }
    if (desc.length > GALLERY_DESC_MAX) {
      res.status(400).json({ error: 'bad_desc', maxLength: GALLERY_DESC_MAX });
      return;
    }
    if (!isValidGalleryId(id)) {
      res.status(400).json({ error: 'bad_id' });
      return;
    }
    if (traces.gallery(id)) {
      res.status(409).json({ error: 'already_exists' });
      return;
    }
    if (traces.galleriesTodayBy(account.handle) >= GALLERY_DAILY_LIMIT) {
      res.status(429).json({ error: 'daily_limit', limit: GALLERY_DAILY_LIMIT });
      return;
    }

    const created = traces.addGallery({ id, label, desc, handle: account.handle });
    if (!created) {
      res.status(409).json({ error: 'already_exists' });
      return;
    }
    traces.flush();
    res.json({ id: created.id });
  });

  /** 갤러리의 말머리를 정한다 — 만든 사람이나 주인만. */
  app.put('/kl/boards/:id/tags', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const raw = (req.body ?? {}).tags;
    if (!Array.isArray(raw)) {
      res.status(400).json({ error: 'bad_tags', maxCount: TAG_MAX_COUNT, maxLength: TAG_MAX_LEN });
      return;
    }
    const outcome = traces.setGalleryTags(
      String(req.params.id ?? ''),
      raw.map((t: unknown) => String(t)),
      account.handle,
      isAdminAccount(account),
    );
    if (outcome !== 'ok') {
      res.status(outcome === 'not_found' ? 404 : 403).json({ error: outcome });
      return;
    }
    traces.flush();
    res.json({ ok: true });
  });

  /**
   * 갤러리 성격 바꾸기 — 「이슈식으로 쓸래」 (사용자: "원한다면 갤러리를 깃허브 이슈 식으로").
   *
   * 만든 사람과 주인만. 껐다 켜도 글은 안 다친다 — 상태·번호는 원래 모든 글이 들고 있고,
   * 이슈식은 그걸 화면에 보여줄지를 정할 뿐이다.
   */
  app.patch('/kl/boards/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const boardId = String(req.params.id ?? '');
    const gallery = traces.gallery(boardId);
    if (!gallery) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!isAdminAccount(account) && gallery.createdByHandle !== account.handle) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const updated = traces.setGalleryStyle(boardId, { issueStyle: (req.body ?? {}).issueStyle });
    traces.flush();
    res.json({ ok: true, gallery: updated });
  });

  /** 갤러리를 지운다 — 빈 갤러리만. 글이 있는데 지우면 그 글들이 갈 곳을 잃는다. */
  app.delete('/kl/boards/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const outcome = traces.deleteGallery(String(req.params.id ?? ''), account.handle, isAdminAccount(account));
    if (outcome !== 'ok') {
      res.status(outcome === 'not_found' ? 404 : outcome === 'not_empty' ? 409 : 403).json({ error: outcome });
      return;
    }
    traces.flush();
    res.json({ ok: true });
  });

  /** 판 하나의 글 목록. 보는 건 로그인 없이 된다. */
  app.get('/kl/posts', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const requested = typeof req.query.board === 'string' ? req.query.board : 'free';
    const gallery = traces.gallery(requested);
    if (!gallery) {
      res.status(404).json({ error: 'no_such_gallery' });
      return;
    }
    const sort = isPostSort(req.query.sort) ? req.query.sort : 'recent';
    // 말머리로 거르기 — 그 갤러리가 가진 말머리일 때만. 없는 말머리를 주면 통째로 빈 목록이 되어
    // 「글이 없다」로 잘못 읽힌다.
    const tag = typeof req.query.tag === 'string' && gallery.tags.includes(req.query.tag) ? req.query.tag : null;
    res.json({
      board: gallery.id,
      gallery,
      sort,
      tag,
      posts: traces.publicPosts(gallery.id, account?.id ?? null, sort, tag),
      signedIn: Boolean(account),
      isAdmin: isAdminAccount(account),
      myHandle: account?.handle ?? null,
      /* 오늘의 내 이름표 — 익명으로 올릴 때 **미리** 보여 준다 (TASK-KL-157).
         올리고 나서야 어떤 이름으로 나갔는지 알게 되면 되돌릴 수가 없다. */
      myAnon: anonFaceFor(req),
      /* 로그인 없이도 쓴다 (익명). 공지판만 주인 몫으로 남는다 —
         예전에는 여기서 로그인을 요구해서, 채팅으로 들어온 사람이 글은 못 쓰는 턱이 있었다. */
      canWrite: !gallery.ownerOnly || isAdminAccount(account),
      maxLength: maxLenFor(gallery),
      titleMaxLength: TITLE_MAX_LEN,
      replyMaxLength: REPLY_MAX_LEN,
    });
  });

  /** 첫 화면에 띄우는 최근 글 — 판을 가리지 않는다. */
  app.get('/kl/recent', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const limit = Math.min(Math.max(1, Number(req.query.limit ?? 3) || 3), 20);
    // `kind=best` = 반응이 모인 글만 (아카의 「베스트 라이브」 자리).
    const posts =
      req.query.kind === 'best'
        ? traces.bestPosts(limit, account?.id ?? null)
        : traces.recentPosts(limit, account?.id ?? null);
    res.json({ posts });
  });

  /**
   * 글 하나. 주소로 바로 열리므로 로그인 없이 보이고, 열릴 때 조회수를 센다.
   *
   * **사람만 센다 (TASK-KL-113).** 도구 열림에서 같은 구멍을 막고 나서 훑어 보니 여기도
   * 안 거르고 있었다. 글마다 붙는 조회수는 글쓴이가 보는 숫자다 — 검색봇이 훑고 간 것을
   * 「사람이 읽었다」로 보여 주면, 아무도 안 읽었는데 읽혔다고 믿게 만든다.
   */
  app.get('/kl/posts/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (classifyVisitor(req.headers['user-agent']) === 'human') {
      traces.recordPostView(String(req.params.id ?? ''), visitorKeyFor(req));
    }
    const post = traces.publicPost(String(req.params.id ?? ''), account?.id ?? null);
    if (!post) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({
      post,
      signedIn: Boolean(account),
      isAdmin: isAdminAccount(account),
      myHandle: account?.handle ?? null,
      myAnon: anonFaceFor(req),
      replyMaxLength: REPLY_MAX_LEN,
    });
  });

  app.post('/kl/posts', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const body = req.body ?? {};
    const writer = writerFor(req, account, body.anon === true);
    if (writer.error) {
      res.status(writer.status).json({ error: writer.error });
      return;
    }
    const gallery = traces.gallery(String(body.board ?? 'free'));
    if (!gallery) {
      res.status(404).json({ error: 'no_such_gallery' });
      return;
    }
    // 공지는 주인만 쓴다. 막을 거면 서버가 막아야 한다 — 화면에서 숨기는 것은 잠금이 아니다.
    // 익명은 여기 못 들어온다 (익명 공지는 공지가 아니다).
    if (gallery.ownerOnly && (writer.anon !== null || !isAdminAccount(account))) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const text = String(body.text ?? '').trim();
    const title = String(body.title ?? '').trim();

    // 한 글자짜리 글도 글이다 (「ㅋ」). 막을 것은 빈 글뿐이다.
    if (text.length < 1 || text.length > maxLenFor(gallery)) {
      res.status(400).json({ error: 'bad_text', maxLength: maxLenFor(gallery) });
      return;
    }
    // 한 줄짜리 갤러리(요청판)는 제목이 없다. 나머지는 제목이 있어야 목록이 읽힌다.
    if (gallery.titled && (title.length < 1 || title.length > TITLE_MAX_LEN)) {
      res.status(400).json({ error: 'bad_title', maxLength: TITLE_MAX_LEN });
      return;
    }
    if (traces.postsTodayBy(writer.accountId, gallery.id) >= dailyLimitFor(gallery)) {
      // 막을 때는 왜 막혔는지 말해 준다. 조용히 실패하면 사람은 고장으로 읽는다.
      res.status(429).json({ error: 'daily_limit', limit: dailyLimitFor(gallery) });
      return;
    }

    // 말머리는 그 갤러리가 가진 것 중에서만. 아무 글자나 받으면 거르는 줄이 쓰레기로 찬다.
    const tag = typeof body.tag === 'string' && gallery.tags.includes(body.tag) ? body.tag : null;
    const created = traces.addPost({
      board: gallery.id,
      title: gallery.titled ? title : null,
      text,
      accountId: writer.accountId,
      handle: writer.handle,
      tag,
      anon: writer.anon,
    });
    traces.flush();

    /* 따라가는 사람들에게 알린다 (TASK-KL-156 D3).
     * 종은 있었지만 울릴 일이 커뮤니티(내 글에 달린 답글)뿐이었다 — 따라가기를 만들어 놓고
     * 새 글이 안 오면 그 따라가기는 아무 일도 안 하는 단추다.
     * 막은 사이는 `followerIdsOf` 에서 이미 빠져 나온다.
     *
     * **익명 글은 안 알린다** (TASK-KL-157). 「아무개 님의 새 글」이 나가는 순간 그 글이
     * 누구 것인지 팔로워 전원에게 드러난다 — 익명을 고른 뜻이 거기서 무너진다.
     * 로그인 안 한 사람은 `account` 자체가 없다(예전엔 여기가 로그인 필수라 없을 수 없었다). */
    for (const followerId of account && !writer.anon ? store.followerIdsOf(account.handle) : []) {
      notifyIfWanted({
        accountId: followerId,
        source: 'follow',
        title: `${account.displayName} 님의 새 글`,
        body: gallery.titled ? title : text.slice(0, 60),
        url: `/karmolab/?p=${encodeURIComponent(created.id)}#community`,
        groupKey: `follow:${account.handle}`,
        actorAccountId: account.id,
      });
    }
    notes.flush();
    res.json({ id: created.id });
  });

  app.post('/kl/posts/:id/vote', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const voted = traces.toggleVote(String(req.params.id ?? ''), account.id);
    if (voted === null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
    res.json({ voted });
  });

  /** 좋아요 — 표와 다르다. 표는 「만들어 줘」, 좋아요는 「좋다」. */
  app.post('/kl/posts/:id/like', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const postId = String(req.params.id ?? '');
    const liked = traces.toggleLike(postId, account.id);
    if (liked === null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();

    // 누를 때만 알린다 (취소는 안 알린다 — 그건 알릴 일이 아니다).
    const target = liked ? traces.rawPost(postId) : null;
    if (target) {
      notifyIfWanted({
        accountId: target.authorAccountId,
        actorAccountId: account.id,
        source: 'community',
        title: '내 글을 좋아했어요',
        body: `${target.title ?? target.text.slice(0, 30)} — @${account.handle}`,
        url: `/karmolab/?p=${encodeURIComponent(postId)}#community`,
        groupKey: `post-like:${postId}`,
      });
      notes.flush();
    }

    res.json({ liked });
  });

  /** 답글 — 게시판이 게시판인 이유. `parentId` 를 주면 그 답글에 달리는 답글이다. */
  app.post('/kl/posts/:id/replies', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const body = req.body ?? {};
    const writer = writerFor(req, account, body.anon === true);
    if (writer.error) {
      res.status(writer.status).json({ error: writer.error });
      return;
    }
    const text = String(body.text ?? '').trim();
    if (text.length < 1 || text.length > REPLY_MAX_LEN) {
      res.status(400).json({ error: 'bad_text', maxLength: REPLY_MAX_LEN });
      return;
    }
    const postId = String(req.params.id ?? '');
    const target = traces.rawPost(postId);
    const parentId = typeof body.parentId === 'string' ? body.parentId : null;
    const parentAuthorId = parentId ? traces.replyAuthorAccountId(postId, parentId) : null;

    const reply = traces.addReply(postId, {
      text,
      accountId: writer.accountId,
      handle: writer.handle,
      byOwner: isAdminAccount(account),
      parentId,
      anon: writer.anon,
    });
    if (!reply) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();

    /* 알림 — 답글이 달렸는데 글쓴이가 모르면 그 사람은 안 돌아온다.
       한 글의 답글은 같은 열쇠라 「답글 3개」로 묶인다. 내가 내 글에 단 것은 안 보낸다.
       익명으로 달았으면 **오늘의 이름표**로 알린다 — 알림 한 줄에 진짜 손잡이를 적으면
       익명이 거기서 샌다. 「누가」를 안 적을 수는 없다(그러면 알림이 안 읽힌다). */
    const actorLabel = writer.anon ? writer.anon.name : `@${writer.handle}`;
    // 익명이 로그인 상태로 달았으면 `writer.accountId` 는 진짜 계정이다 — 자기 글엔 알림이 안 가야 한다.
    const actorAccountId = writer.accountId;
    if (target) {
      notifyIfWanted({
        accountId: target.authorAccountId,
        actorAccountId,
        source: 'community',
        title: `내 글에 답글이 달렸어요`,
        body: `${target.title ?? target.text.slice(0, 30)} — ${actorLabel}`,
        url: `/karmolab/?p=${encodeURIComponent(postId)}#community`,
        groupKey: `post-reply:${postId}`,
      });
    }
    // 대댓글이면 그 답글을 쓴 사람에게도 (글쓴이와 같으면 위에서 이미 갔으므로 묶음이 처리한다).
    if (parentAuthorId) {
      notifyIfWanted({
        accountId: parentAuthorId,
        actorAccountId,
        source: 'community',
        title: '내 답글에 답글이 달렸어요',
        body: `${actorLabel}: ${text.slice(0, 40)}`,
        url: `/karmolab/?p=${encodeURIComponent(postId)}#community`,
        groupKey: `reply-reply:${parentId}`,
      });
    }
    notes.flush();

    res.json({ ok: true });
  });

  app.post('/kl/posts/:id/replies/:replyId/like', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const liked = traces.toggleReplyLike(String(req.params.id ?? ''), String(req.params.replyId ?? ''), account.id);
    if (liked === null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
    res.json({ liked });
  });

  app.delete('/kl/posts/:id/replies/:replyId', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const removed = traces.deleteReply(
      String(req.params.id ?? ''),
      String(req.params.replyId ?? ''),
      account.id,
      isAdminAccount(account),
    );
    if (!removed) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    traces.flush();
    res.json({ ok: true });
  });

  /** 지우기 — 쓴 사람 본인이나 주인만. 남의 글을 지울 수 있으면 게시판이 못 산다. */
  app.delete('/kl/posts/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const removed = traces.deletePost(String(req.params.id ?? ''), account.id, isAdminAccount(account));
    if (!removed) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    traces.flush();
    res.json({ ok: true });
  });

  /** 주인이 진행 상태·고정을 바꾼다. */
  app.patch('/kl/posts/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    // 주인뿐 아니라 **그 갤러리를 만든 사람**도 닫을 수 있어야 한다. 안 그러면 남이 만든
    // 이슈 갤러리는 아무도 못 닫고, 열린 글만 쌓이다 죽는다.
    const target = traces.post(String(req.params.id ?? ''));
    const gallery = target ? traces.gallery(target.board) : null;
    const allowed = isAdminAccount(account) || (gallery?.createdByHandle === account.handle);
    if (!allowed) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const body = req.body ?? {};
    const before = target?.status;
    const updated = traces.updatePost(String(req.params.id ?? ''), {
      status: body.status,
      pinned: body.pinned,
      statusNote: body.statusNote,
      by: account.handle,
    });

    /* 「내가 남긴 말이 어떻게 됐나」를 글쓴이가 다시 들어와서 확인해야 한다면, 대부분은
     * 영영 모른다. 요청이 만들어졌는데 요청한 사람이 그걸 모르는 게 제일 아깝다.
     * 그래서 상태가 **실제로 바뀐 때만** 알린다 (같은 상태로 다시 눌러도 안 보낸다). */
    if (updated && before && updated.status !== before) {
      const gallery = traces.gallery(updated.board);
      const closingWord: Record<string, string> = gallery?.voteStyle
        ? { open: '다시 받는 중이에요', planned: '만들 예정이에요', done: '만들었어요', declined: '이번엔 안 만들기로 했어요' }
        : { open: '다시 열렸어요', planned: '할 예정이에요', done: '됐어요', declined: '안 하기로 했어요' };
      const what = updated.title || updated.text.slice(0, 40);
      notifyIfWanted({
        accountId: updated.authorAccountId,
        source: 'community',
        title: `올리신 「${what}」 — ${closingWord[updated.status] ?? '상태가 바뀌었어요'}`,
        body: updated.statusNote,
        url: `/karmolab/?p=${encodeURIComponent(updated.id)}#community`,
        groupKey: `post-status:${updated.id}`,
        actorAccountId: account.id,
      });
      notes.flush();
    }
    if (!updated) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
    res.json({ ok: true });
  });

  /**
   * 프로필 그림 — 디스코드에서 서버가 대신 받아 보낸다.
   *
   * 왜 대신 받나: 디스코드 그림 주소에는 그 사람의 디스코드 id 가 박혀 있다. 주소를 그대로
   * 넘기면 사이트를 쓴 것만으로 디스코드 계정이 남에게 공개된다 — 본인이 그러겠다고 한 적이 없다.
   * 받아 온 것은 잠깐 들고 있는다 (프로필 한 장에 여러 번 뜨는 그림을 매번 다시 받지 않게).
   */
  /* ===== 알림 (공용) =====
   * 커뮤니티만의 기능이 아니다. 도구·계정·봇 무엇이든 같은 자리에 알림을 넣는다. */

  /** 주인이 지금 당장 백업을 뜬다 — 주기를 기다리지 않고 확인할 수 있어야 한다. */
  app.post('/kl/backup', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!isAdminAccount(account)) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    res.json(triggerBackupNow());
  });

  /* ===== 검색 · 활동 · 질서 · 그림 ===== */

  /** 갤러리를 가리지 않는 검색 — 「그 글 어디 있더라」를 찾는 자리. */
  app.get('/kl/search', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ q, posts: q.trim() ? traces.searchPosts(q, account?.id ?? null) : [] });
  });

  /** 이 사람이 쓴 글과 답글 — 공개 프로필의 「활동」. */
  app.get('/kl/u/:handle/activity', (req: Request, res: Response) => {
    const viewer = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const target = store.byHandle(String(req.params.handle ?? ''));
    if (!target) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    /* 가린 사람의 글 목록은 **응답에서 사라진다** (TASK-KL-152 C4).
     * 화면에서만 숨기면 이 주소를 직접 여는 것으로 그대로 새어 나간다. */
    const visible = store.visibilityFor(target.id);
    if (!visible.community && viewer?.id !== target.id) {
      res.json({ handle: target.handle, posts: [], replies: [], counts: { posts: 0, replies: 0 }, hidden: ['community'] });
      return;
    }
    res.json({
      handle: target.handle,
      posts: traces.postsBy(target.handle, viewer?.id ?? null),
      replies: traces.repliesBy(target.handle),
      counts: traces.activityOf(target.handle),
    });
  });

  /**
   * 신고 — 지우지 않는다. 주인이 볼 목록에 올릴 뿐이다.
   * 신고 한 번으로 글이 사라지면 그것 자체가 남을 지우는 단추가 된다.
   */
  app.post('/kl/reports', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const ok = traces.report({
      postId: String(body.postId ?? ''),
      replyId: typeof body.replyId === 'string' ? body.replyId : null,
      byAccountId: account.id,
      reason: String(body.reason ?? ''),
    });
    if (!ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
    // 주인에게 바로 알린다 — 목록을 들여다볼 사람이 한 명뿐이라 알림이 없으면 안 본다.
    for (const adminId of String(process.env.ADMIN_IDS ?? '').split(',')) {
      const admin = adminId.trim() ? store.accountForDiscordId(adminId.trim()) : null;
      if (!admin) continue;
      notifyIfWanted({
        accountId: admin.id,
        source: 'moderation',
        title: '신고가 들어왔어요',
        body: String(body.reason ?? '').slice(0, 60),
        url: `/karmolab/?p=${encodeURIComponent(String(body.postId ?? ''))}#community`,
        groupKey: 'reports',
      });
    }
    notes.flush();
    res.json({ ok: true });
  });

  /** 주인이 보는 신고 목록. */
  app.get('/kl/reports', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!isAdminAccount(account)) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    res.json({ reports: traces.openReports() });
  });

  app.post('/kl/reports/:id/resolve', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!isAdminAccount(account)) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    if (!traces.resolveReport(String(req.params.id ?? ''))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
    res.json({ ok: true });
  });

  /**
   * 그림 올리기. 브라우저가 글자로 바꿔 보내고 서버가 파일로 떨군다.
   * 몸통이 커서 이 자리만 상한을 따로 준다 (기본값이면 큰 사진이 통째로 막힌다).
   */
  app.post('/kl/uploads', express.json({ limit: '6mb' }), (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const raw = String((req.body ?? {}).data ?? '');
    // `data:image/png;base64,....` 도 그냥 base64 도 받는다.
    const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64, 'base64');
    } catch {
      res.status(400).json({ error: 'bad_data' });
      return;
    }
    const outcome = saveImage(bytes, account.id);
    if (outcome.ok === false) {
      res.status(outcome.reason === 'daily_limit' ? 429 : 400).json({
        error: outcome.reason,
        maxBytes: UPLOAD_MAX_BYTES,
      });
      return;
    }
    res.json(outcome.saved);
  });

  /** 올린 그림 보여주기. 이름에 경로가 섞이면 읽지 않는다. */
  app.get('/kl/img/:id', (req: Request, res: Response) => {
    const found = readImage(String(req.params.id ?? ''));
    if (!found) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', found.mime);
    // 그림은 안 바뀐다 (이름에 임의 글자가 들어 있다) — 오래 캐시해도 된다.
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.end(found.bytes);
  });

  app.get('/kl/notifications', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      // 로그인 안 한 사람에게도 200 — 화면이 오류로 깨지면 안 된다.
      res.json({ items: [], unread: 0, signedIn: false });
      return;
    }
    res.json({
      items: notes.listFor(account.id),
      unread: notes.unreadCount(account.id),
      signedIn: true,
      /* 「어디로 받고 있나」를 목록과 함께 준다 (TASK-KL-157) — 종을 열면 바로 보이고,
         이 값 하나 때문에 요청을 한 번 더 하지 않는다. */
      discord: notes.discordEnabled(account.id),
      /* 디스코드로 못 보내는 계정(연결 안 됨)에는 칸 자체를 안 만든다 —
         켤 수 없는 스위치가 보이는 것이 제일 나쁘다. */
      discordAvailable: Boolean(account.identities.discord?.discordId),
    });
  });

  /** 알림을 디스코드로도 받을지. 기본은 꺼짐 — 부르지도 않았는데 말 거는 일이다. */
  app.post('/kl/notifications/discord', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    if (!account.identities.discord?.discordId) {
      res.status(400).json({ error: 'no_discord' });
      return;
    }
    notes.setDiscordEnabled(account.id, req.body?.on === true);
    notes.flush();
    res.json({ ok: true, discord: notes.discordEnabled(account.id) });
  });

  app.post('/kl/notifications/read', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = typeof (req.body ?? {}).id === 'string' ? (req.body as { id: string }).id : undefined;
    const changed = notes.markRead(account.id, id);
    notes.flush();
    res.json({ changed, unread: notes.unreadCount(account.id) });
  });

  app.get('/kl/u/:handle/avatar', async (req: Request, res: Response) => {
    const account = store.byHandle(String(req.params.handle ?? ''));
    if (!account?.avatarUrl) {
      res.status(404).end();
      return;
    }
    const cached = avatarCache.get(account.avatarUrl);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(cached.body);
      return;
    }
    try {
      const upstream = await fetch(account.avatarUrl);
      if (!upstream.ok) {
        res.status(404).end();
        return;
      }
      const body = Buffer.from(await upstream.arrayBuffer());
      const contentType = upstream.headers.get('content-type') ?? 'image/png';
      avatarCache.set(account.avatarUrl, { body, contentType, expiresAt: Date.now() + AVATAR_TTL_MS });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(body);
    } catch (error) {
      console.error('[karmolab-api] 프로필 그림 가져오기 실패:', error);
      res.status(502).end();
    }
  });

  /** 공개 프로필 — 로그인 없이 남이 본다. 「북적북적」이 실제로 보이는 첫 자리. */
  app.get('/kl/u/:handle', (req: Request, res: Response) => {
    const account = store.byHandle(String(req.params.handle ?? ''));
    if (!account) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    /* 본인이 프로필을 잠갔으면 **주소를 알아도 안 보인다** (TASK-KL-152 C4).
     * 「없는 사람」과 구별되는 답을 준다 — 링크를 걸어 둔 사람이 왜 안 열리는지 알아야 한다.
     * 본인은 자기 프로필을 늘 볼 수 있다(잠근 모습이 어떻게 보이는지 확인해야 하므로). */
    const viewerSelf = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const visible = store.visibilityFor(account.id);
    if (!visible.profile && viewerSelf?.id !== account.id) {
      res.status(403).json({ error: 'profile_private' });
      return;
    }
    // 커뮤니티 활동도 프로필의 일부다 — 「이 사람이 여기서 무엇을 했나」.
    res.json({
      profile: {
        ...store.publicProfile(account),
        activity: visible.community ? traces.activityOf(account.handle) : { posts: 0, replies: 0 },
        // 따라가기 (TASK-KL-152 C8) — 보는 사람이 누구냐에 따라 답이 다르다.
        followers: store.followerCount(account.handle),
        // 「지금 접속 중」 — 본인이 켠 사람만. 안 켰으면 null 이라 화면이 그 칸을 아예 안 그린다.
        online: store.onlineNow(account.handle),
        // 잔디 (TASK-KL-175 E6) — 가린 사람은 null 이라 화면이 그 자리를 아예 안 그린다.
        footprint: store.publicFootprint(account.handle),
        following: viewerSelf ? store.isFollowing(viewerSelf.id, account.handle) : false,
        canFollow: !!viewerSelf && viewerSelf.id !== account.id,
      },
    });
  });
  // ── 실시간 익명 채팅 (TASK-KL-149) ─────────────────────────────────────────
  //
  // 광장은 「지금 N명」을 세기만 했다. 여기서 그 N명이 서로에게 말을 건다.
  // 전송은 **SSE** 다 — 새 의존성 0, 재연결은 브라우저가 알아서, 프록시(cloudflared)를 그냥 통과.

  /**
   * 흐르는 쪽. 브라우저가 한 번 붙어 두고 계속 받는다.
   *
   * 함정 두 개를 여기서 막는다:
   *  ① 중간에서 **모아 두면** 실시간이 아니다 → `X-Accel-Buffering: no` + 압축 금지 + 즉시 헤더 전송.
   *  ② 조용한 연결은 프록시가 **끊는다** → 15초마다 주석 한 줄(`:`)을 흘려 보낸다. 화면엔 안 보인다.
   */
  app.get('/kl/chat/stream', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const identity = chat.identityFor(visitorKeyFor(req));

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // 작은 조각을 모았다 보내면 그 자체가 지연이다.
    req.socket.setNoDelay(true);

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    /* 첫 마디. 「너는 오늘 누구인가」 + 지금까지의 줄 + 몇 명이 창을 열고 있나.
     * 이걸 한 번에 주기 때문에 화면은 붙자마자 그릴 것이 있다 — 빈 창을 안 보여 준다. */
    send('hello', {
      me: { who: identity.who, name: identity.name, color: identity.color },
      // 저장 모양이 아니라 **보여 줄 모양**을 내보낸다 — 지킨/신고한 사람 목록은 안 나간다.
      messages: chat.publicMessages(identity.who),
      here: chat.hereCount() + 1,
      /* 지금 혼자여도 「오늘 여기 몇 명이 말했나」를 알면 빈 방으로 안 읽힌다.
         자기 자신은 안 뺀다 — 「오늘 이 방에 있던 사람 수」가 곧 그 값이다. */
      todayVoices: chat.todaysVoiceCount(),
      isAdmin: isAdminAccount(account),
      maxLength: CHAT_TEXT_MAX,
    });

    const unsubscribe = chat.subscribe((event: ChatEvent) => {
      send(event.type, event);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

    const close = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    };
    req.on('close', close);
    res.on('error', close);
  });

  /** SSE 가 막힌 자리(구형 브라우저·이상한 프록시)를 위한 되돌아갈 길. 화면은 이걸로도 돈다. */
  app.get('/kl/chat/recent', (req: Request, res: Response) => {
    const identity = chat.identityFor(visitorKeyFor(req));
    res.json({
      me: { who: identity.who, name: identity.name, color: identity.color },
      messages: chat.publicMessages(identity.who),
      here: chat.hereCount(),
      todayVoices: chat.todaysVoiceCount(),
      isAdmin: isAdminAccount(store.accountForSession(readCookie(req, SESSION_COOKIE))),
      maxLength: CHAT_TEXT_MAX,
    });
  });

  /**
   * 한 줄 보낸다. **로그인은 안 물어본다** — 익명 채팅이니까.
   * 막힐 때는 왜 막혔는지와 언제 다시 되는지를 같이 준다(「안 돼요」만 주면 아무도 못 고친다).
   */
  app.post('/kl/chat', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    // 봇은 사람 사이에 끼지 않는다. 크롤러가 폼을 눌러 방을 채우는 일을 막는다.
    if (classifyVisitor(req.headers['user-agent']) !== 'human') {
      res.status(403).json({ error: 'not_human' });
      return;
    }
    const result = chat.post(visitorKeyFor(req), String(req.body?.text ?? ''), {
      byOwner: isAdminAccount(account),
      // 로그인한 사람만 적힌다 — 나중에 온 말을 이 사람들에게 알린다 (TASK-KL-157).
      accountId: account?.id ?? null,
      // 어느 줄에 답하는가 (TASK-KL-159). 없는 줄을 가리키면 그냥 최상위 말이 된다.
      replyTo: typeof req.body?.replyTo === 'string' ? req.body.replyTo : null,
    });
    if (!result.ok) {
      const status = result.error === 'muted' ? 403 : result.error === 'too_long' ? 400 : 429;
      res.status(status).json({ error: result.error, retryAfterMs: result.retryAfterMs ?? null, maxLength: CHAT_TEXT_MAX });
      return;
    }
    chat.flush();

    /* 빈 방을 깨는 자리 (TASK-KL-157).
     *
     * 실시간 방은 이렇게 죽는다: 아무도 없을 때 남긴 말이 아무에게도 안 닿고 → 아무도 안 남기고
     * → 방이 영영 빈다. 그래서 「지금 보고 있는 사람」이 아니라 **오늘 여기 있던 사람**에게 알린다.
     * 지금 창을 열어 둔 사람은 이미 그 줄을 받았으므로, 알림은 그 밖의 사람들을 위한 것이다.
     * 한 열쇠로 묶여서 여러 줄이 와도 「채팅 3」 한 줄이 된다. */
    for (const accountId of chat.todaysSpeakers(account?.id ?? null)) {
      notifyIfWanted({
        accountId,
        source: 'chat',
        title: '채팅에 새 말이 있어요',
        body: `${result.message?.name}: ${result.message?.text.slice(0, 40)}`,
        url: '/karmolab/#chat',
        groupKey: 'chat',
        actorAccountId: account?.id ?? null,
      });
    }
    notes.flush();
    res.json({ ok: true, message: result.message });
  });

  /**
   * 이 줄을 지킨다 (TASK-KL-158). 로그인은 안 물어본다 — 채팅과 같은 자리다.
   * 지킨 줄은 하루가 지나도 안 사라진다. 좋은 말을 남길 길이 「손으로 글로 옮기기」뿐이면
   * 대부분 그냥 사라진다.
   */
  app.post('/kl/chat/:id/keep', (req: Request, res: Response) => {
    if (classifyVisitor(req.headers['user-agent']) !== 'human') {
      res.status(403).json({ error: 'not_human' });
      return;
    }
    const identity = chat.identityFor(visitorKeyFor(req));
    const kept = chat.toggleKeep(String(req.params.id ?? ''), identity.who);
    if (kept === null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    chat.flush();
    res.json({ ok: true, kept });
  });

  /** 주인이 한 줄 지운다. 지운 자리는 안 남긴다 — 「삭제됨」이 줄줄이 남으면 그것이 도배가 된다. */
  app.delete('/kl/chat/:id', (req: Request, res: Response) => {
    if (!isAdminAccount(store.accountForSession(readCookie(req, SESSION_COOKIE)))) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    if (!chat.remove(String(req.params.id ?? ''))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    chat.flush();
    res.json({ ok: true });
  });

  /**
   * 신고함에서 바로 재갈을 문다 (TASK-KL-158).
   *
   * 신고 원장은 **누가 말했는지를 안 들고 있다** — 신고 당시의 그 말만 베껴 뒀다(익명이 새지
   * 않게). 그래서 줄 id 로 그 사람을 되찾아 문다. 줄이 이미 사라졌으면(하루가 지났으면)
   * 물 대상이 없다 — 그때는 「없다」고 정직하게 답한다. 조용히 성공한 척하지 않는다.
   */
  app.post('/kl/chat/mute-message', (req: Request, res: Response) => {
    if (!isAdminAccount(store.accountForSession(readCookie(req, SESSION_COOKIE)))) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const target = chat.recent().find((m) => m.id === String(req.body?.id ?? ''));
    if (!target) {
      res.status(404).json({ error: 'gone' });
      return;
    }
    const minutes = Number(req.body?.minutes ?? 30);
    chat.mute(target.who, Number.isFinite(minutes) ? minutes : 30);
    chat.flush();
    res.json({ ok: true, who: target.who });
  });

  /** 주인이 재갈을 물린다. 오늘 이름표 기준이라 **자정이면 어차피 풀린다** — 영구 추방이 아니다. */
  app.post('/kl/chat/mute', (req: Request, res: Response) => {
    if (!isAdminAccount(store.accountForSession(readCookie(req, SESSION_COOKIE)))) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const minutes = Number(req.body?.minutes ?? 30);
    if (!chat.mute(String(req.body?.who ?? ''), Number.isFinite(minutes) ? minutes : 30)) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    chat.flush();
    res.json({ ok: true });
  });

  /**
   * 신고. 지우지 않는다 — 주인에게 알림만 간다(커뮤니티 신고와 같은 원칙).
   * 신고 한 번으로 남의 말이 사라지면 그 단추 자체가 무기가 된다.
   */
  app.post('/kl/chat/report', (req: Request, res: Response) => {
    const id = String(req.body?.id ?? '');
    const target = chat.recent().find((m) => m.id === id);
    if (!target) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    /* 눌렀는지 화면이 알 수 있게 적어 둔다 (TASK-KL-159) — 안 그러면 또 누른다.
       이미 눌렀으면 원장에 두 줄을 만들지 않는다. */
    const reporterWho = chat.identityFor(visitorKeyFor(req)).who;
    const fresh = chat.markReported(target.id, reporterWho);
    if (fresh === false) {
      res.json({ ok: true, already: true });
      return;
    }
    chat.flush();

    /* **같은 원장에 넣는다** (TASK-KL-157). 예전엔 알림 한 줄만 보내고 끝이라, 알림을 놓치면
       그 신고는 어디에도 안 남았다. 채팅 줄은 하루 뒤 사라지므로 그 말을 함께 베껴 둔다. */
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    traces.report({
      kind: 'chat',
      postId: target.id,
      byAccountId: account ? account.id : `anon:${chat.identityFor(visitorKeyFor(req)).key}`,
      reason: String(req.body?.reason ?? '채팅 신고'),
      subject: `${target.name}: ${target.text}`,
    });
    traces.flush();
    for (const adminId of String(process.env.ADMIN_IDS ?? '').split(',')) {
      const admin = adminId.trim() ? store.accountForDiscordId(adminId.trim()) : null;
      if (!admin) continue;
      notifyIfWanted({
        accountId: admin.id,
        source: 'moderation',
        title: '채팅 신고가 들어왔어요',
        body: `${target.name}: ${target.text}`.slice(0, 60),
        url: '/karmolab/#chat',
        groupKey: 'chat-reports',
      });
    }
    notes.flush();
    res.json({ ok: true });
  });

  /* 라우트보다 **뒤**에 있어야 잡는다. 여기로 오는 오류는 **반드시 CORS 헤더를 달고** 나가야 한다.
   * 안 그러면 브라우저가 진짜 이유(너무 큼·잘못된 몸통) 대신 「CORS 막힘」만 보여 준다. */
  app.use('/kl', (error: Error & { status?: number; type?: string }, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const origin = req.headers.origin;
    if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    /* **자취를 남긴다.** 여기로는 몸통이 깨진 요청만 오는 게 아니라 라우트 안에서 터진 것도
     * 전부 온다. 그런데 답은 늘 `bad_request` 한 마디라, 서버가 터진 것을 「잘못 보냈다」로
     * 읽게 된다 — 실제로 익명 글쓰기를 붙이다가 이것 때문에 원인을 못 찾고 헤맸다.
     * 사용자에게 나가는 답은 그대로 두되, 로그에는 무엇이 터졌는지 그대로 적는다. */
    console.error(`[karmolab-api] ${req.method} ${req.path} 에서 터졌다:`, error?.stack ?? error);
    const tooBig = error.status === 413 || error.type === 'entity.too.large';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'too_big' : 'bad_request',
      maxBytes: UPLOAD_MAX_BYTES,
    });
  });

}
