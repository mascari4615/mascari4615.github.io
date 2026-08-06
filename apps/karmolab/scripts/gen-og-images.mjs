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

const ids = (argIds.length ? argIds : ['default', ...Object.keys(seo)]).filter((id) => {
  if (id === 'default' || (seo[id] && widgetById[id])) return true;
  console.error(`[gen-og-images] 알 수 없는 도구 id: ${id}`);
  process.exit(1);
});

/* ── 카드 HTML ────────────────────────────────────── */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 카드 한 장의 정체성 — 이 값이 그대로면 다시 그릴 이유가 없다. */
function fingerprint(id) {
  const w = id === 'default' ? DEFAULT_CARD : widgetById[id];
  const lead = id === 'default' ? DEFAULT_CARD.lead : seo[id].lead;
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ v: 1, title: w.title, icon: w.icon, lead }))
    .digest('hex')
    .slice(0, 12);
}

/** 아직 자기 카드가 없는 도구가 기대는 브랜드 공용 카드 — 렌즈(도구함) 아이콘. */
const DEFAULT_CARD = {
  // 하단 워드마크가 이미 KarmoLab 이므로 제목은 같은 말을 반복하지 않는다.
  title: '도구 모음',
  lead: '텍스트 · 이미지 · 계산 · 개발 도구를 한곳에서',
  icon: '<path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
};

function cardHtml(id) {
  const w = id === 'default' ? DEFAULT_CARD : widgetById[id];
  const lead = id === 'default' ? DEFAULT_CARD.lead : seo[id].lead;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: radial-gradient(1100px 700px at 78% -12%, #1b2130 0%, #0d1016 46%, #08080a 100%);
    color: #f2f2ee;
    font-family: 'Noto Sans KR', 'Malgun Gothic', 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 76px 84px 64px; position: relative; overflow: hidden;
  }
  /* 관측소 창으로 든 빛 — 브랜드 액센트를 배경에 아주 옅게 깔아 단조로움을 없앤다 */
  body::after {
    content: ''; position: absolute; right: -180px; top: -180px;
    width: 620px; height: 620px; border-radius: 50%;
    background: radial-gradient(circle, rgba(212,168,73,0.13) 0%, rgba(212,168,73,0) 68%);
  }
  .icon {
    width: 108px; height: 108px; color: #d4a849;
    border: 2px solid rgba(212,168,73,0.34); border-radius: 26px;
    background: rgba(212,168,73,0.07);
    display: flex; align-items: center; justify-content: center; margin-bottom: 42px;
  }
  .icon svg { width: 62px; height: 62px; }
  h1 {
    font-size: 78px; font-weight: 700; line-height: 1.16; letter-spacing: -0.02em;
    max-width: 17ch;
  }
  p {
    margin-top: 26px; font-size: 33px; line-height: 1.5; color: #9a9a94;
    max-width: 34ch;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  footer {
    display: flex; align-items: baseline; gap: 18px;
    font-size: 30px; letter-spacing: 0.01em;
  }
  .mark { color: #d4a849; font-weight: 700; }
  .host { color: #55555a; font-size: 26px; }
  .rule { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(212,168,73,0.34), rgba(212,168,73,0)); }
</style></head>
<body>
  <div>
    <div class="icon"><svg viewBox="0 0 24 24" fill="none">${w.icon}</svg></div>
    <h1>${esc(w.title)}</h1>
    <p>${esc(lead)}</p>
  </div>
  <footer><span class="mark">KarmoLab</span><span class="rule"></span><span class="host">설치 없이 브라우저에서</span></footer>
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

if (!todo.length) {
  console.log(`[gen-og-images] 최신 상태 — ${ids.length}장 모두 그대로 (다시 그릴 것 없음)`);
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

for (const id of todo) {
  await page.setContent(cardHtml(id), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // 부드러운 그라데이션 배경이라 PNG 는 한 장에 270KB 가 나온다 — 도구 수만큼 저장소에 쌓이므로
  // 같은 화질에서 1/5 무게인 JPEG 로 찍는다 (카드 이미지는 투명도가 필요 없다).
  await page.screenshot({ path: path.join(outDir, `${id}.jpg`), type: 'jpeg', quality: 90 });
  manifest[id] = fingerprint(id);
}

await browser.close();

// 사라진 도구의 카드는 남겨 두지 않는다 (죽은 링크의 그림이 계속 배포되는 것을 막는다).
if (!argIds.length) {
  const known = new Set(['default', ...Object.keys(seo)]);
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
console.log(`[gen-og-images] ${todo.length}장 렌더 (전체 ${ids.length}) → img/og/`);
