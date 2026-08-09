/**
 * 성능 계측 이음매 (TASK-KL-201) — `window.KLPerf`.
 *
 * 왜 있나: 「요즘 느린 것 같다」를 고치려면 **무엇이** 느린지가 먼저 있어야 하는데, KarmoLab 에는
 * 그 말을 하는 자리가 한 곳도 없었다. 위젯이 190개인데 어느 것이 몇 KB 인지, 눌러서 뜨기까지
 * 몇 ms 인지, 부팅이 지난 판보다 빨라졌는지 — 전부 눈대중이었다. 눈대중으로 고치면 고친 뒤에도
 * 눈대중이라, 좋아졌는지 나빠졌는지 아무도 모른다.
 *
 * 재는 곳은 **여기 하나**다. 위젯마다 따로 재면 그날부터 여섯 벌이 갈라진다 — 어떤 것은
 * 받는 시간을, 어떤 것은 그리는 시간을 「로딩」이라 부르게 된다. 셸(`toolbox.ts`)이 이미
 * 모든 스크립트와 모든 build 를 한 문(`loadScriptOnce` · `runBuild`)으로 통과시키므로,
 * 그 문에 눈금만 붙였다.
 *
 * **재는 것 자체가 비용이면 안 된다.** 상시로 도는 건 숫자 몇 개 더하기와 긴 작업 관찰자뿐이다
 * (관찰자는 브라우저가 이미 재고 있는 것을 받아 적기만 한다). 프레임 측정처럼 값비싼 것은
 * 계기판이 열려 「지금 재기」를 누를 때만 돈다.
 *
 * **없는 값을 0 으로 적지 않는다.** 서비스 워커가 준 응답은 받은 양이 0 으로 오고, 크롬이 아닌
 * 브라우저는 메모리를 안 알려 주며, 긴 작업 관찰자는 사파리에 없다. 그런 자리는 `null` 로 두고
 * 화면이 「모름」이라고 적는다 — 0 으로 적으면 「아주 빠르다」로 읽혀서, 없는 편보다 나쁘다.
 */

/* 이 판(배포) 표식 `__KARMOLAB_BUILD__` · `__KARMOLAB_COMMIT__` 은 `build.mjs` 가 박고
   `src/sw.ts` 가 전역에 한 번 선언해 둔다 — 여기서 또 선언하면 같은 이름이 두 벌이 된다. */

