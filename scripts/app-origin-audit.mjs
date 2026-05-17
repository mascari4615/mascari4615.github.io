#!/usr/bin/env node
// KarmoLab Tauri "앱 origin" 정합 + liveness 게이트 — master invariant.
//
// 정본 = `apps/karmolab-tauri/src-tauri/tauri.release.conf.json` 의
// build.frontendDist (= prod 앱이 로드하는 곳, 단일 선언적 진실).
//
// 막는 사고 2종 (TASK-KL-064 포스트모템):
//  A. config 드리프트 — 도메인/origin 을 바꿀 때 흩어진 참조(base conf /
//     lib.rs 상수 / allow_in_webview / capabilities)가 *전부* 안 바뀜 →
//     prod 빈화면. 옛 코드는 단일정본도 cross-check 도 없었음.
//  B. stale URL — 정본 URL 이 301/리다이렉트/non-200 (사이트가 커스텀
//     도메인 이전했는데 config 가 옛 github.io 가리킴). 웹뷰가 redirect
//     stub 로딩 + 새 host 미-allowlist → 빈화면. 실제 이번 사고.
//
// 둘 다 사람이 "전부 바꿨겠지" 믿으면 또 샌다 → 기계가 매 push 검증.
// 호출: scripts/verify.mjs (master invariant) + npm run acl-audit 류.

import { readFileSync } from 'node:fs';

const T = 'apps/karmolab-tauri/src-tauri';
const FAIL = [];
const fail = (m) => FAIL.push(m);

function hostOf(u) {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}

// ── 0. 단일 정본: release conf frontendDist ──────────────────────────────
let canonical;
try {
  const rel = JSON.parse(readFileSync(`${T}/tauri.release.conf.json`, 'utf8'));
  canonical = rel?.build?.frontendDist;
} catch (e) {
  console.error(`[app-origin-audit] X tauri.release.conf.json 읽기 실패: ${e.message}`);
  process.exit(1);
}
if (!canonical || !/^https:\/\//.test(canonical)) {
  console.error(
    `[app-origin-audit] X release conf 의 build.frontendDist 가 https URL 이 아님: ${canonical}`,
  );
  process.exit(1);
}
const canonHost = hostOf(canonical);
console.log(`[app-origin-audit] 정본 prod origin = ${canonical} (host=${canonHost})`);

// ── 1. 흩어진 참조 일치 cross-check (드리프트 A) ──────────────────────────
// base tauri.conf.json frontendDist
try {
  const base = JSON.parse(readFileSync(`${T}/tauri.conf.json`, 'utf8'));
  const h = hostOf(base?.build?.frontendDist);
  if (h !== canonHost) {
    fail(`tauri.conf.json frontendDist host=${h} ≠ 정본 ${canonHost}`);
  }
} catch (e) {
  fail(`tauri.conf.json 읽기 실패: ${e.message}`);
}

// lib.rs: KARMOLAB_WEB_URL 상수 host + allow_in_webview 에 canonHost 리터럴
let librs = '';
try {
  librs = readFileSync(`${T}/src/lib.rs`, 'utf8');
} catch (e) {
  fail(`lib.rs 읽기 실패: ${e.message}`);
}
if (librs) {
  const m = librs.match(/KARMOLAB_WEB_URL\s*:\s*&str\s*=\s*"([^"]+)"/);
  if (!m) fail('lib.rs 에서 KARMOLAB_WEB_URL 상수 못 찾음');
  else if (hostOf(m[1]) !== canonHost) {
    fail(`lib.rs KARMOLAB_WEB_URL host=${hostOf(m[1])} ≠ 정본 ${canonHost}`);
  }
  // allow_in_webview 가 canonHost 를 명시 허용해야 (안 그러면 navigation 거부=빈화면)
  if (!librs.includes(`"${canonHost}"`)) {
    fail(`lib.rs allow_in_webview 에 정본 host "${canonHost}" 리터럴 없음 (웹뷰 navigation 거부 → 빈화면 위험)`);
  }
}

// capabilities/default.json remote.urls 에 https://canonHost/* 포함
try {
  const caps = JSON.parse(readFileSync(`${T}/capabilities/default.json`, 'utf8'));
  const urls = caps?.remote?.urls ?? [];
  const ok = urls.some((u) => hostOf(u) === canonHost);
  if (!ok) {
    fail(`capabilities/default.json remote.urls 에 정본 host ${canonHost} 없음 (IPC/이벤트 차단)`);
  }
} catch (e) {
  fail(`capabilities/default.json 읽기 실패: ${e.message}`);
}

// ── 2. liveness: 정본 URL 이 실제로 200 직빵인가 (드리프트 B = 이번 사고) ──
// 3xx → 다른 host = HARD FAIL (config 가 옛 주소·사이트 이전 = 결정적 드리프트).
// network 에러/타임아웃 = WARN (transient, CI 비차단). 200 = pass.
async function liveness() {
  if (process.env.APP_ORIGIN_AUDIT_SKIP_LIVENESS === '1') {
    console.log('[app-origin-audit] ! liveness skip (APP_ORIGIN_AUDIT_SKIP_LIVENESS=1)');
    return;
  }
  let res;
  try {
    const ac = AbortSignal.timeout(10000);
    res = await fetch(canonical, { redirect: 'manual', signal: ac });
  } catch (e) {
    console.log(`[app-origin-audit] ! liveness 네트워크 도달 실패(transient 취급, 비차단): ${e.message}`);
    return;
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location') || '(no Location)';
    fail(
      `정본 URL ${canonical} 이 ${res.status} 리다이렉트 → ${loc}. ` +
        `사이트 이전/주소 변경인데 config 가 옛 주소 가리킴 — frontendDist 를 최종 주소로, ` +
        `allow_in_webview·capabilities 도 그 host 로 갱신 (KL-064 사고 시그니처).`,
    );
  } else if (res.status !== 200) {
    console.log(
      `[app-origin-audit] ! 정본 URL ${res.status} (200 아님). transient outage 가능 — ` +
        `비차단 경고. 지속되면 frontendDist 점검.`,
    );
  } else {
    console.log(`[app-origin-audit] OK liveness — ${canonical} = 200 직응답`);
  }
}

await liveness();

if (FAIL.length) {
  console.error('\n[app-origin-audit] X 앱 origin 정합 실패:');
  for (const f of FAIL) console.error(`  - ${f}`);
  console.error(
    '\n정본 = tauri.release.conf.json build.frontendDist. 도메인/주소 변경 시 ' +
      '이 정본 + 위 참조 전부 동시 갱신해야 함 (TASK-KL-064).',
  );
  process.exit(1);
}
console.log('[app-origin-audit] OK — 앱 origin 정합 + liveness 통과');
