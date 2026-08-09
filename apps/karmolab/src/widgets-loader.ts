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
    if (--pending === 0) start();
  }

  /* 받을 것을 다 받았다 — 이제 앱을 켠다.
   *
   * 예전에는 이 안이 done() 안에 있었고, 받을 것이 하나도 없을 때도 done() 을 불렀다.
   * 그러면 세던 수가 0 에서 -1 이 되어 「다 받았다」에 **영영 안 걸린다** — 앱이 통째로 안 켜진다
   * (머리띠·옆줄·테마·⌘K 가 전부 죽는다). 화면은 HTML 에 적힌 것이 그대로 보여서 멀쩡해 보인다.
   * 실제로 도구 목록을 셸 안으로 들여올 때 이 길을 처음 밟았다 (TASK-KL-129). */
  /**
   * 주 스레드에 **틈을 낸다** (TASK-KL-128 ⑤).
   *
   * 부팅은 한 덩이로 돈다 — 테마 정하기 → 앱 켜기 → 도구 그리기. 느린 기기에서 이 덩이가
   * 300~600ms 씩 잡히는데, 그동안 누른 것은 **아무 일도 안 일어난다**(눌린 뒤에 처리된다).
   * 중간에 한 번 놓아 주면 그 사이에 들어온 손가락이 먼저 처리된다.
   *
   * `scheduler.yield()` 는 놓아 준 자리로 **다시 돌아온다** — 줄 맨 뒤로 가는
   * `setTimeout(0)` 과 달라서, 놓아 줬다고 부팅이 뒤로 밀리지 않는다.
   * 없는 브라우저(사파리)에서는 `setTimeout` 으로 흉내 낸다.
   */
  function yieldToMain(): Promise<void> {
    const sch = (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (sch && typeof sch.yield === 'function') return sch.yield();
    return new Promise((r) => setTimeout(r, 0));
  }

  function start() {
    {
      const waits = window.KARMOLAB_WIDGET_LOADER_WAIT || [];
      Promise.allSettled(waits).then(async function () {
        // 부팅 마일스톤 (TASK-KL-201) — 어느 칸에서 시간이 갔는지는 여기서만 알 수 있다.
        (window.KLPerf?.mark ?? window.__klMark)?.('shell:scripts-loaded');
        Toolbox.initTheme();
        (window.KLPerf?.mark ?? window.__klMark)?.('shell:theme');
        await yieldToMain();
        Toolbox.init();
        (window.KLPerf?.mark ?? window.__klMark)?.('shell:ready');
        await yieldToMain();
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
    start();
    return;
  }

  /**
   * 주소는 **앱과 같은 해석기로** 만든다 (TASK-KL-103).
   *
   * 예전에는 여기서 `base + 이름 + '.js'` 로 직접 붙였다. base 는 항상 `js/widgets/` 라,
   * 앞머리가 `vendor/`·`root/`·`world/` 인 항목은 있지도 않은 `js/widgets/vendor/…` 를
   * 받으러 갔다. 실패해도 그냥 넘어가게(onerror = done) 돼 있어서 **화면은 멀쩡했고**,
   * 버튼을 눌러야 죽었다 — 암호화·개발 도구·이미지 편집 셋이 실서비스에서 그 상태였다.
   *
   * 같은 규칙을 두 벌 적어 두면 한쪽만 바뀌는 날이 온다. 앱이 쓰는 그것을 그대로 부른다.
   */
  function scriptUrl(rawPath: string): string {
    const r = typeof Toolbox !== 'undefined' && Toolbox.resolveScriptPath;
    return r ? r(rawPath) : base + rawPath + '.js';
  }

  list.forEach(function (path) {
    const s = document.createElement('script');
    s.async = false;
    s.src = scriptUrl(path);
    s.onload = done;
    s.onerror = done;
    document.body.appendChild(s);
  });
})();
