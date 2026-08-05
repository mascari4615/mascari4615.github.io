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

  if (!disabled) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter', SITE);
    document.head.appendChild(s);
  }
})();
