/**
 * 말 묶음 빌드 + 검사 (TASK-KL-203)
 *
 * 하는 일 셋:
 *  ① `data/locales.json` → `src/lib/i18n-registry.ts` 를 찍는다 (언어 목록의 유일한 출처).
 *  ② `i18n/<언어>/<묶음>.json` → `js/i18n/<언어>/<묶음>.js` 로 내보낸다.
 *     왜 JS 로 내보내나: 이 앱의 모든 파일은 `<script>` 로 실려 온다 — 서비스 워커의 저장 규칙도,
 *     주소에 판 표식 붙이는 규칙도, 「이 주소가 진짜 있나」 검사도 전부 그 길에만 깔려 있다.
 *     JSON 을 따로 받아오게 만들면 그 셋을 전부 다시 깔아야 하고, 하나만 빠져도 조용히 낡은 글이
 *     남는다. 글은 JSON 으로 쓰고(사람·기계가 다루기 쉬움) 나갈 때만 JS 로 감싼다.
 *  ③ 번역 상태를 잰다 — 빠진 열쇠 · 남는 열쇠 · **낡은 번역**.
 *
 * 낡은 번역이 왜 따로 필요한가: 한국어 문구를 고쳐도 영어 파일은 그대로 남는다. 파일은 다 차
 * 있으니 「빠짐 0」 으로 보이는데 뜻이 어긋난 채로 나간다 — 화면에도 검사에도 안 잡히는 종류다.
 * 그래서 번역할 때 본 **원문의 지문**을 `i18n/.lock.json` 에 남기고, 원문이 바뀌면 그 열쇠를 세운다.
 *
 * 사용:
 *   node scripts/build-i18n.mjs            내보내기 + 상태 표시
 *   node scripts/build-i18n.mjs --check    아무것도 안 쓰고 검사만 (빌드 게이트)
 *   node scripts/build-i18n.mjs --seal     지금 번역이 원문과 맞다고 도장 (원문 지문 갱신)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { APP_ROOT, ALL_LOCALES, LOCALES, DEFAULT_LOCALE, SOURCE_LOCALE } from './lib/locales.mjs';
import { widgetCatalog } from './lib/widgets-meta.mjs';

const CHECK = process.argv.includes('--check');
const SEAL = process.argv.includes('--seal');
const I18N_DIR = path.join(APP_ROOT, 'i18n');
const OUT_DIR = path.join(APP_ROOT, 'js/i18n');
const LOCK_PATH = path.join(I18N_DIR, '.lock.json');

const fingerprint = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 10);

/* ── ① 언어 등록부를 코드로 ─────────────────────────── */

const registryTs = `/**
 * ⚠ 자동 생성 — 손으로 고치지 말 것 (TASK-KL-203).
 * 정본은 \`data/locales.json\` 이고, \`node scripts/build-i18n.mjs\` 가 여기에 찍는다.
 * 어긋나면 \`npm run test:i18n\` 이 잡는다.
 */
export interface LocaleMeta {
  code: string;
  /** 주소 앞머리. 기본 언어는 빈 문자열이다 (기존 주소를 안 깬다). */
  prefix: string;
  htmlLang: string;
  ogLocale: string;
  /** 그 언어를 쓰는 사람이 부르는 이름 — 언어 단추에는 이걸 보여 준다. */
  endonym: string;
  source: boolean;
  enabled: boolean;
}

export const DEFAULT_LOCALE = ${JSON.stringify(DEFAULT_LOCALE)};

export const LOCALES: LocaleMeta[] = ${JSON.stringify(
  ALL_LOCALES.map((l) => ({
    code: l.code,
    prefix: l.prefix,
    htmlLang: l.htmlLang,
    ogLocale: l.ogLocale,
    endonym: l.endonym,
    source: !!l.source,
    enabled: !!l.enabled
  })),
  null,
  2
)};
`;

