/**
 * PWA 등록 + 갱신 안내 (TASK-KL-088)
 *
 * 배경(진단) — KarmoLab 은 `/karmolab/` 에 서비스되는데 자체 SW 는 `/apps/karmolab/` 스코프로
 * 등록돼 있어 이 페이지를 전혀 제어하지 못했다. 실제로 제어하던 것은 블로그(Chirpy)의 루트 SW 이고,
 * 그 SW 는 cache-first + 새 버전이 waiting 으로 대기하는 구조인데 KarmoLab 화면에는 그것을 깨울
 * UI 가 없었다. 그래서 새로 배포한 위젯이 기존 방문자에게 계속 안 보였다.
 *
 * 처방:
 *  1. KarmoLab 전용 SW 를 `/karmolab/sw.js` 로 등록 (스코프 = `/karmolab/`, 도구 상세 페이지 포함)
 *  2. 죽은 `/apps/karmolab/` 스코프 등록은 정리
 *  3. 등록된 SW 중 **하나라도** 대기 중이면 배너로 물어보고, 확인 시 전부에게 SKIP_WAITING
 *
 * 데스크톱(Tauri)은 자체 업데이터 배너(toolbox.ts)를 쓰므로 여기서는 아무것도 하지 않는다.
 */
import { t, loadNamespace } from './lib/i18n';

/* 위젯이 아니라 셸·라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('pwa');

(function (): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (window.__KARMOLAB_DESKTOP__) return;
  if (location.hash === '#alarm-fire') return;

  const SW_URL = '/karmolab/sw.js';
  /** 스코프 밖으로 등록돼 아무 페이지도 제어하지 못하던 옛 등록 */
  const DEAD_SCOPE = '/apps/karmolab/';
  /** 탭을 오래 켜 두는 사용자를 위한 주기 확인 */
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;

  let bannerShown = false;
  let reloading = false;

  function showBanner(onUpdate: () => void): void {
    if (bannerShown || document.querySelector('.karmolab-update-banner')) return;
    bannerShown = true;

    const banner = document.createElement('div');
    banner.className = 'karmolab-update-banner';

    const body = document.createElement('div');
    body.className = 'karmolab-update-banner-body';
    const msg = document.createElement('div');
    msg.className = 'karmolab-update-banner-msg';
    msg.textContent = t('pwa.t01');
    body.appendChild(msg);

    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.className = 'karmolab-update-banner-install';
    updateBtn.textContent = t('pwa.t02');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'karmolab-update-banner-close';
    closeBtn.setAttribute('aria-label', t('pwa.t03'));
    closeBtn.textContent = '×';

    banner.appendChild(body);
    banner.appendChild(updateBtn);
    banner.appendChild(closeBtn);
    document.body.appendChild(banner);

    updateBtn.onclick = () => {
      updateBtn.disabled = true;
      updateBtn.textContent = t('pwa.t04');
      onUpdate();
      // SW 교체가 막히는 환경(다른 탭이 붙잡고 있는 등)에서도 사용자가 갇히지 않게 강제 새로고침.
      setTimeout(() => {
        if (!reloading) {
          reloading = true;
          location.reload();
        }
      }, 3000);
    };
    closeBtn.onclick = () => {
      banner.remove();
      bannerShown = false;
    };
  }

  /** 등록 하나를 감시 — 대기 중이거나 새로 설치되면 배너를 띄운다 */
  function watch(registration: ServiceWorkerRegistration): void {
    const promptFor = (worker: ServiceWorker | null): void => {
      if (!worker) return;
      // 컨트롤러가 없으면 이번이 최초 설치 — 갱신할 것이 없다.
      if (!navigator.serviceWorker.controller) return;
      showBanner(() => {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.waiting?.postMessage('SKIP_WAITING'));
        });
        worker.postMessage('SKIP_WAITING');
      });
    };

    promptFor(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') promptFor(registration.waiting || installing);
      });
    });
  }

  navigator.serviceWorker
    .register(SW_URL)
    .then((registration) => {
      watch(registration);
      const check = (): void => {
        registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    })
    .catch((e) => {
      // 로컬에서 /apps/karmolab/index.html 을 직접 열면 이 경로가 없다 — 무시.
      console.warn('[PWA] sw register fail:', e && e.message);
    });

  // 이미 붙어 있는 다른 등록(블로그 루트 SW 등)도 함께 감시 + 죽은 등록 정리
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => {
      if (r.scope.endsWith(DEAD_SCOPE)) {
        void r.unregister();
        return;
      }
      if (!r.scope.endsWith('/karmolab/')) watch(r);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
})();
