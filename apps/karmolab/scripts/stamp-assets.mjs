/**
 * 파일 이름에 **내용 지문**을 박고, 화면이 그 이름을 부르게 바꾼다 (TASK-KL-128 ②)
 *
 * 왜: 지금은 다시 왔을 때 얻는 게 없다. 서비스 워커가 우리 js·css 를 전부 「늘 새로 받아
 * 오기」로 두기 때문이다(`src/sw.ts` 머리말). 그렇게 둔 이유가 있다 — 이름이 늘 같으니
 * **새 화면이 옛 코드를 만나는 사고**가 실제로 났었다(도구 상세가 옛 셸을 만나 첫 화면으로 튀었다).
 *
 * 이름에 지문을 박으면 그 사고가 구조적으로 사라진다: 내용이 바뀌면 주소가 바뀌므로,
 * 새 화면은 **새 주소**를 부르고 옛 주소는 아무도 안 부른다. 그러면 「한 번 받은 것은 영원히
 * 그대로」로 둬도 안전하다 — 다시 왔을 때 네트워크를 한 번도 안 타고 뜬다.
 *
 * 무엇에 박나: `js/` 맨 위 파일과 `css/` 파일. **위젯(`js/widgets/…`)은 안 박는다** —
 * 그 주소는 화면이 실행 중에 만들어 내므로(`widgets-loader.ts`) 표를 들고 다녀야 한다.
 * 그건 다음 걸음이다. 지금은 화면이 **직접 부르는 것**만 다룬다(셸 코드와 스타일 = 큰 덩이).
 * `sw.js` 도 안 박는다 — 그 주소가 고정이어야 브라우저가 「워커가 바뀌었나」를 본다.
 *
 * 언제 도나: 도구 페이지를 다 찍은 **뒤**. 배포에 나가는 HTML(`apps/blog/karmolab/**`)의
 * 주소를 바꿔 주는 것이 이 스크립트의 일이다. 소스(`apps/karmolab/index.html`)는 안 건드린다.
 *
 * 사용: node scripts/stamp-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_PAGES = path.resolve(root, '../blog/karmolab');

/** 지문을 안 박는 것 — 이유는 머리말 참고. */
const SKIP = new Set(['split_script.cjs', 'asset-manifest.json']);
const HASH_LEN = 8;
const stamped = /\.[0-9a-f]{8}\.(js|css)$/;

function hashOf(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, HASH_LEN);
}

/** `js/` 맨 위 + `css/` 의 파일에 지문 사본을 만든다. 표(logical → 지문 박힌 이름)를 낸다. */
function stampDir(rel, exts) {
  const dir = path.join(root, rel);
  const map = {};
  if (!fs.existsSync(dir)) return map;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || SKIP.has(entry.name)) continue;
    if (!exts.some((e) => entry.name.endsWith(e))) continue;
    if (stamped.test(entry.name)) continue;          // 이미 박은 사본
    const p = path.join(dir, entry.name);
    const buf = fs.readFileSync(p);
    const ext = path.extname(entry.name);
    const base = entry.name.slice(0, -ext.length);
    const out = `${base}.${hashOf(buf)}${ext}`;
    fs.writeFileSync(path.join(dir, out), buf);
    map[`/apps/karmolab/${rel}/${entry.name}`] = `/apps/karmolab/${rel}/${out}`;
  }
  return map;
}

/** 지난 배포에서 만든 지문 사본은 지운다 — 안 그러면 폴더가 계속 불어난다. */
function sweepOld(rel, keep) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !stamped.test(entry.name)) continue;
    const full = `/apps/karmolab/${rel}/${entry.name}`;
    if (!keep.has(full)) {
      fs.unlinkSync(path.join(dir, entry.name));
      n++;
    }
  }
  return n;
}

const map = { ...stampDir('js', ['.js']), ...stampDir('css', ['.css']) };
const keep = new Set(Object.values(map));
const swept = sweepOld('js', keep) + sweepOld('css', keep);

fs.writeFileSync(path.join(root, 'js/asset-manifest.json'), JSON.stringify(map, null, 1) + '\n', 'utf8');

/* ── 배포에 나가는 HTML 의 주소를 바꾼다 ─────────────────────────────
   `<script src>` 뿐 아니라 **코드 안 문자열**도 바꾼다 (알람 화면·글꼴 목록이 그렇다).
   그래서 태그가 아니라 주소 모양으로 찾는다. 위젯 주소(`js/widgets/…`)는 슬래시가 하나 더
   있으므로 아래 정규식에 안 걸린다 — 일부러 그렇다. */
const REF_RE = /\/apps\/karmolab\/(js|css)\/([A-Za-z0-9_.-]+)\.(js|css)/g;

/**
 * 이미 지문이 박힌 주소는 **먼저 원래 이름으로 되돌린 뒤** 지금 지문으로 바꾼다.
 *
 * 안 그러면 두 번째 실행부터 조용히 깨진다: 화면에는 지난번 지문이 남아 있는데, 지난 사본은
 * 이 스크립트가 정리해 버리므로 그 주소가 404 가 된다. 화면은 「스타일 한 장이 안 온 채」
 * 멀쩡히 떠서 눈에 잘 안 띈다 — 실제로 그렇게 사이드바가 127개에서 19개로 줄었다.
 */
function rewrite(text) {
  return text.replace(REF_RE, (whole) => {
    const logical = whole.replace(/\.[0-9a-f]{8}(\.(?:js|css))$/, '$1');
    return map[logical] || map[whole] || whole;
  });
}

let pages = 0;     // 실제로 바꾼 화면
let seen = 0;      // 우리 js/css 를 부르는 화면 (바꿀 것이 없어도 센다)
let refs = 0;
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const before = fs.readFileSync(full, 'utf8');
    if (REF_RE.test(before)) seen++;
    REF_RE.lastIndex = 0;
    const after = rewrite(before);
    if (after !== before) {
      fs.writeFileSync(full, after, 'utf8');
      refs += (before.match(REF_RE) || []).length;
      pages++;
    }
  }
}
walk(OUT_PAGES);

if (!seen) {
  // 우리 js/css 를 부르는 화면이 하나도 없다 = 지문이 아무 데도 안 쓰인다 = 캐시 이득 0.
  // 그런데 화면은 멀쩡히 뜨므로 아무도 모른다 — 그래서 여기서 세운다.
  // (바꾼 것이 0 인 것은 정상이다: 이미 지금 지문으로 되어 있으면 바꿀 게 없다.)
  console.error('[stamp-assets] 우리 js/css 를 부르는 화면이 하나도 없다 — 도구 페이지를 먼저 찍어라 (npm run gen:tool-pages).');
  process.exit(1);
}

console.log(
  `[stamp-assets] 지문 박은 파일 ${Object.keys(map).length}개 · 화면 ${seen}장 중 ${pages}장에서 주소 ${refs}곳 교체` +
    (swept ? ` · 지난 사본 ${swept}개 정리` : '')
);
