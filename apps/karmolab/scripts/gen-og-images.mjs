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
  },
  /* 놀이 화면들 (TASK-KL-195). 여기 손으로 적는 것은 **놀이가 아닌 두 장**뿐이고,
     놀이 여덟은 `data/games.json` 에서 그대로 읽는다 — 목록을 두 벌 적으면 그날부터 갈라진다. */
  play: { title: '놀이터', lead: '하루 한 판씩 — 오늘의 판 다섯', emoji: '🎲' },
  today: { title: '오늘의 판', lead: '매일 자정에 새로 — 다섯 판을 끝내면 연속일이 쌓인다', emoji: '🔥' }
};

/* 놀이 카드는 놀이 목록에서 파생한다 (`apps/play/games.json` → 이 앱의 data/ 로 실려 온다). */
const games = JSON.parse(fs.readFileSync(path.join(root, 'data/games.json'), 'utf8')).games || [];
for (const game of games) {
  SPECIAL_CARDS[game.id] = { title: game.title, lead: game.lead, emoji: game.emoji };
}

/**
 * 화풍은 **무엇의 카드인가**로 갈린다 (TASK-KL-195, 사용자 선택 = 셋 다 쓰기).
 *
 * - `lab` (어두운 판 + 계측 격자) = 도구. 「믿고 쓸 것」 쪽 얼굴.
 * - `aurora` (첫 화면의 보라·청록 번짐 + 별) = 놀이·오늘의 판·첫 화면. 「세계」 쪽 얼굴.
 * - `poster` (밝은 바탕 + 거대 세리프) = 자랑 카드. **서버가 그린다**(내 숫자가 박히므로
 *   미리 찍어 둘 수 없다) — 그래서 이 파일에는 없다. 정본 = yawnbot 의 자랑 카드 라우트.
 *
 * 도구 카드를 오로라로 찍지 않는 이유: 도구 133장이 전부 같은 번짐을 쓰면 피드에서 서로
 * 구분이 안 된다. 놀이는 여덟 장뿐이라 같은 얼굴이어도 「그 세계」로 읽힌다.
 */
const AURORA = new Set(['default', 'play', 'today', ...games.map((g) => g.id)]);
const styleOf = (id) => (AURORA.has(id) ? 'aurora' : 'lab');


/* 놀이·오늘의 판 카드도 여기 들어와야 그려진다 (TASK-KL-195). 예전에는 `hub` 만 손으로
   적혀 있어서, 새 특별 카드를 표에 넣어도 **아무도 안 그렸다** — 넣은 사람은 넣은 줄 안다. */
