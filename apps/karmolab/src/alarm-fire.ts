/**
 * 알람 발화 풀스크린 페이지 — TASK-KL-064.
 *
 * `index.html` 의 `location.hash === '#alarm-fire'` 조기 분기가 대시보드 부트
 * *전에* 로드 (가벼움, toolbox 비의존). Rust 상주 스케줄러가 발화 시 label
 * "alarm" WebviewWindow 를 이 페이지로 띄운다 (always-on-top·fullscreen).
 *
 * Tauri 전역(withGlobalTauri=true) 직접 사용 — tauri-bridge 번들 비의존
 * (조기 분기라 toolbox 파이프라인 안 탐). capabilities/default.json 의
 * windows=["main","alarm"] + remote url 매칭이 invoke/listen 을 허용.
 *
 * MVP = 단순 dismiss + 스누즈. 풀스크린 인터셉트 강화 / dismiss 미션은 후속.
 */
(function (): void {
  'use strict';

  type Alarm = {
    id: string;
    label: string;
    hour: number;
    minute: number;
    snooze_minutes: number;
  };
  type TauriGlobal = {
    core?: { invoke?: <T = unknown>(c: string, a?: unknown) => Promise<T> };
    event?: {
      listen?: (
        e: string,
        h: (ev: { payload: unknown }) => void
      ) => Promise<() => void>;
    };
  };

  function tauri(): TauriGlobal | undefined {
    return (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  }

  function invoke<T = unknown>(cmd: string, args?: unknown): Promise<T> {
    const fn = tauri()?.core?.invoke;
    if (typeof fn !== 'function') return Promise.reject(new Error('Tauri invoke 없음'));
    return fn<T>(cmd, args);
  }

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  let current: Alarm | null = null;
  let clockTimer: number | undefined;

  function render(): void {
    document.documentElement.style.cssText =
      'margin:0;height:100%;background:#0a0a0a;';
    document.body.style.cssText =
      'margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:28px;background:#0a0a0a;color:#fff;' +
      "font-family:'Inter','KarmoSans',system-ui,sans-serif;user-select:none;" +
      'overflow:hidden;';
    document.body.innerHTML =
      '<div id="af-now" style="font-size:14vw;font-weight:800;letter-spacing:2px;' +
      'font-variant-numeric:tabular-nums;line-height:1;"></div>' +
      '<div id="af-label" style="font-size:4vw;font-weight:600;color:#ffd24a;' +
      'text-align:center;padding:0 6vw;max-width:90vw;"></div>' +
      '<div style="display:flex;gap:20px;margin-top:10px;">' +
      '<button id="af-snooze" style="display:none;font-size:2.4vw;padding:18px 44px;' +
      'border:2px solid #555;border-radius:14px;background:#1c1c1c;color:#ddd;' +
      'cursor:pointer;font-weight:600;">스누즈</button>' +
      '<button id="af-dismiss" style="font-size:2.4vw;padding:18px 56px;border:none;' +
      'border-radius:14px;background:#e23b3b;color:#fff;cursor:pointer;' +
      'font-weight:800;">끄기</button>' +
      '</div>';

    const tick = (): void => {
      const d = new Date();
      const el = document.getElementById('af-now');
      if (el) el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    };
    tick();
    clockTimer = window.setInterval(tick, 1000);

    const dismissBtn = document.getElementById('af-dismiss');
    const snoozeBtn = document.getElementById('af-snooze');
    dismissBtn?.addEventListener('click', () => finish('alarm_dismiss'));
    snoozeBtn?.addEventListener('click', () => finish('alarm_snooze'));
  }

  function showAlarm(a: Alarm | null): void {
    current = a;
    const label = document.getElementById('af-label');
    const snoozeBtn = document.getElementById('af-snooze');
    if (label) {
      label.textContent = a && a.label ? a.label : '⏰ 기상 시간입니다';
    }
    if (snoozeBtn) {
      snoozeBtn.style.display = a && a.snooze_minutes > 0 ? '' : 'none';
    }
  }

  function finish(cmd: 'alarm_dismiss' | 'alarm_snooze'): void {
    const id = current?.id ?? '';
    // Rust 가 사운드 정지 + 발화 창 destroy 까지 처리 (close_ring).
    void invoke(cmd, { id }).catch(() => {
      /* 창은 Rust 가 닫음; 실패해도 사용자 추가 액션 불요 */
    });
    if (clockTimer) window.clearInterval(clockTimer);
  }

  function boot(): void {
    render();
    // Tauri 주입이 늦을 수 있어 짧게 폴링 후 active 조회.
    let tries = 0;
    const poll = window.setInterval(() => {
      tries++;
      if (tauri()?.core?.invoke) {
        window.clearInterval(poll);
        void invoke<Alarm | null>('alarm_active')
          .then(showAlarm)
          .catch(() => showAlarm(null));
        void tauri()
          ?.event?.listen?.('alarm-fired', (ev) => {
            showAlarm((ev?.payload as Alarm) ?? null);
          })
          .catch(() => {
            /* listen 실패 = 초기 active 만으로 동작 */
          });
      } else if (tries > 50) {
        window.clearInterval(poll);
        showAlarm(null); // Tauri 미주입(웹 직접 열림) — 라벨 기본문구만
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
