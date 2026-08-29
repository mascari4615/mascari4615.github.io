/**
 * PWA 등록 + 갱신 안내 (TASK-KL-088)
 *
 * 배경(진단). KarmoLab 은 `/` 에 서비스되는데 자체 SW 는 `/apps/karmolab/` 스코프로
 * 등록돼 있어 이 페이지를 전혀 제어하지 못했다. 실제로 제어하던 것은 블로그(Chirpy)의 루트 SW 이고,
 * 그 SW 는 cache-first + 새 버전이 waiting 으로 대기하는 구조인데 KarmoLab 화면에는 그것을 깨울
 * UI 가 없었다. 그래서 새로 배포한 위젯이 기존 방문자에게 계속 안 보였다.
 *
 * 처방:
 *  1. KarmoLab 전용 SW 를 `/sw.js` 로 등록 (스코프 = `/`, 도구 상세 페이지 포함)
 *  2. 죽은 `/apps/karmolab/` 스코프 등록은 정리
 *  3. 등록된 SW 중 **하나라도** 대기 중이면 배너로 물어보고, 확인 시 전부에게 SKIP_WAITING
 *
 * 데스크톱(Tauri)의 배너(toolbox.ts)는 **앱 껍데기** 판올림이다. 화면은 라이브 웹을 그대로 받으므로
 * 그 안의 SW 는 따로 늙는다. 2026-08-29 에 그 자리에서 옛 화면으로 30분 소모
 * 그래서 데스크톱은 묻지 않고 **바로 새 판으로 바꾼다** (앱에는 새로고침이라는 개념이 없다).
 */
import { t, loadNamespace } from './lib/i18n';
import { APP_BASE, appPath } from './lib/site-base';

/* 위젯이 아니라 셸, 라이브러리. 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('pwa');

(function (): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.hash === '#alarm-fire') return;
  /** 데스크톱 앱은 묻지 않고 갈아 끼운다. 브라우저는 사람에게 묻는다 */
  const silent = !!window.__KARMOLAB_DESKTOP__;
  /** 이 화면이 뜰 때 이미 SW 가 붙어 있었나. 최초 설치는 갈아 끼우는 것이 아니다 */
  const hadController = !!navigator.serviceWorker.controller;

  const SW_URL = appPath('sw.js');
  /** 스코프 밖으로 등록돼 아무 페이지도 제어하지 못하던 옛 등록 */
  const DEAD_SCOPE = '/apps/karmolab/';
  /** 탭을 오래 켜 두는 사용자를 위한 주기 확인. 앱은 며칠씩 떠 있어 더 자주 본다 */
  const CHECK_INTERVAL_MS = silent ? 15 * 60 * 1000 : 60 * 60 * 1000;

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
    msg.textContent = t('pwa.t01', undefined, '새 버전이 나왔어요. 지금 새로 불러올까요?');
    body.appendChild(msg);

    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.className = 'karmolab-update-banner-install';
    updateBtn.textContent = t('pwa.t02', undefined, '지금 갱신');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'karmolab-update-banner-close';
    closeBtn.setAttribute('aria-label', t('pwa.t03', undefined, '닫기'));
    closeBtn.textContent = '×';

    banner.appendChild(body);
    banner.appendChild(updateBtn);
    banner.appendChild(closeBtn);
    document.body.appendChild(banner);

    updateBtn.onclick = () => {
      updateBtn.disabled = true;
      updateBtn.textContent = t('pwa.t04', undefined, '받는 중');
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

  /** 등록 하나를 감시. 대기 중이거나 새로 설치되면 배너를 띄운다 */
  function watch(registration: ServiceWorkerRegistration): void {
    const promptFor = (worker: ServiceWorker | null): void => {
      if (!worker) return;
      // 컨트롤러가 없으면 이번이 최초 설치. 갱신할 것이 없다.
      if (!navigator.serviceWorker.controller) return;
      const apply = (): void => {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.waiting?.postMessage('SKIP_WAITING'));
        });
        worker.postMessage('SKIP_WAITING');
      };
      // 앱에서는 묻지 않는다. 물어봐야 누를 자리를 사람이 못 찾는다 (2026-08-29 실측)
      if (silent) {
        apply();
        return;
      }
      showBanner(apply);
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

  /* 새 SW 가 자리를 잡으면 그때 한 번 새로 그리기. 안 그러면 갈아 끼워도 화면은 옛것
     `reloading` 으로 한 번만. 두 번 돌면 무한 새로고침이 된다 */
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 최초 설치에서 새로고침하면 처음 온 사람 화면이 이유 없이 깜빡임
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

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
      // 앱 창은 숨었다 뜨는 대신 포커스만 오갈 때가 있다 (Tauri)
      window.addEventListener('focus', check);
    })
    .catch((e) => {
      // 로컬에서 /apps/karmolab/index.html 을 직접 열면 이 경로가 없다. 무시.
      console.warn('[PWA] sw register fail:', e && e.message);
    });

  // 이미 붙어 있는 다른 등록(블로그 루트 SW 등)도 함께 감시 + 죽은 등록 정리
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => {
      if (r.scope.endsWith(DEAD_SCOPE)) {
        void r.unregister();
        return;
      }
      if (!r.scope.endsWith(APP_BASE)) watch(r);
    });
  });

  /* ★ **처음 붙는 것은 갈아치우는 것이 아니다** (2026-08-13).
   *
   * 일꾼(service worker)이 처음 설치되면 그 자리에서 이 화면을 넘겨받는다(`clients.claim`).
   * 그때도 `controllerchange` 가 울린다. 그래서 **첫 방문마다 화면이 한 번 새로고침됐다**
   * (실사이트 실측: 열고 242ms 뒤). 그 사이에 넣은 것은 전부 사라진다. 판본 대조가 그렇게
   * 죽어 있었다: 파일 두 개를 넣자마자 새로고침이 들어와 두 판본을 모두 넣어 주세요.
   *
   * 새로고침이 필요한 경우는 **이미 붙어 있던 일꾼이 새 판으로 바뀐** 때뿐이다. 처음 붙는
   * 순간에는 낡은 것이 없으므로 버릴 것도 없다. 그래서 열릴 때 붙어 있었는지를 기억해 둔다. */
  const onOpenWasAttached = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    if (!onOpenWasAttached) return; // 첫 설치가 넘겨받은 것. 버릴 낡은 화면이 없다
    reloading = true;
    location.reload();
  });
})();
