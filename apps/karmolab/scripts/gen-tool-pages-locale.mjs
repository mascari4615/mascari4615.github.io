/**
 * 도구 상세 장의 **언어 판** 찍기 (TASK-KL-203 S4-b)
 *
 * 왜 원본 생성기를 고치지 않고 따로 두나: `gen-tool-pages.mjs` 는 1,200 줄이고 **배포 길목**에
 * 서 있다 — 거기서 한 군데만 어긋나면 도구 129장이 통째로 안 찍히고 배포가 선다(이 레포에서
 * 실제로 세 시간 막힌 적이 있다). 언어 판은 「이미 찍힌 한국어 장을 그 언어로 옮긴 것」이므로,
 * 그 장을 **입력으로 받아** 여기서 다시 쓴다. 이 파일이 죽어도 한국어 장과 배포는 멀쩡하다.
 *
 * 옮기는 것 / 빼는 것:
 *  - 옮긴다 = 제목(`widgets`) · 설명과 한 줄(`tools`) · 라벨(`toolpage`) · 머리말 전부(언어·주소·
 *    짝 표시·공유 카드) · 도구 이름 표. 셋 다 3개 언어 100% 라 빠짐이 없다.
 *  - **뺀다 = 「쓰는 법」·「자주 묻는 질문」·「다른 곳과 뭐가 다른가」·「이렇게도 부른다」.**
 *    그 본문 45,603자는 아직 안 옮겼다. 원본 언어 글을 영어 주소에 그대로 실으면 그 장이
 *    「영어라고 적힌 한국어 문서」가 된다 — 없는 절보다 나쁘다. 없는 절은 고장이 아니다:
 *    제목·설명·한 줄·도구 자체·구조 설명이 다 있는 완성된 한 장이다. FAQ 구조 설명(JSON-LD)도
 *    같이 뺀다 — 없는 절을 있다고 알리면 검색엔진에 거짓을 말하는 것이다.
 *
 * 사용: node scripts/gen-tool-pages-locale.mjs [--src ../blog/karmolab/t] [--out ../blog] [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCALES,
  DEFAULT_LOCALE,
  SOURCE_LOCALE,
  tr,
  pageAvailable,
  localizedPath
} from './lib/locales.mjs';
import { toLocalePage, addAlternatesToSource } from './lib/locale-page.mjs';
import { toLocaleHub } from './lib/locale-hub.mjs';
import { withoutRetired, RETIRED_OPERATION_IDS } from './lib/retired-operations.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const CHECK = process.argv.includes('--check');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const srcDir = path.resolve(root, arg('--src', '../blog/karmolab/t'));
const outRoot = path.resolve(root, arg('--out', '../blog'));

/**
 * 이 언어로 낼 수 있나 = **뼈대**와 **항목**을 따로 본다.
 *
 * `toolpage` 는 장 전체의 뼈대(머리·꼬리·안내문)라 하나라도 비면 반쪽짜리 장이 나간다 → 100%.
 * `widgets`·`tools` 는 **도구 한 개당 한 줄**이다. 여기에 100% 를 걸면 누가 도구를 하나 새로
 * 만들어 넣는 순간(그 사람은 번역을 모른다) **영어·일본어 장 258 장이 통째로 안 찍힌다** —
 * 실제로 그렇게 됐다(즐겨찾기·링크트리 두 줄에 전부 멈춤, 그런데 종료값은 0 이라 아무도 모름).
 * 그래서 항목 묶음은 `ITEM_COVERAGE_MIN`. 안 옮겨진 도구 한 개는 그 도구 장에서만 원문으로 남는다.
 * (겉 장 `locale-page.mjs` 는 이미 이 규칙이다 — 같은 규칙이 두 생성기에 따로 살아 있었다.)
 */
const SKELETON = ['toolpage'];

