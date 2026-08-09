import { isDesktop, invoke, listen } from '../tauri-bridge';

import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  'use strict';

  const REPO_ROOT_PREF = 'karmolab_repo_root';

  /**
   * dev 프로필. 두 형식 (Rust `DevProfile::resolve` 와 동형):
   * - **npm-script 참조** (선호): `{ app, script, deployScript? }` — `app` 에서
   *   `npm run <script>`. program/args/cwd 손기재 X → package.json rename 자동 추종.
   *   `servermonitor-config-audit.mjs` 가 script 실재를 verify 게이트에서 검증.
   * - **raw** (npm 스크립트 아님, 예: jekyll `bundle exec`): `{ cwd, program, args }`.
   */
  type DevProfile = {
    id: string;
    label: string;
    // npm-script 참조 형식
    app?: string;
    script?: string;
    deployScript?: string;
    // raw 형식 (npm 스크립트 아님)
    cwd?: string;
    program?: string;
    args?: string[];
    healthUrl?: string;
    npmInstall?: boolean;
  };

  type ResolvedProfile = {
    program: string;
    args: string[];
    cwd: string;
    deployArgs?: string[];
  };

  /** `{app,script}` → `npm run <script>` @ app, 또는 raw 그대로. Rust resolve() 와 동형. */
  function resolveProfile(p: DevProfile): ResolvedProfile {
    if (p.script) {
      return {
        program: 'npm',
        args: ['run', p.script],
        cwd: p.app ?? '.',
        deployArgs: p.deployScript ? ['run', p.deployScript] : undefined,
      };
    }
    return {
      program: p.program ?? '',
      args: p.args ?? [],
      cwd: p.cwd ?? '.',
    };
  }

  /** 카드 stdin form 단축키 프리셋 — Vite/jest/jekyll 같은 dev 러너가 stdin 으로 받는 단일 시그널. */
  type StdinShortcut = { signal: string; hint: string };

  const VITE_SHORTCUTS: StdinShortcut[] = [
    { signal: 'r', hint: 'restart server' },
    { signal: 'u', hint: 'show URL' },
    { signal: 'o', hint: 'open in browser' },
    { signal: 'q', hint: 'quit' },
  ];
  const TEST_WATCH_SHORTCUTS: StdinShortcut[] = [
    { signal: 'a', hint: 'run all tests' },
    { signal: 'f', hint: 'run only failed' },
    { signal: 'p', hint: 'filter by pattern' },
    { signal: 'q', hint: 'quit' },
  ];
  const JEKYLL_SHORTCUTS: StdinShortcut[] = [
    { signal: 'r', hint: 'regenerate' },
    { signal: 'q', hint: 'quit' },
  ];
  const NODE_REPL_SHORTCUTS: StdinShortcut[] = [
    { signal: '.exit', hint: 'exit REPL' },
  ];

  /** resolve 된 program/args (+ script명) 의 substring 으로 1차 매칭. vitest 가 vite 를 포함하므로 더 좁은 패턴 먼저. */
  function pickStdinShortcuts(profile: DevProfile): StdinShortcut[] | null {
    const r = resolveProfile(profile);
    // script 명도 매칭에 포함 (`{script:"dev"}` 는 vite/jekyll 이 args 에 안 드러남)
    const cmd = `${r.program} ${r.args.join(' ')} ${profile.script ?? ''}`.toLowerCase();
    if (cmd.includes('vitest') || cmd.includes('jest')) return TEST_WATCH_SHORTCUTS;
    if (cmd.includes('vite')) return VITE_SHORTCUTS;
    if (cmd.includes('jekyll')) return JEKYLL_SHORTCUTS;
    if (r.program === 'node' && r.args.length === 0) return NODE_REPL_SHORTCUTS;
    return null;
  }

  type RawLocalMonitor = {
    id: string;
    title?: string;
    subtitle?: string;
    label?: string;
    url?: string;
    noHealthUrl?: boolean;
  };

  type EnvFileEntry = {
    id: string;
    label?: string;
    relPath: string;
    hint?: string;
  };

  type ServerMonitorConfig = {
    localMonitors?: RawLocalMonitor[];
    envFiles?: EnvFileEntry[];
    devProfiles?: DevProfile[];
  };

  type LocalCardState = 'online' | 'offline' | 'na';

  type LocaldevLogPayload = {
    runId: string;
    profileId: string;
    stream: string;
    line: string;
  };

  type LocaldevDonePayload = {
    runId: string;
    profileId: string;
    kind: string;
    success: boolean;
    code?: number;
  };

  /**
   * dev profile별 현재 활성 로그 패널.
   * `renderMergedServices`가 카드를 다시 그릴 때마다 새 panel ref로 갱신된다.
   * `localdev-log` 이벤트(runId="follow")는 이 map을 lookup해서 해당 panel에 라인 append.
   */
  const followPanels = new Map<string, HTMLElement>();
  let followListenerUnlisten: (() => void) | null = null;
  let followListenerInstalling: Promise<void> | null = null;

  function appendLineToPanel(panel: HTMLElement, stream: string, line: string): void {
    const SM_LOG_MAX_LINES = 500;
    const SM_LOG_MAX_BYTES = 256 * 1024;
    const row = document.createElement('div');
    row.className =
      stream === 'err' ? 'sm-log-line sm-log-line-err' : 'sm-log-line sm-log-line-out';
    row.textContent = line;
    panel.appendChild(row);
    while (panel.childElementCount > SM_LOG_MAX_LINES) {
      panel.removeChild(panel.firstElementChild!);
    }
    let bytes = 0;
    for (let i = 0; i < panel.children.length; i++) {
      bytes += (panel.children[i].textContent || '').length + 1;
    }
    while (bytes > SM_LOG_MAX_BYTES && panel.firstElementChild) {
      panel.removeChild(panel.firstElementChild);
      bytes = 0;
      for (let j = 0; j < panel.children.length; j++) {
        bytes += (panel.children[j].textContent || '').length + 1;
      }
    }
    panel.scrollTop = panel.scrollHeight;
  }

  /** 한 번만 등록되는 글로벌 follow listener. install/deploy stream과는 runId="follow"로 구분. */
  async function ensureFollowListener(): Promise<void> {
    if (followListenerUnlisten) return;
    if (followListenerInstalling) return followListenerInstalling;
    // TASK-KL-062 slice3b: 로컬 listen 캡처+캐스트 폐기 → seam listen
    // (Tauri 미주입 시 no-op unlisten 반환). 웹에선 설치 자체 skip.
    if (!isDesktop()) return;
    followListenerInstalling = (async () => {
      try {
        followListenerUnlisten = await listen('localdev-log', (e: { payload: unknown }) => {
          const pl = e.payload as LocaldevLogPayload;
          if (pl.runId !== 'follow') return;
          const panel = followPanels.get(pl.profileId);
          if (panel) appendLineToPanel(panel, pl.stream, pl.line);
        });
      } finally {
        followListenerInstalling = null;
      }
    })();
    return followListenerInstalling;
  }

  // TASK-KL-062 slice3b: 로컬 isKarmolabDesktop 폐기 → tauri-bridge isDesktop.


  /** `localdev_list_tracked` 반환값이 배열이 아니거나 섞여 있을 때 대비 */
  function normalizeLocaldevTrackedIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string');
  }

  function normalizeLocalMonitor(m: RawLocalMonitor): {
    id: string;
    title: string;
    subtitle: string;
    url?: string;
    canPing: boolean;
  } {
    const title = (m.title || m.label || m.id || '').trim();
    const subtitle = (m.subtitle || '').trim();
    const url = m.url?.trim();
    const canPing = !m.noHealthUrl && !!url;
    return { id: m.id, title, subtitle, url, canPing };
  }

  /** 카드에 자동 표시할 포트 — 실제 서비스가 듣는 곳을 한눈에 보여 주기 위함.
   *  healthUrl(devProfile) 이 있으면 우선, 없으면 monitor.url 에서 추출. */
  function extractPort(...candidates: (string | undefined)[]): string | null {
    for (const raw of candidates) {
      if (!raw) continue;
      try {
        const u = new URL(raw);
        if (u.port) return u.port;
      } catch {
        // 잘못된 URL은 다음 후보로
      }
    }
    return null;
  }

  async function pingLocal(url: string): Promise<'online' | 'offline'> {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 2000);
      await fetch(url, { mode: 'no-cors', signal: controller.signal, cache: 'no-cache' });
      clearTimeout(timeoutId);
      return 'online';
    } catch {
      return 'offline';
    }
  }

  async function loadConfig(): Promise<ServerMonitorConfig> {
    const configPath = '/apps/karmolab/data/servermonitor-config.json';
    try {
      const res = await fetch(configPath, { cache: 'no-cache' });
      if (!res.ok) throw new Error(t('servermonitor.err.02'));
      return (await res.json()) as ServerMonitorConfig;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(t('servermonitor.t03'), msg);
      return { localMonitors: [] };
    }
  }

  function localCardClass(state: LocalCardState): string {
    if (state === 'online') return 'sm-card sm-card--up';
    if (state === 'offline') return 'sm-card sm-card--down';
    return 'sm-card sm-card--na';
  }

  function localStatusLabel(state: LocalCardState): string {
    if (state === 'online') return t('servermonitor.t04');
    if (state === 'offline') return t('servermonitor.t05');
    return t('servermonitor.t06');
  }

  type MergedServiceRow = {
    id: string;
    monitor?: ReturnType<typeof normalizeLocalMonitor>;
    profile?: DevProfile;
  };

  /** devProfiles 순서 우선, localMonitors만 있는 항목은 뒤에 붙임 */
  function mergeServiceRows(config: ServerMonitorConfig): MergedServiceRow[] {
    const profiles = config.devProfiles ?? [];
    const rawLocals = config.localMonitors ?? [];
    const monById = new Map<string, ReturnType<typeof normalizeLocalMonitor>>();
    for (const m of rawLocals) {
      monById.set(m.id, normalizeLocalMonitor(m));
    }
    const seen = new Set<string>();
    const rows: MergedServiceRow[] = [];
    for (const p of profiles) {
      rows.push({ id: p.id, profile: p, monitor: monById.get(p.id) });
      seen.add(p.id);
    }
    for (const m of rawLocals) {
      if (!seen.has(m.id)) {
        rows.push({ id: m.id, monitor: normalizeLocalMonitor(m) });
      }
    }
    return rows;
  }

  function mergedPingRowClass(
    monitor: MergedServiceRow['monitor'],
    raw: LocalCardState | undefined
  ): string {
    if (!monitor) return 'sm-card sm-card--na';
    if (!monitor.canPing) return 'sm-card sm-card--na';
    if (raw === undefined) return 'sm-card sm-card--na';
    return localCardClass(raw);
  }

  function mergedPingRowText(
    monitor: MergedServiceRow['monitor'],
    raw: LocalCardState | undefined
  ): string {
    if (!monitor) return t('servermonitor.t07');
    if (!monitor.canPing) return t('servermonitor.t06');
    if (raw === undefined) return t('servermonitor.t08');
    return localStatusLabel(raw);
  }

  type NormalizedMonitor = ReturnType<typeof normalizeLocalMonitor>;

  function mergedCardShellClass(
    monitor: MergedServiceRow['monitor'],
    raw: LocalCardState | undefined
  ): string {
    return mergedPingRowClass(monitor, raw).replace(/^sm-card\s+/, 'sm-card sm-card--merged ');
  }

  function smEscapeAttr(id: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
    return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  const smPingFlashTimers = new WeakMap<HTMLElement, number>();

  function patchMergedCardPingUi(
    card: HTMLElement,
    monitor: NormalizedMonitor | undefined,
    raw: LocalCardState
  ): void {
    card.className = mergedCardShellClass(monitor, raw);
    // monitor-only 카드는 primary row 안 .sm-card-status-text 에 상태 텍스트가 있음.
    // profile 카드는 dot 색만 갱신 (상태 텍스트 자체가 없음).
    const statusEl = card.querySelector('.sm-card-status-text');
    if (statusEl) {
      statusEl.textContent = mergedPingRowText(monitor, raw);
    }
  }

  /** ping 직후: 연두 플래시 + ✓가 잠깐 나타났다 사라짐 */
  function flashMergedCardPingDone(card: HTMLElement): void {
    const prev = smPingFlashTimers.get(card);
    if (prev !== undefined) window.clearTimeout(prev);
    card.querySelectorAll('.sm-card-ping-check').forEach((n) => n.remove());
    card.classList.remove('sm-card--ping-flash');
    void card.offsetWidth;
    card.classList.add('sm-card--ping-flash');
    const check = document.createElement('span');
    check.className = 'sm-card-ping-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    card.appendChild(check);
    const tid = window.setTimeout(() => {
      check.remove();
      card.classList.remove('sm-card--ping-flash');
      smPingFlashTimers.delete(card);
    }, 900);
    smPingFlashTimers.set(card, tid);
  }

  /** 데스크톱: 저장소 기준 .env 바로가기(탐색기 / 기본 앱 / 인앱 편집) */
  function mountEnvFilesPanel(host: HTMLElement): void {
    // TASK-KL-062 slice3b: 로컬 invoke 캡처 폐기 → seam invoke (reject if 미주입).

    host.className = 'sm-env-section';

    const title = document.createElement('div');
    title.className = 'sm-desktop-section-title';
    title.textContent = t('servermonitor.t09');

    const hint = document.createElement('p');
    hint.className = 'sm-dev-hint';
    hint.textContent =
      t('servermonitor.t10');

    const grid = document.createElement('div');
    grid.className = 'sm-env-cards';

    host.appendChild(title);
    host.appendChild(hint);
    host.appendChild(grid);

    void loadConfig().then((cfg) => {
      const files = cfg.envFiles ?? [];
      if (files.length === 0) {
        grid.textContent = t('servermonitor.t11');
        return;
      }
      if (!isDesktop()) {
        grid.textContent = t('servermonitor.t12');
        return;
      }

      for (const f of files) {
        const rel = (f.relPath || '').trim();
        if (!rel) continue;

        const card = document.createElement('div');
        card.className = 'sm-card sm-card--env';

        const titleEl = document.createElement('div');
        titleEl.className = 'sm-card-title';
        titleEl.textContent = f.label?.trim() || f.id;

        const pathEl = document.createElement('div');
        pathEl.className = 'sm-env-path mono';
        pathEl.textContent = rel;

        card.appendChild(titleEl);
        card.appendChild(pathEl);

        if (f.hint?.trim()) {
          const h = document.createElement('div');
          h.className = 'sm-card-sub';
          h.textContent = f.hint.trim();
          card.appendChild(h);
        }

        const actions = document.createElement('div');
        actions.className = 'sm-card-actions';

        const mk = (label: string, fn: () => void): HTMLButtonElement => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-ghost';
          b.textContent = label;
          b.onclick = () => fn();
          return b;
        };

        actions.appendChild(
          mk(t('servermonitor.t13'), () => {
            void (async () => {
              try {
                await invoke('repofile_reveal', { relPath: rel });
              } catch (e: unknown) {
                Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
              }
            })();
          })
        );
        actions.appendChild(
          mk(t('servermonitor.t14'), () => {
            void (async () => {
              try {
                await invoke('repofile_open_default', { relPath: rel });
              } catch (e: unknown) {
                Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
              }
            })();
          })
        );

        const editorWrap = document.createElement('div');
        editorWrap.className = 'sm-env-editor-wrap';
        editorWrap.hidden = true;
        const ta = document.createElement('textarea');
        ta.className = 'mono-input sm-env-ta';
        ta.spellcheck = false;
        ta.setAttribute('aria-label', t('servermonitor.envOf', { name: f.label || f.id }));

        let loaded = false;
        const btnEdit = mk(t('servermonitor.t15'), () => {
          void (async () => {
            if (!editorWrap.hidden) {
              editorWrap.hidden = true;
              btnEdit.textContent = t('servermonitor.t15');
              return;
            }
            editorWrap.hidden = false;
            btnEdit.textContent = t('servermonitor.t16');
            if (loaded) return;
            try {
              const text = (await invoke('repofile_read', { relPath: rel })) as string;
              ta.value = text;
              loaded = true;
            } catch (e: unknown) {
              const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
              if (msg.includes('FILE_NOT_FOUND')) {
                ta.value = '';
                loaded = true;
                Toolbox.showToast?.(t('servermonitor.t17'), undefined, undefined);
              } else {
                Toolbox.showToast?.(msg, 'error', undefined);
              }
            }
          })();
        });

        const btnSave = mk(t('servermonitor.t18'), () => {
          void (async () => {
            try {
              await invoke('repofile_write', { relPath: rel, content: ta.value });
              loaded = true;
              Toolbox.showToast?.(t('servermonitor.t19'), undefined, undefined);
            } catch (e: unknown) {
              Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
            }
          })();
        });
        btnSave.className = 'btn btn-primary';

        const saveRow = document.createElement('div');
        saveRow.className = 'sm-env-editor-actions';
        saveRow.appendChild(btnSave);
        editorWrap.appendChild(ta);
        editorWrap.appendChild(saveRow);

        actions.appendChild(btnEdit);
        card.appendChild(actions);
        card.appendChild(editorWrap);
        grid.appendChild(card);
      }
    });
  }

  /**
   * 데스크톱: 루트 + 서비스당 카드 1장(localMonitors URL 응답 + devProfiles 프로세스 병합).
   * `pingState.byId`는 새로고침 시 갱신되고, 이 함수가 DOM을 다시 그립니다.
   */
  function mountDesktopLocalDev(
    section: HTMLElement,
    rootFooter: HTMLElement,
    pingState: { byId: Record<string, LocalCardState> },
    registerRefresh: (fn: () => Promise<void>) => void,
    triggerStatusFetchSoon: (delayMs: number) => void
  ): HTMLElement {
    // TASK-KL-062 slice3b: 로컬 invoke 캡처 폐기 → seam invoke (reject if 미주입).

    const SM_LOG_MAX_LINES = 500;
    const SM_LOG_MAX_BYTES = 256 * 1024;

    // 외부 PID 자동 폴링이 직전 결과와 동일하면 재마운트 skip — 사용자 stdin/스크롤 보존.
    // 수동 새로고침·시작·종료가 호출하는 renderMergedServices 도 같은 snapshot 갱신 → 모든 경로 일관.
    const EXTERNAL_PID_POLL_MS = 30_000;
    let lastExternalPidsSnapshot: string | null = null;
    function snapshotExternalPids(map: Record<string, number[]>): string {
      const keys = Object.keys(map).sort();
      const norm = keys.map((k) => [k, [...(map[k] ?? [])].sort((a, b) => a - b)] as const);
      return JSON.stringify(norm);
    }

    function appendSmLogLine(panel: HTMLElement, stream: string, line: string): void {
      const row = document.createElement('div');
      row.className =
        stream === 'err' ? 'sm-log-line sm-log-line-err' : 'sm-log-line sm-log-line-out';
      row.textContent = line;
      panel.appendChild(row);
      while (panel.childElementCount > SM_LOG_MAX_LINES) {
        panel.removeChild(panel.firstElementChild!);
      }
      let bytes = 0;
      for (let i = 0; i < panel.children.length; i++) {
        bytes += (panel.children[i].textContent || '').length + 1;
      }
      while (bytes > SM_LOG_MAX_BYTES && panel.firstElementChild) {
        panel.removeChild(panel.firstElementChild);
        bytes = 0;
        for (let j = 0; j < panel.children.length; j++) {
          bytes += (panel.children[j].textContent || '').length + 1;
        }
      }
      panel.scrollTop = panel.scrollHeight;
    }

    async function runStreamedNpmOp(
      cmd: 'localdev_deploy_stream' | 'localdev_npm_install_stream',
      profileId: string,
      logPanel: HTMLElement,
      disableBtns: HTMLButtonElement[],
      okFallback: string
    ): Promise<void> {
      // TASK-KL-062 slice3b: inv/listen 로컬 캡처+캐스트 폐기 → seam.
      // 비-데스크톱이면 silent return (구 inv 가드와 동일 관측동작 — listen
      // 토스트는 inv·listen 동시 주입이라 도달 불가였던 죽은 분기).
      if (!isDesktop()) return;
      for (const b of disableBtns) b.disabled = true;
      logPanel.replaceChildren();
      let unLog: (() => void) | undefined;
      let unDone: (() => void) | undefined;
      try {
        unLog = await listen('localdev-log', (e: { payload: unknown }) => {
          const pl = e.payload as LocaldevLogPayload;
          if (pl.profileId !== profileId) return;
          // follow 라인은 글로벌 follow listener가 같은 panel에 이미 append하므로 여기선 skip
          if (pl.runId === 'follow') return;
          appendSmLogLine(logPanel, pl.stream, pl.line);
        });
        unDone = await listen('localdev-log-done', (e: { payload: unknown }) => {
          const pl = e.payload as LocaldevDonePayload;
          if (pl.profileId !== profileId) return;
        });
        const msg = (await invoke(cmd, { profileId })) as string;
        Toolbox.showToast?.(msg || okFallback, undefined, undefined);
      } catch (e: unknown) {
        Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
      } finally {
        unLog?.();
        unDone?.();
        for (const b of disableBtns) b.disabled = false;
      }
    }

    const rootLabel = document.createElement('div');
    rootLabel.className = 'sm-root-footer-label';
    rootLabel.textContent = t('servermonitor.t20');

    const rootInput = document.createElement('input');
    rootInput.type = 'text';
    rootInput.className = 'mono-input sm-root-footer-input';
    rootInput.placeholder = '예: C:\\Users\\…\\Mascari4615.github.io';
    rootInput.value = Toolbox.getPref?.(REPO_ROOT_PREF, '') ?? '';

    const saveRootBtn = document.createElement('button');
    saveRootBtn.className = 'btn btn-ghost btn-sm';
    saveRootBtn.type = 'button';
    saveRootBtn.textContent = t('servermonitor.t18');
    saveRootBtn.onclick = () => {
      void (async () => {
        const v = rootInput.value.trim();
        if (Toolbox.setPref) Toolbox.setPref(REPO_ROOT_PREF, v);
        if (!isDesktop()) {
          Toolbox.showToast?.(t('servermonitor.t21'), 'error', undefined);
          return;
        }
        try {
          await invoke('localdev_set_repo_root', { path: v });
          Toolbox.showToast?.(t('servermonitor.t22'), undefined, undefined);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          Toolbox.showToast?.(msg, 'error', undefined);
        }
      })();
    };

    const refreshListBtn = document.createElement('button');
    refreshListBtn.className = 'btn btn-ghost';
    refreshListBtn.type = 'button';
    refreshListBtn.textContent = t('servermonitor.t23');

    const listRow = document.createElement('div');
    listRow.className = 'sm-list-refresh-row';

    const servicesWrap = document.createElement('div');
    servicesWrap.className = 'sm-local-services';

    async function renderMergedServices(): Promise<void> {
      // 재마운트 직전 펼쳐진 카드 id 수집 → 새 카드에 다시 펼친 상태로 복원.
      // (follow_log 가 200줄을 즉시 다시 emit 하므로 로그 내용도 자연 복구된다)
      const expandedIds = new Set<string>();
      for (const oldCard of servicesWrap.querySelectorAll<HTMLElement>('[data-sm-service-id]')) {
        const id = oldCard.dataset.smServiceId;
        if (!id) continue;
        const wrap = oldCard.querySelector<HTMLElement>('.sm-log-wrap');
        if (wrap && !wrap.hidden) expandedIds.add(id);
      }

      const config = await loadConfig();
      const rows = mergeServiceRows(config);
      let tracked: string[] = [];
      let externalPids: Record<string, number[]> = {};
      if (isDesktop()) {
        try {
          tracked = normalizeLocaldevTrackedIds(await invoke('localdev_list_tracked'));
        } catch (e) {
          console.warn(t('servermonitor.t24'), e);
          tracked = [];
        }
        try {
          const raw = (await invoke('localdev_list_external_pids')) as Record<string, number[]>;
          if (raw && typeof raw === 'object') externalPids = raw;
          lastExternalPidsSnapshot = snapshotExternalPids(externalPids);
        } catch (e) {
          console.warn(t('servermonitor.t25'), e);
        }
      }

      servicesWrap.replaceChildren();
      if (rows.length === 0) {
        servicesWrap.textContent = t('servermonitor.t26');
        return;
      }

      for (const row of rows) {
        const p = row.profile;
        const mon = row.monitor;
        const rawPing = mon ? pingState.byId[mon.id] : undefined;
        const cardClass = mergedPingRowClass(mon, rawPing).replace(/^sm-card\s+/, 'sm-card sm-card--merged ');

        const card = document.createElement('div');
        card.className = cardClass;
        card.dataset.smServiceId = row.id;

        // ━━ Row 1 (primary) — 한눈에 보이는 핵심: dot · title · port · primary action · ⋯ ━━
        const primary = document.createElement('div');
        primary.className = 'sm-card-primary';

        const dot = document.createElement('span');
        dot.className = 'sm-card-status-dot';
        dot.setAttribute('aria-hidden', 'true');
        primary.appendChild(dot);

        const titleEl = document.createElement('div');
        titleEl.className = 'sm-card-title';
        titleEl.textContent = p?.label || mon?.title || row.id;
        primary.appendChild(titleEl);

        const port = extractPort(p?.healthUrl, mon?.url);
        const appendPortChip = (): void => {
          if (!port) return;
          const portChip = document.createElement('span');
          portChip.className = 'sm-card-port mono';
          portChip.textContent = `:${port}`;
          primary.appendChild(portChip);
        };

        let logPanelEl: HTMLElement | null = null;
        const streamActionBtns: HTMLButtonElement[] = [];

        if (p) {
          const resolvedP = resolveProfile(p);
          const deployArgsFiltered =
            resolvedP.deployArgs?.filter((a) => (a || '').trim().length > 0) ?? [];

          const isTracked = tracked.includes(p.id);
          const externalForProfile = externalPids[p.id] ?? [];
          const isExternal = !isTracked && externalForProfile.length > 0;

          // 순서: subtitle (flex:1) → port chip (4글자 고정 column) → ⋯
          if (mon?.subtitle) {
            const subInline = document.createElement('span');
            subInline.className = 'sm-card-sub-inline';
            subInline.textContent = mon.subtitle;
            primary.appendChild(subInline);
          }
          appendPortChip();

          // ⋯ 메뉴 토글 — 시작/종료/로그/npm i/deploy 모두 메뉴 안에.
          const menuBtn = document.createElement('button');
          menuBtn.type = 'button';
          menuBtn.className = 'sm-menu-btn';
          menuBtn.setAttribute('aria-label', t('servermonitor.t27'));
          menuBtn.setAttribute('aria-expanded', 'false');
          menuBtn.textContent = '⋯';
          primary.appendChild(menuBtn);

          card.appendChild(primary);

          // ━━ Log wrap (기본 접힘) — 로그 패널 + stdin form ━━
          // 시작 버튼으로 띄운 봇의 stdout/stderr 는 Rust 가 로그 파일로 redirect 하고
          // `localdev_follow_log` 가 그 파일을 tail 해서 `localdev-log` 로 emit. npm i / deploy
          // 스트림도 같은 패널을 공유한다.
          const startExpanded = expandedIds.has(row.id);
          const logWrap = document.createElement('div');
          logWrap.className = 'sm-log-wrap';
          logWrap.hidden = !startExpanded;
          const hint = document.createElement('p');
          hint.className = 'sm-log-hint';
          hint.textContent = t('servermonitor.t28');
          logPanelEl = document.createElement('div');
          logPanelEl.className = 'sm-log-panel mono';
          logPanelEl.setAttribute('role', 'log');
          logPanelEl.setAttribute('aria-live', 'polite');
          logWrap.appendChild(hint);
          logWrap.appendChild(logPanelEl);

          // stdin 입력 — 카모랩이 띄운(추적 중인) 프로세스에만 enable.
          const stdinForm = document.createElement('form');
          stdinForm.className = 'sm-stdin-form';
          const stdinInput = document.createElement('input');
          stdinInput.type = 'text';
          stdinInput.className = 'sm-stdin-input mono';
          stdinInput.spellcheck = false;
          stdinInput.autocomplete = 'off';
          const stdinSendable = isTracked;
          if (stdinSendable) {
            stdinInput.placeholder = t('servermonitor.t29');
          } else {
            stdinInput.placeholder = isExternal
              ? t('servermonitor.t30')
              : t('servermonitor.t31');
            stdinInput.disabled = true;
          }
          const stdinBtn = document.createElement('button');
          stdinBtn.type = 'submit';
          stdinBtn.className = 'btn btn-ghost sm-stdin-btn';
          stdinBtn.textContent = t('servermonitor.t32');
          if (!stdinSendable) stdinBtn.disabled = true;

          // dev 러너 단축키 프리셋 (Vite r/u/o/q · jest/vitest a/f/p/q · jekyll r/q · node REPL .exit).
          // 사용자가 한 글자 직접 치는 빈도 높은 시그널을 클릭으로 대체. 매칭 안 되면 그룹 자체 숨김.
          const shortcuts = pickStdinShortcuts(p);
          if (shortcuts && shortcuts.length > 0) {
            const shortcutGroup = document.createElement('div');
            shortcutGroup.className = 'sm-stdin-shortcuts';
            // sm-stdin-form 에 별도 CSS 가 없어 inline 정렬을 직접 잡는다 — input 옆 한 줄.
            shortcutGroup.style.display = 'inline-flex';
            shortcutGroup.style.gap = '4px';
            shortcutGroup.style.marginRight = '6px';
            for (const sc of shortcuts) {
              const scBtn = document.createElement('button');
              scBtn.type = 'button';
              scBtn.className = 'btn btn-ghost sm-stdin-shortcut-btn mono';
              scBtn.textContent = sc.signal;
              scBtn.title = sc.hint;
              if (!stdinSendable) scBtn.disabled = true;
              scBtn.onclick = () => {
                if (!stdinSendable || !isDesktop()) return;
                const text = sc.signal;
                void (async () => {
                  try {
                    await invoke('localdev_send_stdin', { profileId: p.id, text });
                    if (logPanelEl) appendLineToPanel(logPanelEl, 'out', `> ${text}`);
                  } catch (e: unknown) {
                    Toolbox.showToast?.(
                      e instanceof Error ? e.message : String(e),
                      'error',
                      undefined,
                    );
                  }
                })();
              };
              shortcutGroup.appendChild(scBtn);
            }
            stdinForm.appendChild(shortcutGroup);
          }

          stdinForm.appendChild(stdinInput);
          stdinForm.appendChild(stdinBtn);
          stdinForm.onsubmit = (ev) => {
            ev.preventDefault();
            if (!stdinSendable || !isDesktop()) return;
            const text = stdinInput.value;
            stdinInput.value = '';
            void (async () => {
              try {
                await invoke('localdev_send_stdin', { profileId: p.id, text });
                if (logPanelEl) appendLineToPanel(logPanelEl, 'out', `> ${text}`);
              } catch (e: unknown) {
                Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
              }
            })();
          };
          logWrap.appendChild(stdinForm);

          // ━━ Menu 드롭다운 (⋯ 클릭 시 토글) — 보조 액션 ━━
          const menu = document.createElement('div');
          menu.className = 'sm-card-menu';
          menu.hidden = true;

          const mkMenuItem = (label: string, fn: () => void): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sm-menu-item';
            b.textContent = label;
            b.onclick = () => {
              fn();
            };
            return b;
          };

          const closeMenu = (): void => {
            menu.hidden = true;
            menuBtn.setAttribute('aria-expanded', 'false');
          };

          // ── 첫 항목: 현재 상태에 맞는 단일 시작/종료 액션 ──
          let lifecycleItem: HTMLButtonElement;
          if (isTracked) {
            lifecycleItem = mkMenuItem(t('servermonitor.t33'), () => {
              closeMenu();
              void (async () => {
                if (!isDesktop()) return;
                try {
                  await invoke('localdev_stop', { profileId: p.id });
                  Toolbox.showToast?.(t('servermonitor.stopAsked', { name: p.label }), undefined, undefined);
                  await renderMergedServices();
                  triggerStatusFetchSoon(400);
                } catch (e: unknown) {
                  Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
                }
              })();
            });
            lifecycleItem.classList.add('sm-menu-item--stop');
          } else if (isExternal) {
            lifecycleItem = mkMenuItem(t('servermonitor.t34'), () => {
              closeMenu();
              void (async () => {
                if (!isDesktop()) return;
                try {
                  const killed = (await invoke('localdev_stop_external', { profileId: p.id })) as number;
                  Toolbox.showToast?.(t('servermonitor.killedOutside', { name: p.label, n: killed }), undefined, undefined);
                  await renderMergedServices();
                  triggerStatusFetchSoon(400);
                } catch (e: unknown) {
                  Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
                }
              })();
            });
            lifecycleItem.classList.add('sm-menu-item--stop');
          } else {
            lifecycleItem = mkMenuItem(t('servermonitor.t35'), () => {
              closeMenu();
              void (async () => {
                if (!isDesktop()) return;
                try {
                  await invoke('localdev_start', { profileId: p.id });
                  Toolbox.showToast?.(t('servermonitor.started', { name: p.label }), undefined, undefined);
                  await renderMergedServices();
                  triggerStatusFetchSoon(800);
                } catch (e: unknown) {
                  Toolbox.showToast?.(e instanceof Error ? e.message : String(e), 'error', undefined);
                }
              })();
            });
            lifecycleItem.classList.add('sm-menu-item--start');
          }
          menu.appendChild(lifecycleItem);

          // 로그: 메뉴 항목으로 이동 (별도 ▸ 토글 버튼 폐기)
          const logToggleItem = mkMenuItem(t('servermonitor.t36'), () => {
            const wasHidden = logWrap.hidden;
            logWrap.hidden = !wasHidden;
            menu.hidden = true;
            menuBtn.setAttribute('aria-expanded', 'false');
            if (wasHidden && logPanelEl) logPanelEl.scrollTop = logPanelEl.scrollHeight;
          });
          menu.appendChild(logToggleItem);

          if (p.npmInstall) {
            const btnInstall = mkMenuItem('npm i', () => {
              if (!logPanelEl) return;
              if (logWrap.hidden) logWrap.hidden = false;
              menu.hidden = true;
              menuBtn.setAttribute('aria-expanded', 'false');
              void runStreamedNpmOp(
                'localdev_npm_install_stream',
                p.id,
                logPanelEl,
                streamActionBtns,
                t('servermonitor.t37')
              );
            });
            streamActionBtns.push(btnInstall);
            menu.appendChild(btnInstall);
          }

          if (deployArgsFiltered.length > 0) {
            const btnDeploy = mkMenuItem('deploy', () => {
              if (!logPanelEl) return;
              if (logWrap.hidden) logWrap.hidden = false;
              menu.hidden = true;
              menuBtn.setAttribute('aria-expanded', 'false');
              void runStreamedNpmOp(
                'localdev_deploy_stream',
                p.id,
                logPanelEl,
                streamActionBtns,
                t('servermonitor.t38')
              );
            });
            btnDeploy.title = `npm ${deployArgsFiltered.join(' ')} (${resolvedP.cwd})`;
            streamActionBtns.push(btnDeploy);
            menu.appendChild(btnDeploy);
          }

          card.appendChild(menu);
          card.appendChild(logWrap);

          // 메뉴 토글: ⋯ 클릭 → 열기/닫기. 열린 동안 외부 클릭 1회 listener 로 자동 닫힘.
          menuBtn.onclick = (ev) => {
            ev.stopPropagation();
            const wasOpen = !menu.hidden;
            menu.hidden = wasOpen;
            menuBtn.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
            if (!wasOpen) {
              const close = (e: Event): void => {
                if (!card.contains(e.target as Node)) {
                  menu.hidden = true;
                  menuBtn.setAttribute('aria-expanded', 'false');
                  document.removeEventListener('click', close);
                }
              };
              window.setTimeout(() => document.addEventListener('click', close), 0);
            }
          };

          // 카드 그릴 때마다 follow 패널 등록 + Rust follow 시작 (이미 follow 중이면 noop).
          followPanels.set(p.id, logPanelEl);
          void ensureFollowListener();
          if (isDesktop()) {
            void invoke('localdev_follow_log', { profileId: p.id }).catch((e) => {
              console.warn(t('servermonitor.t39'), e);
            });
          }
        } else {
          // profile 없음 — 모니터 전용 카드. 순서: subtitle → port → 상태 텍스트.
          if (mon?.subtitle) {
            const subInline = document.createElement('span');
            subInline.className = 'sm-card-sub-inline';
            subInline.textContent = mon.subtitle;
            primary.appendChild(subInline);
          }
          appendPortChip();
          const statusText = mergedPingRowText(mon, rawPing);
          if (statusText) {
            const stat = document.createElement('span');
            stat.className = 'sm-card-status-text';
            stat.textContent = statusText;
            primary.appendChild(stat);
          }
          card.appendChild(primary);
        }

        servicesWrap.appendChild(card);
      }
    }

    registerRefresh(renderMergedServices);
    refreshListBtn.onclick = () => void renderMergedServices();

    // 외부 PID 자동 폴링 — 별도 PowerShell 에서 띄운 dev 프로세스가 30s 안에 카드에 자동 표시되게.
    // ping 5s 폴링과 분리한 이유: PowerShell 풀스캔이 1~2초 부담. Rust 측 30s TTL 캐시와 짝.
    // 결과가 직전과 같으면 재마운트 skip → 사용자 stdin/스크롤 보존.
    window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!isDesktop()) return;
      void (async () => {
        try {
          const raw = (await invoke('localdev_list_external_pids')) as Record<string, number[]>;
          const safe = raw && typeof raw === 'object' ? raw : {};
          const snapshot = snapshotExternalPids(safe);
          if (snapshot === lastExternalPidsSnapshot) return;
          lastExternalPidsSnapshot = snapshot;
          await renderMergedServices();
        } catch (e) {
          console.warn(t('servermonitor.t40'), e);
        }
      })();
    }, EXTERNAL_PID_POLL_MS);

    listRow.appendChild(refreshListBtn);
    section.appendChild(listRow);
    section.appendChild(servicesWrap);

    const rootRow = document.createElement('div');
    rootRow.className = 'sm-root-footer-row';
    rootRow.appendChild(rootInput);
    rootRow.appendChild(saveRootBtn);
    rootFooter.className = 'sm-root-footer';
    rootFooter.appendChild(rootLabel);
    rootFooter.appendChild(rootRow);

    void (async () => {
      if (isDesktop() && rootInput.value.trim()) {
        try {
          await invoke('localdev_set_repo_root', { path: rootInput.value.trim() });
        } catch {
          /* ignore */
        }
      }
      if (isDesktop()) {
        try {
          const fromRust = (await invoke('localdev_get_repo_root')) as string | null;
          if (fromRust) rootInput.value = fromRust;
        } catch {
          /* ignore */
        }
      }
    })();

    return servicesWrap;
  }

  function build(container: HTMLElement): void {
    const statusBox = document.createElement('div');
    statusBox.id = 'smStatusBox';
    statusBox.className = 'sm-status-wrap';

    let refreshDevTable: (() => Promise<void>) | null = null;
    const pingState: { byId: Record<string, LocalCardState> } = { byId: {} };
    let mergedServicesEl: HTMLElement | null = null;

    const refreshWrap = document.createElement('div');
    refreshWrap.className = 'sm-refresh-wrap';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'sm-refresh-icon-btn';
    refreshBtn.title = t('servermonitor.t41');
    refreshBtn.setAttribute('aria-label', t('servermonitor.t42'));
    refreshBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

    const refreshProgressEl = document.createElement('span');
    refreshProgressEl.className = 'sm-refresh-progress';
    refreshProgressEl.setAttribute('aria-live', 'polite');
    refreshProgressEl.hidden = true;

    refreshWrap.appendChild(refreshBtn);
    refreshWrap.appendChild(refreshProgressEl);

    function setRefreshBusy(busy: boolean, progressLabel = ''): void {
      refreshBtn.disabled = busy;
      refreshBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (!busy) {
        refreshProgressEl.hidden = true;
        refreshProgressEl.replaceChildren();
        return;
      }
      refreshProgressEl.hidden = false;
      refreshProgressEl.replaceChildren();
      const spin = document.createElement('span');
      spin.className = 'sm-spinner';
      spin.setAttribute('aria-hidden', 'true');
      refreshProgressEl.appendChild(spin);
      if (progressLabel) {
        const lab = document.createElement('span');
        lab.className = 'sm-refresh-progress-text';
        lab.textContent = progressLabel;
        refreshProgressEl.appendChild(lab);
      }
    }

    Mdd.injectCSS(
      'servermonitor',
      `
            .sm-status-wrap { margin-top: 16px; font-size: var(--font-size-sm); }
            .sm-status-wrap.loading { color: var(--text-tertiary); padding: 16px; }
            .sm-status-wrap.error { color: var(--error, #e74c3c); padding: 16px; border: 1px solid var(--error); border-radius: var(--radius-md); }
            .sm-section-label { font-weight: 700; margin: 0 0 10px 0; color: var(--accent); font-size: var(--font-size-sm); letter-spacing: 0.02em; }
            .sm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; margin-bottom: 20px; }
            .sm-card { border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-secondary); padding: 14px 16px; min-height: 108px; display: flex; flex-direction: column; transition: border-color 0.15s, box-shadow 0.15s; }
            .sm-card:hover { border-color: var(--border-hover); box-shadow: var(--shadow-sm, 0 1px 4px rgba(0,0,0,.08)); }
            .sm-card--up { border-left: 4px solid var(--success, #22c55e); }
            .sm-card--down { border-left: 4px solid var(--error, #e74c3c); }
            .sm-card--na { border-left: 4px solid var(--text-tertiary); }
            .sm-card--up:hover { border-left-color: var(--success, #22c55e); }
            .sm-card--down:hover { border-left-color: var(--error, #e74c3c); }
            .sm-card--na:hover { border-left-color: var(--text-tertiary); }
            .sm-card-title { font-weight: 700; font-size: var(--font-size-md); color: var(--text-primary); line-height: 1.25; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sm-card-port { flex-shrink: 0; margin-left: auto; font-size: var(--font-size-2xs); color: var(--text-secondary); background: var(--bg-primary, rgba(0,0,0,0.25)); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 7px; line-height: 1.4; letter-spacing: 0.02em; }
            .sm-card-sub { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 6px; line-height: 1.35; }
            .sm-card-status { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-xs); }
            .sm-card-status-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
            .sm-card--up .sm-card-status-dot { background: var(--success, #22c55e); box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25); }
            .sm-card--down .sm-card-status-dot { background: var(--error, #e74c3c); }
            .sm-card--na .sm-card-status-dot { background: var(--text-tertiary); }
            .sm-local-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
            .sm-local-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
            .sm-browser-local-header { margin-top: 12px; }
            .sm-local-title-text { margin-bottom: 0 !important; flex: 1; min-width: 0; }
            .sm-refresh-wrap { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
            .sm-refresh-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; transition: border-color 0.15s, color 0.15s; }
            .sm-refresh-icon-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
            .sm-refresh-icon-btn:disabled { opacity: 0.55; cursor: not-allowed; }
            .sm-refresh-icon-btn svg { width: 16px; height: 16px; }
            .sm-refresh-progress { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-2xs); color: var(--text-tertiary); min-height: 16px; }
            .sm-spinner { width: 14px; height: 14px; flex-shrink: 0; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: sm-spin 0.7s linear infinite; }
            @keyframes sm-spin { to { transform: rotate(360deg); } }
            .sm-desktop-section-title { font-weight: 700; margin-bottom: 10px; color: var(--accent); }
            .sm-local-services { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
            .sm-card--merged { min-height: auto; position: relative; display: flex; flex-direction: column; padding: 0; gap: 0; }
            .sm-card-primary { display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-width: 0; }
            .sm-card--merged .sm-card-status-dot { flex-shrink: 0; box-shadow: none; }
            .sm-card--merged .sm-card-title { font-size: var(--font-size-sm); flex-shrink: 0; }
            .sm-card-sub-inline { flex: 0 1 auto; min-width: 0; font-size: var(--font-size-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sm-menu-btn { flex-shrink: 0; width: 30px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-md); background: transparent; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-md); line-height: 1; }
            .sm-menu-btn:hover { border-color: var(--accent); color: var(--accent); }
            .sm-card-status-text { flex-shrink: 0; font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: 600; }
            .sm-card--up .sm-card-status-text { color: var(--success, #22c55e); }
            .sm-card--down .sm-card-status-text { color: var(--error, #e74c3c); }
            .sm-card-menu { position: absolute; top: 46px; right: 12px; min-width: 140px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 14px rgba(0,0,0,0.18); padding: 4px; z-index: 5; display: flex; flex-direction: column; gap: 2px; }
            .sm-card-menu[hidden] { display: none; }
            .sm-card--merged .sm-log-wrap[hidden] { display: none; }
            .sm-menu-item { text-align: left; border: 0; background: transparent; color: var(--text-primary); font-size: var(--font-size-xs); padding: 6px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.12s; }
            .sm-menu-item:hover { background: var(--bg-primary, rgba(0,0,0,0.2)); }
            .sm-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
            .sm-menu-item--start { color: var(--success, #22c55e); font-weight: 600; }
            .sm-menu-item--stop { color: var(--error, #e74c3c); font-weight: 600; }
            .sm-card--merged .sm-log-wrap { padding: 10px 14px 12px; margin-top: 0; border-top: 1px dashed var(--border); }
            .sm-card--ping-flash { animation: sm-ping-flash-bg 0.95s ease forwards; }
            @keyframes sm-ping-flash-bg {
              0%, 100% { box-shadow: none; }
              12% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.45), 0 4px 14px rgba(34, 197, 94, 0.12); background-color: rgba(34, 197, 94, 0.1); }
              40% { box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.2); background-color: rgba(34, 197, 94, 0.05); }
            }
            .sm-card-ping-check {
              position: absolute;
              top: 10px;
              right: 11px;
              font-size: 1.1rem;
              line-height: 1;
              pointer-events: none;
              color: var(--success, #22c55e);
              animation: sm-ping-check-pop 0.88s ease forwards;
              text-shadow: 0 0 6px var(--bg-secondary, #1a1a1a);
            }
            @keyframes sm-ping-check-pop {
              0% { opacity: 0; transform: scale(0.45); }
              22% { opacity: 1; transform: scale(1.12); }
              50% { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(0.88); }
            }
            .sm-dev-hint { font-size: var(--font-size-sm); color: var(--text-tertiary); margin-bottom: 12px; line-height: 1.5; }
            .sm-dev-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
            .sm-card--dev { min-height: auto; }
            .sm-card-head { margin-bottom: 10px; }
            .sm-card-track { font-size: var(--font-size-2xs); color: var(--text-secondary); margin-top: 6px; }
            .sm-card-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
            .sm-env-section { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
            .sm-env-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
            .sm-card--env { min-height: auto; }
            .sm-env-path { font-size: var(--font-size-2xs); color: var(--text-secondary); margin-top: 4px; word-break: break-all; line-height: 1.35; }
            .sm-env-editor-wrap { margin-top: 10px; }
            .sm-env-ta { width: 100%; min-height: 140px; margin-top: 8px; font-size: var(--font-size-xs); resize: vertical; box-sizing: border-box; }
            .sm-env-editor-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
            .sm-list-refresh-row { margin-bottom: 10px; }
            .sm-root-footer { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--border); }
            .sm-root-footer-label { font-size: var(--font-size-2xs); color: var(--text-tertiary); margin-bottom: 6px; letter-spacing: 0.02em; }
            .sm-root-footer-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            .sm-root-footer-input { flex: 1; min-width: 140px; margin-bottom: 0 !important; }
            .btn-sm { padding: 4px 10px; font-size: var(--font-size-xs); }
            .sm-log-wrap { margin-top: 10px; width: 100%; min-width: 0; }
            .sm-log-hint { margin: 0 0 6px 0; font-size: var(--font-size-2xs); color: var(--text-tertiary); line-height: 1.4; }
            .sm-log-panel {
              max-height: 200px;
              overflow: auto;
              padding: 8px 10px;
              border-radius: var(--radius-md);
              border: 1px solid var(--border);
              background: var(--bg-primary, #0f0f12);
              font-size: var(--font-size-2xs);
              line-height: 1.45;
              text-align: left;
              white-space: pre-wrap;
              word-break: break-word;
            }
            .sm-log-line { margin: 0; padding: 0; }
            .sm-log-line-err { color: var(--error, #e74c3c); }
            .sm-log-line-out { color: var(--text-secondary, #94a3b8); }
            .sm-stdin-form { display: flex; gap: 6px; margin-top: 8px; align-items: stretch; }
            .sm-stdin-input { flex: 1; min-width: 0; padding: 4px 8px; font-size: var(--font-size-2xs); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); }
            .sm-stdin-input:disabled { opacity: 0.55; cursor: not-allowed; }
            .sm-stdin-btn { padding: 4px 10px; font-size: var(--font-size-2xs); }
        `
    );

    container.innerHTML = '';

    if (isDesktop()) {
      const localSection = document.createElement('div');
      localSection.className = 'sm-local-section';

      const localHeaderRow = document.createElement('div');
      localHeaderRow.className = 'sm-local-header-row';

      const localTitle = document.createElement('div');
      localTitle.className = 'sm-desktop-section-title sm-local-title-text';
      localTitle.textContent = t('servermonitor.t01');

      localHeaderRow.appendChild(localTitle);
      localHeaderRow.appendChild(refreshWrap);

      const localHint = document.createElement('p');
      localHint.className = 'sm-dev-hint';
      localHint.textContent =
        t('servermonitor.t43');

      localSection.appendChild(localHeaderRow);
      localSection.appendChild(localHint);
      const rootFooter = document.createElement('div');
      mergedServicesEl = mountDesktopLocalDev(
        localSection,
        rootFooter,
        pingState,
        (fn) => {
          refreshDevTable = fn;
        },
        triggerStatusFetchSoon
      );

      container.appendChild(localSection);

      const envHost = document.createElement('div');
      mountEnvFilesPanel(envHost);
      container.appendChild(envHost);

      container.appendChild(rootFooter);
    } else {
      const browserHeader = document.createElement('div');
      browserHeader.className = 'sm-local-header-row sm-browser-local-header';
      const bt = document.createElement('div');
      bt.className = 'sm-desktop-section-title sm-local-title-text';
      bt.textContent = t('servermonitor.t01');
      browserHeader.appendChild(bt);
      browserHeader.appendChild(refreshWrap);
      container.appendChild(browserHeader);
      container.appendChild(statusBox);
    }

    /**
     * @param rerenderCards true 면 ping 후 카드 전체 다시 그리기(refreshDevTable). 수동 새로고침/시작·종료 직후 트리거에서만 true.
     *   자동 polling 은 false — 카드 그대로 두고 ping/track 만 patch 해서 사용자가 펼쳐둔 로그가 살아남음.
     */
    async function fetchStatus(rerenderCards: boolean = false): Promise<void> {
      setRefreshBusy(true, t('servermonitor.t44'));
      /* 데스크톱: 카드 영역은 비우지 않음(첫 접속도 골격 카드 먼저 그린 뒤 이 함수로 ping만 갱신) */
      if (!mergedServicesEl) {
        if (!statusBox.querySelector('.sm-cards .sm-card')) {
          statusBox.innerHTML = t('servermonitor.t45');
          statusBox.className = 'sm-status-wrap loading';
        }
      }

      let skipFinalMergeRefresh = false;
      try {
        const config = await loadConfig();
        const rawLocals = config.localMonitors ?? [];
        const normalized = rawLocals.map(normalizeLocalMonitor);

        const totalPings = normalized.filter((m) => m.canPing && m.url).length;
        let pingDone = 0;

        // 모든 ping 동시 발사 — 직렬은 5개 × 2s = 10s, 병렬은 max 2s.
        const localResults: Array<{ meta: (typeof normalized)[0]; state: LocalCardState }> = [];
        await Promise.all(
          normalized.map(async (meta) => {
            if (!meta.canPing || !meta.url) {
              const state: LocalCardState = 'na';
              localResults.push({ meta, state });
              pingState.byId[meta.id] = state;
              if (mergedServicesEl) {
                const card = mergedServicesEl.querySelector(
                  `[data-sm-service-id="${smEscapeAttr(meta.id)}"]`
                ) as HTMLElement | null;
                if (card) patchMergedCardPingUi(card, meta, state);
              }
              return;
            }
            const s = await pingLocal(meta.url!);
            pingDone++;
            setRefreshBusy(true, totalPings ? `URL ${pingDone}/${totalPings}` : t('servermonitor.t46'));
            localResults.push({ meta, state: s });
            pingState.byId[meta.id] = s;
            if (mergedServicesEl) {
              const card = mergedServicesEl.querySelector(
                `[data-sm-service-id="${smEscapeAttr(meta.id)}"]`
              ) as HTMLElement | null;
              if (card) {
                patchMergedCardPingUi(card, meta, s);
                flashMergedCardPingDone(card);
              }
            }
          })
        );

        setRefreshBusy(true, t('servermonitor.t47'));

        const localCardsHtml = localResults
          .map(({ meta, state }) => {
            const cls = localCardClass(state);
            const port = extractPort(meta.url);
            const portChip = port
              ? `<span class="sm-card-port mono">${esc(`:${port}`)}</span>`
              : '';
            const sub = meta.subtitle
              ? `<div class="sm-card-sub">${esc(meta.subtitle)}</div>`
              : '';
            // 브라우저(non-Tauri) 폴백 카드는 단순 모니터 — 이미지 사이즈 맞추기 위해 기존 카드 모양 유지
            return `<div class="${cls}">
              <div class="sm-card-title">${esc(meta.title)}</div>
              ${sub}
              ${portChip ? `<div class="sm-card-status" style="margin-top:auto;">${portChip}<span class="sm-card-status-dot" aria-hidden="true"></span><span>${esc(localStatusLabel(state))}</span></div>` : `<div class="sm-card-status"><span class="sm-card-status-dot" aria-hidden="true"></span><span>${esc(localStatusLabel(state))}</span></div>`}
            </div>`;
          })
          .join('');

        if (!mergedServicesEl) {
          statusBox.innerHTML = `
          <div class="sm-section-label">${esc(t('servermonitor.t01'))}</div>
          <div class="sm-cards">${localCardsHtml || '<p class="sm-card-sub" style="grid-column:1/-1">localMonitors가 비어 있습니다.</p>'}</div>
        `;
          statusBox.className = 'sm-status-wrap';
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('servermonitor.t48');
        if (mergedServicesEl) {
          Toolbox.showToast?.(t('servermonitor.queryFailed', { why: msg }), 'error', undefined);
          skipFinalMergeRefresh = true;
        } else {
          statusBox.innerHTML = t('servermonitor.queryFailed', { why: esc(msg) });
          statusBox.className = 'sm-status-wrap error';
        }
      } finally {
        // rerenderCards 가 true 일 때만 카드 전체 다시 그리기 (config 변경/시작·종료 직후 사용자 액션). polling 은 false 라 카드 유지 → 사용자가 펼쳐둔 로그 그대로.
        if (rerenderCards && !skipFinalMergeRefresh) {
          try {
            const doRefresh = refreshDevTable as (() => Promise<void>) | null;
            if (doRefresh) await doRefresh();
          } catch {
            /* ignore */
          }
        }
        setRefreshBusy(false);
      }
    }

    refreshBtn.onclick = () => void fetchStatus(true);

    /** 시작/종료 직후 짧게 기다린 뒤 ping 한 번. 새 프로세스가 listen 시작할 시간 줌. 카드는 시작/종료 콜백이 이미 다시 그리니 ping 만 patch. */
    let pendingFetchTimer: number | null = null;
    function triggerStatusFetchSoon(delayMs: number): void {
      if (pendingFetchTimer != null) window.clearTimeout(pendingFetchTimer);
      pendingFetchTimer = window.setTimeout(() => {
        pendingFetchTimer = null;
        if (refreshBtn.disabled) return;
        void fetchStatus(false);
      }, delayMs);
    }
    /** 데스크톱 카드의 시작/종료 콜백에서 ping을 직접 트리거할 수 있게 노출 */
    (window as unknown as { __sm_triggerStatusFetchSoon?: typeof triggerStatusFetchSoon })
      .__sm_triggerStatusFetchSoon = triggerStatusFetchSoon;

    void (async () => {
      if (mergedServicesEl) {
        try {
          const doRefresh = refreshDevTable as (() => Promise<void>) | null;
          if (doRefresh) await doRefresh();
        } catch {
          /* ignore */
        }
      }
      await fetchStatus(false);
      // 자동 폴링: 5초마다 ping 만 patch (rerenderCards=false). 카드 DOM 그대로 → 사용자가 펼쳐둔 로그 보존.
      window.setInterval(() => {
        if (refreshBtn.disabled) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        void fetchStatus(false);
      }, 5000);
    })();
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta!('servermonitor'),
    tabs: [
      {
        id: 'main',
        label: t('servermonitor.tab.status', undefined, '상태'),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('servermonitor').then(function () {
            build(container);
          });
        }
      }
    ]
  });
})();
