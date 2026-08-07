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
import type { Application, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  getKarmolabAccountStore,
  emptyRecords,
  type Account,
  type AccountRecords,
  type KarmolabAccountStore,
} from '../services/karmolab-accounts';
import {
  getKarmolabTraceStore,
  KarmolabTraceStore,
  isValidToolId,
  isBoardId,
  isPostSort,
  isOwnerOnlyBoard,
  maxLenFor,
  dailyLimitFor,
  BOARDS,
  TITLE_MAX_LEN,
  REPLY_MAX_LEN,
  type BoardId,
} from '../services/karmolab-traces';

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
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  /** 브라우저가 「계정 기능이 지금 되나」를 물어보는 자리. 서버가 죽으면 이 요청이 실패하고, 브라우저는 조용히 예전처럼 동작한다. */
  app.get('/kl/health', (_req: Request, res: Response) => {
    const config = karmolabOauthConfig();
    res.json({ ok: true, login: config.ready ? 'discord' : 'disabled', ...store.stats() });
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

  // ── 흔적 원장 (Cycle 2) — 남의 자국이 보이는 자리 ────────────────────────
  //
  // 여기 숫자는 전부 실제로 일어난 일이다. 초반에는 작을 것이고, 작은 게 맞다.
  // 지어낸 수를 넣는 순간 이 자리 전체가 못 믿을 것이 된다.

  /** 도구가 열렸다. 로그인과 무관하다 — 그냥 지나간 사람의 자국도 사이트의 자국이다. */
  app.post('/kl/trace/tool', (req: Request, res: Response) => {
    const toolId = (req.body ?? {}).toolId;
    if (!isValidToolId(toolId)) {
      res.status(400).json({ error: 'bad_tool_id' });
      return;
    }
    const counted = traces.recordToolOpen(toolId, visitorKeyFor(req));
    res.json({ counted });
  });

  /** 공개 집계 — 어느 도구가 실제로 쓰이는가. 한 번도 안 열린 도구는 아예 안 나온다. */
  app.get('/kl/tools/stats', (_req: Request, res: Response) => {
    res.json({ tools: traces.toolStats(), pulse: traces.pulse() });
  });

  /** 어떤 판이 있고 각 판에 글이 몇 개인가 — 목록 위의 판 고르는 줄이 쓴다. */
  app.get('/kl/boards', (_req: Request, res: Response) => {
    const counts = traces.boardCounts();
    res.json({ boards: BOARDS.map((b) => ({ ...b, count: counts[b.id] ?? 0 })) });
  });

  /** 판 하나의 글 목록. 보는 건 로그인 없이 된다. */
  app.get('/kl/posts', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    const board: BoardId = isBoardId(req.query.board) ? req.query.board : 'free';
    const sort = isPostSort(req.query.sort) ? req.query.sort : 'recent';
    res.json({
      board,
      sort,
      posts: traces.publicPosts(board, account?.id ?? null, sort),
      signedIn: Boolean(account),
      isAdmin: isAdminAccount(account),
      myHandle: account?.handle ?? null,
      canWrite: Boolean(account) && (!isOwnerOnlyBoard(board) || isAdminAccount(account)),
      maxLength: maxLenFor(board),
      titleMaxLength: TITLE_MAX_LEN,
      replyMaxLength: REPLY_MAX_LEN,
    });
  });

  /** 첫 화면에 띄우는 최근 글 — 판을 가리지 않는다. */
  app.get('/kl/recent', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    res.json({ posts: traces.recentPosts(3, account?.id ?? null) });
  });

  /** 글 하나. 주소로 바로 열리므로 로그인 없이 보이고, 열릴 때 조회수를 센다. */
  app.get('/kl/posts/:id', (req: Request, res: Response) => {
    const account = store.accountForSession(readCookie(req, SESSION_COOKIE));
    traces.recordPostView(String(req.params.id ?? ''), visitorKeyFor(req));
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
    const board: BoardId = isBoardId(body.board) ? body.board : 'free';
    // 공지는 주인만 쓴다. 막을 거면 서버가 막아야 한다 — 화면에서 숨기는 것은 잠금이 아니다.
    if (isOwnerOnlyBoard(board) && !isAdminAccount(account)) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const text = String(body.text ?? '').trim();
    const title = String(body.title ?? '').trim();

    // 한 글자짜리 글도 글이다 (「ㅋ」). 막을 것은 빈 글뿐이다.
    if (text.length < 1 || text.length > maxLenFor(board)) {
      res.status(400).json({ error: 'bad_text', maxLength: maxLenFor(board) });
      return;
    }
    // 요청은 한 줄이라 제목이 없다. 나머지 판은 제목이 있어야 목록이 읽힌다.
    if (board !== 'request' && (title.length < 1 || title.length > TITLE_MAX_LEN)) {
      res.status(400).json({ error: 'bad_title', maxLength: TITLE_MAX_LEN });
      return;
    }
    if (traces.postsTodayBy(account.id, board) >= dailyLimitFor(board)) {
      // 막을 때는 왜 막혔는지 말해 준다. 조용히 실패하면 사람은 고장으로 읽는다.
      res.status(429).json({ error: 'daily_limit', limit: dailyLimitFor(board) });
      return;
    }

    const created = traces.addPost({
      board,
      title: board === 'request' ? null : title,
      text,
      accountId: account.id,
      handle: account.handle,
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
    const liked = traces.toggleLike(String(req.params.id ?? ''), account.id);
    if (liked === null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
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
    const reply = traces.addReply(String(req.params.id ?? ''), {
      text,
      accountId: account.id,
      handle: account.handle,
      byOwner: isAdminAccount(account),
      parentId: typeof body.parentId === 'string' ? body.parentId : null,
    });
    if (!reply) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    traces.flush();
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
    if (!isAdminAccount(account)) {
      res.status(403).json({ error: 'not_allowed' });
      return;
    }
    const body = req.body ?? {};
    const updated = traces.updatePost(String(req.params.id ?? ''), { status: body.status, pinned: body.pinned });
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
}