/* 「내가 넣은 것이 이 기기를 떠나는가」 — 판정은 한국어 장과 **같은 파일**에서 읽는다
 * (`data/tool-privacy.json`, TASK-KL-352). 여기서 뜻을 새로 지으면 두 벌이 되어 갈라진다.
 *
 * 갈래 이름과 안내 문장은 말 묶음에서 옮겨 오고, 도구마다 다른 상세(`sends`)는 한국어뿐이라
 * **다른 언어 장에서는 안 찍는다** — 옮기지 않은 한국어를 그대로 박아 두는 것보다,
 * 갈래와 가는 곳(주소는 어차피 만국 공통)까지만 정확히 말하는 편이 낫다. */
const privacy = JSON.parse(fs.readFileSync(path.join(root, 'data/tool-privacy.json'), 'utf8'));

function privacyNote(id, code) {
  const verdict = privacy.tools[id];
  const where = verdict?.where || privacy.default;
  const label = tr(code, `toolpage.privacy.label.${where}`);
  const note = tr(code, `toolpage.privacy.note.${where}`);
  const to = verdict?.to?.length
    ? `
          <p class="tool-privacy-to">${esc(tr(code, 'toolpage.privacy.to'))} — ${esc(verdict.to.join(' · '))}</p>`
    : '';
  /* 한국어 장과 같은 이유로 `<div>` 다 — 여기서 `<section>` 을 쓰면 이 생성기가 스스로
     끊어 읽는 자리를 하나 더 만든다. */
  return `        <div class="tool-privacy" role="note" data-where="${esc(where)}">
          <p class="tool-privacy-lead"><span class="tool-privacy-badge">${esc(label)}</span> ${esc(note)}</p>${to}
        </div>`;
}

const ITEMS = ['widgets', 'tools'];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

if (!fs.existsSync(srcDir)) {
  /* 아직 한국어 장이 안 찍혔다 = 이 검사의 **대상이 없다**. 「못 돈다」와 「실패」는 다르다 —
     여기서 빨간불을 내면 첫 빌드가 영원히 안 넘어간다. */
  console.log(`[tool-pages-locale] 한국어 도구 장이 아직 없다 (${path.relative(root, srcDir)}) — 건너뜀`);
  process.exit(0);
}

/* 작업대로 합친 옛 도구의 자리는 **한 장짜리 안내**다(도구 장이 아니다) — 여기서 언어 판을
   만들 이유가 없다. 그 자리는 언어와 무관하게 작업대로 보내면 된다.
   (예전에는 옆줄의 언어 링크 칸이 없다고 죽어서 배포가 섰다 — 그 장치는 2026-08-20 에 없앴다.) */
const ids = withoutRetired(
  fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(srcDir, e.name, 'index.html')))
    .map((e) => e.name)
);

const L = makeLocalizer(ids);

const codes = LOCALES.filter((l) =>
  pageAvailable(l.code, { namespaces: SKELETON, itemNamespaces: ITEMS })
).map((l) => l.code);
const targets = codes.filter((c) => c !== DEFAULT_LOCALE);

/* ── 한 장을 그 언어로 ──────────────────────────────── */

/**
 * **그 언어 판이 실제로 있는 주소만** 앞머리를 붙인다 (TASK-KL-203 S4-b 후속).
 *
 * 처음에는 `/karmolab` 으로 시작하는 링크를 전부 `/en/karmolab…` 으로 바꿨다. 그 순간 도구 장
 * 258개가 **없는 주소를 가리키기 시작했다** — 목록(`/en/karmolab/t/`)·봇 소개(`/en/karmolab/bot/`)·
 * 변경 기록(`/en/karmolab/changes.xml`) 은 아직 그 언어로 안 찍는다. 링크는 눌러 보기 전에는
 * 멀쩡해 보이고, 눌러야 404 다.
 *
 * 규칙: **없는 곳으로는 안 보낸다.** 그 언어 판이 없는 주소는 원래(한국어) 주소 그대로 둔다 —
 * 언어가 한 번 되돌아가는 건 불편이지만, 없는 문을 여는 건 고장이다. 그 장을 그 언어로 찍기
 * 시작하면 아래 목록에 한 줄 늘고 링크도 저절로 따라온다.
 */
