/**
 * 문서 보기 공용 — 목차(ToC) + 지금 읽는 위치 표시.
 *
 * 왜 lib 인가: 「긴 글을 읽히는 화면」이 KarmoLab 안에 이미 둘이다(문서 위젯 · 스터디 맵 강의).
 * 각자 목차를 따로 만들면 동작이 갈리고 한쪽만 고쳐진다 — 그래서 만드는 규칙을 여기 한 곳에 둔다.
 *
 * 하는 일은 셋뿐이다. 제목에 id 를 박고, 목차 마크업을 만들고, 스크롤에 맞춰 현재 항목을 표시한다.
 * 마크다운 파서·문법 강조는 여기 없다 — 부르는 쪽이 이미 HTML 을 갖고 온다는 전제다.
 */

export interface DocHeading {
  id: string;
  text: string;
  /** 1 = 가장 큰 제목. 화면에서 들여쓰기 깊이로 쓴다. */
  level: number;
}

export interface DocTocOptions {
  /** 목차에 넣을 제목 선택자. 기본은 h2·h3·h4. */
  selector?: string;
  /** id 가 겹치지 않게 붙이는 접두사(문서마다 다르게). */
  prefix?: string;
  /** 이 개수 미만이면 목차를 만들지 않는다 — 짧은 글에 목차는 소음이다. */
  min?: number;
  /**
   * id 를 직접 짓고 싶을 때. 문서 위젯은 제목 글자에서 뽑은 id 로 **밖에 링크가 이미 걸려 있어서**
   * 번호를 붙이는 기본 방식으로 바꾸면 그 링크들이 깨진다 — 그래서 여는 구멍.
   */
  idFrom?: (text: string, at: number) => string;
}

/** 제목 글자를 id 로. 한글을 살린다(로마자 변환은 오히려 못 읽는 id 를 만든다). */
function slug(text: string, at: number, prefix: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `${prefix}${base || 'h'}-${at}`;
}

/**
 * 본문에서 제목을 찾아 id 를 박고 목록을 돌려준다.
 * 이미 id 가 있으면 건드리지 않는다(밖에서 걸어 둔 링크를 안 깨뜨리려고).
 */
export function collectHeadings(root: HTMLElement, opts: DocTocOptions = {}): DocHeading[] {
  const selector = opts.selector || 'h2, h3, h4';
  const prefix = opts.prefix || 'doc-';
  const found: DocHeading[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach((el, at) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    if (!el.id) el.id = opts.idFrom ? opts.idFrom(text, at) : slug(text, at, prefix);
    found.push({ id: el.id, text, level: Number(el.tagName.slice(1)) });
  });
  const min = opts.min ?? 3;
  return found.length >= min ? found : [];
}

/** 목차 마크업. 클래스 이름은 부르는 쪽이 자기 CSS 로 꾸민다. */
export function tocHtml(headings: DocHeading[], label: string, cls = 'doc-toc'): string {
  if (headings.length === 0) return '';
  const top = Math.min(...headings.map((h) => h.level));
  const items = headings
    .map(
      (h) =>
        `<a class="${cls}-a" data-toc-to="${h.id}" href="#${h.id}" style="padding-left:${(h.level - top) * 12}px">${h.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</a>`,
    )
    .join('');
  return `<nav class="${cls}" aria-label="${label}"><div class="${cls}-title">${label}</div><div class="${cls}-list">${items}</div></nav>`;
}

/**
 * 스크롤에 따라 현재 항목에 `is-here` 를 붙인다.
 * IntersectionObserver 로만 판단하면 「화면에 여럿 보일 때」 흔들려서,
 * 위에서부터 지나온 마지막 제목을 고르는 방식으로 고정했다.
 *
 * @returns 정리 함수 — 화면을 갈아엎을 때 부르면 감시를 푼다.
 */
export interface DocWatchOptions {
  /** 글이 창이 아니라 안쪽 상자에서 굴러갈 때 그 상자. 없으면 창 스크롤로 본다. */
  scrollRoot?: HTMLElement | null;
  /** 현재 항목에 붙일 클래스. 화면마다 이름이 달라 열어 둔다. */
  activeClass?: string;
  /** 목차 링크 선택자·id 를 읽는 방법(기본은 data-toc-to). */
  linkSelector?: string;
  idOf?: (link: HTMLElement) => string;
}

export function watchReading(
  root: HTMLElement,
  tocRoot: HTMLElement,
  headings: DocHeading[],
  opts: DocWatchOptions = {},
): () => void {
  if (headings.length === 0) return () => {};
  const activeClass = opts.activeClass || 'is-here';
  const scroller = opts.scrollRoot || null;
  const idOf = opts.idOf || ((a: HTMLElement) => a.dataset.tocTo || '');
  const links = new Map<string, HTMLElement>();
  tocRoot.querySelectorAll<HTMLElement>(opts.linkSelector || '[data-toc-to]').forEach((a) => links.set(idOf(a), a));

  let ticking = false;
  const mark = (): void => {
    ticking = false;
    /* 화면(또는 상자) 위쪽 이만큼을 「읽는 줄」로 본다 */
    const line = (scroller ? scroller.getBoundingClientRect().top : 0) + 96;
    let here = headings[0].id;
    for (const h of headings) {
      const el = root.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
      if (!el) continue;
      if (el.getBoundingClientRect().top - line <= 0) here = h.id;
      else break;
    }
    links.forEach((a, id) => a.classList.toggle(activeClass, id === here));
  };
  const onScroll = (): void => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(mark);
  };

  const target: Window | HTMLElement = scroller || window;
  target.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  mark();

  return () => {
    target.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

/** 목차 클릭 — 부드럽게 이동하고 주소는 안 건드린다(뒤로가기가 글 밖으로 나가지 않게). */
export function bindTocClicks(tocRoot: HTMLElement, root: HTMLElement, opts: DocWatchOptions = {}): void {
  const sel = opts.linkSelector || '[data-toc-to]';
  const idOf = opts.idOf || ((a: HTMLElement) => a.dataset.tocTo || '');
  const scroller = opts.scrollRoot || null;
  tocRoot.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest(sel) as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    let el: HTMLElement | null = null;
    try {
      el = root.querySelector<HTMLElement>(`#${CSS.escape(idOf(a))}`);
    } catch {
      el = null;
    }
    if (!el) return;
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 10;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
