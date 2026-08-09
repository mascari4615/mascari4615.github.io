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
if (bad) {
  console.error('[i18n] 낡거나 남는 번역이 있다 — 위 목록 처리 후 다시');
  process.exit(1);
}
