/**
 * 도구 상세 페이지 생성기 (TASK-KL-088)
 *
 * 왜 필요한가: KarmoLab 은 해시 라우팅(`/karmolab/#charcount`) 이라 도구가 몇 개든 URL 이 하나였다.
 * 검색엔진은 fragment 를 별도 문서로 색인하지 않으므로 도구별 노출 면적이 0 이었다.
 * → 위젯 매니페스트 + data/tools-seo.json 을 짝지어 `/karmolab/t/<id>/` 정적 페이지를 찍는다.
 *   각 페이지는 같은 앱 셸을 쓰되 head(제목·설명·canonical·JSON-LD)와 서버 렌더 설명 블록만 다르다.
 *
 * 입력: index.html (앱 셸 템플릿) · data/tools-seo.json · js/widgets-lazy-meta.js (빌드 산출물)
 * 출력: <out>/<id>/index.html + <out>/index.html (허브)
 *
 * 사용: node scripts/gen-tool-pages.mjs [--out ../blog/karmolab/t]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 셸을 정적 페이지로 만드는 손질은 한 벌뿐이다 (TASK-KL-129) — 목록·봇 소개·프로필도 같은 것을 쓴다.
import { loadShell, shellCommon, replaceMeta, scriptFile, esc } from './lib/shell-page.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const BASE_PATH = '/karmolab/t';

/* 검사(--audit)로 돌 때는 기록 파일을 건드리지 않는다 — 검사가 결과를 바꾸면
   그건 검사가 아니다(다음 검사가 통과해 버린다). */
const NO_STATE = process.env.KARMOLAB_GEN_NO_STATE === '1';
const outArgIndex = process.argv.indexOf('--out');
const outDir = path.resolve(root, outArgIndex >= 0 ? process.argv[outArgIndex + 1] : '../blog/karmolab/t');

/* ── 입력 로드 ─────────────────────────────────────── */

const shell = loadShell(root);
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;

/* 준비물은 **한 장도 쓰기 전에** 다 확인한다.
 * 예전에는 sw.js 확인이 맨 끝에 있어, 페이지 121장을 다 써 놓고 나서야 멈췄다 —
 * 반쯤 만들어진 결과가 남아 다음 사람이 그걸 성한 것으로 착각한다. */
const lazyMetaPath = path.join(root, 'js/widgets-lazy-meta.js');
const swBuiltPath = path.join(root, 'sw.js');
for (const [file, label] of [
  [lazyMetaPath, 'js/widgets-lazy-meta.js'],
  [swBuiltPath, 'sw.js']
]) {
  if (!fs.existsSync(file)) {
    console.error(`[gen-tool-pages] ${label} 없음 — \`npm run build\` 를 먼저 돌려야 합니다.`);
    process.exit(1);
  }
}
/** 빌드된 IIFE 는 window 에 배열을 꽂는다. 파서를 새로 쓰지 않고 그 계약을 그대로 쓴다. */
const fakeWindow = {};
new Function('window', fs.readFileSync(lazyMetaPath, 'utf8'))(fakeWindow);
const widgets = fakeWindow.KARMOLAB_LAZY_META || [];

/* 이 페이지들이 **어느 빌드로 찍혔는지** 를 남긴다.
 * 다른 세션이 앱을 다시 빌드하면 내 로컬 페이지는 그 순간 낡아, 열어 보면 도구가 안 뜬다.
 * 그런데 겉으로는 「도구가 깨졌다」처럼 보여서, 한 번은 없는 결함을 쫓느라 한참을 썼다. */
const BUILD_PRINT = (() => {
  let h = 0;
  const src = fs.readFileSync(lazyMetaPath, 'utf8');
  for (let i = 0; i < src.length; i++) h = (Math.imul(31, h) + src.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
})();
const widgetById = Object.fromEntries(widgets.map((w) => [w.id, w]));

/* ── 교차 검증 (짝 없으면 빌드 실패) ───────────────────── */

const ids = Object.keys(seo);
const orphans = ids.filter((id) => !widgetById[id]);
if (orphans.length) {
  console.error(`[gen-tool-pages] tools-seo.json 에 있으나 위젯 매니페스트에 없는 id: ${orphans.join(', ')}`);
  process.exit(1);
}
for (const id of ids) {
  const t = seo[id];
  for (const field of ['description', 'lead', 'howto', 'faq', 'related']) {
    if (!t[field] || (Array.isArray(t[field]) && !t[field].length)) {
      console.error(`[gen-tool-pages] ${id}: 필수 필드 「${field}」 누락`);
      process.exit(1);
    }
  }
  // layout:'full' 은 페이지 스크롤을 죽인다(.main-content overflow:hidden) → 아래 설명 블록이
  // 화면 밖으로 잘려 크롤러에게도 사용자에게도 안 보인다. 상세 페이지가 있는 도구는 쓸 수 없다.
  // (layout:'full' 은 한때 여기서 막았다. 앱에서 그런 도구는 바깥 스크롤을 꺼서 아래 설명이
  //  잘렸기 때문이다. TASK-KL-089 에서 상세 페이지에 한해 도구 몫의 높이를 정하고 나머지를
  //  흐르게 고쳤으므로 — `tools.css` 의 body.tool-detail 규칙 — 더 막지 않는다.)
  // 「이어지는 도구」가 없는 곳을 가리키는 경우는 두 가지고, 뜻이 전혀 다르다.
  //  ① 매니페스트에 아예 없는 id = 오타 → 여기서 멈춘다.
  //  ② 있지만 숨긴 도구 = 다른 데서 일부러 감춘 것 → 그 링크만 빼고 계속 만든다.
  // 둘을 같이 다루면 도구 하나를 감출 때마다 102장이 통째로 안 만들어진다(실제로 그렇게 멈췄다).
  const typos = t.related.filter((r) => !seo[r] && !widgetById[r]);
  if (typos.length) {
    console.error(`[gen-tool-pages] ${id}: related 가 없는 id 를 가리킨다 — ${typos.join(', ')}`);
    process.exit(1);
  }
  const hiddenRefs = t.related.filter((r) => !seo[r]);
  if (hiddenRefs.length) {
    t.related = t.related.filter((r) => seo[r]);
    console.log(`[gen-tool-pages] ${id}: 숨긴 도구로 가는 링크를 뺐다 — ${hiddenRefs.join(', ')}`);
  }
}

/* ── 유틸 ──────────────────────────────────────────── */

function toolPageUrl(id) {
  return `${SITE}${BASE_PATH}/${id}/`;
}

/**
 * 도구별 공유 카드 (TASK-KL-089). 실물은 저장소에 커밋돼 있고 배포는 복사만 한다.
 *
 * 카드는 폰트가 있는 개발 머신에서 찍으므로, 도구를 추가하고 `npm run gen:og` 를 아직 안 돌린
 * 상태로 배포가 돌 수 있다. 그때 빌드를 세우는 대신 브랜드 공용 카드로 떨어뜨린다 —
 * 없는 그림을 가리켜 카드가 통째로 비는 것이 가장 나쁜 결말이기 때문이다.
 */
const OG_DIR = path.join(root, 'img/og');
const missingOg = [];
function ogImageUrl(id) {
  const has = fs.existsSync(path.join(OG_DIR, `${id}.jpg`));
  if (!has) missingOg.push(id);
  return `${SITE}/apps/karmolab/img/og/${has ? id : 'default'}.jpg`;
}

/** 도구 이름의 단일 정본 = 위젯 매니페스트의 title. 사이드바·페이지 제목이 갈라지지 않게 한다. */
function heading(id) {
  return widgetById[id].title;
}

/**
 * 검색 결과에 뜨는 한 줄 (TASK-KL-089).
 *
 * 이름만 걸어 두면 「글자수 세기」처럼 무엇을 해 주는지가 안 보인다. 이름 뒤에 lead 를 붙여
 * 「공백 포함·제외」 같은 실제로 찾는 말이 결과에 함께 뜨게 한다.
 * 한국어 검색 결과는 대략 서른 글자 남짓에서 잘리므로, 넘칠 것 같으면 이름만 남긴다
 * (억지로 자르면 말이 중간에 끊겨 더 나빠진다).
 */
/* 글자수가 아니라 **폭**으로 잰다 (TASK-KL-089).
 * 검색 결과가 자르는 기준은 글자수가 아니라 가로 폭이다. 한글은 영문·숫자보다 두 배 가까이
 * 넓어서, 글자수로 재면 한글이 많은 제목은 통과했는데 실제로는 잘리고(9개가 그랬다) 영문이
 * 많은 제목은 멀쩡한데도 짧게 깎였다.
 * 아래 두 값은 브라우저로 실제 폭을 재서 맞춘 것이다 — 제목 125개에서 오차가 가장 큰 것도 4.3%.
 * 한도 570px = 흔히 잘리는 600px 에서 그 오차만큼 물러선 값. */
const TITLE_PX_LIMIT = 570;
const WIDE = /[ᄀ-ᇿ　-〿가-힣一-鿿＀-￯]/;
const titleWidth = (s) => [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 18 : 10.25), 0);
function pageTitle(id) {
  const name = heading(id);
  const suffix = ' | KarmoLab';
  const lead = (seo[id].lead || '').trim();
  // lead 는 「A · B · C」 꼴이라, 앞의 한두 조각만 써도 무엇을 하는지 드러난다.
  //
  // 나누는 기준은 **앞뒤에 공백이 있는** 가운뎃점뿐이다. 같은 글자가 「무음·과다입력 경고」처럼
  // 한 낱말 안에서도 쓰이는데, 그것까지 쪼개면 제목에 「무음」 같은 반쪽이 들어간다(실제로 그랬다).
  //
  // 이름에 이미 든 말은 뺀다 — 「타이머 · 스톱워치 — 카운트다운 · 스톱워치」처럼 같은 말이
  // 두 번 나오면 정작 새 정보가 들어갈 자리를 잡아먹는다.
  const parts = lead
    .split(' · ')
    .map((s) => s.trim())
    .filter((s) => s && !name.includes(s));
  for (const take of [2, 1]) {
    const tail = parts.slice(0, take).join(' · ');
    if (!tail) continue;
    const candidate = `${name} — ${tail}${suffix}`;
    if (titleWidth(candidate) <= TITLE_PX_LIMIT) return candidate;
  }
  return `${name}${suffix}`;
}

