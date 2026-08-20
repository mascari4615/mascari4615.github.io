/**
 * 첫 화면(껍데기)에 **script-src 자물쇠**를 건다 — 인라인 스크립트는 지문으로 허락한다 (2026-08-17).
 *
 * 왜: 이 사이트는 GitHub Pages 라 응답 머리글을 못 붙인다. 붙일 수 있는 자리는 `<meta>` 뿐이고,
 * 지금까지 거기 걸린 건 셋(object-src·base-uri·form-action)뿐이었다. 제일 중요한 `script-src`
 * 를 못 건 까닭은 **인라인**이었다 — 글자로 박은 손잡이(onclick…)와 인라인 `<script>` 둘 다.
 * 손잡이는 오늘 0 이 됐다(표시 + 위임). 남은 인라인 `<script>` 는 **지우는 게 답이 아니다**:
 * 테마 깜빡임 막기·부팅 눈금처럼 **그려지기 전에** 돌아야 하는 것들이라 파일로 빼면 늦는다.
 * 그래서 CSP 가 원래 주는 길을 쓴다 — **내용의 지문(sha256)** 을 적어 두고 그것만 허락.
 *
 * 규율
 *   · 지문은 **사람이 적지 않는다.** 한 글자만 달라도 화면이 통째로 죽는다 — 그래서 여기서 찍는다.
 *   · `type="application/ld+json"` 은 실행되는 스크립트가 아니라 자료다(지문 대상 아님).
 *   · `type="speculationrules"` 는 CSP 가 따로 `'inline-speculation-rules'` 로 받는다.
 *   · 껍데기 한 장만 건다. 도구 상세 146장은 인라인 구성이 달라 다음 걸음이다(한 번에 다 걸면
 *     한 장이라도 어긋날 때 **사이트 전체**가 죽는다 — 그건 안전이 아니라 사고다).
 *
 * 알고 있는 값(2026-08-17, 배포 모양으로 열어 재고 적음)
 *   · 바깥 스크립트: 방문 수(`gc.zgo.at`) 하나 — 자물쇠에 적어 뒀다. 새로 들이면 여기 늘려야 한다.
 *   · **미리읽기 규칙은 이제 안 막힌다** — `'inline-speculation-rules'` 를 meta 로 줘도 크롬이 받는다(2026-08-17 실측).
 *
 *
 *
 * ── 2026-08-17: 켰다가 다시 내렸다 — 진짜 이유를 알아냈다 ──
 * 두 가지가 겹쳐 있었고 어제는 둘을 하나로 뭉뚱그려 「크롬이 키워드를 안 받는다」고 적었다.
 *   ① **줄바꿈**: 이 파일은 CRLF 인데 HTML 을 읽는 단계에서 LF 로 바뀐다 — 파일에서 뜬 지문이
 *      브라우저 것과 하나도 안 맞아 인라인 열두 개가 전부 막혔다. 그건 오늘 고쳤다(줄맞춤).
 *   ② **지문과 미리읽기는 같이 못 산다**: `script-src` 에 지문을 하나라도 적으면 크롬이
 *      `'inline-speculation-rules'` 를 **무시한다**. 실험으로 갈랐다(meta CSP, 미리받기 요청 수):
 *        자물쇠 없음 1회 · 키워드 없음 0회 · 키워드만 1회 · **키워드 + 가짜 지문 하나 0회**.
 *      ①만 고치고 걸었더니 배포가 `smoke-lang-switch` 에서 섰다(실측) — 그래서 다시 내렸다.
 * 되걸 조건은 이제 셋이 아니라 둘이다:
 *   · 인라인 <script> 를 **0개**로 만든다(지문이 필요 없어진다 → `'self'` 만으로 충분).
 *   · 또는 미리읽기(prerender)를 포기한다. 그건 체감 속도를 버리는 결정이라 사람이 정한다.
 *
 * ── 2026-08-17 저녁: 첫째 조건이 어디까지 가능한지 재 봤다 ──
 *   인라인 12 → **5** 까지 줄였다(늦게 받는 것 셋 합치기 · 글꼴·방문기록·알람·색칠 경로를
 *   `src/boot-late.ts` 로 빼기). 남은 다섯은 **그려지기 전에 돌아야 하는 것**이다:
 *     테마 깜빡임 막기 · 부팅 눈금 · 큰제목 글자 쪼개기 · 기분 API 대기줄 · 서비스워커 등록.
 *   그중 기분 API 대기줄은 옮기면 위젯이 죽는다 — 예전에 스크립트 차례를 바꿨다가
 *   「Mdd is not defined」로 위젯 등록이 끊긴 적이 있다(`smoke-live-pages.mjs` 머리말).
 *   즉 **지금 구조로는 0 이 안 된다**. 0 으로 가려면 첫 그림 앞에서 도는 것들을 하나의
 *   외부 파일로 묶고 `<script src>` 로 앞세우는 큰 손질이 필요하다 — 그건 첫 그림 예산을
 *   다시 재야 하는 일이라 따로 판을 잡는다. 지금 수(5)는 `smoke-shell-nav` 가 천장으로 지킨다.
 * * 줄맞춤·지문 찍기·어긋남 검사는 그대로 남긴다 — 되걸 때 그대로 쓴다.
 * ------------------------------------------------------------
 * 사용: node scripts/gen-csp-shell.mjs [--check]
 * 나가는 값: 0 = 맞다(또는 새로 썼다) / 1 = 어긋났다(--check) / 2 = 못 돌림
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP_CONTENT } from './lib/head-security.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const screen = path.join(root, 'index.html');
const gatesOnly = process.argv.includes('--check');

if (!fs.existsSync(screen)) {
  console.error('[csp-shell] CANNOT-RUN: index.html 이 없다 — 자리가 옮겨졌는지 볼 것.');
  process.exit(2);
}
const text = fs.readFileSync(screen, 'utf8');

/** 실행되는 인라인 스크립트만 고른다(자료·미리읽기 규칙은 뺀다). */
export function executableInline(html) {
  const out = [];
  const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  for (const m of html.matchAll(re)) {
    const attr = m[1] || '';
    const type = /type\s*=\s*"([^"]+)"/.exec(attr)?.[1] || '';
    if (type && type !== 'text/javascript' && type !== 'module') continue; // ld+json · speculationrules …
    out.push(m[2]);
  }
  return out;
}

