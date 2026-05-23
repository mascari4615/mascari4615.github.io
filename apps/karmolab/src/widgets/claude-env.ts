/**
 * Claude 환경 컨트롤 위젯 — TASK-KL-056.
 *
 * v1 = read + write/sync + 미리듣기 + 파일 선택 다이얼로그.
 * Stop/Notification hook 각각 mode (system/beep/wav) + system sound + sound file
 * (.wav/.mp3) 편집, 저장 시 정본 (memo/dotfiles/claude-hooks/notify-*.ps1) 편집
 * + sync-claude-hooks.ps1 호출.
 *
 * wav 모드: .wav = SoundPlayer / .mp3 = WPF MediaPlayer (KL-059).
 * .wav/.mp3 drag-drop (TASK-KL-059): 카드 전체 drop → path 자동입력 +
 *   mode=wav 전환. 드롭 파일 *원위치* 경로만 set (memo git 자동복사 X —
 *   임의 바이너리 history bloat 비가역; canon-mirror 는 별 follow-up).
 *
 * Stop 과 Notification 의 차이:
 *   Stop = Claude 응답 끝날 때마다 — 일반 알림 (Asterisk 기본)
 *   Notification = 권한 요청 / 60s idle 등 사용자 행동 필요 시 — 강조 (Exclamation 기본)
 */
import { invoke as tauriInvoke, listen as tauriListen } from '../tauri-bridge';