/* ── 무거운 라이브러리는 쓰는 페이지에만 (TASK-KL-089) ── */

/** 암호 계산 라이브러리(CryptoJS)를 실제로 쓰는 도구 — 묶음으로 들어와도 되도록 부모까지 포함. */
const CRYPTO_TOOLS = (() => {
  const users = ['crypto', 'hashgen'];
  const set = new Set(users);
  for (const u of users) {
    const b = widgetById[u] && widgetById[u].bundle;
    if (b) set.add(b);
  }
  return set;
})();

/* 셸에 손으로 박아 둔 도구 링크가 아직 살아 있는가 (TASK-KL-089).
 * 첫 화면에는 스크립트를 안 돌리는 크롤러만 보는 자리가 있고, 거기에 대표 도구 일곱 개가
 * **손으로** 적혀 있다. 도구 하나가 이름을 바꾸면 그 링크는 죽는데 — 사람 화면에는 안 보이는
 * 자리라 아무도 모른다. 크롤러만 죽은 링크를 밟는, 가장 늦게 들키는 종류의 고장이다.
 * 만들 때 멈춰서 절대 배포로 못 나가게 한다. */
{
  const known = new Set(ids);
  const dead = [...shell.matchAll(/href="\/karmolab\/t\/([a-z0-9-]+)\//g)]
    .map((m) => m[1])
    .filter((id) => !known.has(id));
  if (dead.length) {
    console.error(`[gen-tool-pages] 셸에 적힌 도구 링크가 죽었다 — ${[...new Set(dead)].join(', ')} (index.html 의 크롤러용 목록을 고쳐라)`);
    process.exit(1);
  }
}

/* 암호 계산 라이브러리 태그.
 * 셸이 이걸 미리 싣던 시절에는 상세 페이지에서 **빼는 것**이 이 생성기의 일이었다.
 * 지금은 셸이 필요할 때만 부르므로 뺄 것이 없을 수도 있다 — 그때 멈추면 안 된다.
 * 없으면 없는 대로 넘어간다. 찾을 때는 주소만 본다(속성이 늘어도 계속 맞는다). */
const CRYPTO_TAG_RE = /[ \t]*<script[^>]*src="[^"]*crypto-js[^"]*"[^>]*><\/script>\n?/;
const SHELL_HAS_CRYPTO_TAG = CRYPTO_TAG_RE.test(shell);

/* ── 후원·제휴 자리 (TASK-KL-089) ──────────────────── */

/**
 * 도구 페이지에 자리 하나를 미리 잡아 둔다. 채울 것이 없으면 아무것도 그리지 않는다 —
 * 빈 상자나 「준비 중」 표시는 도구를 쓰러 온 사람에게 방해만 되기 때문이다.
 * 도구 본체 위에는 절대 놓지 않는다. 이 자리는 설명 블록 안, 다 쓰고 읽는 데 있다.
 */
const sponsorSlots = (() => {
  /* 시험용 자리 (TASK-KL-089).
   * 이 자리는 평소 비어 있어서 **코드가 한 번도 안 돈다** — 사고가 고이는 전형적인 곳이다.
   * 게다가 채우는 순간이 하필 돈이 걸린 순간이라, 그때 처음 굴러가면 곤란하다.
   * 그래서 검사가 이 스위치로 가짜 자리를 하나 넣어 매번 실제로 굴려 본다. */
  if (process.env.KARMOLAB_SPONSOR_PREVIEW) {
    return [{ label: '후원', title: '자리 점검용', body: '검사할 때만 뜬다', url: 'https://example.com/' }];
  }
  const file = path.join(root, 'data/sponsor.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).slots || [];
})();

function sponsorBlock(id) {
  const slot = sponsorSlots.find((s) => {
    if (Array.isArray(s.only) && !s.only.includes(id)) return false;
    if (Array.isArray(s.except) && s.except.includes(id)) return false;
    return true;
  });
  if (!slot) return '';

  const label = esc(slot.label || '후원');
  const body = `<strong>${esc(slot.title)}</strong>${slot.body ? `<span>${esc(slot.body)}</span>` : ''}`;
  const inner = slot.url
    ? `<a class="tool-sponsor-link" href="${esc(slot.url)}" rel="sponsored noopener" target="_blank">${body}</a>`
    : `<div class="tool-sponsor-link">${body}</div>`;

  return `
        <aside class="tool-sponsor" aria-label="${label}">
          <span class="tool-sponsor-label">${label}</span>
          ${inner}
        </aside>
`;
}

/* ── 새로 나온 도구 (TASK-KL-089) ───────────────────
 * 도구가 백 가지를 넘으니 「뭐가 새로 생겼나」를 알 길이 없어 다시 올 이유가 줄었다.
 * 처음 본 날을 기록해 두고 최근 것에만 표를 붙인다.
 *
 * 기록은 개발 머신에서 갱신해 커밋한다. 배포 러너에서 갱신해 봐야 남지 않으므로,
 * 거기서는 기록에 없는 도구를 「새것」으로 보지 않는다 — 배포마다 전부 새것이 되는 것을 막는다. */
const SEEN_PATH = path.join(root, 'data/tools-seen.json');
const NEW_DAYS = 14;

/* 도구 자리의 실제 높이 기록 (`measure-tool-heights.mjs` 가 재어 둔다). 없으면 자리를 안 비운다. */
/* 목록에서 찾을 때 같이 걸리는 다른 이름들 — 사람은 「정규식」 만큼이나 「regex」 라고 친다. */
const ALIAS_PATH = path.join(root, 'data/tool-aliases.json');
const ALIASES = fs.existsSync(ALIAS_PATH) ? JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8')).aliases || {} : {};

const HEIGHTS_PATH = path.join(root, 'data/tool-heights.json');
const HEIGHTS = fs.existsSync(HEIGHTS_PATH) ? JSON.parse(fs.readFileSync(HEIGHTS_PATH, 'utf8')) : {};

const seenFile = fs.existsSync(SEEN_PATH) ? JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')) : { seen: {} };
const seen = seenFile.seen || {};
const today = new Date().toISOString().slice(0, 10);
let seenChanged = false;
for (const id of ids) {
  if (!seen[id]) {
    seen[id] = today;
    seenChanged = true;
  }
}
// 사라진 도구는 기록에서도 지운다
for (const id of Object.keys(seen)) {
  if (!ids.includes(id)) {
    delete seen[id];
    seenChanged = true;
  }
}
if (seenChanged && !NO_STATE) {
  seenFile.seen = seen;
  fs.writeFileSync(SEEN_PATH, `${JSON.stringify(seenFile, null, 2)}\n`);
}

/* ── 문구가 마지막으로 바뀐 날 (TASK-KL-089) ────────────
 * 사이트맵에 도구 페이지 119장이 **변경일 없이** 실려 있었다(블로그 글에는 있다). 크롤러는
 * 그 값으로 「다시 와 볼지」를 정하므로, 없으면 매번 전부를 새로 훑거나 아예 안 온다.
 * 페이지 파일 날짜를 쓸 수는 없다 — 배포마다 다시 찍히니 119장이 늘 「오늘 바뀜」이 된다.
 * 그래서 **화면에 실제로 나가는 글자**의 지문을 떠서, 그게 달라진 날만 기록한다. */
const MODIFIED_PATH = path.join(root, 'data/tools-modified.json');
const modifiedFile = fs.existsSync(MODIFIED_PATH)
  ? JSON.parse(fs.readFileSync(MODIFIED_PATH, 'utf8'))
  : { tools: {} };
const modified = modifiedFile.tools || {};

function copyPrint(id) {
  const t = seo[id];
  const text = [
    heading(id),
    t.lead,
    t.description,
    (t.howto || []).join('|'),
    (t.faq || []).map((f) => `${f.q}/${f.a}`).join('|'),
    (t.related || []).join(','),
    ALIASES[id] || ''
  ]
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  // 짧은 지문이면 충분하다 — 같은 글이 다른 지문을 낼 일만 없으면 된다.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

let modifiedChanged = false;
for (const id of ids) {
  const print = copyPrint(id);
  if (!modified[id] || modified[id].print !== print) {
    modified[id] = { print, date: today };
    modifiedChanged = true;
  }
}
for (const id of Object.keys(modified)) {
  if (!ids.includes(id)) {
    delete modified[id];
    modifiedChanged = true;
  }
}
if (modifiedChanged && !NO_STATE) {
  modifiedFile.tools = modified;
  fs.writeFileSync(MODIFIED_PATH, `${JSON.stringify(modifiedFile, null, 2)}\n`);
}

const isNew = (id) => {
  const day = seen[id];
  if (!day) return false;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000;
  return age >= 0 && age < NEW_DAYS;
};

/* ── 서로 잇기 (TASK-KL-089) ───────────────────────── */

/**
 * 손으로 적은 `related` 만으로는 도구끼리 고르게 이어지지 않는다. 실측해 보니 87개 중 42개가
 * 다른 도구 페이지에서 들어오는 링크가 하나 이하였고, 아예 없는 것도 여럿이었다.
 * 목록 페이지에만 걸려 있으면 크롤러가 늦게 찾아가고, 사람도 옆 도구로 건너갈 길이 없다.
 *
 * 그래서 같은 갈래(묶음 → 없으면 분류)의 도구를 몇 개 더 붙이되, **아직 적게 받은 쪽을 먼저**
 * 고른다. 그래야 인기 있는 몇 개로 링크가 쏠리지 않고 전체가 함께 발견된다.
 */
const EXTRA_LINKS = 4;
const inboundCount = Object.fromEntries(ids.map((id) => [id, 0]));
for (const id of ids) for (const r of seo[id].related) if (r in inboundCount) inboundCount[r] += 1;

function kinOf(id) {
  const w = widgetById[id];
  return w.bundle || w.category || '';
}

/** 묶음 부모 → 그 묶음에 속한 도구들. 부모 페이지는 그 갈래의 관문이라 전부 걸어야 한다. */
const partsOf = {};
for (const w of widgets) if (w.bundle && ids.includes(w.id)) (partsOf[w.bundle] ||= []).push(w.id);

const extraLinks = {};
for (const id of ids) {
  // 묶음 부모라면 「같은 갈래 넷」이 아니라 **자기 부분 전부**를 건다.
  // 그러지 않으면 열한 개짜리 묶음에서 셋만 갈 수 있어, 나머지는 목록 페이지 말고는 길이 없다.
  if (partsOf[id] && partsOf[id].length) {
    const own = partsOf[id].filter((p) => p !== id && !seo[id].related.includes(p));
    own.forEach((p) => (inboundCount[p] += 1));
    extraLinks[id] = own;
    continue;
  }
  const kin = kinOf(id);
  const taken = new Set([id, ...seo[id].related]);
  // 묶음에 속한 도구라면 자기 묶음으로 올라가는 길을 먼저 놓는다.
  // 그러지 않으면 묶음 부모는 부분들만 내려다볼 뿐 아무도 걸어 주지 않아 홀로 남는다.
  const parent = widgetById[id].bundle;
  const up = parent && ids.includes(parent) && !taken.has(parent) ? [parent] : [];
  up.forEach((p) => taken.add(p));
  const pool = ids.filter((o) => !taken.has(o) && kinOf(o) === kin);
  // 적게 받은 것 먼저, 같으면 이름순으로 고정해 빌드마다 결과가 흔들리지 않게 한다.
  pool.sort((a, b) => inboundCount[a] - inboundCount[b] || a.localeCompare(b));
  const picked = [...up, ...pool.slice(0, EXTRA_LINKS)];
  picked.forEach((p) => (inboundCount[p] += 1));
  extraLinks[id] = picked;
}

/* ── 도구 상세 페이지 ──────────────────────────────── */

/** 같은 갈래 도구로 건너갈 길 — 이름만 담백하게 건다. */
function kinBlock(id) {
  const kin = extraLinks[id];
  if (!kin || !kin.length) return '';
  const links = kin
    .map((k) => `<a href="${BASE_PATH}/${k}/">${esc(heading(k))}</a>`)
    .join('\n          ');
  const label = partsOf[id] && partsOf[id].length ? '이 묶음의 도구' : '같은 갈래';
  return `
        <nav class="tool-seo-kin" aria-label="${label}">
          <span>${label}</span>
          ${links}
        </nav>
`;
}

/* 아직 재 보지 않은 도구를 위한 어림값 — 재 둔 값들의 중앙값이다.
 * 전에는 기록이 없으면 자리를 아예 안 비웠다. 그러면 새 도구 한 장만 예전처럼 크게 밀린다
 * (실측 0.86). 어림값이라도 넣으면 밀림이 그 차이만큼으로 줄어든다. 물론 정답은 재는 것이고,
 * 검사가 「기록에 없다」로 계속 짚어 준다 — 이건 그때까지의 피해를 줄이는 그물일 뿐이다. */
let fallbackCache = null;
function fallbackHeight() {
  if (fallbackCache !== null) return fallbackCache;
  const mid = (key) => {
    const v = Object.values(HEIGHTS)
      .map((x) => x?.[key])
      .filter(Boolean)
      .sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  fallbackCache = { narrow: mid('narrow'), wide: mid('wide') };
  return fallbackCache;
}

/* 도구가 들어갈 자리를 미리 비워 둔다.
 * 안 그러면 도구가 뜨는 순간 아래 설명글이 통째로 밀려 내려간다 — 읽던 줄이 달아나고
 * 누르려던 버튼이 손가락 밑에서 사라진다. 검색 순위에도 쓰이는 값이라 실측 0.86 이었다.
 * 높이는 `measure-tool-heights.mjs` 가 실제로 재어 둔 값이다. 기록에 없으면 비우지 않는다
 * (틀린 높이로 빈칸을 만드느니 예전 그대로가 낫다). */
function reserveSpace(id) {
  const h = HEIGHTS[id] || fallbackHeight();
  if (!h?.narrow || !h?.wide) return '';
  return (
    `    <style>#tool-pages{min-height:${h.narrow}px}` +
    `@media (min-width:768px){#tool-pages{min-height:${h.wide}px}}</style>\n`
  );
}

/* 이 도구를 달리 부르는 이름들. 사람은 「정규식 테스터」 를 「regex tester」 라고도 찾는데,
 * 페이지 어디에도 그 말이 없으면 그 검색으로는 영영 안 걸린다(실측: 별칭 낱말의 49% 가 없었다).
 * 이미 페이지에 있는 말은 빼고, 없는 것만 한 줄로 보여 준다 — 숨기지 않는다. */
function aliasLine(id, pageText) {
  const raw = ALIASES[id];
  if (!raw) return '';
  const has = pageText.toLowerCase();
  const words = raw.split(/\s+/).filter((w) => w && !has.includes(w.toLowerCase()));
  if (!words.length) return '';
  return `\n        <p class="tool-seo-alias">이렇게도 부른다 — ${esc(words.join(' · '))}</p>`;
}

function seoBlock(id) {
  const t = seo[id];
  const related = t.related
    .map(
      (r) =>
        `<a href="${BASE_PATH}/${r}/">${esc(heading(r))}<span>${esc(seo[r].lead)}</span></a>`
    )
    .join('\n          ');

  return `<section class="tool-seo">
        <nav class="tool-seo-crumb" aria-label="위치">
          <a href="/karmolab/">KarmoLab</a> / <a href="${BASE_PATH}/">도구</a> / ${esc(heading(id))}
        </nav>
        <p>${esc(t.description)}</p>${aliasLine(id, [heading(id), t.lead, t.description, t.howto.join(' '), t.faq.map((f) => f.q + f.a).join(' ')].join(' '))}

        <h2>쓰는 법</h2>
        <ol>
          ${t.howto.map((s) => `<li>${esc(s)}</li>`).join('\n          ')}
        </ol>

        <h2>자주 묻는 질문</h2>
        <dl class="tool-seo-faq">
          ${t.faq.map((f) => `<dt>${esc(f.q)}</dt>\n          <dd>${esc(f.a)}</dd>`).join('\n          ')}
        </dl>

        <h2>다른 도구</h2>
        <div class="tool-seo-related">
          ${related}
        </div>

        <!-- 여기서 바로 다른 도구를 찾는다 (TASK-KL-089).
             지금까지는 도구 한 장에 들어온 사람이 다른 것을 찾으려면 목록으로 건너간 뒤 거기서
             다시 쳐야 했다 — 두 걸음이다. 아래 것은 그냥 form 이라 **스크립트 없이도** 동작한다:
             목록 페이지가 주소에 붙은 검색어를 읽어 그 상태로 열린다. -->
        <form class="tool-seo-find" action="${BASE_PATH}/" method="get" role="search">
          <label for="seoFind-${id}">찾는 도구가 따로 있나요</label>
          <input id="seoFind-${id}" type="search" name="q" placeholder="이름이나 하는 일 (예: PDF, 글자수)" autocomplete="off">
          <button type="submit">찾기</button>
        </form>
${kinBlock(id)}${sponsorBlock(id)}
        <p class="tool-seo-note">
          입력한 내용은 브라우저 안에서만 처리되며 어디에도 저장·전송되지 않습니다.
          <a href="${BASE_PATH}/">도구 전체 목록</a> · <a href="/karmolab/">KarmoLab</a> · <a href="https://github.com/Mascari4615" rel="me">만든 사람</a>
        </p>
      </section>`;
}

function jsonLd(id) {
  const t = seo[id];
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: heading(id),
      url: toolPageUrl(id),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      description: t.description,
      inLanguage: 'ko-KR',
      isPartOf: { '@type': 'WebSite', name: 'KarmoLab', url: `${SITE}/karmolab/` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      /* 아래 넷은 지어내지 않고 이미 가진 사실만 옮긴다 (TASK-KL-089).
       * 그림은 도구마다 찍어 둔 공유 카드, 바뀐 날은 사이트맵에 쓰는 값과 같은 것,
       * 할 수 있는 일은 한 줄 소개를 조각낸 것, 만든 이는 이 사이트다.
       * (별점 같은 건 없으므로 적지 않는다 — 없는 것을 적으면 통째로 무시당한다.) */
      image: `${SITE}/apps/karmolab/img/og/${id}.jpg`,
      dateModified: modified[id].date,
      featureList: (seo[id].lead || '')
        .split(' · ')
        .map((s) => s.trim())
        .filter(Boolean),
      author: { '@type': 'Organization', name: 'KarmoLab', url: `${SITE}/karmolab/` },
      publisher: { '@type': 'Organization', name: 'KarmoLab', url: `${SITE}/karmolab/` }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: t.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KarmoLab', item: `${SITE}/karmolab/` },
        { '@type': 'ListItem', position: 2, name: '도구', item: `${SITE}${BASE_PATH}/` },
        // 분류가 있으면 그 자리도 넣는다 — 화면에 보이는 이동 경로와 같아야 한다.
        ...(GROUP_OF[id]
          ? [{ '@type': 'ListItem', position: 3, name: GROUP_OF[id].title, item: `${SITE}${BASE_PATH}/#${GROUP_OF[id].anchor}` }]
          : []),
        { '@type': 'ListItem', position: GROUP_OF[id] ? 4 : 3, name: heading(id), item: toolPageUrl(id) }
      ]
    }
  ];
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n    ');
}

/** 미리 받을 파일이 실제로 없던 경로 — 다 만든 뒤 한 번에 알린다. */
const missingBoot = new Set();


function buildToolPage(id) {
  const t = seo[id];
  const title = pageTitle(id);
  // 상세 페이지는 그 도구 하나만 보여 준다 (TASK-KL-089).
  // 그런데 앱 첫 화면용 위젯(서버 감시·활동·문서·링크·랜덤 생성기)까지 늘 함께 실려 왔다.
  // 검색으로 들어온 사람에게는 한 번도 쓰이지 않는 것들이라 기다림만 늘린다.
  //
  // 사용자 위젯도 뺀다. 설정 화면을 미리 준비하면서 AI·코드 색칠 라이브러리까지 함께
  // 받아 오는데(107KB), 검색으로 들어온 사람에게 설정 화면은 필요 없다.
  // 대신 헤더의 사용자 단추도 이 페이지에서는 숨긴다 — 눌러도 아무 일 없는 단추를 두지 않으려고.
  //
  // 즐겨찾기도 뺀다. 이 위젯 하나가 링크 목록을 통째로 그려 화면 뒤에 5만 자를 쌓는데,
  // 정작 이 페이지에 보이는 글은 2천 자다. 검색엔진이 읽을 때 무엇에 대한 문서인지 흐려지고,
  // 처음 온 사람에게 남의 즐겨찾기 목록은 쓸모도 없다. 홈에서는 그대로 쓸 수 있다.
  //
  // 상세 페이지에서 먼저 그릴 것은 **그 도구**다. 예전에는 첫 화면용 대시보드를 먼저 받고
  // 그게 끝난 뒤에야 도구를 받아, 느린 기기에서 도구가 3.7초에야 나타났다(실측).
  // 대시보드는 홈으로 갈 때 그때 받으면 된다.
  // 홈은 이 페이지 안에서 바뀌는 화면이 아니라 **다른 주소로 가는 이동**이라, 대시보드는
  // 여기서 받을 이유가 없다. 그 페이지가 자기 것을 받는다.
  /* 부팅 목록에서 **받아 봐야 없는 것**은 뺀다 (TASK-KL-089).
   * 이 목록을 읽는 쪽은 앞머리가 무엇이든 `js/widgets/<경로>.js` 하나로만 찾는다. 그래서
   * `root/gemini` 같은 항목은 매번 404 를 내고 그냥 넘어간다 — 화면은 멀쩡해 보이니 아무도
   * 모른 채였다(이미지 편집 페이지가 그랬다). 어차피 못 받는 항목이니 목록에서 빼면
   * 헛걸음 하나가 사라진다. 정말 필요해질 때는 앱이 제 규칙으로 따로 받아 온다. */
  const declared = widgetById[id]?.lazyScriptPaths?.length ? widgetById[id].lazyScriptPaths : ['dashboard'];
  const bootPaths = declared.filter((p) => {
    const ok = fs.existsSync(path.join(root, scriptFile(p)));
    if (!ok) missingBoot.add(`${id}: ${p}`);
    return ok;
  });

  /* 그 도구 파일을 미리 받기 시작한다 — 앞의 스크립트가 다 끝나기를 기다리지 않는다.
   *
   * 주소를 만드는 규칙은 **앱이 실제로 쓰는 규칙과 같아야 한다** (TASK-KL-089).
   * 여기서는 무조건 `js/widgets/<경로>.js` 로 붙이고 있었는데, 앱은 앞머리가 world/·vendor/·root/
   * 이면 다른 곳에서 찾는다. 그래서 이미지 편집 페이지는 없는 주소를 미리 받으려다 매번
   * 404 를 냈다 — 화면은 멀쩡해서 몇 주를 몰랐다.
   * (부팅 목록·미리 받기·큰제목·안 쓰는 스타일 손질은 `shellCommon` 이 맡는다.) */
  let html = shellCommon(shell, {
    permalink: `${BASE_PATH}/${id}/`,
    lastModified: modified[id].date,
    bootPaths
  });

  html = html.replace('<title>KarmoLab</title>', `<title>${esc(title)}</title>`);
  html = html.replace(
    '<link rel="canonical" href="https://blog.mascari4615.com/karmolab/">',
    `<link rel="canonical" href="${toolPageUrl(id)}">`
  );

  // 암호 계산 라이브러리는 그것을 쓰는 도구의 페이지에만 싣는다 (TASK-KL-089).
  // 앱 첫 화면은 어느 도구로든 갈 수 있어 미리 받아 두지만, 상세 페이지는 갈 곳이 정해져 있다.
  if (SHELL_HAS_CRYPTO_TAG && !CRYPTO_TOOLS.has(id)) {
    html = html.replace(CRYPTO_TAG_RE, '');
  }


  // 예전에는 여기서 세리프 글꼴을 부르는 대목을 지웠다 — 상세 페이지에선 안 쓰이는데 남의 서버
  // 글꼴 목록이 그것 때문에 185KB 늘었기 때문이다. 지금은 지울 필요가 없다 (TASK-KL-128):
  // 글꼴을 우리가 굽고 나서는 `@font-face` 를 적어 두는 것 자체가 0바이트다. 브라우저는 그 글꼴을
  // **실제로 쓰는 글자가 화면에 있을 때만** 파일을 받는다. 안 쓰면 안 받는다.

  /* 검색 결과에 실리는 설명은 대략 155자까지 보인다. 그런데 우리 설명은 절반쯤 되는 것이 많아
   * (중앙 76자, 110장 중 89장이 90자 미만) 그 자리를 비워 뒀다. 한 줄 소개에는 「BMI」 「진법」
   * 처럼 사람들이 실제로 치는 말이 들어 있는데 그게 검색용 설명에는 안 들어가고 있었다.
   * 짧을 때만, 넘치지 않을 때만 뒤에 붙인다. 공유 카드용 문구는 그대로 둔다 — 거기는 짧은 게 낫다. */
  /* 여기도 글자수가 아니라 **폭**으로 잰다 (TASK-KL-089 — 제목에서 겪은 것과 같은 부류).
   * 155자 기준으로 붙이고 있었는데, 한글 155자는 검색 결과 두 줄을 한참 넘는다. 실제로 재 보니
   * 125장 중 52장이 두 줄에 안 들어갔고, 잘려 나간 자리가 하필 「BMI」 「진법」처럼 사람들이
   * 실제로 치는 말을 모아 둔 뒷부분이었다 — 붙여 놓고 안 보여 주고 있었던 셈이다.
   * 아래 두 값은 브라우저로 실제 폭을 재서 맞춘 어림값(설명 125개 최대 오차 4.8%).
   * 한도 1120px = 데스크톱 두 줄(한 줄 약 600px)에서 그 오차만큼 물러선 값. */
  const SNIPPET_PX = 1120;
  const snippetWidth = (s) => [...s].reduce((n, ch) => n + (/[ᄀ-ᇿ　-〿가-힣一-鿿＀-￯]/.test(ch) ? 12 : 7.5), 0);
  /* 전부 붙이거나 하나도 안 붙이거나로 두면, 한 줄 소개가 조금 긴 도구는 뒷말을 통째로 잃고
   * 설명이 예순 몇 자로 얇아진다(그래서 다섯 장이 그랬다). 들어가는 조각까지만 붙인다. */
  const searchDescription = (t.lead || '')
    .split(' · ')
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((acc, piece) => {
      const next = `${acc}${acc.endsWith('.') || acc === t.description ? ' ' : ' · '}${piece}`;
      return snippetWidth(next) <= SNIPPET_PX ? next : acc;
    }, t.description);
  html = replaceMeta(html, 'name', 'description', searchDescription);
  html = replaceMeta(html, 'property', 'og:title', `${heading(id)} | KarmoLab`);
  html = replaceMeta(html, 'property', 'og:description', t.description);
  html = replaceMeta(html, 'property', 'og:url', toolPageUrl(id));
  html = replaceMeta(html, 'name', 'twitter:title', `${heading(id)} | KarmoLab`);
  html = replaceMeta(html, 'name', 'twitter:description', t.description);
  // 도구별 공유 카드 (TASK-KL-089, `scripts/gen-og-images.mjs` 산출물).
  // 셸의 기본값은 파비콘(.ico)이라 메신저·SNS 가 그림 없는 카드를 띄운다 — 도구마다 갈아끼운다.
  // (트위터는 twitter:image 가 없으면 og:image 를 쓰므로 큰 카드 지정만으로 충분하다.)
  html = replaceMeta(html, 'property', 'og:image', ogImageUrl(id));
  html = replaceMeta(html, 'name', 'twitter:card', 'summary_large_image');

  // 카드의 크기·형식·대체 글을 함께 알려 준다 (TASK-KL-089).
  // 크기를 모르면 미리보기를 뒤로 미루거나 건너뛰는 곳이 있어, 링크를 붙인 자리에서
  // 그림이 늦게 뜨거나 아예 안 뜬다. 대체 글은 그림을 못 보는 사람을 위한 것이다.
  const cardMeta = [
    // 카드 위에 뜨는 사이트 이름. 없으면 그 자리에 주소가 그대로 나와 브랜드가 안 보인다.
    `<meta property="og:site_name" content="KarmoLab">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:alt" content="${esc(`${heading(id)} — KarmoLab`)}">`
  ].join('\n    ');
  html = html.replace(
    /(<meta property="og:image" content="[^"]*">)/,
    `$1\n    ${cardMeta}`
  );

  // 상세 페이지 표식 — 앱 히어로(제목·설명)가 아래 설명 블록과 겹쳐 두 번 읽히는 것을 막는다
  html = html.replace('<body>', '<body class="tool-detail">');
  const entry = `<script>window.KARMOLAB_ENTRY_TOOL=${JSON.stringify(id)};window.KARMOLAB_TOOL_PAGES=${JSON.stringify(ids)};window.KARMOLAB_BUILD_PRINT=${JSON.stringify(BUILD_PRINT)};</script>`;
  html = html.replace('</head>', `    ${entry}\n    ${jsonLd(id)}\n${reserveSpace(id)}</head>`);

  /* 첫 화면을 도구가 통째로 차지하는데 그 도구는 스크립트로만 그려진다. 그래서 느린 기기에서는
   * 화면에 뭐라도 나타나기까지 3.7초가 걸렸다(빠른 회선에선 안 보이던 값이다).
   * 제목과 한 줄 소개를 미리 박아 두면 스크립트를 기다리지 않고 바로 읽힌다. */
  html = html.replace(
    '<div class="content-body" id="tool-pages">',
    `${crumbLine(id)}<header class="tool-head">\n            <h1>${esc(heading(id))}</h1>\n            <p>${esc(seo[id].lead)}</p>\n          </header>\n                <div class="content-body" id="tool-pages">`
  );

  const anchor = html.match(/<!-- KARMOLAB_TOOL_SEO[\s\S]*?-->/);
  if (!anchor) throw new Error('셸에 KARMOLAB_TOOL_SEO 앵커가 없음 — index.html 확인');
  html = html.replace(anchor[0], seoBlock(id));

  return html;
}

/* ── 허브 페이지 ───────────────────────────────────── */

/* 목록 페이지가 마지막으로 바뀐 날 (TASK-KL-089).
 * 사이트맵을 실제로 받아 보니 도구 125장에는 변경일이 있는데 **목록만 없었다**. 검색엔진은
 * 그 값으로 다시 올 때를 정하므로, 없으면 도구를 새로 얹어도 목록을 늦게 다시 본다.
 * 목록의 내용은 도구가 늘거나 바뀔 때 함께 바뀌므로, 그 중 가장 최근 날짜를 쓴다. */
function hubModified() {
  const dates = Object.values(modified)
    .map((m) => m && m.date)
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || new Date().toISOString().slice(0, 10);
}

/**
 * 도구를 묶음별로 나눈다.
 *
 * 도구가 40개를 넘으면서 한 줄로 늘어놓으면 읽히지 않는다. 앱에서 묶어 놓은 그대로
 * 소제목을 달아 나눈다 — 목록의 순서가 실제 화면의 구조와 어긋나지 않게 한다.
 * 묶음 정의는 위젯 소스에서 읽는다 (여기 손으로 적으면 갈라진다).
 */
function groupIds() {
  const bundles = [];
  const claimed = new Set();
  for (const dir of ['tools', 'ref']) {
    for (const file of fs.readdirSync(path.join(root, 'src/widgets', dir))) {
      if (!file.endsWith('.ts')) continue;
      const bundleId = file.slice(0, -3);
      const src = fs
        .readFileSync(path.join(root, 'src/widgets', dir, file), 'utf8')
        .split(String.fromCharCode(13, 10))
        .join(String.fromCharCode(10));
      const raw = src.match(/const (?:PARTS|TABS): Array<\[string, string\]> = \[([\s\S]*?)\n  \];/);
      if (!raw) continue;
      const parts = [...raw[1].matchAll(/\['([^']+)', '[^']*'\]/g)]
        .map((m) => m[1])
        .filter((x) => ids.includes(x));
      if (parts.length < 2) continue;
      const title = src.match(/\n    title: '([^']+)'/);
      bundles.push({ title: title ? title[1] : bundleId, parts, bundleId });
      parts.forEach((x) => claimed.add(x));
    }
  }
  // 묶음 자신이 페이지를 가지면 소제목이 그 링크가 된다 → 낱개 목록에서는 뺀다.
  bundles.forEach((b) => claimed.add(b.bundleId));
  const rest = ids.filter((id) => !claimed.has(id));
  bundles.sort((a, b) => b.parts.length - a.parts.length);
  if (rest.length) bundles.push({ title: '그 밖에', parts: rest, bundleId: null });
  return bundles;
}


/* 어느 분류에 속하는지 (TASK-KL-089).
 * 목록 페이지는 도구를 분류로 묶어 보여 주는데, 정작 도구 페이지에는 그 분류가 어디에도
 * 안 적혀 있었다. 사람에겐 「여기가 어디쯤인지」가 없고, 검색엔진에겐 목록의 그 자리로 가는
 * 길이 없다. 묶음 정의는 목록과 같은 것을 쓴다 — 손으로 적으면 둘이 갈라진다. */
const GROUP_OF = (() => {
  const map = {};
  groupIds().forEach((g, i) => {
    const at = { title: g.title, anchor: anchorOf(g), bundleId: g.bundleId };
    g.parts.forEach((x) => (map[x] = at));
    if (g.bundleId) map[g.bundleId] = at;
  });
  return map;
})();

/* 화면에 보이는 이동 경로 (TASK-KL-089).
 * 검색엔진용 이동 경로는 있는데 화면에는 없었다. 그러면 ① 도구 한 장에 떨어진 사람이 위로
 * 올라갈 길이 없고 ② 적어 둔 경로가 화면에 없는 것을 말하는 셈이 된다.
 * 분류 이름은 목록의 그 자리로 바로 보낸다 — 비슷한 도구를 거기서 이어서 만난다. */
function crumbLine(id) {
  const g = GROUP_OF[id];
  const parts = [
    `<a href="/karmolab/">KarmoLab</a>`,
    `<a href="${BASE_PATH}/">도구</a>`,
    ...(g ? [`<a href="${BASE_PATH}/#${g.anchor}">${esc(g.title)}</a>`] : []),
    `<span aria-current="page">${esc(heading(id))}</span>`
  ];
  return `<nav class="tool-crumb" aria-label="위치">${parts.join('<i aria-hidden="true">›</i>')}</nav>
          `;
}

/* 분류를 가리키는 표식은 **순서가 아니라 이름**에서 뽑는다 (TASK-KL-089).
 * 예전에는 위에서부터 g1·g2… 로 붙였다. 그런데 분류는 도구가 많은 순서로 늘어놓으므로,
 * 도구 하나만 더 얹어도 순서가 바뀌고 표식이 통째로 밀린다 — 도구 페이지의 이동 경로도,
 * 목록 맨 위 목차도, 남이 걸어 둔 링크도 그때부터 엉뚱한 분류를 가리킨다.
 * 묶음이 제 이름을 가지면 그것을 쓰고, 없으면 제목에서 한 번 정해지는 값을 만들어 쓴다. */
function anchorOf(g) {
  if (g.bundleId) return `c-${g.bundleId}`;
  let h = 0;
  for (const ch of g.title) h = (Math.imul(31, h) + ch.codePointAt(0)) | 0;
  return `c-${(h >>> 0).toString(36)}`;
}

function buildHub() {
  const card = (id) =>
    `        <a class="tool-hub-card"${ALIASES[id] ? ` data-alias="${esc(ALIASES[id])}"` : ''} href="${BASE_PATH}/${id}/"><strong>${esc(heading(id))}${
      isNew(id) ? '<em class="tool-hub-new">새로 나옴</em>' : ''
    }</strong><span title="${esc(seo[id].lead)}">${esc(seo[id].lead)}</span></a>`;
  // 목록이 모바일에서 열두 화면을 넘는다. 분류로 바로 뛸 수 있게 표식을 달고 위에 목차를 놓는다.
  // 순수 링크라 스크립트가 없어도 그대로 동작한다.
  const groupList = groupIds();
  const cards = groupList
    .map((g, gi) => {
      const anchor = anchorOf(g);
      const head =
        g.bundleId && ids.includes(g.bundleId)
          // 분류마다 몇 개인지 붙인다 — 열여섯 개짜리와 두 개짜리가 섞여 있어 훑을 때 도움이 된다.
          // 걸러 찾을 때는 남은 수로 바뀐다(아래 스크립트가 갱신한다).
          ? `      <h2 class="tool-hub-group" id="${anchor}"><a href="${BASE_PATH}/${g.bundleId}/">${esc(g.title)}</a><span class="tool-hub-count" data-total="${g.parts.length}">${g.parts.length}</span></h2>`
          : `      <h2 class="tool-hub-group" id="${anchor}">${esc(g.title)}<span class="tool-hub-count" data-total="${g.parts.length}">${g.parts.length}</span></h2>`;
      const grid = g.parts.map(card).join(String.fromCharCode(10));
      return [head, '      <div class="tool-hub-grid">', grid, '      </div>'].join(String.fromCharCode(10));
    })
    .join(String.fromCharCode(10));

  const toc =
    '      <nav class="tool-hub-toc" aria-label="분류 바로가기">' +
    groupList.map((g) => `<a href="#${anchorOf(g)}">${esc(g.title)}</a>`).join('') +
    '</nav>';

  // 화면에는 「KarmoLab / 도구」 경로가 있는데 기계가 읽는 쪽에는 없었다 (TASK-KL-089).
  // 도구 상세 페이지에는 넣어 두었으므로 목록 페이지만 빠져 있던 셈이다.
  const crumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KarmoLab', item: `${SITE}/karmolab/` },
      { '@type': 'ListItem', position: 2, name: '도구', item: `${SITE}${BASE_PATH}/` }
    ]
  };

  const collection = {
    '@type': 'CollectionPage',
    name: 'KarmoLab 도구',
    url: `${SITE}${BASE_PATH}/`,
    inLanguage: 'ko-KR',
    hasPart: ids.map((id) => ({
      '@type': 'SoftwareApplication',
      name: heading(id),
      url: toolPageUrl(id),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web'
    }))
  };

  const ld = { '@context': 'https://schema.org', '@graph': [collection, crumb] };

  const HUB_TITLE = '도구 전체 — 텍스트 · 이미지 · 계산 · 개발 | KarmoLab';
  const HUB_DESC = `KarmoLab 의 도구 ${ids.length}가지. 각 도구는 독립된 페이지에서 바로 쓸 수 있고, 입력한 내용은 브라우저를 벗어나지 않습니다.`;

  /* 목록도 **앱 안의 한 화면**이다 (TASK-KL-129).
   *
   * 예전에는 여기만 셸 밖에서 손으로 짠 문서였다. 그래서 도구를 쓰다 「전체 목록」을 누르면
   * 머리띠도 옆줄도 테마 단추도 ⌘K 도 없는 다른 집으로 떨어졌다 — 커뮤니티·광장·도구 상세는
   * 전부 같은 셸 안에 있는데 목록만 밖이었다. 뒤로 가기 말고는 돌아올 길도 없었다.
   * 이제 상세 125장과 같은 셸을 쓴다. 목록의 내용(카드·목차·걸러 찾기)은 여전히 **처음 오는
   * HTML 에 그대로 박혀 있다** — 스크립트가 없어도, 크롤러가 와도 목록은 그대로 보인다.
   * 위젯은 하나도 안 싣는다(부팅 목록이 비어 있다): 이 화면에 그릴 것은 이미 다 적혀 있다. */
  let html = shellCommon(shell, {
    permalink: `${BASE_PATH}/`,
    lastModified: hubModified(),
    bootPaths: []
  });

  html = html.replace('<title>KarmoLab</title>', `<title>${HUB_TITLE}</title>`);
  html = html.replace(
    '<link rel="canonical" href="https://blog.mascari4615.com/karmolab/">',
    `<link rel="canonical" href="${SITE}${BASE_PATH}/">`
  );
  html = replaceMeta(html, 'name', 'description', HUB_DESC);
  html = replaceMeta(html, 'property', 'og:title', HUB_TITLE);
  html = replaceMeta(html, 'property', 'og:description', HUB_DESC);
  html = replaceMeta(html, 'property', 'og:url', `${SITE}${BASE_PATH}/`);
  html = replaceMeta(html, 'name', 'twitter:title', HUB_TITLE);
  html = replaceMeta(html, 'name', 'twitter:description', HUB_DESC);
  // 관문 페이지는 자기 카드를 쓴다 — 커뮤니티에 이 주소를 올릴 때 나가는 그림이다.
  html = replaceMeta(html, 'property', 'og:image', `${SITE}/apps/karmolab/img/og/hub.jpg`);
  html = html.replace(
    /(<meta property="og:image" content="[^"]*">)/,
    `$1
    <meta property="og:site_name" content="KarmoLab">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:alt" content="KarmoLab 도구 목록">`
  );

  /* 이 페이지의 본문은 **이미 여기 적혀 있다** — 앱더러 무엇을 그리라고 시키지 않는다.
   * 셸은 이 표시를 보고 첫 화면(홈)을 그리는 대신 적혀 있는 것을 그대로 둔다.
   * 도구 이름 목록도 같이 준다: 옆줄·머리띠에서 도구를 고르면 그 도구의 제 주소로 옮겨 간다. */
  const entry = `<script>window.KARMOLAB_ENTRY_STATIC="hub";window.KARMOLAB_TOOL_PAGES=${JSON.stringify(ids)};window.KARMOLAB_BUILD_PRINT=${JSON.stringify(BUILD_PRINT)};</script>`;
  html = html.replace(
    '</head>',
    `    ${entry}\n    <script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`
  );
  html = html.replace('<body>', '<body class="tool-hub-page">');

  const hubBody = `<section class="tool-seo tool-hub">
      <nav class="tool-crumb" aria-label="위치"><a href="/karmolab/">KarmoLab</a><i aria-hidden="true">›</i><span aria-current="page">도구</span></nav>
      <!-- 큰제목은 검색엔진이 「이 문서가 무엇인가」로 읽는 자리다. 「도구」 한 단어로는
           목록인지 도구 하나인지도 흐리다. 몇 가지인지까지 담되 숫자는 만들 때 세어 넣는다. -->
      <h1>도구 ${ids.length}가지</h1>
      <p class="tool-seo-lead">삶을 섞고 술을 바꿀 시간.</p>
      <!-- 놀러 온 사람이 도구를 만나고, 도구 쓰던 사람이 놀 이유가 생긴다 (TASK-KL-089). -->
      <p class="tool-hub-quest"><a href="/karmolab/higher/">높은 쪽 고르기</a> · <a href="/karmolab/quest/">오늘의 문제</a> — 놀다 가세요</p>

      <!-- 백 가지가 넘으면 눈으로 훑어 찾기 어렵다. 이름·설명으로 걸러 준다.
           스크립트가 없으면 이 칸만 숨고 목록은 그대로 다 보인다 — 크롤러도 사람도 잃지 않는다. -->
      <div class="tool-hub-find" hidden>
        <input type="search" id="hubFind" aria-label="도구 이름으로 찾기" placeholder="이름이나 하는 일로 찾기 (예: PDF, 글자수)" autocomplete="off">
        <span id="hubFindCount" aria-live="polite"></span>
      </div>
      <!-- 걸러서 하나도 안 남으면 목록이 통째로 사라져 막다른 곳처럼 보인다. 다음 걸음을 알려 준다. -->
      <p class="tool-hub-empty" hidden>찾는 도구가 없습니다. 다른 말로 찾아보거나, 아래에서 전체 목록을 훑어보세요.</p>
      <!-- 늘 쓰는 것은 맨 위에 (TASK-KL-129).
           도구가 125가지라 매번 훑어 내려가야 했다. 즐겨찾기·최근 쓴 것은 이 브라우저가 이미
           알고 있으므로 아래 목록에서 그 카드를 그대로 데려와 앞에 놓는다 — 이름·설명·주소를
           두 벌로 적지 않으므로 갈라지지 않는다. 처음 온 사람에게는 이 줄이 아예 없다. -->
      <section class="tool-hub-mine" hidden aria-label="내가 쓰는 도구">
        <h2 class="tool-hub-group tool-hub-mine-title">내가 쓰는 것</h2>
        <div class="tool-hub-grid tool-hub-mine-grid"></div>
      </section>
${toc}
${cards}
      <p class="tool-seo-note">
        각 도구의 계산은 브라우저 안에서만 이뤄지며 입력한 내용은 저장·전송되지 않습니다.
        <a href="/karmolab/">KarmoLab 전체 보기</a> · <a href="https://github.com/Mascari4615" rel="me">만든 사람</a>
      </p>
    <script data-hub-find>
    (function () {
      var box = document.querySelector('.tool-hub-find');
      var input = document.getElementById('hubFind');
      var count = document.getElementById('hubFindCount');
      if (!box || !input) return;
      box.hidden = false; // 스크립트가 돌 때만 보인다
      var cards = [].slice.call(document.querySelectorAll('.tool-hub-card'));
      var groups = [].slice.call(document.querySelectorAll('.tool-hub-group, .tool-hub-grid'));
      // 카드 글자에 **그 카드가 속한 분류 이름**도 얹는다.
      // 사람은 「개발」 처럼 갈래 이름으로도 찾는데, 카드 글자만 보면 하나도 안 걸렸다.
      var hay = cards.map(function (c) {
        var grid = c.closest('.tool-hub-grid');
        var title = grid && grid.previousElementSibling;
        var groupName = title && title.classList.contains('tool-hub-group') ? title.textContent : '';
        return ((c.textContent || '') + ' ' + groupName + ' ' + (c.getAttribute('data-alias') || '')).toLowerCase();
      });

      // 초성으로도 찾게 한다 — 「ㄱㅈㅅ」 로 글자수 세기를 부르는 식이다.
      var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
      function toCho(s) {
        var out = '';
        for (var i = 0; i < s.length; i++) {
          var code = s.charCodeAt(i);
          if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
          else out += s[i];
        }
        return out;
      }
      var choHay = hay.map(toCho);
      var isChoOnly = function (q) { return q.length > 0 && q.split('').every(function (ch) { return CHO.indexOf(ch) !== -1; }); };
      function apply() {
        var q = input.value.trim().toLowerCase();
        var hit = 0;
        var cho = isChoOnly(q);
        cards.forEach(function (c, i) {
          var ok = !q || (cho ? choHay[i].indexOf(q) !== -1 : hay[i].indexOf(q) !== -1);
          c.style.display = ok ? '' : 'none';
          if (ok) hit++;
        });
        // 분류 제목은 그 아래에 남은 카드가 없으면 같이 숨긴다
        groups.forEach(function (g) {
          if (!g.classList.contains('tool-hub-grid')) return;
          var any = [].slice.call(g.querySelectorAll('.tool-hub-card')).some(function (c) { return c.style.display !== 'none'; });
          g.style.display = any ? '' : 'none';
          var title = g.previousElementSibling;
          if (title && title.classList.contains('tool-hub-group')) {
            title.style.display = any ? '' : 'none';
            var badge = title.querySelector('.tool-hub-count');
            if (badge) {
              var left = [].slice.call(g.querySelectorAll('.tool-hub-card')).filter(function (c2) { return c2.style.display !== 'none'; }).length;
              badge.textContent = q ? left : badge.getAttribute('data-total');
            }
          }
        });
        // 숨은 분류로 가는 목차 링크는 눌러도 갈 곳이 없다 — 같이 숨긴다.
        [].slice.call(document.querySelectorAll('.tool-hub-toc a')).forEach(function (a) {
          var target = document.getElementById(a.getAttribute('href').slice(1));
          var gone = !target || target.style.display === 'none';
          a.style.display = gone ? 'none' : '';
        });
        count.textContent = q ? hit + '개' : '';
        var empty = document.querySelector('.tool-hub-empty');
        if (empty) empty.hidden = !(q && hit === 0);
      }

      /* 늘 쓰는 것을 맨 위로 (TASK-KL-129).
       * 즐겨찾기 → 최근 쓴 것 차례로, 겹치면 한 번만. 아래 목록의 카드를 그대로 복제하므로
       * 이름·설명·주소가 저절로 같다. 하나도 없으면 이 줄은 나타나지 않는다. */
      var mine = document.querySelector('.tool-hub-mine');
      var mineGrid = mine && mine.querySelector('.tool-hub-mine-grid');
      var PIN_KEY = 'toolbox_pinned_tools';
      function readList(key) {
        try {
          var arr = JSON.parse(localStorage.getItem(key) || '[]');
          return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string'; }) : [];
        } catch (e) { return []; }
      }
      /* 「즐겨찾기」에 꽂지 않는 이유 (TASK-KL-129 — 켜 보고 알았다).
       * 그 화면은 **모든 도구를 자동으로 담는다**(실측 202개). 거기에 핀을 하나 더 꽂아 봐야
       * 이미 다 들어 있어 아무 표시도 안 난다 — 「내가 고른 것」이라는 뜻이 성립하지 않는다.
       * 그래서 이 줄은 제 목록을 따로 든다. 뜻이 다른 두 가지를 한 칸에 밀어 넣지 않는다. */
      function readFavIds() { return readList(PIN_KEY); }
      function setFav(id, on) {
        var pins = readList(PIN_KEY).filter(function (x) { return x !== id; });
        if (on) pins.push(id);
        try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch (e) { /* 저장이 막혀 있어도 화면은 돈다 */ }
      }
      if (mineGrid) {
        var byId = {};
        // 주소에서 도구 이름만 떼어 낸다. 여기서 정규식을 쓰면 안 된다 — 이 글은 생성기의
        // 문자열 안에 있어서 역슬래시가 한 번 먹히고, 그 자리에서 **화면 전체가 죽는다**
        // (실제로 그랬다: 걸러 찾기 칸까지 통째로 사라졌다).
        cards.forEach(function (c) {
          var parts = (c.getAttribute('href') || '').split('/').filter(Boolean);
          var id = parts[parts.length - 1];
          if (id) byId[id] = c;
        });
        /* 별을 카드마다 하나씩 단다 — 훑다가 마음에 들면 그 자리에서 「내 것」이 된다.
         * 예전에는 첫 화면까지 가야 켤 수 있어서, 맨 위 줄을 사람이 직접 채울 길이 없었다. */
        function starOf(id) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'tool-hub-star';
          b.setAttribute('data-tool', id);
          b.textContent = '★';
          b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var on = b.getAttribute('aria-pressed') !== 'true';
            setFav(id, on);
            paintStars();
            fillMine();
          });
          return b;
        }
        cards.forEach(function (c) {
          var parts = (c.getAttribute('href') || '').split('/').filter(Boolean);
          var id = parts[parts.length - 1];
          if (id && !c.querySelector('.tool-hub-star')) c.appendChild(starOf(id));
        });

        function paintStars() {
          var on = {};
          readFavIds().forEach(function (id) { on[id] = 1; });
          [].slice.call(document.querySelectorAll('.tool-hub-star')).forEach(function (b) {
            var id = b.getAttribute('data-tool');
            var yes = !!on[id];
            b.setAttribute('aria-pressed', yes ? 'true' : 'false');
            b.title = yes ? '내 것에서 빼기' : '내 것으로 두기';
            b.setAttribute('aria-label', (yes ? '내 것에서 빼기: ' : '내 것으로 두기: ') + id);
          });
        }

        function fillMine() {
          mineGrid.textContent = '';
          var picked = [], seen = {};
          readFavIds().concat(readList('toolbox_recent_tools')).forEach(function (id) {
            if (seen[id] || !byId[id] || picked.length >= 8) return;
            seen[id] = 1;
            picked.push(byId[id]);
          });
          picked.forEach(function (c) {
            var copy = c.cloneNode(true);
            var star = copy.querySelector('.tool-hub-star');
            if (star) star.remove();   // 사본에서는 별을 뺀다 — 같은 별이 두 개면 어느 쪽이 참인지 흐리다
            mineGrid.appendChild(copy);
          });
          mine.hidden = picked.length === 0;
        }

        paintStars();
        fillMine();
      }

      input.addEventListener('input', function () {
        // 걸러 찾는 중에는 이 줄을 접는다 — 찾는 것과 상관없는 카드가 맨 위에 남으면 헷갈린다.
        if (mine && !mine.hidden) mine.style.display = input.value.trim() ? 'none' : '';
        apply();
        // 찾은 결과를 그대로 보낼 수 있게 주소에 남긴다. 뒤로 가기도 자연스러워진다.
        // 목록 페이지의 정식 주소는 따로 박아 두었으므로 검색어가 붙어도 중복으로 세이지 않는다.
        try {
          var url = new URL(location.href);
          if (input.value.trim()) url.searchParams.set('q', input.value.trim());
          else url.searchParams.delete('q');
          history.replaceState(null, '', url);
        } catch (e) { /* 주소를 못 고치는 환경이면 걸러 찾기만 그대로 쓴다 */ }
      });

      // 걸러 놓고 엔터를 누르면 맨 앞 도구로 간다 — 손을 마우스로 옮기지 않아도 끝난다.
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var first = cards.filter(function (c) { return c.style.display !== 'none'; })[0];
        if (first) { e.preventDefault(); location.href = first.getAttribute('href'); }
      });

      // 검색어가 붙은 주소로 들어오면 그 상태에서 시작한다.
      try {
        var q0 = new URL(location.href).searchParams.get('q');
        if (q0) { input.value = q0; apply(); }
      } catch (e) { /* 무시 */ }
    })();
    </script>
    </section>`;

  /* 목록은 **본문 자리**에 들어간다 (TASK-KL-129).
   * 도구 상세는 화면 하나를 도구가 차지하고 그 아래에 설명이 붙지만(그래서 설명 앵커를 쓴다),
   * 목록은 그 자체가 본문이다. 설명 앵커에 넣으면 빈 본문 한 화면을 지나야 목록이 나온다. */
  const anchor = html.match(/<!-- KARMOLAB_TOOL_SEO[\s\S]*?-->/);
  if (!anchor) throw new Error('셸에 KARMOLAB_TOOL_SEO 앵커가 없음 — index.html 확인');
  html = html.replace(anchor[0], '');

  const slot = '<div class="content-body" id="tool-pages"></div>';
  if (!html.includes(slot)) throw new Error('셸에서 본문 자리를 못 찾음 — index.html 확인');
  html = html.replace(slot, `<div class="content-body" id="tool-pages">${hubBody}</div>`);

  return html;
}

