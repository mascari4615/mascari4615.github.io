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
import { backupInfo, triggerBackupNow } from '../services/karmolab-backup';
import { saveImage, readImage, UPLOAD_MAX_BYTES } from '../services/karmolab-uploads';
import { classifyVisitor } from '../services/karmolab-visitor-kind';
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
): void {

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
      const session = store.createSession(account.id);
      setSessionCookie(res, session.token, session.expiresAt - Date.now());
      res.redirect(`${returnUrl}${sep}kl_login=ok`);
    } catch (error) {
      console.error('[karmolab-api] 로그인 처리 중 오류:', error);
      res.redirect(`${returnUrl}${sep}kl_login=failed`);
    }
  });

  app.post('/kl/auth/logout', (req: Request, res: Response) => {
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
    const updated = store.setDisplayName(account.id, (req.body ?? {}).displayName);
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
    const { token, expiresAt } = store.createSession(account.id);
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
    const { token, expiresAt } = store.createSession(account.id);
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
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (account) store.noteFootprint(account.id, { toolId });
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
      canWrite: Boolean(account) && (!gallery.ownerOnly || isAdminAccount(account)),
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
      replyMaxLength: REPLY_MAX_LEN,
    });
  });

  app.post('/kl/posts', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
    const gallery = traces.gallery(String(body.board ?? 'free'));
    if (!gallery) {
      res.status(404).json({ error: 'no_such_gallery' });
      return;
    }
    // 공지는 주인만 쓴다. 막을 거면 서버가 막아야 한다 — 화면에서 숨기는 것은 잠금이 아니다.
    if (gallery.ownerOnly && !isAdminAccount(account)) {
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
    if (traces.postsTodayBy(account.id, gallery.id) >= dailyLimitFor(gallery)) {
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
      accountId: account.id,
      handle: account.handle,
      tag,
    });
    traces.flush();
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
      notes.notify({
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
    if (!account) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body = req.body ?? {};
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
      accountId: account.id,
      handle: account.handle,
      byOwner: isAdminAccount(account),
      parentId,
    });
    if (!reply) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();

    /* 알림 — 답글이 달렸는데 글쓴이가 모르면 그 사람은 안 돌아온다.
       한 글의 답글은 같은 열쇠라 「답글 3개」로 묶인다. 내가 내 글에 단 것은 안 보낸다. */
    if (target) {
      notes.notify({
        accountId: target.authorAccountId,
        actorAccountId: account.id,
        source: 'community',
        title: `내 글에 답글이 달렸어요`,
        body: `${target.title ?? target.text.slice(0, 30)} — @${account.handle}`,
        url: `/karmolab/?p=${encodeURIComponent(postId)}#community`,
        groupKey: `post-reply:${postId}`,
      });
    }
    // 대댓글이면 그 답글을 쓴 사람에게도 (글쓴이와 같으면 위에서 이미 갔으므로 묶음이 처리한다).
    if (parentAuthorId) {
      notes.notify({
        accountId: parentAuthorId,
        actorAccountId: account.id,
        source: 'community',
        title: '내 답글에 답글이 달렸어요',
        body: `@${account.handle}: ${text.slice(0, 40)}`,
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
      notes.notify({
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
      notes.notify({
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
    res.json({ items: notes.listFor(account.id), unread: notes.unreadCount(account.id), signedIn: true });
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
    // 커뮤니티 활동도 프로필의 일부다 — 「이 사람이 여기서 무엇을 했나」.
    res.json({ profile: { ...store.publicProfile(account), activity: traces.activityOf(account.handle) } });
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
      messages: chat.recent(),
      here: chat.hereCount() + 1,
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
      messages: chat.recent(),
      here: chat.hereCount(),
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
    });
    if (!result.ok) {
      const status = result.error === 'muted' ? 403 : result.error === 'too_long' ? 400 : 429;
      res.status(status).json({ error: result.error, retryAfterMs: result.retryAfterMs ?? null, maxLength: CHAT_TEXT_MAX });
      return;
    }
    chat.flush();
    res.json({ ok: true, message: result.message });
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
    for (const adminId of String(process.env.ADMIN_IDS ?? '').split(',')) {
      const admin = adminId.trim() ? store.accountForDiscordId(adminId.trim()) : null;
      if (!admin) continue;
      notes.notify({
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
    const tooBig = error.status === 413 || error.type === 'entity.too.large';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'too_big' : 'bad_request',
      maxBytes: UPLOAD_MAX_BYTES,
    });
  });

}
