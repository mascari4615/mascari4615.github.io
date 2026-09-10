/**
 * 개인 대시보드 셸.
 *
 * 무엇인가: **공개 배포된 정적 화면 하나**가, 보는 사람의 GitHub 토큰으로 **private 저장소를
 * 직접** 읽어 그린다. 이 사이트의 서버는 그 데이터를 0바이트도 안 만진다. 브라우저가
 * `api.github.com` 을 직접 부르고, 받은 것은 화면에서 끝남.
 *
 * **인가를 우리가 안 짠다.** 로그인은 누구나 된다. 그런데 private 저장소를 읽을 권한이
 * 없는 토큰은 GitHub 이 **404** 를 준다(403 이 아니다. 있는지조차 안 알려 준다).
 * 그게 인가다. 우리가 사용자 명부를 들고 이 사람은 되고 저 사람은 안 된다를 판정하면,
 * 그 판정이 틀리는 날 데이터가 샘. GitHub 의 판정은 우리가 틀릴 수 없음.
 *
 * ★ **릴레이가 하나 필요하다** (ADR 전제 수정).
 *   기기 흐름의 두 창구(`github.com/login/device/code`, `github.com/login/oauth/access_token`)는
 *   `github.com` 에 있고 **CORS 를 안 엶**. 브라우저가 직접 부르면 preflight 에서 막힘.
 *   (`api.github.com` 은 엶. 그래서 **토큰을 받은 뒤부터는** 릴레이가 안 낌.)
 *   그래서 정적 사이트만이 아니라 **정적 사이트 + 작은 릴레이 하나**다. 릴레이는 기기 코드와
 *   토큰만 지나보내고 아무것도 저장 안 함. 저장소 데이터는 릴레이를 안 거침.
 *   GitHub **App** 의 기기 흐름은 client secret 이 없어도 되므로, 릴레이에 비밀이 없음.
 *
 * 설정은 코드에 안 박는다. `data/mydash-config.json` 을 읽는다 (예시는 같은 폴더의
 * `mydash-config.example.json`). 없으면 화면이 무엇을 채워야 하는지 적어 줌.
 *
 * ★ **쓰기는 읽기와 브랜치가 다르다.** 읽기는 `branch` (생성기가 굽는 main), 쓰기는
 * `eventsBranch` (orphan 브랜치 하나). 사람 손 기록만 거기 쌓이고 main 은 안 건드림.
 * 쓰기 모양은 새 파일 생성 하나뿐이라 sha 도 덮어쓰기도 없음.
 */
import { dashRegistry, esc, httpsUrl } from './kit';
import type { DashEntry, DashPanel, DashPanelCtx, DashReadOpts, DashRepoWrite } from './kit';

declare const Toolbox:
  | {
      register: (m: unknown) => void;
      getLazyWidgetPublicMeta?: (id: string) => object;
      onDispose?: (fn: () => void) => void;
    }
  | undefined;

