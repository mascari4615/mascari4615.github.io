/**
 * 언어 단추 + 첫 방문 안내 띠 (TASK-KL-203 S3-b)
 *
 * 두 가지를 판다:
 *  ① 머리띠의 **언어 단추** — 지금 언어 두 글자(`KO`/`EN`)를 보여 주고, 누르면 목록이 내려온다.
 *     고르면 그 언어의 **같은 화면 주소**로 옮겨 간다(화면만 다시 그리지 않는다 — 그러면
 *     새로고침·공유·뒤로가기가 전부 어긋나고, 검색엔진이 보는 문서와 사람이 보는 화면이 갈라진다).
 *  ② **첫 방문 안내 띠** — 브라우저가 원하는 언어가 지금 화면과 다르면 맨 위에 한 줄 뜬다.
 *     자동으로 보내지 **않는다**: 자동 이동은 검색엔진이 한국어 장을 못 읽고 되돌아가게 만들어
 *     그 장이 색인에서 빠질 수 있다. 물어보고, 한 번 닫으면 다시 안 뜬다.
 *
 * 생김새는 스스로 챙긴다 — 단추는 머리띠의 기존 단추 모양(`header-btn`)을 그대로 쓰고,
 * 목록과 띠에 필요한 스타일만 **처음 열릴 때** 넣는다. 공용 스타일 파일을 건드리지 않는 이유:
 * 그 파일은 여러 작업이 동시에 만지는 큰 한 장이라, 거기 끼워 넣은 줄은 통째 덮어쓰기에 조용히
 * 사라진다(이 레포에서 실제로 그랬다). 여기 있는 것은 이 파일과 운명을 같이한다.
 */
import {
  ENABLED_LOCALES,
  locale,
  localeMeta,
  setLocale,
  loadFor,
  tFor,
  t,
  preferredLocale,
  hasExplicitChoice
} from './lib/i18n';
import { REGIONS, region, regionMeta, setRegion } from './lib/region';

/**
 * **이 화면이 실제로 가지고 있는 언어**만 목록에 올린다 (TASK-KL-203 S6).
 *
 * 왜 등록부(켠 언어 전부)를 그대로 쓰면 안 되나: 언어를 켜도 그 화면의 글이 다 차기 전에는
 * 그 언어 장을 안 찍는다(덜 된 장을 그 언어 주소로 올리는 건 안 올린 것보다 나쁘다).
 * 그런데 목록이 등록부를 보면 **아직 없는 장으로 보내 404 가 난다** — 고르자마자 깨지는 단추다.
 *
 * 답은 이미 화면에 있다: 짝 표시(`hreflang`)가 곧 「이 화면이 가진 언어」다. 그건 생성기가
 * 박고 검사가 지키므로, 그걸 읽으면 목록과 실제가 어긋날 수 없다. 짝 표시가 없는 장(아직
 * 한 언어뿐인 도구 상세 등)은 등록부로 떨어진다.
 */
function pageLocales(): typeof ENABLED_LOCALES {
  const tags = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
    .map((el) => el.getAttribute('hreflang'))
    .filter((h): h is string => !!h && h !== 'x-default');
  if (!tags.length) return ENABLED_LOCALES;
  const found = ENABLED_LOCALES.filter((l) => tags.includes(l.htmlLang));
  return found.length ? found : ENABLED_LOCALES;
}

/** 나라 이름을 **지금 화면 말로**. 못 구하면 그 나라 말 이름으로 떨어진다. */
function countryName(code: string, fallback: string): string {
  try {
    const dn = new Intl.DisplayNames([locale()], { type: 'region' });
    return dn.of(code) || fallback;
  } catch {
    return fallback;
  }
}

