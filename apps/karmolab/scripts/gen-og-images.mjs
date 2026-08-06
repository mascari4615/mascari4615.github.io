/**
 * 도구별 공유 카드 이미지 생성 (TASK-KL-089)
 *
 * 왜 필요한가: 도구 상세 페이지는 `og:image` 로 앱 파비콘(.ico)을 가리키고 있었다.
 * 대부분의 메신저·SNS 는 .ico 를 카드 이미지로 쓰지 않으므로, 64개 도구 링크를 어디에 붙여도
 * 카드가 **그림 없이** 뜬다 — 검색 밖 유입(공유·커뮤니티)의 첫 관문이 닫혀 있던 셈이다.
 * → 도구마다 1200×630 카드를 찍어 제목·설명·아이콘이 링크에 그대로 실리게 한다.
 *
 * 왜 커밋하는가: 배포 러너(ubuntu)에는 한글 폰트가 없어 거기서 그리면 글자가 두부(□)가 된다.
 * 폰트가 있는 개발 머신에서 찍어 산출물을 저장소에 넣고, 배포는 복사만 한다.
 * 내용이 그대로면 다시 그리지 않으므로(해시 비교) 도구를 추가해도 새것만 렌더된다.
 *
 * 사용: node scripts/gen-og-images.mjs [id ...]   (기본 = 전 도구, --force = 해시 무시)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'img/og');
const manifestPath = path.join(outDir, 'manifest.json');
const WIDTH = 1200;
const HEIGHT = 630;

const force = process.argv.includes('--force');
const check = process.argv.includes('--check');
const argIds = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* ── 입력 ─────────────────────────────────────────── */

const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;

const lazyMetaPath = path.join(root, 'js/widgets-lazy-meta.js');
if (!fs.existsSync(lazyMetaPath)) {
  console.error('[gen-og-images] js/widgets-lazy-meta.js 없음 — `npm run build` 를 먼저 돌려야 합니다.');
  process.exit(1);
}
const fakeWindow = {};
new Function('window', fs.readFileSync(lazyMetaPath, 'utf8'))(fakeWindow);
const widgetById = Object.fromEntries((fakeWindow.KARMOLAB_LAZY_META || []).map((w) => [w.id, w]));

/** 도구가 아닌 카드들. 문구는 앱이 쓰는 것과 같은 정본이며, 도구 수처럼 자주 바뀌는 값은
 *  일부러 안 넣는다 — 넣으면 도구가 하나 늘 때마다 카드를 다시 그려야 한다. */
const SPECIAL_CARDS = {
  hub: {
    title: '도구 전체',
    lead: '텍스트 · 이미지 · 계산 · 개발 — 한 곳에서',
    icon: '<path d="M4 6h6v6H4zM14 6h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/>'
  }
};


const ids = (argIds.length ? argIds : ['default', 'hub', ...Object.keys(seo)]).filter((id) => {
  if (id === 'default' || SPECIAL_CARDS[id] || (seo[id] && widgetById[id])) return true;
  console.error(`[gen-og-images] 알 수 없는 도구 id: ${id}`);
  process.exit(1);
});

/* ── 카드 HTML ────────────────────────────────────── */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 카드 한 장의 정체성 — 이 값이 그대로면 다시 그릴 이유가 없다. */
/* 카드에 그릴 글자는 앞뒤 공백을 털고 사이 공백도 하나로 모은다.
 * 안 그러면 데이터에 공백 한 칸이 늘어난 것만으로 카드가 다시 그려져, 보이는 것은 그대로인데
 * 30KB 짜리 그림이 저장소에 새로 쌓인다(실제로 그런 커밋이 있었다). */
const tidy = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function fingerprint(id) {
  const w = id === 'default' ? DEFAULT_CARD : SPECIAL_CARDS[id] || widgetById[id];
  const lead = id === 'default' ? DEFAULT_CARD.lead : SPECIAL_CARDS[id] ? SPECIAL_CARDS[id].lead : seo[id].lead;
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ v: 2, title: tidy(w.title), icon: w.icon, lead: tidy(lead) }))
    .digest('hex')
    .slice(0, 12);
}

/** 아직 자기 카드가 없는 도구가 기대는 공용 카드 — 문구는 앱이 쓰는 것과 같은 정본. */
const DEFAULT_CARD = {
  title: '삶을 섞고 술을 바꿀 시간',
  lead: '손에 잡히는 도구들이 있는 작업실',
  icon: '<path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
};

