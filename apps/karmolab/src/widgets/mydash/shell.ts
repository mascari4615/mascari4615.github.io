/**
 * 개인 대시보드 셸 (1단계).
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
 */
import { dashRegistry, esc } from './kit';
import type { DashEntry, DashPanel, DashRepoRead } from './kit';

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
  const CONFIG_URL = '/apps/karmolab/data/mydash-config.json';

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

  /** 만료 30초 전부터는 만료로 친다. 요청 도중에 죽는 것보다 미리 갱신하는 편이 낫다. */
  function isExpired(v: Saved): boolean {
    return v.expiresAt !== null && v.expiresAt - 30000 < Date.now();
  }

  /* ── 실패의 종류를 나눈다. 화면이 다르게 말해야 하는 것만 나눈다. */
  type FailKind = 'auth' | 'notfound' | 'config' | 'net';
  class DashError extends Error {
    kind: FailKind;
    constructor(kind: FailKind, message: string) {
      super(message);
      this.kind = kind;
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
    configCache = { relay: String(v.relay).replace(/\/+$/, ''), owner: v.owner, repo: v.repo, branch: v.branch || 'main' };
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
    if (!res.ok) throw new DashError('net', '릴레이가 ' + res.status + ' 를 줬다');
    try {
      return (await res.json()) as T;
    } catch {
      throw new DashError('net', '릴레이 응답이 JSON 이 아니다');
    }
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

  /** 갱신. 실패하면 **조용히 지운다**. 그다음은 다시 로그인 길이다. */
  async function refresh(cfg: Config, saved: Saved): Promise<Saved | null> {
    if (!saved.refresh) return null;
    if (saved.refreshExpiresAt !== null && saved.refreshExpiresAt < Date.now()) return null;
    try {
      const reply = await relayPost<TokenReply>(cfg, '/device/refresh', { refresh_token: saved.refresh });
      if (!reply.access_token) return null;
      const next = tokenFrom(reply);
      saveToken(next);
      return next;
    } catch {
      return null;
    }
  }

  /** 지금 쓸 수 있는 토큰. 없거나 죽었으면 null. */
  async function liveToken(cfg: Config): Promise<string | null> {
    const saved = loadSaved();
    if (!saved) return null;
    if (!isExpired(saved)) return saved.token;
    const next = await refresh(cfg, saved);
    if (next) return next.token;
    saveToken(null);
    return null;
  }

  /* ── 저장소 읽기 ───────────────────────────────────────────────── */
  function makeRepo(cfg: Config): DashRepoRead {
    async function call(path: string, accept: string): Promise<Response> {
      const token = await liveToken(cfg);
      if (!token) throw new DashError('auth', '로그인이 필요하다');
      const url =
        API + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' +
        path.split('/').map(encodeURIComponent).join('/') +
        '?ref=' + encodeURIComponent(cfg.branch || 'main');
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
        throw new DashError('notfound', path + ' 를 못 읽는다 (없거나, 이 계정에 권한이 없다)');
      }
      if (res.status === 403) throw new DashError('auth', 'GitHub 이 막았다 (요청 한도이거나 App 권한 부족)');
      if (!res.ok) throw new DashError('net', 'GitHub 이 ' + res.status + ' 를 줬다');
      return res;
    }

    async function readText(path: string): Promise<string> {
      const res = await call(path, 'application/vnd.github.raw');
      return res.text();
    }

    return {
      readText,
      async readJson<T>(path: string): Promise<T> {
        const text = await readText(path);
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new DashError('net', path + ' 가 JSON 이 아니다');
        }
      },
      async list(path: string): Promise<DashEntry[]> {
        const res = await call(path, 'application/vnd.github+json');
        const raw = (await res.json()) as Array<{ name: string; path: string; type: string; size?: number }>;
        if (!Array.isArray(raw)) throw new DashError('notfound', path + ' 는 폴더가 아니다');
        return raw.map((e) => ({
          name: e.name,
          path: e.path,
          type: e.type === 'dir' ? 'dir' : 'file',
          size: e.size || 0,
        }));
      },
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
      '.myd-nav button{flex:0 0 auto;padding:6px 12px;font:inherit;font-size:var(--font-size-2xs);cursor:pointer;',
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
      'display:inline-block;text-align:center;min-height:44px;line-height:24px}',
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
    function disposePanel(): void {
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* 치우다 죽어도 다음 것은 치운다 */
        }
      }
      cleanups = [];
    }
    /* 맨바깥 이름을 여기서 바로 쓰면, 그 이름이 아예 없는 판(가짜 셸로 재는 자리)에서
       ReferenceError 로 위젯이 통째로 안 뜬다. window 쪽으로 묻는다 (memo-atlas 와 같은 손). */
    (window as unknown as { Toolbox?: { onDispose?: (fn: () => void) => void } }).Toolbox?.onDispose?.(disposePanel);

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
      say(
        '<div class="myd-card">' +
          '<div class="myd-note">아래 코드를 GitHub 에 넣으세요. 이 화면은 그대로 두면 됩니다.</div>' +
          '<div class="myd-code" data-code="1">' + esc(start.user_code) + '</div>' +
          '<div class="myd-row">' +
          '<a class="myd-btn" target="_blank" rel="noopener noreferrer" href="' +
          esc(start.verification_uri) + '">GitHub 열기</a>' +
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
          showLoggedOut(cfg, (e as Error).message);
          return;
        }
        if (reply.access_token) {
          saveToken(tokenFrom(reply));
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

    function logout(cfg: Config): void {
      saveToken(null);
      navEl.hidden = true;
      navEl.textContent = '';
      whoEl.textContent = '';
      showLoggedOut(cfg);
    }

    /* ── 로그인 뒤. 패널 명부를 그대로 칩으로 만든다. */
    async function showDashboard(cfg: Config): Promise<void> {
      const repo = makeRepo(cfg);
      whoEl.innerHTML =
        '<span>' + esc(cfg.owner + '/' + cfg.repo) + '</span>' +
        '<button class="myd-btn ghost" data-logout="1" style="min-height:0;padding:4px 10px">나가기</button>';
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

        /* ★ **쓰기 패널은 아직 안 그린다** (1단계는 읽기 전용).
           읽기 저장소를 쓰기 패널에 건네면 그 패널은 자기가 쓸 수 있다고 믿고 짜인다.
           타입으로 갈라 뒀으니 여기서 한 번 더 막는다. 자리는 있고 구현이 없다. */
        if (panel.access !== 'read') {
          bodyEl.innerHTML =
            '<div class="myd-card"><div class="myd-warn">' +
            esc(panel.title + ' 은 쓰기가 필요한 패널입니다. 1단계 셸은 읽기만 건넵니다.') +
            '</div></div>';
          return;
        }

        const status = (text: string): void => {
          statEl.textContent = text;
        };
        statEl.textContent = '';
        try {
          const out = panel.render({
            root: bodyEl,
            repo,
            status,
            onDispose: (fn) => cleanups.push(fn),
          });
          void Promise.resolve(out).catch((e: unknown) => onPanelFail(cfg, e));
        } catch (e) {
          onPanelFail(cfg, e);
        }
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

    /** 패널이 던진 것. **다시 로그인 길이 늘 보여야 한다**. 여기서 막히면 화면이 끝이다. */
    function onPanelFail(cfg: Config, e: unknown): void {
      const err = e as DashError;
      const kind: FailKind = err && err.kind ? err.kind : 'net';
      if (kind === 'auth') {
        showLoggedOut(cfg, '로그인이 풀렸습니다. 다시 로그인하세요.');
        navEl.hidden = true;
        whoEl.textContent = '';
        return;
      }
      bodyEl.innerHTML =
        '<div class="myd-card"><div class="myd-warn">' +
        esc(err && err.message ? err.message : '알 수 없는 실패') +
        '</div><div class="myd-row">' +
        '<button class="myd-btn ghost" data-relogin="1">다시 로그인</button>' +
        '</div></div>';
      (bodyEl.querySelector('[data-relogin]') as HTMLElement | null)?.addEventListener('click', () => {
        saveToken(null);
        showLoggedOut(cfg);
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
      const token = await liveToken(cfg);
      if (token) void showDashboard(cfg);
      else showLoggedOut(cfg);
    })();
  }

  /* ── 등록.
     맨바깥 이름 `Toolbox` 를 먼저 본다 (셸은 `const Toolbox` 로 만든다. const 는 window 에 안 붙는다).
     memo-atlas 가 이걸로 크게 덴 자리라 같은 손을 쓴다. */
  const w = window as unknown as {
    Toolbox?: { register: (m: unknown) => void; getLazyWidgetPublicMeta?: (id: string) => object };
  };
  const box = ((typeof Toolbox !== 'undefined' && Toolbox) ? Toolbox : w.Toolbox) as typeof w.Toolbox;
  if (box) {
    const meta = box.getLazyWidgetPublicMeta
      ? box.getLazyWidgetPublicMeta('mydash')
      : { title: '내 대시보드', category: 'app', desc: '내 private 저장소를 폰에서 본다' };
    /* **탭은 하나.** 패널 그리기는 셸이 직접.
       셸의 `tabs[]` 는 등록하는 그 순간에 정해진다. 그런데 패널은 나중에 더 붙을 수 있고
       (2단계의 북마크, 성능), 무엇보다 **로그인 전에는 그릴 패널이 없다**. 탭으로 만들면
       남이 열었을 때 빈 탭 넷이 보인다. 안쪽에서 우리가 그리면 상태에 따라 갈 수 있다. */
    box.register({
      id: 'mydash',
      ...meta,
      tabs: [{ id: 'panels', label: '패널', build: render }],
    });
  }
})();

export {};