const STYLE_ID = 'lang-switch-style';
const DISMISS_KEY = 'karmolab_locale_hint_off';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.lang-menu{position:absolute;z-index:2000;min-width:9.5rem;padding:.3rem;border-radius:.6rem;
  background:var(--bg-elev,#1b1b20);border:1px solid var(--border,#33333c);
  box-shadow:0 .5rem 1.5rem rgba(0,0,0,.35);display:flex;flex-direction:column;gap:.1rem}
.lang-menu button{all:unset;cursor:pointer;padding:.45rem .6rem;border-radius:.4rem;
  font-size:.85rem;color:var(--text,#e8e8ee);display:flex;justify-content:space-between;gap:.75rem}
.lang-menu button:hover,.lang-menu button:focus-visible{background:var(--bg-hover,#2a2a33)}
.lang-menu button[aria-current="true"]{font-weight:600}
.lang-menu-head{padding:.35rem .6rem .2rem;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
  opacity:.55;color:var(--text,#e8e8ee)}
.lang-menu-sep{height:1px;margin:.3rem .4rem;background:var(--border,#33333c)}
.lang-menu-note{padding:.3rem .6rem .15rem;font-size:.72rem;line-height:1.45;opacity:.6;
  color:var(--text,#e8e8ee);max-width:15rem;white-space:normal}
.lang-hint{display:flex;align-items:center;gap:.6rem;justify-content:center;flex-wrap:wrap;
  padding:.45rem .8rem;font-size:.85rem;background:var(--bg-elev,#1b1b20);
  border-bottom:1px solid var(--border,#33333c);color:var(--text,#e8e8ee)}
.lang-hint a{color:inherit;text-decoration:underline;text-underline-offset:.15em}
.lang-hint button{all:unset;cursor:pointer;padding:.1rem .45rem;border-radius:.35rem;opacity:.7}
.lang-hint button:hover{opacity:1;background:var(--bg-hover,#2a2a33)}`;
  document.head.appendChild(s);
}

/* ── ① 언어 단추 ────────────────────────────────────── */

let menu: HTMLElement | null = null;

function closeMenu(): void {
  menu?.remove();
  menu = null;
  document.getElementById('langBtn')?.setAttribute('aria-expanded', 'false');
}

function openMenu(btn: HTMLElement): void {
  ensureStyle();
  closeMenu();
  const box = document.createElement('div');
  box.className = 'lang-menu';
  box.setAttribute('role', 'listbox');

  const head = (label: string): void => {
    const h = document.createElement('div');
    h.className = 'lang-menu-head';
    h.textContent = label;
    box.appendChild(h);
  };

  head(t('shell.lang.section', undefined, '언어'));
  const now = locale();
  for (const l of pageLocales()) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-current', String(l.code === now));
    /* 그 언어를 **그 언어 이름으로** 보여 준다 — 「일본어」가 아니라 「日本語」.
       지금 화면 말을 못 읽는 사람이 자기 것을 찾는 유일한 단서다. */
    item.innerHTML = `<span>${l.endonym}</span><span>${l.code === now ? '✓' : ''}</span>`;
    item.addEventListener('click', () => {
      if (l.code === now) return closeMenu();
      setLocale(l.code);
    });
    box.appendChild(item);
  }

  /* ── 지역 — **언어와 다른 축**이라 같은 목록 안에 칸을 나눠 둔다.
     따로 단추를 하나 더 만들지 않는 이유: 둘 다 「나는 누구인가」를 말하는 자리라 사람은 한
     자리에서 찾는다. 대신 **무엇이 바뀌는지 한 줄로 적어 준다** — 안 적으면 나라를 바꿨을 때
     화면이 달라진 이유를 알 수 없다. */
  const sep = document.createElement('div');
  sep.className = 'lang-menu-sep';
  box.appendChild(sep);
  head(t('shell.region.section', undefined, '지역'));

  const nowRegion = region();
  for (const r of REGIONS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-current', String(r.code === nowRegion));
    /* 나라 이름은 **손으로 안 적는다** — `Intl.DisplayNames` 가 지금 화면 말로 모든 나라 이름을
       안다(ko→대한민국 / en→South Korea / ja→韓国). 언어 목록은 반대로 **그 언어 이름**을 쓰는데,
       거기서는 화면 말을 못 읽는 사람이 자기 것을 찾아야 하기 때문이다. 지역은 이미 읽을 수 있는
       말로 화면이 그려진 뒤의 선택이라, 「대한민국」을 못 읽는 사람(=한국 사는 외국인, 이 축을
       만든 이유 그 자체)에게 한글을 던지면 안 된다. */
    const name = r.code === 'XX' ? t('shell.region.other', undefined, '그 밖의 나라') : countryName(r.code, r.endonym);
    item.innerHTML = `<span>${r.flag} ${name}</span><span>${r.code === nowRegion ? '✓' : ''}</span>`;
    item.addEventListener('click', () => {
      if (r.code === nowRegion) return closeMenu();
      setRegion(r.code);
    });
    box.appendChild(item);
  }

  const note = document.createElement('div');
  note.className = 'lang-menu-note';
  note.textContent = t(
    'shell.region.note',
    undefined,
    '단위·공휴일·서류 규격·도구 순서가 이 나라 기준으로 바뀝니다.'
  );
  box.appendChild(note);

  document.body.appendChild(box);
  const r = btn.getBoundingClientRect();
  box.style.top = `${r.bottom + 6 + scrollY}px`;
  /* 오른쪽 끝에 붙은 단추라 왼쪽으로 펼친다 — 그냥 왼쪽 정렬하면 화면 밖으로 나간다. */
  box.style.left = `${Math.max(8, r.right - box.offsetWidth + scrollX)}px`;
  btn.setAttribute('aria-expanded', 'true');
  menu = box;
  setTimeout(() => {
    addEventListener('click', onAway, { once: true });
  }, 0);
}

function onAway(e: MouseEvent): void {
  if (menu && !menu.contains(e.target as Node)) closeMenu();
  else if (menu) setTimeout(() => addEventListener('click', onAway, { once: true }), 0);
}

function mountButton(): void {
  const btn = document.getElementById('langBtn');
  if (!btn) return;
  /* 단추에 **둘 다** 적는다 — 「KO 🇰🇷」. 언어만 적으면 지역이 짐작으로 정해진 것을 아무도
     모르고, 한국 사는 영어 사용자는 자기 화면이 왜 이런지 알 길이 없다. */
  const label = btn.querySelector('.lang-btn-code');
  if (label) label.textContent = `${locale().toUpperCase()} ${regionMeta().flag}`;
  btn.setAttribute('aria-label', t('shell.region.aria', undefined, '언어와 지역'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) closeMenu();
    else openMenu(btn);
  });
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menu) closeMenu();
  });
}

/* ── ② 첫 방문 안내 띠 ──────────────────────────────── */

async function maybeHint(): Promise<void> {
  if (hasExplicitChoice()) return; // 이미 골랐다 — 다시 묻지 않는다
  try {
    if (localStorage.getItem(DISMISS_KEY)) return; // 한 번 닫았다
  } catch {
    /* 저장을 막아 둔 브라우저 — 그냥 띄운다 */
  }
  const want = preferredLocale();
  if (!want || want === locale()) return;

  /* 안내는 **그 언어로** 뜬다 — 그래야 필요한 사람이 읽는다. */
  await loadFor(want, 'shell');
  ensureStyle();

  const bar = document.createElement('div');
  bar.className = 'lang-hint';
  bar.setAttribute('role', 'status');
  const meta = localeMeta(want);
  const go = document.createElement('a');
  go.href = '#';
  go.textContent = tFor(want, 'shell.lang.hintGo');
  go.addEventListener('click', (e) => {
    e.preventDefault();
    setLocale(want);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', tFor(want, 'shell.lang.hintClose'));
  close.addEventListener('click', () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 저장 못 해도 이번 화면에서는 사라진다 */
    }
    bar.remove();
  });
  const text = document.createElement('span');
  text.textContent = `🌐 ${tFor(want, 'shell.lang.hint', { lang: meta.endonym })}`;
  bar.append(text, go, close);
  document.body.insertBefore(bar, document.body.firstChild);
}

function boot(): void {
  mountButton();
  /* 안내는 화면이 다 그려진 뒤에 — 첫 그림을 밀지 않는다. */
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
  const later = () => void maybeHint();
  if (idle) idle(later);
  else setTimeout(later, 400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* 다른 코드가 부를 일이 있을 때를 위해 (언어 이름 정도는 어디서든 쓴다). */
(window as unknown as { KarmoLang?: unknown }).KarmoLang = {
  locale,
  setLocale,
  label: () => localeMeta().endonym,
  t
};