function cardHtml(id) {
  const w = id === 'default' ? DEFAULT_CARD : SPECIAL_CARDS[id] || widgetById[id];
  const lead = id === 'default' ? DEFAULT_CARD.lead : SPECIAL_CARDS[id] ? SPECIAL_CARDS[id].lead : seo[id].lead;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: #0b0d12;
    color: #f2f2ee;
    font-family: 'Noto Sans KR', 'Malgun Gothic', 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 84px 88px 72px;
  }
  .icon {
    width: 96px; height: 96px; color: #d4a849;
    display: flex; align-items: center; justify-content: center; margin-bottom: 44px;
  }
  .icon svg { width: 96px; height: 96px; }
  h1 {
    font-size: 78px; font-weight: 700; line-height: 1.16; letter-spacing: -0.02em;
    max-width: 17ch;
  }
  p {
    margin-top: 28px; font-size: 33px; line-height: 1.5; color: #9a9a94;
    max-width: 34ch;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  footer { font-size: 30px; font-weight: 700; color: #d4a849; }
</style></head>
<body>
  <div>
    <div class="icon"><svg viewBox="0 0 24 24" fill="none">${w.icon}</svg></div>
    <h1>${esc(tidy(w.title))}</h1>
    <p>${esc(tidy(lead))}</p>
  </div>
  <footer>KarmoLab</footer>
</body></html>`;
}

/* ── 렌더 ─────────────────────────────────────────── */

fs.mkdirSync(outDir, { recursive: true });
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

const todo = ids.filter((id) => {
  if (force) return true;
  const fresh = manifest[id] === fingerprint(id);
  return !(fresh && fs.existsSync(path.join(outDir, `${id}.jpg`)));
});

// `--check` = 그리지 않고 「지금 문구와 어긋난 카드」만 알려 준다 (TASK-KL-089).
// 카드에는 제목과 소개가 그려져 있어서, 문구를 고치고 다시 안 찍으면 옛 글이 그대로 나간다.
// 파일이 있는지만 보는 검사로는 이걸 못 잡는다 — 실제로 다섯 장이 옛 문구인 채 남아 있었다.
// 브라우저가 필요 없는 파일 비교라 어디서든 돌릴 수 있다.
if (check) {
  const missing = todo.filter((id) => !fs.existsSync(path.join(outDir, `${id}.jpg`)));
  const stale = todo.filter((id) => fs.existsSync(path.join(outDir, `${id}.jpg`)));
  if (!todo.length) {
    console.log(`[gen-og-images --check] ${ids.length}장 모두 지금 문구와 맞는다`);
    process.exit(0);
  }
  if (missing.length) console.error(`[gen-og-images --check] 카드가 아예 없는 도구 ${missing.length}개: ${missing.join(', ')}`);
  if (stale.length) console.error(`[gen-og-images --check] 문구가 바뀌었는데 옛 카드인 도구 ${stale.length}개: ${stale.join(', ')}`);
  console.error('  → 글꼴이 있는 개발 머신에서 `npm run gen:og` 후 img/og/ 를 커밋하세요.');
  process.exit(1);
}

if (!todo.length) {
  console.log(`[gen-og-images] 최신 상태 — ${ids.length}장 모두 그대로 (다시 그릴 것 없음)`);
  process.exit(0);
}

const overflowed = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

for (const id of todo) {
  await page.setContent(cardHtml(id), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  // 소개가 길면 두 줄에서 잘리는데, 잘린 카드는 눈으로 보기 전엔 티가 안 난다.
  // 그리기 전에 재서 이름을 알려 준다.
  //
  // 두 가지를 조심한다.
  //  - 글꼴이 준비된 **뒤에** 재야 한다. 폴백 글꼴은 폭이 달라 멀쩡한 카드도 잘렸다고 나온다.
  //  - 재는 대상은 소개 문단뿐이다. 제목은 줄 수를 묶어 두지 않아 길면 줄바꿈될 뿐 잘리지 않는데,
  //    그것까지 재었더니 95개 전부가 잘렸다고 나왔다(줄 높이 반올림 탓).
  const clipped = await page.evaluate(() => {
    const p = document.querySelector('p');
    return p ? p.scrollHeight > p.clientHeight + 2 : false;
  });
  if (clipped) overflowed.push(id);
  // 부드러운 그라데이션 배경이라 PNG 는 한 장에 270KB 가 나온다 — 도구 수만큼 저장소에 쌓이므로
  // 같은 화질에서 1/5 무게인 JPEG 로 찍는다 (카드 이미지는 투명도가 필요 없다).
  await page.screenshot({ path: path.join(outDir, `${id}.jpg`), type: 'jpeg', quality: 90 });
  manifest[id] = fingerprint(id);
}

await browser.close();

// 사라진 도구의 카드는 남겨 두지 않는다 (죽은 링크의 그림이 계속 배포되는 것을 막는다).
if (!argIds.length) {
  // 도구가 아닌 카드(목록 등)도 「아는 것」에 넣어야 한다 — 안 그러면 그릴 때마다 다시 지운다.
  const known = new Set(['default', ...Object.keys(SPECIAL_CARDS), ...Object.keys(seo)]);
  for (const file of fs.readdirSync(outDir)) {
    const id = file.endsWith('.jpg') ? file.slice(0, -4) : null;
    if (id && !known.has(id)) {
      fs.unlinkSync(path.join(outDir, file));
      delete manifest[id];
      console.log(`[gen-og-images] 사라진 도구 카드 제거: ${id}`);
    }
  }
  for (const id of Object.keys(manifest)) if (!known.has(id)) delete manifest[id];
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (overflowed.length) {
  console.warn(`[gen-og-images] 카드에서 글이 잘리는 도구 ${overflowed.length}개: ${overflowed.join(", ")}`);
  console.warn("  → 소개(lead)를 줄이면 카드에 온전히 담깁니다.");
}

console.log(`[gen-og-images] ${todo.length}장 렌더 (전체 ${ids.length}) → img/og/`);
