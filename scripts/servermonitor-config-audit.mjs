#!/usr/bin/env node
// Server Monitor 설정 정합 audit — TASK-KL-066.
// 사고 패턴: `karmolab-tauri` 의 npm 스크립트가 `dev:dual` → `dev` 로 rename 됐는데
//   servermonitor-config.json 이 손기재 `["run","dev:dual"]` 그대로 → 카드가
//   `npm error Missing script: "dev:dual"` 로 *조용히* 죽음 (사용자 발견).
// 호출처: `node scripts/servermonitor-config-audit.mjs` / `npm run verify` (verify.mjs).
//
// 근본: devProfiles 의 npm-script 프로필은 program/args/cwd 를 손기재하지 않고
//   `{ app, script }` 참조만 둔다 (Rust `DevProfile::resolve` / TS `resolveProfile` 가
//   `npm run <script>` @ app 으로 파생 — drift 구조적 불가). 이 audit 는 그 참조가
//   실제 `<app>/package.json` 의 scripts 에 존재하는지 *정본을 직접* cross-check 한다.
//   → 죽은 카드가 main 에 못 들어옴 (verify 게이트 fail).
//
// 검증 규칙 (모두 통과해야 exit 0):
//   npm-script 형식 ({script} 보유):
//     - app 필수, raw 필드(program/args/cwd) 동시 보유 금지 (형식 모호)
//     - <app>/package.json 존재 + .scripts[script] 존재
//     - deployScript 있으면 .scripts[deployScript] 존재
//   raw 형식 ({script} 없음):
//     - program ∈ {npm,npx,bundle,ruby,node} (Rust program_allowed 와 동일)
//     - cwd 필수 + 레포 내 실재 디렉토리
//     - deployScript 금지 (Rust resolve 가 raw 엔 deploy 미지원)

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const CONFIG_REL = 'apps/karmolab/data/servermonitor-config.json';
const CONFIG_PATH = join(REPO, CONFIG_REL);
// Rust local_dev.rs program_allowed 와 동일 (drift 시 양쪽 동시 갱신).
const ALLOWED_PROGRAMS = new Set(['npm', 'npx', 'bundle', 'ruby', 'node']);

