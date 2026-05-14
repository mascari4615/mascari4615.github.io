/**
 * Claude 환경 컨트롤 위젯 — TASK-KL-056.
 *
 * v1 Step 1 = read 흐름만. Claude Code Stop/Notification hook 의 사운드 알림 설정
 * (memo/dotfiles/claude-hooks/notify-*.ps1) 의 현재 상태를 GUI 에 표시.
 *
 * 후속 Step:
 *   2 = write + sync (정본 편집 → sync-claude-hooks.ps1 호출)
 *   3 = 미리듣기 (PowerShell shell-out)
 *   4 = .wav drag-drop
 *
 * Stop 과 Notification 의 차이:
 *   Stop = Claude 응답 끝날 때마다 — 일반 알림 (Asterisk 기본)
 *   Notification = 권한 요청 / 60s idle 등 사용자 행동 필요 시 — 강조 (Exclamation 기본)
 */
(function (): void {
  'use strict';

  type NotifyHookConfig = {
    mode: string;
    system_sound?: string | null;
    wav_path?: string | null;
  };

  type NotifyConfigDto = {
    stop: NotifyHookConfig;
    notification: NotifyHookConfig;
    canonical_root: string;
  };

  function desktopInvoke(cmd: string, args?: unknown): Promise<unknown> {
    const core = window.__TAURI__?.core;
    const fn = core && typeof core.invoke === 'function' ? core.invoke : null;
    if (!fn) {
      return Promise.reject(
        new Error('Tauri invoke 없음 — KarmoLab 데스크톱 앱에서만 사용 가능합니다.')
      );
    }
    return fn(cmd, args);
  }

  function buildHookCard(name: string, label: string, hook: NotifyHookConfig): HTMLElement {
    const sec = document.createElement('section');
    sec.className = 'claude-env-section';

    const h = document.createElement('h3');
    h.className = 'claude-env-section-title';
    h.textContent = label;
    sec.appendChild(h);

    const dl = document.createElement('dl');
    dl.className = 'claude-env-dl';

    const rows: ReadonlyArray<readonly [string, string]> = [
      ['mode', hook.mode],
      ['system sound', hook.system_sound || '(none)'],
      ['wav path', hook.wav_path || '(none)']
    ];
    for (const [key, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    sec.appendChild(dl);

    sec.dataset.hook = name;
    return sec;
  }

  function build(container: HTMLElement): void {
    Mdd.injectCSS(
      'claude-env',
      `
        .claude-env-root { max-width: 640px; }
        .claude-env-intro { font-size: var(--font-size-sm); color: var(--text-tertiary); margin: 0 0 8px 0; line-height: 1.5; }
        .claude-env-canonical { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0 0 20px 0; font-family: ui-monospace, monospace; word-break: break-all; }
        .claude-env-section { margin-bottom: 24px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
        .claude-env-section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 12px 0; }
        .claude-env-dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; font-size: var(--font-size-sm); }
        .claude-env-dl dt { color: var(--text-secondary); font-weight: 600; }
        .claude-env-dl dd { margin: 0; color: var(--text-primary); font-family: ui-monospace, monospace; word-break: break-all; }
        .claude-env-log { margin-top: 12px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--bg-tertiary); border: 1px solid var(--border); font-size: var(--font-size-xs); font-family: ui-monospace, monospace; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
        .claude-env-log-err { border-color: var(--error-subtle); color: var(--error); }
      `
    );

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'claude-env-root';

    const intro = document.createElement('p');
    intro.className = 'claude-env-intro';
    intro.textContent =
      'Claude Code 의 Stop / Notification hook 사운드 알림 설정. ' +
      'v1 Step 1 = 현재 상태 read 만 (편집은 후속 Step 에서).';
    root.appendChild(intro);

    const canonical = document.createElement('p');
    canonical.className = 'claude-env-canonical';
    canonical.textContent = '정본 위치: (loading…)';
    root.appendChild(canonical);

    const stopSlot = document.createElement('div');
    stopSlot.dataset.slot = 'stop';
    root.appendChild(stopSlot);

    const notifSlot = document.createElement('div');
    notifSlot.dataset.slot = 'notification';
    root.appendChild(notifSlot);

    const log = document.createElement('div');
    log.className = 'claude-env-log';
    log.textContent = 'loading…';
    root.appendChild(log);

    container.appendChild(root);

    const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();
    if (!isApp) {
      log.className = 'claude-env-log claude-env-log-err';
      log.textContent = '웹 브라우저에서는 사용할 수 없습니다. KarmoLab Tauri 앱으로 열어 주세요.';
      canonical.textContent = '';
      return;
    }

    void desktopInvoke('claude_env_read_notify_config')
      .then(function (res) {
        const config = res as NotifyConfigDto;
        canonical.textContent = '정본 위치: ' + config.canonical_root;
        stopSlot.replaceChildren(buildHookCard('stop', 'Stop hook (응답 끝)', config.stop));
        notifSlot.replaceChildren(
          buildHookCard('notification', 'Notification hook (권한 요청 / idle)', config.notification)
        );
        log.textContent = 'read OK — Step 2 (write + sync) 부터 GUI 편집 활성.';
      })
      .catch(function (e: unknown) {
        log.className = 'claude-env-log claude-env-log-err';
        const errMsg = e instanceof Error ? e.message : String(e);
        log.textContent = 'read 실패: ' + errMsg;
        Toolbox.showToast?.('Claude 환경 read 실패', 'error', e);
      });
  }

  Toolbox.register({
    id: 'claude-env',
    title: 'Claude 환경',
    category: 'desktop',
    desc: 'Claude Code Stop/Notification hook 의 사운드 알림 GUI (memo/dotfiles 정본 read; v1 Step 1)',
    layout: 'form',
    icon: '<path d="M3 11l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 8v8a3 3 0 003 3h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    tabs: [{ id: 'claude-env-main', label: '패널', build }]
  });
})();