const registryPath = path.join(APP_ROOT, 'src/lib/i18n-registry.ts');
const registryOld = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : '';
const registryDrift = registryOld.split('\r\n').join('\n') !== registryTs;
if (registryDrift && !CHECK) fs.writeFileSync(registryPath, registryTs, 'utf8');

/* ── ①-b 지역 등록부도 같은 방식으로 ──────────────────
 *
 * 지역은 언어와 **다른 축**이다(언어=쓰는 말, 지역=사는 곳). 나라를 늘리는 자리도 파일 하나
 * (`data/regions.json`) 로 묶어 둔다 — 언어에서 배운 것 그대로다. */

const regionsJson = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data/regions.json'), 'utf8'));
const regionTs = `/**
 * ⚠ 자동 생성 — 손으로 고치지 말 것 (TASK-KL-203 S10).
 * 정본은 \`data/regions.json\` 이고, \`node scripts/build-i18n.mjs\` 가 여기에 찍는다.
 */
export interface RegionMeta {
  code: string;
  /** 그 나라 사람이 부르는 이름 — 지역 단추에 보여 준다. */
  endonym: string;
  flag: string;
  /** 이 나라로 짚어 주는 시간대들. 브라우저는 나라를 안 알려 주지만 시간대는 알려 준다. */
  timeZones: string[];
  measure: 'metric' | 'us';
  currency: string;
  /** 한 주의 첫 요일 (0=일요일). */
  weekStart: number;
  hour12: boolean;
}

export const DEFAULT_REGION = ${JSON.stringify(regionsJson.default)};

export const REGIONS: RegionMeta[] = ${JSON.stringify(regionsJson.regions, null, 2)};
`;

const regionPath = path.join(APP_ROOT, 'src/lib/region-registry.ts');
const regionOld = fs.existsSync(regionPath) ? fs.readFileSync(regionPath, 'utf8') : '';
const regionDrift = regionOld.split('\r\n').join('\n') !== regionTs;
if (regionDrift && !CHECK) fs.writeFileSync(regionPath, regionTs, 'utf8');

/* ── ①-b 도구 글은 이미 있는 파일에서 뽑는다 ───────────
 *
 * 도구 129장의 설명은 `data/tools-seo.json` 에 있고, 그게 **정본이다**. 같은 글을
 * `i18n/ko/tools.json` 에 한 벌 더 적어 두면 그날부터 두 벌이 갈라진다(이 레포에서 여러 번 그랬다).
 * 그래서 원본 언어 묶음은 **적지 않고 뽑는다** — 손으로 고칠 파일은 여전히 `tools-seo.json` 하나다.
 *
 * 지금 뽑는 것 = 검색 결과에 그대로 나가는 두 줄(`description`·`lead`). 사용법·자주 묻는 질문은
 * 4만 자가 넘어 따로 다룬다(그것까지 한 번에 걸면 「덜 찼다」가 영원히 안 풀린다).
 */
const TOOL_FIELDS = ['description', 'lead'];
const seoPath = path.join(APP_ROOT, 'data/tools-seo.json');
const derivedTools = {};
if (fs.existsSync(seoPath)) {
  const tools = JSON.parse(fs.readFileSync(seoPath, 'utf8')).tools;
  for (const [id, body] of Object.entries(tools)) {
    for (const f of TOOL_FIELDS) {
      if (typeof body[f] === 'string' && body[f].trim()) derivedTools[`tools.${id}.${f}`] = body[f];
    }
  }
  const koToolsPath = path.join(I18N_DIR, SOURCE_LOCALE, 'tools.json');
  const next = JSON.stringify(derivedTools, null, 2) + '\n';
  const prev = fs.existsSync(koToolsPath) ? fs.readFileSync(koToolsPath, 'utf8').split('\r\n').join('\n') : '';
  if (prev !== next && !CHECK) {
    fs.mkdirSync(path.dirname(koToolsPath), { recursive: true });
    fs.writeFileSync(koToolsPath, next, 'utf8');
  }
  if (prev !== next && CHECK) {
    console.error('[i18n] i18n/ko/tools.json 이 data/tools-seo.json 과 어긋남 — `npm run build:i18n` 후 커밋');
    process.exit(1);
  }
}

