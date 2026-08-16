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
 *   · **미리읽기 규칙은 지금 막힌다.** `'inline-speculation-rules'` 를 적었는데도 크롬이 거부한다
 *     (실측). 그건 빠르기 도우미일 뿐이라 화면 기능은 멀쩡하다 — 자물쇠를 푸는 값은 아니라고 봤다.
 *     푸는 길이 생기면(헤더를 붙일 수 있는 자리로 옮기거나 바깥 파일로 빼기) 그때 되살린다.
 *
/* ══ 지금은 꺼져 있다 (2026-08-17) ═══════════════════════════════════════════
 * 걸어 보고 재 본 결과, **자물쇠와 「미리읽기 규칙」이 같이 못 산다** — 크롬이
 * `'inline-speculation-rules'` 를 안 받아 규칙이 막히고, 그걸 지키는 검사
 * (`smoke-navigation`: 「도구 주소를 미리 실행하려는 시도」)가 배포를 세운다.
 * 이미 있고 검사가 지키는 **빠르기**를 남기고, 자물쇠는 내렸다.
 * 남겨 둔 것: 이 도구 · 지문 어긋남 검사 · 인라인 손잡이 0 톱니 — 되걸 때 그대로 쓴다.
 * 되걸 조건 = ① 헤더를 붙일 수 있는 자리로 옮기거나(CDN 앞단) ② 크롬이 키워드를 받거나
 *             ③ 미리읽기를 포기하기로 정하거나. 그때 `node scripts/gen-csp-shell.mjs` 한 줄이면 된다.
 * ═══════════════════════════════════════════════════════════════════════════ */
 * 사용: node scripts/gen-csp-shell.mjs [--check]
 * 나가는 값: 0 = 맞다(또는 새로 썼다) / 1 = 어긋났다(--check) / 2 = 못 돌림
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP_CONTENT } from './lib/head-security.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const 화면 = path.join(root, 'index.html');
const 검사만 = process.argv.includes('--check');

if (!fs.existsSync(화면)) {
  console.error('[csp-shell] CANNOT-RUN: index.html 이 없다 — 자리가 옮겨졌는지 볼 것.');
  process.exit(2);
}
const 글 = fs.readFileSync(화면, 'utf8');

/** 실행되는 인라인 스크립트만 고른다(자료·미리읽기 규칙은 뺀다). */
export function 실행되는인라인(html) {
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

const 몸통들 = 실행되는인라인(글);
if (몸통들.length === 0) {
  console.error('[csp-shell] CANNOT-RUN: 인라인 스크립트를 하나도 못 읽었다 — 모양이 바뀌었는지 볼 것.');
  console.error('[csp-shell]   이건 「걸 게 없다」가 아니라 **못 읽었다**는 뜻이다.');
  process.exit(2);
}

/* ★ **나갈 때 글자가 바뀌면 지문이 안 맞는다** (2026-08-17 실측). 이 화면은 Jekyll 을 지나며
   `{{ … }}`(리퀴드)를 값으로 바꾼다 — 소스로 찍은 지문은 그 줄에서 어긋나고, 그 스크립트는
   **조용히 막힌다**(서비스워커 등록이 그렇게 죽을 뻔했다). 그런 자리가 있으면 아예 안 찍는다. */
const 리퀴드 = 몸통들.filter((b) => b.includes('{{') || b.includes('{%'));
if (리퀴드.length) {
  console.error(`[csp-shell] ❌ 인라인 스크립트 ${리퀴드.length}개에 리퀴드가 들어 있다 — 나갈 때 글자가 바뀌어 지문이 안 맞는다.`);
  console.error('  고치기: 그 값을 고정 문자열로 적어라(이 저장소는 baseurl 이 비어 있다).');
  process.exit(1);
}

const 지문들 = 몸통들.map((b) => `'sha256-${crypto.createHash('sha256').update(b, 'utf8').digest('base64')}'`);
const 유일 = [...new Set(지문들)];
/* `'self'` = 우리 파일 · `'inline-speculation-rules'` = 미리읽기 규칙 · 나머지는 지문. */
/* ★ **바깥에서 받아 오는 스크립트도 적어야 한다** (2026-08-17, 배포 모양으로 미리 열어 보고 잡음).
   `'self'` 만 적었더니 방문 수 세는 `gc.zgo.at/count.js` 가 막혔다 — 자물쇠를 걸면서 기능을
   조용히 죽이는 것이 제일 나쁜 결과다. 새 바깥 스크립트를 들이면 여기 한 줄을 늘려야 한다. */
const 바깥 = ['https://gc.zgo.at'];
const 새값 = `${CSP_CONTENT}; script-src 'self' 'inline-speculation-rules' ${바깥.join(' ')} ${유일.join(' ')}`;

const 메타 = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;
const 지금 = 메타.exec(글);
if (!지금) {
  console.error('[csp-shell] CANNOT-RUN: 껍데기에서 보안 한 줄을 못 찾았다.');
  process.exit(2);
}

if (지금[1] === 새값) {
  console.log(`[csp-shell] OK — 지문 ${유일.length}개, 적힌 것과 같다.`);
  process.exit(0);
}
if (검사만) {
  console.error('[csp-shell] ❌ 인라인 스크립트가 바뀌었는데 지문이 그대로다 — 그대로 나가면 화면이 통째로 죽는다.');
  console.error('  고치기: node scripts/gen-csp-shell.mjs (사람이 손으로 적지 마라)');
  process.exit(1);
}

fs.writeFileSync(화면, 글.replace(메타, `<meta http-equiv="Content-Security-Policy" content="${새값}">`), 'utf8');
console.log(`[csp-shell] 지문 ${유일.length}개를 새로 적었다 (인라인 ${몸통들.length}개).`);
