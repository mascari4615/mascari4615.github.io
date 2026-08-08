/**
 * KarmoLab 계측 (TASK-KL-088)
 *
 * 왜: 도구를 20개 만들어 놓고도 「누가 무엇을 쓰는지」 볼 수단이 없었다. 다음에 무엇을 만들지·
 * 어떤 설명이 안 먹히는지가 전부 이 데이터에 달려 있어 계기부터 단다.
 *
 * 원칙:
 *  - **입력 내용은 절대 안 보낸다.** 보내는 것은 도구 id 와 동작 이름뿐 (예: use/charcount/copy).
 *  - 쿠키·개인 식별자 없음 (GoatCounter). 블로그가 이미 쓰는 계정을 그대로 쓴다.
 *  - 데스크톱(Tauri) 앱에서는 아예 로드하지 않는다 — 내가 쓰는 것이 통계를 덮는다.
 *  - 앱 내부 전환도 도구 상세 페이지와 **같은 경로**(/karmolab/t/<id>/)로 기록해 합산되게 한다.
 */
(function (): void {
  const SITE = 'https://mascari4615.goatcounter.com/count';

  const disabled =
    typeof window === 'undefined' ||
    !!window.__KARMOLAB_DESKTOP__ ||
    location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  /** 도구 상세 페이지에서 열린 경우 그 페이지뷰는 스크립트가 자동으로 한 번 기록한다. */
  let skipNext = typeof window !== 'undefined' ? window.KARMOLAB_ENTRY_TOOL || null : null;

  function counter(): ((opts: { path?: string; title?: string; event?: boolean }) => void) | null {
    const gc = window.goatcounter;
    return gc && typeof gc.count === 'function' ? gc.count.bind(gc) : null;
  }

  function page(toolId: string, title?: string): void {
    if (disabled || !toolId) return;
    if (skipNext === toolId) {
      // 진입한 도구의 첫 페이지뷰 — 이미 잡혔으므로 한 번만 건너뛴다.
      skipNext = null;
      return;
    }
    const count = counter();
    if (!count) return;
    count({ path: toolId === 'home' ? '/karmolab/' : `/karmolab/t/${toolId}/`, title: title || toolId });
  }

  /** 실제로 결과를 얻은 순간 — 「열어보기만 함」 과 구분하는 유일한 신호 */
  function use(toolId: string, action: string): void {
    if (disabled || !toolId || !action) return;
    const count = counter();
    if (!count) return;
    count({ path: `use/${toolId}/${action}`, title: `${toolId} ${action}`, event: true });
  }

  window.KarmoStat = { page, use, disabled };

  /* 미리 실행된 화면은 **아직 방문이 아니다** (TASK-KL-128 ③).
   *
   * 다음에 갈 것 같은 화면을 미리 받아 두는 것(prefetch)은 문서만 가져오지만, 미리 **실행**까지
   * 하는 것(prerender)은 그 화면의 스크립트가 정말로 돈다. 그대로 두면 아무도 안 본 화면이
   * 방문으로 세이고, 그래서 그동안 미리 받기만 했다.
   *
   * 브라우저가 그 구분을 알려 준다: 미리 실행 중이면 `document.prerendering` 이 참이고,
   * 사람이 실제로 그 화면에 도착하면 `prerenderingchange` 가 온다. 그때 세면 숫자는 그대로다.
   * 그동안 앱이 부른 기록은 줄을 세워 뒀다가 도착한 뒤에 흘려보낸다 — 놓치는 것 0.
   */
  const queued: Array<() => void> = [];
  const prerendering = () => typeof document !== 'undefined' && !!(document as Document & { prerendering?: boolean }).prerendering;
  const held = (fn: () => void): boolean => {
    if (!prerendering()) return false;
    queued.push(fn);
    return true;
  };

  function start(): void {
    if (disabled) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter', SITE);
    document.head.appendChild(s);
    for (const fn of queued.splice(0)) fn();
  }

  if (prerendering()) {
    document.addEventListener('prerenderingchange', start, { once: true });
  } else {
    start();
  }

  /* 부르는 쪽은 아무것도 몰라도 된다 — 여기서 붙잡았다가 도착한 뒤에 흘려보낸다. */
  const rawPage = page;
  const rawUse = use;
  window.KarmoStat.page = (toolId: string, title?: string) => {
    if (held(() => rawPage(toolId, title))) return;
    rawPage(toolId, title);
  };
  window.KarmoStat.use = (toolId: string, action: string) => {
    if (held(() => rawUse(toolId, action))) return;
    rawUse(toolId, action);
  };
})();
