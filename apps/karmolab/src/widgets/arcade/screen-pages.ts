/** 게임 설정과 대기 화면의 긴 내용을 버튼으로 넘기는 페이지. */
export function mountScreenPages(root: HTMLElement, signal: AbortSignal): void {
  if (signal.aborted) return;
  const cleanups = new Map<HTMLElement, () => void>();
  const scan = (): void => {
    for (const [target, cleanup] of cleanups) {
      if (!target.isConnected || !target.querySelector(':scope > .ac-pages-window')) { cleanup(); cleanups.delete(target); }
    }
    for (const target of root.querySelectorAll<HTMLElement>('#acDetail,#acWait')) {
      if (cleanups.has(target) || !target.children.length || !target.offsetHeight) continue;
      const window = document.createElement('div');
      window.className = 'ac-pages-window';
      const flow = document.createElement('div');
      flow.className = 'ac-pages-flow';
      while (target.firstChild) flow.append(target.firstChild);
      window.append(flow);
      const nav = document.createElement('nav');
      nav.className = 'ac-pages-nav';
      nav.setAttribute('aria-label', '화면 페이지');
      nav.innerHTML = '<button type="button" aria-label="이전 화면 페이지">←</button><output aria-live="polite"></output><button type="button" aria-label="다음 화면 페이지">→</button>';
      target.append(window, nav);
      target.classList.add('ac-paged-screen');
      const lifetime = new AbortController();
      let page = 0;
      const buttons = nav.querySelectorAll('button');
      const measure = (): void => {
        const width = window.clientWidth;
        if (!width) return;
        flow.style.columnWidth = width + 'px';
        const count = Math.max(1, Math.round((flow.scrollWidth + 24) / (width + 24)));
        page = Math.max(0, Math.min(count - 1, page));
        flow.style.transform = `translateX(${-page * (width + 24)}px)`;
        const label = `${page + 1} / ${count}`;
        if (nav.querySelector('output')!.textContent !== label) nav.querySelector('output')!.textContent = label;
        buttons[0].disabled = page === 0;
        buttons[1].disabled = page === count - 1;
      };
      buttons.forEach((button, index) => button.addEventListener('click', () => { page += index ? 1 : -1; measure(); }, { signal: lifetime.signal }));
      flow.addEventListener('focusin', event => {
        const item = event.target as HTMLElement;
        const delta = item.getBoundingClientRect().left - window.getBoundingClientRect().left;
        if (delta < 0 || delta >= window.clientWidth) { page += Math.round(delta / (window.clientWidth + 24)); measure(); }
      }, { signal: lifetime.signal });
      const size = new ResizeObserver(measure);
      size.observe(window);
      const pendingMeasure = requestAnimationFrame(measure);
      cleanups.set(target, () => {
        size.disconnect();
        lifetime.abort();
        cancelAnimationFrame(pendingMeasure);
      });
    }
  };
  const changes = new MutationObserver(scan);
  changes.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  signal.addEventListener('abort', () => { changes.disconnect(); for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); }, { once: true });
  scan();
}