/* ── ①-b-2 「쓰는 법」도 뽑는다 (TASK-KL-203 S8-e) ────
 *
 * 도구 장에서 설명 다음으로 사람이 실제로 읽는 절이다. 안 옮기면 언어 장에서 그 절이 통째로
 * 사라진다 — 원본 언어 글을 영어 주소에 실을 수는 없으니 뺐던 것인데, 빠진 장은 한국어 장보다
 * 얇다(6,348자). 자주 묻는 질문(46,805자)은 훨씬 크므로 **따로 둔다** — 한 묶음에 넣으면
 * 「덜 찼다」가 영원히 안 풀린다(이름/설명을 나눈 것과 같은 규칙).
 */
const derivedHowto = {};
if (fs.existsSync(seoPath)) {
  const tools = JSON.parse(fs.readFileSync(seoPath, 'utf8')).tools;
  for (const [id, body] of Object.entries(tools)) {
    if (!Array.isArray(body.howto)) continue;
    body.howto.forEach((step, i) => {
      if (typeof step === 'string' && step.trim()) derivedHowto[`howto.${id}.${i}`] = step;
    });
  }
  const koHowtoPath = path.join(I18N_DIR, SOURCE_LOCALE, 'howto.json');
  const next = JSON.stringify(derivedHowto, null, 2) + '\n';
  const prev = fs.existsSync(koHowtoPath) ? fs.readFileSync(koHowtoPath, 'utf8').split('\r\n').join('\n') : '';
  if (prev !== next && !CHECK) fs.writeFileSync(koHowtoPath, next, 'utf8');
  if (prev !== next && CHECK) {
    console.error('[i18n] i18n/ko/howto.json 이 data/tools-seo.json 과 어긋남 — `npm run build:i18n` 후 커밋');
    process.exit(1);
  }
}

/* ── ①-b-2 자주 묻는 질문도 같은 길로 ──────────────────
 *
 * `howto` 와 **따로 둔 이유**가 그대로 여기 적용된다: faq 는 훨씬 크고(47,288자 · 질문 467개)
 * 도구마다 3~5개씩 붙어 있다. 한 묶음에 넣으면 「덜 찼다」가 영원히 안 풀린다.
 * 열쇠는 `faq.<도구>.<번호>.q` / `.a` — 질문과 답을 나눠 둬야 **한 쌍이 반만 옮겨진 채**
 * 나가는 일이 없다(장에서는 쌍이 다 있을 때만 그 절을 낸다).
 */
const derivedFaq = {};
if (fs.existsSync(seoPath)) {
  const tools = JSON.parse(fs.readFileSync(seoPath, 'utf8')).tools;
  for (const [id, body] of Object.entries(tools)) {
    if (!Array.isArray(body.faq)) continue;
    body.faq.forEach((pair, i) => {
      if (!pair || typeof pair.q !== 'string' || typeof pair.a !== 'string') return;
      derivedFaq[`faq.${id}.${i}.q`] = pair.q;
      derivedFaq[`faq.${id}.${i}.a`] = pair.a;
    });
  }
  const koFaqPath = path.join(I18N_DIR, SOURCE_LOCALE, 'faq.json');
  const next = JSON.stringify(derivedFaq, null, 2) + '\n';
  const prev = fs.existsSync(koFaqPath) ? fs.readFileSync(koFaqPath, 'utf8').split('\r\n').join('\n') : '';
  if (prev !== next && !CHECK) fs.writeFileSync(koFaqPath, next, 'utf8');
  if (prev !== next && CHECK) {
    console.error('[i18n] i18n/ko/faq.json 이 data/tools-seo.json 과 어긋남 — `npm run build:i18n` 후 커밋');
    process.exit(1);
  }
}