function makeLocalizer(ids) {
  /* 목록(허브)도 이 실행에서 같이 찍으므로 처음부터 목록에 넣는다. */
  const localized = new Set(['/karmolab/', '/karmolab/t/', ...ids.map((id) => `/karmolab/t/${id}/`)]);
  return {
    has: (bare) => localized.has(bare),
    /** 그 언어 판이 있으면 앞머리를 붙인 주소, 없으면 원래 주소. */
    href: (bare, code) => (localized.has(bare) ? localizedPath(bare, code) : bare),
    apply(html, code) {
      /* **언어 링크는 건드리지 않는다** (TASK-KL-244). 이 함수는 `/karmolab/...` 주소에
         이 장의 언어 앞머리를 붙이는데, 「한국어로 보기」 링크에까지 붙이면 그 링크가
         자기 자신을 가리키게 된다 — 영어 장의 한국어 단추가 영어 장으로 가는 상태가 됐었다.
         `hreflang` 이 붙은 `<a>` = 어느 말로 갈지 이미 정해진 링크라는 뜻이므로 통과시킨다. */
      return html.replace(/<a\s[^>]*>|href="(\/karmolab[^"]*)"/g, (whole, bare) => {
        if (whole.startsWith('<a')) {
          if (/hreflang=/.test(whole)) return whole;
          return whole.replace(/href="(\/karmolab[^"]*)"/, (w, b) =>
            localized.has(b) ? `href="${localizedPath(b, code)}"` : w
          );
        }
        return localized.has(bare) ? `href="${localizedPath(bare, code)}"` : whole;
      });
    }
  };
}

/** 그 도구의 질문·답이 **그 언어에 다 있으면** 쌍 목록을, 하나라도 없으면 빈 목록을 준다. */
function faqPairs(id, code) {
  const out = [];
  for (let i = 0; ; i++) {
    const kq = `faq.${id}.${i}.q`;
    const ka = `faq.${id}.${i}.a`;
    const koQ = tr(SOURCE_LOCALE, kq);
    if (!koQ || koQ === kq) break;
    const koA = tr(SOURCE_LOCALE, ka);
    const q = tr(code, kq);
    const a = tr(code, ka);
    if (!q || q === kq || q === koQ || !a || a === ka || a === koA) return [];
    out.push({ q, a });
  }
  return out;
}