const ids = (argIds.length ? argIds : ['default', ...Object.keys(SPECIAL_CARDS), ...Object.keys(seo)]).filter((id) => {
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
    /* `v` 는 **그림이 달라지는 변경**마다 올린다 — 문구가 그대로여도 화풍을 바꾸면 옛 그림이
       그대로 나간다. v3 = 화풍 둘로 갈림 (TASK-KL-195). */
    .update(JSON.stringify({ v: 3, style: styleOf(id), title: tidy(w.title), icon: w.icon, emoji: w.emoji, lead: tidy(lead) }))
    .digest('hex')
    .slice(0, 12);
}

/** 아직 자기 카드가 없는 도구가 기대는 공용 카드 — 문구는 앱이 쓰는 것과 같은 정본. */
const DEFAULT_CARD = {
  title: '삶을 섞고 술을 바꿀 시간',
  lead: '손에 잡히는 도구들이 있는 작업실',
  icon: '<path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
};

/** 앱이 쓰는 글꼴 그대로. 카드만 다른 글꼴을 쓰면 링크를 눌러 들어온 사람이 다른 곳에 온 줄 안다. */
const FACES = `
  @font-face { font-family: 'KarmoSerif'; src: url('${new URL(`file:///${path.join(root, 'fonts/serif-ko.woff2')}`).href}') format('woff2'); font-weight: 900; }
  @font-face { font-family: 'KarmoSerifLatin'; src: url('${new URL(`file:///${path.join(root, 'fonts/serif-latin.woff2')}`).href}') format('woff2'); font-weight: 900; }
  @font-face { font-family: 'KarmoSans'; src: url('${new URL(`file:///${path.join(root, 'fonts/sans-ko.woff2')}`).href}') format('woff2'); }
`;

/** 브랜드 글자 — 앱 머리띠와 같은 세리프. 두 화풍이 공유한다. */
const LOGO = `Karmo<b>Lab</b>`;

/** ① 실험실 격자 — 도구 카드. 계측 격자 + 왼쪽 띠. */
function labHtml(title, lead, icon) {
  return `<style>${FACES}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body { background: #0e0d14; color: #f2f2ee; font-family: 'KarmoSans', 'Malgun Gothic', sans-serif; position: relative; }
  .grid { position: absolute; inset: 0;
    background-image: linear-gradient(#a99bf51a 1px, transparent 1px), linear-gradient(90deg, #a99bf51a 1px, transparent 1px);
    background-size: 60px 60px; }
  .fade { position: absolute; inset: 0; background: radial-gradient(ellipse at 22% 40%, transparent 18%, #0e0d14 76%); }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: linear-gradient(#a99bf5, #2aa9a0); }
  .wrap { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 76px 88px 60px; }
  .kicker { font-family: ui-monospace, Consolas, monospace; font-size: 24px; letter-spacing: 0.22em; color: #2aa9a0; margin-bottom: 26px; }
  .row { display: flex; align-items: center; gap: 26px; }
  .icon { width: 64px; height: 64px; color: #a99bf5; flex: 0 0 auto; }
  .icon svg { width: 100%; height: 100%; }
  h1 { font-size: 82px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; max-width: 13ch; }
  p { margin-top: 26px; font-size: 31px; line-height: 1.45; color: #8e8ba6; max-width: 32ch;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  footer { display: flex; align-items: baseline; gap: 18px; }
  .logo { font-family: 'KarmoSerif', 'KarmoSerifLatin', Georgia, serif; font-weight: 900; font-size: 38px; color: #f2f2ee; }
  .logo b { color: #a99bf5; }
  .dom { font-family: ui-monospace, Consolas, monospace; font-size: 22px; color: #5d5a72; }
</style>
<div class="grid"></div><div class="fade"></div><div class="bar"></div>
<div class="wrap">
  <div>
    <div class="kicker">TOOL</div>
    <div class="row"><div class="icon"><svg viewBox="0 0 24 24" fill="none">${icon}</svg></div><h1>${title}</h1></div>
    <p>${lead}</p>
  </div>
  <footer><span class="logo">${LOGO}</span><span class="dom">blog.mascari4615.com/karmolab</span></footer>
</div>`;
}

/** ② 오로라 — 놀이·첫 화면 카드. 첫 화면의 번짐과 별을 그대로. */
function auroraHtml(title, lead, icon, emoji, kicker) {
  const mark = emoji
    ? `<div class="emoji">${esc(emoji)}</div>`
    : `<div class="icon"><svg viewBox="0 0 24 24" fill="none">${icon}</svg></div>`;
  return `<style>${FACES}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body { background: #16151f; color: #f2f2ee; font-family: 'KarmoSans', 'Malgun Gothic', sans-serif; position: relative; }
  .glow { position: absolute; border-radius: 50%; filter: blur(90px); }
  .g1 { width: 720px; height: 620px; left: -160px; top: -180px; background: #6d5bd0; opacity: 0.55; }
  .g2 { width: 680px; height: 560px; right: -140px; bottom: -200px; background: #2aa9a0; opacity: 0.42; }
  .g3 { width: 420px; height: 380px; left: 46%; top: 38%; background: #a99bf5; opacity: 0.18; }
  .star { position: absolute; color: #cfc7ff; }
  .s1 { left: 852px; top: 92px; font-size: 68px; opacity: 0.85; }
  .s2 { left: 1052px; top: 328px; font-size: 36px; opacity: 0.5; }
  .s3 { left: 782px; top: 468px; font-size: 24px; opacity: 0.38; }
  .wrap { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 76px 88px 62px; }
  .kicker { font-family: ui-monospace, Consolas, monospace; font-size: 24px; letter-spacing: 0.22em; color: #7fe3d8; margin-bottom: 22px; }
  .icon { width: 74px; height: 74px; color: #cfc7ff; margin-bottom: 26px; }
  .icon svg { width: 100%; height: 100%; }
  .emoji { font-size: 76px; line-height: 1; margin-bottom: 22px; }
  h1 { font-size: 86px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; max-width: 13ch;
       text-shadow: 0 2px 30px rgba(0, 0, 0, 0.45); }
  p { margin-top: 22px; font-size: 32px; line-height: 1.45; color: #ded9f2; max-width: 28ch;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  footer { font-family: 'KarmoSerif', 'KarmoSerifLatin', Georgia, serif; font-weight: 900; font-size: 40px;
           letter-spacing: -0.02em; color: #f2f2ee; }
  footer b { color: #a99bf5; }
</style>
<div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div>
<div class="star s1">✦</div><div class="star s2">✦</div><div class="star s3">✦</div>
<div class="wrap">
  <div>
    <div class="kicker">${esc(kicker)}</div>
    ${mark}
    <h1>${title}</h1>
    <p>${lead}</p>
  </div>
  <footer>${LOGO}</footer>
</div>`;
}

function cardHtml(id) {
  const w = id === 'default' ? DEFAULT_CARD : SPECIAL_CARDS[id] || widgetById[id];
  const lead = id === 'default' ? DEFAULT_CARD.lead : SPECIAL_CARDS[id] ? SPECIAL_CARDS[id].lead : seo[id].lead;
  const title = esc(tidy(w.title));
  const body = esc(tidy(lead));
  const inner =
    styleOf(id) === 'aurora'
      ? auroraHtml(title, body, w.icon, w.emoji, id === 'default' ? 'KARMOLAB' : id === 'today' ? 'TODAY' : 'PLAY')
      : labHtml(title, body, w.icon);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>${inner}</body></html>`;
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