if (!existsSync(CONFIG_PATH)) {
  console.error(`[sm-audit] X  설정 파일 없음: ${CONFIG_REL}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`[sm-audit] X  JSON 파싱 실패 (${CONFIG_REL}): ${e.message}`);
  process.exit(1);
}

const profiles = Array.isArray(config.devProfiles) ? config.devProfiles : [];
const failures = [];

function pkgScripts(appRel) {
  const pkgPath = join(REPO, appRel, 'package.json');
  if (!existsSync(pkgPath)) return { ok: false, reason: `${appRel}/package.json 없음` };
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return { ok: true, scripts: pkg.scripts ?? {} };
  } catch (e) {
    return { ok: false, reason: `${appRel}/package.json 파싱 실패: ${e.message}` };
  }
}

for (const p of profiles) {
  const id = p?.id ?? '(id 없음)';
  const hasScriptForm = typeof p?.script === 'string' && p.script.length > 0;
  const hasRawForm =
    p?.program !== undefined || p?.args !== undefined || p?.cwd !== undefined;

  if (hasScriptForm) {
    if (hasRawForm) {
      failures.push(`${id}: script 형식인데 raw 필드(program/args/cwd)도 보유 — 형식 모호`);
    }
    if (typeof p.app !== 'string' || p.app.length === 0) {
      failures.push(`${id}: script 형식엔 app 필요`);
      continue;
    }
    const ps = pkgScripts(p.app);
    if (!ps.ok) {
      failures.push(`${id}: ${ps.reason}`);
      continue;
    }
    if (!(p.script in ps.scripts)) {
      failures.push(
        `${id}: ${p.app}/package.json 에 script "${p.script}" 없음 ` +
          `(있는 것: ${Object.keys(ps.scripts).join(', ') || '없음'})`
      );
    }
    if (typeof p.deployScript === 'string' && p.deployScript.length > 0) {
      if (!(p.deployScript in ps.scripts)) {
        failures.push(
          `${id}: ${p.app}/package.json 에 deployScript "${p.deployScript}" 없음`
        );
      }
    }
  } else {
    // raw 형식
    if (typeof p?.program !== 'string' || !ALLOWED_PROGRAMS.has(p.program)) {
      failures.push(
        `${id}: raw program "${p?.program}" 비허용 ` +
          `(허용: ${[...ALLOWED_PROGRAMS].join(', ')}; 또는 {app,script} 형식 사용)`
      );
    }
    if (typeof p?.cwd !== 'string' || p.cwd.length === 0) {
      failures.push(`${id}: raw 형식엔 cwd 필요`);
    } else {
      const cwdAbs = join(REPO, p.cwd);
      if (!existsSync(cwdAbs) || !statSync(cwdAbs).isDirectory()) {
        failures.push(`${id}: cwd "${p.cwd}" 가 레포 내 디렉토리가 아님`);
      }
    }
    if (!Array.isArray(p?.args)) {
      failures.push(`${id}: raw 형식엔 args 배열 필요`);
    }
    if (p?.deployScript !== undefined || p?.deployArgs !== undefined) {
      failures.push(`${id}: raw 형식은 deploy 미지원 (deployScript/deployArgs 제거 — {app,script} 형식만 deploy 가능)`);
    }
  }
}

// ── KL-068: Rust DevProfile forward-compat 계약 기계 강제 ──
// 사고: KL-066 가 `cwd` 를 Rust DevProfile 필수 필드로 둔 채 config 스키마를 바꿔
//   ≤v0.1.19 바이너리가 신형 config 를 serde hard-fail → 카드 사망. 룰(텍스트)만
//   두면 또 잊는다 → 「형식-변종 필드는 전부 #[serde(default)]」 를 여기서 강제.
//   id/label 만 예외(프로필 정체성 = 항상 존재, 제거 불가한 안정 필드).
const FWD_COMPAT_ALLOWLIST = new Set(['id', 'label']);
function auditRustForwardCompat() {
  const rsRel = 'apps/karmolab-tauri/src-tauri/src/local_dev.rs';
  const rsPath = join(REPO, rsRel);
  if (!existsSync(rsPath)) {
    failures.push(`[fwd-compat] ${rsRel} 없음 (DevProfile 계약 검증 불가)`);
    return;
  }
  const src = readFileSync(rsPath, 'utf8');
  const m = src.indexOf('struct DevProfile {');
  if (m < 0) {
    failures.push(`[fwd-compat] ${rsRel} 에 'struct DevProfile {' 없음 — 리팩터 시 본 게이트 갱신 필요`);
    return;
  }
  // 여는 { 부터 brace 매칭으로 본문 슬라이스.
  const open = src.indexOf('{', m);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    failures.push(`[fwd-compat] DevProfile 본문 brace 매칭 실패`);
    return;
  }
  const body = src.slice(open + 1, end);
  let attrs = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) continue;
    if (line.startsWith('#[')) {
      attrs.push(line);
      continue;
    }
    const fld = line.match(/^(?:pub\s+)?([a-z_][a-z0-9_]*)\s*:/);
    if (fld) {
      const name = fld[1];
      const hasDefault = attrs.some((a) => a.includes('serde(default)'));
      if (!FWD_COMPAT_ALLOWLIST.has(name) && !hasDefault) {
        failures.push(
          `[fwd-compat] DevProfile.${name} 가 #[serde(default)] 없는 필수 필드 — ` +
            `옛 바이너리가 신형 config 를 만나면 serde hard-fail(KL-066/KL-068). ` +
            `Option<T> + #[serde(default)] 로 두거나 resolve() 에서 의미 검증할 것.`
        );
      }
    }
    attrs = [];
  }
}
auditRustForwardCompat();

/* ── 트레이 빠른 손잡이 (tray-menu.json) ────────────────────────────────────────
   같은 사고 갈래라 같은 자리에서 막는다: **설정이 실재하지 않는 것을 가리키는 것.**
   트레이 줄은 눌러 봐야 죽은 걸 아는데, 트레이는 하루에 한 번 열까 말까다 — 그때
   알면 늦다. dev 줄은 devProfiles id 를, tool 줄은 위젯 id 를 정본과 맞춘다. */
const TRAY_REL = 'apps/karmolab/data/tray-menu.json';

