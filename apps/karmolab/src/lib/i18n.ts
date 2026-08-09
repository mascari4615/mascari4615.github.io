/**
 * 말 갈아끼우기 — KarmoLab 다국어 바탕 (TASK-KL-203)
 *
 * 왜 있나: 화면에 나가는 글이 전부 코드 안에 한국어로 박혀 있었다. 그 상태로는 언어를 하나
 * 늘릴 때마다 300개 파일을 다시 뒤져야 한다. 그래서 **글을 코드 밖으로 뺀다** — 열쇠(key)로
 * 부르고, 실제 글은 `i18n/<언어>/<묶음>.json` 이 들고 있다.
 *
 * 설계에서 지킨 것 세 가지:
 *
 * ① **기본 언어에 요청을 더 얹지 않는다.** 한국어가 대부분인데 「번역 파일 받아오기」가
 *    첫 그림 앞에 하나 더 붙으면 그건 손해다. 그래서 페이지를 찍을 때 그 화면이 쓸 묶음을
 *    머리말에 **미리 박아** 둔다(`window.__KARMO_I18N`). 받아오기는 *나중에 켜는 위젯*이나
 *    *언어를 바꾼 사람*에게만 일어난다.
 *
 * ② **없으면 조용히 죽지 않는다.** 열쇠가 그 언어에 없으면 원본 언어(한국어)로 떨어지고,
 *    그것도 없으면 열쇠 자체를 돌려준다. 화면에 빈칸이 뜨는 일은 없다. 대신 개발 중에는
 *    콘솔에 크게 남긴다 — 조용한 누락이 제일 나쁘다.
 *
 * ③ **언어 목록은 한 곳에서만 는다.** `data/locales.json` 이 정본이고, 아래 `i18n-registry.ts`
 *    는 그걸로 찍어 낸 것이다(손으로 고치지 말 것 — 검사가 잡는다).
 *
 * 쓰는 법:
 *   import { t, loadNamespace } from '../lib/i18n';
 *   await loadNamespace('charcount');
 *   el.textContent = t('charcount.title');
 *   el.textContent = t('charcount.count', { n: 12 });   // {n} 자리 채우기
 */
import { LOCALES, DEFAULT_LOCALE, type LocaleMeta } from './i18n-registry';

export type { LocaleMeta };
export { LOCALES, DEFAULT_LOCALE };

/** 화면에 나갈 수 있는 언어만 (등록은 됐지만 아직 안 켠 것은 뺀다). */
export const ENABLED_LOCALES: LocaleMeta[] = LOCALES.filter((l) => l.enabled);

/** 이 브라우저가 고른 언어를 적어 두는 자리. 주소에 언어가 없을 때만 쓰인다. */
const PREF_KEY = 'karmolab_locale';

type Catalog = Record<string, string>;
type Store = Record<string, Record<string, Catalog>>;

declare global {
  interface Window {
    __KARMO_I18N?: Store;
    /** 페이지를 찍을 때 박아 두는 값 — 없으면 주소·저장값·브라우저 순으로 정한다. */
    __KARMO_LOCALE?: string;
    KARMOLAB_BUILD_PRINT?: string;
  }
}

const store: Store = (typeof window !== 'undefined' && (window.__KARMO_I18N ||= {})) || {};

/* ── 지금 언어 ──────────────────────────────────────── */

function fromPath(pathname: string): string | null {
  for (const l of ENABLED_LOCALES) {
    if (!l.prefix) continue;
    if (pathname === l.prefix || pathname.startsWith(l.prefix + '/')) return l.code;
  }
  return null;
}

/**
 * 브라우저가 원하는 언어 중 **우리가 켠 것** 첫 번째.
 * `ja-JP` 처럼 지역이 붙어 와도 앞부분으로 맞춘다 — 지역별로 글을 따로 두지 않기 때문이다.
 */
