/**
 * 위젯 로더 — boot 위젯만 즉시 로드, 나머지는 지연(Toolbox.kickLazyLoad)
 */
(function () {
  // TASK-KL-064: 알람 발화 모드면 대시보드 부트 생략 (alarm-fire.js 단독
  // takeover; index.html 조기 분기가 주입). Toolbox.init 미호출.
  if (typeof location !== 'undefined' && location.hash === '#alarm-fire') return;

  if (!window.KARMOLAB_WIDGET_LOADER_WAIT) window.KARMOLAB_WIDGET_LOADER_WAIT = [];

  const base = (function () {
    const s = (document.currentScript || [].slice.call(document.scripts).pop()) as HTMLScriptElement | null;
    if (s && s.src) {
      try {
        const u = new URL(s.src);
        return u.origin + u.pathname.replace(/\/[^/]+$/, '/') + 'widgets/';
      } catch {
        /* noop */
      }
    }
    return (location.origin || '') + '/apps/karmolab/js/widgets/';
  })();

  window.KARMOLAB_WIDGET_SCRIPT_BASE = base;

  window.KARMOLAB_LAZY_META_BY_ID = {};
  const registerDeferred = typeof Toolbox !== 'undefined' ? Toolbox.registerDeferred : undefined;
  if (registerDeferred) {
    (window.KARMOLAB_LAZY_META || []).forEach(function (stub) {
      if (stub && stub.id) window.KARMOLAB_LAZY_META_BY_ID![stub.id] = stub;
      registerDeferred(stub);
    });
  }

  const list = window.KARMOLAB_WIDGETS_BOOT || [];
  let pending = list.length;

  function done() {
    if (--pending === 0) {
      const waits = window.KARMOLAB_WIDGET_LOADER_WAIT || [];
      Promise.allSettled(waits).then(function () {
        Toolbox.initTheme();
        Toolbox.init();
        const lastPage = (function () {
          try {
            return localStorage.getItem('toolbox_last_page');
          } catch {
            return null;
          }
        })();
        const tools = Toolbox.getTools();
        const showHome =
          !lastPage || lastPage === 'home' || !tools.some(function (t) {
            return t.id === lastPage;
          });
        /* 덮개는 **이미 덮여 있다** (index.html + 부트 스크립트가 첫 그림 전에 정했다).
           여기서 하는 일은 걷는 것뿐이다. 예전엔 여기서 켰는데, 그러면 스크립트가 다 돌 때까지
           첫 화면이 먼저 보였다가 인트로가 덮는 순서가 돼서 어색했다.
           글자가 다 걸어 나올 시간(마지막 글자 시작 + 걷는 시간)을 준 뒤 걷는다. */
        const intro = document.getElementById('introOverlay');
        if (intro && showHome) {
          const letters = intro.querySelectorAll('.intro-letter').length || 9;
          // performance.now() = 페이지가 열린 뒤 흐른 시간. 스크립트가 오래 걸린 날은
          // 글자가 이미 다 나와 있으므로 기다리지 않고 바로 걷는다.
          const settled = letters * 55 + 620;
          /* 글꼴이 인트로 **도중에** 바뀌면 제목 폭이 달라져 글자가 살짝 튄다.
             덮개는 원래 「아직 준비 안 된 것을 가리는」 물건이니, 글꼴이 자리를 잡을 때까지
             덮고 있는 것이 맞다. 다만 글꼴이 영영 안 오는 날도 있으므로 오래는 안 기다린다. */
          const fontsSettled = document.fonts && document.fonts.ready
            ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))])
            : Promise.resolve();
          void fontsSettled.then(function () {
            setTimeout(function () {
              intro.classList.add('done');
              setTimeout(function () {
                intro.classList.add('hidden');
                intro.classList.remove('done');
              }, 560);
            }, Math.max(120, settled - performance.now()));
          });
        } else if (intro) {
          intro.classList.add('hidden');
        }
      });
    }
  }

  if (pending === 0) {
    done();
    return;
  }

  list.forEach(function (path) {
    const s = document.createElement('script');
    s.async = false;
    s.src = base + path + '.js';
    s.onload = done;
    s.onerror = done;
    document.body.appendChild(s);
  });
})();