function auditTrayMenu() {
  const trayPath = join(REPO, TRAY_REL);
  if (!existsSync(trayPath)) return; // 손잡이를 안 쓰는 저장소도 있다 — 없는 건 위반이 아니다.

  let tray;
  try {
    tray = JSON.parse(readFileSync(trayPath, 'utf8'));
  } catch (e) {
    failures.push(`[tray] JSON 파싱 실패 (${TRAY_REL}): ${e.message}`);
    return;
  }

  const items = Array.isArray(tray.items) ? tray.items : [];
  const profileIds = new Set(profiles.map((p) => p?.id).filter(Boolean));

  // 위젯 id 정본 = widgets-lazy-meta.ts 의 `id: '...'` + core-tools.json 의 열쇠.
  const widgetIds = new Set();
  const metaPath = join(REPO, 'apps/karmolab/src/widgets-lazy-meta.ts');
  if (existsSync(metaPath)) {
    for (const m of readFileSync(metaPath, 'utf8').matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)) {
      widgetIds.add(m[1]);
    }
  }
  const corePath = join(REPO, 'apps/karmolab/data/core-tools.json');
  if (existsSync(corePath)) {
    try {
      for (const id of Object.keys(JSON.parse(readFileSync(corePath, 'utf8')))) widgetIds.add(id);
    } catch { /* 이 파일은 다른 검사가 본다 */ }
  }

  const seen = new Set();
  for (const item of items) {
    const id = item?.id ?? '(id 없음)';
    if (typeof item?.id !== 'string' || item.id.length === 0) {
      failures.push(`[tray] id 없는 줄 — 메뉴 항목을 구분할 수 없다`);
      continue;
    }
    if (seen.has(item.id)) failures.push(`[tray] ${id}: id 가 겹친다 — 뒤 줄이 앞 줄을 덮는다`);
    seen.add(item.id);
    if (typeof item?.label !== 'string' || item.label.length === 0) {
      failures.push(`[tray] ${id}: label 이 없다 — 빈 줄이 뜬다`);
    }

    if (item?.kind === 'dev') {
      if (!profileIds.has(item.profile)) {
        failures.push(
          `[tray] ${id}: dev 줄이 없는 프로필 「${item.profile}」 을 가리킨다 ` +
            `(devProfiles 에 그 id 가 없다 — 눌러도 아무 일도 안 난다)`
        );
      }
    } else if (item?.kind === 'tool') {
      if (widgetIds.size > 0 && !widgetIds.has(item.tool)) {
        failures.push(
          `[tray] ${id}: tool 줄이 없는 위젯 「${item.tool}」 을 가리킨다 ` +
            `(창은 열리는데 빈 화면이 뜬다)`
        );
      }
    } else if (item?.kind === 'url') {
      if (typeof item.url !== 'string' || !/^https?:\/\//.test(item.url)) {
        failures.push(`[tray] ${id}: url 줄인데 주소가 http(s) 로 시작하지 않는다`);
      }
    } else if (item?.kind === 'files') {
      // Files 전용 창. 가리킬 프로필·위젯·주소가 없다 — 주소는 앱이 main 창에서 파생한다.
    } else {
      failures.push(
        `[tray] ${id}: 모르는 kind 「${item?.kind}」 — 앱이 그 줄을 통째로 버린다 ` +
          `(dev|tool|url|files 중 하나)`
      );
    }
  }
  trayCount = items.length;
}
let trayCount = 0;
auditTrayMenu();

if (failures.length === 0) {
  console.log(
    `[sm-audit] OK — devProfiles ${profiles.length}개 · 트레이 손잡이 ${trayCount}개 정합 ` +
      `(npm-script 참조 ⟷ <app>/package.json scripts · 트레이 줄 ⟷ 프로필/위젯 실재 확인)`
  );
  process.exit(0);
} else {
  console.error('[sm-audit] X  서버 모니터/트레이 설정 정합 위반:');
  for (const f of failures) console.error(`             - ${f}`);
  console.error(
    '\n[sm-audit] FAIL — 죽은/모호한 dev 프로필. Fix before push ' +
      '(npm-script 는 {app,script} 로, script 명은 해당 package.json 과 일치).'
  );
  process.exit(1);
}