(function (): void {
  'use strict';

  type NotifyMode = 'system' | 'beep' | 'wav';
  const MODES: ReadonlyArray<NotifyMode> = ['system', 'beep', 'wav'];
  const SYSTEM_SOUNDS = ['Asterisk', 'Beep', 'Exclamation', 'Hand', 'Question'] as const;
  type SystemSound = (typeof SYSTEM_SOUNDS)[number];

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

  type WriteResultDto = {
    canonical_root: string;
    sync_stdout: string;
    sync_stderr: string;
  };

  type HookForm = {
    name: 'stop' | 'notification';
    getMode: () => NotifyMode;
    getSystemSound: () => SystemSound;
    getWavPath: () => string;
    snapshot: () => NotifyHookConfig;
    populate: (hook: NotifyHookConfig) => void;
    /** KL-059 — 드롭된 .wav/.mp3 경로를 path 입력에 반영 + mode=wav 전환. */
    acceptDroppedSound: (path: string) => void;
  };

  /** KL-059 — drag-drop 허용 사운드 확장자 (mp3 = WPF MediaPlayer 확장 정합). */
  const DROP_SOUND_EXTS: ReadonlyArray<string> = ['.wav', '.mp3'];

  function hasSoundExt(path: string): boolean {
    const lower = path.toLowerCase();
    return DROP_SOUND_EXTS.some((e) => lower.endsWith(e));
  }

  /** KL-059 — 위젯 재진입(build 재호출) 시 직전 drag-drop 리스너 정리 (누수·stale DOM 방지). */
  let dragTeardown: (() => void) | null = null;

  type DragPayload = {
    paths?: string[];
    position?: { x: number; y: number };
  };

  function normalizeMode(raw: string | null | undefined): NotifyMode {
    return MODES.find((m) => m === raw) ?? 'system';
  }

  function normalizeSystemSound(raw: string | null | undefined): SystemSound {
    return SYSTEM_SOUNDS.find((s) => s === raw) ?? 'Asterisk';
  }

  function buildHookCard(
    name: 'stop' | 'notification',
    label: string,
    setLog: (text: string, isErr: boolean) => void
  ): { el: HTMLElement; form: HookForm } {
    const sec = document.createElement('section');
    sec.className = 'claude-env-section';
    sec.dataset.hook = name;

    const h = document.createElement('h3');
    h.className = 'claude-env-section-title';
    h.textContent = label;
    sec.appendChild(h);

    // mode radio row
    const modeRow = document.createElement('div');
    modeRow.className = 'claude-env-row';
    const modeLabel = document.createElement('span');
    modeLabel.className = 'claude-env-field-label';
    modeLabel.textContent = 'mode';
    modeRow.appendChild(modeLabel);
    const modeGroup = document.createElement('div');
    modeGroup.className = 'claude-env-radio-group';
    const radios: HTMLInputElement[] = [];
    for (const m of MODES) {
      const wrap = document.createElement('label');
      wrap.className = 'claude-env-radio';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `claude-env-mode-${name}`;
      radio.value = m;
      radios.push(radio);
      wrap.appendChild(radio);
      const txt = document.createElement('span');
      txt.textContent = m;
      wrap.appendChild(txt);
      modeGroup.appendChild(wrap);
    }
    modeRow.appendChild(modeGroup);
    sec.appendChild(modeRow);

    // system sound row (dropdown + ▶)
    const sysRow = document.createElement('div');
    sysRow.className = 'claude-env-row';
    const sysLabel = document.createElement('span');
    sysLabel.className = 'claude-env-field-label';
    sysLabel.textContent = 'system sound';
    sysRow.appendChild(sysLabel);
    const sysControl = document.createElement('div');
    sysControl.className = 'claude-env-input-row';
    const sysSelect = document.createElement('select');
    sysSelect.className = 'claude-env-select';
    for (const s of SYSTEM_SOUNDS) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sysSelect.appendChild(opt);
    }
    sysControl.appendChild(sysSelect);
    const sysPlay = document.createElement('button');
    sysPlay.type = 'button';
    sysPlay.className = 'claude-env-play';
    sysPlay.title = 'system 사운드 미리듣기';
    sysPlay.textContent = '▶';
    sysControl.appendChild(sysPlay);
    sysRow.appendChild(sysControl);
    sec.appendChild(sysRow);

    // beep row (▶ only — 톤은 정본 .ps1 의 hook 별 값으로 고정)
    const beepRow = document.createElement('div');
    beepRow.className = 'claude-env-row';
    const beepLabel = document.createElement('span');
    beepLabel.className = 'claude-env-field-label';
    beepLabel.textContent = 'beep';
    beepRow.appendChild(beepLabel);
    const beepControl = document.createElement('div');
    beepControl.className = 'claude-env-input-row';
    const beepHint = document.createElement('span');
    beepHint.className = 'claude-env-hint';
    beepHint.textContent = name === 'stop' ? '880 Hz · 150 ms' : '1200 Hz · 100 ms ×2';
    beepControl.appendChild(beepHint);
    const beepPlay = document.createElement('button');
    beepPlay.type = 'button';
    beepPlay.className = 'claude-env-play';
    beepPlay.title = 'beep 미리듣기';
    beepPlay.textContent = '▶';
    beepControl.appendChild(beepPlay);
    beepRow.appendChild(beepControl);
    sec.appendChild(beepRow);

    // wav row (text input + ▶)
    const wavRow = document.createElement('div');
    wavRow.className = 'claude-env-row';
    const wavLabel = document.createElement('span');
    wavLabel.className = 'claude-env-field-label';
    wavLabel.textContent = 'sound file';
    wavRow.appendChild(wavLabel);
    const wavControl = document.createElement('div');
    wavControl.className = 'claude-env-input-row';
    const wavInput = document.createElement('input');
    wavInput.type = 'text';
    wavInput.className = 'claude-env-input';
    wavInput.placeholder = 'C:\\…\\sound.wav 또는 .mp3  (드래그도 가능)';
    wavInput.spellcheck = false;
    wavControl.appendChild(wavInput);
    const wavBrowse = document.createElement('button');
    wavBrowse.type = 'button';
    wavBrowse.className = 'claude-env-browse';
    wavBrowse.title = '.wav / .mp3 파일 선택';
    wavBrowse.textContent = '찾아보기';
    wavControl.appendChild(wavBrowse);
    const wavPlay = document.createElement('button');
    wavPlay.type = 'button';
    wavPlay.className = 'claude-env-play';
    wavPlay.title = 'sound 파일 미리듣기';
    wavPlay.textContent = '▶';
    wavControl.appendChild(wavPlay);
    wavRow.appendChild(wavControl);
    sec.appendChild(wavRow);

    const form: HookForm = {
      name,
      getMode: () => {
        const checked = radios.find((r) => r.checked);
        return normalizeMode(checked?.value);
      },
      getSystemSound: () => normalizeSystemSound(sysSelect.value),
      getWavPath: () => wavInput.value.trim(),
      snapshot: () => ({
        mode: form.getMode(),
        system_sound: form.getSystemSound(),
        wav_path: form.getWavPath() || null
      }),
      populate: (hook) => {
        const mode = normalizeMode(hook.mode);
        for (const r of radios) {
          r.checked = r.value === mode;
        }
        sysSelect.value = normalizeSystemSound(hook.system_sound);
        wavInput.value = hook.wav_path ?? '';
      },
      acceptDroppedSound: applyPickedPath
    };

    // 「찾아보기」(파일 다이얼로그) 와 drag-drop(KL-059) 공용 — 경로 반영 +
    // mode=wav 자동 전환 + 짧은 시각 피드백. 단일 정의(평행 X).
    function applyPickedPath(path: string): void {
      wavInput.value = path;
      for (const r of radios) {
        r.checked = r.value === 'wav';
      }
      wavInput.classList.add('claude-env-input--flash');
      window.setTimeout(() => wavInput.classList.remove('claude-env-input--flash'), 600);
      setLog(`${name} wav path ← ${path}`, false);
    }

    // 미리듣기 버튼들 — 클릭 시 입력 즉시 invoke (저장 안 함).
    function preview(mode: NotifyMode): void {
      const snap = form.snapshot();
      // 미리듣기 인자: 호출 시점 mode 가 클릭 출처 (▶ 버튼 위치).
      const args: Record<string, unknown> = {
        hook: name,
        mode,
        systemSound: snap.system_sound,
        wavPath: snap.wav_path
      };
      void tauriInvoke('claude_env_preview_sound', args).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setLog(`${name} ${mode} 미리듣기 실패: ${msg}`, true);
        Toolbox.showToast?.('Claude 환경 미리듣기 실패', 'error', e);
      });
    }
    sysPlay.addEventListener('click', () => preview('system'));
    beepPlay.addEventListener('click', () => preview('beep'));
    wavPlay.addEventListener('click', () => preview('wav'));

    // 「찾아보기」 — OS 파일 다이얼로그로 .wav 선택. 선택 시 path 입력 + mode=wav 자동 전환.
    wavBrowse.addEventListener('click', function () {
      const dialog = (window as unknown as { __TAURI__?: { dialog?: { open?: unknown } } })
        .__TAURI__?.dialog;
      const openFn =
        dialog && typeof dialog.open === 'function'
          ? (dialog.open as (opts: unknown) => Promise<unknown>)
          : null;
      if (!openFn) {
        setLog(`${name} 파일 선택 불가 — Tauri dialog 없음 (데스크톱 앱 전용).`, true);
        return;
      }
      void openFn({
        multiple: false,
        directory: false,
        filters: [{ name: '사운드 (wav/mp3)', extensions: ['wav', 'mp3'] }]
      })
        .then(function (selected) {
          if (typeof selected !== 'string' || selected.length === 0) {
            return; // 취소
          }
          applyPickedPath(selected);
        })
        .catch(function (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setLog(`${name} 파일 선택 실패: ${msg}`, true);
          Toolbox.showToast?.('Claude 환경 파일 선택 실패', 'error', e);
        });
    });

    return { el: sec, form };
  }

  function build(container: HTMLElement): void {
    Mdd.injectCSS(
      'claude-env',
      `
        .claude-env-root { max-width: 680px; }
        .claude-env-intro { font-size: var(--font-size-sm); color: var(--text-tertiary); margin: 0 0 8px 0; line-height: 1.5; }
        .claude-env-canonical { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0 0 20px 0; font-family: ui-monospace, monospace; word-break: break-all; }
        .claude-env-section { margin-bottom: 24px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); transition: outline-color 0.12s, background 0.12s; }
        .claude-env-section.claude-env-drop-active { outline: 2px dashed var(--accent); outline-offset: 2px; background: var(--bg-tertiary); }
        .claude-env-input--flash { animation: claude-env-flash 0.6s ease-out; }
        @keyframes claude-env-flash { 0% { background: var(--accent); color: var(--accent-fg, #fff); } 100% { background: var(--bg-primary); } }
        .claude-env-section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 12px 0; }
        .claude-env-row { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; margin-bottom: 10px; }
        .claude-env-row:last-child { margin-bottom: 0; }
        .claude-env-field-label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 600; }
        .claude-env-radio-group { display: flex; gap: 12px; flex-wrap: wrap; }
        .claude-env-radio { display: inline-flex; align-items: center; gap: 4px; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer; }
        .claude-env-radio input { margin: 0; cursor: pointer; }
        .claude-env-input-row { display: flex; gap: 6px; align-items: center; }
        .claude-env-select, .claude-env-input { flex: 1; min-width: 0; padding: 4px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); font-family: inherit; }
        .claude-env-input { font-family: ui-monospace, monospace; }
        .claude-env-play { padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-sm); cursor: pointer; line-height: 1; }
        .claude-env-play:hover { background: var(--bg-quaternary, var(--bg-tertiary)); border-color: var(--accent); }
        .claude-env-browse { padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-secondary); font-size: var(--font-size-xs); cursor: pointer; line-height: 1; white-space: nowrap; }
        .claude-env-browse:hover { background: var(--bg-quaternary, var(--bg-tertiary)); border-color: var(--accent); color: var(--text-primary); }
        .claude-env-hint { flex: 1; color: var(--text-tertiary); font-size: var(--font-size-xs); font-family: ui-monospace, monospace; }
        .claude-env-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
        .claude-env-save { padding: 6px 16px; border: 1px solid var(--accent, var(--border)); border-radius: var(--radius-sm); background: var(--accent, var(--bg-tertiary)); color: var(--accent-fg, var(--text-primary)); font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; }
        .claude-env-save[disabled] { opacity: 0.5; cursor: progress; }
        .claude-env-log { margin-top: 12px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--bg-tertiary); border: 1px solid var(--border); font-size: var(--font-size-xs); font-family: ui-monospace, monospace; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }
        .claude-env-log-err { border-color: var(--error-subtle); color: var(--error); }
      `
    );

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'claude-env-root';

    const intro = document.createElement('p');
    intro.className = 'claude-env-intro';
    intro.textContent =
      'Claude Code 의 Stop / Notification hook 사운드 알림. ' +
      '저장하면 memo/dotfiles/claude-hooks/notify-*.ps1 정본을 편집한 뒤 sync-claude-hooks.ps1 가 ~/.claude/hooks/ 로 배포합니다.';
    root.appendChild(intro);

    const canonical = document.createElement('p');
    canonical.className = 'claude-env-canonical';
    canonical.textContent = '정본 위치: (loading…)';
    root.appendChild(canonical);

    const log = document.createElement('div');
    log.className = 'claude-env-log';
    log.textContent = 'loading…';
    function setLog(text: string, isErr: boolean): void {
      log.className = 'claude-env-log' + (isErr ? ' claude-env-log-err' : '');
      log.textContent = text;
    }

    const stopBuild = buildHookCard('stop', 'Stop hook (응답 끝)', setLog);
    const notifBuild = buildHookCard(
      'notification',
      'Notification hook (권한 요청 / idle)',
      setLog
    );
    root.appendChild(stopBuild.el);
    root.appendChild(notifBuild.el);

    const actions = document.createElement('div');
    actions.className = 'claude-env-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'claude-env-save';
    saveBtn.textContent = '저장 + sync 실행';
    actions.appendChild(saveBtn);
    root.appendChild(actions);
    root.appendChild(log);

    container.appendChild(root);

    const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();
    if (!isApp) {
      setLog('웹 브라우저에서는 사용할 수 없습니다. KarmoLab Tauri 앱으로 열어 주세요.', true);
      canonical.textContent = '';
      saveBtn.disabled = true;
      return;
    }

    // ── KL-059: .wav/.mp3 drag-drop — 카드 전체가 drop 타겟 ──
    // 위임 UX 결정: drop=카드전체+mode자동wav / 저장=드롭 원위치 경로만 set
    // (memo git 자동복사 X — 비가역 history bloat; canon-mirror=별 follow-up).
    if (dragTeardown) {
      dragTeardown();
      dragTeardown = null;
    }
    const dropTargets: ReadonlyArray<{ sec: HTMLElement; form: HookForm }> = [
      { sec: stopBuild.el, form: stopBuild.form },
      { sec: notifBuild.el, form: notifBuild.form }
    ];
    function clearDropHighlight(): void {
      for (const t of dropTargets) t.sec.classList.remove('claude-env-drop-active');
    }
    // Tauri drag 좌표 = physical px → elementFromPoint 는 CSS px (÷ DPR).
    function cardAt(
      pos: { x: number; y: number } | undefined
    ): { sec: HTMLElement; form: HookForm } | null {
      if (!pos) return null;
      const ratio = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / ratio, pos.y / ratio);
      const sec = el ? el.closest('.claude-env-section') : null;
      return dropTargets.find((t) => t.sec === sec) ?? null;
    }
    const dragSubs: Array<Promise<() => void>> = [
      tauriListen('tauri://drag-over', (e: { payload: unknown }) => {
        const hit = cardAt((e.payload as DragPayload | undefined)?.position);
        clearDropHighlight();
        if (hit) hit.sec.classList.add('claude-env-drop-active');
      }),
      tauriListen('tauri://drag-leave', () => clearDropHighlight()),
      tauriListen('tauri://drag-drop', (e: { payload: unknown }) => {
        clearDropHighlight();
        const pl = e.payload as DragPayload | undefined;
        const path = (pl?.paths ?? []).find(
          (p) => typeof p === 'string' && p.length > 0
        );
        if (!path) return;
        const hit = cardAt(pl?.position);
        if (!hit) return; // 카드 밖 드롭 — 무시
        if (!hasSoundExt(path)) {
          setLog(`${hit.form.name} 드롭 무시 — .wav/.mp3 만 허용: ${path}`, true);
          Toolbox.showToast?.('Claude 환경 — .wav/.mp3 파일만 가능', 'error', undefined);
          return;
        }
        hit.form.acceptDroppedSound(path);
      })
    ];
    dragTeardown = (): void => {
      for (const s of dragSubs) {
        void s.then((u) => {
          try {
            u();
          } catch (_) {
            /* noop */
          }
        });
      }
      clearDropHighlight();
    };

    function loadConfig(): void {
      saveBtn.disabled = true;
      saveBtn.textContent = '읽는 중…';
      setLog('loading…', false);
      void tauriInvoke('claude_env_read_notify_config')
        .then(function (res) {
          const config = res as NotifyConfigDto;
          canonical.textContent = '정본 위치: ' + config.canonical_root;
          stopBuild.form.populate(config.stop);
          notifBuild.form.populate(config.notification);
          setLog('read OK — 편집 후 [저장 + sync 실행] 으로 정본 반영. 미리듣기는 ▶.', false);
          saveBtn.textContent = '저장 + sync 실행';
          saveBtn.disabled = false;
        })
        .catch(function (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          setLog('read 실패: ' + errMsg, true);
          Toolbox.showToast?.('Claude 환경 read 실패', 'error', e);
          saveBtn.textContent = '저장 + sync 실행';
        });
    }

    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 + sync 실행 중…';
      setLog('write + sync 중…', false);
      const payload = {
        config: {
          stop: stopBuild.form.snapshot(),
          notification: notifBuild.form.snapshot()
        }
      };
      void tauriInvoke('claude_env_write_notify_config', payload)
        .then(function (res) {
          const result = res as WriteResultDto;
          const lines: string[] = [
            'write + sync OK.',
            '',
            '— sync stdout —',
            result.sync_stdout.trim() || '(empty)'
          ];
          if (result.sync_stderr.trim().length > 0) {
            lines.push('', '— sync stderr —', result.sync_stderr.trim());
          }
          lines.push('', '* 새 세션부터 효과 (Claude Code hook reload 정책).');
          setLog(lines.join('\n'), false);
          Toolbox.showToast?.('Claude 환경 저장 + sync 완료', 'success', undefined);
          saveBtn.textContent = '저장 + sync 실행';
          saveBtn.disabled = false;
        })
        .catch(function (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          setLog('write/sync 실패: ' + errMsg, true);
          Toolbox.showToast?.('Claude 환경 저장 실패', 'error', e);
          saveBtn.textContent = '저장 + sync 실행';
          saveBtn.disabled = false;
        });
    });

    loadConfig();
  }

  Toolbox.register({
    id: 'claude-env',
    title: 'Claude 환경',
    category: 'tool',
    desktopOnly: true,
    desc: 'Claude Code Stop/Notification hook 사운드 알림 GUI (memo/dotfiles 정본 편집 + sync; v1 Step 2/3)',
    layout: 'form',
    icon: '<path d="M3 11l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 8v8a3 3 0 003 3h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    tabs: [{ id: 'claude-env-main', label: '패널', build }]
  });
})();