function fromNavigator(): string | null {
  const wanted = (typeof navigator !== 'undefined' && navigator.languages) || [];
  for (const raw of wanted) {
    const base = String(raw).toLowerCase().split('-')[0];
    const hit = ENABLED_LOCALES.find((l) => l.code === base);
    if (hit) return hit.code;
  }
  return null;
}

let current: string | null = null;

/**
 * 지금 언어. 순서 = **주소 > 고른 값 > 브라우저 > 기본**.
 *
 * 주소가 제일 세다: `/en/…` 을 공유받은 사람은 자기 브라우저가 한국어여도 영어를 봐야 한다
 * (그 주소가 검색엔진에 영어 문서로 올라가 있다).
 */
export function locale(): string {
  if (current) return current;
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  current =
    window.__KARMO_LOCALE ||
    fromPath(location.pathname) ||
    safeGet(PREF_KEY) ||
    fromNavigator() ||
    DEFAULT_LOCALE;
  if (!ENABLED_LOCALES.some((l) => l.code === current)) current = DEFAULT_LOCALE;
  return current;
}

export function localeMeta(code: string = locale()): LocaleMeta {
  return LOCALES.find((l) => l.code === code) || LOCALES.find((l) => l.code === DEFAULT_LOCALE)!;
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

/* ── 주소 갈아끼우기 ────────────────────────────────── */

/** 언어 앞머리를 떼어 낸 알맹이 주소 (`/en/karmolab/t/qr/` → `/karmolab/t/qr/`). */
export function stripPrefix(pathname: string): string {
  const code = fromPath(pathname);
  if (!code) return pathname;
  const meta = localeMeta(code);
  const rest = pathname.slice(meta.prefix.length);
  return rest.startsWith('/') ? rest : '/' + rest;
}

/** 같은 화면의 다른 언어 주소. 사이트맵·hreflang·언어 단추가 전부 이걸 쓴다. */
export function localizedPath(pathname: string, code: string): string {
  const bare = stripPrefix(pathname);
  const meta = localeMeta(code);
  return meta.prefix ? meta.prefix + bare : bare;
}

/**
 * 언어를 바꾼다 — 고른 값을 적어 두고 **그 언어의 같은 화면**으로 옮긴다.
 *
 * 화면만 다시 그리지 않고 주소까지 옮기는 이유: 그래야 새로고침·공유·뒤로가기가 전부 맞고,
 * 검색엔진이 보는 문서와 사람이 보는 화면이 같아진다(한쪽만 바꾸면 그 둘이 갈라진다).
 */
export function setLocale(code: string): void {
  try {
    localStorage.setItem(PREF_KEY, code);
  } catch {
    /* 저장을 막아 둔 브라우저 — 주소로만 간다 */
  }
  location.href = localizedPath(location.pathname, code) + location.search + location.hash;
}

/* ── 글 묶음 받아오기 ───────────────────────────────── */

const pending = new Map<string, Promise<void>>();

function catalogUrl(code: string, ns: string): string {
  const tag = (typeof window !== 'undefined' && window.KARMOLAB_BUILD_PRINT) || '';
  return `/apps/karmolab/js/i18n/${code}/${ns}.js` + (tag ? `?b=${tag}` : '');
}

function have(code: string, ns: string): boolean {
  return !!store[code]?.[ns];
}

function inject(code: string, ns: string): Promise<void> {
  const key = code + '/' + ns;
  const already = pending.get(key);
  if (already) return already;
  const p = new Promise<void>((resolve) => {
    const s = document.createElement('script');
    s.src = catalogUrl(code, ns);
    /* 못 받아도 resolve 한다 — 글이 없다고 도구가 멈추면 안 된다.
       그 경우 t() 가 원본 언어로 떨어지고, 그것도 없으면 열쇠를 보여 준다. */
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  pending.set(key, p);
  return p;
}

/**
 * 이 묶음의 글을 쓸 수 있게 만든다.
 *
 * 이미 머리말에 박혀 있으면 **아무 일도 안 하고 바로 끝난다**(기본 언어의 보통 경우).
 * 원본 언어 묶음도 같이 챙긴다 — 번역이 아직 덜 된 열쇠가 있으면 그쪽으로 떨어져야 하는데,
 * 떨어질 곳이 없으면 열쇠가 그대로 화면에 나온다.
 */
export async function loadNamespace(ns: string): Promise<void> {
  const code = locale();
  const jobs: Promise<void>[] = [];
  if (!have(code, ns)) jobs.push(inject(code, ns));
  if (code !== DEFAULT_LOCALE && !have(DEFAULT_LOCALE, ns)) jobs.push(inject(DEFAULT_LOCALE, ns));
  if (jobs.length) await Promise.all(jobs);
}

/**
 * **다른 언어**의 묶음을 받아온다 — 지금 언어가 아니라 지정한 언어.
 *
 * 왜 필요한가: 「English version available」 안내는 **영어로** 떠야 한다. 한국어 화면에 한국어로
 * 「영어 판이 있습니다」라고 띄우면, 정작 그 안내가 필요한 사람(한국어를 못 읽는 사람)이 못 읽는다.
 */
export async function loadFor(code: string, ns: string): Promise<void> {
  if (!have(code, ns)) await inject(code, ns);
}

/** 지정한 언어로 글 하나. 없으면 열쇠를 그대로 돌려준다(그 언어 묶음이 아직 안 왔을 때). */
export function tFor(code: string, key: string, vars?: Record<string, string | number>): string {
  const [ns] = split(key);
  const raw = store[code]?.[ns]?.[key];
  if (typeof raw !== 'string') return t(key, vars);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** 브라우저가 원하는 언어 중 우리가 켠 것 — 안내를 띄울지 정하는 데 쓴다. */
export function preferredLocale(): string | null {
  return fromNavigator();
}

/** 이 브라우저가 언어를 직접 고른 적이 있나 (있으면 안내로 다시 묻지 않는다). */
export function hasExplicitChoice(): boolean {
  return !!safeGet(PREF_KEY);
}

/** 여러 묶음을 한꺼번에 (도구 하나가 공용 묶음까지 쓰는 경우). */
export function loadNamespaces(...names: string[]): Promise<void> {
  return Promise.all(names.map(loadNamespace)).then(() => undefined);
}

/* ── 글 꺼내기 ──────────────────────────────────────── */

/** 열쇠는 `묶음.이름` 이다. 앞의 한 조각이 곧 파일 이름이 된다. */
function split(key: string): [string, string] {
  const i = key.indexOf('.');
  return i < 0 ? ['common', key] : [key.slice(0, i), key];
}

const warned = new Set<string>();

/** `{이름}` 자리를 채운다 — 글을 찾은 경우와 기본값을 쓰는 경우가 같은 규칙이어야 한다. */
function fill(raw: string, vars: Record<string, string | number>): string {
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function lookup(key: string): string | null {
  const [ns] = split(key);
  const code = locale();
  const mine = store[code]?.[ns]?.[key];
  if (typeof mine === 'string') return mine;
  const src = store[DEFAULT_LOCALE]?.[ns]?.[key];
  if (typeof src === 'string') {
    if (code !== DEFAULT_LOCALE && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] ${code} 에 없어 ${DEFAULT_LOCALE} 로 떨어짐: ${key}`);
    }
    return src;
  }
  return null;
}

/**
 * 글 하나. `{이름}` 자리는 `vars` 로 채운다.
 *
 * 자리 채우기를 문자열 이어붙이기로 안 하는 이유: 언어마다 **말의 순서가 다르다**.
 * 「3개 남음」과 「3 left」는 순서가 같지만, 「방금 전」·「3 minutes ago」처럼 조각을 앞뒤로
 * 옮겨야 하는 말이 많다. 한 문장을 통째로 열쇠 하나에 두고 자리만 뚫어야 번역이 가능해진다.
 */
export function t(key: string, vars?: Record<string, string | number>, fallback?: string): string {
  const raw = lookup(key);
  if (raw == null) {
    /**
     * **아직 안 받아온 자리를 위한 대비책** (TASK-KL-203 S9-b).
     *
     * 대부분의 글은 「받아온 뒤에 그린다」로 해결된다. 그런데 **도구를 등록하는 순간** 쓰이는
     * 글이 하나 있다 — 탭 이름이다. 등록은 파일이 실려 오자마자 일어나므로 기다릴 자리가 없다.
     * 그 언어 장에는 말이 머리말에 박혀 있어 바로 찾지만, 한국어 화면에는 아무것도 안 박는다
     * (원본 언어라 박을 이유가 없다) — 그래서 그 자리만 열쇠 이름이 뜬다.
     *
     * 부르는 쪽이 원본 글을 함께 주면 그 문제가 사라진다. 열쇠는 이미 묶음에 있으므로
     * 「안 빼낸 글」이 아니다 — 기다릴 수 없는 자리의 **기본값**이다.
     */
    if (fallback != null) return vars ? fill(fallback, vars) : fallback;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] 없는 열쇠: ${key}`);
    }
    return key;
  }
  return vars ? fill(raw, vars) : raw;
}

/**
 * 개수에 따라 말이 갈리는 글. 열쇠 뒤에 `.one` · `.other` 를 붙여 둔다.
 *
 * 한국어는 갈리지 않지만 영어는 갈리고(1 item / 2 items), 언어마다 갈리는 가짓수도 다르다
 * (러시아어는 셋). 그래서 우리가 세지 않고 브라우저의 `Intl.PluralRules` 에 묻는다 —
 * 언어를 늘릴 때 규칙을 새로 짤 일이 없다.
 */
export function tn(key: string, n: number, vars?: Record<string, string | number>): string {
  let form = 'other';
  try {
    form = new Intl.PluralRules(locale()).select(n);
  } catch {
    /* 아주 오래된 브라우저 — other 로 간다 */
  }
  const withForm = lookup(`${key}.${form}`) != null ? `${key}.${form}` : `${key}.other`;
  return t(withForm, { n, ...vars });
}

/* ── 숫자·날짜·목록 ─────────────────────────────────── */

/* 이것들도 언어마다 다르다 — 1,234.5 / 1.234,5 / 2026년 8월 9일 / August 9, 2026.
   손으로 찍지 말고 브라우저에 맡긴다. 표준 도구라 새 언어에 공짜로 따라온다. */

export function fmtNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), opts).format(n);
}