(function (): void {
  if (typeof window === 'undefined' || !window.performance) return;
  if (window.KLPerf) return; // 두 번 실려도 첫 판이 정본 (기록이 갈라지면 계측이 거짓말을 한다)

  const BUILD_TAG = typeof __KARMOLAB_BUILD__ === 'string' ? __KARMOLAB_BUILD__ : '';
  const BUILD_COMMIT = typeof __KARMOLAB_COMMIT__ === 'string' ? __KARMOLAB_COMMIT__ : '';

  const BOOT_LOG_KEY = 'karmolab_perf_boots';
  const BOOT_LOG_MAX = 40;
  const LONGTASK_MAX = 300;

  interface MarkEntry {
    name: string;
    /** 페이지가 열린 뒤 흐른 ms. */
    at: number;
  }

  interface ScriptEntry {
    url: string;
    /** 받아서 실행이 끝나기까지. 캐시면 짧다. */
    ms: number;
    at: number;
  }

  interface WidgetEntry {
    id: string;
    /** 눌러서 그 위젯이 준비되기까지 (받기 전부 + 이어 붙은 대기). 부트 위젯은 null. */
    loadMs: number | null;
    /** 처음 그리는 데 걸린 시간. */
    firstBuildMs: number | null;
    lastBuildMs: number | null;
    builds: number;
    scripts: string[];
  }

  interface LongTaskEntry {
    at: number;
    ms: number;
    /** 브라우저가 알려 주면 어디서 났는지. */
    from: string;
  }

  const marks: MarkEntry[] = [];
  const scripts = new Map<string, ScriptEntry>();
  const widgets = new Map<string, WidgetEntry>();
  const longTasks: LongTaskEntry[] = [];
  /** 긴 작업 관찰자가 아예 없는 브라우저(사파리)와 「하나도 없었다」를 가른다. */
  let longTaskSupported = false;
  let lcpMs: number | null = null;

  function now(): number {
    return performance.now();
  }

  function widgetOf(id: string): WidgetEntry {
    let entry = widgets.get(id);
    if (!entry) {
      entry = { id, loadMs: null, firstBuildMs: null, lastBuildMs: null, builds: 0, scripts: [] };
      widgets.set(id, entry);
    }
    return entry;
  }

  /* ── 받아 적는 자리 (셸이 부른다) ───────────────────────────────────── */

  function mark(name: string): void {
    marks.push({ name, at: now() });
  }

  function script(url: string, ms: number): void {
    scripts.set(url, { url, ms, at: now() });
  }

  function build(id: string, ms: number): void {
    const entry = widgetOf(id);
    entry.builds += 1;
    entry.lastBuildMs = ms;
    if (entry.firstBuildMs === null) entry.firstBuildMs = ms;
  }

  function widget(id: string, urls: string[], ms: number): void {
    const entry = widgetOf(id);
    entry.loadMs = ms;
    for (const url of urls) if (entry.scripts.indexOf(url) === -1) entry.scripts.push(url);
  }

  /* ── 브라우저가 이미 재고 있는 것 ──────────────────────────────────── */

  try {
    const observer = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        if (longTasks.length >= LONGTASK_MAX) longTasks.shift();
        const attribution = (item as unknown as { attribution?: Array<{ name?: string; containerName?: string }> })
          .attribution;
        const first = attribution && attribution[0];
        longTasks.push({
          at: item.startTime,
          ms: item.duration,
          from: (first && (first.containerName || first.name)) || '',
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    longTaskSupported = true;
  } catch {
    /* 사파리엔 없다 — 「0건」이 아니라 「못 잼」이다 (아래 snapshot 이 그렇게 적는다). */
  }

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) lcpMs = last.startTime;
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* 없으면 null 로 남는다. */
  }

  function navTiming(): Record<string, number | null> {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return { ttfb: null, domInteractive: null, domContentLoaded: null, load: null };
    return {
      ttfb: nav.responseStart,
      domInteractive: nav.domInteractive,
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd || null,
    };
  }

  function paintTiming(): { fcp: number | null; lcp: number | null } {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { fcp: fcp ? fcp.startTime : null, lcp: lcpMs };
  }

  interface ResourceRow {
    url: string;
    kind: string;
    ms: number;
    /** 압축된 채로 몇 바이트인가. 서비스 워커가 준 것은 모름(null). */
    bytes: number | null;
    /** 실제로 회선을 탄 양. 0 = 캐시에서 나왔다. */
    transferred: number | null;
  }

  function kindOf(url: string): string {
    if (/\/js\/widgets\//.test(url)) return 'widget';
    if (/\/js\/vendor\//.test(url)) return 'vendor';
    if (/\.js(\?|$)/.test(url)) return 'shell';
    if (/\.css(\?|$)/.test(url)) return 'css';
    if (/\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/.test(url)) return 'image';
    if (/\.(woff2?|ttf|otf)(\?|$)/.test(url)) return 'font';
    return 'etc';
  }

  function resources(): ResourceRow[] {
    const list = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return list.map((item) => ({
      url: item.name,
      kind: kindOf(item.name),
      ms: item.duration,
      /* 서비스 워커가 답한 응답은 크기가 0 으로 온다 — 진짜 0바이트와 구분이 안 되므로 모름으로 둔다. */
      bytes: item.encodedBodySize > 0 ? item.encodedBodySize : null,
      transferred: typeof item.transferSize === 'number' ? item.transferSize : null,
    }));
  }

  function memory(): { usedMb: number; limitMb: number } | null {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!mem) return null; // 크로미움 밖에서는 못 잰다
    return { usedMb: mem.usedJSHeapSize / 1048576, limitMb: mem.jsHeapSizeLimit / 1048576 };
  }

  function device(): Record<string, unknown> {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number } };
    return {
      cores: nav.hardwareConcurrency || null,
      memoryGb: nav.deviceMemory || null,
      dpr: window.devicePixelRatio || 1,
      screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      net: nav.connection?.effectiveType || null,
      downlinkMbps: nav.connection?.downlink ?? null,
      ua: navigator.userAgent,
    };
  }

  /* ── 프레임 측정 — 열고 누를 때만 돈다 ─────────────────────────────── */

  interface FrameResult {
    /** 잰 구간 전체 (ms). 일하는 구간만 덮으면 늘 100점이 나오므로 부르는 쪽이 창을 정한다. */
    windowMs: number;
    frames: number;
    fps: number;
    /** 제일 나빴던 1% 구간의 fps — 평균만 보면 끊김이 안 보인다. */
    fpsLow: number;
    /** 한 프레임이 33ms 를 넘긴 횟수 (= 눈에 보이는 끊김). */
    janks: number;
    worstMs: number;
  }

  function frameProbe(durationMs: number): Promise<FrameResult> {
    return new Promise((resolve) => {
      const gaps: number[] = [];
      const start = now();
      let last = start;
      function tick(): void {
        const at = now();
        gaps.push(at - last);
        last = at;
        if (at - start < durationMs) requestAnimationFrame(tick);
        else finish();
      }
      function finish(): void {
        const windowMs = now() - start;
        const sorted = gaps.slice().sort((a, b) => a - b);
        const cut = sorted.slice(Math.floor(sorted.length * 0.99));
        const worst = sorted.length ? sorted[sorted.length - 1] : 0;
        const lowGap = cut.length ? cut.reduce((a, b) => a + b, 0) / cut.length : 0;
        resolve({
          windowMs,
          frames: gaps.length,
          fps: windowMs > 0 ? (gaps.length * 1000) / windowMs : 0,
          fpsLow: lowGap > 0 ? 1000 / lowGap : 0,
          janks: gaps.filter((g) => g > 33).length,
          worstMs: worst,
        });
      }
      requestAnimationFrame(tick);
    });
  }

  /* ── 판별 부팅 원장 — 「고친 게 진짜 빨라졌나」 ─────────────────────── */

  interface BootRow {
    at: string;
    build: string;
    commit: string;
    ttfb: number | null;
    domInteractive: number | null;
    fcp: number | null;
    lcp: number | null;
    /** 셸이 도구 목록까지 다 세운 시점. */
    ready: number | null;
    longTaskMs: number | null;
  }

  function readBoots(): BootRow[] {
    try {
      const raw = localStorage.getItem(BOOT_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function markOf(name: string): number | null {
    const found = marks.find((m) => m.name === name);
    return found ? found.at : null;
  }

  /**
   * 부팅 한 줄을 원장에 남긴다. **한 번만** — 두 번 적히면 판별 비교가 부팅 수로 오염된다.
   *
   * 언제 적나: 페이지가 열리고 한가해진 뒤. 더 일찍 적으면 LCP 가 아직 안 정해져서
   * 「첫 그림이 없다」로 남는다 (실제로 재기 전에 재면 그렇게 된다).
   */
  let bootLogged = false;
  function logBoot(): void {
    if (bootLogged) return;
    bootLogged = true;
    const paint = paintTiming();
    const nav = navTiming();
    const row: BootRow = {
      at: new Date().toISOString(),
      build: BUILD_TAG,
      commit: BUILD_COMMIT.slice(0, 8),
      ttfb: nav.ttfb,
      domInteractive: nav.domInteractive,
      fcp: paint.fcp,
      lcp: paint.lcp,
      ready: markOf('shell:ready'),
      longTaskMs: longTaskSupported ? longTasks.reduce((sum, t) => sum + t.ms, 0) : null,
    };
    try {
      const rows = readBoots();
      rows.push(row);
      localStorage.setItem(BOOT_LOG_KEY, JSON.stringify(rows.slice(-BOOT_LOG_MAX)));
    } catch {
      /* 저장이 막혀 있어도(사생활 보호 모드) 이번 판 계측은 그대로 돈다. */
    }
  }

  function scheduleBootLog(): void {
    const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    const run = (): void => {
      // 첫 그림이 정해질 틈을 준다 — LCP 는 사용자가 손대는 순간 확정된다.
      setTimeout(logBoot, 2500);
    };
    if (document.readyState === 'complete') idle ? idle(run, { timeout: 4000 }) : run();
    else window.addEventListener('load', () => (idle ? idle(run, { timeout: 4000 }) : run()), { once: true });
  }
  scheduleBootLog();

  /* ── 한 장으로 내놓기 ──────────────────────────────────────────────── */

  function snapshot(): Record<string, unknown> {
    const res = resources();
    const byWidget = new Map<string, ResourceRow>();
    for (const row of res) if (row.kind === 'widget') byWidget.set(row.url.split('?')[0], row);

    const widgetRows = Array.from(widgets.values()).map((entry) => {
      let bytes: number | null = null;
      let scriptMs: number | null = null;
      for (const url of entry.scripts) {
        const timing = byWidget.get(url.split('?')[0]);
        if (timing?.bytes != null) bytes = (bytes || 0) + timing.bytes;
        const loaded = scripts.get(url);
        if (loaded) scriptMs = (scriptMs || 0) + loaded.ms;
      }
      return { ...entry, bytes, scriptMs };
    });

    return {
      takenAt: new Date().toISOString(),
      sinceOpenMs: now(),
      build: { tag: BUILD_TAG, commit: BUILD_COMMIT.slice(0, 8) },
      device: device(),
      nav: navTiming(),
      paint: paintTiming(),
      memory: memory(),
      marks: marks.slice(),
      widgets: widgetRows,
      scripts: Array.from(scripts.values()),
      resources: res,
      longTasks: longTaskSupported ? longTasks.slice() : null,
      boots: readBoots(),
    };
  }

  function clearBoots(): void {
    try {
      localStorage.removeItem(BOOT_LOG_KEY);
    } catch {
      /* noop */
    }
  }

  window.KLPerf = { mark, script, build, widget, snapshot, frameProbe, clearBoots };
  mark('perf:ready');
})();