/* ── 출력 ──────────────────────────────────────────── */

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const id of ids) {
  const dir = path.join(outDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildToolPage(id), 'utf8');
}
fs.writeFileSync(path.join(outDir, 'index.html'), buildHub(), 'utf8');

/* 도구 이름만 담은 작은 목록 (TASK-KL-089).
 * 없는 도구 주소로 들어온 사람에게 「혹시 이거였나요」를 보여 주려고 쓴다. 도구 하나가
 * 이름을 바꾸거나 사라지면 예전 링크·예전 검색 결과가 전부 그 주소로 오는데, 지금은 통째로
 * 버려진다(들어와도 도구로 가는 링크가 하나뿐인 「없는 쪽」이 뜬다).
 * 설명·자주 묻는 것이 든 큰 파일 대신 이름과 다른 이름만 담아 몇 KB로 끝낸다. */
fs.writeFileSync(
  path.join(outDir, 'tools.json'),
  `---\nlayout: none\npermalink: ${BASE_PATH}/tools.json\n---\n` +
    JSON.stringify(ids.map((id) => [id, heading(id), ALIASES[id] || ''])),
  'utf8'
);

/* Service Worker 를 `/karmolab/sw.js` 로 서비스한다 (TASK-KL-088).
 * SW 의 제어 범위는 자기 URL 경로로 정해진다 — `/apps/karmolab/sw.js` 에 두면 정작 앱이 사는
 * `/karmolab/` 페이지를 제어하지 못한다. Jekyll front matter 로 위치만 옮긴다. */
