/**
 * 데스크톱(Tauri) 앱에서만 쓰는 껍데기 — **웹에서는 아예 안 받는다** (TASK-KL-128 ①-c)
 *
 * 왜 따로 나왔나: 창 단추·앱 배지·업데이트 알림은 전부 `__KARMOLAB_DESKTOP__` 일 때만 도는데,
 * 코드는 셸에 박혀 있어서 **웹 화면 130장이 매번 같이 받고 있었다**. 받아 놓고 첫 줄에서
 * 돌아서는 코드다.
 *
 * 바깥에서 부르는 것: `window.KarmoDesktopChrome.install()`.
 * 셸은 데스크톱일 때만 이 파일을 데려온다 — 웹 사용자는 평생 안 받는다.
 *
 * 셸에서 쓰는 것은 `Toolbox.escapeHtml` / `Toolbox.isDesktopApp` 둘뿐이다(전역으로 부른다).
 * 여기 새 코드를 넣을 때 셸 내부를 더 부르지 마라 — 부르는 순간 도로 셸에 묶인다.
 */
// @ts-nocheck — 셸에서 그대로 옮겨 온 코드 (TASK-KL-128 ①-c)
(function () {
    const escapeHtml = (s) => window.Toolbox.escapeHtml(s);
    const isDesktopApp = () => window.Toolbox.isDesktopApp();

    const UPDATE_DISMISS_KEY = 'karmolab-update-dismissed-version';

    function setupUpdateBannerListener() {
        if (typeof window === 'undefined' || !window.__KARMOLAB_DESKTOP__) return;
        const listenFn = window.__TAURI__?.event?.listen;
        if (typeof listenFn !== 'function') return;
        listenFn('karmolab://update-available', (e) => {
            const payload = (e?.payload || {}) as { current?: string; new?: string };
            if (!payload.new) return;
            // 사용자가 이미 닫은 버전이면 다시 띄우지 않는다 (수동으로 트레이 메뉴 사용 가능).
            try {
                if (localStorage.getItem(UPDATE_DISMISS_KEY) === payload.new) return;
            } catch (_) { /* localStorage 차단 환경 무시 */ }
            showUpdateBanner(payload.current || '?', payload.new);
        }).catch(() => {});
    }

    function showUpdateBanner(current, newVer) {
        if (document.querySelector('.karmolab-update-banner')) return;
        const banner = document.createElement('div');
        banner.className = 'karmolab-update-banner';

        const body = document.createElement('div');
        body.className = 'karmolab-update-banner-body';

        const msg = document.createElement('div');
        msg.className = 'karmolab-update-banner-msg';
        msg.innerHTML = `새 버전: <code>${escapeHtml(current)}</code> → <code>${escapeHtml(newVer)}</code>`;

        const notesA = document.createElement('a');
        notesA.className = 'karmolab-update-banner-notes';
        notesA.href = `https://github.com/mascari4615/mascari4615.github.io/releases/tag/karmolab-v${encodeURIComponent(newVer)}`;
        notesA.target = '_blank';
        notesA.rel = 'noopener noreferrer';
        notesA.textContent = '변경사항 보기';

        const progress = document.createElement('progress');
        progress.className = 'karmolab-update-banner-progress';
        progress.value = 0;
        progress.max = 1;
        progress.hidden = true;

        body.appendChild(msg);
        body.appendChild(notesA);
        body.appendChild(progress);

        const installBtn = document.createElement('button');
        installBtn.type = 'button';
        installBtn.className = 'karmolab-update-banner-install';
        installBtn.textContent = '지금 설치';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'karmolab-update-banner-close';
        closeBtn.setAttribute('aria-label', '닫기');
        closeBtn.textContent = '×';

        banner.appendChild(body);
        banner.appendChild(installBtn);
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);

        const formatBytes = (n: number): string => {
            if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
            if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
            return n + ' B';
        };

        const listenFn = window.__TAURI__?.event?.listen;
        let unlistenProgress: (() => void) | null = null;
        let unlistenFinish: (() => void) | null = null;

        const stopListeners = () => {
            try { unlistenProgress?.(); } catch (_) { /* ignore */ }
            try { unlistenFinish?.(); } catch (_) { /* ignore */ }
            unlistenProgress = null;
            unlistenFinish = null;
        };

        closeBtn.addEventListener('click', () => {
            try { localStorage.setItem(UPDATE_DISMISS_KEY, newVer); } catch (_) { /* ignore */ }
            stopListeners();
            banner.remove();
        });

        installBtn.addEventListener('click', () => {
            const invoke = window.__TAURI__?.core?.invoke;
            if (typeof invoke !== 'function') {
                msg.textContent = '설치 불가: Tauri invoke를 찾지 못했습니다.';
                return;
            }

            installBtn.disabled = true;
            installBtn.textContent = '준비 중…';
            progress.hidden = false;

            if (typeof listenFn === 'function') {
                listenFn('karmolab://update-progress', (e) => {
                    const p = (e?.payload || {}) as { downloaded?: number; total?: number };
                    if (typeof p.total === 'number' && p.total > 0 && typeof p.downloaded === 'number') {
                        progress.value = Math.min(p.downloaded, p.total);
                        progress.max = p.total;
                        installBtn.textContent = `${formatBytes(p.downloaded)} / ${formatBytes(p.total)}`;
                    } else if (typeof p.downloaded === 'number') {
                        progress.removeAttribute('value'); // indeterminate
                        installBtn.textContent = `${formatBytes(p.downloaded)} 받는 중`;
                    }
                }).then((un) => { unlistenProgress = un; }).catch(() => {});

                listenFn('karmolab://update-download-finished', () => {
                    progress.removeAttribute('value');
                    installBtn.textContent = '설치 중…';
                }).then((un) => { unlistenFinish = un; }).catch(() => {});
            }

            invoke('desktop_install_pending_update', {})
                .then((res) => {
                    stopListeners();
                    progress.hidden = true;
                    msg.textContent = typeof res === 'string' ? res : '설치 완료.';
                    installBtn.disabled = false;
                    installBtn.textContent = '재시작';
                    installBtn.classList.add('karmolab-update-banner-restart');
                    installBtn.onclick = () => {
                        installBtn.disabled = true;
                        installBtn.textContent = '재시작 중…';
                        void invoke('desktop_restart_app', {}).catch(() => {
                            installBtn.disabled = false;
                            installBtn.textContent = '재시작';
                        });
                    };
                })
                .catch((err) => {
                    stopListeners();
                    progress.hidden = true;
                    const errMsg = err instanceof Error ? err.message : String(err);
                    msg.textContent = `실패: ${errMsg}`;
                    installBtn.disabled = false;
                    installBtn.textContent = '다시 시도';
                });
        });
    }

    const UPDATE_COMPLETED_SEEN_KEY = 'karmolab_toolbox_seen_version';
    const UPDATE_COMPLETED_TOAST_TIMEOUT_MS = 6000;

    /** 데스크톱 자동 업데이트 직후 (NSIS quiet → 재시작) "v0.1.X 업데이트 완료" 토스트.
     *  init script 의 `karmolab_app_version_seen` 은 reload 전에 갱신되므로 별도 키로 추적. */
    function setupUpdateCompletedToast() {
        if (typeof window === 'undefined' || !window.__KARMOLAB_DESKTOP__) return;
        const current = window.__KARMOLAB_VERSION__;
        if (!current) return;
        let seen: string | null = null;
        try { seen = localStorage.getItem(UPDATE_COMPLETED_SEEN_KEY); } catch (_) { /* ignore */ }
        if (seen === current) return;
        try { localStorage.setItem(UPDATE_COMPLETED_SEEN_KEY, current); } catch (_) { /* ignore */ }
        if (!seen) return; // 최초 실행 — 업데이트가 아니므로 토스트 스킵
        showUpdateCompletedToast(seen, current);
    }

    function showUpdateCompletedToast(prevVer: string, newVer: string) {
        if (document.querySelector('.karmolab-update-completed-toast')) return;
        const toast = document.createElement('div');
        toast.className = 'karmolab-update-completed-toast';

        const msg = document.createElement('div');
        msg.className = 'karmolab-update-completed-toast-msg';
        msg.innerHTML = `✓ KarmoLab 업데이트 완료 <code>${escapeHtml(prevVer)}</code> → <code>${escapeHtml(newVer)}</code>`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'karmolab-update-completed-toast-close';
        closeBtn.setAttribute('aria-label', '닫기');
        closeBtn.textContent = '×';

        toast.appendChild(msg);
        toast.appendChild(closeBtn);
        document.body.appendChild(toast);

        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            toast.classList.add('karmolab-update-completed-toast-leaving');
            setTimeout(() => { toast.remove(); }, 200);
        };
        closeBtn.addEventListener('click', dismiss);
        setTimeout(dismiss, UPDATE_COMPLETED_TOAST_TIMEOUT_MS);
    }

    function injectDesktopBadge() {
        if (typeof window === 'undefined' || !window.__KARMOLAB_DESKTOP__) return;
        const left = document.querySelector('.header-bar-left');
        if (left && !left.querySelector('.karmolab-desktop-chrome')) {
            const row = document.createElement('span');
            row.className = 'karmolab-desktop-chrome';
            row.setAttribute('aria-label', '데스크톱 앱 모드');
            const span = document.createElement('span');
            span.className = 'karmolab-desktop-badge';
            const ver = window.__KARMOLAB_VERSION__;
            span.textContent = ver ? `앱 v${ver}` : '앱';
            span.title = ver
              ? `KarmoLab 데스크톱 앱 v${ver}`
              : 'Tauri 데스크톱 앱에서 실행 중입니다. 웹에서는 이 배지가 보이지 않습니다.';
            const browserA = document.createElement('a');
            browserA.className = 'karmolab-open-browser';
            browserA.href = 'https://mascari4615.github.io/karmolab/';
            browserA.target = '_blank';
            browserA.rel = 'noopener noreferrer';
            browserA.textContent = '브라우저';
            browserA.title = '기본 브라우저에서 KarmoLab 열기';
            row.appendChild(span);
            row.appendChild(browserA);
            left.appendChild(row);
        }
    }

    function installWindowControls() {
        if (!isDesktopApp()) return;
        const controls = document.getElementById('windowControls');
        if (!controls) return;

        const tauriWin = window.__TAURI__?.window;
        const getCurrentWindow = tauriWin?.getCurrentWindow;
        if (typeof getCurrentWindow !== 'function') {
            console.warn('[Toolbox] Tauri window API 미주입 — 윈도우 컨트롤 비활성');
            return;
        }
        const win = getCurrentWindow();

        controls.style.display = 'flex';
        controls.removeAttribute('aria-hidden');

        document.getElementById('wcMinimize')?.addEventListener('click', () => {
            win.minimize().catch((e) => console.warn('minimize 실패', e));
        });
        document.getElementById('wcMaximize')?.addEventListener('click', () => {
            win.toggleMaximize().catch((e) => console.warn('toggleMaximize 실패', e));
        });
        document.getElementById('wcClose')?.addEventListener('click', () => {
            win.close().catch((e) => console.warn('close 실패', e));
        });

        async function syncMaximized() {
            try {
                const m = await win.isMaximized();
                controls!.setAttribute('data-maximized', m ? 'true' : 'false');
            } catch { /* ignore */ }
        }
        void syncMaximized();
        win.onResized?.(() => { void syncMaximized(); }).catch(() => {});
    }

    /** 데스크톱 전용(desktopOnly 플래그) 도구는 일반 브라우저에서 메뉴·페이지에 넣지 않음.
     *  레거시: category==='desktop' 도 데스크톱전용으로 취급 (마이그 안전망). */

    window.KarmoDesktopChrome = {
        install() {
            injectDesktopBadge();
            setupUpdateBannerListener();
            setupUpdateCompletedToast();
            installWindowControls();
        }
    };
})();
