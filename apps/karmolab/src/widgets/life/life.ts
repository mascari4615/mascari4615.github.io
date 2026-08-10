/**
 * Life 채널 위젯 — 화면 캡처 (PrintScreen) / 음성 녹음 (Ctrl+Alt+Space) on/off 토글.
 * 기능이 off 상태면 Whisper 모델 (~3.1GB) 이 RAM 에서 해제됨.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type FeatureStates = {
    screen_enabled: boolean;
    voice_enabled: boolean;
    voice_loading: boolean;
  };

  function desktopInvoke<T>(cmd: string, args?: unknown): Promise<T> {
    const core = (window as unknown as { __TAURI__?: { core?: { invoke?: (cmd: string, args?: unknown) => Promise<T> } } }).__TAURI__?.core;
    const fn_ = core && typeof core.invoke === 'function' ? core.invoke : null;
    if (!fn_) return Promise.reject(new Error(t('life.err.01')));
    return fn_(cmd, args);
  }

  function getFeatureStates(): Promise<FeatureStates> {
    return desktopInvoke<FeatureStates>('life_get_feature_states');
  }

  function setFeature(feature: 'screen' | 'voice', enabled: boolean): Promise<void> {
    return desktopInvoke<void>('life_set_feature', { feature, enabled });
  }

  function buildToggleRow(
    container: HTMLElement,
    opts: {
      label: string;
      sublabel: string;
      badge: string;
      hotkey: string;
      featureKey: 'screen' | 'voice';
      onToggle: (enabled: boolean) => void;
    }
  ): { updateState: (enabled: boolean, loading?: boolean) => void } {
    const row = document.createElement('div');
    row.className = 'life-feature-row';

    const info = document.createElement('div');
    info.className = 'life-feature-info';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'life-feature-label';
    labelWrap.textContent = opts.label;

    const badge = document.createElement('span');
    badge.className = 'life-feature-badge';
    badge.textContent = opts.badge;
    labelWrap.appendChild(badge);

    const sub = document.createElement('div');
    sub.className = 'life-feature-sub';
    sub.textContent = opts.sublabel;

    const hk = document.createElement('code');
    hk.className = 'life-feature-hotkey';
    hk.textContent = opts.hotkey;

    info.appendChild(labelWrap);
    info.appendChild(sub);
    info.appendChild(hk);

    const switchWrap = document.createElement('label');
    switchWrap.className = 'life-toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.disabled = true;

    const slider = document.createElement('span');
    slider.className = 'life-toggle-slider';

    const status = document.createElement('span');
    status.className = 'life-feature-status';
    status.textContent = t('life.t02');

    switchWrap.appendChild(input);
    switchWrap.appendChild(slider);

    row.appendChild(info);
    row.appendChild(document.createElement('div')).className = 'life-feature-spacer';
    const rightWrap = document.createElement('div');
    rightWrap.className = 'life-feature-right';
    rightWrap.appendChild(status);
    rightWrap.appendChild(switchWrap);
    row.appendChild(rightWrap);

    container.appendChild(row);

    input.addEventListener('change', () => {
      input.disabled = true;
      status.textContent = input.checked ? t('life.t03') : t('life.t04');
      opts.onToggle(input.checked);
    });

    const updateState = (enabled: boolean, loading = false) => {
      input.checked = enabled;
      input.disabled = loading;
      if (loading) {
        status.textContent = t('life.t05');
        status.style.color = 'var(--text-muted, #888)';
      } else if (enabled) {
        status.textContent = t('life.t06');
        status.style.color = 'var(--color-success, #4caf50)';
      } else {
        status.textContent = t('life.t07');
        status.style.color = 'var(--text-muted, #888)';
      }
    };

    return { updateState };
  }

  function buildStyles(): string {
    return `
.life-widget-wrap { padding: 12px 0; display: flex; flex-direction: column; gap: 6px; }
.life-feature-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}
.life-feature-info { flex: 1; min-width: 0; }
.life-feature-label { font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.life-feature-badge {
  font-size: 0.65rem; font-weight: 500; padding: 1px 5px; border-radius: 3px;
  background: var(--bg-tertiary); color: var(--text-secondary);
  letter-spacing: 0.03em;
}
.life-feature-sub { font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px; }
.life-feature-hotkey {
  display: inline-block; font-size: 0.7rem; margin-top: 4px;
  padding: 1px 6px; border-radius: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-hover);
  font-family: monospace; letter-spacing: 0.02em;
}
.life-feature-spacer { flex: 1; }
.life-feature-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.life-feature-status { font-size: 0.72rem; color: var(--text-tertiary); white-space: nowrap; }
.life-toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
.life-toggle-switch input { opacity: 0; width: 0; height: 0; }
.life-toggle-slider {
  position: absolute; inset: 0; border-radius: 11px;
  background: var(--bg-active);
  transition: background 0.2s;
}
.life-toggle-slider::before {
  content: ''; position: absolute;
  width: 16px; height: 16px; border-radius: 50%;
  left: 3px; top: 3px;
  background: #fff;
  transition: transform 0.2s;
}
.life-toggle-switch input:checked + .life-toggle-slider { background: var(--color-success, #4caf50); }
.life-toggle-switch input:checked + .life-toggle-slider::before { transform: translateX(18px); }
.life-toggle-switch input:disabled + .life-toggle-slider { opacity: 0.5; cursor: not-allowed; }
.life-hint { font-size: 0.72rem; color: var(--text-muted, #888); padding: 6px 2px; }
`;
  }

  function build(container: HTMLElement): void {
             void loadNamespace('life').then(function () {

    const style = document.createElement('style');
    style.textContent = buildStyles();
    container.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'life-widget-wrap';

    let screenUpdater: ((e: boolean, l?: boolean) => void) | null = null;
    let voiceUpdater: ((e: boolean, l?: boolean) => void) | null = null;

    const screenCtrl = buildToggleRow(wrap, {
      label: t('life.t08', undefined, "화면 캡처"),
      sublabel: t('life.t09'),
      badge: 'Screen',
      hotkey: 'PrintScreen',
      featureKey: 'screen',
      onToggle: (enabled) => {
        setFeature('screen', enabled)
          .then(() => refresh())
          .catch((e) => {
            console.error(t('life.t10'), e);
            refresh();
          });
      },
    });
    screenUpdater = screenCtrl.updateState;

    const voiceCtrl = buildToggleRow(wrap, {
      label: t('life.t11', undefined, "음성 녹음"),
      sublabel: t('life.t12'),
      badge: 'Voice',
      hotkey: 'Ctrl + Alt + Space (hold)',
      featureKey: 'voice',
      onToggle: (enabled) => {
        setFeature('voice', enabled)
          .then(() => {
            refresh();
            // enable = sidecar Whisper decoder 비동기 로드 시작 → loading
            // → loaded 전환을 폴링이 잡아야 함. (KL-052: 기존엔 build()
            //  1회 setInterval 이 초기 voice-off=loading-false 에 자멸 →
            //  enable 후 폴링 0 → UI "로딩" 고착. enable 에 연동.)
            if (enabled) startVoicePoll();
          })
          .catch((e) => {
            console.error(t('life.t13'), e);
            refresh();
          });
      },
    });
    voiceUpdater = voiceCtrl.updateState;

    const hint = document.createElement('p');
    hint.className = 'life-hint';
    hint.textContent = t('life.t14');
    wrap.appendChild(hint);

    container.appendChild(wrap);

    function refresh(): void {
      getFeatureStates()
        .then((s) => {
          screenUpdater?.(s.screen_enabled, false);
          voiceUpdater?.(s.voice_enabled, s.voice_loading);
        })
        .catch(() => {
          screenUpdater?.(false, false);
          voiceUpdater?.(false, false);
        });
    }

    // voice_loading(decoder 비동기 로드) 동안만 1초 폴링, loaded 시 중단.
    // build() 1회 X — enable 시점 + 초기 복원(이미 로딩 중)에 시작.
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function startVoicePoll(): void {
      if (pollTimer !== null) return; // 중복 방지
      pollTimer = setInterval(() => {
        getFeatureStates()
          .then((s) => {
            screenUpdater?.(s.screen_enabled, false);
            voiceUpdater?.(s.voice_enabled, s.voice_loading);
            if (!s.voice_loading && pollTimer !== null) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          })
          .catch(() => {
            if (pollTimer !== null) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          });
      }, 1000);
    }

    // 초기 상태 로드 — 앱 재시작 시 voice 복원으로 이미 loading 중이면 폴링.
    getFeatureStates()
      .then((s) => {
        screenUpdater?.(s.screen_enabled, false);
        voiceUpdater?.(s.voice_enabled, s.voice_loading);
        if (s.voice_loading) startVoicePoll();
      })
      .catch(() => {
        screenUpdater?.(false, false);
        voiceUpdater?.(false, false);
      });
               });
           }

  Toolbox.register({
    id: 'life',
    title: t('widgets.life.title', undefined, "Life 채널"),
    category: 'tool',
    desc: t('widgets-desc.life.desc', undefined, "화면 캡처 / 음성 녹음 기능 on/off. 비활성 시 Whisper 모델 (~3.1GB) RAM 해제."),
    icon: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    tabs: [
      {
        id: 'main',
        label: t('life.t17', undefined, "기능 설정"),
        build,
      },
    ],
  });
})();
