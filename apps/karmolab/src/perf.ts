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

  /**
   * 늦은 프레임 하나 (TASK-KL-201 ③ — Long Animation Frames).
   *
   * 긴 작업(longtask)은 「50ms 넘게 뭔가 했다」까지만 말한다 — **누가** 했는지는 거의 안 준다.
   * LoAF 는 프레임 단위로 보고 **어느 파일의 어느 함수**가 몇 ms 를 썼는지, 그중 입력을 막은
   * 시간이 얼마인지, 스타일·레이아웃에 얼마가 갔는지를 준다. 「긴 작업 3건」과
   * 「`chat.js` 의 `tick` 이 프레임마다 40ms」는 고칠 수 있느냐 없느냐의 차이다.
   *
   * 크로미움 전용(123+)이다. 없는 브라우저에서는 지금까지대로 긴 작업만 보인다 —
   * 그 자리는 「0건」이 아니라 「못 잼」으로 적는다.
   */
  interface SlowFrameScript {
    source: string;
    fn: string;
    /** 무엇이 이 코드를 불렀나 — 이벤트 핸들러 / 타이머 / rAF … */
    invoker: string;
    ms: number;
    /** 이 코드가 **강제로** 스타일·레이아웃을 다시 계산하게 만든 시간 (레이아웃 스래싱). */
    forcedLayoutMs: number;
  }

  interface SlowFrameEntry {
    at: number;
    ms: number;
    /** 이 프레임이 손가락을 막은 시간. 프레임 길이보다 이 값이 사람 체감에 가깝다. */
    blockingMs: number;
    /** 그리기(스타일·레이아웃·페인트)에 간 시간. */
    renderMs: number;
    scripts: SlowFrameScript[];
  }

  /**
   * 한 번의 조작 (TASK-KL-201 ②).
   *
   * 「굼뜨다」는 **셋 중 하나**다. 이 셋을 안 가르면 고칠 곳을 못 찾는다:
   *   ① 대기(input delay)  — 눌렀는데 주 스레드가 딴 일 중이라 핸들러가 못 뜬 시간
   *   ② 처리(processing)   — 핸들러가 도는 시간
   *   ③ 표시(presentation) — 다 하고도 화면에 나오기까지 (스타일·레이아웃·페인트)
   * ①이면 다른 코드가 범인이고, ②면 내 핸들러가, ③이면 그리는 비용이 범인이다.
   */
  interface InteractionEntry {
    /** 같은 조작(pointerdown·pointerup·click)을 하나로 묶는 열쇠. */
    interactionId: number;
    name: string;
    at: number;
    /** 눌린 순간부터 화면에 나오기까지 (브라우저가 8ms 단위로 반올림해 준다). */
    ms: number;
    inputDelayMs: number;
    processingMs: number;
    presentationMs: number;
    /** 무엇을 눌렀나. **콜백 안에서 즉시** 글자로 굳힌다 — 노드는 곧 사라진다. */
    target: string;
  }

  const marks: MarkEntry[] = [];
  const scripts = new Map<string, ScriptEntry>();
  const widgets = new Map<string, WidgetEntry>();
  const longTasks: LongTaskEntry[] = [];
  /** 긴 작업 관찰자가 아예 없는 브라우저(사파리)와 「하나도 없었다」를 가른다. */
  let longTaskSupported = false;
  let lcpMs: number | null = null;
  /** 「큰 그림」은 부팅 지표다 — 첫 손가락 또는 첫 화면 전환에서 끝낸다. */
  let lcpFrozen = false;
  let pageSwitches = 0;
  /**
   * 화면이 밀린 사건 하나 (TASK-KL-201 ⑥ — Layout Instability).
   *
   * 「눌렀는데 딴 게 눌렸다」의 정체다. 총점(CLS)만 있으면 고칠 수가 없다 — **무엇이** 밀었는지가
   * 있어야 한다. 브라우저가 `sources[]` 로 밀린 요소를 주는데, 그 노드는 곧 사라지므로
   * 콜백 안에서 즉시 글자로 굳힌다.
   */
  interface ShiftEntry {
    at: number;
    value: number;
    /** 사용자가 방금 뭘 눌러서 난 이동인가 (그건 대개 의도된 것이다). */
    afterInput: boolean;
    /** 밀린 것들. */
    who: string[];
  }

  const shifts: ShiftEntry[] = [];
  let shiftSupported = false;

  const slowFrames: SlowFrameEntry[] = [];
  let loafSupported = false;
  /** `interactionId` → 그 조작의 **제일 나쁜** 조각. 한 번 누름이 여러 엔트리로 쪼개져 온다. */
  const interactions = new Map<number, InteractionEntry>();
  let eventTimingSupported = false;

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
    /* 화면을 갈아 끼우면 「제일 큰 그림」이 그 시점으로 밀린다 — 부팅 지표가 아니라
       **방금 연 위젯의 크기**를 재게 된다. 실측으로 192ms 짜리가 2960ms 로 튀었다.
       브라우저는 첫 손가락에서 LCP 갱신을 멈추지만, 코드로 넘긴 화면은 안 멈춘다.
       그래서 화면이 바뀌는 순간을 우리가 끝으로 삼는다 (TASK-KL-201 ⑧). */
    if (name.indexOf('page:') === 0) {
      /* **첫** page: 는 부팅의 일부다 — 셸이 첫 화면을 세우면서 부른다. 그걸로 얼려 버리면
         「큰 그림」이 영영 안 정해진다(실측: 통째로 「못 잼」이 됐다). 두 번째 전환부터 끝이다. */
      pageSwitches += 1;
      if (pageSwitches > 1) lcpFrozen = true;
    }
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

  const SLOW_FRAME_MAX = 120;

  /** 주소는 길다 — 파일 이름만 남긴다. 크로스오리진이면 브라우저가 아예 안 알려 주기도 한다. */
  function fileOf(url: string): string {
    if (!url) return '(모름)';
    try {
      return new URL(url).pathname.split('/').slice(-2).join('/');
    } catch {
      return url.slice(0, 40);
    }
  }

  try {
    const shiftObserver = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const shift = item as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
          sources?: Array<{ node?: Node }>;
        };
        if (shifts.length >= 200) shifts.shift();
        shifts.push({
          at: shift.startTime,
          value: shift.value || 0,
          afterInput: !!shift.hadRecentInput,
          /* 노드는 곧 사라진다 — 나중에 읽으면 전부 「모름」이 된다. 지금 굳힌다. */
          who: (shift.sources || []).map((source) => describe(source.node)).filter(Boolean).slice(0, 3),
        });
      }
    });
    shiftObserver.observe({ type: 'layout-shift', buffered: true });
    shiftSupported = true;
  } catch {
    /* 크로미움 밖 — 「안 밀렸다」가 아니라 「못 잼」. */
  }

  try {
    const loafObserver = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const frame = item as PerformanceEntry & {
          blockingDuration?: number;
          renderStart?: number;
          styleAndLayoutStart?: number;
          scripts?: Array<{
            sourceURL?: string; sourceFunctionName?: string; invokerType?: string;
            duration?: number; forcedStyleAndLayoutDuration?: number;
          }>;
        };
        if (slowFrames.length >= SLOW_FRAME_MAX) slowFrames.shift();
        slowFrames.push({
          at: frame.startTime,
          ms: frame.duration,
          blockingMs: frame.blockingDuration || 0,
          /* renderStart 가 0 이면 **그리기를 아예 안 한 프레임**이다 — 그때의 「길이 - 0」 은
             프레임 전체가 되어 「그리기가 전부였다」로 읽힌다. 그건 거짓이므로 0 으로 둔다. */
          renderMs: frame.renderStart ? frame.startTime + frame.duration - frame.renderStart : 0,
          scripts: (frame.scripts || []).map((script) => ({
            source: fileOf(script.sourceURL || ''),
            fn: script.sourceFunctionName || '(익명)',
            invoker: script.invokerType || '',
            ms: script.duration || 0,
            forcedLayoutMs: script.forcedStyleAndLayoutDuration || 0,
          })),
        });
      }
    });
    loafObserver.observe({ type: 'long-animation-frame', buffered: true });
    loafSupported = true;
  } catch {
    /* 크로미움 123 미만·사파리·파이어폭스 — 긴 작업만 보인다. */
  }

  /** 무엇을 눌렀는지 사람이 알아볼 만큼만. 노드가 사라지기 전에 굳힌다. */
  function describe(node: unknown): string {
    const el = node as Element | null;
    if (!el || !el.tagName) return '';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    const text = (el.textContent || '').trim().slice(0, 18);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  }

  try {
    const eventObserver = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const event = item as PerformanceEventTiming & { interactionId?: number };
        /* `interactionId` 가 0 인 것은 **사용자 조작이 아니다**(스크롤 등). 그것까지 세면
           「제일 굼뜬 조작」이 사람이 만진 적 없는 것으로 채워진다. */
        const key = event.interactionId || 0;
        if (!key) continue;
        const inputDelay = event.processingStart - event.startTime;
        const processing = event.processingEnd - event.processingStart;
        const entry: InteractionEntry = {
          interactionId: key,
          name: event.name,
          at: event.startTime,
          ms: event.duration,
          inputDelayMs: inputDelay,
          processingMs: processing,
          presentationMs: Math.max(0, event.duration - (event.processingEnd - event.startTime)),
          target: describe(event.target),
        };
        /* 한 번 누름이 pointerdown·pointerup·click 세 엔트리로 온다 — 더하면 세 배가 된다.
           **제일 나쁜 조각**이 그 조작의 값이다 (web-vitals 와 같은 규약). */
        const prev = interactions.get(key);
        if (!prev || entry.ms > prev.ms) interactions.set(key, entry);
      }
    });
    /* 16ms = 한 프레임. 기본값(104ms)은 「좀 굼뜬」 것을 통째로 놓치고, 더 낮추면 엔트리가 폭증한다. */
    eventObserver.observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    eventTimingSupported = true;
  } catch {
    /* 안 되면 「0건」이 아니라 「못 잼」 — snapshot 이 그렇게 적는다. */
  }

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last && !lcpFrozen) lcpMs = last.startTime;
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* 없으면 null 로 남는다. */
  }

  /**
   * INP — 「이 세션에서 조작이 얼마나 굼떴나」 한 숫자 (TASK-KL-201 ②).
   *
   * 평균이 아니라 **거의 최악**을 쓴다: 스무 번 중 한 번 1초씩 걸리는 화면은 평균으로는
   * 멀쩡해 보이지만 사람은 그 한 번을 기억한다. 조작이 적을 땐 최댓값, 50회를 넘기면
   * 50회당 하나씩 최악을 버린다 (web-vitals 와 같은 규약 — 오작동 한 번에 안 흔들리게).
   */
  function inpMs(): number | null {
    if (!eventTimingSupported || interactions.size === 0) return null;
    const sorted = Array.from(interactions.values()).sort((a, b) => b.ms - a.ms);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))].ms;
  }

  /**
   * 이 환경의 **표시 하한** (TASK-KL-201 ④-b — 실측으로 나온 규율).
   *
   * 실험: 핸들러가 **하나도 없는** 빈 곳을 눌러도 표시까지 24~48ms 가 걸렸고, 그 시각 근처에
   * 늦은 프레임(LoAF)은 0건이었다. 즉 그만큼은 주 스레드가 아니라 **화면에 내보내는
   * 파이프라인**이 쓰는 시간이다 — 기기·창·브라우저마다 다르다.
   *
   * 그래서 「표시 40ms = 느리다」는 판정은 틀렸다. 같은 환경의 하한과 비교해야 한다.
   * 하한은 **처리 시간이 거의 0 인 조작들의 중앙값**으로 잡는다 — 그건 「아무 일도 안 한
   * 클릭」이고, 그 값이 곧 이 환경의 바닥이다. 자료가 적으면 `null` (섣불리 정하지 않는다).
   */
  function presentationFloorMs(): number | null {
    const idle = Array.from(interactions.values())
      .filter((entry) => entry.processingMs < 1)
      .map((entry) => entry.presentationMs)
      .sort((a, b) => a - b);
    if (idle.length < 3) return null;
    return idle[Math.floor(idle.length / 2)];
  }

  /**
   * 이 측정판을 **믿어도 되나** (TASK-KL-201 ②, 레퍼런스: RUM 관행).
   *
   * 안 보이는 탭에서는 브라우저가 그리기를 멈추고 타이머를 늦춘다 — 그 판의 부팅 시간과
   * fps 는 코드와 아무 상관이 없다. 뒤로가기로 되살아난 판(bfcache)과 미리 그려 둔 판
   * (prerender)도 시계의 0 이 달라 다른 줄과 비교하면 안 된다. 그런 줄을 조용히 섞으면
   * 「이번 배포가 두 배 느려졌다」 같은 **거짓 회귀**가 난다.
   */
  let hiddenDuringBoot = document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !bootLogged) hiddenDuringBoot = true;
  });
  let restoredFromCache = false;
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) restoredFromCache = true;
  });

  function trust(): { ok: boolean; why: string } {
    const nav = performance.getEntriesByType('navigation')[0] as
      | (PerformanceNavigationTiming & { activationStart?: number })
      | undefined;
    if (hiddenDuringBoot) return { ok: false, why: '안 보이는 탭에서 열렸다 — 그리기가 멈춘 판이다' };
    if (restoredFromCache) return { ok: false, why: '뒤로가기로 되살아난 판이다 (다시 안 그렸다)' };
    if (nav?.activationStart) return { ok: false, why: '미리 그려 둔 판이다 (시계의 0 이 다르다)' };
    return { ok: true, why: '' };
  }

  /**
   * CLS — 「화면이 얼마나 밀렸나」 (TASK-KL-201 ⑥).
   *
   * 전부 더하지 않는다. 표준 규약은 **제일 나쁜 구간 하나**다: 이동들을 5초 창(사이가 1초
   * 넘게 비면 새 창)으로 묶고 그중 합이 제일 큰 창을 값으로 삼는다. 그냥 더하면 오래 열어 둔
   * 화면일수록 나쁜 점수가 나와서, 페이지를 오래 보는 것 자체가 벌점이 된다.
   *
   * 사용자가 방금 뭘 눌러서 난 이동은 뺀다 — 그건 대개 의도한 것이다(탭 펼치기 등).
   */
  function clsValue(): number | null {
    if (!shiftSupported) return null;
    const rows = shifts.filter((s) => !s.afterInput);
    let best = 0;
    let sum = 0;
    let first = 0;
    let last = 0;
    for (const row of rows) {
      if (sum && (row.at - first > 5000 || row.at - last > 1000)) {
        best = Math.max(best, sum);
        sum = 0;
      }
      if (!sum) first = row.at;
      last = row.at;
      sum += row.value;
    }
    return Math.max(best, sum);
  }

  /** 무엇이 얼마나 밀었나 — 고칠 대상을 이름으로 준다. */
  function shiftCulprits(): Array<{ who: string; value: number; count: number }> | null {
    if (!shiftSupported) return null;
    const sum = new Map<string, { who: string; value: number; count: number }>();
    for (const row of shifts) {
      if (row.afterInput) continue;
      for (const who of row.who.length ? row.who : ['(브라우저가 안 알려 줌)']) {
        const acc = sum.get(who) || { who, value: 0, count: 0 };
        acc.value += row.value / (row.who.length || 1);
        acc.count += 1;
        sum.set(who, acc);
      }
    }
    return Array.from(sum.values()).sort((a, b) => b.value - a.value);
  }

  /** 파일#함수 별로 합친 「주 스레드를 얼마나 잡았나」 순위 (TASK-KL-201 ③). */
  function culprits(): Array<{ who: string; invoker: string; ms: number; forcedLayoutMs: number; frames: number }> {
    const sum = new Map<string, { who: string; invoker: string; ms: number; forcedLayoutMs: number; frames: number }>();
    for (const frame of slowFrames) {
      for (const script of frame.scripts) {
        const key = `${script.source}#${script.fn}`;
        const row = sum.get(key) || { who: key, invoker: script.invoker, ms: 0, forcedLayoutMs: 0, frames: 0 };
        row.ms += script.ms;
        row.forcedLayoutMs += script.forcedLayoutMs;
        row.frames += 1;
        sum.set(key, row);
      }
    }
    return Array.from(sum.values()).sort((a, b) => b.ms - a.ms);
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
    /* 「받는 데 200ms」가 회선이 느려서인지, 서버가 늦게 답해서인지, 이름 찾기에서 샌 건지
       — 총량만으로는 못 가른다. 단계로 쪼개야 고칠 곳이 정해진다 (TASK-KL-201 ⑤).
       크로스오리진은 `Timing-Allow-Origin` 이 없으면 **전부 0** 으로 온다 → 그건 「캐시」가
       아니라 「안 알려 줌」이다. null 로 둔다. */
    dnsMs: number | null;
    connectMs: number | null;
    waitMs: number | null;
    downloadMs: number | null;
    /** 이 파일이 첫 그림을 막았나 (`blocking` / `non-blocking`). */
    blocking: string;
    /** 어디서 왔나 — `cache` / `navigational-prefetch` / (빈 값 = 네트워크). */
    delivery: string;
    from: string;
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
    return list.map((item) => {
      const extra = item as PerformanceResourceTiming & { renderBlockingStatus?: string; deliveryType?: string };
      /* 단계값이 통째로 0 이면 「빨랐다」가 아니라 「안 알려 줬다」다 (크로스오리진 + TAO 없음).
         0 으로 그리면 남의 CDN 이 늘 제일 빠른 것으로 보인다. */
      const told = item.responseStart > 0 || item.domainLookupEnd > 0;
      let host = '';
      try {
        host = new URL(item.name).host;
      } catch {
        /* 주소 모양이 이상하면 빈 칸 — 도메인 요약에서 「(모름)」으로 묶인다. */
      }
      return {
        url: item.name,
        kind: kindOf(item.name),
        ms: item.duration,
        /* 서비스 워커가 답한 응답은 크기가 0 으로 온다 — 진짜 0바이트와 구분이 안 되므로 모름으로 둔다. */
        bytes: item.encodedBodySize > 0 ? item.encodedBodySize : null,
        transferred: typeof item.transferSize === 'number' ? item.transferSize : null,
        dnsMs: told ? item.domainLookupEnd - item.domainLookupStart : null,
        connectMs: told ? item.connectEnd - item.connectStart : null,
        /* 서버가 생각한 시간 — 이게 크면 회선이 아니라 서버 탓이다. */
        waitMs: told && item.requestStart ? item.responseStart - item.requestStart : null,
        downloadMs: told && item.responseStart ? item.responseEnd - item.responseStart : null,
        blocking: extra.renderBlockingStatus || '',
        delivery: extra.deliveryType || '',
        from: host,
      };
    });
  }

  /**
   * 받았는데 **한 번도 안 그린** 위젯 코드 (TASK-KL-201 ⑫).
   *
   * DevTools 의 「Coverage」에 해당하는 자리다. 브라우저는 「이 줄이 실행됐나」를 페이지 쪽에
   * 안 알려 준다(그건 개발자 도구 전용 통로다). 그래서 우리가 아는 것으로 근사한다:
   * **받은 위젯 묶음** 중 `runBuild` 를 한 번도 안 지난 것 = 이번에 화면에 안 나온 코드다.
   *
   * 「낭비」라고 단정하지 않는다 — 곧 누를 위젯일 수도 있다. 다만 **부팅에 딸려 온 것**이
   * 여기 있으면 그건 진짜 낭비다(누르지도 않았는데 받았다). 그 구분을 위해 부팅 목록을 같이 본다.
   */
  function unusedWidgetCode(): { bytes: number | null; rows: Array<{ id: string; bytes: number | null; atBoot: boolean }> } {
    const bootPaths = (window.KARMOLAB_WIDGETS_BOOT || []).map((p) => String(p));
    const byUrl = new Map<string, number>();
    for (const row of resources()) if (row.kind === 'widget' && row.bytes != null) byUrl.set(row.url.split('?')[0], row.bytes);

    /* **받은 것에서 출발한다.** 위젯 목록에서 출발하면 부팅에 딸려온 것을 통째로 놓친다 —
       그건 지연 로더를 안 거쳐서 우리 목록에 아예 없다(실측: 그래서 늘 「전부 썼다」가 나왔다).
       그런데 부팅에 딸려온 것이야말로 진짜 낭비다: 누르지도 않았는데 받았다. */
    const drawn = new Set<string>();
    for (const entry of widgets.values()) {
      if (entry.builds === 0) continue;
      for (const url of entry.scripts) drawn.add(url.split('?')[0]);
      drawn.add(entry.id);
    }

    const rows: Array<{ id: string; bytes: number | null; atBoot: boolean }> = [];
    let bytes: number | null = null;
    for (const [url, size] of byUrl) {
      if (drawn.has(url)) continue;
      /* 주소에서 이름을 뽑는다 — `js/widgets/tools/qrgen.js` → `tools/qrgen`. */
      const name = url.split('/js/widgets/')[1]?.replace(/\.js$/, '') || url;
      const leaf = name.split('/').pop() || name;
      if (drawn.has(leaf)) continue;
      bytes = (bytes || 0) + size;
      rows.push({ id: name, bytes: size, atBoot: bootPaths.some((p) => p === name || p.split('/').pop() === leaf) });
    }
    return { bytes, rows: rows.sort((a, b) => (b.bytes || 0) - (a.bytes || 0)) };
  }

  /** 도메인별 합계 (TASK-KL-201 ⑤ — Lighthouse 의 「서드파티 요약」에 해당). */
  function hostSummary(): Array<{ host: string; count: number; bytes: number | null; ms: number; ours: boolean }> {
    const sum = new Map<string, { host: string; count: number; bytes: number | null; ms: number; ours: boolean }>();
    for (const row of resources()) {
      const host = row.from || '(모름)';
      const acc = sum.get(host) || { host, count: 0, bytes: null, ms: 0, ours: host === location.host };
      acc.count += 1;
      acc.ms += row.ms;
      if (row.bytes != null) acc.bytes = (acc.bytes || 0) + row.bytes;
      sum.set(host, acc);
    }
    return Array.from(sum.values()).sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
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
    /** 이 줄을 다른 줄과 비교해도 되나. false 면 회귀 판정에서 빼야 한다. */
    trusted?: boolean;
    untrustedWhy?: string;
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
  /**
   * 부팅 낭비를 **그 시점 값으로 굳힌다** (TASK-KL-201 ⑬).
   *
   * 「받았는데 안 쓴 코드」는 시간이 갈수록 줄어든다 — 사람이 그 위젯을 누르면 쓰인 것이 되니까.
   * 그래서 지금 재면 언제 재느냐에 따라 답이 달라진다. **부팅 낭비는 부팅 직후의 값**이다.
   * 예산도 이 굳은 값으로 판정해야 「누가 많이 눌러 본 판」이 저절로 합격하는 일이 없다.
   */
  let bootWasteBytes: number | null = null;

  function logBoot(): void {
    if (bootLogged) return;
    bootLogged = true;
    bootWasteBytes = unusedWidgetCode().rows.filter((r) => r.atBoot).reduce((sum, r) => sum + (r.bytes || 0), 0);
    const paint = paintTiming();
    const nav = navTiming();
    const judged = trust();
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
      trusted: judged.ok,
      untrustedWhy: judged.why,
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
      trust: trust(),
      verdict: verdict(),
      inp: inpMs(),
      presentationFloorMs: presentationFloorMs(),
      cls: clsValue(),
      shiftCulprits: shiftCulprits(),
      /* 판별 부팅을 **분포**로 (RUM 관행) — 한 번 재고 「빨라졌다」는 말은 못 한다. */
      buildStats: buildStats(),
      /* 도메인별로 묶은 요약 — 「남의 것이 우리 것보다 무겁나」는 파일 하나씩 봐서는 안 보인다. */
      hosts: hostSummary(),
      unused: unusedWidgetCode(),
      bootWasteBytes,
      slowFrames: loafSupported ? slowFrames.slice().sort((a, b) => b.ms - a.ms) : null,
      /* 「누가 제일 많이 잡았나」 — 프레임을 하나씩 보면 안 보이고, 합쳐야 보인다.
         한 번 40ms 보다 매 프레임 8ms 가 대개 더 나쁘다. */
      culprits: loafSupported ? culprits() : null,
      /* 굼뜬 순. 못 재는 브라우저(사파리 등)는 `null` — 「조작이 다 빨랐다」와 다르다. */
      interactions: eventTimingSupported
        ? Array.from(interactions.values()).sort((a, b) => b.ms - a.ms)
        : null,
      marks: marks.slice(),
      widgets: widgetRows,
      scripts: Array.from(scripts.values()),
      resources: res,
      longTasks: longTaskSupported ? longTasks.slice() : null,
      boots: readBoots(),
    };
  }

  /**
   * 판(배포)별 부팅 **분포** (TASK-KL-201 ⑦ — RUM 관행).
   *
   * 한 번 재고 「이번 판이 빨라졌다」는 말은 못 한다. 같은 코드도 기계가 바쁘면 두 배가 난다.
   * 그래서 판마다 중앙값(p50)과 나쁜 쪽(p75)을 **샘플 수와 함께** 낸다 — 표본이 2~3개면
   * 숫자를 보여 주되 「아직 못 믿는다」는 뜻으로 수를 같이 읽게 한다.
   *
   * 못 믿을 줄(안 보이는 탭·되살아난 판)은 **뺀다**. 그건 코드와 무관한 값이라 섞으면
   * 분포가 통째로 거짓이 된다.
   */
  function buildStats(): Array<{ build: string; commit: string; n: number; readyP50: number | null; readyP75: number | null; lcpP50: number | null; lastAt: string }> {
    const groups = new Map<string, BootRow[]>();
    for (const row of readBoots()) {
      if (row.trusted === false) continue;
      const key = row.build || '(모름)';
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }
    const pick = (values: Array<number | null>, ratio: number): number | null => {
      const sorted = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
      if (!sorted.length) return null;
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
    };
    return Array.from(groups.entries())
      .map(([build, rows]) => ({
        build,
        commit: rows[rows.length - 1].commit,
        n: rows.length,
        readyP50: pick(rows.map((r) => r.ready), 0.5),
        readyP75: pick(rows.map((r) => r.ready), 0.75),
        lcpP50: pick(rows.map((r) => r.lcp), 0.5),
        lastAt: rows[rows.length - 1].at,
      }))
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }

  /* ── 예산 — 「좋다/나쁘다」를 여기 한 곳에서 정한다 ───────────────── */

  /**
   * 예산 (TASK-KL-201 ⑧ — Lighthouse·SpeedCurve 관행).
   *
   * 숫자를 늘어놓기만 하면 사람이 매번 「이게 좋은 건가?」를 다시 판단해야 한다. 기준을
   * **코드 한 곳**에 적어 두면 계기판이 대신 답한다. 값의 출처: 웹 표준 권고(LCP 2.5s ·
   * INP 200ms · CLS 0.1)와 이 앱의 실측(셸 준비 p75 가 지금 50ms 대라 1200ms 는 넉넉하다 —
   * 예산은 「지금보다 조금 나빠지는 것」이 아니라 「사람이 답답해지는 선」에 둔다).
   */
  const BUDGETS: Array<{ key: string; label: string; limit: number; unit: string; get: () => number | null }> = [
    { key: 'ready', label: '셸 준비까지', limit: 1200, unit: 'ms', get: () => markOf('shell:ready') },
    { key: 'lcp', label: '큰 그림 (LCP)', limit: 2500, unit: 'ms', get: () => paintTiming().lcp },
    { key: 'inp', label: '제일 굼뜬 조작 (INP)', limit: 200, unit: 'ms', get: inpMs },
    { key: 'cls', label: '화면 밀림 (CLS)', limit: 0.1, unit: '', get: clsValue },
    {
      key: 'js', label: '받은 자바스크립트', limit: 700 * 1024, unit: 'B',
      get: () => {
        const rows = resources().filter((r) => r.kind === 'widget' || r.kind === 'shell' || r.kind === 'vendor');
        const known = rows.filter((r) => r.bytes != null);
        /* 크기를 모르는 것이 절반을 넘으면 합계는 **아는 것만의 합**이라 늘 통과한다.
           그건 통과가 아니라 못 잰 것이다. */
        return known.length && known.length >= rows.length / 2 ? known.reduce((s, r) => s + (r.bytes || 0), 0) : null;
      },
    },
    {
      /* 지금 177KB 다. 예산은 「지금보다 나빠지지 않기」로 잡는다 — 0 으로 잡으면 오늘부터
         모두의 CI 가 빨갛고, 그건 고치라는 신호가 아니라 무시하라는 신호가 된다.
         줄이는 일은 따로 한다(부팅 목록 6개를 지연 로드로 — session-bus 공지). */
      key: 'bootwaste', label: '부팅에 받고 안 쓴 코드', limit: 200 * 1024, unit: 'B',
      get: () => bootWasteBytes,
    },
    {
      key: 'longtask', label: '긴 작업 총합', limit: 300, unit: 'ms',
      get: () => (longTaskSupported ? longTasks.reduce((s, t) => s + t.ms, 0) : null),
    },
  ];

  /**
   * 예산 대조 결과. **못 잰 것은 통과로 세지 않는다** — 「합격」과 「검사 못 함」을 같은 칸에
   * 넣으면, 계측이 조용히 죽은 날에도 화면은 초록으로 남는다. 그게 제일 나쁜 고장이다.
   */
  function verdict(): Array<{ key: string; label: string; value: number | null; limit: number; unit: string; state: 'pass' | 'fail' | 'unknown' }> {
    return BUDGETS.map((budget) => {
      const value = budget.get();
      return {
        key: budget.key,
        label: budget.label,
        value,
        limit: budget.limit,
        unit: budget.unit,
        state: value == null ? 'unknown' : value > budget.limit ? 'fail' : 'pass',
      };
    });
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