/**
 * 경로 하나를 실제 파일 자리로 바꾼다 — **앱의 규약과 같아야 한다** (TASK-KL-088).
 * 정본은 `src/toolbox.ts` 의 resolveScriptPath. 여기서 무조건 `js/widgets/` 로 붙이는 바람에
 * `root/gemini` 같은 항목이 「없는 파일」로 걸러졌고, 이미지 편집 페이지는 자기 부팅 목록에서
 * 그 항목이 통째로 빠진 채 나갔다. 버리지 말고 제대로 찾는 것이 맞다.
 * (규약이 늘면 정본과 여기 둘 다 고쳐야 한다 — 갈라져 있는 것이 원래 문제였다.)
 */

const swBuilt = path.join(root, 'sw.js');
if (fs.existsSync(swBuilt)) {
  const parent = path.dirname(outDir);
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(
    path.join(parent, 'sw.js'),
    `---\nlayout: none\npermalink: /karmolab/sw.js\n---\n${fs.readFileSync(swBuilt, 'utf8')}`,
    'utf8'
  );
} else {
  console.error('[gen-tool-pages] sw.js 없음 — `npm run build` 를 먼저 돌려야 합니다.');
  process.exit(1);
}

if (missingOg.length) {
  const uniq = [...new Set(missingOg)];
  console.warn(
    `[gen-tool-pages] 공유 카드 없는 도구 ${uniq.length}개 — 브랜드 기본 카드로 나갑니다: ${uniq.join(', ')}\n` +
      '  → 개발 머신에서 `npm run gen:og` 후 img/og/ 를 커밋하면 도구별 카드가 붙습니다.'
  );
}

if (missingBoot.size) {
  console.warn(`[gen-tool-pages] 부팅 목록에서 뺀 항목 ${missingBoot.size}건 — 파일이 없다: ${[...missingBoot].join(', ')}`);
}
console.log(`[gen-tool-pages] ${ids.length}개 도구 페이지 + 허브 + sw.js 생성 → ${path.relative(process.cwd(), outDir)}`);