/* ── ①-c 위젯 이름·설명도 등록 파일에서 뽑는다 ─────────
 *
 * 옆줄·목록·⌘K 에 뜨는 도구 **이름**이다. 여기가 한국어면 영어 화면에서 이름만 한국어로 남아
 * 제일 눈에 띈다. 정본은 `src/widgets-lazy-meta.ts` — 여기서도 적지 않고 뽑는다.
 *
 * 이름(`widgets`)과 한 줄 설명(`widgets-desc`)을 **다른 묶음으로** 나눈 이유: 이름은 165개로 짧아
 * 금방 차지만 설명은 그 몇 배다. 한 묶음에 두면 「다 찼나」가 설명에 묶여, 이름이 다 준비돼도
 * 영어 장을 못 찍는다. 차는 속도가 다른 것은 나눠 둔다.
 */
const widgetsAll = widgetCatalog();
const widgetSplit = {
  widgets: Object.fromEntries(Object.entries(widgetsAll).filter(([k]) => k.endsWith('.title'))),
  'widgets-desc': Object.fromEntries(
    Object.entries(widgetsAll)
      .filter(([k]) => k.endsWith('.desc'))
      .map(([k, v]) => [k.replace(/^widgets\./, 'widgets-desc.'), v])
  )
};
for (const [ns, body] of Object.entries(widgetSplit)) {
  /* 갑자기 확 줄면 등록 파일 모양이 바뀐 것이다 — 조용히 비면 영어 화면에 한국어가 되돌아온다. */
  if (Object.keys(body).length < 50) {
    console.error(`[i18n] ${ns} 로 뽑힌 것이 ${Object.keys(body).length}개뿐 — widgets-lazy-meta.ts 모양 확인`);
    process.exit(1);
  }
  const p = path.join(I18N_DIR, SOURCE_LOCALE, ns + '.json');
  const next = JSON.stringify(body, null, 2) + '\n';
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\r\n').join('\n') : '';
  if (prev === next) continue;
  if (CHECK) {
    console.error(`[i18n] i18n/${SOURCE_LOCALE}/${ns}.json 이 widgets-lazy-meta.ts 와 어긋남 — \`npm run build:i18n\` 후 커밋`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, next, 'utf8');
}

/* ── ② 글 묶음 읽기 ─────────────────────────────────── */

/** `i18n/<언어>/` 안의 묶음들. 없는 언어 폴더는 「아직 번역 0」 으로 본다(오류 아님). */
function readLocale(code) {
  const dir = path.join(I18N_DIR, code);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const ns = f.slice(0, -5);
    const body = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    /* 열쇠는 반드시 제 묶음 이름으로 시작한다 — 그래야 `t('a.b')` 만 보고 어느 파일을
       받아와야 하는지 알 수 있다. 이 약속이 깨지면 런타임이 영영 못 찾는다(조용히). */
    for (const k of Object.keys(body)) {
      if (!k.startsWith(ns + '.')) {
        console.error(`[i18n] ${code}/${f}: 열쇠 "${k}" 가 "${ns}." 로 시작하지 않음`);
        process.exit(1);
      }
      if (typeof body[k] !== 'string') {
        console.error(`[i18n] ${code}/${f}: 열쇠 "${k}" 의 값이 글이 아님`);
        process.exit(1);
      }
    }
    out[ns] = body;
  }
  return out;
}

const byLocale = Object.fromEntries(ALL_LOCALES.map((l) => [l.code, readLocale(l.code)]));
const source = byLocale[SOURCE_LOCALE];

/* ── ③ 상태 재기 ────────────────────────────────────── */

const lock = fs.existsSync(LOCK_PATH) ? JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) : {};
const report = [];
let bad = 0;