(function (): void {
  'use strict';

  type Config = {
    /** 기기 흐름 릴레이의 뿌리 주소. 끝의 빗금은 있어도 없어도 된다. */
    relay: string;
    owner: string;
    repo: string;
    branch?: string;
    /** 사람 손 기록이 쌓이는 orphan 브랜치. 없으면 `karmolab-dashboard` */
    eventsBranch?: string;
  };

  type Saved = {
    token: string;
    /** epoch ms. GitHub App 사용자 토큰은 보통 8시간이다. null = 안 밝힘 */
    expiresAt: number | null;
    refresh: string | null;
    refreshExpiresAt: number | null;
  };

  const API = 'https://api.github.com';
  const STORE_KEY = 'karmolab.mydash.gh';
  const OUTBOX_KEY = 'karmolab.mydash.outbox';
  const DEVICE_KEY = 'karmolab.mydash.device';
  const CONFIG_URL = '/apps/karmolab/data/mydash-config.json';
  const DEFAULT_EVENTS_BRANCH = 'karmolab-dashboard';
  /* 쓰기가 403, 404 로 막혔을 때 사람이 손볼 곳. 토큰을 다시 받아도 안 풀림 */
  const PERM_MSG = 'GitHub App 권한 Contents 를 Read & write 로 바꾸고 설치 화면에서 승인';

  const reg = dashRegistry();

  /* ── 토큰 보관. **모든 접근을 try/catch 로 감싼다.**
     사파리 비공개 모드, 저장소 꽉 참, 서드파티 차단에서 localStorage 는 **읽기도** 던진다.
     한 번 던지면 위젯 전체가 안 뜬다. 못 저장하는 판에서는 이번 화면만 쓰고 잊는 것이 맞다. */
  let memoryToken: Saved | null = null;

  function loadSaved(): Saved | null {
    if (memoryToken) return memoryToken;
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as Saved;
      if (!v || typeof v.token !== 'string' || !v.token) return null;
      return v;
    } catch {
      return null;
    }
  }

  function saveToken(v: Saved | null): void {
    memoryToken = v;
    try {
      if (v) window.localStorage.setItem(STORE_KEY, JSON.stringify(v));
      else window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* 못 적었다. 이번 화면 동안은 memoryToken 으로 산다. 새로고침하면 다시 로그인이다. */
    }
  }

  /* ── 기기 이름 ─────────────────────────────────────────────────
     이벤트 파일 이름 뒤에 붙는 6자 hex. 폰과 데스크톱이 같은 밀리초에 같은 항목을 건드려도
     경로가 안 겹치게 하는 것이 전부. 사람이나 브라우저를 식별하는 값이 아님.
     저장이 막힌 브라우저에서는 이번 화면 동안만 사는 값. 그래도 경로는 안 겹침 */
  let deviceCache: string | null = null;
  /** hex 글자 `bytes * 2` 개. crypto 가 막힌 판에서만 Math.random 후퇴 */
  function makeHex(bytes: number): string {
    try {
      const buf = new Uint8Array(bytes);
      window.crypto.getRandomValues(buf);
      return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      let out = '';
      for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
      return out;
    }
  }
  function deviceId(): string {
    if (deviceCache) return deviceCache;
    try {
      const got = window.localStorage.getItem(DEVICE_KEY);
      if (got && /^[0-9a-f]{6}$/.test(got)) {
        deviceCache = got;
        return got;
      }
    } catch {
      /* 못 읽었다. 새로 만든다 */
    }
    const made = makeHex(3);
    deviceCache = made;
    try {
      window.localStorage.setItem(DEVICE_KEY, made);
    } catch {
      /* 못 적었다. 이번 화면 동안만 이 이름 */
    }
    return made;
  }

  /* ── 탭 이름 ───────────────────────────────────────────────────
     이벤트 파일 이름의 마지막 4자 hex (`<epoch-ms>-<device6>-<nonce4>.json`).
     기기 이름만으로는 **한 기기의 탭 둘**이 안 갈림. 같은 브라우저의 탭 둘이 같은 밀리초에
     같은 항목을 건드리면 경로가 통째로 겹쳐, 뒤에 간 것이 422 로 막히고 outbox 가 그것을
     이미 간 것으로 보고 버림. 그 한 자리를 이 4자가 막음.
     저장 안 함. 탭 수명 동안만 고정이면 되고, 새로고침하면 새 값이어도 맞음 */
  let nonceCache: string | null = null;
  function tabNonce(): string {
    if (!nonceCache) nonceCache = makeHex(2);
    return nonceCache;
  }

  /* ── outbox ────────────────────────────────────────────────────
     못 보낸 쓰기 줄. 여기 남은 것은 **아직 GitHub 에 안 간 것**뿐이라, 다음 로드나 online 에
     그대로 다시 보냄. 이벤트가 append 전용이고 경로가 시각과 기기와 탭으로 정해져 있어 두 번
     보내도 같은 경로라, 먼저 간 것이 있으면 GitHub 이 422 로 막음. 그래서 재전송이 안전

     ★ **메모리 캐시를 두지 않는다.** localStorage 는 이 탭만의 것이 아니라 같은 출처의
     **모든 탭이 같이 쓰는 자리**다. 한 번 읽어 들고 있으면, 다른 탭이 그 사이에 넣은 줄이
     이 탭의 옛 벌에 밀려 통째로 사라진다 (두 탭을 열어 두면 뒤에 저장한 탭이 이긴다).
     그래서 읽기도 쓰기도 **매번 localStorage 를 다시 읽고**, 쓰기는 지금 있는 줄 위에 얹는다.
     'storage' 이벤트는 안 듣는다. 매번 다시 읽으면 알 이유가 없고, 이 창이 만든 변경은
     어차피 그 이벤트가 안 온다 */
  type OutboxItem = { path: string; value: unknown; message: string; at: string };
  /**
   * 저장이 아예 막힌 판(사파리 비공개, 저장소 꽉 참, 서드파티 차단)의 후퇴 자리.
   * null 이면 localStorage 가 정본. 한 번이라도 던지면 이 자리가 정본이 되고, 그때부터
   * 이번 화면 동안만 삶. 그런 판에는 다른 탭과 나눠 쓸 자리 자체가 없어 덮어쓰기도 없음.
   */
  let outboxFallback: OutboxItem[] | null = null;

  function parseOutbox(raw: string | null): OutboxItem[] {
    try {
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(
        (x): x is OutboxItem =>
          !!x && typeof (x as OutboxItem).path === 'string' && typeof (x as OutboxItem).message === 'string'
      );
    } catch {
      /* 남이 쓴 글자이거나 반쯤 적히다 만 것. 빈 줄로 친다 */
      return [];
    }
  }

  /** 부를 때마다 localStorage 를 다시 읽음. 반환은 **부르는 쪽 것**이라 마음대로 손대도 됨 */
  function readOutbox(): OutboxItem[] {
    if (outboxFallback) return outboxFallback.slice();
    try {
      return parseOutbox(window.localStorage.getItem(OUTBOX_KEY));
    } catch {
      outboxFallback = [];
      return [];
    }
  }

  function saveOutbox(list: OutboxItem[]): void {
    if (outboxFallback) {
      outboxFallback = list.slice();
      return;
    }
    try {
      if (list.length) window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
      else window.localStorage.removeItem(OUTBOX_KEY);
    } catch {
      /* 못 적었다. 여기서부터 이번 화면 동안은 메모리가 정본 */
      outboxFallback = list.slice();
    }
  }

  /* ── 다시 찾아올 길 ────────────────────────────────────────────
     이 도구는 category 'app' 이라 도구 목록에서 빠지고 (`getCategories` 가 'app' 을 거른다)
     갈래 메뉴에도 안 뜬다. 주소를 외운 사람만 다시 온다.
     한 번 로그인했으면 셸 옆줄의 "내 것" 칸에 꽂아 둔다. 저장 자리는 셸과 같은 열쇠
     (`src/toolbox.ts` 의 PINNED_KEY). 셸이 다음 로드에서 그 칸을 그린다.
     뺄 때는 안 건드린다. 로그아웃은 토큰을 지우는 것이지 즐겨찾기를 지우는 것이 아니다. */
  const PINNED_KEY = 'toolbox_pinned_tools';
  const SELF_ID = 'mydash';

  /** 맨바깥 이름 우선, 없는 자리(가짜 셸)에서만 window. 아래 등록부와 같은 손. */
  function toolbox(): NonNullable<typeof Toolbox> | undefined {
    const w = window as unknown as { Toolbox?: NonNullable<typeof Toolbox> };
    return (typeof Toolbox !== 'undefined' && Toolbox) ? Toolbox : w.Toolbox;
  }

  function readPins(): string[] {
    try {
      const raw = window.localStorage.getItem(PINNED_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  function pinSelf(): void {
    try {
      /* 저장 자리를 직접 봄. 셸의 togglePin, isPinned 은 `src/toolbox.ts` 의 IIFE 안 지역 함수라
         공개 API 에 없음. 있는 척 분기해 두면 영영 안 도는 죽은 코드. */
      const pins = readPins();
      if (pins.indexOf(SELF_ID) >= 0) return;
      pins.push(SELF_ID);
      window.localStorage.setItem(PINNED_KEY, JSON.stringify(pins));
    } catch {
      /* 저장이 막힌 판. 이번 화면은 그대로 돌고, 다음에 다시 로그인하면 또 시도한다. */
    }
  }

  /** 만료 30초 전부터는 만료로 친다. 요청 도중에 죽는 것보다 미리 갱신하는 편이 낫다. */
  function isExpired(v: Saved): boolean {
    return v.expiresAt !== null && v.expiresAt - 30000 < Date.now();
  }

  /* ── 실패의 종류 구분. 화면이 다르게 말해야 하는 것만 구분.
     ratelimit 은 auth 와 별도 갈래. 요청 한도에 걸린 사람에게 로그인이 풀렸다고 말하면
     멀쩡한 토큰을 버리고 재로그인하는 문제 방지. */
  /* perm 은 auth 와 다름. 토큰은 멀쩡한데 그 토큰에 쓰기 권한이 없는 것이라, 지우고 다시
     로그인해도 같은 자리에서 또 막힘. 사람이 GitHub App 설치 화면을 손봐야 풀림.
     exists 는 실패가 아니라 **이미 간 것**. 같은 경로를 두 번 보내면 GitHub 이 422 로 막고,
     outbox 는 그것을 성공으로 보고 버림 (재전송으로 이벤트가 두 벌 생기지 않게). */
  type FailKind = 'auth' | 'perm' | 'exists' | 'ratelimit' | 'notfound' | 'config' | 'net';
  class DashError extends Error {
    kind: FailKind;
    /** 429 를 준 쪽이 알려 준 대기 초. 없으면 부르는 쪽이 알아서 정함. */
    retryAfterSec: number | null;
    constructor(kind: FailKind, message: string, retryAfterSec: number | null = null) {
      super(message);
      this.kind = kind;
      this.retryAfterSec = retryAfterSec;
    }
  }

  /* ── 설정 ─────────────────────────────────────────────────────── */
  let configCache: Config | null = null;
  async function getConfig(): Promise<Config> {
    if (configCache) return configCache;
    let res: Response;
    try {
      res = await fetch(CONFIG_URL, { cache: 'no-cache' });
    } catch {
      throw new DashError('net', '설정 파일을 못 받았다');
    }
    if (!res.ok) throw new DashError('config', '설정 파일이 없다');
    let v: Partial<Config>;
    try {
      v = (await res.json()) as Partial<Config>;
    } catch {
      throw new DashError('config', '설정 파일이 JSON 이 아니다');
    }
    if (!v.relay || !v.owner || !v.repo) throw new DashError('config', '설정에 relay, owner, repo 가 있어야 한다');
    configCache = {
      relay: String(v.relay).replace(/\/+$/, ''),
      owner: v.owner,
      repo: v.repo,
      branch: v.branch || 'main',
      eventsBranch: v.eventsBranch || DEFAULT_EVENTS_BRANCH,
    };
    return configCache;
  }

  /* ── 기기 흐름 ─────────────────────────────────────────────────── */
  type DeviceStart = { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };
  type TokenReply = {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
  };

  /* 몸통에 error 를 실어 보내는 것이 정상인 창구.
     기기 흐름 폴링의 authorization_pending 과 slow_down 은 실패가 아니라 진행 중이고,
     갱신의 실패는 저장 토큰을 지울지 말지를 부르는 쪽이 가려야 한다. 그래서 이 둘만 예외. */
  const BODY_ERROR_LEAVES = ['/device/token', '/device/refresh'];

  async function relayPost<T>(cfg: Config, leaf: string, body: Record<string, string>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(cfg.relay + leaf, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* 여기서 죽는 가장 흔한 이유는 릴레이가 CORS 를 안 열었거나 주소가 틀린 것이다. */
      throw new DashError('net', '릴레이에 못 닿았다. 주소와 CORS 를 확인');
    }
    /* 401 만 인증 실패로 친다. 5xx 와 그 밖은 그때 못 닿은 것이라 토큰을 버릴 이유가 아니다. */
    if (res.status === 401) throw new DashError('auth', '릴레이가 401 을 줬다');
    /* 429 는 못 닿은 것이 아니라 잠깐 기다리라는 뜻. net 으로 던지면 폴링이 로그인 화면으로
       떨어져 흐름이 끊긴다. ratelimit 으로 갈라 부르는 쪽이 기다렸다 다시 오게 함. */
    if (res.status === 429) {
      const raw = Number(res.headers.get('retry-after'));
      const sec = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : null;
      throw new DashError('ratelimit', '릴레이 요청 한도. 잠시 뒤 다시', sec);
    }
    if (!res.ok) throw new DashError('net', '릴레이가 ' + res.status + ' 를 줬다');
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new DashError('net', '릴레이 응답이 JSON 이 아니다');
    }
    if (!data || typeof data !== 'object') throw new DashError('net', '릴레이 응답이 객체가 아니다');
    const rec = data as Record<string, unknown>;
    /* ★ GitHub 은 HTTP 200 몸통에 {"error": ...} 를 넣는다. 안 보면 화면이 받는 중에 멈춘다. */
    if (!BODY_ERROR_LEAVES.includes(leaf) && typeof rec.error === 'string' && rec.error) {
      throw new DashError('net', 'GitHub: ' + rec.error);
    }
    if (leaf === '/device/code') {
      for (const key of ['device_code', 'user_code', 'verification_uri']) {
        if (typeof rec[key] !== 'string' || !rec[key]) {
          throw new DashError('net', '릴레이 응답에 ' + key + ' 가 없다');
        }
      }
    }
    return data as T;
  }

  function tokenFrom(reply: TokenReply): Saved {
    const now = Date.now();
    return {
      token: reply.access_token as string,
      expiresAt: typeof reply.expires_in === 'number' ? now + reply.expires_in * 1000 : null,
      refresh: reply.refresh_token || null,
      refreshExpiresAt:
        typeof reply.refresh_token_expires_in === 'number' ? now + reply.refresh_token_expires_in * 1000 : null,
    };
  }

  /**
   * 갱신 결과 셋.
   * - ok: 새 토큰
   * - dead: GitHub 명시적 거절. 저장 토큰 삭제
   * - keep: 네트워크나 5xx. **삭제 안 함**. 이번 요청만 실패, 다음에 재시도
   */
  type RefreshOut = { kind: 'ok'; saved: Saved } | { kind: 'dead' } | { kind: 'keep' };

  /** GitHub 이 이 이름을 대면 갱신 토큰이 죽은 것. 그 밖의 이름은 다음에 다시 해 본다. */
  const DEAD_REFRESH_ERRORS = ['bad_refresh_token', 'unauthorized_client', 'incorrect_client_credentials', 'access_denied'];

  async function refreshOnce(cfg: Config, saved: Saved): Promise<RefreshOut> {
    if (!saved.refresh) return { kind: 'dead' };
    if (saved.refreshExpiresAt !== null && saved.refreshExpiresAt < Date.now()) return { kind: 'dead' };
    let reply: TokenReply;
    try {
      reply = await relayPost<TokenReply>(cfg, '/device/refresh', { refresh_token: saved.refresh });
    } catch (e) {
      return (e as DashError).kind === 'auth' ? { kind: 'dead' } : { kind: 'keep' };
    }
    if (reply.error) return DEAD_REFRESH_ERRORS.includes(reply.error) ? { kind: 'dead' } : { kind: 'keep' };
    if (!reply.access_token) return { kind: 'keep' };
    const next = tokenFrom(reply);
    saveToken(next);
    return { kind: 'ok', saved: next };
  }

  /* 패널 둘이 같은 순간에 읽으면 갱신이 두 번 나가고, 늦게 온 쪽이 먼저 받은 토큰 덮어쓰기 발생.
     진행 중인 갱신 하나로 병합. */
  let refreshing: Promise<RefreshOut> | null = null;
  function refresh(cfg: Config, saved: Saved): Promise<RefreshOut> {
    if (refreshing) return refreshing;
    const p = refreshOnce(cfg, saved).then(
      (out) => {
        if (refreshing === p) refreshing = null;
        return out;
      },
      (e) => {
        if (refreshing === p) refreshing = null;
        throw e;
      }
    );
    refreshing = p;
    return p;
  }

  /**
   * 지금 쓸 수 있는 토큰. 없거나 죽었으면 null.
   * 갱신을 못 해 본 것(네트워크, 5xx)은 null 이 아니라 예외. 로그인이 풀린 것과 별개.
   */
  async function liveToken(cfg: Config): Promise<string | null> {
    const saved = loadSaved();
    if (!saved) return null;
    /* 만료를 안 밝힌 토큰은 만료가 없는 토큰. 갱신을 시도조차 안 하고 그대로 쓴다. */
    if (saved.expiresAt === null) return saved.token;
    if (!isExpired(saved)) return saved.token;
    const out = await refresh(cfg, saved);
    if (out.kind === 'ok') return out.saved.token;
    if (out.kind === 'dead') {
      saveToken(null);
      return null;
    }
    throw new DashError('net', '토큰 갱신에 못 닿았다. 잠시 뒤 다시');
  }

  /* ── 저장소 읽기와 쓰기 ─────────────────────────────────────────── */

  /** 경로 조각마다 encode. 빗금은 그대로 둬야 GitHub 이 폴더로 읽는다 */
  function encPath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  /** utf-8 을 base64 로. GitHub contents API 는 base64 만 받는다. 이벤트 파일은 작다 */
  function toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let raw = '';
    for (const b of bytes) raw += String.fromCharCode(b);
    return window.btoa(raw);
  }

  /* 한 번에 하나만. 로그인 직후와 online 이 겹치면 같은 줄을 두 번 보냄 */
  let flushing: Promise<{ sent: number; left: number }> | null = null;

  function makeRepo(cfg: Config): DashRepoWrite {
    const eventsBranch = cfg.eventsBranch || DEFAULT_EVENTS_BRANCH;

    /** contents 주소 하나. `extra` 는 `&per_page=100` 처럼 이미 encode 된 덧붙임 */
    function contentsUrl(path: string, ref?: string, extra?: string): string {
      return (
        API + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encPath(path) +
        '?ref=' + encodeURIComponent(ref || cfg.branch || 'main') + (extra || '')
      );
    }

    /**
     * 절대 주소 하나를 GitHub 에서 받아 옴. 상태 갈래는 여기 한 곳.
     * `label` 은 실패 문구에 넣을 이름 (보통 경로). 주소를 그대로 보이면 토큰 자리까지 길어짐.
     *
     * 주소를 통째로 받는 이유는 목록의 다음 장. Link 머리표가 준 주소를 그대로 다시 부름.
     */
    async function callUrl(url: string, accept: string, label: string): Promise<Response> {
      const token = await liveToken(cfg);
      if (!token) throw new DashError('auth', '로그인이 필요하다');
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { authorization: 'Bearer ' + token, accept, 'x-github-api-version': '2022-11-28' },
        });
      } catch {
        throw new DashError('net', 'GitHub 에 못 닿았다');
      }
      if (res.status === 401) {
        /* 토큰이 죽었다. 들고 있어 봐야 다음 요청도 401 이다. */
        saveToken(null);
        throw new DashError('auth', '토큰이 만료됐다');
      }
      if (res.status === 404) {
        /* ★ **여기가 인가.** 권한이 없는 토큰도, 파일이 없는 경우도 똑같이 404.
           GitHub 이 일부러 안 가른다(있는지조차 안 알려 준다). 우리도 안 가른다. */
        throw new DashError('notfound', label + ' 를 못 읽는다 (없거나, 이 계정에 권한이 없다)');
      }
      if (res.status === 403 || res.status === 429) {
        /* 403 은 로그인이 풀린 것과 무관. 요청 한도가 대부분이고, 토큰은 정상.
           한도 머리표가 있으면 풀리는 시각까지 표시. */
        const left = res.headers.get('x-ratelimit-remaining');
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        if (left !== null && Number.isFinite(reset) && reset > 0) {
          const at = new Date(reset * 1000);
          const hhmm = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
          throw new DashError('ratelimit', 'GitHub 요청 한도. ' + hhmm + ' 뒤 다시');
        }
        throw new DashError('ratelimit', 'GitHub 이 막았다 (요청 한도이거나 App 권한 부족)');
      }
      if (!res.ok) throw new DashError('net', 'GitHub 이 ' + res.status + ' 를 줬다');
      return res;
    }

    function call(path: string, accept: string, ref?: string): Promise<Response> {
      return callUrl(contentsUrl(path, ref), accept, path);
    }

    /**
     * Link 머리표의 다음 장 주소. 없으면 null.
     *
     * GitHub 이 준 주소지만 그대로 믿지 않는다. 이 주소에는 **토큰이 실려 나간다.**
     * `api.github.com` 으로 시작하는 것만 받음.
     */
    function nextPageUrl(header: string | null): string | null {
      if (!header) return null;
      for (const part of header.split(',')) {
        const m = /<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i.exec(part);
        if (m && m[1].indexOf(API + '/') === 0) return m[1];
      }
      return null;
    }

    async function readText(path: string, opts?: DashReadOpts): Promise<string> {
      const res = await call(path, 'application/vnd.github.raw', opts?.ref);
      return res.text();
    }

    /**
     * 새 파일 하나. **덮어쓰기 없음.** sha 를 안 보내므로 같은 경로가 이미 있으면 422.
     *
     * 실패 갈래를 여기서 갈라 둔다. 읽기의 404 는 "없거나 권한 없음" 이지만, 쓰기의 404 와 403 은
     * 같은 하나다. 이 저장소가 보이는 토큰으로 쓰기만 막힌 것 (App 권한이 Read-only).
     * 그래서 auth 로 안 던진다. 토큰을 지우고 다시 로그인해도 같은 자리에서 또 막히고,
     * 사람은 왜 로그인이 자꾸 풀리나만 보게 됨
     */
    async function putNewJson(path: string, value: unknown, message: string): Promise<void> {
      const token = await liveToken(cfg);
      if (!token) throw new DashError('auth', '로그인이 필요하다');
      const body = JSON.stringify({
        /* 접두는 셸이 지킨다. 이벤트 브랜치 로그에서 화면이 만든 커밋을 한눈에 고르게 */
        message: message.indexOf('dash: ') === 0 ? message : 'dash: ' + message,
        content: toBase64(JSON.stringify(value, null, 2) + '\n'),
        branch: eventsBranch,
      });
      let res: Response;
      try {
        res = await fetch(API + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encPath(path), {
          method: 'PUT',
          headers: {
            authorization: 'Bearer ' + token,
            accept: 'application/vnd.github+json',
            'content-type': 'application/json',
            'x-github-api-version': '2022-11-28',
          },
          body,
        });
      } catch {
        throw new DashError('net', 'GitHub 에 못 닿았다');
      }
      if (res.status === 401) {
        saveToken(null);
        throw new DashError('auth', '토큰이 만료됐다');
      }
      if (res.status === 403 || res.status === 404) throw new DashError('perm', PERM_MSG);
      /* 이미 있는 경로. 409 는 브랜치가 그 사이에 움직인 것이라 다시 보내면 됨 */
      if (res.status === 422) throw new DashError('exists', path + ' 는 이미 있다');
      if (res.status === 429) throw new DashError('ratelimit', 'GitHub 요청 한도. 잠시 뒤 다시');
      if (!res.ok) throw new DashError('net', 'GitHub 이 ' + res.status + ' 를 줬다');
    }

    /* 지금 저장소에 있는 줄 위에 얹는다. 들고 있던 벌에 얹으면 다른 탭이 그 사이에 넣은 것이 날아감 */
    function enqueueJson(path: string, value: unknown, message: string): void {
      const list = readOutbox();
      list.push({ path, value, message, at: new Date().toISOString() });
      saveOutbox(list);
    }

    /**
     * 앞에서부터 하나씩. **순서를 지킨다.** 같은 항목에 대한 두 이벤트가 뒤집혀 가면
     * 늦은 것이 이기는 규칙이 뒤집힌 순서로 적용됨.
     *
     * - exists: 먼저 간 것. 버리고 다음
     * - 그 밖: 멈추고 남김. 권한이든 네트워크든 다음 것도 같은 자리에서 막힘
     */
    async function flushOnce(): Promise<{ sent: number; left: number }> {
      let sent = 0;
      for (;;) {
        /* 보내는 사이에 사람이 또 태그를 달 수 있음. 그래서 매번 지금 줄을 다시 읽고,
           지울 때도 방금 보낸 경로 하나만 뺌. 통째로 덮으면 그 사이 들어온 것이 사라짐 */
        const list = readOutbox();
        if (!list.length) return { sent, left: 0 };
        const head = list[0];
        try {
          await putNewJson(head.path, head.value, head.message);
          sent++;
        } catch (e) {
          if ((e as DashError).kind !== 'exists') return { sent, left: readOutbox().length };
        }
        saveOutbox(readOutbox().filter((x) => x.path !== head.path));
      }
    }

    function flushOutbox(): Promise<{ sent: number; left: number }> {
      if (flushing) return flushing;
      const p = flushOnce().then(
        (out) => {
          if (flushing === p) flushing = null;
          return out;
        },
        (e) => {
          if (flushing === p) flushing = null;
          throw e;
        }
      );
      flushing = p;
      return p;
    }

    return {
      readText,
      async readJson<T>(path: string, opts?: DashReadOpts): Promise<T> {
        const text = await readText(path, opts);
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new DashError('net', path + ' 가 JSON 이 아니다');
        }
      },
      /**
       * 폴더 하나를 **끝까지**. 없는 폴더는 빈 배열. 이벤트는 달마다 폴더가 생기므로,
       * 이번 달 폴더가 아직 없는 것이 정상인 상태. 그것까지 실패로 던지면 패널이 첫 화면에서
       * 오류 카드를 봄.
       *
       * ★ **한 장으로 안 끝난다.** contents API 는 장을 나눠 준다. 안 나누고 한 번만 부르면
       * 앞에서 최대 1,000 개까지만 오고 나머지는 **조용히 빠진다** (실패가 아니라 짧은 목록이
       * 온다. 패널은 그것이 전부인 줄 안다). 한 달에 이벤트가 1,000 건을 넘으면 그 달의 판정이
       * 통째로 사라지는 자리. `per_page=100` 을 걸고 Link 머리표의 next 를 끝까지 따라감.
       *
       * 배열이 아니면 빈 배열. 폴더가 아니라 파일 하나를 가리키면 객체가 온다. 목록을 물었는데
       * 목록이 아닌 것은 없는 것과 같이 친다 (없는 달과 같은 자리라 던지면 또 오류 카드).
       */
      async list(path: string, opts?: DashReadOpts): Promise<DashEntry[]> {
        const out: DashEntry[] = [];
        let url: string | null = contentsUrl(path, opts?.ref, '&per_page=100');
        /* 서버가 자기 자신을 next 로 주는 판에서 영원히 도는 것 방지. 100장이면 1만 개 */
        for (let page = 0; url && page < 100; page++) {
          let res: Response;
          try {
            res = await callUrl(url, 'application/vnd.github+json', path);
          } catch (e) {
            if ((e as DashError).kind === 'notfound') return page === 0 ? [] : out;
            throw e;
          }
          let raw: unknown;
          try {
            raw = await res.json();
          } catch {
            throw new DashError('net', path + ' 목록이 JSON 이 아니다');
          }
          if (!Array.isArray(raw)) return page === 0 ? [] : out;
          for (const e of raw as Array<{ name: string; path: string; type: string; size?: number }>) {
            out.push({
              name: e.name,
              path: e.path,
              type: e.type === 'dir' ? 'dir' : 'file',
              size: e.size || 0,
            });
          }
          url = nextPageUrl(res.headers.get('link'));
        }
        return out;
      },
      putNewJson,
      enqueueJson,
      flushOutbox,
      eventsBranch,
      deviceId: deviceId(),
      /* 파일 이름은 패널이 만든다. 셸은 안 겹치는 조각만 준다 (기기 6자 + 탭 4자) */
      nonce: tabNonce(),
    };
  }

  /* ── 모양 ──────────────────────────────────────────────────────── */
  const STYLE_ID = 'mydash-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 폰이 주 용도다. 기본이 한 칸이고, 넓어지면 늘어난다 (그 반대로 짜면 폰이 늘 남는다). */
    el.textContent = [
      '.myd{display:flex;flex-direction:column;gap:12px}',
      '.myd-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.myd-title{font-weight:600}',
      '.myd-stat{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.myd-who{margin-left:auto;font-size:var(--font-size-2xs);color:var(--text-tertiary);display:flex;gap:8px;align-items:center}',
      '.myd-nav{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}',
      /* 누르는 것은 폰에서 44x44 아래로 안 내려간다. 칩도 예외가 아니다. */
      '.myd-nav button{flex:0 0 auto;padding:6px 12px;font:inherit;font-size:var(--font-size-2xs);cursor:pointer;',
      'min-height:44px;min-width:44px;',
      'background:transparent;color:var(--text-secondary);border:1px solid currentColor;border-radius:var(--radius-pill)}',
      '.myd-nav button.on{color:var(--text-primary);background:var(--bg-hover)}',
      '.myd-body{min-height:200px}',
      '.myd-card{padding:12px 14px;border-radius:var(--radius-lg);background:var(--bg-tertiary);',
      'display:flex;flex-direction:column;gap:8px}',
      '.myd-note{font-size:var(--font-size-2xs);color:var(--text-secondary);line-height:1.6}',
      '.myd-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.6rem;letter-spacing:.16em;',
      'text-align:center;padding:12px;border-radius:var(--radius-lg);background:var(--bg-secondary);',
      'border:1px solid var(--border);user-select:all;word-break:break-all}',
      '.myd-btn{padding:10px 16px;font:inherit;cursor:pointer;border-radius:var(--radius-md);',
      'background:var(--accent-dim);color:var(--text-primary);border:1px solid var(--accent);text-decoration:none;',
      'display:inline-block;text-align:center;min-height:44px;min-width:44px;line-height:24px}',
      '.myd-btn.ghost{background:transparent;border-color:var(--border);color:var(--text-secondary)}',
      '.myd-btn:hover{background:var(--bg-hover)}',
      '.myd-warn{padding:10px 12px;border-radius:var(--radius-md);background:var(--warning-subtle);',
      'border:1px solid var(--warning);font-size:var(--font-size-2xs);line-height:1.6}',
      '.myd-paths{font-size:var(--font-size-3xs);color:var(--text-tertiary);word-break:break-all;line-height:1.7}',
      '.myd-row{display:flex;gap:8px;flex-wrap:wrap}',
      '@media(min-width:640px){.myd-code{font-size:2rem}}',
    ].join('');
    document.head.appendChild(el);
  }

  /* ── 그리기 ────────────────────────────────────────────────────── */
  function render(root: HTMLElement): void {
    ensureStyle();
    root.innerHTML =
      '<div class="myd">' +
      '<div class="myd-bar"><span class="myd-title">내 대시보드</span>' +
      '<span class="myd-stat"></span><span class="myd-who"></span></div>' +
      '<div class="myd-nav" hidden></div>' +
      '<div class="myd-body"></div>' +
      '</div>';
    const whoEl = root.querySelector('.myd-who') as HTMLElement;
    const statEl = root.querySelector('.myd-stat') as HTMLElement;
    const navEl = root.querySelector('.myd-nav') as HTMLElement;
    const bodyEl = root.querySelector('.myd-body') as HTMLElement;

    /* 패널이 붙여 둔 뒷정리. 패널을 갈아 끼울 때마다 부른다. 안 부르면 타이머가 쌓인다. */
    let cleanups: Array<() => void> = [];
    /* 지금 보던 패널을 다시 그리는 함수. 오류 카드의 "다시 시도" 가 호출
       로그인 화면으로 갈 때마다 비운다. */
    let reopenPanel: (() => void) | null = null;
    /* ★ **패널마다 제 칸 하나.** 셸이 `bodyEl` 을 그대로 건네면 늦게 끝난 async render 가
       이미 다음 패널이 그려 놓은 화면 위에 덮어쓰기 (패널을 빨리 두 번 바꿀 때).
       그래서 패널을 열 때마다 새 div 를 만들어 붙이고 그 div 만 건넴. 갈아 끼울 때 이전 div 는
       DOM 에서 떼므로, 늦게 온 render 는 떨어진 div 에 그리기. 화면에는 아무 일 없음. */
    let panelBox: HTMLElement | null = null;
    /** online 이벤트 떼는 손. 대시보드 한 판에 하나 */
    let stopOnline: (() => void) | null = null;
    /* 머리말 한 줄(statEl)과 실패 보고는 화면에 하나뿐이라 칸으로 못 가름. 세대 번호로 가름.
       지금 세대가 아닌 패널이 부르면 무시. */
    let panelGen = 0;
    function disposePanel(): void {
      panelGen++;
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* 치우다 죽어도 다음 것은 치운다 */
        }
      }
      cleanups = [];
      if (panelBox) {
        panelBox.remove();
        panelBox = null;
      }
    }
    /* 맨바깥 이름 `Toolbox` 우선 확인, 없는 자리(가짜 셸로 재는 테스트)에서만 window 로 확인.
       셸은 `const Toolbox` 로 생성하고 const 는 window 에 안 붙음. window 만 보면 실서비스에서
       등록이 통째로 헛돌아 기기 흐름 폴링이 위젯 이탈 뒤에도 안 멈추는 문제 (memo-atlas 와 동일 패턴). */
    toolbox()?.onDispose?.(() => {
      disposePanel();
      stopOnline?.();
    });

    function say(html: string): void {
      disposePanel();
      bodyEl.innerHTML = html;
    }

    /* ── 로그인 전 화면.
       이 사이트는 공개다. 남이 이 주소를 열 수 있고, 열면 **이게 뭔지**와 **왜 안 보이는지**가
       바로 보여야 한다. 데이터는 한 줄도 안 그린다. 로그인 전에는 그릴 데이터가 아예 없다
       (셸이 아무것도 안 받아 왔다). 대신 무엇을 읽는 화면인지는 밝힌다. */
    function showLoggedOut(cfg: Config | null, why?: string): void {
      const paths = reg.panels.map((p) => p.title + ', ' + p.paths.join(', '));
      say(
        '<div class="myd-card">' +
          (why ? '<div class="myd-warn">' + esc(why) + '</div>' : '') +
          '<div class="myd-note">' +
          '차곡의 개인 대시보드입니다. 데이터는 이 사이트가 아니라 <b>private 저장소</b>' +
          (cfg ? ' (' + esc(cfg.owner + '/' + cfg.repo) + ')' : '') +
          '에 있고, 로그인한 브라우저가 GitHub 에서 <b>직접</b> 받아 갑니다. ' +
          '이 사이트의 서버는 그 데이터를 보관하지도 거치지도 않습니다.<br>' +
          '그 저장소에 접근 권한이 없는 계정으로 로그인하면 GitHub 이 404 를 줍니다. ' +
          '읽을 수 있는 사람만 읽힙니다.' +
          '</div>' +
          (paths.length
            ? '<div class="myd-paths">읽는 것: ' + esc(paths.join(' / ')) + '</div>'
            : '') +
          '<div class="myd-row"><button class="myd-btn" data-login="1">GitHub 로 로그인</button></div>' +
          '</div>'
      );
      const btn = bodyEl.querySelector('[data-login]') as HTMLButtonElement | null;
      btn?.addEventListener('click', () => void startLogin());
    }

    function showConfigHelp(msg: string): void {
      say(
        '<div class="myd-card">' +
          '<div class="myd-warn">아직 설정이 없습니다. ' + esc(msg) + '</div>' +
          '<div class="myd-note">' +
          '<code>apps/karmolab/data/mydash-config.json</code> 을 만들어야 합니다. ' +
          '같은 폴더의 <code>mydash-config.example.json</code> 을 복사해 <code>relay</code>, ' +
          '<code>owner</code>, <code>repo</code> 를 채우세요. ' +
          '비밀값은 여기 들어가지 않습니다. client id 와 secret 은 릴레이 쪽 환경변수입니다.' +
          '</div></div>'
      );
    }

    /** 기기 흐름. 폰에서는 코드를 눌러 복사하고 새 탭에서 붙여 넣는 흐름이 된다. */
    async function startLogin(): Promise<void> {
      let cfg: Config;
      try {
        cfg = await getConfig();
      } catch (e) {
        const err = e as DashError;
        if (err.kind === 'config') showConfigHelp(err.message);
        else showLoggedOut(null, err.message);
        return;
      }
      say('<div class="myd-card"><div class="myd-note">GitHub 에 기기 코드를 받는 중...</div></div>');
      let start: DeviceStart;
      try {
        start = await relayPost<DeviceStart>(cfg, '/device/code', {});
      } catch (e) {
        showLoggedOut(cfg, (e as Error).message);
        return;
      }
      const deadline = Date.now() + (start.expires_in || 900) * 1000;
      /* 릴레이가 준 주소다. https 가 아니면 링크로 안 걸고 글자로만 보여 준다. */
      const openUrl = httpsUrl(start.verification_uri);
      say(
        '<div class="myd-card">' +
          '<div class="myd-note">아래 코드를 GitHub 에 넣으세요. 이 화면은 그대로 두면 됩니다.</div>' +
          '<div class="myd-code" data-code="1">' + esc(start.user_code) + '</div>' +
          '<div class="myd-row">' +
          (openUrl
            ? '<a class="myd-btn" target="_blank" rel="noopener noreferrer" href="' +
              esc(openUrl) + '">GitHub 열기</a>'
            : '<span class="myd-note">' + esc(start.verification_uri) + ' 를 직접 여세요.</span>') +
          '<button class="myd-btn ghost" data-copy="1">코드 복사</button>' +
          '<button class="myd-btn ghost" data-cancel="1">그만두기</button>' +
          '</div>' +
          '<div class="myd-note" data-poll="1">기다리는 중...</div>' +
          '</div>'
      );
      const pollEl = bodyEl.querySelector('[data-poll]') as HTMLElement;
      let stopped = false;
      (bodyEl.querySelector('[data-cancel]') as HTMLElement | null)?.addEventListener('click', () => {
        stopped = true;
        showLoggedOut(cfg);
      });
      (bodyEl.querySelector('[data-copy]') as HTMLElement | null)?.addEventListener('click', () => {
        /* 클립보드는 권한과 https 를 탄다. 안 되면 코드가 화면에 그대로 있으니 손으로 옮기면 된다. */
        try {
          void navigator.clipboard?.writeText(start.user_code);
          pollEl.textContent = '복사했습니다. GitHub 에 붙여 넣으세요.';
        } catch {
          pollEl.textContent = '복사가 안 됩니다. 코드를 손으로 옮기세요.';
        }
      });
      cleanups.push(() => {
        stopped = true;
      });

      let wait = Math.max(5, start.interval || 5) * 1000;
      const tick = async (): Promise<void> => {
        if (stopped) return;
        if (Date.now() > deadline) {
          showLoggedOut(cfg, '코드가 만료됐습니다. 다시 시작하세요.');
          return;
        }
        let reply: TokenReply;
        try {
          reply = await relayPost<TokenReply>(cfg, '/device/token', { device_code: start.device_code });
        } catch (e) {
          const err = e as DashError;
          /* 릴레이 한도는 실패가 아니라 진행 중. slow_down 과 같은 자리에서 처리.
             흐름을 안 끊고 retry-after (없으면 지금 간격의 2배) 만큼 쉬었다 다시 */
          if (err && err.kind === 'ratelimit') {
            const backoff = err.retryAfterSec ? err.retryAfterSec * 1000 : wait * 2;
            pollEl.textContent = '요청이 몰려 잠시 쉬는 중...';
            window.setTimeout(() => void tick(), backoff);
            return;
          }
          showLoggedOut(cfg, (e as Error).message);
          return;
        }
        if (reply.access_token) {
          saveToken(tokenFrom(reply));
          /* 로그인에 성공한 사람만 꽂는다. 남이 열어 본 화면에는 안 남는다. */
          pinSelf();
          void showDashboard(cfg);
          return;
        }
        if (reply.error === 'authorization_pending') {
          pollEl.textContent = '아직 기다리는 중...';
        } else if (reply.error === 'slow_down') {
          /* GitHub 이 너무 자주라고 하면 **5초 더** 늘린다. 안 늘리면 계속 slow_down 만 온다. */
          wait += 5000;
        } else if (reply.error === 'expired_token') {
          showLoggedOut(cfg, '코드가 만료됐습니다. 다시 시작하세요.');
          return;
        } else if (reply.error === 'access_denied') {
          showLoggedOut(cfg, '승인을 취소했습니다.');
          return;
        } else if (reply.error) {
          showLoggedOut(cfg, 'GitHub: ' + reply.error);
          return;
        }
        window.setTimeout(() => void tick(), wait);
      };
      window.setTimeout(() => void tick(), wait);
    }

    /**
     * 밀린 쓰기를 지금 보낸다. 화면에는 **보낸 것이 있을 때만** 한 줄.
     * 0 건이면 아무 말도 안 함. 아무 일 없는 화면에 매번 줄이 붙으면 사람이 안 읽게 됨.
     */
    async function flushAndSay(repo: DashRepoWrite): Promise<void> {
      let out: { sent: number; left: number };
      try {
        out = await repo.flushOutbox();
      } catch {
        /* 여기서 죽어도 화면은 그대로. 남은 것은 outbox 에 있고 다음 기회에 다시 */
        return;
      }
      if (out.sent > 0) {
        statEl.textContent = '밀린 기록 ' + out.sent + '건 보냄' + (out.left ? ', ' + out.left + '건 남음' : '');
      }
    }

    /* 오프라인에서 쌓인 것을 그물이 돌아온 순간에 보냄. 대시보드 한 판에 하나만 걺 */
    function watchOnline(repo: DashRepoWrite): void {
      if (stopOnline) return;
      const onOnline = (): void => void flushAndSay(repo);
      window.addEventListener('online', onOnline);
      stopOnline = (): void => {
        window.removeEventListener('online', onOnline);
        stopOnline = null;
      };
    }

    function logout(cfg: Config): void {
      saveToken(null);
      /* 토큰이 없으면 보낼 수도 없음. 남은 outbox 는 안 지움. 다시 로그인하면 그때 감 */
      stopOnline?.();
      reopenPanel = null;
      navEl.hidden = true;
      navEl.textContent = '';
      whoEl.textContent = '';
      /* 머리말에는 패널이 적어 둔 host 이름이 남아 있다. 안 지우면 로그아웃한 화면에
         읽던 저장소 이름이 그대로 걸린다. 로그인 전 화면과 같아야 한다. */
      statEl.textContent = '';
      showLoggedOut(cfg);
    }

    /* ── 로그인 뒤. 패널 명부를 그대로 칩으로 만든다. */
    async function showDashboard(cfg: Config): Promise<void> {
      const repo = makeRepo(cfg);
      /* 로그인 뒤 한 번. 지난 화면에서 그물이 끊겨 못 보낸 것이 남아 있을 수 있음 */
      void flushAndSay(repo);
      watchOnline(repo);
      whoEl.innerHTML =
        '<span>' + esc(cfg.owner + '/' + cfg.repo) + '</span>' +
        /* 여기만 44px 아래로 내리면 폰에서 못 누른다. 좁게 보이려고 padding 만 줄인다. */
        '<button class="myd-btn ghost" data-logout="1" style="padding:4px 10px">나가기</button>';
      (whoEl.querySelector('[data-logout]') as HTMLElement | null)?.addEventListener('click', () => logout(cfg));

      const panels = reg.panels;
      if (!panels.length) {
        say('<div class="myd-card"><div class="myd-note">붙은 패널이 없습니다.</div></div>');
        return;
      }
      navEl.hidden = panels.length < 2;
      navEl.textContent = '';
      let current = '';

      const open = (panel: DashPanel): void => {
        if (current === panel.id) return;
        current = panel.id;
        for (const b of Array.from(navEl.querySelectorAll('button'))) {
          b.classList.toggle('on', b.getAttribute('data-panel') === panel.id);
        }
        disposePanel();
        bodyEl.textContent = '';

        /* 이 패널의 칸. 다음 패널로 넘어가면 `disposePanel` 이 떼어 냄. */
        const gen = panelGen;
        const isCurrent = (): boolean => gen === panelGen;
        const mine = document.createElement('div');
        mine.setAttribute('data-panel-box', panel.id);
        bodyEl.appendChild(mine);
        panelBox = mine;

        const status = (text: string): void => {
          if (!isCurrent()) return;
          statEl.textContent = text;
        };
        statEl.textContent = '';
        const ctx: DashPanelCtx<DashRepoWrite> = {
          root: mine,
          repo,
          status,
          isCurrent,
          /* 이미 넘어간 패널이 뒤늦게 맡기면 다음 패널 목록에 섞임. 그 자리에서 치우기. */
          onDispose: (fn) => {
            if (!isCurrent()) {
              try {
                fn();
              } catch {
                /* 치우다 죽어도 화면은 그대로 */
              }
              return;
            }
            cleanups.push(fn);
          },
        };
        try {
          /* ★ **갈래는 타입에만 있다.** 저장소 객체는 하나고, 읽기 패널의 ctx 타입에는
             putNewJson 이 없어 부를 수가 없음. 화면 쪽 차단 문구는 없앰 (쓰기가 붙었다).
             토큰에 쓰기 권한이 있는지는 여기서 못 알아냄. 첫 쓰기가 403, 404 로 막힐 때
             `perm` 으로 안내 (makeRepo 의 putNewJson). */
          const out = panel.access === 'read' ? panel.render(ctx) : panel.render(ctx);
          void Promise.resolve(out).catch((e: unknown) => {
            if (isCurrent()) onPanelFail(cfg, e);
          });
        } catch (e) {
          onPanelFail(cfg, e);
        }
      };

      /* 같은 패널을 다시 연다. `open` 은 같은 id 면 아무것도 안 하므로 표식을 먼저 비운다. */
      reopenPanel = (): void => {
        const p = panels.filter((x) => x.id === current)[0] || panels[0];
        current = '';
        open(p);
      };

      for (const p of panels) {
        const b = document.createElement('button');
        b.textContent = p.title;
        b.setAttribute('data-panel', p.id);
        b.addEventListener('click', () => open(p));
        navEl.appendChild(b);
      }
      open(panels[0]);
    }

    /**
     * 패널이 던진 것. 여기서 막히면 화면이 끝이라 나갈 길이 늘 하나는 있어야 함
     *
     * ★ **토큰을 지우는 것은 auth 뿐.** 401 을 받은 것만 로그인이 풀린 것.
     * 나머지는 토큰이 멀쩡한데 다른 이유로 못 읽은 것이라, 지우면 멀쩡한 로그인을 버리고
     * 기기 흐름을 처음부터 다시 타게 됨 (한도에 걸린 사람에게 더 많은 요청을 시킴).
     * - ratelimit, net: 잠깐 못 닿음. 그대로 두고 다시 시도
     * - notfound: 파일 하나가 없거나 그 경로에 권한이 없는 것. **토큰 문제가 아님.**
     *   경로를 문구에 그대로 보이고 다시 시도. 계정을 바꾸려면 머리말의 나가기
     * - perm: 읽기는 되는데 쓰기가 막힌 것. 토큰을 지우면 안 됨. 다시 로그인해도 같은 자리에서
     *   또 막히고, 사람이 보는 것은 로그인이 자꾸 풀리는 화면뿐. GitHub App 설치 화면에서
     *   Contents 를 Read & write 로 바꾸고 승인해야 풀림
     * - config: 설정 파일 문제. 토큰과 무관하므로 안내만
     */
    function onPanelFail(cfg: Config, e: unknown): void {
      const err = e as DashError;
      const kind: FailKind = err && err.kind ? err.kind : 'net';
      const msg = err && err.message ? err.message : '알 수 없는 실패';
      if (kind === 'auth') {
        reopenPanel = null;
        showLoggedOut(cfg, '로그인이 풀렸습니다. 다시 로그인하세요.');
        navEl.hidden = true;
        navEl.textContent = '';
        whoEl.textContent = '';
        statEl.textContent = '';
        return;
      }
      statEl.textContent = '';
      if (kind === 'config') {
        showConfigHelp(msg);
        return;
      }
      say(
        '<div class="myd-card"><div class="myd-warn">' +
          esc(msg) +
          '</div>' +
          (kind === 'notfound'
            ? '<div class="myd-note">로그인은 그대로입니다. 저장소에 그 경로가 없거나, ' +
              '이 계정이 그 경로를 못 읽습니다. 계정을 바꾸려면 머리말의 나가기.</div>'
            : '') +
          (kind === 'perm'
            ? '<div class="myd-note">로그인은 그대로입니다. 읽기는 되는데 <b>쓰기 권한</b>이 ' +
              '없습니다. GitHub 의 App 설치 화면에서 Repository permissions 의 Contents 를 ' +
              'Read &amp; write 로 바꾸고 승인한 뒤 다시 시도하세요. 다시 로그인하지 않아도 ' +
              '됩니다. 못 보낸 기록은 이 기기에 남아 있다가 권한이 풀리면 같이 올라갑니다.</div>'
            : '') +
          '<div class="myd-row"><button class="myd-btn ghost" data-retry="1">다시 시도</button></div>' +
          '</div>'
      );
      (bodyEl.querySelector('[data-retry]') as HTMLElement | null)?.addEventListener('click', () => {
        /* 토큰은 그대로. 보던 패널만 다시 그린다. 패널이 없으면 목록부터 다시. */
        if (reopenPanel) reopenPanel();
        else void showDashboard(cfg);
      });
    }

    /* ── 첫 진입 ── */
    void (async () => {
      let cfg: Config;
      try {
        cfg = await getConfig();
      } catch (e) {
        const err = e as DashError;
        if (err.kind === 'config') showConfigHelp(err.message);
        else showLoggedOut(null, err.message);
        return;
      }
      let token: string | null;
      try {
        token = await liveToken(cfg);
      } catch (e) {
        /* 갱신을 못 해 본 것. 저장 토큰은 그대로 두고 이번 화면만 로그인 길로 보낸다. */
        showLoggedOut(cfg, (e as Error).message);
        return;
      }
      if (token) void showDashboard(cfg);
      else showLoggedOut(cfg);
    })();
  }

  /* ── 등록.
     맨바깥 이름 `Toolbox` 를 먼저 본다 (셸은 `const Toolbox` 로 만든다. const 는 window 에 안 붙는다).
     memo-atlas 가 이걸로 크게 덴 자리라 같은 손을 쓴다. */
  const box = toolbox();
  if (box) {
    const meta = box.getLazyWidgetPublicMeta
      ? box.getLazyWidgetPublicMeta('mydash')
      : { title: '내 대시보드', category: 'app', desc: '내 private 저장소를 폰에서 본다' };
    /* **탭은 하나.** 패널 그리기는 셸이 직접.
       셸의 `tabs[]` 는 등록하는 그 순간에 정해진다. 그런데 패널은 나중에 더 붙을 수 있고
       (북마크, 성능), 무엇보다 **로그인 전에는 그릴 패널이 없다**. 탭으로 만들면
       남이 열었을 때 빈 탭 넷이 보인다. 안쪽에서 우리가 그리면 상태에 따라 갈 수 있다. */
    box.register({
      id: 'mydash',
      ...meta,
      tabs: [{ id: 'panels', label: '패널', build: render }],
    });
  }
})();

export {};
