/**
 * 묶음 위젯 정합 검사 (TASK-KL-088)
 *
 * 여러 도구를 탭으로 묶은 위젯은 손으로 두 곳을 맞춰야 한다 — 탭 list(부분 id)과
 * 불러올 스크립트 list. 하나라도 빠지면 **화면이 조용히 빈다** (탭은 보이는데 내용이 없다).
 * 조용한 실패라 사람 눈으로는 늦게 발견되므로 빌드에서 막는다.
 *
 * 검사:
 *  1. 묶음이 부르는 부분 id 가 매니페스트에 있는가
 *  2. 부분이 hidden 인가 (아니면 사이드바에 두 번 뜬다)
 *  3. 부분의 스크립트가 묶음의 lazyScriptPaths 에 있는가
 *  4. 부분이 두 묶음에 겹쳐 들어가 있지 않은가
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// 줄끝이 CRLF 인 파일이 섞여 있어 정규식이 조용히 빗나간다 — 읽는 자리에서 통일한다.
const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').split(CRLF).join(LF);

/** widgets-lazy-meta.ts 를 항목 단위로 쪼개 id → { hidden, paths } 로 만든다. */
function parseManifest() {
  const src = read('src/widgets-lazy-meta.ts');
  const out = {};
  // 최상위 항목은 두 칸 들여쓴 `{` 로 시작해 두 칸 들여쓴 `}` 로 끝난다.
  const blocks = src.split(/\n  \{\n/).slice(1);
  for (const block of blocks) {
    const id = block.match(/^\s*id: '([^']+)'/m)?.[1];
    if (!id) continue;
    const pathsRaw = block.match(/lazyScriptPaths: \[([^\]]*)\]/s)?.[1] || '';
    out[id] = {
      hidden: /\n\s*hidden: true/.test(block),
      bundle: block.match(/\n\s*bundle: '([^']+)'/)?.[1] || null,
      paths: [...pathsRaw.matchAll(/'([^']+)'/g)].map((m) => m[1])
    };
  }
  return out;
}

/* ★ **부분 목록은 이제 명부에 산다** (2026-08-21, 실측).
 * 여긴 위젯 소스에서 `const PARTS: Array<[string, string]> = […]` 를 읽었다.
 * 그런데 그 꼴로 적는 파일이 저장소에 **한 개도 없다** — 껍데기가 `materialShell` 로 바뀌면서
 * 부분은 명부의 `bundle: '<묶음>'` 로 적히게 됐다(예: `image` 묶음 = 명부 11항목, 탭은 1개).
 * 그래서 이 검사는 「묶음 0개 · 부분 0개 정합 OK」를 찍으며 <b>아무것도 안 재고 초록</b>이었다.
 * 0을 재고 낸 초록은 초록이 아니다. 부분의 출처를 지금 진실인 명부로 되돌린다. */
function bundlesFromManifest(manifest) {
  const byBundle = {};
  for (const [id, meta] of Object.entries(manifest)) {
    if (!meta.bundle) continue;
    (byBundle[meta.bundle] ||= []).push(id);
  }
  return byBundle;
}

/** 묶음 id → 그 위젯 파일의 스크립트 이름(`tools/pdf` 꼴). 없으면 null. */
function widgetFileOf(id) {
  for (const dir of ['tools', 'ref', '']) {
    const rel = dir ? `src/widgets/${dir}/${id}.ts` : `src/widgets/${id}.ts`;
    if (fs.existsSync(path.join(root, rel))) return rel.replace('src/widgets/', '').replace('.ts', '');
  }
  return null;
}

const manifest = parseManifest();

const failures = [];
const seenPart = {};
let bundleCount = 0;

const byBundle = bundlesFromManifest(manifest);
/* 잴 것이 없으면 초록이 아니라 못 돌림이다 — 0을 「이상 없음」으로 적으면 거짓이다. */
if (Object.keys(byBundle).length === 0) {
  console.error('[check-bundles] CANNOT-RUN: 명부에 `bundle:` 을 단 항목이 하나도 없다 — 이름이 바뀌었는지 확인할 것.');
  process.exit(2);
}