for (const l of LOCALES) {
  if (l.code === SOURCE_LOCALE) continue;
  const mine = byLocale[l.code];
  const missing = [];
  const extra = [];
  const stale = [];
  for (const [ns, cat] of Object.entries(source)) {
    for (const [k, srcText] of Object.entries(cat)) {
      const has = mine[ns]?.[k];
      if (has == null) {
        missing.push(k);
        continue;
      }
      const sealed = lock[l.code]?.[k];
      if (sealed && sealed !== fingerprint(srcText)) stale.push(k);
    }
  }
  for (const [ns, cat] of Object.entries(mine)) {
    for (const k of Object.keys(cat)) if (source[ns]?.[k] == null) extra.push(k);
  }
  const total = Object.values(source).reduce((n, c) => n + Object.keys(c).length, 0);
  const done = total - missing.length;
  report.push({ code: l.code, total, done, missing, extra, stale });
  /* 빠진 것은 아직 **막지 않는다** — 번역은 화면을 옮겨 가며 조금씩 는다. 막으면 첫날부터
     빌드가 빨갛고, 그러면 사람이 검사를 꺼 버린다. 대신 **낡은 것과 남는 것**은 막는다:
     둘 다 「고쳤는데 반영이 안 된 상태」라 조용히 틀린 글을 내보낸다. */
  if (stale.length || extra.length) bad++;
}

/* ── ④ 내보내기 ─────────────────────────────────────── */

if (!CHECK) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const l of ALL_LOCALES) {
    for (const [ns, cat] of Object.entries(byLocale[l.code])) {
      const dir = path.join(OUT_DIR, l.code);
      fs.mkdirSync(dir, { recursive: true });
      const js =
        `(function(){var S=(window.__KARMO_I18N=window.__KARMO_I18N||{});` +
        `var L=(S[${JSON.stringify(l.code)}]=S[${JSON.stringify(l.code)}]||{});` +
        `L[${JSON.stringify(ns)}]=Object.assign(L[${JSON.stringify(ns)}]||{},${JSON.stringify(cat)});})();\n`;
      fs.writeFileSync(path.join(dir, ns + '.js'), js, 'utf8');
    }
  }
}

if (SEAL) {
  const next = {};
  for (const l of LOCALES) {
    if (l.code === SOURCE_LOCALE) continue;
    next[l.code] = {};
    for (const [ns, cat] of Object.entries(source)) {
      for (const [k, srcText] of Object.entries(cat)) {
        if (byLocale[l.code][ns]?.[k] != null) next[l.code][k] = fingerprint(srcText);
      }
    }
  }
  fs.writeFileSync(LOCK_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log('[i18n] 도장 찍음 — i18n/.lock.json 갱신');
}

/* ── ⑤ 보고 ─────────────────────────────────────────── */

const srcKeys = Object.values(source).reduce((n, c) => n + Object.keys(c).length, 0);
console.log(`[i18n] 원본(${SOURCE_LOCALE}) 열쇠 ${srcKeys}개 · 묶음 ${Object.keys(source).length}개`);
for (const r of report) {
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 100;
  console.log(
    `[i18n] ${r.code}: ${r.done}/${r.total} (${pct}%)` +
      (r.missing.length ? ` · 빠짐 ${r.missing.length}` : '') +
      (r.stale.length ? ` · 낡음 ${r.stale.length}` : '') +
      (r.extra.length ? ` · 남음 ${r.extra.length}` : '')
  );
  for (const k of r.stale.slice(0, 10)) console.log(`         낡음: ${k} (원문이 바뀌었다 — 다시 번역 후 --seal)`);
  for (const k of r.extra.slice(0, 10)) console.log(`         남음: ${k} (원본에 없는 열쇠 — 지워야 한다)`);
}

if (CHECK && registryDrift) {
  console.error('[i18n] src/lib/i18n-registry.ts 가 data/locales.json 과 어긋남 — `npm run build:i18n` 후 커밋');
  process.exit(1);
}
if (CHECK && regionDrift) {
  console.error('[i18n] src/lib/region-registry.ts 가 data/regions.json 과 어긋남 — `npm run build:i18n` 후 커밋');
  process.exit(1);
}
if (bad) {
  console.error('[i18n] 낡거나 남는 번역이 있다 — 위 목록 처리 후 다시');
  process.exit(1);
}