export function fmtDate(d: Date | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale(), opts || { dateStyle: 'medium' }).format(d);
}

export function fmtList(items: string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  /* `Intl.ListFormat` 은 우리가 세운 TS 목표(ES2020)의 타입에 아직 없다. 브라우저에는 다 있다 —
     목표를 통째로 올리면 다른 파일 300개가 같이 흔들리므로 여기서만 있다고 알려 준다.
     없는 브라우저면 아래 catch 가 받는다. */
  const LF = (Intl as unknown as { ListFormat?: new (l: string, o: unknown) => { format(x: string[]): string } })
    .ListFormat;
  try {
    if (LF) return new LF(locale(), { type }).format(items);
  } catch {
    /* 아래로 */
  }
  return items.join(', ');
}

/** 「3분 전」 같은 상대 시각. 기준 시각과의 차이로 알아서 단위를 고른다. */
export function fmtRelative(from: Date | number, now: Date | number = Date.now()): string {
  const diff = (new Date(from).getTime() - new Date(now).getTime()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ];
  try {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    for (const [unit, secs] of units) {
      if (Math.abs(diff) >= secs || unit === 'second') return rtf.format(Math.round(diff / secs), unit);
    }
  } catch {
    /* 지원 안 하면 아래로 */
  }
  return fmtDate(from);
}