const bodies = executableInline(text);
if (bodies.length === 0) {
  console.error('[csp-shell] CANNOT-RUN: 인라인 스크립트를 하나도 못 읽었다 — 모양이 바뀌었는지 볼 것.');
  console.error('[csp-shell]   이건 「걸 게 없다」가 아니라 **못 읽었다**는 뜻이다.');
  process.exit(2);
}

/* ★ **나갈 때 글자가 바뀌면 지문이 안 맞는다** (2026-08-17 실측). 이 화면은 Jekyll 을 지나며
   `{{ … }}`(리퀴드)를 값으로 바꾼다 — 소스로 찍은 지문은 그 줄에서 어긋나고, 그 스크립트는
   **조용히 막힌다**(서비스워커 등록이 그렇게 죽을 뻔했다). 그런 자리가 있으면 아예 안 찍는다. */
const liquid = bodies.filter((b) => b.includes('{{') || b.includes('{%'));
if (liquid.length) {
  console.error(`[csp-shell] ❌ 인라인 스크립트 ${liquid.length}개에 리퀴드가 들어 있다 — 나갈 때 글자가 바뀌어 지문이 안 맞는다.`);
  console.error('  고치기: 그 값을 고정 문자열로 적어라(이 저장소는 baseurl 이 비어 있다).');
  process.exit(1);
}

/* ★ **브라우저는 줄바꿈을 고쳐 읽는다** (2026-08-17, 크롬이 기대한 지문과 대조해 알아냈다).
   이 파일은 CRLF 인데, HTML 을 읽는 단계에서 CRLF 는 LF 하나로 바뀐다 — 그래서 브라우저가
   지문을 뜨는 글과 파일에 있는 글이 다르다. 그대로 찍으면 **인라인 열두 개가 전부 막힌다**
   (실측: 첫 화면이 통째로 죽었고, 그때 「크롬이 미리읽기 키워드를 안 받는다」로 잘못 읽었다).
   그러니 지문은 **LF 로 맞춘 글**에서 뜬다. */
const alignment = (b) => b.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const hashes = bodies.map((b) => `'sha256-${crypto.createHash('sha256').update(alignment(b), 'utf8').digest('base64')}'`);
const unique = [...new Set(hashes)];
/* `'self'` = 우리 파일 · `'inline-speculation-rules'` = 미리읽기 규칙 · 나머지는 지문. */
/* ★ **바깥에서 받아 오는 스크립트도 적어야 한다** (2026-08-17, 배포 모양으로 미리 열어 보고 잡음).
   `'self'` 만 적었더니 방문 수 세는 `gc.zgo.at/count.js` 가 막혔다 — 자물쇠를 걸면서 기능을
   조용히 죽이는 것이 제일 나쁜 결과다. 새 바깥 스크립트를 들이면 여기 한 줄을 늘려야 한다. */
const outside = ['https://gc.zgo.at'];
const nextValue = `${CSP_CONTENT}; script-src 'self' 'inline-speculation-rules' ${outside.join(' ')} ${unique.join(' ')}`;

const 메타 = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;
const current = 메타.exec(text);
if (!current) {
  console.error('[csp-shell] CANNOT-RUN: 껍데기에서 보안 한 줄을 못 찾았다.');
  process.exit(2);
}

if (current[1] === nextValue) {
  console.log(`[csp-shell] OK — 지문 ${unique.length}개, 적힌 것과 같다.`);
  process.exit(0);
}
if (gatesOnly) {
  console.error('[csp-shell] ❌ 인라인 스크립트가 바뀌었는데 지문이 그대로다 — 그대로 나가면 화면이 통째로 죽는다.');
  console.error('  고치기: node scripts/gen-csp-shell.mjs (사람이 손으로 적지 마라)');
  process.exit(1);
}

fs.writeFileSync(screen, text.replace(메타, `<meta http-equiv="Content-Security-Policy" content="${nextValue}">`), 'utf8');
console.log(`[csp-shell] 지문 ${unique.length}개를 새로 적었다 (인라인 ${bodies.length}개).`);