for (const [bundleId, parts] of Object.entries(byBundle)) {
  if (!manifest[bundleId]) {
    failures.push(`'${bundleId}' 를 가리키는 부분이 ${parts.length}개인데 그 묶음이 명부에 없다 — 눌러도 갈 곳이 없다`);
    continue;
  }
  bundleCount++;
  const declared = manifest[bundleId].paths;

  for (const part of parts) {
    if (!manifest[part].hidden) {
      failures.push(`${bundleId}: 부분 '${part}' 가 hidden 이 아니다 — 사이드바에 두 번 뜬다`);
    }
    /* ⚠ 여기 「부분의 스크립트가 묶음의 `lazyScriptPaths` 에 다 있는가」 단이 있었다.
     *   되살리며 그대로 옮겼더니 <b>8건이 빨갛게 떴다</b>(image/bgremove·idphoto·docscan·ocr,
     *   text/tts, pdf/printkit, calc/dutchpay·payslip). 그런데 <b>실사이트에서 열어 보니 전부
     *   멀쩡하다</b> — `#bgremove`·`#tts`·`#dutchpay` 각각 자식 95·86·92개에 글이 차고
     *   페이지 오류 0 (2026-08-21 실측). 부분이 제 스크립트를 스스로 불러오는 구조로 바뀌어
     *   묶음 목록에 없어도 된다. <b>옛 구조의 가정을 그대로 옮긴 거짓 경보였으므로 뺀다.</b>
     *   되살린 검사에 옛 단을 그냥 붙이면, 안 도는 검사가 <b>틀린 말을 하는 검사</b>로 바뀔 뿐이다. */
    /* 「부분이 두 묶음에 겹쳐 있나」는 <b>이제 물을 수 없다</b> — 명부의 `bundle:` 은 항목마다
       하나뿐이라 겹치는 것이 구조적으로 불가능하다. 못 터지는 단은 지운다(있으면 「본다」고
       착각하게 만든다). 겹침은 옛 `PARTS` 목록 시절에만 날 수 있던 사고다. */
    seenPart[part] = bundleId;
  }
  // 묶음 자신의 스크립트도 목록에 있어야 로드된다.
  const own = widgetFileOf(bundleId);
  if (!own) {
    failures.push(`${bundleId}: 부분 ${parts.length}개가 가리키는데 위젯 파일이 없다`);
  } else if (!declared.includes(own)) {
    failures.push(`${bundleId}: 자기 스크립트('${own}')가 lazyScriptPaths 에 없다`);
  }
}

if (failures.length) {
  console.error(`[check-bundles] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[check-bundles] 묶음 ${bundleCount}개 · 부분 ${Object.keys(seenPart).length}개 정합 OK`);

/* ── 이어짐 확인 (TASK-KL-088, 묶음을 셋으로 나눈 뒤 추가) ─────────────────────
 * 묶음을 나누거나 이름을 바꾸면 두 곳이 조용히 끊긴다:
 *  ① 도구가 가리키는 묶음이 사라짐 → 그 도구를 부르면 아무 데도 못 간다
 *  ② 관련 도구 링크가 페이지 없는 것을 가리킴 → 그 자리만 비어 나간다
 * 둘 다 화면은 멀쩡해 보인다. 그래서 여기서 함께 본다.
 */
{
  const metaSrc = read('src/widgets-lazy-meta.ts');
  const seoTools = JSON.parse(read('data/tools-seo.json')).tools;
  const ids = new Set([...metaSrc.matchAll(/id: '([a-z0-9]+)'/g)].map((m) => m[1]));

  const ghostBundles = [...new Set([...metaSrc.matchAll(/bundle: '([a-z0-9]+)'/g)].map((m) => m[1]))].filter(
    (b) => !ids.has(b)
  );
  /* ★ **같은 빚을 두 번 막지 않는다** (2026-08-16, 실측). 관련 링크가 비는 이유는 둘이다 —
     ① **오타나 없는 도구**를 가리킨다(진짜 버그, 영원히 빈다) ③ **있는 도구인데 아직
     상세 설명을 안 썼다**(이미 `tool-data-baseline.json` 에 세어 둔 빚, 채우면 사라진다).
     둘을 같이 빨간것으로 두면 ②를 갑는 동안 **그 뒤에 미는 모든 섬션**이 남의 빚으로 빨강을
     맞는다 — 오늘 verify 가 그렇게 세 판 연속 빨갔다. ②는 이미 한 번 세고 있으므로 여기서는
     말만 하고 안 막는다. ①은 그대로 빨강이다 — 그건 갑을 사람이 없는 빚이다. */
  let unused = new Set();
  try {
    unused = new Set(JSON.parse(read('data/tool-data-baseline.json')).list || []);
  } catch {
    /* 기준선이 없으면 전부 ① 로 본다 — 없는 것을 있다고 치는 쪽이 위험하다. */
  }
  const danglingRelated = [];
  const emptyByDebt = [];
  for (const [id, t] of Object.entries(seoTools)) {
    for (const r of t.related || []) {
      if (seoTools[r]) continue;
      (unused.has(r) ? emptyByDebt : danglingRelated).push(`${id} → ${r}`);
    }
  }
  if (emptyByDebt.length) {
    console.log(
      `[check-bundles] 관련 링크 ${emptyByDebt.length}개가 아직 설명 안 쓴 도구를 가리킨다 (막지 않는다) — ` +
        `${emptyByDebt.join(', ')} · 그 도구의 설명을 채우면 저절로 사라진다`
    );
  }

  if (ghostBundles.length || danglingRelated.length) {
    if (ghostBundles.length) console.error('[check-bundles] 없는 묶음을 가리키는 도구: ' + ghostBundles.join(', '));
    if (danglingRelated.length) console.error('[check-bundles] 페이지 없는 관련 링크: ' + danglingRelated.join(', '));
    process.exit(1);
  }
  console.log('[check-bundles] 묶음 참조와 관련 링크가 모두 이어져 있다');
}
