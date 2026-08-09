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
  const now = locale();
  for (const l of ENABLED_LOCALES) {
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
  const label = btn.querySelector('.lang-btn-code');
  if (label) label.textContent = locale().toUpperCase();
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