function toolSeoSection(id, code, sourceHtml) {
  const title = tr(code, `widgets.${id}.title`);
  const desc = tr(code, `tools.${id}.description`);

  /* 「다른 도구」는 원본 장에서 **id 만** 뽑아 다시 짓는다 — 이름과 한 줄을 그 언어로 갈아야
     하는데, 원본 HTML 안의 글자를 짜깁기하면 언젠가 모양이 바뀌어 조용히 깨진다. */
  const seoStart = sourceHtml.indexOf('<div class="tool-seo-related">');
  const relatedIds = [];
  if (seoStart >= 0) {
    const chunk = sourceHtml.slice(seoStart, sourceHtml.indexOf('</div>', seoStart));
    for (const m of chunk.matchAll(/\/karmolab\/t\/([^/"]+)\//g)) relatedIds.push(m[1]);
  }
  const hub = L.href('/karmolab/t/', code);
  const home = L.href('/karmolab/', code);
  const related = relatedIds
    .map(
      (r) =>
        `<a href="${L.href(`/karmolab/t/${r}/`, code)}">${esc(tr(code, `widgets.${r}.title`))}<span>${esc(
          tr(code, `tools.${r}.lead`)
        )}</span></a>`
    )
    .join('\n          ');

  /* 「쓰는 법」은 **그 도구의 단계가 그 언어에 다 있을 때만** 낸다 (TASK-KL-203 S8-e).
     반쯤 옮긴 목록을 내면 한 줄만 원본 언어로 남아 더 나쁘다 — 절 단위로 있거나 없거나. */
  const steps = [];
  for (let i = 0; ; i++) {
    const key = `howto.${id}.${i}`;
    const ko = tr(SOURCE_LOCALE, key);
    if (!ko || ko === key) break;
    const mine = tr(code, key);
    if (!mine || mine === key || mine === ko) {
      steps.length = 0;
      break;
    }
    steps.push(mine);
  }
  const howto = steps.length
    ? `
        <h2>${esc(tr(code, 'toolpage.section.howto'))}</h2>
        <ol>
          ` +
      steps.map((v) => `<li>${esc(v)}</li>`).join('\n          ') +
      `
        </ol>
`
    : '';

  /* 「자주 묻는 질문」도 같은 규칙 — **질문과 답이 다 그 언어에 있을 때만** 낸다.
     한 쌍이 반만 옮겨지면 질문은 영어인데 답이 한국어인 줄이 나온다. 그건 없느니만 못하다. */
  const pairs = faqPairs(id, code);
  const faq = pairs.length
    ? `
        <h2>${esc(tr(code, 'toolpage.section.faq'))}</h2>
        <dl class="tool-seo-faq">
          ` +
      pairs.map((p) => `<dt>${esc(p.q)}</dt>\n          <dd>${esc(p.a)}</dd>`).join('\n          ') +
      `
        </dl>
`
    : '';

  return `<section class="tool-seo">
        <nav class="tool-seo-crumb" aria-label="${esc(tr(code, 'toolpage.crumb.aria.seo'))}">
          <a href="${home}">KarmoLab</a> / <a href="${hub}">${esc(
    tr(code, 'toolpage.crumb.tools')
  )}</a> / ${esc(title)}
        </nav>
        <p>${esc(desc)}</p>
${howto}${faq}
        <h2>${esc(tr(code, 'toolpage.section.related'))}</h2>
        <div class="tool-seo-related">
          ${related}
        </div>

${privacyNote(id, code)}
        <p class="tool-seo-note">
          ${esc(tr(code, 'toolpage.note.privacy'))}
          <a href="${hub}">${esc(tr(code, 'toolpage.nav.allTools'))}</a> · <a href="${home}">KarmoLab</a> · <a href="https://github.com/Mascari4615" rel="me">${esc(
    tr(code, 'toolpage.nav.maker')
  )}</a>
          · ${esc(tr(code, 'toolpage.note.ai'))} <a href="https://github.com/Mascari4615/Mascari4615.github.io">${esc(
    tr(code, 'toolpage.note.src')
  )}</a>
        </p>
      </section>`;
}

function localizeToolPage(source, id, code) {
  const bare = `/karmolab/t/${id}/`;
  let html = toLocalePage(source, {
    code,
    bare,
    site: SITE,
    codes,
    /* 그 도구 **자기 화면**의 말이 따로 있으면 같이 박는다 (`i18n/<언어>/<도구>.json`).
       도구 화면은 스크립트가 그리므로 그 글은 찍을 때가 아니라 열 때 갈린다 — 미리 박아 두면
       그 순간 기다림이 0 이다(안 박으면 파일을 한 번 받아오는 동안 화면이 비어 있다). */
    namespaces: [
      'site',
      'shell',
      'widgets',
      /* ★ `widgets-desc` 도 여기서 안 싣는다 (2026-08-17 실측, 27.6KB). 도구 **설명**은 목록 화면의
         것이고, 그 화면을 그리는 `widgets-lazy-meta` 가 스스로 `loadNamespace('widgets-desc')` 를 부른다.
         실제로 이 장에서 목록으로 넘어가 봤다 — 설명이 영어로 잘 뜨고 i18n 경고 0건.
         이름(`widgets`)은 첫 그림의 손잡이에 쓰이므로 남긴다. */
      'toolpage',
      /* ★ `tools` 는 **여기서 안 싣는다** (2026-08-17 실측). 45.6KB 짜리 묶음인데(도구 324항목)
         이 장이 보여 주는 다른 도구의 한 줄은 **찍을 때 이미 HTML 에 박혀 나간다**(위 `related`).
         화면 코드가 `tools.*` 를 읽는 자리는 없다 — 원본(ko) 도구 장은 아예 아무 묶음도 안 싣고도
         멀쩡하다(62KB). 목록 화면으로 넘어가면 그때 `loadNamespace('tools')` 가 받아 온다. */
      ...(fs.existsSync(path.join(root, 'i18n', code, `${id}.json`)) ? [id] : [])
    ]
  });

  const title = tr(code, `widgets.${id}.title`);
  const lead = tr(code, `tools.${id}.lead`);
  const desc = tr(code, `tools.${id}.description`);

  /* 이 장의 제목·설명은 사이트 기본값으로 덮여 있다(`toLocalePage` 는 장을 모른다) — 여기서 제 것으로. */
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} | KarmoLab</title>`);
  for (const [attr, name] of [
    ['name', 'description'],
    ['property', 'og:description'],
    ['name', 'twitter:description']
  ]) {
    html = html.replace(new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(">)`), `$1${esc(desc)}$2`);
  }
  for (const [attr, name] of [
    ['property', 'og:title'],
    ['name', 'twitter:title']
  ]) {
    html = html.replace(
      new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(">)`),
      `$1${esc(title)} | KarmoLab$2`
    );
  }
  html = html.replace(
    /(<meta property="og:image:alt" content=")[^"]*(">)/,
    `$1${esc(`${title} — KarmoLab`)}$2`
  );

  /* 큰제목과 한 줄 소개. */
  html = html.replace(
    /<header class="tool-head">[\s\S]*?<\/header>/,
    `<header class="tool-head">\n            <h1>${esc(title)}</h1>\n            <p>${esc(
      lead
    )}</p>\n          </header>`
  );

  /* 위쪽 빵부스러기 — 분류 링크의 이름은 원본 언어라 통째로 다시 짓는다(분류 이름은 아직 안 옮겼다). */
  html = html.replace(
    /<nav class="tool-crumb"[\s\S]*?<\/nav>/,
    `<nav class="tool-crumb" aria-label="${esc(tr(code, 'toolpage.crumb.aria'))}">` +
      `<a href="${L.href('/karmolab/', code)}">KarmoLab</a><i aria-hidden="true">›</i>` +
      `<a href="${L.href('/karmolab/t/', code)}">${esc(tr(code, 'toolpage.crumb.tools'))}</a>` +
      `<i aria-hidden="true">›</i><span aria-current="page">${esc(title)}</span></nav>`
  );

  /* 설명 블록 통째 교체 — 안 옮긴 절(쓰는 법·FAQ·다른 점·별명)은 여기서 사라진다. */
  const start = html.indexOf('<section class="tool-seo">');
  if (start < 0) throw new Error(`${id}: tool-seo 자리를 못 찾음 — 생성기 모양 확인`);
  const end = html.indexOf('</section>', start) + '</section>'.length;
  html = html.slice(0, start) + toolSeoSection(id, code, html.slice(start, end)) + html.slice(end);

  /* 구조 설명(JSON-LD)의 FAQ — **장에 실제로 낸 것과 같아야 한다.**
     그 언어로 다 옮겼으면 옮긴 질문으로 바꿔 넣고, 아니면 뺀다. 없는 절을 있다고 알리는 것도,
     한국어 질문을 영어 장의 구조 설명에 싣는 것도 똑같이 검색엔진에 거짓을 말하는 것이다. */
  const ldPairs = faqPairs(id, code);
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, body) => {
    if (!body.includes('FAQPage')) return whole;
    try {
      const data = JSON.parse(body);
      const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      const kept = graph
        .map((n) =>
          n['@type'] === 'FAQPage' && ldPairs.length
            ? {
                ...n,
                mainEntity: ldPairs.map((p) => ({
                  '@type': 'Question',
                  name: p.q,
                  acceptedAnswer: { '@type': 'Answer', text: p.a }
                }))
              }
            : n
        )
        .filter((n) => n['@type'] !== 'FAQPage' || ldPairs.length);
      if (!kept.length) return '';
      return `<script type="application/ld+json">\n${JSON.stringify(
        Array.isArray(data['@graph']) ? { ...data, '@graph': kept } : kept[0]
      )}\n</script>`;
    } catch {
      /* 못 읽으면 통째로 뺀다 — 반쯤 맞는 구조 설명보다 없는 편이 낫다. */
      return '';
    }
  });

  /* 우리 주소에 언어 앞머리. 바깥 링크(github 등)는 안 건드린다. */
  html = L.apply(html, code);
  /* 앞머리(front matter)의 주소는 `toLocalePage` 가 이미 옮겼다 — 다시 붙지 않게 확인만. */
  return html;
}

/* ── 돌린다 ────────────────────────────────────────── */

const made = [];
const missing = [];

/* 목록(허브) — 도구 장 전부가 이 한 장을 가리킨다. 도구 장보다 **먼저** 찍는다. */
const hubSrc = path.join(srcDir, 'index.html');
for (const code of targets) {
  if (!fs.existsSync(hubSrc)) break;
  const source = fs.readFileSync(hubSrc, 'utf8').split('\r\n').join('\n');
  const out = toLocaleHub(source, code, {
    site: SITE,
    codes,
    count: ids.length,
    href: (b, c) => L.href(b, c)
  });
  const dest = path.join(outRoot, localizedPath('/karmolab/t/', code).replace(/^\//, ''), 'index.html');
  if (CHECK) {
    if (!fs.existsSync(dest)) missing.push(`${code} 목록`);
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out, 'utf8');
  }
  made.push(dest);
}

for (const code of targets) {
  for (const id of ids) {
    const source = fs.readFileSync(path.join(srcDir, id, 'index.html'), 'utf8').split('\r\n').join('\n');
    let out;
    try {
      out = localizeToolPage(source, id, code);
    } catch (e) {
      console.error(`[tool-pages-locale] ${code}/${id}: ${e.message}`);
      process.exit(1);
    }
    const dest = path.join(outRoot, localizedPath(`/karmolab/t/${id}/`, code).replace(/^\//, ''), 'index.html');
    if (CHECK) {
      if (!fs.existsSync(dest)) missing.push(`${code}/${id}`);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, out, 'utf8');
    }
    made.push(dest);
  }
}

/* ── 원본 장도 되가리키게 한다 ──────────────────────
 *
 * 짝 표시는 **왕복이어야** 한 벌로 인정된다. 언어 장만 한국어 장을 가리키고 한국어 장이
 * 되가리키지 않으면 양쪽 표시가 통째로 무시된다 — 129장 × 2언어를 만들어 놓고 검색엔진에는
 * 한 장도 짝으로 안 잡히는 상태가 된다(가장 흔한 실패 방식이 정확히 이것이다).
 *
 * 셸에 박힌 짝 표시는 `shell-page.mjs` 가 정적 장에서 지운다 — 그건 **첫 화면 주소**를 가리키는
 * 것이라 도구 장에 남으면 129장이 남의 주소를 제 짝이라고 우기기 때문이다. 여기서는 그 자리에
 * **이 도구의** 짝 표시를 박는다. 지운 뒤에 제 것을 넣는 순서라 서로 어긋나지 않는다. */
if (targets.length) {
  for (const rel of ['', ...ids]) {
    const file = rel ? path.join(srcDir, rel, 'index.html') : hubSrc;
    if (!fs.existsSync(file)) continue;
    const id = rel;
    const html = fs.readFileSync(file, 'utf8');
    /* 같은 일을 여기서 또 적지 않는다 — 짝 표시·언어 링크를 박는 규칙은 `locale-page.mjs`
       한 곳에만 있다. 예전엔 이 자리에 같은 코드가 베껴져 있었고, 그래서 저쪽에 언어 링크를
       더해도 한국어 원본 138장에는 안 붙었다(그게 지금 고치는 그것이다). */
    const next = addAlternatesToSource(html, {
      bare: id ? `/karmolab/t/${id}/` : '/karmolab/t/',
      site: SITE,
      codes
    });
    if (next === html) continue;
    if (CHECK) {
      /* 이 줄이 무더기로 뜨면 대개 **차례를 건너뛴 것**이다 — 한국어 장을 다시 찍은 뒤
         이 생성기를 안 돌리면 짝 표시가 없다. 사람이 그걸 모르면 123줄을 읽고도 뭘 할지 모른다. */
      missing.push(`${id || '목록'} (원본 장에 짝 표시 없음)`);
      continue;
    }
    fs.writeFileSync(file, next, 'utf8');
  }
}

/* ★ **접은 도구도 언어 판에 문을 남긴다** (2026-08-14).
 *
 * 한국어에는 넘김판(한 장짜리 안내)이 찍히는데 언어 판에는 아무것도 안 찍혀 있었다 —
 * 실측: `/en/karmolab/t/charcount/` · `/ja/…` 가 **404**(한국어는 200 넘김판). 그 주소들은
 * 예전에 온전한 도구 장이었으니 검색·북마크가 그리로 온다. 404 는 「없어졌다」만 말하고
 * 어디로 가야 할지는 안 말한다.
 *
 * 도구 장 틀은 못 쓴다(그 자리는 도구가 아니라 안내다) — 그래서 여기서 한 장짜리로 따로 찍는다.
 */
if (!CHECK) {
  for (const code of targets) {
    for (const id of RETIRED_OPERATION_IDS) {
      if (!fs.existsSync(path.join(srcDir, id, 'index.html'))) continue; /* 한국어 넘김판이 있는 것만 */
      const path2 = localizedPath(`/karmolab/t/${id}/`, code);
      const workbench = localizedPath('/karmolab/t/text/', code);
      const dest = path.join(outRoot, path2.replace(/^\//, ''), 'index.html');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(
        dest,
        `---
layout: none
permalink: ${path2}
---
` +
          `<!doctype html><html lang="${code}"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>${id} — moved into the text tool · KarmoLab</title>` +
          `<link rel="canonical" href="${SITE}${workbench}">` +
          `<meta name="robots" content="noindex,follow">` +
          `<meta http-equiv="refresh" content="0; url=${workbench}#${id}">` +
          `<style>body{font:16px/1.7 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}` +
          `a{color:#2563eb}</style></head><body><main>` +
          `<h1>${id}</h1><p>This tool now lives inside the <strong>text tool</strong>.</p>` +
          `<p><a href="${workbench}#${id}">Open it</a></p></main></body></html>`,
        'utf8'
      );
      made.push(dest);
    }
  }
}

if (CHECK) {
  if (missing.length) {
    console.error(`[tool-pages-locale] 안 찍힌 장 ${missing.length}개: ${missing.slice(0, 5).join(', ')}…`);
if (missing.length > 20 && missing.every((m) => m.includes('짝 표시 없음'))) {
  console.error('  → 한국어 장을 다시 찍은 뒤 이 생성기를 안 돌린 것이다: `npm run gen:tool-pages-locale`');
}
    process.exit(1);
  }
  console.log(`[tool-pages-locale] 언어 장 ${made.length}개 확인 (${targets.join(', ') || '없음'})`);
} else {
  console.log(
    `[tool-pages-locale] ${made.length}개 찍음 — 도구 ${ids.length} × 언어 ${targets.length}` +
      (targets.length ? ` (${targets.join(', ')})` : ' (아직 낼 언어 없음)')
  );
  if (SOURCE_LOCALE !== DEFAULT_LOCALE) console.log('[tool-pages-locale] 참고: 원본 언어와 기본 언어가 다르다');
}
